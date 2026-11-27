import {setTimeout as delay} from 'node:timers/promises'
// Backend-owned lifecycle for an optional trusted Tunnel child adapter. Disabled by default.
const protocol = '2026-07-28'
const startupRetryDelays=Object.freeze([50,150,450])
const recoverable=new Set([502,503,504])
const exactTools = ['list_active_sessions', 'read_synthetic_pilot']
const safeEndpoint = value => {
  if (typeof value !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/mcp$/.test(value)) return null
  try {
    const endpoint = new URL(value)
    return endpoint.href === value ? endpoint : null
  } catch { return null }
}

async function readLimited(response) {
  const stream = response.body?.getReader()
  if (!stream) throw Error('mcp_not_ready')
  let size = 0
  const parts = []
  try {
    for (;;) {
      const {done, value} = await stream.read()
      if (done) return JSON.parse(Buffer.concat(parts).toString('utf8'))
      size += value.byteLength
      if (size > 16384) throw Error('mcp_not_ready')
      parts.push(Buffer.from(value))
    }
  } finally {
    try { await stream.cancel() } catch {}
    stream.releaseLock()
  }
}

export async function verifyDotMcpReady({endpoint, authorization, signal, request = fetch, reportTransient=false}) {
  const url = safeEndpoint(endpoint)
  if (!url || typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9_-]{43,128}$/.test(authorization))
    return false
  try {
    for (const [method, id] of [['server/discover',1], ['tools/list',2]]) {
      const result = await request(url, {method:'POST',redirect:'error',signal,
        headers:{authorization,'content-type':'application/json',accept:'application/json, text/event-stream',
          'mcp-protocol-version':protocol,'mcp-method':method},
        body:JSON.stringify({jsonrpc:'2.0',id,method,params:{}})})
      if (result.status !== 200 || !/^application\/json(?:;|$)/i.test(result.headers.get('content-type') ?? '')) {
        await result.body?.cancel()
        return reportTransient&&recoverable.has(result.status)?'temporary':false
      }
      const doc = await readLimited(result)
      if (doc?.jsonrpc !== '2.0' || doc.id !== id || Object.hasOwn(doc,'error') ||
          doc.result?.resultType !== 'complete') return false
      if (id === 1) {
        if (!Array.isArray(doc.result.supportedVersions) || !doc.result.supportedVersions.includes(protocol) ||
            !doc.result.capabilities?.tools || Array.isArray(doc.result.capabilities.tools) ||
            typeof doc.result.capabilities.tools !== 'object') return false
      } else {
        const list = doc.result.tools
        if (!Array.isArray(list) || list.length !== 2 || list.some(t=>t?.annotations?.readOnlyHint !== true) ||
            list.map(t=>t.name).sort().join(',') !== exactTools.join(',')) return false
      }
    }
    return !signal?.aborted
  } catch(error) {
    return reportTransient&&!signal?.aborted&&
      ['ECONNREFUSED','ECONNRESET','UND_ERR_SOCKET'].includes(error?.cause?.code)?'temporary':false
  }
}

function bounded(fn, signal) {
  if (signal.aborted) return Promise.reject(Error('mcp_probe_aborted'))
  let abort
  const aborted = new Promise((_, reject) => {
    abort = () => reject(Error('mcp_probe_aborted'))
    signal.addEventListener('abort', abort, {once:true})
  })
  return Promise.race([Promise.resolve().then(() => fn(signal)), aborted])
    .finally(() => signal.removeEventListener('abort', abort))
}

/**
 * After one verified local MCP handshake, synchronously create exactly one
 * owned child handle. The official client's own reconnect policy belongs to
 * the adapter, not this host. No executable, credentials, or config are loaded here.
 * A trusted launchOwned returns {closed:Promise, stop:async()=>{}} and owns
 * one specific process via its retained handle (never a PID scan).
 */
export function createDshDotTunnelLifecycle({enabled=false, resolveMcp, launchOwned,
  verify=verifyDotMcpReady, probeDeadlineMs=3000, publish=()=>{}}={}) {
  if (enabled !== true) return null
  if ([resolveMcp,launchOwned,verify,publish].some(fn=>typeof fn!=='function') ||
      !Number.isSafeInteger(probeDeadlineMs) || probeDeadlineMs<1 || probeDeadlineMs>5000)
    throw new TypeError('invalid_dot_tunnel_adapter')
  const lifecycle = new AbortController()
  let attempted, owned, stopping
  const update = value => { try { publish(value) } catch {} }
  const start = () => {
    if (lifecycle.signal.aborted) return Promise.resolve()
    attempted ??= (async()=>{
      try {
        const signal = AbortSignal.any([lifecycle.signal,AbortSignal.timeout(probeDeadlineMs)])
        const resolved = await bounded(resolveMcp,signal)
        if (!safeEndpoint(resolved?.endpoint)) {
          if (!lifecycle.signal.aborted) update('mcp_unavailable')
          return
        }
        let proof
        for(let index=0;index<=startupRetryDelays.length;index++){
          proof=await bounded(inner=>verify({...resolved,signal:inner,reportTransient:true}),signal)
          if(proof!=='temporary'||index===startupRetryDelays.length)break
          update('mcp_startup_retry')
          await delay(startupRetryDelays[index],null,{signal})
        }
        if (proof!==true||signal.aborted) {
          if (!lifecycle.signal.aborted) update('mcp_unavailable')
          return
        }
        // No await between the final ownership check and allocating the one child.
        const child = launchOwned({endpoint:resolved.endpoint})
        if (!child || typeof child.stop!=='function' || !child.closed || typeof child.closed.then!=='function')
          throw Error('invalid_dot_tunnel_child')
        owned = child
        update('child_started')
        const settled = () => { if (owned === child) owned = undefined; if (!lifecycle.signal.aborted) update('child_exited') }
        Promise.resolve(child.closed).then(settled,settled)
      } catch {
        if (!lifecycle.signal.aborted) update('unavailable')
      }
    })()
    return attempted
  }
  const stop = () => stopping ??= (async()=>{
    lifecycle.abort()
    await attempted
    const child=owned
    owned=undefined
    if (child) await child.stop()
    update('stopped')
  })()
  return Object.freeze({start,stop})
}

import { createHash, timingSafeEqual } from 'node:crypto'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { createServer } from 'node:http'
import { once } from 'node:events'

const LOOPBACK = '127.0.0.1'
const PATH = '/mcp'
const CONFIG_LIMIT = 8192
const BODY_LIMIT = 8192
const ALLOWED_PROTOCOLS = new Set(['2025-03-26', '2025-06-18', '2025-11-25'])
const PENDING = new Set(['approval', 'question', 'other'])
const ID = /^[A-Za-z0-9_-]{1,128}$/
const TOKEN = /^[A-Za-z0-9_-]{43,128}$/
const tool = Object.freeze({
  name: 'session_status',
  description: 'Read the latest projected DSH status of configured sessions. Does not resume or modify them.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
})

export async function loadObservationConfig(path) {
  let fd
  try { fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
  try {
    const st = await fd.stat()
    if (!st.isFile() || st.uid !== process.getuid() || (st.mode & 0o777) !== 0o600 ||
        st.size < 1 || st.size > CONFIG_LIMIT) throw new Error('observation_config_invalid')
    const bytes = Buffer.alloc(CONFIG_LIMIT + 1)
    const { bytesRead } = await fd.read(bytes, 0, bytes.length, 0)
    if (bytesRead !== st.size || bytesRead > CONFIG_LIMIT) throw new Error('observation_config_invalid')
    return validateConfig(JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')))
  } finally { await fd.close() }
}

function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      Object.keys(config).sort().join(',') !== 'bearer,port,sessions' ||
      typeof config.bearer !== 'string' || !TOKEN.test(config.bearer) ||
      !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 ||
      !Array.isArray(config.sessions) || config.sessions.length < 1 || config.sessions.length > 8) {
    throw new Error('observation_config_invalid')
  }
  const labels = new Set(), ids = new Set()
  for (const row of config.sessions) {
    if (!row || typeof row !== 'object' || Object.keys(row).sort().join(',') !== 'id,label' ||
        typeof row.id !== 'string' || !ID.test(row.id) || typeof row.label !== 'string' ||
        !/^[\p{L}\p{N} ._()\-]{1,64}$/u.test(row.label) || ids.has(row.id) || labels.has(row.label)) {
      throw new Error('observation_config_invalid')
    }
    ids.add(row.id); labels.add(row.label)
  }
  return config
}

const hash = value => createHash('sha256').update(value).digest()
const emptyArgs = args => args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).length === 0
const time = () => new Date().toISOString()

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}
function reply(response, id, result) { json(response, 200, {jsonrpc:'2.0', id, result}) }
function error(response, id, code, message) { json(response, 200, {jsonrpc:'2.0', id, error:{code,message}}) }
async function readRequest(request) {
  let size = 0; const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > BODY_LIMIT) throw new Error('request_too_large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export async function startSessionObservation({ config, sessionController, observeTurnEnds }) {
  config = validateConfig(config)
  if (typeof sessionController?.state !== 'function') throw new Error('observation_source_unavailable')
  const credential = hash('Bearer ' + config.bearer)
  const selections = config.sessions.map(({ id, label }) => ({ id, label }))
  const selected = new Set(selections.map(row => row.id))
  const completions = new Map()
  function onSessionEvent(session, event) {
    const id = session?.id
    if (closed || !selected.has(id) || event?.type !== "turn/end") return
    const turn = event.data?.turn, kind = event.data?.reason?.kind
    if (!Number.isSafeInteger(turn) || turn < 1 || !Number.isSafeInteger(event.time) ||
        event.time < 1 || event.time > 8640000000000000 || typeof kind !== "string" ||
        (completions.get(id)?.turn ?? 0) >= turn) return
    const outcome = ["completed", "error", "aborted"].includes(kind) ? kind : "other"
    completions.set(id, {turn, outcome, ended_at:new Date(event.time).toISOString()})
  }
  let inFlight = false, closed = false
  const lifecycle = new AbortController()
  const server = createServer({ requestTimeout: 5000, headersTimeout: 4000, keepAliveTimeout: 1000, maxHeaderSize: 8192 }, (q,r) => {
    void handle(q,r).catch(() => {
      if (!r.headersSent) json(r, 503, {error:'observation_unavailable'})
      else r.end()
    })
  })
  server.maxConnections = 16
  async function handle(q,r) {
    if (q.socket.remoteAddress !== LOOPBACK || q.headers.host !== LOOPBACK + ':' + config.port ||
        q.headers.origin !== undefined || q.url !== PATH) return json(r,404,{error:'not_found'})
    const supplied = q.headers.authorization
    if (typeof supplied !== 'string' || !timingSafeEqual(hash(supplied),credential))
      return json(r,401,{error:'authentication_required'})
    if (q.method !== 'POST') { r.writeHead(405, {Allow:'POST'}); r.end(); return }
    if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(q.headers['content-type'] ?? ''))
      return json(r,415,{error:'unsupported_content_type'})
    const accept = q.headers.accept ?? ''
    if (!accept.split(',').some(x => x.trim().split(';')[0] === 'application/json') ||
        !accept.split(',').some(x => x.trim().split(';')[0] === 'text/event-stream'))
      return json(r,406,{error:'unsupported_accept'})
    const version = q.headers['mcp-protocol-version']
    if (version !== undefined && !ALLOWED_PROTOCOLS.has(version))
      return json(r,400,{error:'unsupported_protocol'})
    let msg
    try { msg = await readRequest(q) } catch { return json(r,400,{error:'invalid_request'}) }
    const id = msg?.id
    const validId = typeof id === 'string' && id.length <= 128 || Number.isSafeInteger(id)
    if (!msg || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string')
      return error(r,null,-32600,'Invalid Request')
    if (id === undefined && msg.method === 'notifications/initialized') { r.writeHead(202); r.end(); return }
    if (!validId) return error(r,null,-32600,'Invalid Request')
    if (msg.method === 'initialize') {
      if (typeof msg.params?.protocolVersion !== 'string') return error(r,id,-32602,'Invalid params')
      return reply(r,id,{protocolVersion:ALLOWED_PROTOCOLS.has(msg.params.protocolVersion)?msg.params.protocolVersion:'2025-06-18',
        capabilities:{tools:{}},serverInfo:{name:'station-session-observation',version:'1.0.0'}})
    }
    if (msg.method === 'ping') return reply(r,id,{})
    if (msg.method === 'tools/list') return reply(r,id,{tools:[tool]})
    if (msg.method !== 'tools/call') return error(r,id,-32601,'Method not found')
    if (msg.params?.name !== tool.name || !emptyArgs(msg.params.arguments ?? {})) return error(r,id,-32602,'Invalid params')
    if (closed || inFlight) return error(r,id,-32000,'Session observation unavailable')
    inFlight = true
    try {
      const sessions = []
      for (const {id:sessionId,label} of selections) {
        const signal = AbortSignal.any([lifecycle.signal,AbortSignal.timeout(350)])
        const value = await readState(sessionController,sessionId,signal)
        if (!value || typeof value.active !== 'boolean' || typeof value.running !== 'boolean' ||
            !Number.isSafeInteger(value.cursor) || value.cursor < -1 ||
            !Array.isArray(value.pendingInput) || value.pendingInput.some(x=>!PENDING.has(x)))
          sessions.push({label,status:'unavailable'})
        else sessions.push({label,status:value.running?'running':value.active?'idle':'inactive',
          cursor:value.cursor,pending:[...new Set(value.pendingInput)],last_completion:completions.get(sessionId)??null})
      }
      const result = {schema_version:1,observed_at:time(),sessions}
      return reply(r,id,{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result})
    } finally { inFlight = false }
  }
  server.listen(config.port, LOOPBACK)
  try { await once(server,'listening') } catch(error) { server.close(); throw error }
  let dispose
  try { dispose = observeTurnEnds?.(onSessionEvent) }
  catch (e) { await new Promise(resolve=>server.close(resolve)); throw e }
  return { async close() {
    if (closed) return
    closed = true; lifecycle.abort(); completions.clear()
    try { dispose?.() } catch { /* Listener lives only with the Host. */ }
    await new Promise(resolve=>{server.close(resolve); server.closeAllConnections()})
  } }
}

function readState(controller,sessionId,signal) {
  return new Promise(resolve => {
    const finish=value=>{signal.removeEventListener('abort',aborted);resolve(value)}
    const aborted=()=>finish(null)
    if (signal.aborted) return aborted()
    signal.addEventListener('abort',aborted,{once:true})
    Promise.resolve().then(()=>controller.state({sessionId},signal)).then(finish,aborted)
  })
}

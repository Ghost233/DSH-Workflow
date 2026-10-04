import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchDesktopWeb, readDesktopHost } from './desktop-launch.mjs'

export const WEB_PORT = 33080

/** Own one password-authenticated Web port; Electron owns the backend. */
export async function startGlobalSupervisor({ dataRoot, host = '0.0.0.0', port = WEB_PORT,
  password, allowLanSettings = false, attachDesktop = launchDesktopWeb, onDesktopNeeded = () => {}, signal }) {
  if (typeof password !== 'string' || !password || !Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error('Invalid Web service configuration')
  }
  const globalRoot = join(resolve(dataRoot), 'global')
  await mkdir(globalRoot, { recursive: true, mode: 0o700 })
  let active, gateway, lastError = '', backendPort = null, boundPort = port
  let currentPassword = password, closing = false
  const listeners = new Set()
  const state = () => ({ state: active?.ready ? 'running' : active ? 'starting' : 'stopped',
    error: lastError, webPort: backendPort, gatePort: boundPort, url: `http://127.0.0.1:${boundPort}/` })
  const emit = () => { for (const notify of listeners) notify(state()) }
  const start = async () => {
    if (closing) throw new Error('Web service is closed')
    if (active) return await active.readyPromise
    signal?.throwIfAborted()
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    const ready = Promise.withResolvers()
    const connection = { controller, ready: false, readyPromise: ready.promise }
    active = connection
    ready.promise.catch(() => {})
    emit()
    connection.task = (async () => {
      try { await readDesktopHost(join(globalRoot, '.dsh-workflow/desktop')) }
      catch (error) {
        if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
        onDesktopNeeded()
      }
      controller.signal.throwIfAborted()
      await attachDesktop({ globalRoot, gatewayHost: host, gatewayPort: port,
        password: currentPassword, allowLanSettings, signal: controller.signal,
        onGateway: gate => { gateway = gate; boundPort = gate.port },
        onReady: desktop => {
          backendPort = desktop.port
          connection.ready = true
          lastError = ''
          ready.resolve(state().url)
          emit()
        } })
    })().catch(error => {
      if (!controller.signal.aborted) lastError = error.message
      ready.reject(error)
    }).finally(() => {
      if (!connection.ready) ready.reject(new Error(lastError || 'Web connection stopped'))
      signal?.removeEventListener('abort', abort)
      if (active === connection) active = undefined
      emit()
    })
    return await ready.promise
  }
  const stop = async () => {
    const connection = active
    if (!connection) return
    connection.controller.abort()
    await connection.task
  }
  try { await start() }
  catch (error) { await stop(); throw error }
  return {
    get port() { return boundPort },
    get url() { return `http://127.0.0.1:${boundPort}/` },
    get localUrl() { return this.url },
    get lanUrls() { return gateway?.lanUrls ?? [] },
    global: state,
    onState(notify) { listeners.add(notify); return () => listeners.delete(notify) },
    openGlobal: start,
    stopGlobal: stop,
    setPassword(next) {
      if (typeof next !== 'string' || !next) throw new Error('Password must not be empty')
      currentPassword = next
      gateway?.setPassword(next)
    },
    async close() { closing = true; await stop() },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dataRoot] = process.argv.slice(2)
  let supervisor, addressWatch
  const controller = new AbortController()
  process.once('SIGINT', () => controller.abort())
  process.once('SIGTERM', () => controller.abort())
  const parent = process.ppid
  const parentWatch = setInterval(() => { if (process.ppid !== parent) controller.abort() }, 1000)
  parentWatch.unref()
  const write = (label, payload) => process.stdout.write(`${label}\t${JSON.stringify(payload)}\n`)
  try {
    if (!dataRoot) throw new Error('Usage: global-supervisor.mjs DATA_ROOT')
    supervisor = await startGlobalSupervisor({ dataRoot, password: process.env.DSH_LAUNCH_PASSWORD,
      allowLanSettings: process.env.DSH_ALLOW_LAN_SETTINGS === '1', signal: controller.signal,
      onDesktopNeeded: () => write('DSH_WORKFLOW_DESKTOP_NEEDED', {}) })
    const readyEvent = () => ({ port: supervisor.port, url: supervisor.url, localUrl: supervisor.localUrl, lanUrls: supervisor.lanUrls })
    write('DSH_WORKFLOW_READY', readyEvent())
    write('DSH_WORKFLOW_STATE', { global: supervisor.global() })
    supervisor.onState(global => write('DSH_WORKFLOW_STATE', { global }))
    let addresses = JSON.stringify(supervisor.lanUrls)
    addressWatch = setInterval(() => {
      const current = JSON.stringify(supervisor.lanUrls)
      if (current !== addresses) { addresses = current; write('DSH_WORKFLOW_READY', readyEvent()) }
    }, 3000)
    addressWatch.unref()
    const command = async input => {
      if (input?.type === 'set-password') { supervisor.setPassword(input.password); return }
      if (!Number.isInteger(input?.requestId)) return
      try {
        if (input.type === 'open-global') await supervisor.openGlobal()
        else if (input.type === 'disconnect-global') await supervisor.stopGlobal()
        else if (input.type !== 'status') throw new Error('Unknown control command')
        write('DSH_WORKFLOW_REPLY', { requestId: input.requestId, ok: true, global: supervisor.global() })
      } catch (error) { write('DSH_WORKFLOW_REPLY', { requestId: input.requestId, ok: false, error: error.message }) }
    }
    let buffer = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => {
      buffer += chunk
      if (buffer.length > 64 * 1024) { buffer = ''; return }
      let newline
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
        try { void command(JSON.parse(line)) } catch { /* Ignore malformed control messages. */ }
      }
    })
    process.stdin.on('end', () => controller.abort())
    if (!controller.signal.aborted) await new Promise(resolve => controller.signal.addEventListener('abort', resolve, { once: true }))
    process.stdin.removeAllListeners('data')
    process.stdin.pause()
  } catch (error) {
    if (!controller.signal.aborted) { process.stderr.write(error.message.replace(/token=[^&\s]+/g, 'token=<REDACTED>') + '\n'); process.exitCode = 1 }
  } finally { clearInterval(parentWatch); clearInterval(addressWatch); await supervisor?.close() }
}

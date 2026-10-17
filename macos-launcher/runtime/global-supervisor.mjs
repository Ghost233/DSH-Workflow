import { appendFile, chmod, readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { startLanGateway } from './lan-gateway.mjs'
import { privateDirectory, SERVICE_PROTOCOL, serviceRequest, serviceSocket, redact } from './service-control.mjs'
import { webDirectory, webSocket } from './web-control.mjs'

export const WEB_PORT = 33080

/** Own one password-authenticated Web port without owning the connected DSH service. */
export async function startGlobalSupervisor({ dataRoot, host = '0.0.0.0', port = WEB_PORT,
  password, allowLanSettings = false, onLog = () => {}, signal }) {
  if (typeof password !== 'string' || !password || !Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error('Invalid Web service configuration')
  }
  const runtime = JSON.parse(await readFile(new URL('../../dsh-runtime.json', import.meta.url), 'utf8'))
  let gateway, connection, starting, timer, lastError = '', instanceId = null, closing = false, checking, upstreamReady = false
  const listeners = new Set()
  const state = () => ({ state: gateway ? 'running' : starting ? 'starting' : 'stopped',
    instanceId, ready: Boolean(gateway && upstreamReady), observedAt: new Date().toISOString(), error: lastError,
    serviceInstanceId: connection?.instanceId ?? null, webPort: connection?.port ?? null,
    gatePort: gateway?.port ?? port, url: gateway?.localUrl ?? null })
  const emit = () => { for (const notify of listeners) notify(state()) }
  const discover = async () => {
    const value = await serviceRequest(serviceSocket(dataRoot), { type: 'connect-web', runtimeVersion: runtime.version }, 5000)
    const current = value.connection
    const url = new URL(current?.url)
    if (typeof current?.instanceId !== 'string' || !current.instanceId || !Number.isSafeInteger(current.pid)
      || current.runtimeVersion !== runtime.version || url.protocol !== 'http:' || url.hostname !== '127.0.0.1'
      || !url.port || url.pathname !== '/' || !url.searchParams.get('token') || url.username || url.password) {
      throw new Error('DSH 服务接入信息不兼容，请使用配套应用。')
    }
    return { instanceId: current.instanceId, pid: current.pid, runtimeVersion: current.runtimeVersion,
      url: current.url, port: Number(url.port), ready: value.service?.ready === true,
      message: value.service?.message }
  }
  const unavailable = error => {
    upstreamReady = false
    const message = `DSH 服务不可用：${redact(error.message)}。请检查服务状态后重连 Web。`
    if (lastError !== message) { lastError = message; onLog({ instanceId, entry: { text: message } }); emit() }
    return false
  }
  const available = async () => {
    if (checking) return checking
    checking = (async () => {
      try {
        const current = await discover()
        if (!connection || current.instanceId !== connection.instanceId || current.pid !== connection.pid) {
          throw new Error('DSH 服务实例已更换')
        }
        if (!current.ready) throw new Error(current.message || 'DSH 服务尚未就绪')
        upstreamReady = true
        if (lastError) { lastError = ''; emit() }
        return true
      } catch (error) { return unavailable(error) }
    })()
    try { return await checking } finally { checking = undefined }
  }
  const start = async () => {
    if (closing) throw new Error('Web service is closed')
    if (gateway) return gateway.localUrl
    if (starting) return starting
    signal?.throwIfAborted()
    starting = (async () => {
      try {
        connection = await discover()
        if (connection.ready) { upstreamReady = true; lastError = '' }
        else unavailable(new Error(connection.message || 'DSH 服务尚未就绪'))
      }
      catch (error) { connection = undefined; unavailable(error) }
      const created = await startLanGateway({ host, port, password, allowLanSettings,
        upstreamPort: connection?.port ?? null, authenticatedUrl: () => connection?.url, available })
      if (closing || signal?.aborted) { await created.close(); throw new Error('Web startup cancelled') }
      gateway = created
      instanceId = randomUUID()
      timer = setInterval(() => { void available() }, 1000)
      timer.unref()
      emit()
      return gateway.localUrl
    })()
    try { return await starting } finally { starting = undefined }
  }
  const stop = async () => {
    await starting?.catch(() => {})
    clearInterval(timer)
    const owned = gateway
    gateway = undefined
    instanceId = null
    await owned?.close()
    emit()
  }
  const abort = () => { void stop() }
  signal?.addEventListener('abort', abort, { once: true })
  try { await start() }
  catch (error) { signal?.removeEventListener('abort', abort); await stop(); throw error }
  return {
    get port() { return gateway?.port ?? port },
    get url() { return gateway?.localUrl ?? null },
    get localUrl() { return this.url },
    get lanUrls() { return gateway?.lanUrls ?? [] },
    global: state,
    onState(notify) { listeners.add(notify); return () => listeners.delete(notify) },
    openGlobal: start,
    stopGlobal: stop,
    setPassword(next) {
      if (typeof next !== 'string' || !next) throw new Error('Password must not be empty')
      password = next
      gateway?.setPassword(next)
    },
    async close() { closing = true; signal?.removeEventListener('abort', abort); await stop() },
  }
}

/** The detached Web process owns its gateway; launchers only open short-lived local connections. */
export async function serveGlobalSupervisor({ dataRoot }) {
  const directory = webDirectory(dataRoot), socketPath = webSocket(dataRoot)
  await privateDirectory(directory)
  await privateDirectory(dirname(socketPath))
  const server = createServer()
  let supervisor, password, closing = false, mutation = Promise.resolve(), logWrites = Promise.resolve()
  const logs = []
  const log = text => {
    const entry = { text: redact(text).slice(-4096), observedAt: new Date().toISOString() }
    logs.push(entry)
    if (logs.length > 500) logs.shift()
    logWrites = logWrites.then(() => appendFile(join(directory, 'web.log'), JSON.stringify(entry) + '\n', { mode: 0o600 }))
    void logWrites.catch(() => {})
  }
  const snapshot = () => ({ protocol: SERVICE_PROTOCOL,
    web: supervisor ? { ...supervisor.global(), lanUrls: supervisor.lanUrls }
      : { state: 'stopped', ready: false, observedAt: new Date().toISOString() }, logs: [...logs] })
  const command = async input => {
    if (input.protocol !== SERVICE_PROTOCOL) throw new Error('Web 服务协议不兼容，请使用配套应用。')
    if (closing) throw new Error('Web 访问管理进程正在退出')
    if (input.type === 'start-web') {
      if (typeof input.password !== 'string' || !input.password) throw new Error('请先设置内网访问密码')
      if (!supervisor) {
        logs.length = 0
        supervisor = await startGlobalSupervisor({ dataRoot, password: input.password,
          port: input.port ?? WEB_PORT, allowLanSettings: input.allowLanSettings === true,
          onLog: record => log(record.entry.text) })
        password = input.password
        log(`Web 访问已启动，实例 ${supervisor.global().instanceId}，端口 ${supervisor.port}。`)
      } else {
        if (password !== input.password) { supervisor.setPassword(input.password); password = input.password }
        await supervisor.openGlobal()
      }
    } else if (input.type === 'recycle-web') {
      await supervisor?.close()
      supervisor = undefined
      log('Web 访问资源已回收，DSH 服务继续独立运行。')
    } else if (input.type === 'set-password') {
      supervisor?.setPassword(input.password)
      password = input.password
    } else if (!['status', 'logs'].includes(input.type)) throw new Error('Unsupported Web service command')
    return snapshot()
  }
  server.on('connection', socket => {
    let buffer = '', handled = false
    socket.setTimeout(45_000, () => socket.destroy())
    socket.setEncoding('utf8')
    socket.on('error', () => {})
    socket.on('data', chunk => {
      buffer += chunk
      if (buffer.length > 16 * 1024) { socket.destroy(); return }
      if (handled || !buffer.includes('\n')) return
      handled = true
      const operation = mutation.then(async () => command(JSON.parse(buffer.slice(0, buffer.indexOf('\n')))))
      mutation = operation.catch(() => {})
      void operation.then(value => socket.end(JSON.stringify({ ok: true, value }) + '\n'),
        error => socket.end(JSON.stringify({ ok: false, error: redact(error.message) }) + '\n'))
    })
  })
  try {
    await new Promise((accept, reject) => {
      server.once('error', reject)
      const mask = process.umask(0o177)
      try { server.listen(socketPath, () => { server.removeListener('error', reject); accept() }) }
      finally { process.umask(mask) }
    })
  } catch (error) {
    if (error.code === 'EADDRINUSE') return null
    throw error
  }
  await chmod(socketPath, 0o600)
  const statePath = join(directory, 'manager.json')
  await writeFile(statePath, JSON.stringify({ pid: process.pid, protocol: SERVICE_PROTOCOL }) + '\n', { mode: 0o600, flag: 'wx' })
  return { async close() {
    closing = true
    await mutation
    await supervisor?.close()
    await new Promise(accept => server.close(accept))
    await logWrites
    await unlink(socketPath).catch(error => { if (error.code !== 'ENOENT') throw error })
    await unlink(statePath)
    await rmdir(dirname(socketPath))
  } }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dataRoot] = process.argv.slice(2)
  if (!dataRoot) throw new Error('Usage: global-supervisor.mjs DATA_ROOT')
  const supervisor = await serveGlobalSupervisor({ dataRoot })
  if (supervisor) {
    let exiting = false
    const close = () => { if (!exiting) { exiting = true; void supervisor.close().catch(error => { console.error(redact(error.stack)); process.exitCode = 1 }) } }
    process.once('SIGINT', close)
    process.once('SIGTERM', close)
  }
}

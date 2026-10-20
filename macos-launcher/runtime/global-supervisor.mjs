import { appendFile, readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { startLanGateway } from './lan-gateway.mjs'
import { SERVICE_PROTOCOL, redact } from './service-control.mjs'
import { listenManagerControl } from './manager-control.mjs'
import { attachManagerWebSocket } from './manager-websocket.mjs'
import { webDirectory, webSocket } from './web-control.mjs'
import { statusNotifications } from './status-notifications.mjs'
import { watchLauncherStatus } from './launcher-events.mjs'

export const WEB_PORT = 33080

/** Own one password-authenticated Web port without owning the connected DSH service. */
export async function startGlobalSupervisor({ dataRoot, host = '0.0.0.0', port = WEB_PORT,
  password, allowLanSettings = false, onLog = () => {}, signal }) {
  if (typeof password !== 'string' || !password || !Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error('Invalid Web service configuration')
  }
  const runtime = JSON.parse(await readFile(new URL('../../dsh-runtime.json', import.meta.url), 'utf8'))
  let gateway, connection, starting, observer, lastError = '', instanceId = null, closing = false, upstreamReady = false
  let latestEvent, acquiring, pendingAcquire = false
  const listeners = new Set()
  const state = () => ({ state: gateway ? 'running' : starting ? 'starting' : 'stopped',
    instanceId, ready: Boolean(gateway && upstreamReady), observedAt: new Date().toISOString(), error: lastError,
    serviceInstanceId: connection?.instanceId ?? null, webPort: connection?.port ?? null,
    gatePort: gateway?.port ?? port, url: gateway?.localUrl ?? null })
  const emit = () => { for (const notify of listeners) notify(state()) }
  const discover = async () => {
    const { value, generation } = await observer.requestService({ type: 'connect-web', runtimeVersion: runtime.version })
    const current = value.connection
    const url = new URL(current?.url)
    if (typeof current?.instanceId !== 'string' || !current.instanceId || !Number.isSafeInteger(current.pid)
      || current.runtimeVersion !== runtime.version || url.protocol !== 'http:' || url.hostname !== '127.0.0.1'
      || !url.port || url.pathname !== '/' || !url.searchParams.get('token') || url.username || url.password
      || !Number.isSafeInteger(value.revision) || value.revision < 1) {
      throw new Error('DSH 服务接入信息不兼容，请使用配套应用。')
    }
    return { instanceId: current.instanceId, pid: current.pid, runtimeVersion: current.runtimeVersion,
      url: current.url, port: Number(url.port), ready: value.service?.ready === true,
      message: value.service?.message, generation, revision: value.revision }
  }
  const unavailable = error => {
    upstreamReady = false
    const message = `DSH 服务不可用：${redact(error.message)}。请检查服务状态后重连 Web。`
    if (lastError !== message) { lastError = message; onLog({ instanceId, entry: { text: message } }); emit() }
    return false
  }
  const apply = event => {
    if (event.error || event.missing) { unavailable(new Error(event.error || 'DSH 服务管理进程尚未运行')); return }
    if (!connection) return
    const current = event.value?.service
    if (event.generation !== connection.generation || current?.instanceId !== connection.instanceId || current.pid !== connection.pid
      || current.runtimeVersion !== connection.runtimeVersion) { unavailable(new Error('DSH 服务实例已更换')); return }
    if (!Number.isSafeInteger(event.value.revision) || event.value.revision < 1) { unavailable(new Error('DSH 状态版本不可判断')); return }
    if (event.value.revision < connection.revision) return
    connection.revision = event.value.revision
    if (current.ready !== true) { unavailable(new Error(current.message || 'DSH 服务尚未就绪')); return }
    if (!upstreamReady || lastError) { upstreamReady = true; lastError = ''; emit() }
  }
  const acquire = () => {
    if (acquiring) return acquiring
    pendingAcquire = false
    const owner = observer
    acquiring = (async () => {
      try {
        const current = await discover()
        if (observer !== owner || closing) return
        const sameHost = connection && current.instanceId === connection.instanceId && current.pid === connection.pid
          && current.runtimeVersion === connection.runtimeVersion && current.url === connection.url
        if (!sameHost) gateway?.setUpstreamPort(current.port)
        connection = current
        const newer = latestEvent && (latestEvent.error || latestEvent.missing || latestEvent.generation !== current.generation
          || latestEvent.value?.revision > current.revision)
        apply(newer ? latestEvent : { generation: current.generation,
          value: { revision: current.revision, service: current } })
      } catch (error) { if (observer === owner && !closing) unavailable(error) }
    })().finally(() => {
      const again = pendingAcquire
      pendingAcquire = false; acquiring = undefined
      if (again && observer === owner && !closing && !connection && latestEvent?.value?.service?.ready === true) return acquire()
    })
    return acquiring
  }
  const observe = event => {
    const previous = latestEvent
    latestEvent = event
    apply(event)
    const becameReady = event.value?.service?.ready === true && (previous?.value?.service?.ready !== true
      || event.generation !== previous.generation || event.value.service.instanceId !== previous.value.service.instanceId)
    if (!connection && observer && becameReady) { pendingAcquire = true; void acquire() }
  }
  const start = async () => {
    if (closing) throw new Error('Web service is closed')
    if (starting) return starting
    if (gateway) { await observer.refresh(); await acquire(); return gateway.localUrl }
    signal?.throwIfAborted()
    starting = (async () => {
      observer = await watchLauncherStatus(dataRoot, observe, { serviceOnly: true })
      await acquire()
      const created = await startLanGateway({ host, port, password, allowLanSettings,
        upstreamPort: connection?.port ?? null, authenticatedUrl: () => connection?.url, available: () => upstreamReady })
      if (closing || signal?.aborted) { await created.close(); throw new Error('Web startup cancelled') }
      gateway = created
      instanceId = randomUUID()
      emit()
      return gateway.localUrl
    })()
    try { return await starting }
    catch (error) { observer?.close(); observer = undefined; throw error }
    finally { starting = undefined }
  }
  const stop = async () => {
    await starting?.catch(() => {})
    observer?.close(); observer = undefined
    await acquiring
    const owned = gateway
    gateway = undefined
    connection = undefined; latestEvent = undefined; upstreamReady = false
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

/** The detached Web process owns its gateway; launcher subscriptions only observe it. */
export async function serveGlobalSupervisor({ dataRoot }) {
  const directory = webDirectory(dataRoot), socketPath = webSocket(dataRoot)
  const server = createServer()
  let supervisor, password, closing = false, mutation = Promise.resolve(), logWrites = Promise.resolve()
  let releaseState
  const logs = []
  const log = text => {
    const entry = { text: redact(text).slice(-4096), observedAt: new Date().toISOString() }
    logs.push(entry)
    if (logs.length > 500) logs.shift()
    logWrites = logWrites.then(() => appendFile(join(directory, 'web.log'), JSON.stringify(entry) + '\n', { mode: 0o600 }))
    void logWrites.catch(() => {})
    updates.publish()
  }
  const snapshot = () => ({ protocol: SERVICE_PROTOCOL,
    web: supervisor ? { ...supervisor.global(), lanUrls: supervisor.lanUrls }
      : { state: 'stopped', ready: false, observedAt: new Date().toISOString() }, logs: [...logs] })
  const updates = statusNotifications(snapshot)
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
        releaseState = supervisor.onState(updates.publish)
        password = input.password
        log(`Web 访问已启动，实例 ${supervisor.global().instanceId}，端口 ${supervisor.port}。`)
      } else {
        if (password !== input.password) { supervisor.setPassword(input.password); password = input.password }
        await supervisor.openGlobal()
      }
    } else if (input.type === 'recycle-web') {
      releaseState?.(); releaseState = undefined
      await supervisor?.close()
      supervisor = undefined
      log('Web 访问资源已回收，DSH 服务继续独立运行。')
    } else if (input.type === 'set-password') {
      supervisor?.setPassword(input.password)
      password = input.password
    } else if (!['status', 'logs'].includes(input.type)) throw new Error('Unsupported Web service command')
    updates.publish()
    return snapshot()
  }
  const closeChannels = attachManagerWebSocket(server, input => {
    const operation = mutation.then(() => command(input))
    mutation = operation.catch(() => {})
    return operation
  }, updates)
  const control = await listenManagerControl(server, { directory, socketPath })
  if (!control) { updates.close(); closeChannels(); return null }
  if (control.backups.length) log(`已恢复失效的 Web 管理记录，原文件备份：${control.backups.join('，')}`)
  return { async close() {
    closing = true
    updates.close()
    closeChannels()
    releaseState?.()
    await mutation
    await supervisor?.close()
    await control.close()
    await logWrites
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

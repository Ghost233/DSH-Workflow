import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serviceRequest, serviceSocket } from './service-control.mjs'

const unavailable = 'DSH 服务未启动或暂不可用，请先启动 DSH 服务。'

/** Preserve the upstream private IPC session restrictions at the local socket boundary. */
function privateSession(value) {
  if (value === null) return value
  let valid = typeof value === 'object' && value !== null && typeof value.token === 'string' && value.token.length > 0
    && (value.userId === null || typeof value.userId === 'string' && value.userId.length > 0)
    && (value.embeddedPageDist === undefined || typeof value.embeddedPageDist === 'string')
  try {
    const url = new URL(value.origin)
    valid &&= url.origin === value.origin && !url.username && !url.password
      && (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  } catch { valid = false }
  if (value?.requestHeaders !== undefined) {
    const headers = value.requestHeaders
    valid &&= typeof headers === 'object' && headers !== null && !Array.isArray(headers)
      && Object.entries(headers).every(([name, field]) => name === name.toLowerCase() && typeof field === 'string'
        && !/[\r\n]/.test(field) && !['authorization', 'x-dsh-auth-token', 'host', 'content-length', 'transfer-encoding', 'connection', 'content-type'].includes(name))
  }
  if (!valid) throw new Error('DSH 私有桌面会话不兼容，请使用配套应用。')
  return value
}

/** Replaces only the Desktop-owned Host lifecycle with a connection to its manager. */
export class WorkflowDesktopConnection {
  constructor(_node, runtime, _profile, _inspect, environment, onFailure, _primary, _packages, onPlatformSession) {
    this.runtime = runtime
    this.environment = environment
    this.onFailure = onFailure
    this.onPlatformSession = onPlatformSession
    this.closed = false
  }

  async connect() {
    if (!this.environment.DSH_WORKFLOW_DATA_ROOT) throw new Error('请从 DSH 启动器打开桌面客户端。')
    const { version } = JSON.parse(await readFile(join(this.runtime, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8'))
    try {
      const value = await serviceRequest(serviceSocket(this.environment.DSH_WORKFLOW_DATA_ROOT),
        { type: 'connect-desktop', runtimeVersion: version }, 5000)
      value.platformSession = privateSession(value.platformSession)
      return value
    } catch (error) {
      if (['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw new Error(unavailable)
      throw error
    }
  }

  async start() {
    const value = await this.connect()
    if (this.closed) throw new Error('DSH 桌面连接已关闭。')
    this.instanceId = value.connection.instanceId
    this.pid = value.connection.pid
    this.runtimeVersion = value.connection.runtimeVersion
    this.onPlatformSession?.(value.platformSession)
    this.schedule()
    return { url: value.connection.url, injections: value.connection.injections }
  }

  schedule() {
    this.timer = setTimeout(async () => {
      try {
        const value = await this.connect()
        if (this.closed) return
        if (value.connection.instanceId !== this.instanceId || value.connection.pid !== this.pid
          || value.connection.runtimeVersion !== this.runtimeVersion) throw new Error('DSH 服务实例已改变，请重新打开桌面客户端。')
        this.onPlatformSession?.(value.platformSession)
        this.schedule()
      } catch (error) {
        if (this.closed) return
        if (error.message === unavailable) {
          try {
            const { service } = await serviceRequest(serviceSocket(this.environment.DSH_WORKFLOW_DATA_ROOT), { type: 'status' }, 5000)
            if (this.closed) return
            // A failed readiness probe does not prove that this established instance exited.
            // Keep its current private session; status never supplies a new connection or grant.
            if (service?.state === 'running' && service.instanceId === this.instanceId
              && service.pid === this.pid && service.runtimeVersion === this.runtimeVersion) {
              this.schedule()
              return
            }
          } catch { /* Preserve the original connection failure if identity cannot be observed. */ }
        }
        if (this.closed) return
        this.closed = true
        this.onPlatformSession?.(null)
        this.onFailure?.(error)
      }
    }, 1000)
    this.timer.unref()
  }

  /** Closing Electron disconnects only this client, never the manager or its Host. */
  async stop() {
    this.closed = true
    clearTimeout(this.timer)
    this.onPlatformSession?.(null)
    // AppKit must finish its first termination callback before Electron quits again.
    await new Promise(resolve => setImmediate(resolve))
  }

  async inspectQuit() { return { activeTasks: false, scheduledTasks: false } }
  async updateTasks() { throw new Error('请通过 DSH 启动器管理共享服务。') }
}

/** Desktop recovery cannot write or lock the profile owned by the independent service. */
export class WorkflowReadOnlyProfile {
  async applyRelease() {}
  async disableAllPlugins() { throw new Error('请通过 DSH 启动器管理共享服务配置。') }
}

/** Repository DMGs own updates; no upstream transfer or service-stop callback is retained. */
export class WorkflowDesktopUpdates {
  constructor(updater, publish) {
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    this.publish = publish
    this.current = { phase: 'idle' }
  }
  get state() { return this.current }
  async check(manual = false) { return manual ? this.disabled('check') : this.current }
  async download() { return this.disabled('download') }
  async install() { return this.disabled('install') }
  disabled(operation) {
    this.current = { phase: 'error', failedOperation: operation, message: '请在 DSH 启动器中检查本仓库的 DMG 更新。' }
    this.publish(this.current)
    return this.current
  }
  dispose() {}
}

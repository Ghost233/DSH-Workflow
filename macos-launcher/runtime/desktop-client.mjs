import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { serviceRequest, serviceSocket } from './service-control.mjs'
import { newerWorkflowRelease, workflowReleaseEndpoint } from './workflow-release.mjs'

const unavailable = 'DSH 服务未启动或暂不可用，请先启动 DSH 服务。'

/** A long-lived Host can recompose its graph after the manager cached its ready message. */
async function currentInjections({ url, injections }) {
  const end = injections.findIndex(row => row.kind === 'global' && row.name === '__DSH_BOOT__')
  if (end < 0) return injections
  const signal = AbortSignal.timeout(10_000)
  const login = await fetch(url, { redirect: 'manual', signal })
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  const response = await fetch(new URL('/', url), { headers: { cookie }, signal })
  if (!response.ok) throw new Error(`DSH 前端清单读取失败（${response.status}）。`)
  const match = (await response.text()).match(/<script>globalThis\["__DSH_BOOT__"\] = ([\s\S]*?)<\/script>/)
  if (!match) throw new Error('DSH 服务未提供当前前端模块清单。')
  const graph = JSON.parse(match[1])
  if (!Array.isArray(graph.batches)) throw new Error('DSH 前端模块清单不兼容。')
  const previous = new Set(injections[end].value.batches.map(batch => batch.url))
  const start = injections.findIndex(row => previous.has(row.src))
  if (start < 0 || start > end || injections.slice(start, end).some(row => !previous.has(row.src))) {
    throw new Error('DSH 前端启动信息不兼容。')
  }
  const batches = [
    ...graph.batches.filter(batch => batch.phase === 'application').map(batch => ({ kind: 'script-preload', src: batch.url })),
    ...graph.batches.filter(batch => batch.phase === 'bootstrap').map(batch => ({ kind: 'script-src', placement: 'head', src: batch.url })),
    { ...injections[end], value: graph },
  ]
  return [...injections.slice(0, start), ...batches, ...injections.slice(end + 1)]
}

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
    // macOS can restore this client without the launcher's per-process environment.
    this.dataRoot = environment.DSH_WORKFLOW_DATA_ROOT || join(environment.HOME || homedir(), 'Library/Application Support/DSH Workflow')
    this.onFailure = onFailure
    this.onPlatformSession = onPlatformSession
    this.closed = false
  }

  async connect() {
    const { version } = JSON.parse(await readFile(join(this.runtime, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8'))
    try {
      const value = await serviceRequest(serviceSocket(this.dataRoot),
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
    const injections = await currentInjections(value.connection)
    if (this.closed) throw new Error('DSH 桌面连接已关闭。')
    this.instanceId = value.connection.instanceId
    this.pid = value.connection.pid
    this.runtimeVersion = value.connection.runtimeVersion
    this.onPlatformSession?.(value.platformSession)
    this.schedule()
    return { url: value.connection.url, injections }
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
            const { service } = await serviceRequest(serviceSocket(this.dataRoot), { type: 'status' }, 5000)
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
  constructor(updater, publish, options = {}) {
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    this.publish = publish
    this.options = options && typeof options === 'object' ? options : {}
    this.current = { phase: 'idle' }
  }
  get state() { return this.current }
  async check(manual = false, presentation) {
    if (!manual) return this.current
    if (this.checking) return this.checking
    this.checking = (async () => {
      try {
        let workflowVersion = this.options.workflowVersion
        if (workflowVersion === undefined) {
          try {
            const receipt = JSON.parse(await readFile(new URL('../../workflow-desktop-adaptation.json', import.meta.url), 'utf8'))
            workflowVersion = receipt.workflowVersion
          } catch { throw new Error('无法读取 Ghost DSH Station 版本信息，请使用本仓库配套应用。') }
        }
        newerWorkflowRelease([], workflowVersion)
        const response = await (this.options.request ?? fetch)(workflowReleaseEndpoint, {
          method: 'GET', headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DSH-Workflow-macOS' },
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) throw new Error(`GitHub 发布接口 ${response.status}`)
        const release = newerWorkflowRelease(await response.json(), workflowVersion)
        // The official available phase starts its download UI. Repository releases only open a page.
        this.current = { phase: 'idle', workflowVersion, release }
      } catch (error) {
        this.current = { phase: 'error', failedOperation: 'check', message: `检查更新失败：${error.message}` }
      }
      this.publish(this.current)
      if (presentation) {
        const state = this.current, release = state.release
        try {
          const result = await presentation.showMessage({
            type: state.phase === 'error' ? 'error' : 'info', title: '检查 Ghost DSH Station 更新',
            message: state.phase === 'error' ? state.message : release ? `发现 Ghost DSH Station ${release.version}`
              : `当前 Ghost DSH Station ${state.workflowVersion}，暂无适用的新版本。`,
            detail: release ? `当前版本 ${state.workflowVersion}。只打开本仓库发布页，不自动下载或安装。` : '',
            buttons: release ? ['打开发布页', '稍后'] : ['确定'], defaultId: 0, cancelId: release ? 1 : 0,
          })
          if (release && result.response === 0) await presentation.openExternal(release.page)
        } catch (error) {
          this.current = { phase: 'error', failedOperation: 'check', message: `无法打开更新信息：${error.message}` }
          this.publish(this.current)
        }
      }
      return this.current
    })()
    try { return await this.checking } finally { this.checking = undefined }
  }
  async download() { return this.disabled('download') }
  async install() { return this.disabled('install') }
  disabled(operation) {
    this.current = { phase: 'error', failedOperation: operation, message: 'Ghost DSH Station 只通过本仓库正式 DMG 更新；请打开发布页。' }
    this.publish(this.current)
    return this.current
  }
  dispose() {}
}

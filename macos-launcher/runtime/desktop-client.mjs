import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { serviceRequest, serviceSocket } from './service-control.mjs'

/** Electron keeps its native UI while Station owns the only Host. */
export class StationDesktopConnection {
  constructor(_node, runtime, _profile, _inspect, _environment, onFailure, _primary, _resources, onPlatformSession) {
    this.runtime = runtime
    this.dataRoot = process.env.DSH_WORKFLOW_DATA_ROOT
    this.onFailure = onFailure
    this.onPlatformSession = onPlatformSession
  }

  async start() {
    if (!this.dataRoot || this.closed) throw new Error('请从 Ghost DSH Station 打开桌面版。')
    const manifest = JSON.parse(await readFile(join(this.runtime, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8'))
    this.runtimeVersion = manifest.version
    this.socket = serviceSocket(this.dataRoot)
    const { connection } = await this.request('connect-desktop', 10_000)
    const url = new URL(connection.url)
    if (this.closed || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port
      || url.href !== `${url.origin}/` || url.username || url.password || !Array.isArray(connection.injections)
      || typeof connection.authenticationCookie !== 'string' || !connection.authenticationCookie
      || /[\r\n]/.test(connection.authenticationCookie) || connection.runtimeVersion !== this.runtimeVersion
      || typeof connection.instanceId !== 'string' || !Number.isSafeInteger(connection.pid)) {
      throw new Error('DSH Station 桌面接入信息不兼容。')
    }
    this.instanceId = connection.instanceId
    this.pid = connection.pid
    this.onPlatformSession?.(connection.platformSession)
    this.watch()
    return { url: url.href, injections: connection.injections, authenticationCookie: connection.authenticationCookie }
  }

  request(type, timeout, fields = {}) {
    return serviceRequest(this.socket, { type, runtimeVersion: this.runtimeVersion, instanceId: this.instanceId, ...fields }, timeout)
  }

  watch() {
    this.timer = setTimeout(async () => {
      try {
        const { platformSession } = await this.request('desktop-session', 6000)
        if (!this.closed) this.onPlatformSession?.(platformSession)
      } catch (error) {
        if (this.closed) return
        const status = await this.request('status', 2500).catch(() => null)
        if (this.closed) return
        const current = status?.service
        if (current?.state !== 'running' || current.instanceId !== this.instanceId || current.pid !== this.pid) {
          await this.stop()
          this.onFailure?.(error)
          return
        }
      }
      if (!this.closed) this.watch()
    }, 2500)
    this.timer.unref()
  }

  async stop() {
    this.closed = true
    clearTimeout(this.timer)
    this.onPlatformSession?.(null)
    // Let AppKit finish its current termination callback before Electron calls quit again.
    await setImmediate()
  }

  async inspectQuit() { return { activeTasks: false, scheduledTasks: false } }
  async updateTasks() { throw new Error('请通过 Ghost DSH Station 管理共享服务。') }
  async resolveDragResource(address, signal) {
    signal?.throwIfAborted()
    if (this.closed) return null
    const { resource } = await this.request('desktop-drag', 12_000, { address })
    signal?.throwIfAborted()
    return resource
  }
}

// The shared profile is prepared and managed by Station.
export class StationReadOnlyProfile {
  async applyRelease() {}
  async disableAllPlugins() { throw new Error('请在 Station 管理共享服务和插件。') }
}

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { readDesktopHost } from './desktop-launch.mjs'
import { composeBackendDotTunnel } from './dsh-dot-tunnel-composition.mjs'
import { createDshDotTunnelLifecycle } from './dsh-dot-tunnel-lifecycle.mjs'
import { desktopConnection, desktopDrag, desktopPlatformSession } from './desktop-host-control.mjs'
import { redact } from './service-control.mjs'
import { startStationDotFromHost } from './station-dot-loopback.mjs'
import { loadObservationConfig, startSessionObservation } from './session-observation-mcp.mjs'
import { createStationPullTools } from './station-dot-pull-tools.mjs'
import { loadStationDotTunnelConfig, openStationDotPromptHost } from './station-dot-host-config.mjs'

/** Start the official Web profile using the packaged runtime and Station's existing profile. */
export async function startWebHost({ resources, profile, overlay }) {
  const anchor = join(resources, 'node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor)
  const boot = require('@deepseek-ai/dsh-app-boot')
  const { runProfile } = require('@deepseek-ai/dsh/profile-boot')
  const loaded = boot.loadProfileDirectory('dsh', profile, anchor)
  boot.reportSkippedBundles('dsh', loaded)
  return runProfile({
    environment: boot.loadLayeredEnv('dsh'), profile: 'web',
    resolvedProfile: { profile: loaded, installAnchor: anchor }, patchFiles: overlay ? [overlay] : [],
    args: ['--no-open', '--host', '127.0.0.1', '--port', '0'],
  })
}

/** Own the Web Host without a Desktop process. */
export async function serveWebHost({ resources, profile, receiptDirectory, overlay, dotTunnel, dotTunnelComposition,
  exit = () => {}, launchHost = startWebHost, readHost = readDesktopHost, ipc = process }) {
  if (dotTunnel?.enabled && dotTunnelComposition?.enabled) throw Error('multiple_dot_tunnel_owners')
  const application = launchHost({ resources, profile, overlay })
  let tunnel = composeBackendDotTunnel(dotTunnelComposition, application) ?? createDshDotTunnelLifecycle(dotTunnel)
  let closing, observation, observationConfig, stationDot, stationPrompt
  let observationStarting, stationDotStarting
  const send = message => new Promise((accept, reject) => {
    if (!ipc.connected || !ipc.send) return accept()
    ipc.send(message, error => error ? reject(error) : accept())
  })
  const stop = () => closing ??= (async () => {
    try { await tunnel?.stop() } catch { console.error('DSH Dot Tunnel 子进程停止未确认。') }
    const app = await application.catch(() => undefined)
    if (!app) return
    await Promise.all([stationDotStarting, observationStarting])
    await stationDot?.close()
    await observation?.close()
    stationPrompt?.close()
    await app.shutdown.shutdown(0)
    try { await send({ type: 'shutdown-complete' }) }
    finally {
      if (ipc.connected) ipc.disconnect()
      // The CLI owns this process; leftover referenced handles must not keep it alive after disposal.
      exit(0)
    }
  })()
  const onMessage = message => {
    if (message?.type === 'shutdown') void stop().catch(error => { console.error(error); process.exitCode = 1 })
    if (!['workflow-desktop-connect', 'workflow-desktop-session', 'workflow-desktop-drag'].includes(message?.type)) return
    const { type, requestId } = message
    void (async () => {
      try {
        if (closing) throw new Error('DSH 服务正在停止')
        const { ctx } = await application
        let value
        if (type === 'workflow-desktop-connect') value = await desktopConnection(ctx)
        else if (type === 'workflow-desktop-session') value = await desktopPlatformSession(ctx)
        else {
          const require = createRequire(join(resources, 'node_modules/@deepseek-ai/dsh/package.json'))
          const { parseFileAddress } = require('@deepseek-ai/dsh-util-workspace-path')
          value = await desktopDrag(ctx, parseFileAddress, message.address)
        }
        await send({ type, requestId, value })
      } catch (error) {
        const diagnostic = redact(error?.message ?? error)
        await send({ type, requestId, error: `DSH 桌面请求未完成：${diagnostic}` })
      }
    })().catch(() => {})
  }
  ipc.on('message', onMessage)
  ipc.once('disconnect', () => { void stop().catch(error => { console.error(error); process.exitCode = 1 }) })
  const { ctx } = await application
  ctx.on('connection/request', (_request, response, next) => {
    if (closing) { response.writeHead(503); response.end(); return }
    return next()
  })
  let receipt
  for (let attempt = 0; attempt < 100 && !receipt; attempt++) {
    try { receipt = await readHost(receiptDirectory) }
    catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
      await delay(50)
    }
  }
  if (!receipt || receipt.pid !== process.pid) throw new Error('Station Web Host receipt is missing or belongs to another process')
  if (!closing) {
    observationStarting = (async () => {
      const config = await loadObservationConfig(join(receiptDirectory, 'session-observation-mcp.json'))
      if (!config || closing) return
      stationPrompt = await openStationDotPromptHost({directory:join(receiptDirectory,'station-dot-approved-prompts'),
        sessions:config.sessions,bearer:config.bearer,controller:ctx.sessionController})
        .catch(()=>{ console.error('Station Dot 提示词投递未启用：批准目录或回执不可用。');return null })
      if (closing) return
      observation = await startSessionObservation({
        config, sessionController: ctx.sessionController,
        ...createStationPullTools(ctx, config),
        approvedPromptDelivery:stationPrompt?.deliver,
        // Local completion cache for pull-based session status; no outbound subscription.
        observeTurnEnds: listener => ctx.on("session/event", listener),
      })
      observationConfig = config
    })().catch(() => { console.error('会话观测 MCP 未启用：配置、端口或被动会话接口不可用。') })
    stationDotStarting = startStationDotFromHost({ctx, receiptDirectory}).then(value => {stationDot = value})
      .catch(() => { console.error('Station Dot 只读接口未启用：配置、端口或被动会话接口不可用。') })
    await Promise.all([observationStarting, stationDotStarting])
  }
  if (!closing && !tunnel && observationConfig) {
    try {
      const config=await loadStationDotTunnelConfig(join(receiptDirectory,'station-dot-tunnel.json'))
      if (config && !closing) tunnel=composeBackendDotTunnel({...config, openDirectPlugin:async()=>({
        capability:'station.observation.owner_scoped',
        endpoint:'http://127.0.0.1:'+observationConfig.port+'/mcp',
        authorization:'Bearer '+observationConfig.bearer,
        close:async()=>{}, // Web Host owns and closes the listener.
      })},application)
    } catch { console.error('Station Dot 隧道未启用：专用配置无效。') }
  }
  if (!closing) void tunnel?.start()
  await send({ type: 'ready', url: receipt.url, injections: [] })
  return { stop }
}

if (import.meta.main) {
  const [resources, profile, receiptDirectory, overlay] = process.argv.slice(2)
  if (!resources || !profile || !receiptDirectory) throw new Error('Missing Web Host paths')
  serveWebHost({ resources, profile, receiptDirectory, overlay, exit: process.exit }).catch(error => {
    const message = String(error?.message ?? error).replace(/token=[^&\s"<>]+/g, '[credential redacted]')
    if (process.connected) process.send?.({ type: 'fatal', message }, () => process.disconnect())
    console.error(message)
    process.exitCode = 1
  })
}

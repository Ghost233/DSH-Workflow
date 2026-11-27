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
import { startPairedStationApprovalEvents } from './station-dot-approval-events.mjs'
import { createStationPullTools } from './station-dot-pull-tools.mjs'
import { loadStationDotTunnelConfig, openStationDotPromptHost } from './station-dot-host-config.mjs'
import { dotSetupPreview, guidedPairing } from './station-dot-setup.mjs'
import { readStationDotPairing, saveStationDotPairing } from './station-dot-pairing.mjs'
import { createStationDotTunnelControl, readTunnelPreference, writeTunnelPreference } from './station-dot-tunnel-control.mjs'

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
  const tunnel = composeBackendDotTunnel(dotTunnelComposition, application) ?? createDshDotTunnelLifecycle(dotTunnel)
  let closing, observation, observationConfig, stationDot, stationPrompt
  let observationStarting, stationDotStarting
  const send = message => new Promise((accept, reject) => {
    if (!ipc.connected || !ipc.send) return accept()
    ipc.send(message, error => error ? reject(error) : accept())
  })
  const observationPath = join(receiptDirectory, 'session-observation-mcp.json')
  const loadObservation = async () => (await readStationDotPairing(receiptDirectory))?.observation
    ?? await loadObservationConfig(observationPath)
  const preferencePath = join(receiptDirectory, 'station-dot-tunnel-preference.json')
  let hostReady = false
  function ensureObservation(ctx, config) {
    if (closing || observationConfig) return Promise.resolve(observationConfig)
    observationStarting ??= (async () => {
      config ??= await loadObservation()
      if (!config || closing) return
      const pairedForRead = await readStationDotPairing(receiptDirectory)
      const prompt = pairedForRead ? null : await openStationDotPromptHost({
        directory:join(receiptDirectory,'station-dot-approved-prompts'),
        sessions:config.sessions,bearer:config.bearer,controller:ctx.sessionController,
      }).catch(() => { console.error('Station Dot 提示词投递未启用：批准目录或回执不可用。'); return null })
      try {
        if (closing) { prompt?.close(); return }
        observation = await startSessionObservation({
          config, sessionController:ctx.sessionController,
          ...createStationPullTools(ctx, config),
          approvedPromptDelivery:prompt?.deliver,
          // The paired endpoint owns approval subscriptions; stale or missing
          // receiver configuration cannot disable the independent query tools.
          approvalEvents:pairedForRead&&config.globalActiveList===true?async()=> {
            try { return await startPairedStationApprovalEvents({ctx,directory:receiptDirectory,bearer:config.bearer,
              report:(state,status)=>console.error('Station Dot 审批事件：'+state+(status===undefined?'':' HTTP '+status))}) }
            catch { console.error('Station Dot 审批通知未启用：接收端或事件源不可用。'); return null }
          }:undefined,
          // Independent local completion cache for pull-based session status.
          observeTurnEnds:listener => ctx.on('session/event', listener),
        })
        stationPrompt = prompt
        observationConfig = config
        return config
      } catch (error) { prompt?.close(); throw error }
    })().finally(() => { observationStarting = undefined })
    return observationStarting
  }
  const managedTunnel = tunnel ? null : createStationDotTunnelControl({
    readEnabled:() => readTunnelPreference(preferencePath),
    writeEnabled:enabled => writeTunnelPreference(preferencePath,enabled),
    getConfig:async () => {
      const paired = await readStationDotPairing(receiptDirectory)
      if (paired) return paired.transport
      const transport = await loadStationDotTunnelConfig(join(receiptDirectory,'station-dot-tunnel.json'))
      const local = observationConfig ?? await loadObservationConfig(observationPath)
      if (!transport && !local) return null
      if (!transport) throw Error('missing_tunnel_config')
      if (!local) throw Error('missing_mcp_config')
      return transport
    },
    createTunnel:(config,publish) => composeBackendDotTunnel({
      ...config,publish,
      openDirectPlugin:async ({ctx,signal}) => {
        if (signal.aborted || closing) return
        const config = await ensureObservation(ctx)
        if (!config || signal.aborted || closing) return
        return {
          capability:'station.observation.owner_scoped',
          allowApprovedDraft:typeof stationPrompt?.deliver === 'function',
          endpoint:'http://127.0.0.1:'+config.port+'/mcp',
          authorization:'Bearer '+config.bearer,
          close:async () => {}, // Web Host owns and closes the listener.
        }
      },
    },application),
    onStatus:value => { void send({type:'workflow-dot-tunnel-status',value}).catch(() => {}) },
  })
  const stop = () => closing ??= (async () => {
    try { await (managedTunnel ? managedTunnel.dispose() : tunnel?.stop()) } catch { console.error('DSH Dot Tunnel 子进程停止未确认。') }
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
    if (message?.type === 'workflow-dot-setup-preview') {
      const {type,requestId}=message
      void (async () => {
        try {
          if (!hostReady || closing || !managedTunnel) throw Error('tunnel_host_unavailable')
          await send({type,requestId,value:await dotSetupPreview(receiptDirectory)})
        } catch {
          await send({type,requestId,error:'无法读取本机 Dot 配对或 DSH 会话列表。'})
        }
      })().catch(() => {})
      return
    }
    if (message?.type === 'workflow-configure-dot-tunnel') {
      const {type,requestId,pairing} = message
      void (async () => {
        try {
          if (!hostReady || closing || !managedTunnel) throw Error('tunnel_host_unavailable')
          const value = await managedTunnel.configure(async () => {
            const {ctx}=await application
            const next=pairing?.mode==='guided' ? await guidedPairing(receiptDirectory,ctx.sessionController,pairing):pairing
            await saveStationDotPairing(receiptDirectory, next)
            await observationStarting
            await observation?.close()
            observation = undefined
            observationConfig = undefined
            stationPrompt?.close()
            stationPrompt = undefined
          })
          await send({type,requestId,value})
        } catch (error) {
          const diagnostic = error?.message === 'tunnel_must_be_stopped_before_pairing'
            ? '请先关闭隧道，再保存新的 Dot 配对。'
            : ({
              dot_setup_official_client_missing: '未找到官方 Tunnel 客户端，请先安装。',
              dot_setup_runtime_key_required: '未找到可复用的运行密钥，请在本机输入。',
              dot_setup_session_scope_invalid: '会话列表已变化，请重新勾选。',
            })[error?.message] ?? '配对未确认。请检查本机连接资料后重试。'
          await send({type,requestId,error:diagnostic})
        }
      })().catch(() => {})
      return
    }
    if (['workflow-set-dot-tunnel','workflow-restart-dot-tunnel'].includes(message?.type)) {
      const {type,requestId,enabled} = message
      void (async () => {
        try {
          if (!hostReady || closing || !managedTunnel) throw Error('tunnel_host_unavailable')
          const value = await (type === 'workflow-restart-dot-tunnel'
            ? managedTunnel.restart() : managedTunnel.setEnabled(enabled))
          await send({type,requestId,value})
        } catch {
          await send({type,requestId,error:'Station 隧道设置未完成，请查看当前状态。'})
        }
      })().catch(() => {})
      return
    }
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
    const observationReady = ensureObservation(ctx).catch(() => {
      console.error('会话观测 MCP 未启用：配置、端口或被动会话接口不可用。')
    })
    stationDotStarting = startStationDotFromHost({ctx, receiptDirectory}).then(value => {stationDot = value})
      .catch(() => { console.error('Station Dot 只读接口未启用：配置、端口或被动会话接口不可用。') })
    await Promise.all([observationReady, stationDotStarting])
  }
  if (!closing) {
    hostReady = true
    if (managedTunnel) void managedTunnel.start().catch(() => {})
    else void tunnel?.start()
  }
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

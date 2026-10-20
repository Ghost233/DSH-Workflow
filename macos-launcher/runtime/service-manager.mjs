import { fork } from 'node:child_process'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { appendFile, readFile } from 'node:fs/promises'
import { join, delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import { prepareDesktopProfile } from './desktop-profile.mjs'
import { readDesktopHost } from './desktop-launch.mjs'
import { dshReadiness } from '../../scripts/dsh-readiness.mjs'
import { SERVICE_PROTOCOL, serviceDirectory, serviceSocket, redact } from './service-control.mjs'
import { listenManagerControl } from './manager-control.mjs'
import { attachManagerWebSocket } from './manager-websocket.mjs'
import { createServiceAdmission } from './service-admission.mjs'
import { serviceNotification } from './service-notification.mjs'
import { startupPluginResults } from './startup-plugins.mjs'
import { statusNotifications } from './status-notifications.mjs'

/** The manager owns the official Host; GUI clients only send explicit management commands. */
export async function serveManager({ dataRoot, resources, home }) {
  const directory = serviceDirectory(dataRoot), socketPath = serviceSocket(dataRoot)
  const server = createServer()
  let child, receipt, injections, admission, platformSession = null, starting, stopping, normalStop, stopOperation, failure = '', state = 'stopped', closing = false
  let controlId = 0, statusRevision = 0
  let notificationAuthorization, authorizing
  let preparingStop = false
  const shellRead = new AbortController()
  let shellEnvironment
  let logWrites = Promise.resolve()
  const logs = []
  let validatedReady = false, lastHealth = { ready: false, message: null }
  const publicSnapshot = () => {
    const paused = stopOperation?.owned === child && admission?.locked
    return { protocol: SERVICE_PROTOCOL, revision: ++statusRevision, service: {
      state, ready: state === 'running' && lastHealth.ready && !paused,
      instanceId: receipt?.lease ?? null, pid: child?.pid ?? null,
      runtimeVersion: receipt?.runtimeVersion ?? null,
      message: paused ? '正在等待停止或重启确认，暂缓接收新工作。'
        : failure || (state === 'running' ? lastHealth.message : null),
      observedAt: new Date().toISOString(),
    }, logs: [...logs], notificationAuthorization: notificationAuthorization ?? null,
    notificationAuthorizationPending: Boolean(authorizing) }
  }
  const updates = statusNotifications(publicSnapshot)
  const log = value => {
    const entry = { text: redact(value).slice(-4096), observedAt: new Date().toISOString() }
    logs.push(entry)
    if (logs.length > 500) logs.shift()
    logWrites = logWrites.then(() => appendFile(join(directory, 'service.log'), JSON.stringify(entry) + '\n', { mode: 0o600 }))
    void logWrites.catch(() => {})
    updates.publish()
  }
  const health = async host => {
    const signal = AbortSignal.timeout(2000)
    const response = await fetch(host.url, { redirect: 'manual', signal })
    const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    await response.text()
    if (!cookie) throw new Error('DSH authentication did not issue a session cookie')
    return dshReadiness(host.url, { cookie, signal })
  }
  const hostRequest = (owned, type, fields = {}, timeout = 2000) => new Promise((accept, reject) => {
    const requestId = ++controlId
    const finish = (error, value) => {
      clearTimeout(timer)
      owned.removeListener('message', message)
      owned.removeListener('close', exited)
      if (error) reject(error)
      else accept(value)
    }
    const message = value => {
      if (value?.type !== type || value.requestId !== requestId) return
      if (value.error) finish(new Error(redact(value.error)))
      else finish(null, value)
    }
    const exited = () => finish(new Error('DSH 服务在任务检查期间退出'))
    const timer = setTimeout(() => finish(new Error('DSH 任务检查超时，当前工作状态未知。')), timeout)
    owned.on('message', message)
    owned.once('close', exited)
    if (!owned.connected || child !== owned) { finish(new Error('DSH 服务实例已改变')); return }
    owned.send({ type, requestId, ...fields }, error => { if (error) finish(error) })
  })
  const inspect = async owned => {
    try {
      const result = await hostRequest(owned, 'workflow-stop-inspection')
      if (child !== owned || result.instanceId !== receipt?.lease || !Array.isArray(result.work)
        || typeof result.unknown !== 'boolean' || !Number.isSafeInteger(result.revision)) throw new Error('DSH 任务检查的实例不匹配')
      return result
    } catch (error) { return { unknown: true, work: [], message: redact(error.message) } }
  }
  const releaseStop = async operation => {
    clearTimeout(operation.timer)
    const failures = []
    if (operation.commitRequested && child === operation.owned) {
      try { await hostRequest(operation.owned, 'workflow-stop-inspection', { action: 'cancel', operationId: operation.operationId }, 2000); operation.commitRequested = false }
      catch (error) { failures.push(redact(error.message)) }
    }
    if (operation.httpLocked && child === operation.owned) {
      try { await hostRequest(operation.owned, 'update-tasks', { action: 'unlock' }, 10_000); operation.httpLocked = false }
      catch (error) { failures.push(redact(error.message)) }
    }
    try { if (child === operation.owned) await operation.admission.unlock() }
    catch (error) { failures.push(redact(error.message)) }
    if (failures.length) throw new Error(`恢复 DSH 服务访问失败：${failures.join('；')}`)
  }
  const publishStop = (operation, inspection) => {
    clearTimeout(operation.timer)
    operation.operationId = randomUUID(); operation.inspection = inspection
    stopOperation = operation
    updates.publish()
    operation.timer = setTimeout(() => {
      if (stopOperation !== operation || stopping) return
      stopOperation = undefined
      void releaseStop(operation).then(() => log('停止确认已过期，服务继续运行。'), error => { failure = redact(error.message); log(failure) })
    }, 60_000).unref()
    return { ...inspection, operationId: operation.operationId, instanceId: operation.instanceId, action: operation.action }
  }
  const prepareStop = async action => {
    if (!['stop', 'restart'].includes(action)) throw new Error('Invalid DSH stop operation')
    if (starting || stopping || preparingStop) throw new Error('DSH 服务正在启动或停止，请稍后重试')
    preparingStop = true
    try {
      if (stopOperation) { await releaseStop(stopOperation); stopOperation = undefined }
      if (!child) return { stopped: true, action }
      if (state !== 'running' || !receipt || !admission) throw new Error('DSH 服务尚未就绪，请检查日志后重试。')
      const owned = child, instanceId = receipt.lease
      const operation = { action, owned, instanceId, admission }
      stopOperation = operation
      let inspection
      try { await admission.lock(); updates.publish(); inspection = await inspect(owned) }
      catch (error) { inspection = { unknown: true, work: [], message: redact(error.message) } }
      if (child !== owned || receipt?.lease !== instanceId) throw new Error('DSH 服务实例已改变，请重新检查。')
      return publishStop(operation, inspection)
    } finally { preparingStop = false }
  }
  const stop = async input => {
    if (stopping) throw new Error('DSH 服务已有停止操作正在进行')
    if (starting) throw new Error('DSH 服务正在启动，请就绪后再停止')
    const operation = stopOperation
    if (!operation || operation.operationId !== input.operationId || operation.owned !== child
      || operation.instanceId !== receipt?.lease || operation.action !== (input.type === 'restart-service' ? 'restart' : 'stop')) {
      throw new Error('DSH 停止确认已过期或实例已改变，请重新检查。')
    }
    const owned = child
    stopping = (async () => {
      let exitTimeout, onExit
      try {
        const first = operation.inspection
        if ((first.unknown || first.work.length || first.changed) && input.confirmed !== true) throw new Error('需要明确确认当前 DSH 停止操作。')
        // The official lock drains admitted HTTP calls; the Host plugin supplements its inventory.
        operation.httpLocked = true
        await hostRequest(owned, 'update-tasks', { action: 'lock' }, 10_000)
        if (child !== owned || receipt?.lease !== operation.instanceId) throw new Error('DSH 服务实例已改变，请重新检查。')
        const exited = Promise.withResolvers()
        void exited.promise.catch(() => {})
        onExit = (code, signal) => exited.resolve({ code, signal })
        owned.once('close', onExit)
        exitTimeout = setTimeout(() => exited.reject(new Error('DSH 服务尚未完成正常停止，请检查日志。')), 12_000)
        normalStop = { owned, operationId: operation.operationId, instanceId: operation.instanceId,
          requestId: controlId + 1, committed: false, acknowledged: false }
        operation.commitRequested = true
        const decision = await hostRequest(owned, 'workflow-stop-inspection', { action: 'commit',
          instanceId: operation.instanceId, operationId: operation.operationId, accepted: first,
          confirmed: input.confirmed === true, expiresAt: Date.now() + 2000 })
        operation.commitRequested = false
        if (decision.committed !== true) {
          normalStop = undefined
          await hostRequest(owned, 'update-tasks', { action: 'unlock' }, 10_000)
          operation.httpLocked = false
          const inspection = { ...decision, changed: true, message: decision.message || '检查后有新工作或状态发生变化，请重新确认。' }
          return publishStop(operation, inspection)
        }
        state = 'stopping'
        updates.publish()
        const result = await exited.promise
        if (!normalStop.acknowledged || result.code !== 0 || result.signal !== null) {
          throw new Error(`DSH 未确认完成正常停止（${result.signal || result.code}），请检查日志。`)
        }
        await operation.admission.close()
        state = 'stopped'; failure = ''; receipt = undefined; injections = undefined; platformSession = null
        stopOperation = undefined
        clearTimeout(operation.timer)
        log('DSH 服务已确认正常停止，Host 进程已退出。')
      } catch (error) {
        if (normalStop?.committed === true) {
          clearTimeout(operation.timer); stopOperation = undefined
          failure = redact(error.message); state = 'failed'; log(failure)
        }
        else if (child === owned) {
          normalStop = undefined
          try { await releaseStop(operation) }
          catch (unlockError) { throw new Error(`${redact(error.message)}；恢复服务访问失败：${redact(unlockError.message)}`) }
        }
        throw error
      } finally {
        clearTimeout(exitTimeout)
        if (onExit) owned.removeListener('close', onExit)
        normalStop = undefined
      }
    })()
    try { return await stopping } finally { stopping = undefined }
  }
  const snapshot = async () => {
    let ready = false, identityVerified = false, message = failure || null
    if (state === 'running' && receipt && child) {
      try {
        const current = await readDesktopHost(join(dataRoot, 'global/.dsh-workflow/desktop'))
        if (current.lease !== receipt.lease || current.pid !== child.pid) throw new Error('DSH service identity changed')
        identityVerified = true
        ready = validatedReady
      } catch (error) { message = redact(error.message) }
    }
    lastHealth = { ready, message }
    updates.publish()
    return { identityVerified, value: publicSnapshot() }
  }
  const start = async (permissionMode = 'workspace-write') => {
    if (!['read-only', 'workspace-write', 'danger-full-access'].includes(permissionMode)) throw new Error('Invalid DSH permission mode')
    if (starting) return starting
    if (stopping) throw new Error('DSH 服务正在停止')
    if (child) return
    starting = (async () => {
      try {
        try {
          await readDesktopHost(join(dataRoot, 'global/.dsh-workflow/desktop'))
          throw new Error('检测到已有 DSH 实例。请先保存工作并退出旧版 Desktop，再启动独立服务。')
        } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error }
        state = 'starting'; failure = ''; receipt = undefined; injections = undefined; platformSession = null; validatedReady = false
        log('正在准备原有 DSH profile 与项目插件。')
        const contents = join(resources, 'desktop/DeepSeek Harness.app/Contents')
        const desktopResources = join(contents, 'Resources')
        let runtime = join(desktopResources, 'app/dsh')
        try { runtime = JSON.parse(await readFile(join(desktopResources, 'dsh-source-runtime.json'), 'utf8')).runtimeRoot }
        catch (error) { if (error.code !== 'ENOENT') throw error }
        shellEnvironment ??= (async () => {
          const { readDesktopLoginShellEnvironment, resolveDesktopLoginShellConfig } = await import(pathToFileURL(join(resources, 'service/login-shell.mjs')).href)
          const prepared = await readDesktopLoginShellEnvironment(process.env, resolveDesktopLoginShellConfig(process.env), { signal: shellRead.signal })
          for (const failure of prepared.failures) log(`desktop login shell: ${failure.shell} failed (${failure.reason})`)
          return prepared.environment
        })()
        const environment = await shellEnvironment
        if (closing) throw new Error('DSH 服务管理进程正在退出')
        const profile = await prepareDesktopProfile({ resourcesRoot: resources, desktopRuntimeRoot: runtime,
          globalRoot: join(dataRoot, 'global'), home, permissionMode })
        const executable = join(contents, 'MacOS/DeepSeek Harness')
        const primaryRuntime = join(desktopResources, 'runtime/primary-runtime')
        const { resolvePrimaryRuntime } = createRequire(join(runtime, 'package.json'))('@deepseek-ai/dsh-tool-workspace-dependencies')
        const primary = await resolvePrimaryRuntime(primaryRuntime)
        const owned = fork(join(runtime, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js'),
          [runtime, profile.profile, primaryRuntime, primary.pnpm, join(contents, 'MacOS')], {
            execPath: executable, execArgv: ['--expose-internals'], cwd: profile.profile,
            env: { ...environment, DSH_HOME: home, DSH_PERMISSION_MODE: permissionMode, ELECTRON_RUN_AS_NODE: '1', DSH_DESKTOP_NODE_EXECUTABLE: executable,
              PATH: `${join(desktopResources, 'runtime/bin')}${delimiter}${environment.PATH ?? ''}` },
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          })
        child = owned
        let startupCleanup = false
        const ready = Promise.withResolvers()
        // Attach rejection handling before any IPC/error event can arrive.
        void ready.promise.catch(() => {})
        const timeout = setTimeout(() => ready.reject(new Error('DSH 服务启动超时，请查看日志')), 30_000)
        createInterface({ input: owned.stdout }).on('line', log)
        createInterface({ input: owned.stderr }).on('line', log)
        owned.on('message', message => {
          if (child !== owned) return
          if (message?.type === 'workflow-stop-inspection' && message.action === 'commit' && message.committed === true
            && normalStop?.owned === owned && message.requestId === normalStop.requestId
            && message.operationId === normalStop.operationId && message.instanceId === normalStop.instanceId) normalStop.committed = true
          if (message?.type === 'shutdown-complete' && normalStop?.owned === owned && normalStop.committed) normalStop.acknowledged = true
          if (message?.type === 'platform-session') platformSession = message.session
          if (message?.type === 'ready') ready.resolve(message)
          if (message?.type === 'fatal') ready.reject(new Error(redact(message.diagnostic || message.message)))
        })
        owned.once('error', error => ready.reject(error))
        owned.once('close', (code, signal) => {
          const expected = closing || normalStop?.owned === owned && normalStop.committed
          const observed = child === owned
          if (child === owned) { child = undefined; state = expected ? 'stopped' : 'failed' }
          updates.publish()
          const previousAdmission = admission; admission = undefined
          void previousAdmission?.close().catch(error => log(redact(error.message)))
          failure = expected ? '' : `DSH 服务已退出（${signal || code}）。请检查日志后手动启动。`
          if (failure) log(failure)
          if (observed && !expected && !startupCleanup) {
            const faultId = randomUUID()
            log(`DSH 服务故障：${JSON.stringify({ faultId, instanceId: receipt?.lease ?? null,
              pid: owned.pid, code, signal, observedAt: new Date().toISOString() })}`)
            void serviceNotification(resources, 'notify', faultId)
              .then(result => log(`DSH 服务故障通知：${JSON.stringify(result)}`))
              .catch(error => log(`DSH 服务故障通知结果未知：${redact(error.message)}`))
          }
          ready.reject(new Error(failure || 'DSH 服务已停止'))
        })
        try {
          const message = await ready.promise
          if (!Array.isArray(message.injections)) throw new Error('DSH 服务未提供兼容的界面接入信息。')
          const url = new URL(message.url)
          if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.searchParams.get('token')) throw new Error('Invalid DSH readiness address')
          let actual
          for (let attempt = 0; attempt < 50; attempt++) {
            try { actual = await readDesktopHost(join(dataRoot, 'global/.dsh-workflow/desktop')); break }
            catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; await delay(20) }
          }
          if (!actual || actual.pid !== owned.pid || actual.url !== message.url) throw new Error('DSH readiness receipt does not identify the owned Host')
          validatedReady = (await health(actual)).ready === true
          lastHealth = { ready: validatedReady, message: null }
          for (const result of await startupPluginResults({ resourcesRoot: resources, url: actual.url, preparation: profile.startup })) {
            log(`项目启动插件：${JSON.stringify(result)}`)
          }
          if (child !== owned || owned.exitCode !== null || owned.signalCode !== null) throw new Error('DSH Host exited during readiness')
          const gatewayRequire = createRequire(createRequire(join(runtime, 'package.json')).resolve('@deepseek-ai/dsh-api-gateway/package.json'))
          const ws = gatewayRequire('ws')
          const gate = await createServiceAdmission({ url: actual.url, WebSocket: ws, WebSocketServer: ws.WebSocketServer })
          if (child !== owned) { await gate.close(); throw new Error('DSH Host exited during connection preparation') }
          admission = gate
          receipt = actual; injections = message.injections; state = 'running'
          log(`DSH 服务已就绪，实例 ${actual.lease}，Host PID ${owned.pid}。`)
        } catch (error) {
          if (child === owned) { startupCleanup = true; owned.kill('SIGTERM') }
          throw error
        } finally { clearTimeout(timeout) }
      } catch (error) {
        failure = redact(error.message); state = 'failed'; log(failure)
        throw error
      }
    })()
    try { await starting } finally { starting = undefined }
  }
  const command = async input => {
    if (input.protocol !== SERVICE_PROTOCOL) throw new Error('DSH 服务协议不兼容，请使用配套应用。')
    if (closing) throw new Error('DSH 服务管理进程正在退出')
    let stopInspection
    if (input.type === 'start-service') await start(input.permissionMode)
    else if (input.type === 'authorize-notifications') {
      if (!authorizing) {
        notificationAuthorization = { authorizationRequest: { state: 'requesting' }, observedAt: new Date().toISOString() }
        authorizing = serviceNotification(resources, 'authorize')
          .then(result => { notificationAuthorization = result; log(`DSH 服务通知授权：${JSON.stringify(result)}`) })
          .catch(error => {
            notificationAuthorization = { available: false, authorizationRequest: { state: 'unknown' },
              message: `macOS 通知授权结果未知：${redact(error.message)}` }
            log(notificationAuthorization.message)
          })
          .finally(() => { authorizing = undefined; updates.publish() })
      }
    }
    else if (input.type === 'notification-status') {
      notificationAuthorization = await serviceNotification(resources, 'status')
      log(`DSH 服务通知状态：${JSON.stringify(notificationAuthorization)}`)
    }
    else if (input.type === 'inspect-stop') stopInspection = await prepareStop(input.action)
    else if (input.type === 'cancel-stop') {
      if (stopping) throw new Error('DSH 停止操作已经执行，无法返回确认阶段。')
      if (stopOperation) {
        if (stopOperation.operationId !== input.operationId) throw new Error('DSH 停止操作已过期')
        await releaseStop(stopOperation); stopOperation = undefined
      }
    }
    else if (['stop-service', 'restart-service'].includes(input.type)) {
      stopInspection = await stop(input)
      if (!stopInspection && input.type === 'restart-service') await start(input.permissionMode)
    }
    else if (!['status', 'logs', 'connect-web', 'connect-desktop'].includes(input.type)) throw new Error('Unsupported DSH service command')
    const { value, identityVerified } = await snapshot()
    if (stopInspection) value.stop = stopInspection
    if (['connect-web', 'connect-desktop'].includes(input.type)) {
      const paused = identityVerified && stopOperation?.owned === child && admission?.locked
      if (value.service.ready !== true && !paused || !receipt || !child || !injections || !admission) {
        throw new Error('DSH 服务未启动或暂不可用，请先启动 DSH 服务。')
      }
      if (input.runtimeVersion !== receipt.runtimeVersion) throw new Error('DSH 服务接入版本不兼容，请使用配套应用。')
      value.connection = { instanceId: receipt.lease, pid: receipt.pid,
        runtimeVersion: receipt.runtimeVersion, url: admission.url, injections }
      // Only Electron main requests this local private response; it is never part of the Web descriptor.
      if (input.type === 'connect-desktop') value.platformSession = platformSession
    }
    return value
  }
  const closeChannels = attachManagerWebSocket(server, command, updates)
  const control = await listenManagerControl(server, { directory, socketPath })
  if (!control) { updates.close(); closeChannels(); return null }
  if (control.backups.length) log(`已恢复失效的服务管理记录，原文件备份：${control.backups.join('，')}`)
  return { async close() {
    closing = true
    updates.close()
    closeChannels()
    shellRead.abort()
    await starting?.catch(() => {})
    const owned = child
    if (owned) {
      const exited = new Promise(accept => owned.once('close', accept))
      if (owned.connected) owned.send({ type: 'shutdown' }, () => {})
      const terminate = setTimeout(() => owned.kill('SIGTERM'), 10_000)
      const force = setTimeout(() => owned.kill('SIGKILL'), 15_000)
      try { await exited } finally { clearTimeout(terminate); clearTimeout(force) }
    }
    await authorizing
    await control.close()
    await logWrites
  } }
}

if (import.meta.main) {
  const [dataRoot, resources, home] = process.argv.slice(2)
  if (!dataRoot || !resources || !home) throw new Error('Missing DSH service paths')
  const manager = await serveManager({ dataRoot, resources, home })
  if (manager) {
    let exiting = false
    const close = () => { if (!exiting) { exiting = true; void manager.close().catch(error => { console.error(redact(error.stack)); process.exitCode = 1 }) } }
    process.once('SIGINT', close); process.once('SIGTERM', close)
  }
}

import { fork } from 'node:child_process'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { appendFile, chmod, readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { createInterface } from 'node:readline'
import { prepareDesktopProfile } from './desktop-profile.mjs'
import { readDesktopHost } from './desktop-launch.mjs'
import { dshReadiness } from '../../scripts/dsh-readiness.mjs'
import { SERVICE_PROTOCOL, serviceDirectory, serviceSocket, privateDirectory, redact } from './service-control.mjs'

/** The manager owns the official Host; GUI clients only send explicit management commands. */
export async function serveManager({ dataRoot, resources, home }) {
  const directory = serviceDirectory(dataRoot), socketPath = serviceSocket(dataRoot)
  await privateDirectory(directory)
  await privateDirectory(dirname(socketPath))
  const server = createServer()
  try {
    await new Promise((accept, reject) => { server.once('error', reject); server.listen(socketPath, () => { server.removeListener('error', reject); accept() }) })
  } catch (error) {
    // Never unlink a socket that another starter may already own, or replace an unknown manager.
    if (error.code === 'EADDRINUSE') return null
    throw error
  }
  await chmod(socketPath, 0o600)
  let child, receipt, starting, failure = '', state = 'stopped', closing = false
  const shellRead = new AbortController()
  let shellEnvironment
  let logWrites = Promise.resolve()
  const logs = []
  const log = value => {
    const entry = { text: redact(value).slice(-4096), observedAt: new Date().toISOString() }
    logs.push(entry)
    if (logs.length > 500) logs.shift()
    logWrites = logWrites.then(() => appendFile(join(directory, 'service.log'), JSON.stringify(entry) + '\n', { mode: 0o600 }))
    void logWrites.catch(() => {})
  }
  const health = async host => {
    const signal = AbortSignal.timeout(2000)
    const response = await fetch(host.url, { redirect: 'manual', signal })
    const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    await response.text()
    if (!cookie) throw new Error('DSH authentication did not issue a session cookie')
    return dshReadiness(host.url, { cookie, signal })
  }
  const snapshot = async () => {
    let ready = false, message = failure || null
    if (state === 'running' && receipt && child) {
      try {
        const current = await readDesktopHost(join(dataRoot, 'global/.dsh-workflow/desktop'))
        if (current.lease !== receipt.lease || current.pid !== child.pid) throw new Error('DSH service identity changed')
        ready = (await health(current)).ready === true
      } catch (error) { message = redact(error.message) }
    }
    return { protocol: SERVICE_PROTOCOL, service: { state, ready, instanceId: receipt?.lease ?? null,
      pid: child?.pid ?? null, runtimeVersion: receipt?.runtimeVersion ?? null,
      message, observedAt: new Date().toISOString() }, logs: [...logs] }
  }
  const start = async (permissionMode = 'workspace-write') => {
    if (!['read-only', 'workspace-write', 'danger-full-access'].includes(permissionMode)) throw new Error('Invalid DSH permission mode')
    if (starting) return starting
    if (child) return
    starting = (async () => {
      try {
        try {
          await readDesktopHost(join(dataRoot, 'global/.dsh-workflow/desktop'))
          throw new Error('检测到已有 DSH 实例。请先保存工作并退出旧版 Desktop，再启动独立服务。')
        } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error }
        state = 'starting'; failure = ''; receipt = undefined
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
        const ready = Promise.withResolvers()
        // Attach rejection handling before any IPC/error event can arrive.
        void ready.promise.catch(() => {})
        const timeout = setTimeout(() => ready.reject(new Error('DSH 服务启动超时，请查看日志')), 30_000)
        createInterface({ input: owned.stdout }).on('line', log)
        createInterface({ input: owned.stderr }).on('line', log)
        owned.on('message', message => {
          if (message?.type === 'ready') ready.resolve(message)
          if (message?.type === 'fatal') ready.reject(new Error(redact(message.diagnostic || message.message)))
        })
        owned.once('error', error => ready.reject(error))
        owned.once('close', (code, signal) => {
          if (child === owned) { child = undefined; state = closing ? 'stopped' : 'failed' }
          failure = closing ? '' : `DSH 服务已退出（${signal || code}）。请检查日志后手动启动。`
          if (failure) log(failure)
          ready.reject(new Error(failure || 'DSH 服务已停止'))
        })
        try {
          const message = await ready.promise
          const url = new URL(message.url)
          if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.searchParams.get('token')) throw new Error('Invalid DSH readiness address')
          let actual
          for (let attempt = 0; attempt < 50; attempt++) {
            try { actual = await readDesktopHost(join(dataRoot, 'global/.dsh-workflow/desktop')); break }
            catch (error) { if (error.code !== 'ENOENT') throw error; await delay(20) }
          }
          if (!actual || actual.pid !== owned.pid || actual.url !== message.url) throw new Error('DSH readiness receipt does not identify the owned Host')
          await health(actual)
          if (child !== owned || owned.exitCode !== null || owned.signalCode !== null) throw new Error('DSH Host exited during readiness')
          receipt = actual; state = 'running'
          log(`DSH 服务已就绪，实例 ${actual.lease}，Host PID ${owned.pid}。`)
        } catch (error) {
          if (child === owned) owned.kill('SIGTERM')
          throw error
        } finally { clearTimeout(timeout) }
      } catch (error) {
        failure = redact(error.message); state = 'failed'; log(failure)
        throw error
      }
    })()
    try { await starting } finally { starting = undefined }
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
      void (async () => {
        try {
          const input = JSON.parse(buffer.slice(0, buffer.indexOf('\n')))
          if (input.protocol !== SERVICE_PROTOCOL) throw new Error('DSH 服务协议不兼容，请使用配套应用。')
          if (closing) throw new Error('DSH 服务管理进程正在退出')
          if (input.type === 'start-service') await start(input.permissionMode)
          else if (!['status', 'logs'].includes(input.type)) throw new Error('Unsupported DSH service command')
          socket.end(JSON.stringify({ ok: true, value: await snapshot() }) + '\n')
        } catch (error) { socket.end(JSON.stringify({ ok: false, error: redact(error.message) }) + '\n') }
      })()
    })
  })
  const statePath = join(directory, 'manager.json')
  await writeFile(statePath, JSON.stringify({ pid: process.pid, protocol: SERVICE_PROTOCOL }) + '\n', { mode: 0o600, flag: 'wx' })
  return { async close() {
    closing = true
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
    await new Promise(accept => server.close(accept))
    await logWrites
    await unlink(socketPath).catch(error => { if (error.code !== 'ENOENT') throw error })
    await unlink(statePath)
    await rmdir(dirname(socketPath))
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

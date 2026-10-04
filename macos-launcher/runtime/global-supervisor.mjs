import http from 'node:http'
import net from 'node:net'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { lstat, mkdir, open } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { localAddresses, privateBindAddress } from './lan-gateway.mjs'
import { launchDesktopWeb } from './desktop-launch.mjs'

const COOKIE = 'dsh-workflow-gate'
export const NAVIGATION_PORT = 33080
const SESSION_MS = 12 * 60 * 60 * 1000
const MAX_BODY = 16 * 1024
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const headers = { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8',
  'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" }
const digest = value => createHash('sha256').update(value, 'utf8').digest()
const matches = (a, b) => timingSafeEqual(digest(a), digest(b))
const waitScript = `// Poll the supervisor for startup progress and mirror it into the terminal box.
(function () {
  const meta = document.querySelector('meta[http-equiv="refresh"]')
  if (meta) meta.remove()
  const log = document.getElementById('log')
  if (!log) return
  const elapsed = document.getElementById('elapsed')
  const startedAt = Date.now()
  async function tick() {
    try {
      const response = await fetch('/global/progress', { cache: 'no-store' })
      if (response.ok) {
        const progress = await response.json()
        log.textContent = [...progress.notes, ...progress.lines].join('\\n') || '…'
        log.scrollTop = log.scrollHeight
        if (progress.state === 'running' && progress.url) { window.location.href = progress.url; return }
        if (progress.state === 'stopped') { window.location.reload(); return }
      }
    } catch { /* transient network errors: keep polling */ }
    if (elapsed) elapsed.textContent = '已等待 ' + Math.round((Date.now() - startedAt) / 1000) + ' 秒…'
    setTimeout(tick, 1000)
  }
  tick()
})()
`

async function bodyOf(request) {
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY) return undefined
    chunks.push(chunk)
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

function page(content) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DSH Workflow</title><style>
body{font:16px -apple-system,BlinkMacSystemFont,sans-serif;max-width:850px;margin:36px auto;padding:0 20px;background:#f5f6f8;color:#202124}main,article{background:white;border-radius:14px;padding:22px;margin:16px 0;box-shadow:0 5px 20px #0001}h1{font-size:24px}h2{font-size:19px}input,button{font:inherit;padding:9px;margin:5px;border-radius:7px}input{border:1px solid #aaa;max-width:95%}button{border:0;background:#2563eb;color:white;cursor:pointer}.stop{background:#555}form{display:inline-block}small{color:#555;overflow-wrap:anywhere}.error{color:#b42318}.term{background:#14161a;color:#cfd6dd;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:12px 14px;border-radius:10px;max-height:340px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;margin:10px 0}
</style></head><body><main><h1>DSH Workflow · 全局实例</h1>${content}</main></body></html>`
}

async function availablePort(host = '127.0.0.1') {
  const server = net.createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, host, resolve) })
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

const canBind = (host, port) => new Promise(resolve => {
  const server = net.createServer()
  server.once('error', () => resolve(false))
  server.listen(port, host, () => server.close(() => resolve(true)))
})

/** Last lines of the engine log, for the streaming startup view. */
async function tailLines(path, limit = 40) {
  try {
    const handle = await open(path, 'r')
    try {
      const { size } = await handle.stat()
      const start = Math.max(0, size - 16 * 1024)
      const buffer = Buffer.alloc(size - start)
      await handle.read(buffer, 0, buffer.length, start)
      return buffer.toString('utf8').split(/\r?\n/).filter(Boolean).slice(-limit)
    } finally { await handle.close() }
  } catch { return [] }
}

/** One navigation service owns exactly one global engine. */
export async function startGlobalSupervisor({ dataRoot, host = privateBindAddress(), port = NAVIGATION_PORT,
  portRange, password, allowLanSettings = false, attachDesktop = launchDesktopWeb, onDesktopNeeded = () => {} }) {
  if (typeof password !== 'string' || !password || !Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error('Invalid global navigation configuration')
  }
  if (portRange !== undefined && (portRange !== null && typeof portRange !== 'object'
    || !Number.isSafeInteger(portRange.min) || !Number.isSafeInteger(portRange.max)
    || portRange.min < 1024 || portRange.max > 65535 || portRange.min > portRange.max)) {
    throw new Error('Web 代理端口范围无效（需要 1024–65535 且起始不大于结束）。')
  }
  if (!localAddresses().has(host)) throw new Error(`绑定的地址 ${host} 不在本机网卡上`)
  const root = resolve(dataRoot)
  await mkdir(root, { recursive: true, mode: 0o700 })
  const globalRoot = join(root, 'global')
  const sessions = new Map()
  const failures = new Map()
  let activeEngine
  let lastError = ''
  const listeners = new Set()
  let currentPassword = password
  let actualPort = port
  let stopping = false

  const authorized = request => {
    const cookie = (request.headers.cookie ?? '').split(';').map(item => item.trim()).find(item => item.startsWith(`${COOKIE}=`))
    const token = cookie?.slice(COOKIE.length + 1)
    const expires = sessions.get(token)
    if (expires === undefined || expires <= Date.now()) { if (token) sessions.delete(token); return false }
    return true
  }
  /** DNS-rebinding and CSRF guard; returns the rejection reason or undefined when trusted. */
  const untrustedReason = request => {
    let authority
    try { authority = new URL(`http://${request.headers.host}`) } catch { return '请求头 Host 无法解析' }
    if (authority.host !== request.headers.host?.toLowerCase()) return '请求头 Host 格式异常'
    if (authority.port !== String(actualPort)) return '访问端口与导航服务不一致'
    if (!localAddresses().has(authority.hostname)) return '访问地址不属于这台 Mac'
    if (request.headers['sec-fetch-site'] === 'cross-site') return '请求来自跨站页面'
    // WebKit webviews and privacy modes submit same-origin forms with the opaque origin "null".
    if (request.headers.origin !== undefined && request.headers.origin !== 'null') {
      try {
        if (new URL(request.headers.origin).origin !== `http://${request.headers.host}`) return 'Origin 与访问地址不一致'
      } catch { return '请求头 Origin 无法解析' }
    }
    return undefined
  }
  const render = (response, status, content) => { response.writeHead(status, headers); response.end(page(content)) }
  // The streaming wait page runs its poller from a same-origin script.
  const renderStream = (response, status, content) => {
    response.writeHead(status, { ...headers, 'content-security-policy': headers['content-security-policy'].replace("form-action", "script-src 'self'; connect-src 'self'; form-action") })
    response.end(page(content))
  }
  const redirect = (response, location) => { response.writeHead(303, { ...headers, location }); response.end() }
  const hostNameOf = request => {
    try { return new URL(`http://${request.headers.host}`).hostname } catch { return host }
  }
  /** Engine entries share one port across the chosen interface and loopback; serve the visitor's own host. */
  const entryOn = (engine, hostname) => {
    if (!engine?.url) return engine?.url ?? null
    try { const url = new URL(engine.url); url.hostname = hostname; return url.toString() } catch { return engine.url }
  }
  const progressOf = async hostname => {
    const engine = activeEngine
    const lines = engine?.logPath ? await tailLines(engine.logPath) : []
    return { state: engine?.ready ? 'running' : engine ? 'starting' : 'stopped',
      error: lastError, url: entryOn(engine, hostname),
      notes: engine?.notes ?? [], lines }
  }
  /** The page only verifies the password and jumps to an engine; management lives in the macOS app. */
  const renderEntry = (response, pageHost) => {
    const engine = activeEngine
    let localEntry = ''
    if (engine?.ready && pageHost !== '127.0.0.1' && pageHost !== 'localhost') {
      const local = entryOn(engine, '127.0.0.1')
      if (local) localEntry = `<p><small>本机配置入口（可管理模型）：<a href="${escapeHtml(local)}">http://127.0.0.1:${engine.gatePort}/</a></small></p>`
    }
    render(response, 200, `<p>连接官方桌面版的全局后端。</p><form method="post" action="/global/open"><button>打开 DSH</button></form>${localEntry}`)
  }

  const stateOf = () => {
    const engine = activeEngine
    return {
      state: engine?.ready ? 'running' : engine ? 'starting' : 'stopped',
      error: lastError, webPort: engine?.webPort ?? null, gatePort: engine?.gatePort ?? null,
      url: engine?.url ?? null }
  }
  const emitState = () => { for (const notify of listeners) notify(stateOf()) }

  const startEngine = async () => {
    let engine = activeEngine
    if (engine) return await engine.readyPromise
    const controller = new AbortController()
    engine = { controller, ready: false, error: '', notes: [], logPath: null, startedAt: Date.now() }
    const note = text => {
      engine.notes.push(`[+${((Date.now() - engine.startedAt) / 1000).toFixed(1)}s] ${text}`)
      emitState()
    }
    let completeReady, failReady
    engine.readyPromise = new Promise((resolveReady, rejectReady) => { completeReady = resolveReady; failReady = rejectReady })
    engine.readyPromise.catch(() => {})
    activeEngine = engine
    note('准备启动官方桌面版的全局后端')
    const reservePort = async bindHosts => {
      const bindEvery = async candidate => {
        for (const bindHost of bindHosts) if (!await canBind(bindHost, candidate)) return false
        return true
      }
      for (let attempt = 0; attempt < 60; attempt++) {
        let candidate
        if (portRange) {
          candidate = portRange.min + Math.floor(Math.random() * (portRange.max - portRange.min + 1))
          if (candidate === actualPort || !await bindEvery(candidate)) continue
        } else {
          candidate = await availablePort(bindHosts[0])
          if (candidate === actualPort) continue
          if (bindHosts.length > 1 && !await bindEvery(candidate)) continue
        }
        return candidate
      }
      throw new Error(portRange ? 'Web 代理端口范围内没有可用端口' : 'Could not allocate a Web port')
    }
    engine.task = (async () => {
      const gatePort = await reservePort(host === '127.0.0.1' ? ['127.0.0.1'] : [host, '127.0.0.1'])
      engine.gatePort = gatePort
      note(`对外端口已分配：${gatePort}`)
      if (controller.signal.aborted || stopping) throw new Error('Engine startup cancelled')
      note('等待官方桌面端的全局后端…')
      onDesktopNeeded()
      await mkdir(globalRoot, { recursive: true, mode: 0o700 })
      if (!(await lstat(globalRoot)).isDirectory()) throw new Error('Global data directory is not a directory')
      await attachDesktop({ globalRoot, gatewayHost: host,
        gatewayPort: gatePort, gatewaySessions: sessions, signal: controller.signal,
        password: currentPassword, allowLanSettings,
        onLog: logPath => { engine.logPath = logPath },
        onGateway: gateway => { engine.gateway = gateway; note('内网代理已就绪，等待 DSH 完成启动…') },
        onReady: (state, entryUrl) => {
          if (Number.isSafeInteger(state.port)) engine.webPort = state.port
          engine.ready = true
          engine.url = entryUrl ?? state.url
          lastError = ''
          completeReady(engine.url)
          emitState()
        } })
    })().catch(error => { engine.error = error.message; lastError = error.message; failReady(error) }).finally(() => {
      if (!engine.ready) failReady(new Error(engine.error || 'Engine stopped before it became ready'))
      if (activeEngine === engine) activeEngine = undefined
      emitState()
    })
    return await engine.readyPromise
  }
  const stopEngine = async () => {
    const engine = activeEngine
    if (!engine) return
    engine.controller.abort()
    await engine.task
    if (activeEngine === engine) activeEngine = undefined
    lastError = ''
    emitState()
  }

  const onRequest = (request, response) => {
    void (async () => {
      const reason = untrustedReason(request)
      if (reason !== undefined) {
        render(response, 403, `<p class="error">请求来源不受信任：${escapeHtml(reason)}。</p><p><small>请在设备浏览器地址栏直接打开管理窗口显示的完整内网地址后再试。</small></p>`)
        return
      }
      if (request.method === 'GET' && request.url === '/') {
        if (authorized(request)) renderEntry(response, hostNameOf(request))
        else render(response, 200, '<p>输入在 macOS App 中设置的内网密码。</p><form method="post" action="/login"><input type="password" name="password" aria-label="密码" required><button>登录</button></form>')
        return
      }
      if (request.method === 'GET') {
        if (request.url === '/global/wait.js') {
          response.writeHead(200, { ...headers, 'content-type': 'text/javascript; charset=utf-8' })
          response.end(waitScript)
          return
        }
        if (!authorized(request)) { render(response, 401, '<p>请先登录。</p>'); return }
        if (request.url === '/global/progress') {
          response.writeHead(200, { ...headers, 'content-type': 'application/json' })
          response.end(JSON.stringify(await progressOf(hostNameOf(request))))
          return
        }
        if (request.url !== '/global/wait') { render(response, 404, '<p>页面不存在。</p>'); return }
        const engine = activeEngine
        if (engine?.ready) { redirect(response, entryOn(engine, hostNameOf(request))); return }
        if (!engine) {
          const error = lastError
          render(response, 200, `<article><h2>全局实例</h2>${
            error ? `<p class="error">启动失败：${escapeHtml(error)}</p>` : '<p>引擎未在运行。</p>'
          }<form method="post" action="/global/open"><button>重试</button></form> <a href="/">返回入口</a></article>`)
          return
        }
        const view = [...engine.notes, ...(await tailLines(engine.logPath ?? ''))]
        renderStream(response, 200, `<article><h2>正在启动 全局实例…</h2>`
          + `<pre id="log" class="term">${escapeHtml(view.join('\n')) || '…'}</pre>`
          + '<p><small>启动日志实时刷新；就绪后会自动进入 DSH。首次启动安装插件可能需要几分钟。</small></p>'
          + '<p><small id="elapsed"></small></p>'
          + `<p><a href="/">返回入口</a></p></article>`
          + '<script src="/global/wait.js" defer></script>')
        return
      }
      if (request.method !== 'POST' || !request.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {
        render(response, 404, '<p>页面不存在。</p>'); return
      }
      const fields = await bodyOf(request)
      if (!fields) { render(response, 413, '<p>请求过大。</p>'); return }
      if (request.url === '/login') {
        const source = request.socket.remoteAddress ?? 'unknown'
        const recent = failures.get(source)
        if (recent?.until > Date.now()) { render(response, 429, '<p>尝试过多，请一分钟后再试。</p>'); return }
        if (!matches(fields.get('password') ?? '', currentPassword)) {
          const count = (recent?.count ?? 0) + 1
          failures.set(source, { count, until: count >= 5 ? Date.now() + 60_000 : 0 })
          render(response, 401, '<p class="error">密码错误。</p>'); return
        }
        failures.delete(source)
        const session = randomBytes(32).toString('base64url')
        sessions.set(session, Date.now() + SESSION_MS)
        response.writeHead(303, { ...headers, location: '/', 'set-cookie': `${COOKIE}=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}` })
        response.end(); return
      }
      if (!authorized(request)) { render(response, 401, '<p>请先登录。</p>'); return }
      if (request.url !== '/global/open') { render(response, 404, '<p>页面不存在。</p>'); return }
      const engine = activeEngine
      // Reply instantly and start the engine in the background: cold starts can take minutes,
      // and a blocking form POST just looks dead on a phone.
      if (engine?.ready) { redirect(response, entryOn(engine, hostNameOf(request))); return }
      void startEngine().catch(() => {})
      redirect(response, `/global/wait`)
    })().catch(error => {
      if (!response.headersSent) render(response, 500, `<p class="error">操作失败：${escapeHtml(error.message)}</p>`)
      else response.destroy()
    })
  }
  const listenOnce = (instance, bindHost, bindPort) => new Promise((resolveListen, reject) => {
    instance.once('error', reject)
    instance.listen(bindPort, bindHost, () => { instance.off('error', reject); resolveListen() })
  })
  const servers = [http.createServer(onRequest)]
  await listenOnce(servers[0], host, port)
  actualPort = servers[0].address().port
  if (host !== '127.0.0.1') {
    const loopback = http.createServer(onRequest)
    try {
      await listenOnce(loopback, '127.0.0.1', actualPort)
      servers.push(loopback)
    } catch (error) {
      await new Promise(resolveClose => { servers[0].closeAllConnections(); servers[0].close(resolveClose) })
      throw error
    }
  }
  return {
    url: `http://${host}:${actualPort}/`, port: actualPort,
    localUrl: `http://127.0.0.1:${actualPort}/`,
    lanUrls: host === '127.0.0.1' ? [] : [`http://${host}:${actualPort}/`],
    setPassword(next) {
      if (typeof next !== 'string' || !next) throw new Error('Password must not be empty')
      currentPassword = next
      sessions.clear()
      failures.clear()
      activeEngine?.gateway?.setPassword(next)
    },
    global: () => stateOf(),
    onState(notify) {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    async openGlobal() { return await startEngine() },
    async stopGlobal() { await stopEngine() },
    async close() {
      stopping = true
      await stopEngine()
      await new Promise(resolveClose => {
        let pending = servers.length
        for (const instance of servers) {
          instance.closeAllConnections()
          instance.close(() => { if (--pending === 0) resolveClose() })
        }
      })
    },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dataRoot] = process.argv.slice(2)
  let supervisor
  const controller = new AbortController()
  process.once('SIGINT', () => controller.abort())
  process.once('SIGTERM', () => controller.abort())
  const parent = process.ppid
  const watch = setInterval(() => { if (process.ppid !== parent) controller.abort() }, 1000)
  watch.unref()
  try {
    if (!dataRoot) throw new Error('Usage: global-supervisor.mjs DATA_ROOT')
    let portRange
    if (process.env.DSH_PORT_MIN || process.env.DSH_PORT_MAX) {
      const min = Number(process.env.DSH_PORT_MIN), max = Number(process.env.DSH_PORT_MAX)
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) throw new Error('Web 代理端口范围必须是整数')
      portRange = { min, max }
    }
    supervisor = await startGlobalSupervisor({ dataRoot, password: process.env.DSH_LAUNCH_PASSWORD,
      host: process.env.DSH_BIND_IP || undefined, portRange,
      allowLanSettings: process.env.DSH_ALLOW_LAN_SETTINGS === '1',
      onDesktopNeeded: () => process.stdout.write('DSH_WORKFLOW_DESKTOP_NEEDED\t{}\n') })
    const writeLine = (label, payload) => process.stdout.write(`${label}\t${JSON.stringify(payload)}\n`)
    writeLine('DSH_WORKFLOW_READY', { port: supervisor.port, url: supervisor.url, localUrl: supervisor.localUrl, lanUrls: supervisor.lanUrls })
    writeLine('DSH_WORKFLOW_STATE', { global: supervisor.global() })
    supervisor.onState(global => writeLine('DSH_WORKFLOW_STATE', { global }))
    const handleCommand = async command => {
      if (command?.type === 'set-password') { supervisor.setPassword(command.password); return }
      const requestId = command?.requestId
      if (typeof requestId !== 'number' || !Number.isInteger(requestId)) return
      let reply
      try {
        if (command.type === 'status') reply = { requestId, ok: true, global: supervisor.global() }
        else if (command.type === 'open-global') reply = { requestId, ok: true, url: await supervisor.openGlobal() }
        else if (command.type === 'disconnect-global') {
          await supervisor.stopGlobal()
          reply = { requestId, ok: true, global: supervisor.global() }
        }
        else reply = { requestId, ok: false, error: `未知指令：${command.type}` }
      } catch (error) {
        reply = { requestId, ok: false, error: String(error?.message ?? error).slice(0, 300) }
      }
      writeLine('DSH_WORKFLOW_REPLY', reply)
    }
    let buffer = ''
    process.stdin.on('data', chunk => {
      buffer += chunk.toString('utf8')
      if (buffer.length > 16_384) { buffer = ''; return }
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n'), line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        try { void handleCommand(JSON.parse(line)) } catch { /* Ignore malformed control messages. */ }
      }
    })
    process.stdin.resume()
    await new Promise(resolveStop => controller.signal.addEventListener('abort', resolveStop, { once: true }))
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 1
  } finally {
    clearInterval(watch)
    await supervisor?.close()
  }
}

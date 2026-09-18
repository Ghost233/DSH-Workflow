import http from 'node:http'
import net from 'node:net'
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { localAddresses, privateBindAddress } from './lan-gateway.mjs'
import { launchPackagedWeb } from './web-launch.mjs'

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
body{font:16px -apple-system,BlinkMacSystemFont,sans-serif;max-width:850px;margin:36px auto;padding:0 20px;background:#f5f6f8;color:#202124}main,article{background:white;border-radius:14px;padding:22px;margin:16px 0;box-shadow:0 5px 20px #0001}h1{font-size:24px}h2{font-size:19px}input,button{font:inherit;padding:9px;margin:5px;border-radius:7px}input{border:1px solid #aaa;max-width:95%}button{border:0;background:#2563eb;color:white;cursor:pointer}.stop{background:#555}form{display:inline-block}small{color:#555;overflow-wrap:anywhere}.error{color:#b42318}
</style></head><body><main><h1>DSH Workflow · Catalog 导航</h1>${content}</main></body></html>`
}

async function availablePort(host = '127.0.0.1') {
  const server = net.createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, host, resolve) })
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

/** One navigation service owns the catalog list; engines are lazy, independent children. */
export async function startCatalogSupervisor({ resourcesRoot, catalogBase, host = privateBindAddress(), port = NAVIGATION_PORT,
  password, launchInstance = launchPackagedWeb }) {
  if (typeof password !== 'string' || !password || !Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error('Invalid catalog navigation configuration')
  }
  const root = resolve(catalogBase)
  await mkdir(root, { recursive: true, mode: 0o700 })
  const listPath = join(root, 'catalogs.json')
  let catalogList = []
  if (existsSync(listPath)) {
    const saved = JSON.parse(await readFile(listPath, 'utf8'))
    if (!Array.isArray(saved) || saved.some(item => !item || typeof item.id !== 'string'
      || typeof item.name !== 'string' || typeof item.path !== 'string')) throw new Error('Invalid catalog list')
    catalogList = saved
  }
  const sessions = new Map()
  const failures = new Map()
  const engines = new Map()
  const reservedPorts = new Set()
  const listeners = new Set()
  let mutation = Promise.resolve()
  let currentPassword = password
  let actualPort = port
  let stopping = false

  const addCatalog = item => {
    const action = mutation.then(async () => {
      if (catalogList.some(row => row.path === item.path || row.path.startsWith(item.path + sep)
        || item.path.startsWith(row.path + sep))) throw new Error('Catalog directory overlaps an existing catalog')
      const next = [...catalogList, item]
      const temporary = join(root, `.catalogs-${randomUUID()}.tmp`)
      await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
      await rename(temporary, listPath)
      catalogList = next
    })
    mutation = action.catch(() => {})
    return action
  }
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
  const redirect = (response, location) => { response.writeHead(303, { ...headers, location }); response.end() }
  /** The page only verifies the password and jumps to an engine; management lives in the macOS app. */
  const renderList = response => {
    const entries = catalogList.map(item =>
      `<article><h2>${escapeHtml(item.name)}</h2><form method="post" action="/catalog/open/${encodeURIComponent(item.id)}"><button>打开</button></form></article>`).join('')
    render(response, 200, entries || '<p>还没有 Catalog；请在 macOS App 的管理窗口中新建或加入。</p>')
  }

  const stateOf = item => {
    const engine = engines.get(item.id)
    return { id: item.id, name: item.name, path: item.path,
      state: engine?.ready ? 'running' : engine ? 'starting' : 'stopped',
      error: engine?.error || '', webPort: engine?.webPort ?? null, gatePort: engine?.gatePort ?? null,
      url: engine?.url ?? null }
  }
  const emitState = () => { for (const notify of listeners) notify(catalogList.map(stateOf)) }

  const startEngine = async item => {
    let engine = engines.get(item.id)
    if (engine) return await engine.readyPromise
    const controller = new AbortController()
    engine = { controller, ready: false, error: '' }
    engines.set(item.id, engine)
    let completeReady, failReady
    engine.readyPromise = new Promise((resolveReady, rejectReady) => { completeReady = resolveReady; failReady = rejectReady })
    engine.readyPromise.catch(() => {})
    const reservePort = async bindHost => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const candidate = await availablePort(bindHost)
        if (candidate !== actualPort && !reservedPorts.has(candidate)) {
          reservedPorts.add(candidate)
          return candidate
        }
      }
      throw new Error('Could not allocate a distinct DSH port')
    }
    engine.task = (async () => {
      let webPort, gatePort
      try {
        webPort = await reservePort('127.0.0.1')
        gatePort = await reservePort(host)
        engine.webPort = webPort
        engine.gatePort = gatePort
        if (controller.signal.aborted || stopping) throw new Error('Engine startup cancelled')
        await launchInstance({ resourcesRoot, workspace: item.path, port: webPort, gatewayHost: host,
          gatewayPort: gatePort, gatewaySessions: sessions, signal: controller.signal, controlStream: null,
          password: currentPassword,
          onGateway: gateway => { engine.gateway = gateway }, onReady: (state, entryUrl) => {
            engine.ready = true
            engine.url = entryUrl ?? state.url
            completeReady(engine.url)
            emitState()
          } })
      } finally {
        if (webPort) reservedPorts.delete(webPort)
        if (gatePort) reservedPorts.delete(gatePort)
      }
    })().catch(error => { engine.error = error.message; failReady(error) }).finally(() => {
      if (!engine.ready) failReady(new Error(engine.error || 'Engine stopped before it became ready'))
      if (engines.get(item.id) === engine) engines.delete(item.id)
      emitState()
    })
    return await engine.readyPromise
  }
  const stopEngine = async id => {
    const engine = engines.get(id)
    if (!engine) return
    engine.controller.abort()
    await engine.task
    if (engines.get(id) === engine) engines.delete(id)
    emitState()
  }

  const server = http.createServer((request, response) => {
    void (async () => {
      const reason = untrustedReason(request)
      if (reason !== undefined) {
        render(response, 403, `<p class="error">请求来源不受信任：${escapeHtml(reason)}。</p><p><small>请在设备浏览器地址栏直接打开管理窗口显示的完整内网地址后再试。</small></p>`)
        return
      }
      if (request.method === 'GET' && request.url === '/') {
        if (authorized(request)) renderList(response)
        else render(response, 200, '<p>输入在 macOS App 中设置的内网密码。</p><form method="post" action="/login"><input type="password" name="password" aria-label="密码" required><button>登录</button></form>')
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
      const match = /^\/catalog\/open\/([a-f0-9-]+)$/.exec(request.url ?? '')
      const item = catalogList.find(row => row.id === match?.[1])
      if (!item) { render(response, 404, '<p>页面不存在。</p>'); return }
      try { redirect(response, await startEngine(item)) }
      catch (error) { render(response, 503, `<p class="error">启动失败：${escapeHtml(error.message)}</p><a href="/">返回列表</a>`) }
    })().catch(error => {
      if (!response.headersSent) render(response, 500, `<p class="error">操作失败：${escapeHtml(error.message)}</p>`)
      else response.destroy()
    })
  })
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => { server.off('error', reject); resolveListen() })
  })
  actualPort = server.address().port
  return {
    url: `http://${host}:${actualPort}/`, port: actualPort,
    lanUrls: host === '127.0.0.1' ? [] : [`http://${host}:${actualPort}/`],
    setPassword(next) {
      if (typeof next !== 'string' || !next) throw new Error('Password must not be empty')
      currentPassword = next
      sessions.clear()
      failures.clear()
      for (const engine of engines.values()) engine.gateway?.setPassword(next)
    },
    catalogs: () => catalogList.map(stateOf),
    onState(notify) {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    async createCatalog(name) {
      const clean = typeof name === 'string' ? name.trim() : ''
      if (!clean || clean.length > 80) throw new Error('名称不能为空且不能超过 80 字符。')
      const id = randomUUID(), path = join(root, 'catalogs', id)
      await mkdir(path, { recursive: true, mode: 0o700 })
      await addCatalog({ id, name: clean, path })
      emitState()
    },
    async attachCatalog(name, inputPath) {
      const clean = typeof name === 'string' ? name.trim() : ''
      const target = typeof inputPath === 'string' ? inputPath.trim() : ''
      if (!clean || clean.length > 80 || !target.startsWith('/')) throw new Error('请输入名称和已有目录的绝对路径。')
      const path = await realpath(target)
      if (path === '/' || catalogList.some(item => item.path === path)
        || catalogList.some(item => path.startsWith(item.path + sep) || item.path.startsWith(path + sep))) {
        throw new Error('目录与已有 Catalog 重复或重叠。')
      }
      if (!(await stat(path)).isDirectory()) throw new Error('这不是目录。')
      await addCatalog({ id: randomUUID(), name: clean, path })
      emitState()
    },
    async openCatalog(id) {
      const item = catalogList.find(row => row.id === id)
      if (!item) throw new Error('Catalog 不存在。')
      return await startEngine(item)
    },
    async stopCatalog(id) {
      if (!catalogList.some(row => row.id === id)) throw new Error('Catalog 不存在。')
      await stopEngine(id)
      emitState()
    },
    async close() {
      stopping = true
      await Promise.all([...engines.keys()].map(stopEngine))
      server.closeAllConnections()
      await new Promise(resolveClose => server.close(resolveClose))
    },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [resourcesRoot, catalogBase] = process.argv.slice(2)
  let supervisor
  const controller = new AbortController()
  process.once('SIGINT', () => controller.abort())
  process.once('SIGTERM', () => controller.abort())
  const parent = process.ppid
  const watch = setInterval(() => { if (process.ppid !== parent) controller.abort() }, 1000)
  watch.unref()
  try {
    if (!resourcesRoot || !catalogBase) throw new Error('Usage: catalog-supervisor.mjs RESOURCES CATALOG_BASE')
    supervisor = await startCatalogSupervisor({ resourcesRoot, catalogBase, password: process.env.DSH_LAUNCH_PASSWORD })
    const writeLine = (label, payload) => process.stdout.write(`${label}\t${JSON.stringify(payload)}\n`)
    writeLine('DSH_WORKFLOW_READY', { port: supervisor.port, url: supervisor.url, lanUrls: supervisor.lanUrls })
    writeLine('DSH_WORKFLOW_STATE', { catalogs: supervisor.catalogs() })
    supervisor.onState(catalogs => writeLine('DSH_WORKFLOW_STATE', { catalogs }))
    const handleCommand = async command => {
      if (command?.type === 'set-password') { supervisor.setPassword(command.password); return }
      const requestId = command?.requestId
      if (typeof requestId !== 'number' || !Number.isInteger(requestId)) return
      let reply
      try {
        if (command.type === 'list') reply = { requestId, ok: true, catalogs: supervisor.catalogs() }
        else if (command.type === 'create') {
          await supervisor.createCatalog(command.name)
          reply = { requestId, ok: true, catalogs: supervisor.catalogs() }
        } else if (command.type === 'attach') {
          await supervisor.attachCatalog(command.name, command.path)
          reply = { requestId, ok: true, catalogs: supervisor.catalogs() }
        } else if (command.type === 'open') reply = { requestId, ok: true, url: await supervisor.openCatalog(command.id) }
        else if (command.type === 'stop') {
          await supervisor.stopCatalog(command.id)
          reply = { requestId, ok: true, catalogs: supervisor.catalogs() }
        } else reply = { requestId, ok: false, error: `未知指令：${command.type}` }
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

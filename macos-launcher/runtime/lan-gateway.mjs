import http from 'node:http'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { networkInterfaces } from 'node:os'

const COOKIE_NAME = 'dsh-workflow-gate'
const MAX_BODY_BYTES = 16 * 1024
const SESSION_MS = 12 * 60 * 60 * 1000
const LOCKOUT_MS = 60 * 1000

const digest = value => createHash('sha256').update(value, 'utf8').digest()
const secretMatches = (a, b) => timingSafeEqual(digest(a), digest(b))

export function localAddresses() {
  const addresses = new Set(['127.0.0.1', 'localhost'])
  for (const rows of Object.values(networkInterfaces())) {
    for (const row of rows ?? []) if (row.family === 'IPv4') addresses.add(row.address)
  }
  return addresses
}

export function isPrivateIPv4(address) {
  const [a, b] = address.split('.').map(Number)
  return a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31
    || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254
}

export function privateBindAddress() {
  const address = [...localAddresses()].find(value => isPrivateIPv4(value))
  if (!address) throw new Error('No private IPv4 LAN/VPN address is available; connect the network and restart the app')
  return address
}

function secureHeaders(type = 'text/html; charset=utf-8') {
  return {
    'cache-control': 'no-store',
    'content-type': type,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  }
}

function loginPage(error = '') {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DSH Workflow 登录</title><style>
body{font:16px -apple-system,BlinkMacSystemFont,sans-serif;min-height:100vh;margin:0;display:grid;place-items:center;background:#f5f6f8;color:#202124}
main{box-sizing:border-box;width:min(380px,calc(100vw - 40px));padding:32px;border-radius:16px;background:white;box-shadow:0 12px 36px #0002}
h1{font-size:22px;margin:0 0 12px}p{color:#555}input,button{box-sizing:border-box;width:100%;padding:12px;margin-top:12px;font:inherit;border-radius:8px}input{border:1px solid #aaa}button{border:0;background:#2563eb;color:#fff;cursor:pointer}.error{color:#b42318}
</style></head><body><main><h1>DSH Workflow</h1><p>输入访问密码，打开当前运行的 DSH。</p>${error ? `<p class="error">${error}</p>` : ''}<form method="post" action="/login"><input aria-label="访问密码" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">登录</button></form></main></body></html>`
}

async function readBody(request) {
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.byteLength
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function cookieValue(request) {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [name, value] = part.trim().split('=', 2)
    if (name === COOKIE_NAME) return value
  }
  return undefined
}

function upstreamHeaders(request, upstreamPort) {
  const headers = { ...request.headers, host: `127.0.0.1:${upstreamPort}` }
  if (headers.origin !== undefined) headers.origin = `http://127.0.0.1:${upstreamPort}`
  if (headers.cookie !== undefined) {
    headers.cookie = headers.cookie.split(';').filter(part => !part.trim().startsWith(`${COOKIE_NAME}=`)).join('; ')
  }
  delete headers['x-forwarded-for']
  delete headers['x-forwarded-host']
  delete headers['x-forwarded-proto']
  return headers
}

/** Password-authenticated HTTP/WebSocket bridge; DSH itself remains loopback-only. */
export async function startLanGateway({ port = 3081, host, upstreamPort, password, authenticatedUrl, sessions: sharedSessions }) {
  host ??= privateBindAddress()
  if (!localAddresses().has(host) || host !== '127.0.0.1' && !isPrivateIPv4(host)) {
    throw new Error('LAN gateway must bind an owned private IPv4 address')
  }
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535 || !Number.isSafeInteger(upstreamPort)
    || upstreamPort < 1 || upstreamPort > 65535 || port === upstreamPort) throw new Error('Invalid LAN gateway ports')
  if (typeof password !== 'string' || password.length === 0 || typeof authenticatedUrl !== 'function') throw new Error('LAN gateway requires a password and DSH URL source')
  let currentPassword = password
  const sessions = sharedSessions ?? new Map()
  const failures = new Map()
  const upgradedSockets = new Map()
  // The same port also answers on loopback: DSH only serves its host Settings
  // (Models page, API keys) to loopback pages, so the Mac needs a 127.0.0.1 entry.
  const acceptedHosts = new Set([host, '127.0.0.1', 'localhost'])
  let listeningPort = port

  const validHost = request => {
    try {
      const authority = new URL(`http://${request.headers.host}`)
      return authority.host === request.headers.host?.toLowerCase()
        && authority.port === String(listeningPort) && acceptedHosts.has(authority.hostname)
    } catch { return false }
  }
  const sameOrigin = request => {
    if (request.headers['sec-fetch-site'] === 'cross-site') return false
    // WebKit webviews and privacy modes submit same-origin forms with the opaque origin "null".
    if (request.headers.origin === undefined || request.headers.origin === 'null') return true
    try { return new URL(request.headers.origin).origin === `http://${request.headers.host}` }
    catch { return false }
  }
  const authenticated = request => {
    const key = cookieValue(request)
    if (!key) return false
    const expiry = sessions.get(key)
    if (expiry === undefined || expiry <= Date.now()) { sessions.delete(key); return false }
    return true
  }
  const reject = (response, code) => {
    response.writeHead(code, secureHeaders('text/plain; charset=utf-8'))
    response.end(code === 403 ? 'forbidden\n' : 'authentication required\n')
  }

  const proxy = (request, response) => {
    const target = http.request({ hostname: '127.0.0.1', port: upstreamPort, method: request.method,
      path: request.url, headers: upstreamHeaders(request, upstreamPort) }, upstream => {
      response.writeHead(upstream.statusCode ?? 502, upstream.headers)
      upstream.pipe(response)
    })
    target.on('error', () => {
      if (!response.headersSent) reject(response, 502); else response.destroy()
    })
    request.pipe(target)
  }

  const onRequest = async (request, response) => {
    if (!validHost(request) || !sameOrigin(request)) { reject(response, 403); return }
    if (request.method === 'POST' && request.url === '/login') {
      const address = request.socket.remoteAddress ?? 'unknown'
      const failure = failures.get(address)
      if (failure?.until > Date.now()) { reject(response, 429); return }
      if (!request.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) { reject(response, 415); return }
      const body = await readBody(request)
      const submitted = body === undefined ? undefined : new URLSearchParams(body).get('password')
      if (typeof submitted !== 'string' || !secretMatches(submitted, currentPassword)) {
        const count = (failure?.count ?? 0) + 1
        failures.set(address, { count, until: count >= 5 ? Date.now() + LOCKOUT_MS : 0 })
        response.writeHead(body === undefined ? 413 : 401, secureHeaders())
        response.end(loginPage(body === undefined ? '请求过大' : '密码错误'))
        return
      }
      const source = authenticatedUrl()
      if (typeof source !== 'string') { reject(response, 503); return }
      let destination
      try {
        const url = new URL(source)
        if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== String(upstreamPort)
          || url.pathname !== '/' || !url.searchParams.has('token')) throw new Error('Invalid DSH URL')
        destination = `http://${request.headers.host}${url.pathname}${url.search}`
      } catch { reject(response, 503); return }
      failures.delete(address)
      const session = randomBytes(32).toString('base64url')
      sessions.set(session, Date.now() + SESSION_MS)
      response.writeHead(303, { ...secureHeaders('text/plain; charset=utf-8'),
        'set-cookie': `${COOKIE_NAME}=${session}; Max-Age=${SESSION_MS / 1000}; HttpOnly; SameSite=Strict; Path=/`,
        location: destination })
      response.end('redirecting\n')
      return
    }
    if (!authenticated(request)) {
      if (request.method === 'GET' && request.url === '/') {
        response.writeHead(200, secureHeaders())
        response.end(loginPage())
      } else reject(response, 401)
      return
    }
    proxy(request, response)
  }

  const onUpgrade = (request, socket, head) => {
    if (!validHost(request) || !sameOrigin(request) || !authenticated(request)) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      return
    }
    const target = http.request({ hostname: '127.0.0.1', port: upstreamPort, path: request.url,
      headers: upstreamHeaders(request, upstreamPort) })
    target.on('upgrade', (upstream, upstreamSocket, upstreamHead) => {
      const lines = [`HTTP/1.1 ${upstream.statusCode} ${upstream.statusMessage}`]
      for (let i = 0; i < upstream.rawHeaders.length; i += 2) lines.push(`${upstream.rawHeaders[i]}: ${upstream.rawHeaders[i + 1]}`)
      socket.write(`${lines.join('\r\n')}\r\n\r\n`)
      if (head.length) upstreamSocket.write(head)
      if (upstreamHead.length) socket.write(upstreamHead)
      upgradedSockets.set(socket, upstreamSocket)
      socket.once('close', () => { upgradedSockets.delete(socket); upstreamSocket.destroy() })
      upstreamSocket.once('close', () => socket.destroy())
      socket.on('error', () => upstreamSocket.destroy())
      upstreamSocket.on('error', () => socket.destroy())
      socket.pipe(upstreamSocket).pipe(socket)
    })
    target.on('response', () => socket.destroy())
    target.on('error', () => socket.destroy())
    target.end()
  }

  const listenOnce = (instance, bindHost, bindPort) => new Promise((resolve, reject) => {
    instance.once('error', reject)
    instance.listen(bindPort, bindHost, () => { instance.off('error', reject); resolve() })
  })
  const servers = [http.createServer(onRequest)]
  servers[0].on('upgrade', onUpgrade)
  await listenOnce(servers[0], host, port)
  listeningPort = servers[0].address().port
  if (host !== '127.0.0.1') {
    const loopback = http.createServer(onRequest)
    loopback.on('upgrade', onUpgrade)
    try {
      await listenOnce(loopback, '127.0.0.1', listeningPort)
      servers.push(loopback)
    } catch (error) {
      await new Promise(resolve => { servers[0].closeAllConnections(); servers[0].close(resolve) })
      throw error
    }
  }
  return {
    port: listeningPort,
    localUrl: `http://127.0.0.1:${listeningPort}/`,
    lanUrls: host === '127.0.0.1' ? [] : [`http://${host}:${listeningPort}/`],
    setPassword(next) {
      if (typeof next !== 'string' || next.length === 0) throw new Error('Password must not be empty')
      currentPassword = next
      sessions.clear()
      failures.clear()
      for (const [socket, upstream] of upgradedSockets) { socket.destroy(); upstream.destroy() }
    },
    close: () => new Promise(resolve => {
      for (const [socket, upstream] of upgradedSockets) { socket.destroy(); upstream.destroy() }
      let pending = servers.length
      for (const instance of servers) {
        instance.closeAllConnections()
        instance.close(() => { if (--pending === 0) resolve() })
      }
    }),
  }
}

import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { startLanGateway } from './lan-gateway.mjs'

async function server(handler) {
  const instance = http.createServer(handler)
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve))
  return { instance, port: instance.address().port, close: () => new Promise(resolve => instance.close(resolve)) }
}

async function requestStatus(port, headers) {
  return await new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: '/', headers }, response => {
      response.resume()
      response.once('end', () => resolve(response.statusCode))
    })
    request.once('error', reject)
    request.end()
  })
}

test('LAN gate requires password, proxies the process URL and revokes sessions on password change', async t => {
  const upstream = await server((request, response) => {
    assert.equal(request.headers.host, `127.0.0.1:${upstream.port}`)
    if (request.url === '/?token=process-token') {
      response.writeHead(303, { location: '/', 'set-cookie': 'dsh-auth=test; HttpOnly; Path=/' })
      response.end()
    } else if (request.url === '/api/test') {
      response.end(request.headers.cookie ?? '')
    } else response.end('DSH page')
  })
  t.after(() => upstream.close())
  // Use an OS-assigned ephemeral port for the isolated fixture.
  const gate = await startLanGateway({ port: 0, host: '127.0.0.1', upstreamPort: upstream.port,
    password: 'first-secret', authenticatedUrl: () => `http://127.0.0.1:${upstream.port}/?token=process-token` })
  t.after(() => gate.close())
  const base = `http://127.0.0.1:${gate.port}`
  const before = await fetch(`${base}/api/test`)
  assert.equal(before.status, 401)
  assert.equal(await requestStatus(gate.port, { host: `evil.example:${gate.port}` }), 403)
  assert.equal((await fetch(base, { headers: { origin: 'http://evil.example' } })).status, 403)
  const page = await fetch(base)
  assert.equal(page.status, 200)
  assert.doesNotMatch(await page.text(), /process-token|first-secret/u)
  const wrong = await fetch(`${base}/login`, { method: 'POST', body: 'password=wrong', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  assert.equal(wrong.status, 401)
  const login = await fetch(`${base}/login`, { method: 'POST', body: 'password=first-secret', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  assert.equal(login.status, 303)
  assert.equal(login.headers.get('location'), `${base}/?token=process-token`)
  // WebKit webviews submit the login form with the opaque origin "null"; the gate must still serve them.
  const opaqueLogin = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: gate.port, path: '/login', method: 'POST',
      headers: { origin: 'null', 'content-type': 'application/x-www-form-urlencoded' } }, response => {
      response.resume()
      response.once('end', () => resolve(response.statusCode))
    })
    request.once('error', reject)
    request.end('password=first-secret')
  })
  assert.equal(opaqueLogin, 303)
  const gateCookie = login.headers.get('set-cookie')?.split(';', 1)[0]
  assert.ok(gateCookie)
  const exchanged = await fetch(login.headers.get('location'), { redirect: 'manual', headers: { cookie: gateCookie } })
  assert.equal(exchanged.status, 303)
  assert.equal(exchanged.headers.get('location'), '/')
  assert.match(exchanged.headers.get('set-cookie') ?? '', /dsh-auth=test/u)
  const api = await fetch(`${base}/api/test`, { headers: { cookie: `${gateCookie}; dsh-auth=test` } })
  assert.equal(api.status, 200)
  assert.equal(await api.text(), 'dsh-auth=test')
  gate.setPassword('second-secret')
  assert.equal((await fetch(`${base}/api/test`, { headers: { cookie: gateCookie } })).status, 401)
  assert.equal((await fetch(`${base}/login`, { method: 'POST', body: 'password=first-secret',
    headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 401)
  assert.equal((await fetch(`${base}/login`, { method: 'POST', body: 'password=second-secret', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 303)
})

async function upgrade(port, cookie) {
  return await new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1')
    const timer = setTimeout(() => { socket.destroy(); reject(new Error(`upgrade timed out: ${response}`)) }, 2000)
    let response = ''
    socket.once('error', error => { clearTimeout(timer); reject(error) })
    socket.on('data', chunk => {
      response += chunk.toString('utf8')
      if (response.includes('\r\n\r\n')) { clearTimeout(timer); resolve({ socket, response }) }
    })
    socket.once('connect', () => socket.write([
      'GET /api/socket HTTP/1.1', `Host: 127.0.0.1:${port}`, 'Connection: Upgrade',
      'Upgrade: websocket', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version: 13',
      ...(cookie ? [`Cookie: ${cookie}`] : []), '', '',
    ].join('\r\n')))
  })
}

test('LAN gate rejects unauthenticated upgrades and forwards authenticated WebSockets', async t => {
  const upstreamSockets = new Set()
  const upstream = await server((_request, response) => response.end('unused'))
  upstream.instance.on('upgrade', (request, socket) => {
    upstreamSockets.add(socket)
    socket.once('close', () => upstreamSockets.delete(socket))
    assert.equal(request.headers.host, `127.0.0.1:${upstream.port}`)
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    socket.on('data', chunk => socket.write(chunk))
  })
  const gate = await startLanGateway({ port: 0, host: '127.0.0.1', upstreamPort: upstream.port,
    password: 'secret', authenticatedUrl: () => `http://127.0.0.1:${upstream.port}/?token=process-token` })
  t.after(async () => { await gate.close(); for (const socket of upstreamSockets) socket.destroy(); await upstream.close() })
  const denied = await upgrade(gate.port)
  assert.match(denied.response, /401 Unauthorized/u)
  denied.socket.destroy()
  const login = await fetch(`http://127.0.0.1:${gate.port}/login`, { method: 'POST', body: 'password=secret', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
  assert.ok(cookie)
  const admitted = await upgrade(gate.port, cookie)
  assert.match(admitted.response, /101 Switching Protocols/u)
  const closed = new Promise(resolve => admitted.socket.once('close', resolve))
  gate.setPassword('changed')
  await closed
})

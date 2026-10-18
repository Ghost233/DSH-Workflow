import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

// A separate real gateway process must exit naturally while the external HTTP
// fixture stays alive. Releasing that fixture is cleanup, never a passing exit.
const peer = String.raw`
import http from 'node:http'
import net from 'node:net'
import { once } from 'node:events'
import { pathToFileURL } from 'node:url'
const [source, upstreamPort, mode] = process.argv.slice(1)
const { startLanGateway } = await import(pathToFileURL(source))
const gateway = await startLanGateway({ host: '127.0.0.1', port: 0,
  upstreamPort: Number(upstreamPort), password: 'owned-close-fixture',
  authenticatedUrl: () => 'http://127.0.0.1:' + upstreamPort + '/?token=owned-close-fixture' })
const login = await fetch(gateway.localUrl + 'login', { method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: 'password=owned-close-fixture', redirect: 'manual' })
if (login.status !== 303) throw new Error('Login returned ' + login.status)
const cookie = login.headers.getSetCookie()[0].split(';', 1)[0]
await login.body.cancel()
if (mode === 'aborted-http') {
  const request = http.get(gateway.localUrl + 'hold', { headers: { cookie } })
  const [response] = await once(request, 'response')
  await once(response, 'data')
  const closed = new Promise(accept => response.once('close', accept))
  response.on('error', () => {})
  request.destroy()
  await closed
} else {
  const socket = net.connect(gateway.port, '127.0.0.1')
  await once(socket, 'connect')
  socket.write('GET /socket HTTP/1.1\r\nHost: 127.0.0.1:' + gateway.port + '\r\nCookie: ' + cookie
    + '\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: b3duZWQtY2xvc2UtZml4dA==\r\n\r\n')
  if (mode === 'upgraded-ws') await once(socket, 'data')
  else await new Promise(accept => setTimeout(accept, 100))
}
console.log('CLOSE_REQUESTED')
await gateway.close()
console.log('GATEWAY_CLOSED')
`

for (const mode of ['aborted-http', 'pending-ws', 'upgraded-ws']) {
  test(`gateway releases ${mode} connections and exits while its upstream stays alive`, { timeout: 5000 }, async () => {
    const sockets = new Set()
    let heldHits = 0, child, exited, result, stdout = '', stderr = ''
    const upstream = http.createServer((request, response) => {
      if (request.url === '/hold') {
        heldHits++
        response.writeHead(200)
        response.write('held')
      } else {
        response.writeHead(303, { 'set-cookie': 'owned-host-auth=fixture' })
        response.end()
      }
    })
    upstream.on('connection', socket => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
    })
    upstream.on('upgrade', (request, socket) => {
      heldHits++
      if (mode === 'upgraded-ws') {
        const accept = createHash('sha1').update(request.headers['sec-websocket-key']
          + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
        socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n')
      }
    })
    let observed
    try {
      upstream.listen(0, '127.0.0.1')
      await once(upstream, 'listening')
      child = spawn(process.execPath, ['--input-type=module', '-e', peer,
        fileURLToPath(new URL('./lan-gateway.mjs', import.meta.url)), String(upstream.address().port), mode],
      { stdio: ['ignore', 'pipe', 'pipe'] })
      child.stdout.on('data', chunk => { stdout += chunk })
      child.stderr.on('data', chunk => { stderr += chunk })
      exited = once(child, 'exit').then(([code, signal]) => { result = { code, signal } })
      const started = performance.now()
      while (!stdout.includes('CLOSE_REQUESTED') && !result && performance.now() - started < 1500) await delay(10)
      await Promise.race([exited, delay(1000)])
      observed = { result, stdout, stderr, heldHits }
    } finally {
      for (const socket of sockets) socket.destroy()
      await new Promise(accept => upstream.close(accept))
      if (child && !result) {
        await Promise.race([exited, delay(1000)])
        if (!result) { child.kill('SIGKILL'); await exited }
      }
    }
    assert.equal(observed.heldHits, 1, JSON.stringify(observed))
    assert.match(observed.stdout, /CLOSE_REQUESTED/, JSON.stringify(observed))
    assert.match(observed.stdout, /GATEWAY_CLOSED/, JSON.stringify(observed))
    assert.deepEqual(observed.result, { code: 0, signal: null }, JSON.stringify(observed))
    assert.equal(observed.stderr, '')
  })
}

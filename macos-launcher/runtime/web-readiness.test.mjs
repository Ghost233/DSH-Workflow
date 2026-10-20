import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { startGlobalSupervisor } from './global-supervisor.mjs'
import { SERVICE_PROTOCOL, serviceSocket, serviceDirectory } from './service-control.mjs'
import { attachManagerWebSocket } from './manager-websocket.mjs'
import { listenManagerControl } from './manager-control.mjs'
import { statusNotifications } from './status-notifications.mjs'

// This is the protected discovery/admission protocol boundary, not a substitute
// for the separate real official Host + SDK + accepted-task acceptance cases.
for (const initiallyPaused of [false, true]) {
  test(`Web readiness follows same-instance admission and cancel (initiallyPaused=${initiallyPaused})`, async t => {
    const root = await mkdtemp('/private/tmp/dsh-web-readiness-')
    const socketPath = serviceSocket(root)
    const runtime = JSON.parse(await readFile(new URL('../../dsh-runtime.json', import.meta.url), 'utf8'))
    const instanceId = randomUUID(), sockets = new Set(), requests = []
    let ready = !initiallyPaused, supervisor, websocket
    const pauseMessage = '正在等待停止或重启确认，暂缓接收新工作。'
    const upstream = http.createServer((request, response) => {
      if (!ready) { response.writeHead(503); response.end('admission paused'); return }
      if (request.url.startsWith('/?token=')) response.writeHead(303, { 'set-cookie': 'owned-upstream-session=fixture' })
      else response.writeHead(200)
      response.end('owned upstream response')
    })
    upstream.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
    upstream.on('upgrade', (request, socket) => {
      const accept = createHash('sha1').update(request.headers['sec-websocket-key']
        + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
      socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n')
    })
    let revision = 0
    const snapshot = () => ({ protocol: SERVICE_PROTOCOL, revision: ++revision,
      service: { state: 'running', ready, instanceId, pid: process.pid,
        runtimeVersion: runtime.version, message: ready ? null : pauseMessage }, logs: [] })
    const updates = statusNotifications(snapshot), control = net.createServer()
    const closeChannels = attachManagerWebSocket(control, async request => {
      requests.push(request)
      return { ...snapshot(), connection: { instanceId, pid: process.pid, runtimeVersion: runtime.version,
        url: `http://127.0.0.1:${upstream.address().port}/?token=owned-admission-fixture`, injections: {} } }
    }, updates)
    let binding
    t.after(async () => {
      websocket?.destroy()
      await supervisor?.close()
      updates.close(); closeChannels(); await binding?.close()
      for (const socket of sockets) socket.destroy()
      await new Promise(accept => upstream.close(accept))
      await rm(root, { recursive: true, force: true })
    })
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening')
    binding = await listenManagerControl(control, { directory: serviceDirectory(root), socketPath })
    supervisor = await startGlobalSupervisor({ dataRoot: root, host: '127.0.0.1', port: 0, password: 'owned-admission-fixture' })
    const webInstance = supervisor.global().instanceId, webPort = supervisor.port
    const publishReady = value => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { release(); reject(new Error('Web did not consume the pushed readiness event')) }, 1000)
      const release = supervisor.onState(current => {
        if (current.ready === value) { clearTimeout(timer); release(); resolve() }
      })
      ready = value
      updates.publish()
    })
    const get = async cookie => {
      const response = await fetch(supervisor.localUrl + 'api/owned', { headers: cookie ? { cookie } : {} })
      const code = response.status
      await response.body.cancel()
      return code
    }
    if (initiallyPaused) {
      assert.equal(await get(), 503)
      assert.equal(supervisor.global().ready, false)
      assert.match(supervisor.global().error, /等待停止或重启确认/)
      await publishReady(true)
    }
    const login = await fetch(supervisor.localUrl + 'login', { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'password=owned-admission-fixture', redirect: 'manual' })
    assert.equal(login.status, 303)
    const cookie = login.headers.getSetCookie()[0].split(';', 1)[0]
    await login.body.cancel()
    assert.equal(await get(cookie), 200)
    assert.equal(supervisor.global().ready, true)
    websocket = net.connect(webPort, '127.0.0.1')
    await once(websocket, 'connect')
    websocket.write(`GET /socket HTTP/1.1\r\nHost: 127.0.0.1:${webPort}\r\nCookie: ${cookie}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: b3duZWQtcmVhZGluZXNz\r\n\r\n`)
    assert.match(String((await once(websocket, 'data'))[0]), /^HTTP\/1.1 101/)
    await publishReady(false)
    assert.equal(await get(cookie), 503)
    assert.equal(supervisor.global().state, 'running')
    assert.equal(supervisor.global().ready, false)
    assert.match(supervisor.global().error, /等待停止或重启确认/)
    assert.equal(supervisor.global().instanceId, webInstance)
    assert.equal(supervisor.global().serviceInstanceId, instanceId)
    assert.equal(supervisor.port, webPort)
    assert.equal(websocket.destroyed, false)
    await publishReady(true)
    assert.equal(await get(cookie), 200, 'cancel preserves the authenticated Web session')
    assert.equal(supervisor.global().ready, true)
    assert.equal(supervisor.global().error, '')
    assert.equal(supervisor.global().instanceId, webInstance)
    assert.equal(supervisor.global().serviceInstanceId, instanceId)
    assert.equal(websocket.destroyed, false)
    assert.equal(requests.length, 1, 'the same WebSocket uses pushed state without rediscovering the Host')
    assert.ok(requests.every(request => request.type === 'connect-web'
      && request.protocol === SERVICE_PROTOCOL && request.runtimeVersion === runtime.version),
    'the Web entry only discovers the existing service; it never starts or stops it')
  })
}

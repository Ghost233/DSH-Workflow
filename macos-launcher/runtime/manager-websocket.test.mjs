import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import http from 'node:http'
import { mkdtemp, rm, chmod, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { attachManagerWebSocket, connectManagerChannel } from './manager-websocket.mjs'
import { listenManagerControl } from './manager-control.mjs'
import { statusNotifications } from './status-notifications.mjs'
import { serviceDirectory, serviceSocket } from './service-control.mjs'
import { startGlobalSupervisor } from './global-supervisor.mjs'

async function fixture(t, { revokeGrant = false, initiallyStopped = false, readyAfterRejection = false } = {}) {
  const root = await mkdtemp('/private/tmp/dsh-websocket-')
  const runtime = JSON.parse(await readFile(new URL('../../dsh-runtime.json', import.meta.url), 'utf8'))
  const service = { state: 'running', ready: true, pid: process.pid, instanceId: 'owned-host', runtimeVersion: runtime.version }
  if (initiallyStopped) { service.state = 'stopped'; service.ready = false }
  let revision = 0
  const snapshot = () => ({ protocol: 1, revision: ++revision, service: { ...service }, logs: [] })
  const upstream = http.createServer((request, response) => {
    if (request.url.startsWith('/?token=')) response.writeHead(303, { 'set-cookie': 'owned-host-session=fixture' })
    else response.writeHead(request.headers.cookie?.includes('owned-host-session=fixture') ? 200 : 401)
    response.end('owned upstream')
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const requests = [], server = createServer(), updates = statusNotifications(snapshot)
  const accepted = []
  server.on('connection', socket => accepted.push(socket))
  const closeChannels = attachManagerWebSocket(server, async input => {
    requests.push(input.type)
    if (input.type === 'change') { service.ready = false; updates.publish() }
    if (input.type === 'connect-web' && service.state !== 'running') {
      if (readyAfterRejection) { service.state = 'running'; service.ready = true; updates.publish() }
      throw new Error('Host is stopped')
    }
    const result = { ...snapshot(), ...(input.type === 'connect-web' ? { connection: {
      instanceId: service.instanceId, pid: service.pid, runtimeVersion: runtime.version,
      url: `http://127.0.0.1:${upstream.address().port}/?token=owned-websocket-test`,
    } } : {}) }
    if (input.type === 'connect-web' && revokeGrant) { service.ready = false; updates.publish() }
    return result
  }, updates)
  const socket = serviceSocket(root)
  const control = await listenManagerControl(server, { directory: serviceDirectory(root), socketPath: socket })
  t.after(async () => {
    updates.close(); closeChannels(); await control.close()
    upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve))
    await rm(root, { recursive: true, force: true })
  })
  return { root, socket, requests, service, updates, accepted }
}

test('idle Web uses pushed state and never repeats a connection query', async t => {
  const owned = await fixture(t)
  t.mock.timers.enable({ apis: ['setInterval'] })
  const supervisor = await startGlobalSupervisor({ dataRoot: owned.root, host: '127.0.0.1', port: 0, password: 'owned-test' })
  try {
    assert.equal(supervisor.global().ready, true)
    const count = owned.requests.length
    t.mock.timers.tick(10_000)
    await delay(50)
    assert.equal(owned.requests.length, count, 'idle time must not send another connect-web or status request')
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(supervisor.url)
      assert.equal(response.status, 200)
      await response.body.cancel()
    }
    assert.equal(owned.requests.length, count, 'ordinary Web requests use the pushed readiness state')
    owned.service.ready = false; owned.updates.publish()
    for (let attempt = 0; attempt < 100 && supervisor.global().ready; attempt++) await delay(5)
    assert.equal(supervisor.global().ready, false, 'a stop/admission event must revoke Web readiness without a poll')
    const response = await fetch(supervisor.url)
    assert.equal(response.status, 503)
    await response.body.cancel()
  } finally { t.mock.timers.reset(); await supervisor.close() }
})

test('one private WebSocket carries commands, correlated replies and pushed changes', async t => {
  const owned = await fixture(t), states = [], failures = []
  const channel = await connectManagerChannel(owned.socket, { onStatus: value => states.push(value), onFailure: error => failures.push(error) })
  try {
    await channel.request({ type: 'watch-status' })
    assert.equal(owned.accepted.at(-1).timeout, 0, 'idle WebSockets have no expiry or heartbeat requirement')
    const [before, changed] = await Promise.all([channel.request({ type: 'status' }), channel.request({ type: 'change' })])
    assert.equal(before.service.ready, true)
    assert.equal(changed.service.ready, false)
    for (let attempt = 0; attempt < 100 && !states.some(value => !value.service.ready); attempt++) await delay(5)
    assert.ok(states.some(value => value.service.ready))
    assert.ok(states.some(value => !value.service.ready))
    assert.ok(states.every(value => value.connection === undefined), 'status events never contain private connection grants')
    assert.equal(failures.length, 0)
  } finally { channel.close() }
})

test('WebSocket connections preserve private socket permission checks', async t => {
  const owned = await fixture(t)
  await chmod(owned.socket, 0o644)
  await assert.rejects(connectManagerChannel(owned.socket), /Unsafe DSH service socket/)
})

test('a newer admission event cannot be overwritten by an older connection grant', async t => {
  const owned = await fixture(t, { revokeGrant: true })
  const supervisor = await startGlobalSupervisor({ dataRoot: owned.root, host: '127.0.0.1', port: 0, password: 'owned-test' })
  try {
    await delay(30)
    assert.equal(supervisor.global().ready, false)
    const response = await fetch(supervisor.url)
    assert.equal(response.status, 503)
    await response.body.cancel()
  } finally { await supervisor.close() }
})

test('an explicit Web reopen reconnects a failed WebSocket without a timer', async t => {
  const owned = await fixture(t)
  const supervisor = await startGlobalSupervisor({ dataRoot: owned.root, host: '127.0.0.1', port: 0, password: 'owned-test' })
  try {
    const instance = supervisor.global().instanceId, url = supervisor.url
    for (const socket of owned.accepted) socket.destroy()
    for (let attempt = 0; attempt < 100 && supervisor.global().ready; attempt++) await delay(5)
    assert.equal(supervisor.global().ready, false)
    await supervisor.openGlobal()
    assert.equal(supervisor.global().ready, true)
    assert.equal(supervisor.url, url)
    assert.equal(supervisor.global().instanceId, instance)
    assert.deepEqual(owned.requests, ['connect-web', 'connect-web'])
  } finally { await supervisor.close() }
})

test('a pushed Host-ready event connects a Web entry that started without a Host', async t => {
  const owned = await fixture(t, { initiallyStopped: true })
  const supervisor = await startGlobalSupervisor({ dataRoot: owned.root, host: '127.0.0.1', port: 0, password: 'owned-test' })
  try {
    assert.equal(supervisor.global().ready, false)
    owned.service.state = 'running'; owned.service.ready = true; owned.updates.publish()
    for (let attempt = 0; attempt < 100 && !supervisor.global().ready; attempt++) await delay(5)
    assert.equal(supervisor.global().ready, true)
    assert.deepEqual(owned.requests, ['connect-web', 'connect-web'])
    const login = await fetch(supervisor.url + 'login', { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=owned-test', redirect: 'manual' })
    assert.equal(login.status, 303, 'the late connection must update the actual gateway upstream port')
    const cookie = login.headers.getSetCookie()[0].split(';', 1)[0]
    await login.body.cancel()
    const response = await fetch(supervisor.url + 'api/owned', { headers: { cookie } })
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'owned upstream')
  } finally { await supervisor.close() }
})

test('same-Host Web reopen preserves the authenticated upstream session', async t => {
  const owned = await fixture(t)
  const supervisor = await startGlobalSupervisor({ dataRoot: owned.root, host: '127.0.0.1', port: 0, password: 'owned-test' })
  try {
    const login = await fetch(supervisor.url + 'login', { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=owned-test', redirect: 'manual' })
    assert.equal(login.status, 303)
    const cookie = login.headers.getSetCookie()[0].split(';', 1)[0]
    await login.body.cancel()
    await supervisor.openGlobal()
    const response = await fetch(supervisor.url + 'api/owned', { headers: { cookie } })
    assert.equal(response.status, 200, 'an explicit same-Host reconnect must retain its backend cookie')
    assert.equal(await response.text(), 'owned upstream')
  } finally { await supervisor.close() }
})

test('a new ready event retries once after an in-flight stopped-Host grant fails', async t => {
  const owned = await fixture(t, { initiallyStopped: true, readyAfterRejection: true })
  const supervisor = await startGlobalSupervisor({ dataRoot: owned.root, host: '127.0.0.1', port: 0, password: 'owned-test' })
  try {
    for (let attempt = 0; attempt < 100 && !supervisor.global().ready; attempt++) await delay(5)
    assert.equal(supervisor.global().ready, true)
    assert.deepEqual(owned.requests, ['connect-web', 'connect-web'], 'only the new ready event triggers one follow-up grant')
  } finally { await supervisor.close() }
})

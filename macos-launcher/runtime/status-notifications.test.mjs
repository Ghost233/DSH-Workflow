import test from 'node:test'
import assert from 'node:assert/strict'
import { createConnection, createServer } from 'node:net'
import { createInterface } from 'node:readline'
import { mkdtemp, mkdir, rm, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { serveManager } from './service-manager.mjs'
import { serveGlobalSupervisor } from './global-supervisor.mjs'
import { SERVICE_PROTOCOL, serviceRequest, serviceSocket } from './service-control.mjs'
import { webSocket } from './web-control.mjs'
import { watchServiceStatus } from './status-notifications.mjs'

async function fixture(t) {
  const root = await mkdtemp('/private/tmp/dsh-status-events-')
  const resources = join(root, 'resources')
  await mkdir(resources)
  return { root, resources }
}

function subscribe(t, path) {
  const socket = createConnection(path)
  const lines = createInterface({ input: socket })
  const frames = []
  lines.on('line', line => frames.push(JSON.parse(line)))
  socket.once('connect', () => socket.write(JSON.stringify({ protocol: SERVICE_PROTOCOL, type: 'watch-status' }) + '\n'))
  socket.on('error', () => {})
  t.after(() => { lines.close(); socket.destroy() })
  return { frames, socket, async wait(predicate) {
    const deadline = Date.now() + 1500
    while (!frames.some(predicate) && Date.now() < deadline) await delay(5)
    const frame = frames.find(predicate)
    assert.ok(frame, JSON.stringify(frames))
    return frame
  } }
}

test('DSH status subscriptions push initial and authorization changes without starting a Host', async t => {
  const { root, resources } = await fixture(t)
  const manager = await serveManager({ dataRoot: root, resources, home: join(root, 'home') })
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }) })
  const watcher = subscribe(t, serviceSocket(root))
  await watcher.wait(frame => frame.ok === true && frame.value.service?.state === 'stopped')
  const count = watcher.frames.length
  await serviceRequest(serviceSocket(root), { type: 'status' })
  await delay(80)
  assert.equal(watcher.frames.length, count, 'idle subscriptions have no heartbeat or polling messages')
  await serviceRequest(serviceSocket(root), { type: 'notification-status' })
  const changed = await watcher.wait(frame => frame.value?.notificationAuthorization?.available === false)
  assert.equal(changed.value.service.state, 'stopped')
  assert.equal(changed.value.service.pid, null)
  assert.equal(changed.value.connection, undefined, 'status streams never contain private connection grants')
  watcher.socket.destroy()
  assert.equal((await serviceRequest(serviceSocket(root), { type: 'status' })).service.state, 'stopped')
})

test('Web status subscriptions push lifecycle changes and closing a subscription preserves the gateway', async t => {
  const { root } = await fixture(t)
  const manager = await serveGlobalSupervisor({ dataRoot: root })
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }) })
  const watcher = subscribe(t, webSocket(root))
  await watcher.wait(frame => frame.ok === true && frame.value.web?.state === 'stopped')
  const running = await serviceRequest(webSocket(root), { type: 'start-web', password: 'fixture', port: 0 })
  const pushed = await watcher.wait(frame => frame.value?.web?.state === 'running')
  assert.equal(pushed.value.web.instanceId, running.web.instanceId)
  watcher.socket.destroy()
  assert.equal((await serviceRequest(webSocket(root), { type: 'status' })).web.instanceId, running.web.instanceId)
  assert.equal((await fetch(running.web.url)).status, 503)
})

test('subscriptions retain private socket ownership and permission checks', async t => {
  const { root } = await fixture(t)
  const manager = await serveGlobalSupervisor({ dataRoot: root })
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }) })
  await chmod(webSocket(root), 0o644)
  await assert.rejects(watchServiceStatus(webSocket(root), () => {}, () => {}), /Unsafe DSH service socket/)
})

test('an older manager is reported without polling or changing its lifecycle', { timeout: 3000 }, async t => {
  const { root } = await fixture(t)
  const directory = join(root, 'control')
  await mkdir(directory, { mode: 0o700 })
  const path = join(directory, 'socket')
  let requests = 0
  const server = createServer(socket => socket.once('data', () => {
    requests++
    socket.end(JSON.stringify({ ok: false, error: 'Unsupported DSH service command' }) + '\n')
  }))
  await new Promise(accept => server.listen(path, accept))
  await chmod(path, 0o600)
  t.after(async () => { await new Promise(accept => server.close(accept)); await rm(root, { recursive: true, force: true }) })
  const failure = Promise.withResolvers()
  const connection = await watchServiceStatus(path, () => assert.fail('old manager must not publish a snapshot'), failure.resolve)
  t.after(() => connection.close())
  assert.match((await failure.promise).message, /任务结束后/)
  await delay(30)
  assert.equal(requests, 1, 'incompatibility must never enable a polling fallback')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { WorkflowDesktopConnection } from './desktop-client.mjs'
import { SERVICE_PROTOCOL, serviceSocket, privateDirectory } from './service-control.mjs'

const version = '0.2.1-alpha.5'
const unavailable = 'DSH 服务未启动或暂不可用，请先启动 DSH 服务。'
const incompatible = 'DSH 服务接入版本不兼容，请使用配套应用。'

// This fixture replaces only the local manager connection boundary. Actual Host,
// Electron, and private Platform integration remain native scenario obligations.
async function connectionFixture(t) {
  const root = await mkdtemp('/private/tmp/dsh-s02-connection-')
  const dataRoot = join(root, 'data'), runtime = join(root, 'runtime')
  await chmod(root, 0o700)
  await mkdir(dataRoot, { mode: 0o700 })
  await mkdir(join(runtime, 'node_modules/@deepseek-ai/dsh'), { recursive: true })
  await writeFile(join(runtime, 'node_modules/@deepseek-ai/dsh/package.json'), JSON.stringify({ version }))
  const socketPath = serviceSocket(dataRoot)
  await privateDirectory(dirname(socketPath))
  const requests = [], failures = [], sessions = [], sockets = new Set()
  let mode = 'ready', refused = 0
  const original = { instanceId: 's02-original-lease', pid: process.pid, runtimeVersion: version,
    url: 'http://127.0.0.1:12345/?token=public-fixture', injections: [] }
  const grant = { token: 's02-public-fixture-grant', userId: 's02-fixture', origin: 'http://127.0.0.1:12346' }
  const server = createServer(socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket))
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', chunk => {
      buffer += chunk
      if (!buffer.includes('\n')) return
      const request = JSON.parse(buffer.slice(0, buffer.indexOf('\n')))
      requests.push(request)
      if (request.type === 'connect-desktop' && ['unavailable', 'incompatible', 'gone'].includes(mode)) {
        refused++
        socket.end(JSON.stringify({ ok: false, error: mode === 'incompatible' ? incompatible : unavailable }) + '\n')
        return
      }
      const connection = { ...original, ...(mode === 'replaced' ? { instanceId: 's02-new-lease' } : {}) }
      const service = { state: mode === 'gone' ? 'failed' : 'running', ready: mode === 'ready',
        instanceId: mode === 'gone' ? null : original.instanceId,
        pid: mode === 'gone' ? null : original.pid, runtimeVersion: version,
        message: mode === 'unavailable' ? 'temporary health unavailable' : null }
      socket.end(JSON.stringify({ ok: true, value: { protocol: SERVICE_PROTOCOL, service,
        ...(request.type === 'connect-desktop' ? { connection,
          platformSession: mode === 'replaced' ? { ...grant, token: 's02-new-lease-grant' } : grant } : {}) } }) + '\n')
    })
  })
  const connection = new WorkflowDesktopConnection(null, runtime, null, null,
    { DSH_WORKFLOW_DATA_ROOT: dataRoot }, error => failures.push(error), null, null, value => sessions.push(value))
  t.after(async () => {
    await connection.stop()
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => server.close(resolve))
    await rm(dirname(socketPath), { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve) })
  await chmod(socketPath, 0o600)
  return { connection, original, grant, requests, failures, sessions,
    get refused() { return refused }, set mode(value) { mode = value } }
}

async function observed(predicate) {
  const deadline = Date.now() + 3500
  while (!predicate() && Date.now() < deadline) await delay(10)
  assert.ok(predicate(), 'expected bounded local connection observation')
}

function readOnly(fixture) {
  assert.ok(fixture.requests.length > 0)
  assert.ok(fixture.requests.every(request => ['connect-desktop', 'status'].includes(request.type)))
  assert.ok(fixture.requests.filter(request => request.type === 'connect-desktop')
    .every(request => request.runtimeVersion === version))
}

test('temporary same-instance unavailability preserves the client and private session, then recovers', { timeout: 6000 }, async t => {
  const fixture = await connectionFixture(t)
  await fixture.connection.start()
  fixture.mode = 'unavailable'
  await observed(() => fixture.refused > 0)
  await delay(50)
  assert.equal(fixture.connection.closed, false, 'uncertain readiness must not permanently fail an existing client')
  assert.equal(fixture.failures.length, 0)
  assert.deepEqual(fixture.sessions, [fixture.grant], 'retain the original private session while its same identity remains live')
  fixture.mode = 'ready'
  await observed(() => fixture.sessions.length >= 2)
  assert.deepEqual(fixture.sessions.at(-1), fixture.grant)
  assert.equal(fixture.failures.length, 0)
  readOnly(fixture)
})

test('startup unavailable or incompatible connections remain explicit errors and never start a Host', { timeout: 6000 }, async t => {
  const fixture = await connectionFixture(t)
  fixture.mode = 'unavailable'
  await assert.rejects(fixture.connection.start(), error => error.message === unavailable)
  fixture.mode = 'incompatible'
  await assert.rejects(fixture.connection.start(), error => error.message === incompatible)
  assert.equal(fixture.sessions.length, 0)
  readOnly(fixture)
})

test('a missing established instance fails and clears its private session without starting a Host', { timeout: 6000 }, async t => {
  const fixture = await connectionFixture(t)
  await fixture.connection.start()
  fixture.mode = 'gone'
  await observed(() => fixture.failures.length === 1)
  assert.equal(fixture.connection.closed, true)
  assert.equal(fixture.sessions.at(-1), null)
  readOnly(fixture)
})

test('a replacement lease or incompatible version never receives the old private session', { timeout: 6000 }, async t => {
  for (const mode of ['replaced', 'incompatible']) {
    const fixture = await connectionFixture(t)
    await fixture.connection.start()
    fixture.mode = mode
    await observed(() => fixture.failures.length === 1)
    assert.equal(fixture.connection.closed, true)
    assert.deepEqual(fixture.sessions, [fixture.grant, null])
    readOnly(fixture)
  }
})

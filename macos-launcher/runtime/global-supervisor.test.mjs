import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { WEB_PORT, startGlobalSupervisor } from './global-supervisor.mjs'

async function dataRoot(t) {
  const root = await mkdtemp('/private/tmp/dsh-global-control-')
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

async function availablePort(port = 0) {
  const listener = net.createServer()
  await new Promise((accept, reject) => { listener.once('error', reject); listener.listen(port, '127.0.0.1', accept) })
  const actual = listener.address().port
  await new Promise(accept => listener.close(accept))
  return actual
}

test('the single Web entry uses the previous stable port', () => assert.equal(WEB_PORT, 33080))

test('repeated opens share one actual Web listener without starting a missing DSH service', async t => {
  const root = await dataRoot(t)
  const history = JSON.stringify([{ id: 'old', path: root }])
  await writeFile(join(root, 'catalogs.json'), history)
  const supervisor = await startGlobalSupervisor({ dataRoot: root, host: '127.0.0.1', port: 0, password: 'fixture' })
  t.after(() => supervisor.close())
  const first = supervisor.global().instanceId
  const entries = await Promise.all(Array.from({ length: 10 }, () => supervisor.openGlobal()))
  assert.equal(new Set(entries).size, 1)
  assert.equal(supervisor.global().instanceId, first)
  assert.match(first, /^[a-f0-9-]{36}$/)
  assert.equal(supervisor.global().state, 'running')
  assert.equal(supervisor.global().gatePort, supervisor.port)
  assert.equal(supervisor.global().serviceInstanceId, null)
  const response = await fetch(supervisor.localUrl)
  assert.equal(response.status, 503)
  assert.match(await response.text(), /DSH 服务不可用/)
  assert.equal(await readFile(join(root, 'catalogs.json'), 'utf8'), history)
  await assert.rejects(stat(join(root, 'global/.dsh-workflow/service/manager.json')), { code: 'ENOENT' })
})

test('stopping and reopening releases and reuses the actual configured Web port', async t => {
  const root = await dataRoot(t)
  const port = await availablePort()
  const supervisor = await startGlobalSupervisor({ dataRoot: root, host: '127.0.0.1', port, password: 'fixture' })
  t.after(() => supervisor.close())
  const first = supervisor.global().instanceId
  await supervisor.stopGlobal()
  assert.equal(supervisor.global().state, 'stopped')
  assert.equal(supervisor.global().instanceId, null)
  assert.equal(await availablePort(port), port)
  await Promise.all([supervisor.openGlobal(), supervisor.openGlobal()])
  assert.equal(supervisor.port, port)
  assert.equal(supervisor.global().state, 'running')
  assert.notEqual(supervisor.global().instanceId, first)
  const response = await fetch(supervisor.localUrl)
  assert.equal(response.status, 503)
  await response.body?.cancel()
})

test('cancelling actual Web startup leaves its configured port free', async t => {
  const root = await dataRoot(t)
  const port = await availablePort()
  const controller = new AbortController()
  const starting = startGlobalSupervisor({ dataRoot: root, host: '127.0.0.1', port, password: 'fixture', signal: controller.signal })
  controller.abort()
  await assert.rejects(starting, { name: 'AbortError' })
  assert.equal(await availablePort(port), port)
})

test('aborting a running Web entry closes its actual listener without creating a Host', async t => {
  const root = await dataRoot(t)
  const controller = new AbortController()
  const supervisor = await startGlobalSupervisor({ dataRoot: root, host: '127.0.0.1', port: 0, password: 'fixture', signal: controller.signal })
  const port = supervisor.port
  controller.abort()
  await supervisor.close()
  assert.equal(await availablePort(port), port)
  await assert.rejects(stat(join(root, 'global/.dsh-workflow/desktop/desktop-host.json')), { code: 'ENOENT' })
})

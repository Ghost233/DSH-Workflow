import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WEB_PORT, startGlobalSupervisor } from './global-supervisor.mjs'

async function dataRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-global-control-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test('the single Web entry uses the previous stable port', () => assert.equal(WEB_PORT, 33080))

test('repeated opens share one Desktop connection and leave directory history untouched', async t => {
  const root = await dataRoot(t)
  const history = JSON.stringify([{ id: 'old', path: root }])
  await writeFile(join(root, 'catalogs.json'), history)
  let started = 0, needed = 0, rotated
  const supervisor = await startGlobalSupervisor({ dataRoot: root, port: 0, password: 'fixture',
    onDesktopNeeded: () => needed++,
    attachDesktop: ({ globalRoot, gatewayHost, gatewayPort, password, onReady, onGateway, signal }) => {
      started++
      assert.equal(globalRoot, join(root, 'global'))
      assert.equal(gatewayHost, '0.0.0.0')
      assert.equal(gatewayPort, 0)
      assert.equal(password, 'fixture')
      onGateway({ port: 41999, lanUrls: [], setPassword(value) { rotated = value } })
      onReady({ port: 45678 })
      return new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    } })
  t.after(() => supervisor.close())
  const entries = await Promise.all(Array.from({ length: 10 }, () => supervisor.openGlobal()))
  assert.deepEqual([...new Set(entries)], ['http://127.0.0.1:41999/'])
  assert.equal(started, 1)
  assert.equal(needed, 1)
  assert.equal(supervisor.global().gatePort, supervisor.port)
  const firstInstance = supervisor.global().instanceId
  assert.match(firstInstance, /^[a-f0-9-]{36}$/)
  assert.ok(Number.isFinite(Date.parse(supervisor.global().observedAt)))
  for (const name of ['catalogs', 'createCatalog', 'attachCatalog', 'openCatalog']) assert.equal(supervisor[name], undefined)
  supervisor.setPassword('changed'); assert.equal(rotated, 'changed')
  await supervisor.stopGlobal()
  assert.equal(supervisor.global().state, 'stopped')
  assert.equal(supervisor.global().instanceId, null)
  assert.equal(await readFile(join(root, 'catalogs.json'), 'utf8'), history)
})

test('a stopped Web connection reconnects without allocating a second exposed port', async t => {
  const root = await dataRoot(t)
  let attempts = 0
  const supervisor = await startGlobalSupervisor({ dataRoot: root, port: 41998, password: 'fixture',
    attachDesktop: ({ gatewayPort, onGateway, onReady, signal }) => {
      attempts++
      assert.equal(gatewayPort, 41998)
      onGateway({ port: gatewayPort, lanUrls: [], setPassword() {} })
      onReady({ port: 45678 })
      return new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    } })
  t.after(() => supervisor.close())
  const firstInstance = supervisor.global().instanceId
  await supervisor.stopGlobal()
  await Promise.all([supervisor.openGlobal(), supervisor.openGlobal()])
  assert.equal(attempts, 2)
  assert.equal(supervisor.global().state, 'running')
  assert.notEqual(supervisor.global().instanceId, firstInstance)
})

test('cancelling while Desktop is starting closes the pending Web startup', async t => {
  const root = await dataRoot(t)
  const controller = new AbortController()
  const started = Promise.withResolvers()
  const task = startGlobalSupervisor({ dataRoot: root, port: 0, password: 'fixture', signal: controller.signal,
    attachDesktop: ({ signal }) => new Promise(resolve => {
      signal.addEventListener('abort', resolve, { once: true })
      started.resolve()
    }) })
  const rejected = assert.rejects(task, /Web connection stopped/)
  await started.promise
  controller.abort()
  await rejected
})

test('an unsafe Desktop receipt fails without launching another backend', async t => {
  const root = await dataRoot(t)
  const dir = join(root, 'global/.dsh-workflow/desktop')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'desktop-host.json'), '{}', { mode: 0o644 })
  await assert.rejects(startGlobalSupervisor({ dataRoot: root, password: 'fixture', port: 0,
    onDesktopNeeded: () => assert.fail('unsafe receipts must not relaunch Desktop') }), /Unsafe Desktop Host receipt/)
})

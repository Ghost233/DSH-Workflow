import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { copyProjectIntegration } from '../project-resources.mjs'
import { serveManager } from './service-manager.mjs'
import { serviceRequest, serviceSocket } from './service-control.mjs'
import { connectModelRpc } from './model-rpc.mjs'

test('an isolated packaged daily Host owns Codex authorization and retains its grant after restart', { timeout: 90_000 }, async t => {
  const artifact = process.env.DSH_SERVICE_TEST_RESOURCES
  if (!artifact) throw new Error('DSH_SERVICE_TEST_RESOURCES must identify the packaged Web runtime')
  const root = await mkdtemp(join(tmpdir(), 'station-codex-host-'))
  const resources = join(root, 'resources'), home = join(root, 'home'), dataRoot = join(root, 'data')
  const profile = join(home, 'profiles/desktop')
  await mkdir(resources); await mkdir(profile, { recursive: true }); await mkdir(dataRoot, { recursive: true, mode: 0o700 })
  await copyProjectIntegration(resolve('.'), join(resources, 'workflow'))
  for (const name of ['node', 'node_modules', 'plugins', 'plugin-payload.json']) await symlink(join(artifact, name), join(resources, name))
  await cp(join(artifact, 'package.json'), join(resources, 'package.json'))
  const require = createRequire(join(resources, 'node_modules/@deepseek-ai/dsh/package.json'))
  const boot = require('@deepseek-ai/dsh-app-boot')
  const templates = boot.PROFILE_TEMPLATES ?? require('@deepseek-ai/dsh-official-bundles').PROFILE_TEMPLATES
  boot.initProfile(profile, templates.web.bundles)
  const probe = join(root, 'credential-probe.mjs')
  await writeFile(probe, `
export const name = 'fixture-codex-credential-probe'
export const inject = ['credentials', 'connection', 'webServer']
export function apply(ctx) {
  ctx.connection.fetch.register({ path: '/api/fixture-codex/write', methods: ['POST'], requestBody: 'buffered', fetch: async () => {
    await ctx.credentials.modifyRecord('llm-pi-ai/openai-codex', async () => ({
      kind: 'grant', payload: { type: 'oauth', access: 'test-access', refresh: 'test-refresh', expires: 1, accountId: 'first' },
    }))
    return Response.json({ saved: true })
  } })
  ctx.connection.fetch.register({ path: '/api/fixture-codex/refresh', methods: ['POST'], requestBody: 'buffered', fetch: async () => {
    await ctx.credentials.modifyRecord('llm-pi-ai/openai-codex', async current => ({
      kind: 'grant', payload: { ...current.payload, refresh: 'refreshed-fixture' },
    }))
    return Response.json({ refreshed: true })
  } })
  ctx.connection.fetch.register({ path: '/api/fixture-codex/check', methods: ['POST'], requestBody: 'buffered', fetch: async () => {
    const current = await ctx.credentials.readRecord('llm-pi-ai/openai-codex')
    return Response.json({ refreshed: current?.payload?.refresh === 'refreshed-fixture' })
  } })
}
`)
  await writeFile(join(profile, 'cordis.patch.yml'), JSON.stringify([
    { id: 'workflow-mcp-codegraph', disabled: true },
    { id: 'workspace-controller', config: { documentsDirectory: join(root, 'documents') } },
    { id: 'session-telemetry-otel', disabled: true }, { id: 'desktop-product-telemetry', disabled: true },
    { id: 'product-analytics', disabled: true }, { id: 'web-runtime', config: { openBrowser: false, printUrl: false } },
    { insert: [{ id: 'fixture-codex-credential-probe', name: pathToFileURL(probe).href }] },
  ]))
  const manager = await serveManager({ dataRoot, resources, home, loginShells: ['/bin/sh'], loginEnvironment: {
    HOME: root, ZDOTDIR: root, DSH_AGENTS_HOME: join(root, 'agents'), DSH_TELEMETRY_DISABLED: '1',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', TMPDIR: root, PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  } })
  assert.ok(manager)
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }) })
  const socket = serviceSocket(dataRoot)
  async function start() {
    const started = await serviceRequest(socket, { type: 'start-service', permissionMode: 'workspace-write' }, 45_000)
    assert.equal(started.service.ready, true)
    return connectModelRpc(dataRoot, resources)
  }
  async function stop() {
    const inspection = (await serviceRequest(socket, { type: 'inspect-stop', action: 'stop' })).stop
    assert.ok(inspection.operationId)
    const stopped = await serviceRequest(socket, { type: 'stop-service', operationId: inspection.operationId, confirmed: true }, 30_000)
    assert.equal(stopped.service.state, 'stopped')
  }
  let rpc = await start()
  const call = (method, args = {}) => rpc.codex(method, args)
  const url = (await serviceRequest(socket, { type: 'connect-web', runtimeVersion: '0.2.2-rc.1' })).connection.url
  const login = await fetch(url, { redirect: 'manual' })
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  await login.arrayBuffer()
  const statusResponse = await fetch(new URL('/api/station-codex-auth/status', url), {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}',
  })
  assert.equal(statusResponse.status, 200)
  assert.deepEqual((await statusResponse.json()).value, { available: true, configured: false, inFlight: false, accounts: [] })
  assert.deepEqual(await call('status'), { available: true, configured: false, inFlight: false, accounts: [] })
  const unauthenticated = await fetch(new URL('/api/station-codex-auth/status', url), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(3000),
  })
  assert.equal(unauthenticated.status, 401)
  const { id } = await call('start')
  const events = [], deadline = Date.now() + 10_000
  do { events.push(...(await call('poll', { id })).events); if (events.some(event => event.type === 'open')) break; await delay(100) } while (Date.now() < deadline)
  assert.ok(events.some(event => event.type === 'open'))
  await call('cancel', { id })
  let result
  do { result = await call('poll', { id }); if (result.done) break; await delay(100) } while (Date.now() < deadline)
  assert.equal(result.done, true)
  assert.ok(result.events.some(event => event.type === 'cancelled'))
  assert.equal((await call('status')).configured, false)
  const written = await fetch(new URL('/api/fixture-codex/write', url), { method: 'POST', headers: { cookie } })
  assert.equal(written.status, 200)
  const saved = await call('status')
  assert.equal(saved.configured, true)
  assert.equal(JSON.stringify(saved).includes('test-access'), false)
  const second = await call('import', { name: '测试账号', record: { kind: 'grant', payload: {
    type: 'oauth', access: 'second-access', refresh: 'second-refresh', expires: 1, accountId: 'second',
  } } })
  assert.equal((await call('status')).accounts.length, 2)
  assert.equal((await fetch(new URL('/api/fixture-codex/refresh', url), { method: 'POST', headers: { cookie } })).status, 200)
  await call('select', { id: second.id })
  assert.equal((await call('status')).accounts.find(row => row.id === second.id).active, true)
  await call('select', { id: 'existing' })
  assert.deepEqual(await (await fetch(new URL('/api/fixture-codex/check', url), { method: 'POST', headers: { cookie } })).json(), { refreshed: true })
  await stop()
  rpc = await start()
  const restored = await call('status')
  assert.equal(restored.available, true)
  assert.equal(restored.configured, true)
  assert.deepEqual(restored.accounts.map(row => [row.id, row.active]), [['existing', true], [second.id, false]])
  await stop()
})

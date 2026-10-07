import '../../scripts/harness-test-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const { default: monitorPlugin, apply } = await import('../src/agent-monitor-plugin.mjs')

const req = createRequire(new URL('../../deepseek-harness/apps/cli/package.json', import.meta.url))
const { boot, initProfile, readProfilePatches } = req('@deepseek-ai/dsh-app-boot')
const { LlmAdapter, createUserMessage } = req('@deepseek-ai/dsh-llm')
const modules = Object.fromEntries([
  ['editor', 'dsh-config-editor'], ['settings', 'dsh-settings'], ['llm', 'dsh-llm'],
  ['sessions', 'dsh-session'], ['projections', 'dsh-session-projection'], ['prompt', 'dsh-system-prompt'],
  ['tools', 'dsh-tools'], ['agents', 'dsh-agent'], ['loop', 'dsh-agent-loop'], ['web', 'dsh-host-webserver'],
].map(([key, name]) => [key, req(`@deepseek-ai/${name}`).default]))

const until = async condition => {
  const end = Date.now() + 3000
  while (!condition()) {
    if (Date.now() > end) throw new Error('fixture did not reach expected state')
    await new Promise(resolve => setTimeout(resolve, 1))
  }
}

async function configuredHost(t) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-monitor-settings-'))
  const dir = join(home, 'profiles', 'fixture')
  initProfile(dir, ['monitor-test-bundle'])
  const patchPath = join(dir, 'cordis.patch.yml'), base = join(dir, 'cordis.yml')
  await writeFile(patchPath, '[]\n'); await writeFile(base, '[]\n')
  let time = 0, release, options
  const notices = []
  const entries = Object.keys(modules).map(key => ({ id: key, name: `cordis:${key}`,
    ...key === 'loop' ? { config: { agents: [] } } : key === 'web' ? { config: { host: '127.0.0.1', port: 0 } } : {} }))
  entries.push({ id: 'monitor', name: 'cordis:monitor', config: { directory: join(home, 'journal') } })
  const bundle = join(dir, 'node_modules', 'monitor-test-bundle')
  await mkdir(bundle, { recursive: true })
  await writeFile(join(home, 'package.json'), '{"name":"monitor-test-installation"}\n')
  await writeFile(join(bundle, 'package.json'), JSON.stringify({ name: 'monitor-test-bundle', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }))
  await writeFile(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: entries }]))
  const profile = { name: 'monitor-fixture', dir, patchPath, installAnchor: join(home, 'package.json'),
    cwd: home, home, startedBundles: ['monitor-test-bundle'], overlays: [], telemetryDisabledEnv: undefined }
  const ctx = await boot('monitor-fixture', base, readProfilePatches('monitor-fixture', profile), c => {
    c.provide('profileContext', profile)
    c.provide('appReady', { onReady: listener => { listener(); return () => {} } })
    Object.assign(c.loader.builtins, modules, { monitor: { ...monitorPlugin, apply: (child, config) => apply(child, config, {
      now: () => time, notify: alert => notices.push(alert),
    }) } })
  })
  class Adapter extends LlmAdapter {
    resolveModel(provider, model) { return Promise.resolve({ provider, id: model, name: model }) }
    async *stream(request) {
      options = request
      await new Promise(resolve => { release = resolve })
      yield { type: 'text-delta', index: 0, text: 'done' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['fixture'], new Adapter())
  const handle = await ctx.agents.create({ sessionId: 'settings-agent', agentOptions: { provider: 'fixture', model: 'model' } })
  t.after(async () => {
    release?.(); await handle.dispose(); await ctx.fiber.dispose(); await rm(home, { recursive: true, force: true })
  })
  return { ctx, handle, notices, patchPath, home, url: `http://127.0.0.1:${ctx.webServer.port}`,
    setTime(value) { time = value },
    get request() { return options },
    async start() {
      handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'work' }] }))
      await until(() => options)
    },
    async at(value) { time = value; await ctx.get('agentMonitor').tick(); await ctx.get('agentMonitor').flush() },
  }
}

test('standard Settings saves custom check interval and threshold which immediately govern a native pending request', async t => {
  const f = await configuredHost(t)
  const descriptor = f.ctx.settings.describe().find(row => row.ns === 'monitor')
  assert.ok(descriptor, 'monitor appears in standard Settings')
  assert.equal(descriptor.value.checkIntervalMs, 60_000)
  assert.equal(descriptor.value.noOutputThreshold, 5)
  await f.ctx.settings.update('monitor', { checkIntervalMs: 1000, noOutputThreshold: 2 })
  await f.start()
  await f.at(999)
  assert.equal(f.notices.length, 0)
  await f.at(1000)
  assert.equal(f.notices.length, 0)
  await f.at(2000)
  assert.equal(f.notices.length, 1)
  assert.equal(f.notices[0].kind, 'no-output')
  assert.equal(f.request.signal.aborted, false)
  assert.match(await readFile(f.patchPath, 'utf8'), /checkIntervalMs: 1000/)
  assert.match(await readFile(f.patchPath, 'utf8'), /noOutputThreshold: 2/)
})

test('monitor page lets the user save its controls through standard Settings and view the resulting alert', async t => {
  const f = await configuredHost(t)
  const page = await (await fetch(`${f.url}/agent-monitor`)).text()
  assert.match(page, /name="checkIntervalMs"/)
  assert.match(page, /name="noOutputThreshold"/)
  const before = await (await fetch(`${f.url}/agent-monitor/api/status`)).json()
  const response = await fetch(`${f.url}/agent-monitor/api/settings`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ checkIntervalMs: 500, noOutputThreshold: 1,
      expectedRevision: before.configuration.revision }) })
  assert.equal(response.status, 200, await response.text())
  assert.equal(f.ctx.settings.describe().find(row => row.ns === 'monitor').value.checkIntervalMs, 500)
  await f.start()
  await f.at(500)
  const status = await (await fetch(`${f.url}/agent-monitor/api/status`)).json()
  assert.equal(status.alerts[0].agentId, 'settings-agent')
  assert.equal(status.alerts[0].attemptId, 'settings-agent:1')
  assert.equal(status.alerts[0].kind, 'no-output')
  assert.equal(status.alerts[0].evidence.consecutiveChecks, 1)
  assert.equal(status.configuration.value.noOutputThreshold, 1)
  const journal = await f.ctx.get('agentMonitor').journal()
  assert.equal(journal[0].attemptId, 'settings-agent:1')
  assert.equal(f.notices[0].kind, 'no-output')
})

test('changing the interval in standard Settings reschedules automatic checks without manual monitor calls', async t => {
  const f = await configuredHost(t)
  await f.ctx.settings.update('monitor', { checkIntervalMs: 10, noOutputThreshold: 2 })
  await f.start()
  f.setTime(10)
  await until(() => f.ctx.get('agentMonitor').snapshot().agents[0]?.noOutputCount === 1)
  assert.equal(f.notices.length, 0)
  f.setTime(20)
  await until(() => f.notices.length === 1)
  assert.equal(f.notices[0].at, 20)
  assert.equal(f.notices[0].evidence.consecutiveChecks, 2)
})

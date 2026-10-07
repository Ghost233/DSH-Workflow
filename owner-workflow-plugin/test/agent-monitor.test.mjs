import '../../scripts/harness-test-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
const { default: monitorPlugin, apply } = await import('../src/agent-monitor-plugin.mjs')
const { default: JevCenter } = await import('../src/jev-center-plugin.mjs')

const req = createRequire(new URL('../../deepseek-harness/apps/cli/package.json', import.meta.url))
const { boot, initProfile, readProfilePatches } = req('@deepseek-ai/dsh-app-boot')
const { LlmAdapter, createUserMessage } = req('@deepseek-ai/dsh-llm')
const modules = Object.fromEntries([
  ['editor', 'dsh-config-editor'], ['settings', 'dsh-settings'], ['llm', 'dsh-llm'],
  ['sessions', 'dsh-session'], ['projections', 'dsh-session-projection'], ['prompt', 'dsh-system-prompt'],
  ['tools', 'dsh-tools'], ['agents', 'dsh-agent'], ['loop', 'dsh-agent-loop'], ['web', 'dsh-host-webserver'],
  ['credentials', 'dsh-credentials-local'],
].map(([key, name]) => [key, req(`@deepseek-ai/${name}`).default]))

const until = async condition => {
  const end = Date.now() + 3000
  while (!condition()) {
    if (Date.now() > end) throw new Error('fixture did not reach expected state')
    await new Promise(resolve => setTimeout(resolve, 1))
  }
}

async function configuredHost(t, options = {}) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-monitor-settings-'))
  const dir = join(home, 'profiles', 'fixture')
  initProfile(dir, ['monitor-test-bundle'])
  const patchPath = join(dir, 'cordis.patch.yml'), base = join(dir, 'cordis.yml')
  await writeFile(patchPath, '[]\n'); await writeFile(base, '[]\n')
  const modelCredentialRef = options.modelCredentialRef
  let time = 0, release, request, respond = options.respond
  const notices = [], requests = [], streams = new Map()
  const upstream = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    const received = { path: req.url, body: JSON.parse(Buffer.concat(chunks).toString()) }
    requests.push(received)
    res.setHeader('content-type', 'application/json')
    if (respond) respond(received, res)
    else res.end(JSON.stringify({ model: 'jev-semantic-version', answers: { progress: { type: 'choice', choice: 'anomaly',
      probabilities: { anomaly: 0.34, normal: 0.33, unknown: 0.33 }, confidence: 0.1 } }, usage: { input_tokens: 5, output_tokens: 1 } }))
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const entries = Object.keys(modules).map(key => ({ id: key, name: `cordis:${key}`,
    ...key === 'loop' ? { config: { agents: [] } } : key === 'web' ? { config: { host: '127.0.0.1', port: 0 } }
      : key === 'credentials' ? { config: { path: join(home, '.credentials.yaml'), watch: false } } : {} }))
  entries.push({ id: 'jev-center', name: 'cordis:jev-center' })
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
    Object.assign(c.loader.builtins, modules, { 'jev-center': JevCenter, monitor: { ...monitorPlugin, apply: (child, config) => apply(child, config, {
      now: () => time, notify: alert => notices.push(alert),
    }) } })
  })
  class Adapter extends LlmAdapter {
    resolveModel(provider, model) { return Promise.resolve({ provider, id: model, name: model }) }
    async *stream(options) {
      request = options
      const stream = { request: options, chunks: [], complete: false, delivered: 0 }
      streams.set(options.model, stream)
      const abort = () => { stream.complete = true; stream.next?.() }
      options.signal.addEventListener('abort', abort, { once: true })
      if (options.model === 'model') release = () => {
        stream.chunks.push({ type: 'text-delta', index: 0, text: 'done' }, { type: 'finish', reason: { kind: 'stop' } })
        stream.complete = true; stream.next?.()
      }
      try {
        if (modelCredentialRef) {
          const credential = await ctx.credentials.resolve(modelCredentialRef)
          stream.credentialSource = credential?.source
          stream.chunks.push({ type: 'reasoning-delta', index: 0,
            text: `safe isolated model analysis\n${credential?.value}\nstill making observations` })
        }
        while (!stream.complete || stream.chunks.length) {
          if (!stream.chunks.length && !stream.complete) await new Promise(resolve => { stream.next = resolve })
          for (const chunk of stream.chunks.splice(0)) { yield chunk; stream.delivered++ }
        }
      } finally { options.signal.removeEventListener('abort', abort) }
    }
  }
  ctx.llm.registerAdapter(['fixture'], new Adapter())
  const handle = await ctx.agents.create({ sessionId: 'settings-agent', agentOptions: { provider: 'fixture', model: 'model' } })
  t.after(async () => {
    release?.()
    for (const stream of streams.values()) { stream.complete = true; stream.next?.() }
    await handle.dispose(); await ctx.fiber.dispose()
    upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); await rm(home, { recursive: true, force: true })
  })
  return { ctx, handle, notices, requests, streams, patchPath, home, url: `http://127.0.0.1:${ctx.webServer.port}`,
    async saveEngine(patch = {}) {
      await ctx.credentials.set('JEV_MONITOR_TEST_KEY', 'semantic-secret-key')
      await ctx.settings.update('jev-center', { engines: [{ url: `http://127.0.0.1:${upstream.address().port}`,
        upstreamModel: 'jev-upstream', modelName: 'quick', credentialRef: 'JEV_MONITOR_TEST_KEY', enabled: true, ...patch }] })
    },
    respond(callback) { respond = callback },
    async send(...chunks) {
      const stream = streams.get('model'), target = stream.delivered + chunks.length
      stream.chunks.push(...chunks); stream.next?.()
      await until(() => stream.delivered >= target)
    },
    async sendTo(model, ...chunks) {
      const stream = streams.get(model), target = stream.delivered + chunks.length
      stream.chunks.push(...chunks); stream.next?.()
      await until(() => stream.delivered >= target)
    },
    async finish() { release?.(); await handle.agent.whenIdle(); await ctx.get('agentMonitor').flush() },
    setTime(value) { time = value },
    get request() { return request },
    async start() {
      handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'work' }] }))
      await until(() => request)
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

test('live interval changes keep rounds distinct while the same pending request retains its consecutive count', async t => {
  const f = await configuredHost(t)
  await f.start()
  await f.at(60_001)
  assert.equal(f.ctx.get('agentMonitor').snapshot().agents[0].noOutputCount, 1)
  await f.ctx.settings.update('monitor', { checkIntervalMs: 30_000 })
  await f.at(90_000); await f.at(90_001)
  assert.equal(f.ctx.get('agentMonitor').snapshot().agents[0].noOutputCount, 2)
  await f.ctx.settings.update('monitor', { checkIntervalMs: 120_000 })
  await f.at(210_000); await f.at(210_001)
  assert.equal(f.ctx.get('agentMonitor').snapshot().agents[0].noOutputCount, 3)
  await f.ctx.settings.update('monitor', { checkIntervalMs: 500 })
  await f.at(210_500)
  assert.equal(f.ctx.get('agentMonitor').snapshot().agents[0].noOutputCount, 4)
  assert.equal(f.notices.length, 0)
  await f.at(211_000); await f.at(211_001)
  await f.at(211_500)
  assert.deepEqual(f.notices.map(alert => [alert.at, alert.evidence.consecutiveChecks]), [[211_000, 5], [211_500, 6]])
  assert.equal(f.request.signal.aborted, false)
})

test('prolonged native reasoning calls the named JEV center after three minutes and warns only after five explicit anomalous rounds', async t => {
  const f = await configuredHost(t)
  await f.saveEngine()
  await f.ctx.settings.update('monitor', { jevModelName: 'quick' })
  await f.start()
  await f.send({ type: 'reasoning-delta', index: 0, text: 'private repeated reasoning' })
  await f.at(179_999)
  assert.equal(f.requests.length, 0)
  await f.at(180_000)
  assert.equal(f.requests.length, 1)
  assert.equal(f.notices.length, 0)
  for (const minute of [4, 5, 6, 7, 8]) {
    f.setTime(minute * 60_000)
    await f.send({ type: 'reasoning-delta', index: 0, text: 'same thought again' })
    await f.at(minute * 60_000)
    await f.at(minute * 60_000 + 1)
  }
  assert.equal(f.requests.length, 6)
  assert.deepEqual(f.notices.map(alert => [alert.at, alert.kind]), [[420_000, 'semantic-stall'], [480_000, 'semantic-stall']])
  assert.equal(f.requests[0].path, '/v1/systemone')
  assert.equal(f.requests[0].body.model, 'jev-upstream')
  assert.equal(typeof f.requests[0].body.state, 'object')
  assert.equal(f.requests[0].body.questions.progress.type, 'choice')
  assert.equal(f.ctx.get('agentMonitor').snapshot().agents[0].noOutputCount, 0)
  assert.equal(f.request.signal.aborted, false)
  f.setTime(500_000)
  await f.send({ type: 'text-delta', index: 1, text: 'actual progress' })
  await f.at(600_000)
  assert.equal(f.requests.length, 6)
  assert.equal(f.notices.length, 2)
  const records = await f.ctx.get('agentMonitor').journal()
  assert.equal(records.filter(record => record.recordType === 'recovery' && record.kind === 'semantic-stall').length, 1)
  assert.doesNotMatch(JSON.stringify(records), /private repeated reasoning|same thought again|semantic-secret-key/)
  await f.finish()
})

test('normal, unknown and failed JEV judgments reset the independent semantic threshold, with recovery only on proven progress', async t => {
  const f = await configuredHost(t)
  await f.saveEngine()
  await f.ctx.settings.update('monitor', { jevModelName: 'quick', semanticWaitMs: 1000, semanticThreshold: 2, checkIntervalMs: 1000 })
  await f.start(); await f.send({ type: 'reasoning-delta', index: 0, text: 'continues thinking' })
  await f.at(1000); await f.at(2000)
  assert.equal(f.notices.filter(alert => alert.kind === 'semantic-stall').length, 1)
  const answer = choice => (_request, res) => res.end(JSON.stringify({ model: 'jev-different-version', answers: { progress: {
    type: 'choice', choice, probabilities: { anomaly: choice === 'anomaly' ? 0.6 : 0.2,
      normal: choice === 'normal' ? 0.6 : 0.2, unknown: choice === 'unknown' ? 0.6 : 0.2 }, confidence: 0.3,
  } }, usage: { input_tokens: 5, output_tokens: 1 } }))
  f.respond(answer('unknown'))
  await f.at(3000)
  let status = await (await fetch(`${f.url}/agent-monitor/api/status`)).json()
  assert.equal(status.agents[0].semanticCount, 0)
  assert.equal(status.engineAvailability.color, 'red')
  assert.equal(status.engineAvailability.code, 'JUDGMENT_UNKNOWN')
  assert.equal((await f.ctx.get('agentMonitor').journal()).filter(record => record.recordType === 'recovery').length, 0)
  f.respond(answer('normal'))
  await f.at(4000)
  assert.equal((await f.ctx.get('agentMonitor').journal()).filter(record => record.recordType === 'recovery').length, 1)
  f.respond(answer('anomaly'))
  await f.at(5000); await f.at(6000)
  assert.equal(f.notices.filter(alert => alert.kind === 'semantic-stall').length, 2)
  f.respond((_request, res) => { res.statusCode = 503; res.end('Authorization: Bearer should-not-appear') })
  await f.at(7000)
  status = await (await fetch(`${f.url}/agent-monitor/api/status`)).json()
  assert.equal(status.engineAvailability.color, 'red')
  assert.equal(status.engineAvailability.code, 'UPSTREAM_UNAVAILABLE')
  assert.match(status.engineAvailability.reason, /503/)
  assert.equal(status.agents[0].semanticCount, 0)
  assert.equal((await f.ctx.get('agentMonitor').journal()).filter(record => record.recordType === 'recovery').length, 1)
  assert.equal(f.notices.filter(alert => alert.kind === 'semantic-stall').length, 2)
  assert.doesNotMatch(JSON.stringify(status), /should-not-appear|Authorization|Bearer/)
  assert.equal(f.request.signal.aborted, false)
  await f.finish()
})

test('debug fragments are opt-in and redact credential values and authentication headers before persistence', async t => {
  const f = await configuredHost(t)
  assert.equal(f.ctx.settings.describe().find(row => row.ns === 'monitor').value.debugEvidence, false)
  await f.saveEngine()
  await f.ctx.settings.update('monitor', { jevModelName: 'quick', semanticWaitMs: 1000, semanticThreshold: 100, checkIntervalMs: 1000 })
  await f.start(); await f.send({ type: 'reasoning-delta', index: 0, text: 'private-debug-fragment-one' })
  await f.at(1000)
  assert.doesNotMatch(JSON.stringify(await f.ctx.get('agentMonitor').journal()), /private-debug-fragment-one/)
  await f.ctx.settings.update('monitor', { debugEvidence: true })
  await f.send({ type: 'reasoning-delta', index: 0, text: '\nprivate-debug-fragment-two\nAuthorization: Bearer semantic-secret-key\napi_key=opaque-private-key\nsemantic-secret-key' })
  await f.at(2000)
  const records = await f.ctx.get('agentMonitor').journal()
  assert.match(JSON.stringify(records), /private-debug-fragment-two/)
  assert.doesNotMatch(JSON.stringify(records), /semantic-secret-key|opaque-private-key|Authorization|Bearer/)
  assert.doesNotMatch(JSON.stringify(f.ctx.get('agentMonitor').snapshot()), /private-debug-fragment|semantic-secret-key|opaque-private-key|Authorization|Bearer/)
  await f.ctx.settings.update('monitor', { debugEvidence: false })
  await f.send({ type: 'reasoning-delta', index: 0, text: '\nprivate-debug-fragment-three' })
  await f.at(3000)
  assert.equal((await f.ctx.get('agentMonitor').journal()).at(-1).debugEvidence, undefined)
  await f.finish()
})

test('a complete public text block ends a thinking window and the next window excludes the previous reasoning', async t => {
  const f = await configuredHost(t)
  await f.saveEngine()
  await f.ctx.settings.update('monitor', { jevModelName: 'quick', semanticWaitMs: 1000, semanticThreshold: 1, checkIntervalMs: 1000 })
  await f.start(); await f.send({ type: 'reasoning-delta', index: 0, text: 'old-window-thinking' })
  await f.at(1000)
  f.setTime(1500)
  await f.send({ type: 'block-end', index: 1, block: { type: 'text', text: 'new evidence' } })
  await f.at(2000)
  assert.equal(f.requests.length, 1)
  assert.equal(f.ctx.get('agentMonitor').snapshot().agents[0].semanticCount, 0)
  f.setTime(2100)
  await f.send({ type: 'reasoning-delta', index: 2, text: 'new-window-thinking' })
  await f.at(3099)
  assert.equal(f.requests.length, 1)
  await f.at(3100)
  assert.equal(f.requests.length, 2)
  assert.equal(f.requests[1].body.state.reasoning, 'new-window-thinking')
  assert.equal((await f.ctx.get('agentMonitor').journal()).filter(record => record.recordType === 'recovery').length, 1)
  await f.finish()
})

test('a late judgment for a previously selected model cannot warn the current named monitor configuration', async t => {
  let pending
  const f = await configuredHost(t, { respond: (_request, response) => { pending = response } })
  await f.saveEngine()
  await f.ctx.settings.update('monitor', { jevModelName: 'quick', semanticWaitMs: 1000, semanticThreshold: 1, checkIntervalMs: 1000 })
  await f.start(); await f.send({ type: 'reasoning-delta', index: 0, text: 'still thinking' })
  const checking = f.at(1000)
  await until(() => pending)
  await f.saveEngine({ modelName: 'full' })
  await f.ctx.settings.update('monitor', { jevModelName: 'full' })
  pending.end(JSON.stringify({ model: 'jev-old-selection', answers: { progress: { type: 'choice', choice: 'anomaly',
    probabilities: { anomaly: 0.6, normal: 0.2, unknown: 0.2 }, confidence: 0.3 } }, usage: { input_tokens: 5, output_tokens: 1 } }))
  await checking
  assert.equal(f.notices.length, 0)
  assert.equal(f.ctx.get('agentMonitor').snapshot().agents[0].semanticCount, 0)
  f.respond((_request, response) => response.end(JSON.stringify({ model: 'jev-new-selection', answers: { progress: {
    type: 'choice', choice: 'anomaly', probabilities: { anomaly: 0.6, normal: 0.2, unknown: 0.2 }, confidence: 0.3,
  } }, usage: { input_tokens: 5, output_tokens: 1 } })))
  await f.at(2000)
  assert.equal(f.notices.length, 1)
  assert.equal(f.notices[0].evidence.modelName, 'full')
  assert.equal(f.notices[0].evidence.model, 'jev-new-selection')
  await f.finish()
})

test('a contradictory declared Choice is recorded as unknown rather than a confident anomaly', async t => {
  const f = await configuredHost(t, { respond: (_request, response) => response.end(JSON.stringify({ model: 'jev-version', answers: { progress: {
    type: 'choice', choice: 'anomaly', probabilities: { anomaly: 0.1, normal: 0.8, unknown: 0.1 }, confidence: 1,
  } }, usage: { input_tokens: 5, output_tokens: 1 } })) })
  await f.saveEngine()
  await f.ctx.settings.update('monitor', { jevModelName: 'quick', semanticWaitMs: 1000, semanticThreshold: 1, noOutputThreshold: 100, checkIntervalMs: 1000 })
  await f.start(); await f.send({ type: 'reasoning-delta', index: 0, text: 'thinking' })
  await f.at(1000)
  const judgment = f.ctx.get('agentMonitor').snapshot().agents[0].lastJudgment
  assert.equal(judgment.status, 'unknown')
  assert.equal(judgment.selection, 'choice-mismatch')
  assert.equal(judgment.declaredChoice, 'anomaly')
  assert.equal(judgment.argmax, 'normal')
  assert.equal(f.notices.length, 0)
  f.respond((_request, response) => response.end(JSON.stringify({ model: 'jev-version', answers: { progress: {
    type: 'choice', choice: 'anomaly', probabilities: { anomaly: 0.4, normal: 0.4, unknown: 0.2 }, confidence: 1,
  } }, usage: { input_tokens: 5, output_tokens: 1 } })))
  await f.at(2000)
  assert.equal(f.ctx.get('agentMonitor').snapshot().agents[0].lastJudgment.selection, 'tie')
  assert.equal(f.ctx.get('agentMonitor').snapshot().engineAvailability.code, 'JUDGMENT_UNKNOWN')
  assert.equal(f.notices.length, 0)
  await f.finish()
})

test('JEV timeout leaves deterministic monitoring and the native model request running without engine-fault notifications', async t => {
  const f = await configuredHost(t, { respond: () => {} })
  await f.saveEngine({ timeoutMs: 20 })
  await f.ctx.settings.update('monitor', { jevModelName: 'quick', semanticWaitMs: 1000, semanticThreshold: 1, noOutputThreshold: 1, checkIntervalMs: 1000 })
  await f.start(); await f.send({ type: 'reasoning-delta', index: 0, text: 'still thinking' })
  await f.at(1000); await f.at(2000)
  assert.equal(f.requests.length, 2)
  assert.deepEqual(f.notices.map(alert => alert.kind), ['no-output', 'no-output'])
  const state = f.ctx.get('agentMonitor').snapshot()
  assert.equal(state.engineAvailability.code, 'TIMEOUT')
  assert.equal(state.engineAvailability.color, 'red')
  assert.equal(state.agents[0].semanticCount, 0)
  assert.equal(f.streams.get('model').request.signal.aborted, false)
  assert.equal(f.handle.agent.status, 'running')
  await f.finish()
  assert.equal(f.handle.agent.status, 'idle')
})

test('actual model progress discards an in-flight JEV result without reporting a failure or blocking task completion', async t => {
  let pending
  const f = await configuredHost(t, { respond: (_request, response) => { pending = response } })
  await f.saveEngine()
  await f.ctx.settings.update('monitor', { jevModelName: 'quick', semanticWaitMs: 1000, semanticThreshold: 1, noOutputThreshold: 100, checkIntervalMs: 1000 })
  await f.start(); await f.send({ type: 'reasoning-delta', index: 0, text: 'thinking' })
  const checking = f.at(1000)
  await until(() => pending)
  await f.send({ type: 'tool-call-delta', index: 1, id: 'new-tool', name: 'inspect', argumentsDelta: '{}' })
  pending.end(JSON.stringify({ model: 'jev-late-version', answers: { progress: { type: 'choice', choice: 'anomaly',
    probabilities: { anomaly: 0.6, normal: 0.2, unknown: 0.2 }, confidence: 0.3 } }, usage: { input_tokens: 5, output_tokens: 1 } }))
  await checking
  assert.equal(f.notices.length, 0)
  assert.equal(f.ctx.get('agentMonitor').snapshot().agents[0].semanticCount, 0)
  assert.equal(f.ctx.get('agentMonitor').snapshot().diagnostics.length, 0)
  assert.equal(f.streams.get('model').request.signal.aborted, false)
})

test('main and native spawned child semantic states remain independent while sharing one selected JEV model', async t => {
  const f = await configuredHost(t, { respond: (request, response) => {
    const choice = request.body.state.reasoning.includes('child repetition') ? 'anomaly' : 'normal'
    response.end(JSON.stringify({ model: 'jev-shared-version', answers: { progress: { type: 'choice', choice,
      probabilities: { anomaly: choice === 'anomaly' ? 0.6 : 0.2, normal: choice === 'normal' ? 0.6 : 0.2, unknown: 0.2 }, confidence: 0.2,
    } }, usage: { input_tokens: 5, output_tokens: 1 } }))
  } })
  await f.saveEngine()
  await f.ctx.settings.update('monitor', { jevModelName: 'quick', semanticWaitMs: 1000, semanticThreshold: 2, noOutputThreshold: 100, checkIntervalMs: 1000 })
  await f.start(); await f.send({ type: 'reasoning-delta', index: 0, text: 'parent investigates new evidence' })
  await f.ctx.plugin(req('@deepseek-ai/dsh-subagent').default)
  await f.ctx.plugin(req('@deepseek-ai/dsh-subagent-spawn-in-process'))
  const run = await f.ctx.subagents.start('spawn', { parent: f.handle.agent, signal: new AbortController().signal,
    prompt: [{ type: 'text', text: 'child task' }], agentOptions: { provider: 'fixture', model: 'semantic-child' } })
  await until(() => f.streams.has('semantic-child'))
  await f.sendTo('semantic-child', { type: 'reasoning-delta', index: 0, text: 'child repetition' })
  await f.at(1000); await f.at(2000)
  assert.equal(f.requests.length, 4)
  assert.ok(f.requests.every(request => request.body.model === 'jev-upstream'))
  assert.deepEqual(f.notices.map(alert => [alert.agentId, alert.role, alert.kind]), [[run.id, 'child', 'semantic-stall']])
  const state = f.ctx.get('agentMonitor').snapshot()
  assert.equal(state.agents.find(row => row.agentId === 'settings-agent').semanticCount, 0)
  assert.equal(state.agents.find(row => row.agentId === run.id).semanticCount, 2)
  await f.sendTo('semantic-child', { type: 'text-delta', index: 1, text: 'child finished' }, { type: 'finish', reason: { kind: 'stop' } })
  const child = f.streams.get('semantic-child'); child.complete = true; child.next?.()
  await run.result; await run.dispose(); await f.finish()
})

test('a disabled duplicate name before its enabled engine does not make the named monitor configuration unavailable', async t => {
  const f = await configuredHost(t)
  await f.saveEngine()
  const [enabled] = f.ctx.get('jevCenter').describe()
  await f.ctx.settings.update('jev-center', { engines: [{ ...enabled, enabled: false }, enabled] })
  await f.ctx.settings.update('monitor', { jevModelName: 'quick', semanticWaitMs: 1000, semanticThreshold: 1, noOutputThreshold: 100, checkIntervalMs: 1000 })
  assert.equal(f.ctx.get('agentMonitor').snapshot().engineAvailability.available, true)
  await f.start(); await f.send({ type: 'reasoning-delta', index: 0, text: 'thinking' }); await f.at(1000)
  assert.equal(f.requests.length, 1)
  assert.equal(f.notices[0].kind, 'semantic-stall')
  assert.equal(f.ctx.get('agentMonitor').snapshot().engineAvailability.available, true)
  await f.finish()
})

test('the native Gateway exposes only the read-only monitor snapshot with real engine reasons and alerts', async t => {
  const f = await configuredHost(t)
  await f.ctx.plugin(req('@deepseek-ai/dsh-typert-registry').default)
  await f.ctx.plugin(req('@deepseek-ai/dsh-api-gateway').default)
  await f.ctx.settings.update('monitor', { jevModelName: 'missing', semanticWaitMs: 1000, semanticThreshold: 1, noOutputThreshold: 1, checkIntervalMs: 1000 })
  await f.start(); await f.send({ type: 'reasoning-delta', index: 0, text: 'thinking' }); await f.at(1000)
  const status = await f.ctx.typertGateway.invoke({ namespace: 'agentMonitor', method: 'snapshot', args: {} })
  assert.equal(status.engineAvailability.code, 'ENGINE_MISSING')
  assert.equal(status.engineAvailability.color, 'red')
  assert.equal(status.alerts[0].kind, 'no-output')
  assert.equal(status.agents[0].agentId, 'settings-agent')
  assert.equal(f.requests.length, 0)
  await assert.rejects(f.ctx.typertGateway.invoke({ namespace: 'agentMonitor', method: 'tick', args: {} }))
  assert.equal(f.notices.length, 1)
  await f.finish()
})

test('the monitor web page saves semantic settings through standard Settings and exposes the actual red missing-engine reason', async t => {
  const f = await configuredHost(t)
  const page = await (await fetch(`${f.url}/agent-monitor`)).text()
  for (const field of ['jevModelName', 'semanticWaitMs', 'semanticThreshold', 'debugEvidence']) assert.match(page, new RegExp(`name="${field}"`))
  const response = await fetch(`${f.url}/agent-monitor/api/settings`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jevModelName: 'missing', semanticWaitMs: 2000, semanticThreshold: 3, debugEvidence: true }) })
  assert.equal(response.status, 200, await response.text())
  const status = await (await fetch(`${f.url}/agent-monitor/api/status`)).json()
  assert.equal(status.configuration.value.semanticWaitMs, 2000)
  assert.equal(status.configuration.value.semanticThreshold, 3)
  assert.equal(status.configuration.value.debugEvidence, true)
  assert.equal(status.engineAvailability.code, 'ENGINE_MISSING')
  assert.equal(status.engineAvailability.color, 'red')
  assert.match(page, /unavailable/)
  assert.equal(f.requests.length, 0)
})

test('debug judgments redact unlabeled managed credentials unrelated to JEV while preserving safe reasoning', async t => {
  const f = await configuredHost(t)
  await f.saveEngine()
  const secrets = [`managed-alpha-${randomUUID()}`, `managed-beta-${randomUUID()}`]
  const refs = ['OTHER_MODEL_AUTH_SLOT', 'NONJEV_PROVIDER_VALUE']
  for (let index = 0; index < refs.length; index++) {
    await f.ctx.credentials.set(refs[index], secrets[index])
    assert.equal((await f.ctx.credentials.resolve(refs[index])).source, 'file')
  }
  const { credentialKey } = req('@deepseek-ai/dsh-credentials')
  const grantSecret = `opaque-grant-${randomUUID()}`, recordKey = `opaque-record-${randomUUID()}`
  const recordEnv = `opaque-record-env-${randomUUID()}`, environmentKey = `opaque-env-${randomUUID()}`
  const headerToken = `opaque-header-${randomUUID()}`
  const shadowedSecret = `opaque-effective-${randomUUID()}`, previousShadow = process.env[refs[0]]
  process.env[refs[0]] = shadowedSecret
  t.after(() => { previousShadow === undefined ? delete process.env[refs[0]] : process.env[refs[0]] = previousShadow })
  assert.equal((await f.ctx.credentials.resolve(refs[0])).source, 'env')
  await f.ctx.credentials.modifyRecord(credentialKey('other-provider', 'grant'), () => ({ kind: 'grant',
    payload: { nested: [{ value: grantSecret }], attempts: 2 } }))
  await f.ctx.credentials.modifyRecord(credentialKey('other-provider', 'api'), () => ({ kind: 'api-key',
    key: recordKey, env: { MODEL_AUTH: recordEnv } }))
  const previous = process.env.JEV_MONITOR_PRIVACY_ENV_API_KEY
  process.env.JEV_MONITOR_PRIVACY_ENV_API_KEY = environmentKey
  t.after(() => { previous === undefined ? delete process.env.JEV_MONITOR_PRIVACY_ENV_API_KEY : process.env.JEV_MONITOR_PRIVACY_ENV_API_KEY = previous })
  await f.ctx.settings.update('monitor', { jevModelName: 'quick', semanticWaitMs: 1000, semanticThreshold: 100,
    noOutputThreshold: 100, checkIntervalMs: 1000, debugEvidence: true })
  await f.start()
  const allSecrets = [...secrets, grantSecret, recordKey, recordEnv, environmentKey, headerToken, 'semantic-secret-key', shadowedSecret]
  await f.send({ type: 'reasoning-delta', index: 0, text: `safe isolated analysis\n${allSecrets.join('\n')}\nAuthorization: Bearer ${headerToken}\nstill making observations` })
  await f.at(1000)
  const records = await f.ctx.get('agentMonitor').journal()
  assert.equal(records.filter(record => record.recordType === 'judgment').length, 1)
  const persisted = JSON.stringify(records)
  for (const [index, secret] of allSecrets.entries()) assert.equal(persisted.includes(secret), false, `credential material ${index} must not persist`)
  assert.equal(persisted.includes('Authorization'), false)
  assert.equal(persisted.includes('Bearer'), false)
  assert.equal(persisted.includes('safe isolated analysis'), true, 'debug mode retains safe evidence')
  assert.equal(persisted.includes('still making observations'), true)
  const publicStatus = JSON.stringify(f.ctx.get('agentMonitor').snapshot())
  for (const secret of allSecrets) assert.equal(publicStatus.includes(secret), false)
  assert.equal(f.streams.get('model').request.signal.aborted, false)
  await f.finish()
})

test('debug judgments redact env-only standard model credentials without changing request metadata', async t => {
  const suffix = randomUUID().replaceAll('-', '').toUpperCase()
  const ref = `JEV_FAKE_THIRD_MODEL_SLOT_${suffix}`
  const secret = `opaque-env-only-${randomUUID()}`
  const environment = {
    [ref]: secret,
    [`JEV_FAKE_AGENT_SLOT_${suffix}`]: 'settings-agent',
    [`JEV_FAKE_ATTEMPT_SLOT_${suffix}`]: 'settings-agent:1',
    [`JEV_FAKE_TIME_SLOT_${suffix}`]: '1000',
  }
  for (const [name, value] of Object.entries(environment)) process.env[name] = value
  t.after(() => { for (const name of Object.keys(environment)) delete process.env[name] })
  const f = await configuredHost(t, { modelCredentialRef: ref })
  await f.saveEngine()
  const { parseCredentialsDocument } = req('@deepseek-ai/dsh-credentials-local')
  const filename = join(f.home, '.credentials.yaml')
  const document = parseCredentialsDocument(await readFile(filename, 'utf8'), filename)
  assert.equal(document.refs.has(ref), false, 'the model credential has no managed file entry')
  await f.ctx.settings.update('monitor', { jevModelName: 'quick', semanticWaitMs: 1000, semanticThreshold: 100,
    noOutputThreshold: 100, checkIntervalMs: 1000, debugEvidence: true })
  await f.start()
  await until(() => f.streams.get('model')?.delivered === 1)
  assert.equal(f.streams.get('model').credentialSource, 'env', 'the native Adapter consumes the standard env credential')
  await f.at(1000)
  assert.equal(f.requests[0].body.state.reasoning.includes('safe isolated model analysis'), true)
  assert.equal(f.requests[0].body.state.reasoning.includes('still making observations'), true)
  const records = await f.ctx.get('agentMonitor').journal()
  const judgment = records.find(record => record.recordType === 'judgment')
  assert.ok(judgment)
  assert.equal(JSON.stringify(records).includes(secret), false, 'the env-only credential must not persist')
  assert.equal(judgment.debugEvidence.reasoning.includes('safe isolated model analysis'), true)
  assert.equal(judgment.debugEvidence.reasoning.includes('still making observations'), true)
  assert.equal(judgment.agentId, 'settings-agent')
  assert.equal(judgment.attemptId, 'settings-agent:1')
  assert.equal(judgment.at, 1000)
  assert.equal(JSON.stringify(f.ctx.get('agentMonitor').snapshot()).includes(secret), false)
  assert.equal(f.streams.get('model').request.signal.aborted, false)
  await f.finish()
  const completeRecords = await f.ctx.get('agentMonitor').journal()
  assert.ok(completeRecords.every(record => record.agentId === 'settings-agent' && record.attemptId === 'settings-agent:1' && record.at === 1000))
})

test('debug evidence fails closed when the standard credential provider, document read or parse is unavailable', async t => {
  for (const failure of ['read', 'parse', 'provider', 'unknown-provider']) await t.test(failure, async t => {
    const f = await configuredHost(t)
    await f.saveEngine()
    const secret = `unavailable-catalog-${randomUUID()}`
    await f.ctx.credentials.set('UNRELATED_VALUE', secret)
    await f.ctx.settings.update('monitor', { jevModelName: 'quick', semanticWaitMs: 1000, semanticThreshold: 100,
      noOutputThreshold: 100, checkIntervalMs: 1000, debugEvidence: true })
    await f.start(); await f.send({ type: 'reasoning-delta', index: 0, text: `drop-the-entire-debug-fragment\n${secret}` })
    const filename = join(f.home, '.credentials.yaml')
    if (failure === 'read') await rm(filename)
    else if (failure === 'parse') await writeFile(filename, 'version: 1\nrefs: [invalid-shape]\n')
    else {
      await f.ctx.configEditor.entries().find(entry => entry.options.id === 'credentials').fiber.dispose()
      if (failure === 'unknown-provider') {
        const { CredentialProvider } = req('@deepseek-ai/dsh-credentials')
        const SameNameProvider = class LocalCredentialProvider extends CredentialProvider {
          constructor(ctx) { super(ctx); this.config = { path: filename } }
          resolve() { return Promise.resolve({ value: 'semantic-secret-key', source: 'fixture' }) }
        }
        await f.ctx.plugin(SameNameProvider)
      }
    }
    await f.at(1000)
    const records = await f.ctx.get('agentMonitor').journal()
    const judgment = records.find(record => record.recordType === 'judgment')
    assert.ok(judgment, 'metadata still persists')
    assert.equal(judgment.debugEvidence, undefined)
    assert.equal(judgment.debugOmitted, '无法完成凭据脱敏')
    const serialized = JSON.stringify(records)
    assert.equal(serialized.includes(secret), false)
    assert.equal(serialized.includes('drop-the-entire-debug-fragment'), false)
    assert.equal(serialized.includes('invalid-shape'), false)
    assert.equal(f.streams.get('model').request.signal.aborted, false)
    await f.finish()
  })
})

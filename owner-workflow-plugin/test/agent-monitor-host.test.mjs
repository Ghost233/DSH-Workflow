import '../../scripts/harness-test-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const { apply } = await import('../src/agent-monitor-plugin.mjs')

const req = createRequire(new URL('../../deepseek-harness/apps/cli/package.json', import.meta.url))
const { Context } = req('@deepseek-ai/cordis')
const { default: LlmRuntime, LlmAdapter, createUserMessage } = req('@deepseek-ai/dsh-llm')
const [SessionStore, Projections, SystemPrompt, Tools, Agents, AgentLoop] = [
  'dsh-session', 'dsh-session-projection', 'dsh-system-prompt', 'dsh-tools', 'dsh-agent', 'dsh-agent-loop',
].map(name => req(`@deepseek-ai/${name}`).default)

const until = async condition => {
  const end = Date.now() + 3000
  while (!condition()) {
    if (Date.now() > end) throw new Error('fixture did not reach expected state')
    await new Promise(resolve => setTimeout(resolve, 1))
  }
}

async function fixture(t, config = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-agent-monitor-'))
  const ctx = new Context(), notices = [], streams = new Map(), handles = []
  let time = 0
  class Adapter extends LlmAdapter {
    resolveModel(provider, model) { return Promise.resolve({ provider, id: model, name: model }) }
    async *stream(options) {
      const stream = { request: options, chunks: [], next: undefined, complete: false, delivered: 0 }
      streams.set(options.model, stream)
      const aborted = () => { stream.complete = true; stream.next?.() }
      options.signal.addEventListener('abort', aborted, { once: true })
      try {
        while (!stream.complete) {
          if (!stream.chunks.length) await new Promise(resolve => { stream.next = resolve })
          for (const chunk of stream.chunks.splice(0)) { yield chunk; stream.delivered++ }
        }
        if (stream.failure) throw stream.failure
      } finally { options.signal.removeEventListener('abort', aborted) }
    }
  }
  for (const plugin of [LlmRuntime, SessionStore, Projections, SystemPrompt, Tools, Agents]) await ctx.plugin(plugin)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['third-party-fixture'], new Adapter())
  await ctx.plugin({ name: 'monitor-fixture', apply: c => apply(c, { directory, ...config }, {
    now: () => time, notify: alert => notices.push(alert),
  }) })
  const monitor = ctx.get('agentMonitor')
  t.after(async () => {
    for (const stream of streams.values()) { stream.complete = true; stream.next?.() }
    for (const handle of handles) await handle.dispose()
    await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true })
  })
  return {
    ctx, monitor, notices, streams, directory,
    setTime(value) { time = value },
    heartbeat(id) { streams.get(id).next?.() },
    end(id, failure) { const stream = streams.get(id); stream.failure = failure; stream.complete = true; stream.next?.() },
    async create(id, options = {}) {
      const handle = await ctx.agents.create({ sessionId: id,
        agentOptions: { provider: 'third-party-fixture', model: id }, ...options })
      handles.push(handle)
      handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'private user task' }] }))
      await until(() => streams.has(id))
      return handle
    },
    async send(id, ...chunks) {
      const stream = streams.get(id), target = stream.delivered + chunks.length
      stream.chunks.push(...chunks); stream.next?.()
      await until(() => stream.delivered >= target)
    },
    async at(value) { time = value; await monitor.tick(); await monitor.flush() },
  }
}

test('default consecutive checks warn at minutes ten and eleven, then recover without interrupting the real request', async t => {
  const f = await fixture(t), handle = await f.create('main')
  await f.at(300_000)
  await f.send('main', { type: 'text-delta', index: 0, text: 'private model progress' })
  for (const minute of [6, 7, 8, 9]) await f.at(minute * 60_000)
  assert.equal(f.notices.length, 0)
  await f.at(600_000)
  await f.at(600_000)
  assert.deepEqual(f.notices.map(alert => [alert.at, alert.kind]), [[600_000, 'no-output']])
  await f.at(660_000)
  assert.deepEqual(f.notices.map(alert => alert.at), [600_000, 660_000])
  f.setTime(720_000)
  await f.send('main', { type: 'text-delta', index: 0, text: 'resumed' })
  await f.monitor.flush()
  const row = f.monitor.snapshot().agents.find(row => row.agentId === 'main')
  assert.equal(row.noOutputCount, 0)
  assert.equal(row.recoveredAt, 720_000)
  const countAfterRecovery = f.notices.length
  assert.equal(countAfterRecovery, 2)
  await f.at(720_000)
  assert.equal(f.notices.length, countAfterRecovery)
  assert.equal(f.streams.get('main').request.signal.aborted, false)
  assert.equal(handle.agent.status, 'running')
  await f.send('main', { type: 'finish', reason: { kind: 'stop' } })
  f.streams.get('main').complete = true; f.streams.get('main').next?.()
  await handle.agent.whenIdle()
  await f.at(1_200_000)
  assert.equal(f.notices.length, countAfterRecovery)
  const log = await readFile(join(f.directory, 'alerts.jsonl'), 'utf8')
  assert.match(log, /"recordType":"recovery"/)
  assert.doesNotMatch(log, /private user task|private model progress/)
  assert.ok(handle.agent.session.snapshotEvents().some(event => event.type === 'assistant/message'))
})

test('only new model deltas clear a request count; replaying the same public frame does not hide silence', async t => {
  const f = await fixture(t, { checkIntervalMs: 1000, noOutputThreshold: 2 })
  const handle = await f.create('replayed')
  let frame
  f.ctx.on('agent/assistant-stream', payload => {
    if (payload.agent.id === 'replayed' && payload.frame.type === 'chunk') frame = payload.frame
  })
  await f.send('replayed', { type: 'text-delta', index: 0, text: 'first output' })
  await f.at(1000)
  f.ctx.emit('agent/assistant-stream', { agent: handle.agent, frame })
  await f.at(2000)
  assert.equal(f.notices.length, 1)
  assert.equal(f.notices[0].evidence.consecutiveChecks, 2)
})

test('body, reasoning and tool arguments each reset silence while heartbeats and usage-only frames do not', async t => {
  const f = await fixture(t, { checkIntervalMs: 1000, noOutputThreshold: 2 })
  await f.create('activity')
  await f.at(1000)
  await f.send('activity', { type: 'text-delta', index: 0, text: 'body' })
  assert.equal(f.monitor.snapshot().agents[0].noOutputCount, 0)
  await f.at(2000)
  await f.send('activity', { type: 'reasoning-delta', index: 1, text: 'reasoning' })
  assert.equal(f.monitor.snapshot().agents[0].noOutputCount, 0)
  await f.at(3000)
  await f.send('activity', { type: 'tool-call-delta', index: 2, id: 'call', name: 'work', argumentsDelta: '{}' })
  assert.equal(f.monitor.snapshot().agents[0].noOutputCount, 0)
  await f.at(4000)
  f.heartbeat('activity')
  await f.send('activity', { type: 'usage', usage: { inputTokens: 1, outputTokens: 2 } },
    { type: 'text-delta', index: 0, text: '' })
  await f.at(5000)
  assert.equal(f.notices.length, 1)
  assert.equal(f.notices[0].evidence.consecutiveChecks, 2)
})

test('native spawn and fork children are visible and independent of their active main Agent', async t => {
  const f = await fixture(t, { checkIntervalMs: 1000, noOutputThreshold: 2 })
  const main = await f.create('parent')
  const Subagents = req('@deepseek-ai/dsh-subagent').default
  await f.ctx.plugin(Subagents)
  for (const provider of ['spawn', 'fork']) {
    await f.ctx.plugin(req(`@deepseek-ai/dsh-subagent-${provider}-in-process`))
  }
  const runs = []
  for (const provider of ['spawn', 'fork']) {
    const run = await f.ctx.subagents.start(provider, { parent: main.agent,
      signal: new AbortController().signal, prompt: [{ type: 'text', text: 'child private task' }],
      agentOptions: { provider: 'third-party-fixture', model: provider } })
    runs.push(run)
    await until(() => f.streams.has(provider))
  }
  t.after(async () => { for (const run of runs) { await run.result; await run.dispose() } })
  await f.at(1000)
  await f.send('parent', { type: 'text-delta', index: 0, text: 'parent progresses' })
  await f.at(2000)
  assert.deepEqual(f.notices.map(alert => [alert.agentId, alert.role, alert.parentId]),
    runs.map(run => [run.id, 'child', 'parent']))
  assert.equal(f.monitor.snapshot().agents.find(row => row.agentId === 'parent').noOutputCount, 1)
  for (const run of runs) assert.equal(run.localAgent.status, 'running')
})

test('new requests on the same Agent begin with zero checks and cannot inherit an earlier alert', async t => {
  const f = await fixture(t, { checkIntervalMs: 1000, noOutputThreshold: 2 })
  const handle = await f.create('reused')
  await f.at(1000); await f.at(2000)
  assert.equal(f.notices.length, 1)
  await f.send('reused', { type: 'text-delta', index: 0, text: 'done' }, { type: 'finish', reason: { kind: 'stop' } })
  const old = f.streams.get('reused')
  old.complete = true; old.next?.()
  await handle.agent.whenIdle()
  handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'second request' }] }))
  await until(() => f.streams.get('reused') !== old)
  await f.at(3000)
  assert.equal(f.notices.length, 1)
  await f.at(4000)
  assert.deepEqual(f.notices.map(alert => alert.attemptId), ['reused:1', 'reused:2'])
})

test('idle Agents, normal user waiting and explicit user cancellation do not accrue model silence alarms', async t => {
  const f = await fixture(t, { checkIntervalMs: 1000, noOutputThreshold: 1 })
  const cancelled = await f.create('cancelled')
  cancelled.agent.cancel({ kind: 'user' })
  await cancelled.agent.whenIdle()
  await f.at(60_000)
  assert.equal(f.notices.length, 0)
  const finished = await f.create('finished')
  await f.send('finished', { type: 'text-delta', index: 0, text: 'waiting for your reply' }, { type: 'finish', reason: { kind: 'stop' } })
  f.streams.get('finished').complete = true; f.streams.get('finished').next?.()
  await finished.agent.whenIdle()
  await f.at(120_000)
  assert.equal(f.notices.length, 0)
  assert.equal(finished.agent.status, 'idle')
})

test('a completed model request is not counted while its tool awaits approval or executes for a long time', async t => {
  for (const phase of ['approval', 'execution']) await t.test(phase, async t => {
    const f = await fixture(t, { checkIntervalMs: 1000, noOutputThreshold: 1 })
    let release, waiting = false
    const gate = new Promise(resolve => { release = resolve })
    if (phase === 'approval') f.ctx.on('tools/execute', async (_exec, next) => {
      waiting = true
      await gate
      return next()
    })
    f.ctx.tools.register({ name: 'wait', description: 'a gated operation', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { if (phase === 'execution') { waiting = true; await gate }; return 'done' },
    })
    const handle = await f.create(`waiting-${phase}`)
    try {
      await f.send(`waiting-${phase}`, { type: 'block-start', index: 0, blockType: 'tool-call' },
        { type: 'tool-call-delta', index: 0, id: 'call', name: 'wait', argumentsDelta: '{}' },
        { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call', name: 'wait', arguments: '{}' } },
        { type: 'finish', reason: { kind: 'tool-calls' } })
      const first = f.streams.get(`waiting-${phase}`)
      first.complete = true; first.next?.()
      await until(() => waiting)
      await f.at(60_000)
      assert.equal(f.notices.length, 0)
      assert.equal(handle.agent.status, 'running')
      assert.equal(f.monitor.snapshot().agents[0].active, false)
      release()
      await until(() => f.streams.get(`waiting-${phase}`) !== first)
      assert.equal(f.monitor.snapshot().agents[0].noOutputCount, 0)
      await f.send(`waiting-${phase}`, { type: 'text-delta', index: 0, text: 'completed normally' },
        { type: 'finish', reason: { kind: 'stop' } })
      f.streams.get(`waiting-${phase}`).complete = true; f.streams.get(`waiting-${phase}`).next?.()
      await handle.agent.whenIdle()
      await f.at(120_000)
      assert.equal(f.notices.length, 0)
    } finally { release() }
  })
})

test('an Agent Team teammate uses the same native monitor path and remains running after an alert', async t => {
  const f = await fixture(t, { checkIntervalMs: 1000, noOutputThreshold: 2 })
  await f.ctx.plugin(req('@deepseek-ai/dsh-session-persistence-jsonl').default, { root: join(f.directory, 'sessions') })
  await f.ctx.plugin(req('@deepseek-ai/dsh-subagent').default)
  await f.ctx.plugin(req('@deepseek-ai/dsh-subagent-spawn-in-process'))
  await f.ctx.plugin(req('@deepseek-ai/dsh-experimental-agent-team').default)
  const lead = await f.create('team-lead')
  const first = f.streams.get('team-lead')
  const { member } = await f.ctx.agentTeams.spawnTeammate(lead.agent, { name: 'reviewer', description: 'review the task',
    prompt: [{ type: 'text', text: 'review privately' }], context: 'fresh', provider: 'spawn', signal: new AbortController().signal })
  await until(() => f.streams.get('team-lead') !== first)
  await f.at(1000); await f.at(2000)
  const alert = f.notices.find(alert => alert.agentId === member.id)
  assert.ok(alert)
  assert.equal(alert.role, 'child')
  assert.equal(alert.parentId, 'team-lead')
  assert.equal(alert.kind, 'no-output')
  assert.equal(f.ctx.agents.get(member.id).status, 'running')
})

test('a slightly late check does not drop the next minute and repeated calls within one round remain deduplicated', async t => {
  const f = await fixture(t)
  const handle = await f.create('timer-jitter')
  const counts = []
  for (const time of [60_001, 120_000, 180_000, 240_000, 300_000, 360_000]) {
    await f.at(time)
    counts.push(f.monitor.snapshot().agents[0].noOutputCount)
    await f.at(time + 1)
    assert.equal(f.monitor.snapshot().agents[0].noOutputCount, counts.at(-1))
  }
  assert.deepEqual(counts, [1, 2, 3, 4, 5, 6])
  assert.deepEqual(f.notices.map(alert => alert.at), [300_000, 360_000])
  assert.equal(handle.agent.status, 'running')
  assert.equal(f.streams.get('timer-jitter').request.signal.aborted, false)
})

test('a normal finish with no model content records an empty result without changing its native terminal state', async t => {
  const f = await fixture(t), handle = await f.create('empty-normal-marker')
  await f.send('empty-normal-marker', { type: 'finish', reason: { kind: 'stop' } })
  f.end('empty-normal-marker')
  await handle.agent.whenIdle(); await f.monitor.flush()
  assert.deepEqual(f.notices.map(alert => alert.kind), ['empty-output'])
  const alert = f.monitor.snapshot().alerts[0]
  assert.equal(alert.attemptId, 'empty-normal-marker:1')
  assert.equal(handle.agent.status, 'idle')
  assert.ok(handle.agent.session.snapshotEvents().some(event => event.type === 'assistant/message'))
  assert.equal((await f.monitor.journal())[0].kind, 'empty-output')
  await f.at(600_000)
  assert.equal(f.notices.length, 1)
})

test('real upstream errors preserve safe public status facts and omit credential-bearing error text and headers', async t => {
  const { LlmError } = req('@deepseek-ai/dsh-llm')
  const f = await fixture(t), handle = await f.create('unsafe-error')
  f.end('unsafe-error', new LlmError('Authorization: Bearer T04_private_key', 'Authorization: Bearer T04_private_key',
    { status: 503, requestId: 'Authorization: Bearer T04_private_key' }))
  await handle.agent.whenIdle(); await f.monitor.flush()
  assert.equal(f.notices.length, 1)
  assert.equal(f.notices[0].kind, 'model-error')
  assert.equal(f.notices[0].evidence.code, 'UNKNOWN')
  assert.equal(f.notices[0].evidence.status, 503)
  assert.doesNotMatch(JSON.stringify(f.monitor.snapshot()), /T04_private_key|Authorization|Bearer/)
  assert.doesNotMatch(JSON.stringify(await f.monitor.journal()), /T04_private_key|Authorization|Bearer/)
  assert.equal(handle.agent.status, 'idle')
})

test('public stream evidence distinguishes empty EOF, unmarked partial EOF and output limits, with one terminal alert per request', async t => {
  const cases = [
    { id: 'empty-eof', chunks: [], kind: 'unmarked-end', empty: true },
    { id: 'partial-eof', chunks: [{ type: 'text-delta', index: 0, text: 'unfinished response' }], kind: 'unmarked-end', empty: false },
    { id: 'limit', chunks: [{ type: 'text-delta', index: 0, text: 'partial response' }, { type: 'finish', reason: { kind: 'max-tokens' } }], kind: 'output-limit' },
  ]
  const f = await fixture(t)
  for (const item of cases) {
    const handle = await f.create(item.id)
    let frame
    f.ctx.on('agent/assistant-stream', payload => { if (payload.agent.id === item.id) frame = payload.frame })
    if (item.chunks.length) await f.send(item.id, ...item.chunks)
    f.end(item.id)
    await handle.agent.whenIdle(); await f.monitor.flush()
    const alert = f.notices.find(alert => alert.agentId === item.id)
    assert.equal(alert.kind, item.kind)
    if (item.empty !== undefined) assert.equal(alert.evidence.empty, item.empty)
    f.ctx.emit('agent/assistant-stream', { agent: handle.agent, frame })
    f.ctx.emit('agent/error', { agent: handle.agent, error: new Error('duplicate terminal notification') })
    await f.monitor.flush()
    assert.equal(f.notices.filter(alert => alert.agentId === item.id).length, 1)
  }
  await f.at(1_200_000)
  assert.equal(f.notices.length, 3)
})

test('a failed native request can be followed by a normal partial-looking answer without inherited terminal warnings or recovery actions', async t => {
  const { LlmError } = req('@deepseek-ai/dsh-llm')
  const f = await fixture(t), handle = await f.create('after-error')
  const first = f.streams.get('after-error')
  f.end('after-error', new LlmError('connection closed', 'UPSTREAM_UNAVAILABLE', { status: 503 }))
  await handle.agent.whenIdle(); await f.monitor.flush()
  assert.equal(f.notices[0].evidence.code, 'UPSTREAM_UNAVAILABLE')
  handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'try a fresh request' }] }))
  await until(() => f.streams.get('after-error') !== first)
  await f.send('after-error', { type: 'block-end', index: 0, block: { type: 'text', text: 'Perhaps a partial-looking answer' } },
    { type: 'finish', reason: { kind: 'stop' } })
  f.end('after-error')
  await handle.agent.whenIdle(); await f.monitor.flush()
  assert.equal(f.notices.length, 1)
  assert.equal(f.notices[0].attemptId, 'after-error:1')
  assert.equal(f.monitor.snapshot().agents[0].attemptId, 'after-error:2')
  assert.equal(f.monitor.snapshot().agents[0].terminalAlerted, false)
})

test('a native spawned child error is associated with its own request and main Agent without changing the parent run', async t => {
  const { LlmError } = req('@deepseek-ai/dsh-llm')
  const f = await fixture(t), parent = await f.create('error-parent')
  await f.ctx.plugin(req('@deepseek-ai/dsh-subagent').default)
  await f.ctx.plugin(req('@deepseek-ai/dsh-subagent-spawn-in-process'))
  const run = await f.ctx.subagents.start('spawn', { parent: parent.agent, signal: new AbortController().signal,
    prompt: [{ type: 'text', text: 'child task' }], agentOptions: { provider: 'third-party-fixture', model: 'error-child' } })
  await until(() => f.streams.has('error-child'))
  f.end('error-child', new LlmError('upstream unavailable', 'UPSTREAM_UNAVAILABLE', { status: 503 }))
  await run.result; await f.monitor.flush()
  assert.deepEqual(f.notices.map(alert => [alert.agentId, alert.role, alert.parentId, alert.kind]),
    [[run.id, 'child', 'error-parent', 'model-error']])
  assert.equal(parent.agent.status, 'running')
  await run.dispose()
})

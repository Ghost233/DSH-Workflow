import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
const [repo, root, mode] = process.argv.slice(2)
const harness = join(repo, 'deepseek-harness')
const source = p => import(pathToFileURL(join(harness, p)).href)
const { Context } = await source('vendor/cordis/src/index.ts')
const { default: LlmRuntime } = await source('packages/llm/llm/src/index.ts')
const { default: SessionStore, SessionId } = await source('packages/core/session/src/index.ts')
const { default: SystemPrompt } = await source('packages/core/system-prompt/src/index.ts')
const { default: ToolRuntime } = await source('packages/core/tools/src/index.ts')
const { default: AgentRegistry } = await source('packages/core/agent/src/index.ts')
const { default: AgentLoop } = await source('packages/core/agent-loop/src/index.ts')
const { default: JsonlPersistence } = await source('packages/session/session-persistence-jsonl/src/index.ts')
const { MockAdapter, textResponse } = await source('packages/core/agent-loop/tests/mock-adapter.ts')
const ctx = new Context()
for (const plugin of [LlmRuntime, SessionStore, SystemPrompt, ToolRuntime, AgentRegistry]) await ctx.plugin(plugin)
await ctx.plugin(AgentLoop, { agents: [] })
await ctx.plugin(JsonlPersistence, { root, compression: 'none' })
const adapter = new MockAdapter(mode === 'running' ? ['hang'] : Array.from({length: 6}, () => textResponse('controlled reply')))
ctx.llm.registerAdapter(['mock'], adapter)
const id = SessionId('t21-prompt-session')
const options = { sessionId: id, agentOptions: { provider: 'mock', model: 'mock' } }
const message = Object.freeze({ id: 't21-fixed-prompt', role: 'user', content: [{ type: 'text', text: 'controlled prompt' }], source: { kind: 'user' } })
async function checkpoint(session) {
  if (await ctx.sessions.flush(session) !== true) throw new Error('no durability listener participated')
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate) {
  const end = Date.now() + 4000
  while (!predicate()) { if (Date.now() > end) throw new Error('probe wait timed out'); await pause(10) }
}
const projection = events => ({
  pendingInsertions: events.filter(e => e.type === 'agent/inbox/spliced').flatMap(e => e.data.inserted ?? []).filter(m => m.id === message.id).length,
  userMessages: events.filter(e => e.type === 'user/message' && e.data.id === message.id).length,
  turnStarts: events.filter(e => e.type === 'turn/start').map(e => e.data.turn),
  turnEnds: events.filter(e => e.type === 'turn/end').map(e => e.data),
})
function send(value) { return new Promise(resolve => process.send(value, resolve)) }
try {
  if (mode.startsWith('restart-')) {
    let loaded, physicalBefore
    try {
      physicalBefore = projection((await ctx.sessionPersistence.readFrom(id, 0)).events)
      loaded = await ctx.sessionPersistence.load(id)
    } catch (error) {
      if (mode !== 'restart-followup-return' || !String(error).includes('not found')) throw error
      await send({ phase: 'result', mode, observation: 'no durable session at restart', loadError: String(error) })
      await ctx.fiber.dispose()
      process.disconnect()
      process.exit(0)
    }
    const before = projection(loaded.events)
    const handle = await ctx.agents.resume({ resumeSessionId: id, agentOptions: options.agentOptions })
    const agent = handle.agent
    await until(() => agent.status === 'idle')
    await checkpoint(agent.session)
    const resumed = { ...projection(agent.session.events), pendingIds: [...agent.inbox.nextTurn, ...agent.inbox.nextStep].map(m => m.id) }
    const callsBeforeReplay = adapter.requests.length
    let replayError
    if (mode === 'restart-completed') {
      try { agent.followup(message); await until(() => agent.status === 'idle') } catch (error) { replayError = String(error) }
      await checkpoint(agent.session)
    }
    const after = await ctx.sessionPersistence.load(id)
    await send({ phase: 'result', mode, physicalBefore, before, resumed, after: projection(after.events), callsBeforeReplay, callsAfterReplay: adapter.requests.length, replayError, events: after.events })
    await handle.dispose()
    await ctx.fiber.dispose()
    process.disconnect()
  } else {
    const handle = await ctx.agents.create(options)
    const agent = handle.agent
    let duplicatePendingError
    if (mode === 'pending') {
      agent.inject(message)
      try { agent.inject(message) } catch (error) { duplicatePendingError = String(error) }
      await checkpoint(agent.session)
    } else {
      agent.followup(message)
      if (mode === 'running') await until(() => adapter.requests.length === 1)
      if (mode === 'completed') await until(() => agent.status === 'idle')
      if (mode !== 'followup-return') await checkpoint(agent.session)
    }
    await send({ phase: 'kill-ready', mode, memory: projection(agent.session.events), calls: adapter.requests.length, duplicatePendingError })
    // Parent owns SIGKILL; no graceful dispose/flush on this branch.
    setInterval(() => {}, 1000)
  }
} catch (error) {
  await send({ phase: 'error', mode, error: String(error), stack: error.stack })
  await ctx.fiber.dispose().catch(() => {})
  process.disconnect()
  process.exitCode = 1
}

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Native Agent/session identity for direct planning-tool contract tests.
 * Full preset composition is covered separately by harness-integration.
 */
export async function createPlanningNativeAgent(t, ctx, root, id) {
  const load = async path => (await import(new URL(`../../../deepseek-harness/packages/${path}/lib/index.js`, import.meta.url))).default
  const sessionRoot = await mkdtemp(join(tmpdir(), 'dsh-planning-sessions-'))
  t.after(async () => { await ctx.fiber.dispose(); await rm(sessionRoot, { recursive: true, force: true }) })
  for (const path of ['llm/llm', 'core/session', 'session/session-projection', 'core/agent']) {
    await ctx.plugin(await load(path))
  }
  await ctx.plugin(await load('session/session-persistence-jsonl'), { root: sessionRoot, compression: 'none' })
  await ctx.plugin(await load('core/agent-loop'), { agents: [] })
  const handle = await ctx.agents.create({ sessionId: id, meta: { cwd: root },
    agentOptions: { provider: 'planning-test', model: 'unused-direct-service-test' } })
  // Direct service calls need an owned open turn; these tests do not drive a
  // model loop. Full planning model rounds use planning-harness instead.
  handle.agent.session.append('turn/start', { turn: 1 })
  handle.agent.session.append('step/start', { turn: 1, step: 1 })
  return handle.agent
}

import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function boot(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'sol-efficiency-test-'))
  const ctx = new Context()
  t.after(async () => { await ctx.fiber.dispose(); await rm(cwd, { recursive: true, force: true }) })
  const configPath = join(cwd, 'cordis.yml')
  const yaml = (await readFile(new URL('./fixtures/cordis.yml', import.meta.url), 'utf8'))
    .replace("'./reducer-model.mjs'", JSON.stringify(new URL('./fixtures/reducer-model.mjs', import.meta.url).href))
    .replace("'../../index.js'", JSON.stringify(new URL('../index.js', import.meta.url).href))
    .replace('SESSION_ROOT', JSON.stringify(join(cwd, 'sessions')))
    .replace('SPILL_ROOT', JSON.stringify(join(cwd, 'spills')))
  await writeFile(configPath, yaml)
  await ctx.plugin(Loader, { baseUrl: new URL('./fixtures/', import.meta.url).href })
  const id = await ctx.loader.create({ name: '@deepseek-ai/cordis-plugin-include', config: { path: configPath } })
  await ctx.loader.await()
  const tree = ctx.loader.resolve(id).subtree
  const handle = await ctx.agents.create({ sessionId: 'sol-fixture', meta: { cwd },
    agentOptions: { provider: 'sol-test', model: 'fixture' } })
  const agent = handle.agent
  const session = agent.session
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  // Direct service tests own this open turn; agent-round tests use the real loop.
  t.after(async () => { await handle.dispose() })
  let calls = 0
  const execute = (name, args, options = {}) => ctx.tools.execute({
    name, arguments: args, callId: ToolCallId(`fixture-${++calls}`), agent,
    signal: new AbortController().signal, ...options,
  })
  return { ctx, tree, cwd, session, agent, execute }
}

export function logCommand(failed = false) {
  return `node -e 'process.stdout.write("compiling module\\n".repeat(700) + "${failed ? 'error: test failed' : 'PASS verification'}\\n"); process.exit(${failed ? 1 : 0})' # npm test`
}

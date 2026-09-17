import { Context } from '@deepseek-ai/cordis'
import { ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as plugin from '../index.js'
import { APPROVE_FOR_ME_DEFAULTS } from '../../owner-workflow-plugin/vendor/dsh-approve-for-me/src/core/defaults.ts'

export async function fixture(t, overrides = {}, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'approval-native-'))
  const ctx = new Context()
  t.after(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  const mount = async (name, config) => {
    const module = await import(`@deepseek-ai/dsh-${name}`)
    return await ctx.plugin(module.default ?? module, config)
  }
  await ctx.plugin((await import('@deepseek-ai/cordis-plugin-loader')).default)
  ctx.baseUrl = new URL('../../deepseek-harness/', import.meta.url).href
  for (const name of ['llm','session','session-projection','system-prompt','tools','agent']) await mount(name)
  await mount('session-persistence-jsonl', { root: join(root, 'sessions'), compression: 'none' })
  await mount('agent-loop', { agents: [] })
  await mount('subagent')
  await mount('agent-presets', { default: 'none', roots: [], includeUserRoot: false })
  await mount('subagent-spawn-in-process', { providerName: 'spawn' })
  await mount('sandbox-local')
  await mount('sandbox-policy', { mode: 'workspace-write', workspaceRoot: root })
  await mount('subprocess-local')
  await mount('bash-sandbox', { cwd: root, timeoutMs: 10_000 })
  await mount('shell-env')
  await mount('user-approval', { policy: 'ask' })
  await mount('permission-presets', { presets: {
    'workspace-write': { sandbox: 'workspace-write', approval: 'ask' },
    'read-only': { sandbox: 'read-only', approval: 'ask' },
    'approve-for-me': { sandbox: 'workspace-write', approval: 'ask' },
  } })
  await mount('tool-bash')
  await mount('settings-file', { path: join(root, 'settings.yml'), watch: false })
  const config = { ...structuredClone(APPROVE_FOR_ME_DEFAULTS), mode: 'rules-only',
    rules: { commandPrefixes: [{ tool: 'shell', prefix: 'node --version' }], reviewerInstructions: '' }, ...overrides }
  const adapter = await ctx.plugin(plugin, config)
  const handle = await ctx.agents.create({ sessionId: 'approval-main', meta: { cwd: root },
    agentOptions: { provider: 'approval-test', model: 'test' } })
  const agent = handle.agent
  if (options.manualTurn !== false) {
    agent.session.append('turn/start', { turn: 1 })
    agent.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Inspect the Node version.' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    agent.session.append('step/start', { turn: 1, step: 1 })
  }
  ctx.permissionPresets.set(agent.session, 'approve-for-me')
  const manual = []
  ctx.on('approval/request', request => { manual.push(request); return 'rejected' })
  let count = 0
  const execute = (command = 'node --version', options = {}) => ctx.tools.execute({
    name: 'bash', agent, callId: ToolCallId(`approval-call-${++count}`), signal: new AbortController().signal,
    arguments: { command, description: 'Read a diagnostic value.', sandbox_permissions: 'danger-full-access', justification: 'Inspect the installed tool version.' }, ...options,
  })
  return { ctx, root, agent, handle, adapter, manual, execute, config }
}

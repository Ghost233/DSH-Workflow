import { join } from 'node:path'

/** Official built DSH graph, isolated persistence; only the model response is a deterministic test adapter. */
export async function kernelNativeHost(root, { model, executable = false, filesystem = false, persistenceRoot = join(root, 'sessions'), presetDirectory, presetId = 'owner-fixture', fullPreset = false } = {}) {
  const load = path => import(new URL(`../../../deepseek-harness/${path}/lib/index.js`, import.meta.url))
  const [cordis, llm, sessions, projections, prompt, tools, registry, loop, jsonl, subagents] = await Promise.all([
    load('vendor/cordis'), load('packages/llm/llm'), load('packages/core/session'), load('packages/session/session-projection'),
    load('packages/core/system-prompt'), load('packages/core/tools'), load('packages/core/agent'), load('packages/core/agent-loop'),
    load('packages/session/session-persistence-jsonl'), load('packages/subagent/subagent'),
  ])
  class Adapter extends llm.LlmAdapter {
    calls = 0
    async resolveModel(provider, model) { return { provider, id: model, name: model } }
    async *stream(options) {
      this.calls++
      if (model) { yield* model(options); return }
      const text = 'Native transport test reply'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  const ctx = new cordis.Context()
  for (const plugin of [llm, sessions, projections, prompt, tools, registry]) await ctx.plugin(plugin.default)
  await ctx.plugin(jsonl.default, { root: persistenceRoot, compression: 'none' })
  await ctx.plugin(loop.default, { agents: [] })
  await ctx.plugin(subagents.default)
  if (executable) {
    const [sandbox, subprocess] = await Promise.all([load('packages/sandbox/sandbox-local'), load('packages/subprocess/subprocess-local')])
    await ctx.plugin(sandbox.LocalSandboxProvider, {})
    await ctx.plugin(subprocess.default)
  }
  if (filesystem) {
    const [fs, policy, toolFs, sandboxPolicy] = await Promise.all([load('packages/fs/fs-local'), load('packages/fs/fs-observation-policy'), load('packages/fs/tool-fs'), load('packages/sandbox/sandbox-policy')])
    await ctx.plugin(sandboxPolicy.SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: root })
    await ctx.plugin(fs.default, { cwd: root }); await ctx.plugin(policy); if (!presetDirectory) await ctx.plugin(toolFs)
  }
  if (presetDirectory) {
    if (fullPreset) {
      for (const path of ['packages/skill/skill', 'packages/llm/token-meter', 'packages/web/web',
        'packages/interaction/commands', 'packages/interaction/user-approval', 'packages/interaction/user-questions', 'packages/shell/bash-local', 'packages/shell/shell-env']) {
        const module = await load(path)
        await ctx.plugin(module.default ?? module)
      }
    }
    const [loader, include, group, presets] = await Promise.all([load('vendor/loader'), load('vendor/include'), load('vendor/group'), load('packages/preset/agent-presets')])
    ctx.baseUrl = new URL('../../../deepseek-harness/apps/cli/', import.meta.url).href
    await ctx.plugin(loader.default); ctx.loader.builtins.include = include.default; ctx.loader.builtins.group = group.default
    await ctx.plugin(presets.default, { default: presetId, roots: [{ path: presetDirectory, trust: 'system' }], includeShippedRoot: false, includeUserRoot: false })
  }
  const adapter = new Adapter(); ctx.llm.registerAdapter(['kernel-test'], adapter)
  const parent = await ctx.agents.create({ sessionId: 'kernel-main', meta: { cwd: root }, agentOptions: { provider: 'kernel-test', model: 'deterministic' }, ...(presetDirectory ? { setup: async child => { await ctx.agentPresets.mount(child, presetId) } } : {}) })
  return { ctx, parent, adapter, async close() { await parent.dispose(); await ctx.fiber.dispose() } }
}

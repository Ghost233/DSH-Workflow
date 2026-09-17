import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { kernelNativeHost } from './fixtures/kernel-native-host.mjs'
import { OwnerTeamSessions } from '../src/owner-team.mjs'

// Real standing preset mount: filesystem tools deliberately do not exist globally.
test('Owner Team joins the actual parent preset generation before its task tools are configured', { timeout: 20_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-standing-preset-'))
  const presets = join(root, 'presets'), directory = join(presets, 'owner-fixture')
  await mkdir(directory, { recursive: true })
  const toolFs = fileURLToPath(new URL('../../deepseek-harness/packages/fs/tool-fs/lib/index.js', import.meta.url))
  await writeFile(join(directory, 'agent.cordis.yml'), JSON.stringify([{ id: 'fs-tools', name: toolFs }]))
  const host = await kernelNativeHost(root, { filesystem: true, presetDirectory: presets })
  const team = new OwnerTeamSessions(host.ctx)
  t.after(async () => { await team.dispose(); await host.close(); await rm(root, { recursive: true, force: true }) })
  assert.equal(host.ctx.tools.get('read'), undefined)
  assert.ok(host.ctx.tools.get('read', host.parent.agent))
  const record = { workflowRoot: root, workflowId: 'fixture', ownerId: 'api', worktree: root, sessionId: 'fixture-owner', parentSessionId: host.parent.agent.id }
  let configured = false
  const owner = await team.activate(record, host.parent.agent, { setup: (ctx, agent) => {
    assert.equal(host.ctx.agentPresets.composedPreset(ctx), 'owner-fixture')
    assert.ok(ctx.tools.get('read', agent), 'Owner must see real scoped filesystem tools in setup')
    configured = true
  } })
  assert.equal(configured, true)
  assert.equal(host.ctx.agentPresets.composedPreset(owner.ctx), 'owner-fixture')
  await team.dispatch(record, host.parent.agent, { taskId: 'T1', attemptId: 'A1', planDigest: 'plan', promptId: 'fixture-prompt', prompt: 'Read-only fixture turn.' })
  await team.suspend(record)
  // A roster edit cannot silently change the inherited running generation.
  await writeFile(join(directory, 'agent.cordis.yml'), '[]')
  const resumed = await team.activate(record, host.parent.agent, { resume: true, setup: (ctx, agent) => assert.ok(ctx.tools.get('read', agent)) })
  assert.equal(host.ctx.agentPresets.composedPreset(resumed.ctx), 'owner-fixture')
})

test('Owner Team captures the main session model selected after Agent creation', { timeout: 20_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-model-selection-'))
  const host = await kernelNativeHost(root)
  const team = new OwnerTeamSessions(host.ctx)
  t.after(async () => { await team.dispose(); await host.close(); await rm(root, { recursive: true, force: true }) })
  const parent = host.parent.agent
  assert.equal(parent.options.model, 'deterministic')
  parent.session.append('model/selection', { provider: 'kernel-test', model: 'selected-after-creation' })
  const record = { workflowRoot: root, workflowId: 'fixture', ownerId: 'reviewer',
    worktree: root, sessionId: 'fixture-reviewer', parentSessionId: parent.id }
  const reviewer = await team.activate(record, parent)
  assert.equal(reviewer.options.provider, 'kernel-test')
  assert.equal(reviewer.options.model, 'selected-after-creation')
  assert.equal(parent.options.model, 'deterministic', 'the parent creation options remain stale after a UI selection')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry, { isModelInvocable } from '@deepseek-ai/dsh-skill'
import * as SkillFileSystem from '@deepseek-ai/dsh-skill-filesystem'
import { composeDshLaunch } from './dsh-launch-composition.mjs'

test('startup mounts the Chinese Matt skills and bundled DSH workflow skills together', async t => {
  const projectRoot = process.env.DSH_MATT_ZH_WORKFLOW_ROOT ?? fileURLToPath(new URL('../', import.meta.url))
  const patches = composeDshLaunch([
    { id: 'preset-registry', name: '@deepseek-ai/dsh-agent-preset-registry' },
  ], { projectRoot })
  const row = patches.at(-1).insert.find(item => item.id === 'mattpocock-skills-zh')
  assert.ok(row)
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(SkillRegistry)
  ctx.skills.registerProvider(() => ({
    name: 'english-deck-fixture',
    async list() { return [{ name: 'to-spec', description: 'English fallback',
      invocation: { modelInvocable: true, userInvocable: true }, provider: 'english-deck-fixture',
      source: 'bundled', rank: 600, locator: { content: 'English fallback.' } }] },
    async get(candidate) { return { ...candidate, content: candidate.locator.content } },
  }))
  await ctx.plugin(SkillFileSystem, { ...row.config, watch: false })
  const native = patches.at(-1).insert.find(item => item.id === 'dsh-workflow-skills')
  assert.ok(native)
  await ctx.plugin(SkillFileSystem, { ...native.config, watch: false })
  const account = patches.at(-1).insert.find(item => item.id === 'dsh-workflow-gh-account')
  assert.ok(account)
  await ctx.plugin(SkillFileSystem, { ...account.config, watch: false })
  const skills = await ctx.skills.list()
  assert.equal(skills.length, 30)
  assert.equal(skills.find(skill => skill.name === 'implement-spec')?.source, 'custom')
  assert.match((await ctx.skills.get('implement-spec')).content, /规格/)
  assert.match((await ctx.skills.get('to-spec')).content, /规格/)
  const refine = await ctx.skills.get('refine-issue')
  assert.equal(refine.provider, 'dsh-workflow-skills')
  assert.match(refine.content, /工单粒度检查/)
  assert.equal(isModelInvocable(refine), true)
  assert.equal((await ctx.skills.get('to-tickets')).provider, 'mattpocock-skills-zh')
  const delivery = await ctx.skills.get('spec-delivery')
  assert.equal(delivery.provider, 'dsh-workflow-skills')
  assert.match(delivery.content, /spawn_teammate/)
  assert.match(delivery.content, /team_task_create/)
})

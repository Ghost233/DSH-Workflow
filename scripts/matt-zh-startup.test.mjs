import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillFileSystem from '@deepseek-ai/dsh-skill-filesystem'
import { composeDshLaunch } from './dsh-launch-composition.mjs'

test('Station leaves independent skill bundles in the profile and only mounts its account skill', async t => {
  const projectRoot = process.env.DSH_MATT_ZH_WORKFLOW_ROOT ?? fileURLToPath(new URL('../', import.meta.url))
  const independent = { id: 'ghost-matt-skills', name: '/profile/dsh-ghost-matt-skills/index.mjs' }
  const patches = composeDshLaunch([independent], { projectRoot })
  const added = patches.flatMap(patch => patch.insert ?? [])
  assert.equal(patches.some(patch => patch.id === independent.id), false)
  assert.equal(added.some(row => ['mattpocock-skills-zh', 'dsh-workflow-skills'].includes(row.id)), false)
  const account = added.find(item => item.id === 'dsh-workflow-gh-account')
  assert.ok(account)
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(SkillFileSystem, { ...account.config, watch: false })
  assert.deepEqual((await ctx.skills.list()).map(skill => skill.name), ['configure-gh-account'])
})

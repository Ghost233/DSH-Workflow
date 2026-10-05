import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBootstrap } from '../matt-skills-panel-plugin/package/lib/bootstrap.js'
import { MATT_SKILL_CATALOG } from '../matt-skills-panel-plugin/package/shared/matt-skills.js'

test('local Matt board keeps its panel package without registering bundled skills', async () => {
  const packageRoot = fileURLToPath(new URL('../matt-skills-panel-plugin/package/', import.meta.url))
  const require = createRequire(join(packageRoot, 'package.json'))
  assert.match(require.resolve('dsh-workflow-matt-panel'), /matt-skills-panel-plugin\/package\/lib\/index\.js$/)
  assert.match(require.resolve('dsh-workflow-matt-panel/client'), /matt-skills-panel-plugin\/package\/lib\/client\.js$/)
  assert.equal(existsSync(join(packageRoot, 'bundled-skills')), false)
  let registered = 0
  const boot = createBootstrap({ ctx: { get: () => ({ registerProvider() { registered++ } }) } })
  const names = await boot.getMattSkillProbeNames()
  assert.equal(names.length, 27)
  assert.ok(names.includes('implement-spec'))
  assert.ok(names.includes('pr'))
  assert.ok(names.includes('retro'))
  assert.equal(names.includes('resolving-merge-conflicts'), false)
  const providerRoot = fileURLToPath(new URL('../vendor/mattpocock-skills-zh/skills/', import.meta.url))
  const installed = readdirSync(providerRoot).filter(name => existsSync(join(providerRoot, name, 'SKILL.md'))).sort()
  assert.deepEqual([...names].sort(), installed)
  assert.deepEqual(MATT_SKILL_CATALOG.map(skill => skill.name).sort(), installed)
  assert.equal(registered, 0)
})

test('the Chinese source is pinned to Ghost233 and retro requires explicit invocation', () => {
  const source = JSON.parse(readFileSync(new URL('../vendor/mattpocock-skills-zh.upstream.json', import.meta.url), 'utf8'))
  const manifest = JSON.parse(readFileSync(new URL('../vendor/mattpocock-skills-zh/.codex-plugin/plugin.json', import.meta.url), 'utf8'))
  assert.equal(source.repository, 'https://github.com/Ghost233/ghost-agent-market')
  assert.equal(source.repository, manifest.repository)
  assert.match(source.commit, /^[a-f0-9]{40}$/)
  assert.equal(source.version, manifest.version)
  assert.doesNotMatch(readFileSync(new URL('../.gitmodules', import.meta.url), 'utf8'), /ghost-agent-market|upstream\/mattpocock-skills/)
  assert.match(readFileSync(new URL('../vendor/mattpocock-skills-zh/skills/retro/SKILL.md', import.meta.url), 'utf8'), /仅在用户明确调用时使用/)
  assert.match(readFileSync(new URL('../vendor/mattpocock-skills-zh/skills/retro/agents/openai.yaml', import.meta.url), 'utf8'), /allow_implicit_invocation: false/)
})

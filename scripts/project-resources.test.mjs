import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { composeDshLaunch } from './dsh-launch-composition.mjs'
import { copyProjectIntegration } from '../macos-launcher/project-resources.mjs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

test('the launch composition loads the project skills root through a dedicated skill provider', () => {
  const patches = composeDshLaunch([], { projectRoot })
  const rows = patches.flatMap(row => row.insert ?? [])
  const provider = rows.find(row => row.id === 'dsh-workflow-gh-account')
  assert.ok(provider, 'the shipped skill provider must be inserted')
  assert.equal(provider.name, '@deepseek-ai/dsh-skill-filesystem')
  assert.equal(provider.config.providerName, 'dsh-workflow-gh-account')
  assert.equal(provider.config.includeDefaultRoots, false)
  assert.deepEqual(provider.config.customSkillDirs, [join(projectRoot, 'skills')])
})

test('the project layer ships the account skill and leaves independently released skills out of the App', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rga-t03-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const workflow = join(root, 'workflow')
  await copyProjectIntegration(projectRoot, workflow)
  await access(join(workflow, 'skills/configure-gh-account/SKILL.md'))
  const staged = JSON.parse(await readFile(join(dirname(workflow), 'project-layer.json'), 'utf8'))
  assert.match(staged.members['skills/configure-gh-account/SKILL.md']?.sha256 ?? '', /^[0-9a-f]{64}$/)
  assert.ok(Object.keys(staged.members).some(name => name.startsWith('skills/')),
    'the project layer must declare the skills root as a member')
  assert.ok(!Object.keys(staged.members).some(name => name.startsWith('vendor/mattpocock-skills-zh') || name.startsWith('vendor/dsh-skills')))
  assert.ok(!Object.keys(staged.members).some(name => name.startsWith('matt-skills-panel-plugin/')))
  assert.ok(!Object.keys(staged.members).some(name => name.startsWith('agent-observation-plugin/')))
  assert.ok(!Object.keys(staged.members).some(name => name.startsWith('browser-harness-plugin/')))
  assert.equal(staged.input.browserHarness, undefined)
  const bridge = JSON.parse(await readFile(join(workflow, 'package.json'), 'utf8'))
  assert.equal(bridge.name, 'dsh-station-bridge')
  assert.equal(bridge.exports['.'], './macos-launcher/runtime/station-bridge.mjs')
  assert.ok(staged.members['macos-launcher/runtime/station-bridge.mjs'])
  assert.match(staged.members['macos-launcher/runtime/station-gh-bash.mjs']?.sha256 ?? '', /^[0-9a-f]{64}$/)
  const githubCatalog = JSON.parse(await readFile(join(workflow, 'profile-github-plugins.json'), 'utf8'))
  assert.ok(githubCatalog.some(item => item.package === 'dsh-ghost-home-repo'))
  assert.ok(staged.members['profile-github-plugins.json']?.sha256)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { composeDshLaunch } from './dsh-launch-composition.mjs'
import { copyProjectIntegration } from '../macos-launcher/project-resources.mjs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

test('the maintained Matt panel replaces upstream host and tools without changing unrelated configuration', () => {
  const entries = [
    { id: 'presets', name: '@deepseek-ai/dsh-agent-preset-registry' },
    { id: 'upstream-panel', name: 'dsh-mattpocock-skills-deck', config: { retainedSetting: true } },
    { id: 'upstream-tools', name: 'dsh-mattpocock-skills-deck/tools', config: { retainedToolSetting: true } },
    { id: 'unrelated', name: 'unrelated', config: { value: 1 } },
  ]
  const before = structuredClone(entries)
  const patches = composeDshLaunch(entries, { projectRoot, catalogRoot: '/global',
     })
  assert.deepEqual(entries, before)
  assert.ok(patches.some(row => row.id === 'upstream-panel' && row.disabled))
  assert.ok(patches.some(row => row.id === 'upstream-tools' && row.disabled))
  assert.equal(patches.some(row => row.id === 'unrelated'), false)
  const inserts = patches.flatMap(row => row.insert ?? [])
  const panel = inserts.find(row => row.id === 'matt-skills-board')
  const tools = inserts.find(row => row.id === 'matt-panel-tools')
  assert.equal(panel.name, join(projectRoot, 'matt-skills-panel-plugin/package/lib/index.js'))
  assert.equal(tools.name, 'dsh-workflow-matt-panel/tools')
  assert.deepEqual(panel.config, { retainedSetting: true })
  assert.deepEqual(tools.config, { retainedToolSetting: true })
  assert.equal(inserts.find(row => row.id === 'mattpocock-skills-zh').config.includeDefaultRoots, false)
})

test('the launch composition loads the project skills root through a dedicated skill provider', () => {
  const patches = composeDshLaunch([], { projectRoot, catalogRoot: '/global' })
  const rows = patches.flatMap(row => row.insert ?? [])
  const provider = rows.find(row => row.id === 'dsh-workflow-gh-account')
  assert.ok(provider, 'the shipped skill provider must be inserted')
  assert.equal(provider.name, '@deepseek-ai/dsh-skill-filesystem')
  assert.equal(provider.config.providerName, 'dsh-workflow-gh-account')
  assert.equal(provider.config.includeDefaultRoots, false)
  assert.deepEqual(provider.config.customSkillDirs, [join(projectRoot, 'skills')])
})

test('the packaged project layer ships the configure-gh-account skill', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rga-t03-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const workflow = join(root, 'workflow')
  await copyProjectIntegration(projectRoot, workflow)
  await access(join(workflow, 'skills/configure-gh-account/SKILL.md'))
  const staged = JSON.parse(await readFile(join(dirname(workflow), 'project-layer.json'), 'utf8'))
  assert.match(staged.members['skills/configure-gh-account/SKILL.md']?.sha256 ?? '', /^[0-9a-f]{64}$/)
  assert.ok(Object.keys(staged.members).some(name => name.startsWith('skills/')),
    'the project layer must declare the skills root as a member')
})

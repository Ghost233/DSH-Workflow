import test from 'node:test'
import assert from 'node:assert/strict'
import { composeKernelLaunch } from './kernel-launch-composition.mjs'
import { configuredWebPort } from './kernel-web-launch.mjs'

test('readiness follows the existing numeric port and never evaluates or replaces custom expressions', () => {
  const entries = port => [{ id: 'web', name: '@deepseek-ai/dsh-host-webserver', config: { port } }]
  assert.equal(configuredWebPort(entries({ __jsExpr: 'ctx.webStartup.port ?? 3080' })), 3080)
  assert.equal(configuredWebPort(entries(18765)), 18765)
  assert.throws(() => configuredWebPort(entries({ __jsExpr: 'readPrivateSetting()' })), /unresolved port expression/)
  assert.throws(() => configuredWebPort(entries(0)), /configured Web port/)
})

test('kernel composition registers the Owner declaration without changing other Web profile rows', () => {
  const entries = [
    { id: 'preset-host', name: '@deepseek-ai/dsh-agent-preset-registry', config: { default: 'standard' } },
    { id: 'permission', name: '@deepseek-ai/dsh-permission-presets', config: { defaultPreset: 'review-only' } },
    { id: 'settings', name: 'settings', config: { path: '/user/settings.yaml' } },
    { id: 'owner-old', name: 'dsh-owner-workflow', config: { surfaceOnly: true } },
    { id: 'dashboard-old', name: 'dsh-owner-workflow/dashboard' },
    { id: 'sol-old', name: 'dsh-sol-efficiency', config: { actionFusion: { enabled: false } } },
    { id: 'synapse-old', name: 'dsh-synapse-workflow', config: { dataFile: '/user/existing-workspaces.json', autoProjection: true } },
    { id: 'third-party', name: 'some-external-plugin' },
  ]
  const presetPlugins = [{ id: 'owner-workflow', name: './plugin.mjs', config: {} },
    { id: 'persona', name: '@deepseek-ai/dsh-persona' }]
  const before = structuredClone(entries)
  const patches = composeKernelLaunch(entries, { projectRoot: '/project', catalogRoot: '/catalog', presetPlugins })
  assert.deepEqual(entries, before)
  assert.deepEqual(patches.filter(row => row.disabled).map(row => row.id), ['owner-old', 'dashboard-old', 'synapse-old'])
  assert.equal(patches.some(row => ['permission', 'settings', 'third-party'].includes(row.id)), false)
  assert.equal(patches[0].config.default, 'owner-workflow')
  const rows = patches.at(-1).insert
  const owner = rows.find(row => row.id === 'preset-owner-workflow')
  assert.equal(owner.config.plugins[0].name, '/project/owner-workflow-plugin/kernel-presets/owner-workflow/plugin.mjs')
  assert.equal(owner.config.plugins[0].config.catalogRoot, '/catalog')
  assert.equal(presetPlugins[0].name, './plugin.mjs')
  assert.equal(rows.some(row => /synapse/i.test(row.name)), false, 'retired Synapse must not be reinserted')
  assert.equal(rows.some(row => row.id === 'kernel-sol'), false, 'profile-owned SoL remains writable')
  assert.deepEqual(rows.find(row => row.id === 'mattpocock-skills-zh').config, {
    providerName: 'mattpocock-skills-zh', includeDefaultRoots: false,
    customSkillDirs: ['/project/vendor/ghost-agent-market/codex-market/plugins/mattpocock-skills-zh/skills'],
  })
  assert.equal(patches.some(row => row.id === 'sol-old'), false)
  const fallback = composeKernelLaunch(entries.filter(row => row.id !== 'sol-old'), { projectRoot: '/project', catalogRoot: '/catalog', presetPlugins })
  assert.equal(fallback.at(-1).insert.find(row => row.id === 'kernel-sol').name, 'dsh-sol-efficiency')
  assert.throws(() => composeKernelLaunch([...entries, { id: 'other-sol', name: 'dsh-sol-efficiency' }], { projectRoot: '/project', catalogRoot: '/catalog', presetPlugins }), /duplicate active sol/)
})

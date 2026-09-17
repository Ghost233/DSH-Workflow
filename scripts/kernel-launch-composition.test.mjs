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

test('kernel composition preserves user policies and custom roots while replacing only project runtime rows', () => {
  const entries = [
    { id: 'preset-host', name: '@deepseek-ai/dsh-agent-presets', config: { default: 'standard', includeUserRoot: true,
      roots: [{ path: '/project/owner-workflow-plugin/agent-presets', trust: 'system' }, { path: '/custom-presets', trust: 'user' }] } },
    { id: 'permission', name: '@deepseek-ai/dsh-permission-presets', config: { defaultPreset: 'review-only' } },
    { id: 'settings', name: 'settings', config: { path: '/user/settings.yaml' } },
    { id: 'owner-old', name: 'dsh-owner-workflow', config: { surfaceOnly: true } },
    { id: 'dashboard-old', name: 'dsh-owner-workflow/dashboard' },
    { id: 'sol-old', name: 'dsh-sol-efficiency', config: { actionFusion: { enabled: false } } },
    { id: 'synapse-old', name: 'dsh-synapse-workflow', config: { dataFile: '/user/existing-workspaces.json', autoProjection: true } },
    { id: 'third-party', name: 'some-external-plugin' },
  ]
  const before = structuredClone(entries)
  const patches = composeKernelLaunch(entries, { projectRoot: '/project', catalogRoot: '/catalog' })
  assert.deepEqual(entries, before)
  assert.deepEqual(patches.filter(row => row.disabled).map(row => row.id), ['owner-old', 'dashboard-old', 'sol-old', 'synapse-old'])
  assert.equal(patches.some(row => ['permission', 'settings', 'third-party'].includes(row.id)), false)
  assert.deepEqual(patches[0].config.roots, [{ path: '/project/owner-workflow-plugin/kernel-presets', trust: 'system' }, { path: '/custom-presets', trust: 'user' }])
  const rows = patches.at(-1).insert
  assert.equal(rows.some(row => /synapse/i.test(row.name)), false, 'retired Synapse must not be reinserted')
  assert.equal(rows.find(row => row.id === 'kernel-sol').config.actionFusion.enabled, false)
  assert.throws(() => composeKernelLaunch([...entries, { id: 'other-sol', name: 'dsh-sol-efficiency' }], { projectRoot: '/project', catalogRoot: '/catalog' }), /duplicate active sol/)
})

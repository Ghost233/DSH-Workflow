import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { composeDshLaunch } from './dsh-launch-composition.mjs'

const projectRoot = mkdtempSync(join(tmpdir(), 'dsh-launch-composition-'))
after(() => rmSync(projectRoot, { recursive: true, force: true }))
writeFileSync(join(projectRoot, 'project-mcp.json'), JSON.stringify([
  { id: 'workflow-mcp-codegraph', name: '@deepseek-ai/dsh-mcp-client',
    config: { serverName: 'codegraph', transport: 'stdio', command: 'codegraph', args: ['serve', '--mcp'] } },
]))

test('DSH launch loads the project CodeGraph server while preserving unrelated profile values', () => {
  const entries = [{ id: 'user-setting', name: 'unrelated', config: { keep: true } }]
  const before = structuredClone(entries)
  const patches = composeDshLaunch(entries, { projectRoot, catalogRoot: '/catalog' })
  assert.deepEqual(entries, before)
  const rows = patches.flatMap(row => row.insert ?? [])
  assert.equal(rows.filter(row => row.id === 'workflow-mcp-codegraph').length, 1)
  assert.deepEqual(rows.find(row => row.id === 'workflow-mcp-codegraph').config, {
    serverName: 'codegraph', transport: 'stdio', command: 'codegraph', args: ['serve', '--mcp'],
  })
  assert.equal(patches.some(row => row.id === 'user-setting'), false)
  assert.equal(rows.some(row => row.id === 'workflow-jev-center'), false)
  assert.equal(rows.filter(row => row.id === 'workflow-agent-monitor').length, 1)
  assert.equal(rows.find(row => row.id === 'workflow-agent-monitor').disabled, true)
})

test('launch disables saved JEV and monitoring without changing their settings or an existing MCP server', () => {
  const center = { id: 'workflow-jev-center', name: 'previous-observation/jev-center', config: { engines: [{ credentialRef: 'SAVED_KEY' }] } }
  const monitor = { id: 'workflow-agent-monitor', name: 'dsh-workflow/agent-monitor', config: { jevModelName: 'saved-model' } }
  const mcp = { id: 'mcp-jev', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'jev', transport: 'http', url: 'http://127.0.0.1:54842/mcp' } }
  const entries = [{ id: 'saved-group', group: true, config: [center, monitor, mcp] }]
  const before = structuredClone(entries)
  const patches = composeDshLaunch(entries, { projectRoot, catalogRoot: '/catalog' })
  assert.deepEqual(patches.find(row => row.id === center.id), { id: center.id, disabled: true })
  assert.deepEqual(patches.find(row => row.id === monitor.id), { id: monitor.id, disabled: true })
  assert.equal(patches.some(row => row.id === mcp.id), false)
  assert.deepEqual(entries, before)
})

test('project MCP configuration preserves an existing user server including its disabled state', () => {
  for (const disabled of [false, true]) {
    const userServer = { id: 'user-codegraph', name: '@deepseek-ai/dsh-mcp-client', disabled,
      config: { serverName: 'codegraph', transport: 'stdio', command: '/user/codegraph', args: ['serve', '--mcp', '--no-watch'] } }
    const entries = [{ id: 'user-group', group: true, config: [userServer] }]
    const before = structuredClone(entries)
    const patches = composeDshLaunch(entries, { projectRoot, catalogRoot: '/catalog' })
    assert.deepEqual(entries, before)
    assert.equal(patches.flatMap(row => row.insert ?? []).some(row => row.config?.serverName === 'codegraph'), false)
    assert.equal(patches.some(row => row.id === 'user-codegraph'), false)
  }
})

test('managed launch disables installer services, tools and pages by module while retaining readonly inventory', () => {
  const names = ['@deepseek-ai/dsh-plugin-manager', '@deepseek-ai/dsh-plugin-manager/tools',
    '@deepseek-ai/dsh-client-ui-plugin-manager', '@deepseek-ai/dsh-plugin-market', '@deepseek-ai/dsh-plugin-market/tools', '@deepseek-ai/dsh-client-ui-plugin-market',
    '@deepseek-ai/dsh-client-ui-entry-customization']
  const entries = [
    ...names.map((name, index) => ({ id: `renamed-manager-${index}`, name })),
    { id: 'saved-group', group: true, config: [{ id: 'another-manager', name: names[0] }] },
    { id: 'readonly-inventory', name: '@deepseek-ai/dsh-plugin-inventory' },
    { id: 'readonly-settings', name: '@deepseek-ai/dsh-client-ui-settings-plugin-inventory' },
  ]
  const before = structuredClone(entries)
  const patches = composeDshLaunch(entries, { projectRoot, catalogRoot: '/catalog' })
  for (const id of [...names.map((_, index) => `renamed-manager-${index}`), 'another-manager']) {
    assert.equal(patches.find(row => row.id === id)?.disabled, true, `${id} must not expose a mutable package channel`)
  }
  assert.equal(patches.some(row => ['readonly-inventory', 'readonly-settings'].includes(row.id)), false)
  assert.deepEqual(entries, before, 'saved profile values are not rewritten')
})

test('managed launch refuses an installer row that cannot be disabled unambiguously', () => {
  const name = '@deepseek-ai/dsh-plugin-manager'
  for (const entries of [[{ name }], [{ id: 'duplicate', name }, { id: 'duplicate', name: 'unrelated' }]]) {
    assert.throws(() => composeDshLaunch(entries, { projectRoot, catalogRoot: '/catalog' }), /readonly.*unambiguous/)
  }
})

test('agent preset package tools are disabled without altering unrelated expressions or saved settings', () => {
  const condition = { expression: 'preserved external Loader expression' }
  const plugins = [
    { id: 'installer', name: '@deepseek-ai/dsh-plugin-manager/tools', disabled: condition },
    { id: 'group', group: true, config: [{ id: 'market', name: '@deepseek-ai/dsh-plugin-market/tools' }] },
    { id: 'unrelated', name: 'saved-tool', disabled: condition, config: { keep: true } },
  ]
  const entries = [{ id: 'renamed-preset', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'cordis', plugins, saved: true } }]
  const patches = composeDshLaunch(entries, { projectRoot, catalogRoot: '/catalog' })
  const config = patches.find(row => row.id === 'renamed-preset').config
  assert.equal(config.saved, true)
  assert.equal(config.plugins[0].disabled, true)
  assert.equal(config.plugins[1].config[0].disabled, true)
  assert.equal(config.plugins[2], plugins[2])
  assert.equal(config.plugins[2].disabled, condition)
  assert.equal(plugins[0].disabled, condition, 'only the launch overlay changes, not saved configuration')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { runtimeAnchor, linkRuntimeModules } from '../../scripts/test-runtime.mjs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSharedProfileEntries, sharedMcpEntries, sharedSkillEntries, sharedPluginEntries } from './shared-profile-config.mjs'
import { webProfileBundles } from './profile-templates.mjs'

test('Superagent does not inherit retired packages still declared by an older daily profile', () => {
  const entries = [{ id: 'old-group', group: true, config: [
    { id: 'bili-native', name: 'billion-context', config: { keep: true } },
    { id: 'old-tool', name: 'billion-context/tools' },
    { id: 'ops', name: 'dsh-ops/mode-standard' },
    { id: 'insight', name: 'dsh-context' },
  ] }]
  const before = structuredClone(entries)
  const shared = sharedPluginEntries(entries, ['billion-context', 'dsh-context', 'dsh-ops'])
  assert.deepEqual(shared[0].config.map(row => row.name), ['dsh-context'])
  assert.deepEqual(entries, before)
})

test('reads layered daily MCP settings without rewriting an existing desktop profile', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-shared-profile-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const boot = createRequire(runtimeAnchor)('@deepseek-ai/dsh-app-boot')
  const resources = join(root, 'resources'), home = join(root, 'home'), profile = join(home, 'profiles/desktop')
  await linkRuntimeModules(resources)
  boot.initProfile(profile, webProfileBundles(createRequire(runtimeAnchor), boot))
  const manifestPath = join(profile, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.dsh.profile.bundles.push('@deepseek-ai/dsh-experimental-schedule-bundle')
  manifest.dsh.profile.bundles.push('billion-context')
  manifest.dsh.profile.bundles.push('missing-optional-fixture')
  const original = JSON.stringify(manifest, null, 2) + '\n'
  await writeFile(manifestPath, original)
  await writeFile(join(profile, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'mcp-active', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'active', transport: 'stdio', command: '/fixture/mcp' } },
    { id: 'disabled-group', name: 'cordis:group', group: true, disabled: true, config: [
      { id: 'mcp-disabled', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'disabled', transport: 'stdio', command: '/fixture/mcp' } },
    ] },
  ] }]))
  const skipped = []
  const rows = await readSharedProfileEntries({ resources, home, onSkipped: item => skipped.push(item) })
  assert.deepEqual(sharedMcpEntries(rows).map(row => row.config.serverName), ['active'])
  assert.equal(skipped[0].name, 'missing-optional-fixture')
  assert.equal(await readFile(manifestPath, 'utf8'), original)
})

test('does not guess MCP settings containing unresolved expressions or duplicate server names', () => {
  const row = { id: 'one', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'same', transport: 'stdio', command: 'mcp' } }
  assert.throws(() => sharedMcpEntries([row, { ...row, id: 'two' }]), /same/)
  const supported = { ...row, config: { ...row.config, env: { KEY: { __jsExpr: 'process.env.MCP_KEY' } } } }
  assert.deepEqual(sharedMcpEntries([supported])[0].config.env.KEY, { __jsExpr: 'process.env.MCP_KEY' })
  assert.throws(() => sharedMcpEntries([{ ...row, config: { ...row.config, env: { KEY: { __jsExpr: 'someOtherFunction()' } } } }]), /表达式/)
})

test('shares daily user skills and enabled named providers without reusing a desktop-only provider', () => {
  const entries = [
    { id: 'named', name: '@deepseek-ai/dsh-skill-filesystem', config: { providerName: 'team', customSkillDirs: ['/team/skills'] } },
    { id: 'off', name: '@deepseek-ai/dsh-skill-filesystem', disabled: true, config: { providerName: 'off' } },
  ]
  const rows = sharedSkillEntries(entries, '/daily')
  assert.deepEqual(rows.map(row => row.config.providerName), ['workflow-superagent-daily', 'team', 'off'])
  assert.deepEqual(rows[0].config.customSkillDirs, ['/daily/skills'])
  assert.deepEqual(rows[1].config.customSkillDirs, ['/team/skills'])
  assert.equal(rows[2].disabled, true)
  const disabled = sharedSkillEntries([{ id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem', disabled: true }], '/daily')
  assert.deepEqual(disabled.map(row => [row.id, row.disabled]), [['workflow-superagent-daily-skills', undefined], ['skill-filesystem', true]])
  const customOnly = sharedSkillEntries([{ id: 'team', name: '@deepseek-ai/dsh-skill-filesystem',
    config: { providerName: 'team', includeDefaultRoots: false } }], '/daily')
  assert.deepEqual(customOnly.map(row => row.id), ['workflow-superagent-daily-skills', 'team'])
})

test('shares configured plugins while excluding the desktop bridge from Superagent', () => {
  const entries = [
    { id: 'cost-meter', name: 'dsh-cost-meter', config: { currency: 'CNY' } },
    { id: 'ops', name: 'dsh-ops/mode-standard', disabled: true },
    { id: 'workflow-desktop-bridge', name: 'file:///desktop-bridge.mjs' },
    { id: 'webserver', name: '@deepseek-ai/dsh-host-webserver' },
    { id: 'office', name: '@deepseek-ai/dsh-skill-office' },
    { id: 'local', name: '/Users/example/plugins/local.mjs', config: { enabled: true } },
  ]
  const rows = sharedPluginEntries(entries, ['dsh-cost-meter', 'dsh-ops', '@deepseek-ai/dsh-skill-office'])
  assert.deepEqual(rows.map(row => row.id), ['cost-meter', 'office', 'local'])
  assert.equal(rows[0].config.currency, 'CNY')
  assert.equal(entries[1].disabled, true)
})

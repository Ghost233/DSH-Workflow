import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { readPluginConfiguration, savePluginConfiguration, configurationPath, manageProfilePluginOperation } from './plugin-configuration.mjs'
import { ensureStartupPlugins, updateProfilePlugins } from './plugin-update.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'plugin-configuration-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resources = join(root, 'resources'), home = join(root, 'home'), profile = join(home, 'profiles/desktop')
  const workflow = join(resources, 'workflow')
  await mkdir(workflow, { recursive: true })
  await mkdir(join(profile, 'node_modules/billion-context'), { recursive: true })
  const config = { registry: 'https://registry.npmjs.org/', plugins: [{ package: 'billion-context', version: '0.1.184', startup: true }] }
  const bytes = JSON.stringify(config)
  await writeFile(join(workflow, 'project-plugins.json'), bytes)
  await writeFile(join(workflow, 'dsh-runtime.json'), JSON.stringify({ version: '0.2.1-alpha.2' }))
  const lock = { schema: 1, harnessVersion: '0.2.1-alpha.2', registry: config.registry,
    manifestSha256: createHash('sha256').update(bytes).digest('hex'),
    plugins: [{ package: 'billion-context', version: '0.1.184', metadata: { name: 'billion-context', version: '0.1.184' } }] }
  await writeFile(join(workflow, 'project-plugins.lock.json'), JSON.stringify(lock))
  const install = async (version, declared = version) => {
    await writeFile(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'billion-context': declared }, dsh: { profile: { bundles: ['billion-context'] } } }))
    await writeFile(join(profile, 'node_modules/billion-context/package.json'), JSON.stringify({ name: 'billion-context', version }))
  }
  await install('0.1.184')
  return { resources, home, profile, workflow, config, lock, install }
}

test('generated lock cannot override an exact manifest version even with a matching digest', async t => {
  const f = await fixture(t)
  f.lock.plugins[0].version = '0.1.191'
  await writeFile(join(f.workflow, 'project-plugins.lock.json'), JSON.stringify(f.lock))
  await assert.rejects(readPluginConfiguration(f.resources, f.home), /lock does not match/)
})

test('one saved configuration survives an older packaged default and serves both profiles', async t => {
  const f = await fixture(t)
  f.config.plugins[0].version = '0.1.191'
  await savePluginConfiguration(f.home, f.config)
  assert.equal((await readPluginConfiguration(f.resources, f.home)).plugins[0].version, '0.1.191')
  assert.equal(JSON.parse(await readFile(join(f.workflow, 'project-plugins.json'))).plugins[0].version, '0.1.184')
})

test('driver removal refuses the original 191 installed / 184 declared mismatch before executing', async t => {
  const f = await fixture(t)
  await f.install('0.1.191', '0.1.184')
  let called = false
  await assert.rejects(manageProfilePluginOperation({ ...f, profileName: 'desktop', args: ['remove', 'test-driver'], run: async () => { called = true } }), /配置 0.1.184.*实际安装 0.1.191/)
  assert.equal(called, false)
})

test('unrelated removal detects a side effect instead of claiming success', async t => {
  const f = await fixture(t)
  await assert.rejects(manageProfilePluginOperation({ ...f, profileName: 'desktop', args: ['remove', 'test-driver'], run: () => f.install('0.1.183') }), /插件版本偏差/)
})

test('an explicit exact update synchronizes the shared configuration after installation', async t => {
  const f = await fixture(t)
  await manageProfilePluginOperation({ ...f, profileName: 'desktop', args: ['add', 'billion-context@0.1.191', '--save-exact'], run: () => f.install('0.1.191') })
  assert.equal(JSON.parse(await readFile(configurationPath(f.home))).plugins[0].version, '0.1.191')
})

test('an installed upgrade without the exact dependency declaration fails verification', async t => {
  const f = await fixture(t)
  await assert.rejects(manageProfilePluginOperation({ ...f, profileName: 'desktop', args: ['add', 'billion-context@0.1.191'], run: () => f.install('0.1.191', '0.1.184') }), /依赖声明 0.1.184/)
})

test('launcher update persists the target and checks plugins outside the selection', async t => {
  const f = await fixture(t)
  const report = { checkedAt: 'fixture', rows: [{ source: 'DSH Desktop profile', name: 'billion-context', current: '0.1.184', latest: '0.1.191', status: 'newer' }] }
  const result = await updateProfilePlugins({ ...f, resourcesRoot: f.resources, profileName: 'desktop', check: async () => report, run: () => f.install('0.1.191') })
  assert.equal(result.error, undefined)
  assert.equal((await readPluginConfiguration(f.resources, f.home)).plugins[0].version, '0.1.191')
})

test('startup never downgrades a divergent existing profile or installs another plugin', async t => {
  const f = await fixture(t)
  await mkdir(join(f.home, 'profiles/web/node_modules/billion-context'), { recursive: true })
  await writeFile(join(f.home, 'profiles/web/package.json'), JSON.stringify({ dependencies: { 'billion-context': '0.1.184' } }))
  await writeFile(join(f.home, 'profiles/web/node_modules/billion-context/package.json'), JSON.stringify({ name: 'billion-context', version: '0.1.191' }))
  await assert.rejects(ensureStartupPlugins({ ...f, resourcesRoot: f.resources, run: () => { throw new Error('must not install') } }), /插件版本偏差/)
})

test('explicit synchronization repairs the selected drift using configuration, preserving unrelated plugins', async t => {
  const { synchronizeProfilePlugins } = await import('./plugin-update.mjs')
  const f = await fixture(t)
  f.config.plugins[0].version = '0.1.191'
  await savePluginConfiguration(f.home, f.config)
  const result = await synchronizeProfilePlugins({ ...f, resourcesRoot: f.resources, profileName: 'desktop', only: ['billion-context'],
    run: async ({ candidates, synchronize }) => {
      assert.equal(synchronize, true)
      assert.deepEqual(candidates, [{ name: 'billion-context', latest: '0.1.191' }])
      await manageProfilePluginOperation({ ...f, profileName: 'desktop', args: ['add', 'billion-context@0.1.191'], synchronize, run: () => f.install('0.1.191') })
    } })
  assert.deepEqual(result.synchronized, [{ name: 'billion-context', version: '0.1.191' }])
})

test('launcher reports drift in an unselected managed plugin after updating a different package', async t => {
  const f = await fixture(t)
  f.config.plugins.push({ package: 'other-plugin', version: '1.0.0' })
  await savePluginConfiguration(f.home, f.config)
  await mkdir(join(f.profile, 'node_modules/other-plugin'), { recursive: true })
  const otherPackage = join(f.profile, 'node_modules/other-plugin/package.json')
  await writeFile(otherPackage, JSON.stringify({ name: 'other-plugin', version: '1.0.0' }))
  const manifestPath = join(f.profile, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath))
  manifest.dependencies['other-plugin'] = '1.0.0'
  await writeFile(manifestPath, JSON.stringify(manifest))
  const result = await updateProfilePlugins({ ...f, resourcesRoot: f.resources, profileName: 'desktop', only: ['billion-context'],
    check: async () => ({ checkedAt: 'fixture', rows: [{ source: 'DSH Desktop profile', name: 'billion-context', latest: '0.1.191', status: 'newer' }] }),
    run: async () => {
      manifest.dependencies['billion-context'] = '0.1.191'
      await writeFile(manifestPath, JSON.stringify(manifest))
      await writeFile(join(f.profile, 'node_modules/billion-context/package.json'), JSON.stringify({ name: 'billion-context', version: '0.1.191' }))
      await writeFile(otherPackage, JSON.stringify({ name: 'other-plugin', version: '0.9.0' }))
    } })
  assert.match(result.error, /插件版本偏差：other-plugin/)
  assert.equal((await readPluginConfiguration(f.resources, f.home)).plugins[0].version, '0.1.191')
})

test('version table marks config/profile drift as an error without offering an automatic update', async t => {
  const { checkPluginVersions } = await import('./plugin-versions.mjs')
  const f = await fixture(t)
  await f.install('0.1.191', '0.1.184')
  const report = await checkPluginVersions({ resourcesRoot: f.resources, home: f.home, profileName: 'desktop', fetchLatest: async () => '0.1.192' })
  const row = report.rows.find(row => row.source === 'DSH Desktop profile' && row.name === 'billion-context')
  assert.equal(row.status, 'error')
  assert.equal(row.updatable, false)
  assert.match(row.note, /统一配置 0.1.184/)
})

test('unrelated removal cannot silently delete a managed plugin and its declaration', async t => {
  const f = await fixture(t)
  await assert.rejects(manageProfilePluginOperation({ ...f, profileName: 'desktop', args: ['remove', 'test-driver'], run: async () => {
    await rm(join(f.profile, 'node_modules/billion-context'), { recursive: true })
    await writeFile(join(f.profile, 'package.json'), JSON.stringify({ dependencies: {} }))
  } }), /实际安装 缺失/)
})

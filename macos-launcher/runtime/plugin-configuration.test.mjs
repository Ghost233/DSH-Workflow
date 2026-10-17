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

test('the packaged lock remains the version authority while historical home configuration is preserved', async t => {
  const f = await fixture(t)
  const historical = { ...f.config, plugins: [{ ...f.config.plugins[0], version: '0.1.191' }] }
  await savePluginConfiguration(f.home, historical)
  const before = await readFile(configurationPath(f.home))
  assert.equal((await readPluginConfiguration(f.resources, f.home)).plugins[0].version, '0.1.184')
  assert.deepEqual(await readFile(configurationPath(f.home)), before)
})

test('a malformed historical configuration is preserved and cannot replace the packaged authority', async t => {
  const f = await fixture(t)
  await mkdir(join(f.home, 'workflow'), { recursive: true })
  const path = configurationPath(f.home), before = '{historical malformed configuration'
  await writeFile(path, before)
  assert.equal((await readPluginConfiguration(f.resources, f.home)).plugins[0].version, '0.1.184')
  assert.equal(await readFile(path, 'utf8'), before)
})

test('driver removal refuses the original 191 installed / 184 declared mismatch before executing', async t => {
  const f = await fixture(t)
  await f.install('0.1.191', '0.1.184')
  let called = false
  await assert.rejects(manageProfilePluginOperation({ ...f, profileName: 'desktop', args: ['remove', 'test-driver'], run: async () => { called = true } }), /配置 0.1.184.*实际安装 0.1.191/)
  assert.equal(called, false)
})

test('runtime package removal and versions outside the packaged pins are refused before execution', async t => {
  const f = await fixture(t)
  const original = await readFile(join(f.profile, 'package.json'))
  for (const args of [['remove', 'test-driver'], ['remove', 'billion-context'],
    ['add', 'billion-context@0.1.191', '--save-exact'], ['add', 'billion-context@0.1.184', '--registry', 'https://outside.example/']]) {
    await assert.rejects(manageProfilePluginOperation({ ...f, profileName: 'desktop', args,
      run: () => assert.fail('must not execute a forbidden runtime package operation'),
    }), /本仓库.*DMG/)
  }
  assert.deepEqual(await readFile(join(f.profile, 'package.json')), original)
  await assert.rejects(readFile(configurationPath(f.home)), { code: 'ENOENT' })
})

test('locked maintenance adds retain exact declarations and detect unexpected external tool changes', async t => {
  const f = await fixture(t)
  let called = false
  await manageProfilePluginOperation({ ...f, profileName: 'desktop', args: ['add', 'billion-context@0.1.184', '--save-exact', '--registry', f.config.registry],
    run: async () => { called = true },
  })
  assert.equal(called, true)
  await assert.rejects(manageProfilePluginOperation({ ...f, profileName: 'desktop', args: ['add', 'billion-context@0.1.184'],
    run: () => f.install('0.1.191', '0.1.184'),
  }), /依赖声明 0.1.184.*实际安装 0.1.191/)
  await assert.rejects(readFile(configurationPath(f.home)), { code: 'ENOENT' })
})

test('packaged runtime resources cannot reinstall even the same pinned version into an existing profile', async t => {
  const f = await fixture(t)
  await writeFile(join(f.resources, 'project-layer.json'), JSON.stringify({ schema: 1, sourceCommit: 'packaged-fixture' }))
  await savePluginConfiguration(f.home, { ...f.config, preserved: true })
  const paths = [join(f.profile, 'package.json'), join(f.profile, 'node_modules/billion-context/package.json'), configurationPath(f.home)]
  const before = await Promise.all(paths.map(path => readFile(path)))
  await assert.rejects(manageProfilePluginOperation({ ...f, profileName: 'desktop', args: ['add', 'billion-context@0.1.184', '--save-exact'],
    synchronize: true, run: () => assert.fail('a packaged runtime cannot invoke package maintenance'),
  }), /本仓库.*DMG/)
  assert.deepEqual(await Promise.all(paths.map(path => readFile(path))), before)
  const startup = await ensureStartupPlugins({ ...f, resourcesRoot: f.resources,
    run: () => assert.fail('packaged runtime startup cannot invoke package maintenance'),
  })
  assert.equal(startup.added.length, 0)
  assert.match(startup.skipped[0].reason, /本仓库.*DMG/)
})

test('startup never downgrades a divergent existing profile or installs another plugin', async t => {
  const f = await fixture(t)
  await mkdir(join(f.home, 'profiles/web/node_modules/billion-context'), { recursive: true })
  await writeFile(join(f.home, 'profiles/web/package.json'), JSON.stringify({ dependencies: { 'billion-context': '0.1.184' } }))
  await writeFile(join(f.home, 'profiles/web/node_modules/billion-context/package.json'), JSON.stringify({ name: 'billion-context', version: '0.1.191' }))
  await assert.rejects(ensureStartupPlugins({ ...f, resourcesRoot: f.resources, run: () => { throw new Error('must not install') } }), /插件版本偏差/)
})

test('runtime update and synchronization preserve drift and the historical configuration instead of repairing it', async t => {
  const { synchronizeProfilePlugins } = await import('./plugin-update.mjs')
  const f = await fixture(t)
  const historical = { ...f.config, plugins: [{ ...f.config.plugins[0], version: '0.1.191' }] }
  await savePluginConfiguration(f.home, historical)
  await f.install('0.1.191', '0.1.184')
  const before = await readFile(join(f.profile, 'package.json'))
  for (const operation of [updateProfilePlugins, synchronizeProfilePlugins]) {
    await assert.rejects(operation({ ...f, resourcesRoot: f.resources, profileName: 'desktop', only: ['billion-context'],
      run: () => assert.fail('runtime checking cannot reconcile version drift'),
    }), /本仓库.*DMG/)
  }
  assert.deepEqual(await readFile(join(f.profile, 'package.json')), before)
  assert.equal(JSON.parse(await readFile(configurationPath(f.home))).plugins[0].version, '0.1.191')
  assert.equal((await readPluginConfiguration(f.resources, f.home)).plugins[0].version, '0.1.184')
})

test('version table reports packaged/profile drift without offering an automatic update', async t => {
  const { checkPluginVersions } = await import('./plugin-versions.mjs')
  const f = await fixture(t)
  await f.install('0.1.191', '0.1.184')
  const report = await checkPluginVersions({ resourcesRoot: f.resources, home: f.home, profileName: 'desktop', fetchLatest: async () => '0.1.192' })
  const row = report.rows.find(row => row.source === 'DSH Desktop profile' && row.name === 'billion-context')
  assert.equal(row.status, 'drift')
  assert.equal(row.updatable, false)
  assert.match(row.note, /仓库固定 0.1.184/)
})

test('forbidden removal cannot delete a managed package or its declaration', async t => {
  const f = await fixture(t)
  const path = join(f.profile, 'node_modules/billion-context/package.json'), original = await readFile(path)
  await assert.rejects(manageProfilePluginOperation({ ...f, profileName: 'desktop', args: ['remove', 'test-driver'],
    run: () => assert.fail('must not execute removal'),
  }), /本仓库.*DMG/)
  assert.deepEqual(await readFile(path), original)
})

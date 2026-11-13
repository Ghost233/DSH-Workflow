import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { readPluginConfiguration, assertProfilePluginVersions, assertRequiredProfilePlugins, readStartupChecklist, startupChecklistPath } from './plugin-configuration.mjs'

test('profile startup refuses missing required npm packages and accepts updated installations', async t => {
  const profile = await mkdtemp(join(tmpdir(), 'workflow-profile-startup-'))
  t.after(() => rm(profile, { recursive: true, force: true }))
  const config = { npmStartup: 'profile', plugins: [
    { package: 'dshmarket', version: '1.0.0', startup: true },
    { package: 'dsh-context', version: '1.0.0', startup: true },
    { package: 'optional-plugin', version: '1.0.0' },
    { package: 'source-plugin', version: '1.0.0', source: 'git', startup: true },
  ] }
  const required = await readStartupChecklist(undefined, config)
  const installed = async (name, version) => {
    const directory = join(profile, 'node_modules', name)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version }))
  }
  await installed('dsh-context', '2.0.0')
  await assert.rejects(assertRequiredProfilePlugins(profile, required, '/Applications/Ghost DSH Station.app/Contents/Resources'),
    error => error.message.includes('dshmarket') && error.message.includes('profile-plugin-install.mjs')
      && !error.message.includes('optional-plugin') && !error.message.includes('dsh-context'))
  await installed('dshmarket', '2.0.0')
  await assertRequiredProfilePlugins(profile, required)
  await assertProfilePluginVersions(profile, config)
})

test('packaged defaults seed the local list once; local edits and an empty list survive an app update', async t => {
  const root = await mkdtemp(join(tmpdir(), 'station-checklist-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const data = join(root, 'data'), resources = join(root, 'resources')
  await mkdir(join(resources, 'workflow'), { recursive: true })
  const defaults = join(resources, 'workflow/default-startup-plugins.json')
  const local = startupChecklistPath(data)
  const config = { npmStartup: 'profile', plugins: [{ package: 'old-pin', startup: true }] }
  const read = () => readStartupChecklist(data, config, resources)
  await writeFile(defaults, '["default-plugin"]')
  assert.deepEqual(await Promise.all([read(), read()]), [['default-plugin'], ['default-plugin']])
  assert.deepEqual(JSON.parse(await readFile(local, 'utf8')), ['default-plugin'])
  await writeFile(local, '["@user/github-plugin"]')
  await writeFile(defaults, '["new-default"]')
  assert.deepEqual(await read(), ['@user/github-plugin'])
  await writeFile(local, '[]')
  assert.deepEqual(await read(), [])
  await writeFile(local, '["../invalid"]')
  await assert.rejects(read(), /启动检查名单须为不重复的包名数组/)
  assert.equal(await readFile(local, 'utf8'), '["../invalid"]')
})

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

async function githubPlugin(f) {
  const item = { package: 'dsh-plugin-notify', version: '1.3.0', source: 'git',
    repository: 'https://github.com/c-ling/dsh-plugin-notify', commit: 'a'.repeat(40), startup: true }
  f.config.plugins = [item]
  const bytes = JSON.stringify(f.config)
  f.lock.manifestSha256 = createHash('sha256').update(bytes).digest('hex')
  f.lock.plugins = [{ package: item.package, version: item.version, commit: item.commit,
    metadata: { name: item.package, version: item.version } }]
  await writeFile(join(f.workflow, 'project-plugins.json'), bytes)
  await writeFile(join(f.workflow, 'project-plugins.lock.json'), JSON.stringify(f.lock))
  return item
}

test('a GitHub-only plugin retains its fixed version and source instead of resolving a same-name npm package', async t => {
  const f = await fixture(t)
  const item = await githubPlugin(f)
  assert.deepEqual((await readPluginConfiguration(f.resources)).plugins, [item])
})

test('a different locked GitHub commit is rejected even with the correct version and manifest digest', async t => {
  const f = await fixture(t)
  await githubPlugin(f)
  f.lock.plugins[0].commit = 'b'.repeat(40)
  await writeFile(join(f.workflow, 'project-plugins.lock.json'), JSON.stringify(f.lock))
  await assert.rejects(readPluginConfiguration(f.resources), /lock does not match/)
})

test('an installed GitHub plugin is checked against its pinned repository and commit declaration', async t => {
  const f = await fixture(t)
  const item = await githubPlugin(f)
  await mkdir(join(f.profile, 'node_modules', item.package), { recursive: true })
  await writeFile(join(f.profile, 'node_modules', item.package, 'package.json'), JSON.stringify({ name: item.package, version: item.version }))
  const manifest = { dependencies: { [item.package]: `git+${item.repository}.git#${item.commit}` } }
  await writeFile(join(f.profile, 'package.json'), JSON.stringify(manifest))
  await assertProfilePluginVersions(f.profile, await readPluginConfiguration(f.resources))
  const { checkPluginVersions } = await import('./plugin-versions.mjs')
  const report = await checkPluginVersions({ resourcesRoot: f.resources, home: f.home, profileName: 'desktop' })
  assert.equal(report.rows.find(row => row.source === 'DSH 当前配置' && row.name === item.package).status, 'fixed')
  manifest.dependencies[item.package] = item.version
  await writeFile(join(f.profile, 'package.json'), JSON.stringify(manifest))
  await assert.rejects(assertProfilePluginVersions(f.profile, await readPluginConfiguration(f.resources)), /插件版本偏差/)
})

test('generated lock cannot override an exact manifest version even with a matching digest', async t => {
  const f = await fixture(t)
  f.lock.plugins[0].version = '0.1.191'
  await writeFile(join(f.workflow, 'project-plugins.lock.json'), JSON.stringify(f.lock))
  await assert.rejects(readPluginConfiguration(f.resources, f.home), /lock does not match/)
})

test('the packaged lock remains the version authority while historical home configuration is preserved', async t => {
  const f = await fixture(t)
  const historical = { ...f.config, plugins: [{ ...f.config.plugins[0], version: '0.1.191' }] }
  const path = join(f.home, 'workflow/project-plugins.json')
  await mkdir(join(f.home, 'workflow'), { recursive: true })
  await writeFile(path, JSON.stringify(historical))
  const before = await readFile(path)
  assert.equal((await readPluginConfiguration(f.resources, f.home)).plugins[0].version, '0.1.184')
  assert.deepEqual(await readFile(path), before)
})

test('a malformed historical configuration is preserved and cannot replace the packaged authority', async t => {
  const f = await fixture(t)
  await mkdir(join(f.home, 'workflow'), { recursive: true })
  const path = join(f.home, 'workflow/project-plugins.json'), before = '{historical malformed configuration'
  await writeFile(path, before)
  assert.equal((await readPluginConfiguration(f.resources, f.home)).plugins[0].version, '0.1.184')
  assert.equal(await readFile(path, 'utf8'), before)
})

test('version table reports packaged/profile drift without offering an automatic update', async t => {
  const { checkPluginVersions } = await import('./plugin-versions.mjs')
  const f = await fixture(t)
  await f.install('0.1.191', '0.1.184')
  const report = await checkPluginVersions({ resourcesRoot: f.resources, home: f.home, profileName: 'desktop', fetchLatest: async () => '0.1.192' })
  const row = report.rows.find(row => row.source === 'DSH 当前配置' && row.name === 'billion-context')
  assert.equal(row.status, 'drift')
  assert.equal(row.updatable, false)
  assert.match(row.note, /仓库固定 0.1.184/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checkPluginVersions, compareVersions, declaredDshVersions, latestDeclaredDsh } from './plugin-versions.mjs'

test('readonly version inspection uses packaged pins and actual installation without npm latest or historical overrides', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-readonly-versions-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resources = join(root, 'resources'), workflow = join(resources, 'workflow'), home = join(root, 'home')
  const profile = join(home, 'profiles/desktop'), name = 'dsh-workflow-version-fixture'
  await mkdir(workflow, { recursive: true })
  await mkdir(join(home, 'workflow'), { recursive: true })
  await mkdir(join(profile, 'node_modules', name), { recursive: true })
  const config = { registry: 'https://registry.npmjs.org/', plugins: [{ package: name, version: '1.1.0' }] }
  const bytes = JSON.stringify(config)
  await writeFile(join(workflow, 'project-plugins.json'), bytes)
  await writeFile(join(workflow, 'dsh-runtime.json'), JSON.stringify({ version: '0.2.1-alpha.5' }))
  await writeFile(join(workflow, 'project-plugins.lock.json'), JSON.stringify({ schema: 1, harnessVersion: '0.2.1-alpha.5',
    registry: config.registry, manifestSha256: createHash('sha256').update(bytes).digest('hex'),
    plugins: [{ package: name, version: '1.1.0', metadata: { name, version: '1.1.0' } }],
  }))
  const historical = join(home, 'workflow/project-plugins.json')
  await writeFile(historical, JSON.stringify({ ...config, plugins: [{ package: name, version: '9.9.9' }] }))
  await writeFile(join(profile, 'package.json'), JSON.stringify({ dependencies: { [name]: '1.0.0' }, dsh: { profile: { bundles: [name] } } }))
  await writeFile(join(profile, 'node_modules', name, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
  const before = await readFile(historical), requests = []
  const report = await checkPluginVersions({ resourcesRoot: resources, home, profileName: 'desktop',
    fetchLatest: async value => { requests.push(value); return '9.9.9' },
  })
  assert.deepEqual(requests, [], 'local inventory must not request npm latest')
  const installed = report.rows.find(row => row.source === 'DSH Desktop profile' && row.name === name)
  assert.equal(installed.current, '1.0.0')
  assert.equal(installed.expected, '1.1.0')
  assert.equal(installed.status, 'drift')
  assert.equal(installed.updatable, false)
  assert.match(installed.note, /仓库固定 1\.1\.0/)
  const expected = report.rows.find(row => row.source === '项目插件锁定清单（打包快照）' && row.name === name)
  assert.equal(expected.current, null, 'a repository pin is not an observed installation')
  assert.equal(expected.expected, '1.1.0')
  assert.deepEqual(await readFile(historical), before)
  await rm(join(profile, 'node_modules', name, 'package.json'))
  const missing = (await checkPluginVersions({ resourcesRoot: resources, home, profileName: 'desktop' })).rows.find(row => row.source === 'DSH Desktop profile' && row.name === name)
  assert.equal(missing.current, null, 'an absent installation must not inherit the dependency or lock version')
  assert.equal(missing.expected, '1.1.0')
  assert.equal(missing.status, 'unknown')
  assert.deepEqual(await readFile(historical), before)
})

test('version report compares SemVer without treating a prerelease as newer than stable', () => {
  assert.equal(compareVersions('1.2.3-rc.2', '1.2.3'), -1)
  assert.equal(compareVersions('1.2.3', '1.2.3-rc.2'), 1)
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
  assert.equal(compareVersions('1.2.3', '2.0.0'), -1)
  assert.equal(compareVersions('link:../source', '2.0.0'), null)
})

test('DSH support text uses only compatibility declared by the package', () => {
  assert.equal(declaredDshVersions({ dsh: { compatibility: { dsh: '>=0.1.5-rc.1' } } }), '>=0.1.5-rc.1')
  assert.equal(declaredDshVersions({ dsh: { compatibility: { dshReleases: {
    '0.1.7-rc.2': 'compatible', '0.1.3-alpha.1': 'unknown', '0.1.5-rc.1': 'compatible',
  } } } }), '0.1.5-rc.1、0.1.7-rc.2（明确标注）')
  assert.equal(declaredDshVersions({ dsh: { client: { platform: 'web' } } }), '未声明')
  assert.equal(declaredDshVersions(undefined), '无法读取')
  assert.equal(latestDeclaredDsh({ dsh: { compatibility: { dshReleases: {
    '0.1.7-rc.2': 'compatible', '0.1.3-alpha.1': 'unknown', '0.1.5-rc.1': 'compatible',
  } } } }), '0.1.7-rc.2（逐版标注）')
  assert.equal(latestDeclaredDsh({ dsh: { compatibility: { dsh: '>=0.1.0-rc.5',
    dshReleases: { '0.1.5-alpha.1': 'compatible' } } } }), '未给精确最高版；逐版标注至 0.1.5-alpha.1')
  assert.equal(latestDeclaredDsh({ dsh: { compatibility: { dsh: '>=0.1.0-rc.5' } } }), '未给精确最高版')
  assert.equal(latestDeclaredDsh({ dsh: { client: { platform: 'web' } } }), '未声明')
  assert.equal(latestDeclaredDsh(undefined), '无法读取')
})

test('one check covers profile, project lock and bundled plugins without writing or installing', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-versions-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resources = join(root, 'resources'), workflow = join(resources, 'workflow'), home = join(root, 'home')
  const profile = join(home, 'profiles', 'web')
  await mkdir(join(profile, 'node_modules', 'external-plugin'), { recursive: true })
  await mkdir(join(profile, 'node_modules', 'bundle-only'), { recursive: true })
  await mkdir(join(profile, 'node_modules', 'disabled-plugin'), { recursive: true })
  await mkdir(join(resources, 'node_modules', '@deepseek-ai', 'dsh-base'), { recursive: true })
  await mkdir(join(workflow, 'agent-observation-plugin'), { recursive: true })
  const panel = join(workflow, 'matt-skills-panel-plugin')
  await mkdir(join(panel, 'package'), { recursive: true })
  await writeFile(join(panel, 'package/package.json'), JSON.stringify({ name: 'dsh-workflow-matt-panel', version: '1.7.39-workflow.1' }))
  await writeFile(join(panel, 'upstream.json'), JSON.stringify({ version: '1.7.39' }))
  const mattZh = join(workflow, 'vendor/mattpocock-skills-zh/.codex-plugin')
  await mkdir(mattZh, { recursive: true })
  await writeFile(join(mattZh, 'plugin.json'), JSON.stringify({ name: 'mattpocock-skills-zh', version: '0.1.4' }))
  await writeFile(join(profile, 'package.json'), JSON.stringify({ dependencies: {
    'external-plugin': '1.0.0', 'local-plugin': 'link:/local/plugin', 'disabled-plugin': '1.0.0',
  }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'bundle-only', 'external-plugin'] } } }))
  await writeFile(join(profile, 'node_modules', 'external-plugin', 'package.json'), JSON.stringify({ name: 'external-plugin', version: '1.0.0', dsh: { compatibility: { dsh: '>=0.1.5-rc.1' } } }))
  await writeFile(join(profile, 'node_modules', 'bundle-only', 'package.json'), JSON.stringify({ name: 'bundle-only', version: '1.2.0', dsh: { compatibility: { dshReleases: { '0.1.7-rc.2': 'compatible' } } } }))
  await writeFile(join(profile, 'node_modules', 'disabled-plugin', 'package.json'), JSON.stringify({ name: 'disabled-plugin', version: '1.0.0' }))
  await writeFile(join(resources, 'node_modules', '@deepseek-ai', 'dsh-base', 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-base', version: '0.1.0' }))
  await writeFile(join(workflow, 'agent-observation-plugin', 'package.json'), JSON.stringify({ name: 'dsh-workflow', version: '0.1.0' }))
  const manifest = JSON.stringify({ registry: 'https://registry.npmjs.org/', plugins: [{ package: 'third-party', version: '2.0.0' }] })
  await writeFile(join(workflow, 'project-plugins.json'), manifest)
  await writeFile(join(workflow, 'dsh-runtime.json'), JSON.stringify({ version: '0.1.7-rc.2' }))
  await writeFile(join(workflow, 'project-plugins.lock.json'), JSON.stringify({
    schema: 1, harnessVersion: '0.1.7-rc.2', registry: 'https://registry.npmjs.org/',
    manifestSha256: createHash('sha256').update(manifest).digest('hex'),
    plugins: [{ package: 'third-party', version: '2.0.0', metadata: { name: 'third-party', version: '2.0.0', dsh: { compatibility: { dshReleases: { '0.1.7-rc.2': 'compatible' } } } } }],
  }))
  const before = await readFile(join(workflow, 'project-plugins.lock.json'))
  const queried = []
  const report = await checkPluginVersions({ resourcesRoot: resources, home, fetchLatest: async name => {
    queried.push(name)
    if (name === 'external-plugin') return '1.1.0'
    if (name === 'bundle-only') return '1.3.0'
    if (name === 'third-party') return '2.0.0'
    if (name === 'disabled-plugin') return '2.0.0'
    throw new Error('unexpected query')
  } })
  assert.deepEqual(queried, [], 'local inventory never queries a registry')
  const byName = Object.fromEntries(report.rows.map(row => [row.name, row]))
  assert.equal(byName['external-plugin'].status, 'untracked')
  assert.equal(byName['third-party'].status, 'expected')
  assert.equal(byName['external-plugin'].supportedDsh, '>=0.1.5-rc.1')
  assert.equal(byName['bundle-only'].supportedDsh, '0.1.7-rc.2（明确标注）')
  assert.equal(byName['third-party'].supportedDsh, '0.1.7-rc.2（明确标注）')
  assert.equal(byName['disabled-plugin'].supportedDsh, '未声明')
  assert.equal(byName['local-plugin'].supportedDsh, '无法读取')
  assert.equal(byName['external-plugin'].latestSupportedDsh, '未给精确最高版')
  assert.equal(byName['bundle-only'].latestSupportedDsh, '0.1.7-rc.2（逐版标注）')
  assert.equal(byName['third-party'].latestSupportedDsh, '0.1.7-rc.2（逐版标注）')
  assert.equal(byName['disabled-plugin'].latestSupportedDsh, '未声明')
  assert.equal(byName['local-plugin'].latestSupportedDsh, '无法读取')
  assert.equal(byName['local-plugin'].status, 'local')
  assert.equal(byName['bundle-only'].status, 'untracked')
  assert.equal(byName['disabled-plugin'].status, 'untracked')
  assert.equal(byName['@deepseek-ai/dsh-base'].status, 'drift')
  assert.equal(byName['@deepseek-ai/dsh-base'].current, '0.1.0')
  assert.equal(byName['@deepseek-ai/dsh-base'].expected, '0.1.7-rc.2')
  assert.equal(byName['dsh-workflow'].status, 'bundled')
  assert.equal(byName['dsh-workflow-matt-panel'].source, 'App 内置派生插件')
  assert.equal(byName['dsh-workflow-matt-panel'].status, 'bundled')
  assert.equal(byName['dsh-workflow-matt-panel'].updatable, false)
  assert.match(byName['dsh-workflow-matt-panel'].note, /上游基准 1.7.39/)
  assert.equal(queried.includes('dsh-workflow-matt-panel'), false)
  assert.equal(byName['mattpocock-skills-zh'].status, 'bundled')
  assert.equal(byName['mattpocock-skills-zh'].current, '0.1.4')
  assert.equal(byName['mattpocock-skills-zh'].updatable, false)
  assert.equal(byName['external-plugin'].updatable, false)
  assert.equal(byName['disabled-plugin'].updatable, false, 'a dependency outside the enabled bundles is not updatable')
  assert.equal(byName['bundle-only'].updatable, false, 'bundle-only plugins are not npm-managed dependencies')
  assert.equal(byName['third-party'].updatable, false)
  assert.equal(byName['local-plugin'].updatable, false)
  assert.equal(byName['@deepseek-ai/dsh-base'].updatable, false)
  assert.equal(byName['dsh-workflow'].updatable, false)
  assert.deepEqual(await readFile(join(workflow, 'project-plugins.lock.json')), before)
})


test('a malformed self-owned plugin remains a failed row without discarding completed plugin checks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-t08-plugin-check-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resources = join(root, 'resources'), home = join(root, 'home')
  const profile = join(home, 'profiles/desktop')
  const healthy = 'dsh-t08-healthy', damaged = 'dsh-t08-damaged'
  await mkdir(join(resources, 'workflow'), { recursive: true })
  await mkdir(join(profile, 'node_modules', healthy), { recursive: true })
  await mkdir(join(profile, 'node_modules', damaged), { recursive: true })
  await writeFile(join(profile, 'package.json'), JSON.stringify({
    dependencies: { [healthy]: '1.0.0', [damaged]: '1.0.0' },
    dsh: { profile: { bundles: [healthy, damaged] } },
  }))
  await writeFile(join(profile, 'node_modules', healthy, 'package.json'),
    JSON.stringify({ name: healthy, version: '1.0.0' }))
  const damagedManifest = join(profile, 'node_modules', damaged, 'package.json')
  await writeFile(damagedManifest, '{"name":"dsh-t08-damaged", invalid')
  const original = await readFile(damagedManifest)
  const report = await checkPluginVersions({ resourcesRoot: resources, home, profileName: 'desktop',
    fetchLatest: async name => {
      assert.equal(name, healthy, 'the unreadable plugin is not advertised as checked')
      return '1.1.0'
    },
  })
  const byName = Object.fromEntries(report.rows.map(row => [row.name, row]))
  assert.equal(byName[healthy].status, 'untracked')
  assert.equal(byName[healthy].current, '1.0.0')
  assert.equal(byName[healthy].latest, null)
  assert.equal(byName[damaged].status, 'error')
  assert.equal(byName[damaged].current, null)
  assert.equal(byName[damaged].latest, null)
  assert.equal(byName[damaged].updatable, false)
  assert.match(byName[damaged].note, /无法读取已安装插件/u)
  assert.equal(byName[damaged].supportedDsh, '无法读取')
  assert.deepEqual(await readFile(damagedManifest), original, 'checking does not repair package sources')
})

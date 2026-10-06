import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { checkPluginVersions, compareVersions, declaredDshVersions, latestDeclaredDsh } from './plugin-versions.mjs'

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
  const root = await mkdtemp('/private/tmp/dsh-plugin-versions-test-')
  t.after(() => rm(root, { recursive: true, force: true }))
  const resources = join(root, 'resources'), workflow = join(resources, 'workflow'), home = join(root, 'home')
  const profile = join(home, 'profiles', 'web')
  await mkdir(join(profile, 'node_modules', 'external-plugin'), { recursive: true })
  await mkdir(join(profile, 'node_modules', 'bundle-only'), { recursive: true })
  await mkdir(join(profile, 'node_modules', 'disabled-plugin'), { recursive: true })
  await mkdir(join(resources, 'node_modules', '@deepseek-ai', 'dsh-base'), { recursive: true })
  await mkdir(join(workflow, 'owner-workflow-plugin'), { recursive: true })
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
  await writeFile(join(workflow, 'owner-workflow-plugin', 'package.json'), JSON.stringify({ name: 'dsh-owner-workflow', version: '0.1.0' }))
  const manifest = JSON.stringify({ registry: 'https://registry.npmjs.org/', plugins: [{ package: 'third-party', version: 'latest' }] })
  await writeFile(join(workflow, 'project-plugins.json'), manifest)
  await writeFile(join(workflow, 'project-plugins.lock.json'), JSON.stringify({
    manifestSha256: createHash('sha256').update(manifest).digest('hex'),
    plugins: [{ package: 'third-party', version: '2.0.0', metadata: { dsh: { compatibility: { dshReleases: { '0.1.7-rc.2': 'compatible' } } } } }],
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
  assert.deepEqual(queried.sort(), ['bundle-only', 'disabled-plugin', 'external-plugin', 'third-party'])
  const byName = Object.fromEntries(report.rows.map(row => [row.name, row]))
  assert.equal(byName['external-plugin'].status, 'newer')
  assert.equal(byName['third-party'].status, 'current')
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
  assert.equal(byName['bundle-only'].status, 'newer')
  assert.equal(byName['disabled-plugin'].status, 'newer')
  assert.equal(byName['@deepseek-ai/dsh-base'].status, 'coupled')
  assert.equal(byName['dsh-owner-workflow'].status, 'bundled')
  assert.equal(byName['dsh-workflow-matt-panel'].source, 'App 内置派生插件')
  assert.equal(byName['dsh-workflow-matt-panel'].status, 'bundled')
  assert.equal(byName['dsh-workflow-matt-panel'].updatable, false)
  assert.match(byName['dsh-workflow-matt-panel'].note, /上游基准 1.7.39/)
  assert.equal(queried.includes('dsh-workflow-matt-panel'), false)
  assert.equal(byName['mattpocock-skills-zh'].status, 'bundled')
  assert.equal(byName['mattpocock-skills-zh'].current, '0.1.4')
  assert.equal(byName['mattpocock-skills-zh'].updatable, false)
  assert.equal(byName['external-plugin'].updatable, true)
  assert.equal(byName['disabled-plugin'].updatable, false, 'a dependency outside the enabled bundles is not updatable')
  assert.equal(byName['bundle-only'].updatable, false, 'bundle-only plugins are not npm-managed dependencies')
  assert.equal(byName['third-party'].updatable, false)
  assert.equal(byName['local-plugin'].updatable, false)
  assert.equal(byName['@deepseek-ai/dsh-base'].updatable, false)
  assert.equal(byName['dsh-owner-workflow'].updatable, false)
  assert.deepEqual(await readFile(join(workflow, 'project-plugins.lock.json')), before)
})


test('a malformed self-owned plugin remains a failed row without discarding completed plugin checks', async t => {
  const root = await mkdtemp('/private/tmp/dsh-t08-plugin-check-')
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
  assert.equal(byName[healthy].status, 'newer')
  assert.equal(byName[healthy].current, '1.0.0')
  assert.equal(byName[healthy].latest, '1.1.0')
  assert.equal(byName[damaged].status, 'error')
  assert.equal(byName[damaged].current, null)
  assert.equal(byName[damaged].latest, null)
  assert.equal(byName[damaged].updatable, false)
  assert.match(byName[damaged].note, /无法读取已安装插件/u)
  assert.equal(byName[damaged].supportedDsh, '无法读取')
  assert.deepEqual(await readFile(damagedManifest), original, 'checking does not repair package sources')
})

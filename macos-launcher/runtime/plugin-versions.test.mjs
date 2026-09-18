import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { checkPluginVersions, compareVersions } from './plugin-versions.mjs'

test('version report compares SemVer without treating a prerelease as newer than stable', () => {
  assert.equal(compareVersions('1.2.3-rc.2', '1.2.3'), -1)
  assert.equal(compareVersions('1.2.3', '1.2.3-rc.2'), 1)
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
  assert.equal(compareVersions('1.2.3', '2.0.0'), -1)
  assert.equal(compareVersions('link:../source', '2.0.0'), null)
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
  await writeFile(join(profile, 'package.json'), JSON.stringify({ dependencies: {
    'external-plugin': '1.0.0', 'local-plugin': 'link:/local/plugin', 'disabled-plugin': '1.0.0',
  }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'bundle-only', 'external-plugin'] } } }))
  await writeFile(join(profile, 'node_modules', 'external-plugin', 'package.json'), JSON.stringify({ name: 'external-plugin', version: '1.0.0' }))
  await writeFile(join(profile, 'node_modules', 'bundle-only', 'package.json'), JSON.stringify({ name: 'bundle-only', version: '1.2.0' }))
  await writeFile(join(profile, 'node_modules', 'disabled-plugin', 'package.json'), JSON.stringify({ name: 'disabled-plugin', version: '1.0.0' }))
  await writeFile(join(resources, 'node_modules', '@deepseek-ai', 'dsh-base', 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-base', version: '0.1.0' }))
  await writeFile(join(workflow, 'owner-workflow-plugin', 'package.json'), JSON.stringify({ name: 'dsh-owner-workflow', version: '0.1.0' }))
  const manifest = JSON.stringify({ registry: 'https://registry.npmjs.org/', plugins: [{ package: 'third-party', version: 'latest' }] })
  await writeFile(join(workflow, 'project-plugins.json'), manifest)
  await writeFile(join(workflow, 'project-plugins.lock.json'), JSON.stringify({
    manifestSha256: createHash('sha256').update(manifest).digest('hex'),
    plugins: [{ package: 'third-party', version: '2.0.0' }],
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
  assert.equal(byName['local-plugin'].status, 'local')
  assert.equal(byName['bundle-only'].status, 'newer')
  assert.equal(byName['disabled-plugin'].status, 'newer')
  assert.equal(byName['@deepseek-ai/dsh-base'].status, 'coupled')
  assert.equal(byName['dsh-owner-workflow'].status, 'bundled')
  assert.equal(byName['external-plugin'].updatable, true)
  assert.equal(byName['disabled-plugin'].updatable, false, 'a dependency outside the enabled bundles is not updatable')
  assert.equal(byName['bundle-only'].updatable, false, 'bundle-only plugins are not npm-managed dependencies')
  assert.equal(byName['third-party'].updatable, false)
  assert.equal(byName['local-plugin'].updatable, false)
  assert.equal(byName['@deepseek-ai/dsh-base'].updatable, false)
  assert.equal(byName['dsh-owner-workflow'].updatable, false)
  assert.deepEqual(await readFile(join(workflow, 'project-plugins.lock.json')), before)
})

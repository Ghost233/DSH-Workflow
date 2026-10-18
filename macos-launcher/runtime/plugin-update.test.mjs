import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureStartupPlugins, updateCandidates, updateProfilePlugins, synchronizeProfilePlugins } from './plugin-update.mjs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const external = { source: 'DSH Web profile', name: 'dsh-context', current: '1.0.0', latest: '1.1.0', status: 'newer' }
const team = { source: 'DSH Web profile', name: '@deepseek-ai/dsh-experimental-agent-team-profile', current: '0.1.6-alpha.1', latest: '0.2.0', status: 'newer' }

test('runtime direct plugin replacement is refused before any registry or package-tool operation', async () => {
  let checks = 0, runs = 0
  await assert.rejects(updateProfilePlugins({ resourcesRoot: '/unused', home: '/unused',
    check: async () => { checks++; return { checkedAt: 'fixture', rows: [] } },
    run: async () => { runs++ },
  }), /本仓库.*DMG/)
  assert.equal(checks, 0)
  assert.equal(runs, 0)
})

test('repository-delivered profiles offer no independent runtime update candidates', () => {
  assert.deepEqual(updateCandidates({ rows: [external, team,
    { ...external, source: '项目插件锁定清单（打包快照）', name: 'dsh-cost-meter' },
    { ...external, name: 'dsh-workflow' },
    { ...external, name: 'local-plugin', status: 'local' },
  ] }), [])
})

test('marked project plugins join Web profile using the single configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-startup-'))
  try {
    const resources = join(root, 'resources'), workflow = join(resources, 'workflow')
    const home = join(root, 'home'), profile = join(home, 'profiles/web')
    await mkdir(workflow, { recursive: true })
    await mkdir(join(profile, 'node_modules/dsh-context'), { recursive: true })
    const plugins = [
      { package: 'dsh-context', version: '0.60.0', startup: true },
      { package: 'dsh-cost-meter', version: '1.7.37', startup: true },
      { package: 'dsh-mattpocock-skills-deck', version: '1.7.30', startup: true },
    ]
    const manifest = JSON.stringify({ registry: 'https://registry.npmjs.org/', plugins })
    await writeFile(join(workflow, 'project-plugins.json'), manifest)
    await writeFile(join(workflow, 'dsh-runtime.json'), JSON.stringify({ version: '0.1.7-rc.2' }))
    await writeFile(join(workflow, 'project-plugins.lock.json'), JSON.stringify({ schema: 1, harnessVersion: '0.1.7-rc.2',
      registry: 'https://registry.npmjs.org/', manifestSha256: createHash('sha256').update(manifest).digest('hex'),
      plugins: plugins.map(({ package: name, version }) => ({ package: name, version, metadata: { name, version } })) }))
    await writeFile(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'dsh-context': '0.60.0' },
      dsh: { profile: { bundles: ['dsh-context'] } } }))
    await writeFile(join(profile, 'node_modules/dsh-context/package.json'), JSON.stringify({ name: 'dsh-context', version: '0.60.0' }))
    const calls = []
    const result = await ensureStartupPlugins({ resourcesRoot: resources, home, run: async ({ candidates, registry }) => {
      const { name, latest } = candidates[0]
      calls.push({ name, latest, registry })
      if (name === 'dsh-cost-meter') throw new Error('install unavailable')
      await mkdir(join(profile, 'node_modules', name), { recursive: true })
      await writeFile(join(profile, 'node_modules', name, 'package.json'), JSON.stringify({ name, version: latest }))
      const data = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'))
      data.dependencies[name] = latest
      data.dsh.profile.bundles.push(name)
      await writeFile(join(profile, 'package.json'), JSON.stringify(data))
    } })
    assert.deepEqual(result.already, [{ name: 'dsh-context', version: '0.60.0' }])
    assert.deepEqual(result.added, [{ name: 'dsh-mattpocock-skills-deck', version: '1.7.30' }])
    assert.deepEqual(result.skipped, [{ name: 'dsh-cost-meter', reason: 'install unavailable' }])
    assert.deepEqual(calls.map(({ name, latest }) => `${name}@${latest}`), ['dsh-cost-meter@1.7.37', 'dsh-mattpocock-skills-deck@1.7.30'])
    assert.ok(calls.every(row => row.registry === 'https://registry.npmjs.org/'))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('runtime update and sync preserve installed profiles and the historical user configuration', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-package-readonly-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = []
  for (const profileName of ['web', 'desktop']) {
    const profile = join(root, 'profiles', profileName)
    await mkdir(join(profile, 'node_modules/dsh-context'), { recursive: true })
    const manifest = join(profile, 'package.json'), actual = join(profile, 'node_modules/dsh-context/package.json')
    await writeFile(manifest, JSON.stringify({ dependencies: { 'dsh-context': '1.0.0' }, dsh: { profile: { bundles: ['dsh-context'] } } }))
    await writeFile(actual, JSON.stringify({ name: 'dsh-context', version: '1.0.0' }))
    paths.push(manifest, actual)
  }
  await mkdir(join(root, 'workflow'), { recursive: true })
  const saved = join(root, 'workflow/project-plugins.json')
  await writeFile(saved, JSON.stringify({ registry: 'https://registry.npmjs.org/', plugins: [{ package: 'dsh-context', version: '9.9.9' }] }))
  paths.push(saved)
  const before = await Promise.all(paths.map(path => readFile(path, 'utf8')))
  for (const operation of [updateProfilePlugins, synchronizeProfilePlugins]) {
    for (const profileName of ['web', 'desktop']) for (const only of [undefined, ['dsh-context']]) {
      await assert.rejects(operation({ resourcesRoot: root, home: root, profileName, only,
        check: () => assert.fail('Runtime package rejection must not query a registry'),
        run: () => assert.fail('Runtime package rejection must not start a package tool'),
      }), /本仓库.*DMG/)
    }
  }
  assert.deepEqual(await Promise.all(paths.map(path => readFile(path, 'utf8'))), before)
})

test('empty and invalid runtime selections still reject package replacement before external work', async () => {
  for (const operation of [updateProfilePlugins, synchronizeProfilePlugins]) for (const only of [[], ['not a name']]) {
    await assert.rejects(operation({ resourcesRoot: '/unused', home: '/unused', only,
      check: () => assert.fail('must not check'), run: () => assert.fail('must not run'),
    }), /本仓库.*DMG/)
  }
})

test('runtime updater and sync CLI commands report DMG delivery without creating profile data', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-package-cli-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const script = fileURLToPath(new URL('./plugin-update.mjs', import.meta.url))
  for (const args of [[], ['--sync', '--only', 'dsh-context']]) {
    const result = spawnSync(process.execPath, [script, root, ...args], { encoding: 'utf8', env: { ...process.env, DSH_HOME: root } })
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /本仓库.*DMG/)
    assert.equal(result.stdout, '')
  }
  await assert.rejects(readFile(join(root, 'profiles/web/package.json')), { code: 'ENOENT' })
  await assert.rejects(readFile(join(root, 'workflow/project-plugins.json')), { code: 'ENOENT' })
})

test('packaged run-dsh rejects package mutation before loading the upstream CLI', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-maintenance-cli-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'project-layer.json'), JSON.stringify({ schema: 1, sourceCommit: 'packaged-fixture' }))
  const script = fileURLToPath(new URL('./run-dsh.mjs', import.meta.url))
  for (const args of [['plugin', '--profile', 'desktop', 'add', 'dsh-context@1.0.0'],
    ['plugin', 'add', 'dsh-context@1.0.0', '--profile=desktop', '--workflow-sync'],
    ['plugin', '--profile', 'desktop', 'remove', 'dsh-context']]) {
    const result = spawnSync(process.execPath, [script, root, ...args], { encoding: 'utf8', env: { ...process.env, DSH_HOME: root } })
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /本仓库.*DMG/)
    assert.equal(result.stdout, '')
  }
  await assert.rejects(readFile(join(root, 'profiles/desktop/package.json')), { code: 'ENOENT' })
})

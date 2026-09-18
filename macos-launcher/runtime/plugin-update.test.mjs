import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { updateCandidates, updateProfilePlugins } from './plugin-update.mjs'

const external = { source: 'DSH Web profile', name: 'dsh-context', current: '1.0.0', latest: '1.1.0', status: 'newer' }
const team = { source: 'DSH Web profile', name: '@deepseek-ai/dsh-experimental-agent-team-profile', current: '0.1.6-alpha.1', latest: '0.2.0', status: 'newer' }

test('only independent npm Web-profile plugins are update candidates', () => {
  assert.deepEqual(updateCandidates({ rows: [external, team,
    { ...external, source: '项目插件锁定清单（打包快照）', name: 'dsh-cost-meter' },
    { ...external, name: 'dsh-owner-workflow' },
    { ...external, name: 'local-plugin', status: 'local' },
  ] }), [external])
})

test('plugin update changes only the selected profile package and returns a restart receipt', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-plugin-update-'))
  const profile = join(home, 'profiles/web')
  try {
    await mkdir(join(profile, 'node_modules/dsh-context'), { recursive: true })
    const manifestPath = join(profile, 'package.json')
    await writeFile(manifestPath, JSON.stringify({ dependencies: { 'dsh-context': '1.0.0', 'dsh-owner-workflow': 'link:/owned', 'plain-library': '1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-context'] } } }))
    await writeFile(join(profile, 'node_modules/dsh-context/package.json'), JSON.stringify({ name: 'dsh-context', version: '1.0.0' }))
    const result = await updateProfilePlugins({ resourcesRoot: home, home,
      check: async () => ({ checkedAt: '2026-09-18T00:00:00Z', rows: [external, team, { ...external, name: 'plain-library' }] }),
      run: async ({ candidates }) => {
        assert.deepEqual(candidates, [external])
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
        manifest.dependencies['dsh-context'] = '1.1.0'
        await writeFile(manifestPath, JSON.stringify(manifest))
        await writeFile(join(profile, 'node_modules/dsh-context/package.json'), JSON.stringify({ name: 'dsh-context', version: '1.1.0' }))
      } })
    assert.deepEqual(result.updated, [{ name: 'dsh-context', from: '1.0.0', to: '1.1.0' }])
    assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).dependencies['dsh-owner-workflow'], 'link:/owned')
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('an empty new profile needs no package-manager invocation', async () => {
  const result = await updateProfilePlugins({ resourcesRoot: '/unused', home: '/unused',
    check: async () => ({ checkedAt: '2026-09-18T00:00:00Z', rows: [] }),
    run: () => { throw new Error('must not run') } })
  assert.deepEqual(result.updated, [])
})

test('a selected subset updates only the chosen plugin', async t => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-plugin-only-'))
  const profile = join(home, 'profiles/web')
  try {
    await mkdir(join(profile, 'node_modules/dsh-context'), { recursive: true })
    await mkdir(join(profile, 'node_modules/dsh-other'), { recursive: true })
    const manifestPath = join(profile, 'package.json')
    await writeFile(manifestPath, JSON.stringify({ dependencies: { 'dsh-context': '1.0.0', 'dsh-other': '1.0.0' },
      dsh: { profile: { bundles: ['dsh-context', 'dsh-other'] } } }))
    await writeFile(join(profile, 'node_modules/dsh-context/package.json'), JSON.stringify({ name: 'dsh-context', version: '1.0.0' }))
    await writeFile(join(profile, 'node_modules/dsh-other/package.json'), JSON.stringify({ name: 'dsh-other', version: '1.0.0' }))
    const rows = [
      { source: 'DSH Web profile', name: 'dsh-context', current: '1.0.0', latest: '1.1.0', status: 'newer' },
      { source: 'DSH Web profile', name: 'dsh-other', current: '1.0.0', latest: '2.0.0', status: 'newer' },
    ]
    const result = await updateProfilePlugins({ resourcesRoot: home, home, only: ['dsh-context'],
      check: async () => ({ checkedAt: '2026-09-18T00:00:00Z', rows }),
      run: async ({ candidates }) => {
        assert.deepEqual(candidates.map(row => row.name), ['dsh-context'])
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
        manifest.dependencies['dsh-context'] = '1.1.0'
        await writeFile(manifestPath, JSON.stringify(manifest))
        await writeFile(join(profile, 'node_modules/dsh-context/package.json'), JSON.stringify({ name: 'dsh-context', version: '1.1.0' }))
      } })
    assert.deepEqual(result.updated, [{ name: 'dsh-context', from: '1.0.0', to: '1.1.0' }])
    assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).dependencies['dsh-other'], '1.0.0')
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('invalid selections are rejected before any check runs', async () => {
  const fail = () => { throw new Error('must not check') }
  await assert.rejects(updateProfilePlugins({ resourcesRoot: '/unused', home: '/unused', only: [], check: fail }),
    /Invalid plugin selection/u)
  await assert.rejects(updateProfilePlugins({ resourcesRoot: '/unused', home: '/unused', only: ['not a name'], check: fail }),
    /Invalid plugin selection/u)
})

test('a failed update reports packages already changed so the launcher can still offer restart', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-plugin-partial-'))
  const profile = join(home, 'profiles/web')
  try {
    await mkdir(join(profile, 'node_modules/dsh-context'), { recursive: true })
    await writeFile(join(profile, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-context': '1.0.0' }, dsh: { profile: { bundles: ['dsh-context'] } },
    }))
    await writeFile(join(profile, 'node_modules/dsh-context/package.json'), JSON.stringify({ name: 'dsh-context', version: '1.0.0' }))
    const result = await updateProfilePlugins({ resourcesRoot: home, home,
      check: async () => ({ checkedAt: '2026-09-18T00:00:00Z', rows: [external] }),
      run: async () => {
        await writeFile(join(profile, 'node_modules/dsh-context/package.json'), JSON.stringify({ name: 'dsh-context', version: '1.1.0' }))
        throw new Error('profile validation failed')
      },
    })
    assert.deepEqual(result.updated, [{ name: 'dsh-context', from: '1.0.0', to: '1.1.0' }])
    assert.equal(result.error, 'profile validation failed')
  } finally { await rm(home, { recursive: true, force: true }) }
})

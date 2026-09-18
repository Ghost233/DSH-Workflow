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

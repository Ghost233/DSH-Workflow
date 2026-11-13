import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runtimeRequire } from '../../scripts/test-runtime.mjs'
import { startupPluginResults, prepareStartupPlugins } from './startup-plugins.mjs'

const versions = Object.fromEntries(JSON.parse(await readFile(new URL('../../project-plugins.json', import.meta.url), 'utf8'))
  .plugins.filter(item => item.startup === true).map(item => [item.package, item.version]))

// Only the external authenticated HTTP inventory is controlled here; no DSH or GUI is launched.
async function fixture(t, rows, native) {
  const root = await mkdtemp(join(tmpdir(), 's08-startup-http-'))
  const workflow = join(root, 'workflow')
  await mkdir(workflow)
  for (const name of ['project-plugins.json', 'project-plugins.lock.json', 'dsh-runtime.json']) {
    await copyFile(new URL(`../../${name}`, import.meta.url), join(workflow, name))
  }
  if (native) {
    const manifestPath = join(workflow, 'project-plugins.json'), lockPath = join(workflow, 'project-plugins.lock.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const lock = JSON.parse(await readFile(lockPath, 'utf8'))
    manifest.plugins.push(native)
    const content = JSON.stringify(manifest)
    lock.manifestSha256 = createHash('sha256').update(content).digest('hex')
    lock.plugins.push({ package: native.package, version: native.version, commit: native.commit,
      artifactSetSha256: 'b'.repeat(64), metadata: { name: native.package, version: native.version } })
    await writeFile(manifestPath, content)
    await writeFile(lockPath, JSON.stringify(lock))
  }
  const requests = []
  const server = createServer(async (request, response) => {
    requests.push({ method: request.method, path: request.url })
    if (request.method === 'GET') { response.writeHead(303, { 'set-cookie': 'session=owned-fixture; HttpOnly' }); response.end(); return }
    assert.equal(request.headers.cookie, 'session=owned-fixture')
    let body = ''
    for await (const chunk of request) body += chunk
    const input = JSON.parse(body)
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ type: 'server-response', rpcId: input.rpcId,
      result: { ok: true, value: { actualScope: 'runtime-resolution', rows } } }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }) })
  return { root, requests, url: `http://127.0.0.1:${server.address().port}/?token=owned-fixture` }
}

const row = (name, version, extra = {}) => ({ scope: 'Host', moduleName: name, package: name,
  current: version, source: `/owned/${name}`, status: 'fixed', enabled: true, fiberPhase: 'active', ...extra })

const resultFor = (results, name) => results.find(row => row.package === name)

test('startup outcomes report the installed profile version, disabled, failed and absent entries', async t => {
  const f = await fixture(t, [row('dsh-context', versions['dsh-context']),
    row('dsh-cost-meter', versions['dsh-cost-meter'], { enabled: false, fiberPhase: null }),
    row('@nagi-ovo/dsh-visualize', versions['@nagi-ovo/dsh-visualize'], { fiberPhase: 'failed' }),
    row('dsh-skill-mcp-panel', '2.3.11', { status: 'drift' })])
  const results = await startupPluginResults({ resourcesRoot: f.root, url: f.url })
  assert.deepEqual(results.filter(row => row.state === 'loaded').map(row => row.package), ['dsh-context', 'dsh-skill-mcp-panel'])
  assert.match(resultFor(results, 'dsh-cost-meter').reason, /停用/)
  assert.match(resultFor(results, '@nagi-ovo/dsh-visualize').reason, /失败/)
  const panel = resultFor(results, 'dsh-skill-mcp-panel')
  assert.equal(panel.versionSource, 'dsh-profile')
  assert.equal(panel.version, '2.3.11')
  assert.equal(panel.actualVersion, '2.3.11')
  assert.match(resultFor(results, 'dsh-better-sidebar').reason, /未装配/)
  assert.deepEqual(f.requests, [{ method: 'GET', path: '/?token=owned-fixture' },
    { method: 'POST', path: '/api/workflowDelivery/list' }])
})

test('an unknown runtime source is never reported as a loaded fixed package and later startup items remain visible', async t => {
  const f = await fixture(t, [row('dsh-context', versions['dsh-context'], { source: null }),
    row('dsh-cost-meter', versions['dsh-cost-meter'])])
  const results = await startupPluginResults({ resourcesRoot: f.root, url: f.url })
  assert.equal(resultFor(results, 'dsh-context').state, 'skipped')
  assert.match(resultFor(results, 'dsh-context').reason, /未知/)
  assert.equal(resultFor(results, 'dsh-cost-meter').state, 'loaded')
  assert.match(resultFor(results, '@nagi-ovo/dsh-visualize').reason, /未装配/)
  assert.match(resultFor(results, 'dshmarket').reason, /未装配/)
})

test('a settled enabled entry without a live fiber reports import failure while disabled and pending stay distinct', async t => {
  const f = await fixture(t, [row('dsh-context', versions['dsh-context'], { fiberPhase: null }),
    row('dsh-cost-meter', versions['dsh-cost-meter'], { enabled: false, fiberPhase: null }),
    row('@nagi-ovo/dsh-visualize', versions['@nagi-ovo/dsh-visualize'], { fiberPhase: 'pending' })])
  const results = await startupPluginResults({ resourcesRoot: f.root, url: f.url })
  assert.equal(resultFor(results, 'dsh-context').state, 'skipped')
  assert.match(resultFor(results, 'dsh-context').reason, /导入.*失败/)
  assert.match(resultFor(results, 'dsh-cost-meter').reason, /停用/)
  assert.match(resultFor(results, '@nagi-ovo/dsh-visualize').reason, /未知/)
})

test('a rejected startup preparation cannot be reported as loaded by a matching inventory row', async t => {
  const f = await fixture(t, [row('dsh-context', versions['dsh-context'])])
  const reason = '启动插件尝试失败：依赖来源声明与包内 Git 固定值不一致。'
  const results = await startupPluginResults({ resourcesRoot: f.root, url: f.url,
    preparation: [{ package: 'dsh-context', installedVersion: '0.73.3', installedSource: '/owned/dsh-context', reason }] })
  assert.equal(resultFor(results, 'dsh-context').state, 'skipped')
  assert.equal(resultFor(results, 'dsh-context').reason, reason)
})

test('the profile startup checklist never inserts or disables DSH-managed plugins', async t => {
  const profile = await mkdtemp(join(tmpdir(), 'station-profile-checklist-'))
  t.after(() => rm(profile, { recursive: true, force: true }))
  const packages = ['fixture-unselected', 'fixture-enabled']
  for (const name of packages) {
    const directory = join(profile, 'node_modules', name)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version: '2.0.0' }))
  }
  const entries = [{ id: 'enabled', name: packages[1], config: { saved: true } }]
  const config = { npmStartup: 'profile', plugins: packages.map(name => ({ package: name, version: '1.0.0', startup: true })) }
  const boot = {
    composeEntries: layers => layers.flatMap(layer => layer.flatMap(patch => patch.insert ?? [])),
    evaluatePluginCompatibility: manifest => manifest.name === packages[1] ? { exempted: false } : undefined,
    readProfileVersionExemptions: () => [],
    pluginCompatibilityWarning: () => 'Compatibility belongs to DSH',
  }
  assert.deepEqual(await prepareStartupPlugins({ profile, entries, config, boot }), { patches: [], skipped: [] })
})

test('an optional bundle with an invalid composed group is isolated before a valid sibling', async t => {
  const require = runtimeRequire
  const boot = require('@deepseek-ai/dsh-app-boot')
  const root = await mkdtemp(join(tmpdir(), 's08-owned-group-semantic-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const profile = join(root, 'profile')
  const badName = 's08-owned-malformed-group', goodName = 's08-owned-valid-sibling'
  const bad = [{ insert: [{ id: 'p2-optional-group', group: true, config: [] }] },
    { id: 'p2-optional-group', config: [null] }]
  const good = [{ insert: [{ id: 'p2-valid-sibling', name: goodName, config: { kept: true } }] }]
  for (const [name, patches] of [[badName, bad], [goodName, good]]) {
    const directory = join(profile, 'node_modules', name)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module',
      main: './index.mjs', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    await writeFile(join(directory, 'index.mjs'), `export const name=${JSON.stringify(name)}; export function apply(){}\n`)
    await writeFile(join(directory, 'cordis.patch.yml'), JSON.stringify(patches))
  }
  const entries = [{ id: 'p2-existing-disabled', name: 's08-owned-kept', disabled: true, config: { saved: 'keep' } }]
  const before = structuredClone(entries)
  const loaded = boot.loadOverlayPatches('s08', join(profile, 'node_modules', badName, 'cordis.patch.yml'))
  const composed = boot.composeEntries([[{ insert: entries }], loaded])
  assert.deepEqual(composed.find(row => row.id === 'p2-optional-group').config, [null])
  let traversalError
  try { await prepareStartupPlugins({ profile, entries: composed, config: { plugins: [] }, boot }) }
  catch (error) { traversalError = error }
  assert.equal(traversalError?.name, 'TypeError')
  assert.match(traversalError.message, /group/)
  console.log('S08_GROUP_SEMANTIC_FACTS=' + JSON.stringify({
    officialBoot: require.resolve('@deepseek-ai/dsh-app-boot'), officialParsePassed: true,
    officialComposePassed: true, projectTraversalError: { name: traversalError.name, message: traversalError.message },
  }))
  const result = await prepareStartupPlugins({ profile, entries,
    config: { plugins: [badName, goodName].map(name => ({ package: name, version: '1.0.0', startup: true })) }, boot })
  assert.deepEqual(result.skipped.map(row => row.package), [badName], 'Only the malformed optional package must be rejected')
  assert.match(result.skipped[0].reason, /失败/)
  const accepted = boot.composeEntries([[{ insert: entries }], result.patches])
  assert.equal(accepted.some(row => row.id === 'p2-optional-group'), false)
  assert.deepEqual(accepted.find(row => row.id === 'p2-valid-sibling'), good[0].insert[0])
  assert.deepEqual(accepted.find(row => row.id === 'p2-existing-disabled'), before[0])
  assert.deepEqual(entries, before, 'The original user entry must remain unchanged')
  await assert.doesNotReject(prepareStartupPlugins({ profile, entries: accepted, config: { plugins: [] }, boot }))
})

test('Git-pinned startup packages reject a same-version npm declaration while preserving other entries', async t => {
  const require = runtimeRequire
  const boot = require('@deepseek-ai/dsh-app-boot')
  for (const existing of [false, true]) await t.test(existing ? 'existing entry' : 'new entry', async t => {
    const root = await mkdtemp(join(tmpdir(), 's08-owned-source-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const profile = join(root, 'profile')
    const badName = 's08-owned-git-source', goodName = 's08-owned-npm-sibling', pinnedName = 's08-owned-git-sibling'
    const pin = { source: 'git', repository: 'https://github.com/owned/startup-fixture', commit: 'a'.repeat(40) }
    const config = { plugins: [
      { package: badName, version: '1.3.0', startup: true, ...pin },
      { package: goodName, version: '1.0.0', startup: true },
      { package: pinnedName, version: '1.0.0', startup: true, ...pin },
    ] }
    for (const item of config.plugins) {
      const directory = join(profile, 'node_modules', item.package)
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, 'package.json'), JSON.stringify({ name: item.package, version: item.version }))
    }
    const manifestPath = join(profile, 'package.json')
    const manifest = JSON.stringify({ dependencies: { [badName]: '1.3.0', [goodName]: '1.0.0',
      [pinnedName]: `git+https://github.com/owned/startup-fixture.git#${'a'.repeat(40)}` } })
    await writeFile(manifestPath, manifest)
    const entries = [{ id: 's08-owned-kept', name: 's08-owned-keeper', disabled: true, config: { saved: 'keep' } }]
    if (existing) entries.push({ id: 's08-owned-group', group: true, config: [
      { id: 's08-owned-source', name: `${badName}/index.mjs`, config: { saved: 'source-setting' } },
      { id: 's08-owned-disabled', name: badName, disabled: true, config: { saved: 'disabled-setting' } },
    ] })
    const before = structuredClone(entries)
    const result = await prepareStartupPlugins({ profile, entries, config, boot })
    assert.deepEqual(result.skipped.map(row => row.package), [badName])
    assert.match(result.skipped[0].reason, /依赖.*来源.*声明/)
    const accepted = boot.composeEntries([[{ insert: entries }], result.patches])
    assert.deepEqual(accepted.find(row => row.id === 's08-owned-kept'), before[0])
    assert.equal(accepted.some(row => row.name === goodName), true)
    assert.equal(accepted.some(row => row.name === pinnedName), true)
    if (existing) {
      assert.deepEqual(accepted.find(row => row.id === 's08-owned-group').config, [
        { ...before[1].config[0], disabled: true }, before[1].config[1],
      ])
    } else assert.equal(accepted.some(row => row.name === badName), false)
    assert.deepEqual(entries, before, 'Saved conditions, disabled state and configuration must not be mutated')
    assert.equal(await readFile(manifestPath, 'utf8'), manifest, 'Preparation must not rewrite dependency declarations')
  })
})

test('native bundle readiness requires every component and its actual namespaced preset fiber', async t => {
  const native = { package: 'fixture-native', version: '1.0.0', source: 'artifact', bundle: 'native', startup: true,
    repository: 'https://github.com/owned/startup-fixture', commit: 'a'.repeat(40), artifactSet: 'fixture.json',
    components: [{ package: 'fixture-native-core', version: '1.0.0' }, { package: 'fixture-native-ui', version: '1.0.0' }],
    requiredEntries: ['fixture-native-preset'] }
  const rows = native.components.map(component => row(component.package, component.version))
  const preset = row('@deepseek-ai/dsh-agent-preset', '0.2.2-rc.1', { entryId: 'include:fixture-native-preset' })
  const missing = await fixture(t, rows, native)
  assert.equal((await startupPluginResults({ resourcesRoot: missing.root, url: missing.url })).find(item => item.package === native.package).state, 'skipped')
  const complete = await fixture(t, [...rows, preset], native)
  assert.equal((await startupPluginResults({ resourcesRoot: complete.root, url: complete.url })).find(item => item.package === native.package).state, 'loaded')
})

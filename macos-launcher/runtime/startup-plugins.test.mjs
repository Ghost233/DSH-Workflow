import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { startupPluginResults, prepareStartupPlugins } from './startup-plugins.mjs'

// Only the external authenticated HTTP inventory is controlled here; no DSH or GUI is launched.
async function fixture(t, rows) {
  const root = await mkdtemp(join(tmpdir(), 's08-startup-http-'))
  const workflow = join(root, 'workflow')
  await mkdir(workflow)
  for (const name of ['project-plugins.json', 'project-plugins.lock.json', 'dsh-runtime.json']) {
    await copyFile(new URL(`../../${name}`, import.meta.url), join(workflow, name))
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

test('startup outcomes distinguish actual loading, disabled, failed, drift and absence without package mutation', async t => {
  const f = await fixture(t, [row('dsh-context', '0.66.1'),
    row('dsh-cost-meter', '1.8.19', { enabled: false, fiberPhase: null }),
    row('@nagi-ovo/dsh-visualize', '0.1.4', { fiberPhase: 'failed' }),
    row('billion-context', '0.1.185', { status: 'drift' })])
  const results = await startupPluginResults({ resourcesRoot: f.root, url: f.url })
  assert.deepEqual(results.map(item => item.state), ['loaded', 'skipped', 'skipped', 'skipped'])
  assert.match(results[1].reason, /停用/)
  assert.match(results[2].reason, /失败/)
  assert.match(results[3].reason, /偏离/)
  assert.equal(results[3].version, '0.1.184')
  assert.equal(results[3].actualVersion, '0.1.185')
  assert.deepEqual(f.requests, [{ method: 'GET', path: '/?token=owned-fixture' },
    { method: 'POST', path: '/api/workflowDelivery/list' }])
})

test('an unknown runtime source is never reported as a loaded fixed package and later startup items remain visible', async t => {
  const f = await fixture(t, [row('dsh-context', '0.66.1', { source: null }),
    row('dsh-cost-meter', '1.8.19')])
  const results = await startupPluginResults({ resourcesRoot: f.root, url: f.url })
  assert.equal(results[0].state, 'skipped')
  assert.match(results[0].reason, /未知/)
  assert.equal(results[1].state, 'loaded')
  assert.match(results[2].reason, /未装配/)
  assert.match(results[3].reason, /未装配/)
})

test('a settled enabled entry without a live fiber reports import failure while disabled and pending stay distinct', async t => {
  const f = await fixture(t, [row('dsh-context', '0.66.1', { fiberPhase: null }),
    row('dsh-cost-meter', '1.8.19', { enabled: false, fiberPhase: null }),
    row('@nagi-ovo/dsh-visualize', '0.1.4', { fiberPhase: 'pending' })])
  const results = await startupPluginResults({ resourcesRoot: f.root, url: f.url })
  assert.equal(results[0].state, 'skipped')
  assert.match(results[0].reason, /导入.*失败/)
  assert.match(results[1].reason, /停用/)
  assert.match(results[2].reason, /未知/)
})

test('an optional bundle with an invalid composed group is isolated before a valid sibling', async t => {
  const require = createRequire(resolve('deepseek-harness/apps/cli/package.json'))
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

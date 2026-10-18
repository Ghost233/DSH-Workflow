import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startupPluginResults } from './startup-plugins.mjs'

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

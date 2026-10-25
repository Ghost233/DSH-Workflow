import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { stageBrowserHarnessSkills } from '../../browser-harness-plugin/build.mjs'
import { checkPluginVersions } from './plugin-versions.mjs'

test('launcher browser rows distinguish a fixed skill from a CLI observed in the actual DSH shell', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workflow-browser-report-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resourcesRoot = join(root, 'resources'), workflow = join(resourcesRoot, 'workflow'), dataRoot = join(root, 'data')
  await stageBrowserHarnessSkills(resolve('.'), workflow)
  await cp(resolve('browser-harness-plugin/package.json'), join(workflow, 'browser-harness-plugin/package.json'))
  const receipt = join(dataRoot, 'global/.dsh-workflow/desktop')
  await mkdir(receipt, { recursive: true })
  let state = { actualScope: 'dsh-shell', state: 'installed', path: '/dsh/tools/browser-harness', version: '0.1.13' }
  const requests = []
  const server = createServer(async (request, response) => {
    requests.push(request.url)
    response.setHeader('content-type', 'application/json')
    if (request.method === 'GET') { response.setHeader('set-cookie', 'owner=test; HttpOnly'); response.end('{}'); return }
    assert.equal(request.headers.cookie, 'owner=test')
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks))
    assert.equal(body.method, 'browserHarness/inspect')
    response.end(JSON.stringify({ type: 'server-response', rpcId: body.rpcId, result: { ok: true, value: state } }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  await writeFile(join(receipt, 'desktop-host.json'), JSON.stringify({ schema: 1, lease: 'fixture', pid: process.pid,
    url: `http://127.0.0.1:${server.address().port}/?token=fixture` }), { mode: 0o600 })
  const inspect = () => checkPluginVersions({ resourcesRoot, dataRoot, home: join(root, 'home') })
  let rows = (await inspect()).rows
  assert.equal(rows.find(row => row.name === 'Browser Harness Skill').current, '4ced8e0087d2d45ea2d08c00cb62449b2d94a90e')
  let cli = rows.find(row => row.name === 'browser-harness')
  assert.equal(cli.current, '0.1.13')
  assert.equal(cli.actualScope, 'dsh-shell')
  assert.match(cli.source, /\/dsh\/tools\/browser-harness/)
  assert.equal(cli.status, 'installed')
  state = { actualScope: 'dsh-shell', state: 'missing', path: null, version: null }
  cli = (await inspect()).rows.find(row => row.name === 'browser-harness')
  assert.equal(cli.status, 'missing')
  assert.equal(cli.current, null)
  await rm(join(receipt, 'desktop-host.json'))
  const before = requests.length
  cli = (await inspect()).rows.find(row => row.name === 'browser-harness')
  assert.equal(cli.status, 'unknown')
  assert.equal(cli.current, null)
  assert.equal(requests.length, before, 'missing Host must not fall back to a launcher-shell probe')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { WorkflowStore } from '../src/workflow-store.mjs'
import { KernelDashboard, createKernelDashboardHandler, renderKernelDashboardPage } from '../src/kernel-dashboard.mjs'
import { view, kernelDigest } from '../src/workflow-engine.mjs'

class Response extends EventEmitter {
  chunks = []; writableLength = 0
  writeHead(status, headers) { this.status = status; this.headers = headers }
  write(body) { this.chunks.push(body); return true }
  end(body) { if (body) this.write(body); this.ended = true; this.emit('close') }
  json() { return JSON.parse(this.chunks.join('')) }
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'ukr-dashboard-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = new WorkflowStore(root); await store.initialize()
  await store.transact({ type: 'workflow.create', id: 'wf-test', root, rootSessionId: 'root-session',
    request: '<script>untrusted goal</script>', baseCommit: 'a'.repeat(40) })
  return { root, store }
}
test('Dashboard and main thread read exactly the same workflow view without writing control or projections', async t => {
  const { root, store } = await fixture(t)
  const before = await readFile(store.path), files = await readdir(store.directory)
  let checks = 0
  const dashboard = new KernelDashboard(root, { health: () => ({ status: 'error', lastError: 'driver stopped', checks: ++checks }) })
  const first = await dashboard.snapshot(), second = await dashboard.snapshot()
  assert.equal(first.workspaces, second.workspaces, 'unchanged catalog reuses its validated projection')
  assert.equal(first.runner.checks, 1)
  assert.equal(second.runner.checks, 2, 'runner health remains live while state is unchanged')
  assert.deepEqual(first.workspaces[0].workflows[0], view(await store.read(), 'wf-test'))
  assert.equal(first.runner.status, 'error')
  assert.deepEqual(await readFile(store.path), before)
  assert.deepEqual(await readdir(store.directory), files)
  await store.transact({ type: 'workflow.create', id: 'wf-next', root, rootSessionId: 'root-session',
    request: 'New workflow', baseCommit: 'b'.repeat(40) })
  const changed = await dashboard.snapshot()
  assert.notEqual(changed.workspaces, first.workspaces)
  assert.equal(changed.workspaces[0].workflows.length, 2)
})
test('read-only routes do not create missing state or hide corrupt state behind an empty result', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-dashboard-empty-')); t.after(() => rm(root, { recursive: true, force: true }))
  const handler = createKernelDashboardHandler(root)
  let response = new Response(); await handler({ method: 'GET', url: '/owner-workflow/api/waits' }, response)
  assert.equal(response.status, 503); assert.deepEqual(await readdir(root), [])
  const store = new WorkflowStore(root); await store.initialize(); await writeFile(store.path, '{broken')
  response = new Response(); await handler({ method: 'GET', url: '/owner-workflow/api/waits' }, response)
  assert.equal(response.status, 503); assert.equal(await readFile(store.path, 'utf8'), '{broken')
})
test('settled legacy operations do not break the live status stream or appear as active workflows', async t => {
  const { root, store } = await fixture(t)
  await store.transact({ type: 'workflow.create', id: 'wf-current', root, rootSessionId: 'root-session',
    request: 'Current workflow', baseCommit: 'b'.repeat(40) })
  const state = await store.read()
  state.workflows['wf-test'].kind = 'operation'
  state.workflows['wf-test'].operationResult = { passed: true }
  state.actions['legacy-operation'] = { id: 'legacy-operation', kind: 'operation', workflowId: 'wf-test',
    attemptId: null, locks: ['host:operation'], status: 'succeeded', admitted: true, occupiesSlot: true,
    input: {}, inputDigest: kernelDigest({}), nextWakeAt: null }
  await writeFile(store.path, `${JSON.stringify(state)}\n`)
  const before = await readFile(store.path)
  const dashboard = new KernelDashboard(root)
  const snapshot = await dashboard.snapshot()
  assert.deepEqual(snapshot.workspaces.flatMap(workspace => workspace.workflows.map(workflow => workflow.workflowId)), ['wf-current'])
  const handler = createKernelDashboardHandler(root)
  t.after(() => handler.close())
  const response = new Response()
  await handler({ method: 'GET', url: '/owner-workflow/api/waits/events' }, response)
  assert.equal(response.status, 200)
  assert.equal(response.headers['Content-Type'], 'text/event-stream')
  assert.deepEqual(await readFile(store.path), before)
  state.actions['legacy-operation'].status = 'pending'
  await writeFile(store.path, `${JSON.stringify(state)}\n`)
  await assert.rejects(() => store.read(), /Invalid action record/,
    'a legacy operation that could still execute must remain rejected')
})
test('opaque workspace selection, GET-only routes and SSE disposal preserve the same snapshot', async t => {
  const { root, store } = await fixture(t)
  const handler = createKernelDashboardHandler(root, { intervalMs: 5 })
  t.after(() => handler.close())
  for (const [request, expected] of [[{ method: 'POST', url: '/owner-workflow/api/waits' }, 405],
    [{ method: 'GET', url: '/owner-workflow/api/workflows?workspace_id=../../outside' }, 404],
    [{ method: 'GET', url: '/owner-workflow/api/snapshot' }, 400]]) {
    const response = new Response(); await handler(request, response); assert.equal(response.status, expected)
  }
  const response = new Response(), before = await readFile(store.path)
  await handler({ method: 'GET', url: '/owner-workflow/api/waits/events' }, response)
  assert.equal(response.status, 200); assert.match(response.chunks[0], /DSH_KERNEL_STATUS_V1/)
  handler.close(); assert.equal(response.ended, true)
  assert.deepEqual(await readFile(store.path), before)
  const page = renderKernelDashboardPage()
  assert.doesNotMatch(page, /innerHTML/)
  assert.match(page, /textContent/)
})

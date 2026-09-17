import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { git } from '../src/git.mjs'
import { kernelDigest } from '../src/workflow-engine.mjs'
import { WorkflowDelivery } from '../src/workflow-delivery.mjs'

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-deliver-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const project = join(root, 'project'); await mkdir(project)
  await git(project, ['init', '-q']); await writeFile(join(project, 'source'), 'base')
  await git(project, ['add', '.']); await git(project, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'base'])
  const branch = await git(project, ['symbolic-ref', '--short', 'HEAD']); const base = await git(project, ['rev-parse', 'HEAD'])
  await git(project, ['checkout', '-qb', 'verified-candidate']); await writeFile(join(project, 'source'), 'candidate')
  await git(project, ['add', '.']); await git(project, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'candidate'])
  const commit = await git(project, ['rev-parse', 'HEAD']); await git(project, ['checkout', branch])
  const workflow = { root: project, baseBranch: branch, planVersion: 1, integrationHead: commit, finalVerification: { passed: true } }
  const input = { root: project, branch, expectedHead: base, commitSha: commit, planVersion: 1 }
  return { root, project, base, commit, workflow, store: { read: async () => ({ workflows: { wf: workflow } }) }, action: { id: 'delivery', workflowId: 'wf', input, inputDigest: kernelDigest(input) } }
}

test('delivery refuses a dirty checkout with a durable explicit failure and leaves every file intact', async t => {
  const f = await fixture(t); await writeFile(join(f.project, 'source'), 'user change'); await writeFile(join(f.project, 'untracked'), 'user file')
  const effect = new WorkflowDelivery(f.store, join(f.root, 'receipts'))
  const result = await effect.execute(f.action)
  assert.equal(result.blocked, true); assert.equal(result.executionSettled, true)
  assert.equal(await git(f.project, ['rev-parse', 'HEAD']), f.base)
  assert.equal(await readFile(join(f.project, 'source'), 'utf8'), 'user change')
  assert.equal(await readFile(join(f.project, 'untracked'), 'utf8'), 'user file')
  assert.deepEqual(await effect.observe(f.action), result)
})

test('delivery reconciles actual fast-forward after host failure without replaying checkout mutation', async t => {
  const f = await fixture(t)
  const effect = new WorkflowDelivery(f.store, join(f.root, 'receipts'), { fault: async () => { throw new Error('injected host failure') } })
  await assert.rejects(effect.execute(f.action), /injected host failure/)
  assert.equal(await git(f.project, ['rev-parse', 'HEAD']), f.commit)
  const recovered = new WorkflowDelivery(f.store, join(f.root, 'receipts'))
  const result = await recovered.observe(f.action)
  assert.equal(result.userCheckoutUpdated, true); assert.equal(result.commitSha, f.commit)
  assert.deepEqual(await recovered.execute(f.action), result)
})

test('a fresh delivery action succeeds after the fixture obstruction is resolved while retaining its failed receipt', async t => {
  const f = await fixture(t)
  const obstruction = join(f.project, 'fixture-obstruction')
  await writeFile(obstruction, 'The controller owns this test-only obstruction')
  const effect = new WorkflowDelivery(f.store, join(f.root, 'receipts'))
  const failed = await effect.execute(f.action)
  assert.equal(failed.blocked, true)
  assert.equal(await readFile(obstruction, 'utf8'), 'The controller owns this test-only obstruction')
  await rm(obstruction)
  const result = await effect.execute({ ...f.action, id: 'delivery-repair', retryOf: f.action.id })
  assert.equal(result.userCheckoutUpdated, true)
  assert.equal(await git(f.project, ['rev-parse', 'HEAD']), f.commit)
  assert.equal(await readFile(join(f.project, 'source'), 'utf8'), 'candidate')
  assert.deepEqual(await effect.observe(f.action), failed)
})

test('delivery accepts only the frozen planning document already identical to the verified commit', async t => {
  const f = await fixture(t)
  await git(f.project, ['checkout', 'verified-candidate'])
  await writeFile(join(f.project, 'spec.md'), 'frozen spec')
  await git(f.project, ['add', 'spec.md'])
  await git(f.project, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'planning document'])
  const commit = await git(f.project, ['rev-parse', 'HEAD'])
  await git(f.project, ['checkout', f.action.input.branch])
  await writeFile(join(f.project, 'spec.md'), 'frozen spec')
  f.workflow.integrationHead = commit
  f.action.input.commitSha = commit
  f.action.input.sourcePaths = ['spec.md']
  f.action.inputDigest = kernelDigest(f.action.input)
  const effect = new WorkflowDelivery(f.store, join(f.root, 'receipts'))
  const result = await effect.execute(f.action)
  assert.equal(result.userCheckoutUpdated, true)
  assert.equal(await git(f.project, ['rev-parse', 'HEAD']), commit)
  assert.equal(await git(f.project, ['status', '--porcelain']), '')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlanV2 } from '../src/model.mjs'
import { createControlState, kernelDigest, transition } from '../src/workflow-engine.mjs'

const sources = { checkpointId: 'checkpoint-1', snapshotDigest: 'snapshot-digest', packagesRef: '/artifacts/packages/result.json' }

function plan() {
  return normalizePlanV2({
    contract: 'DSH_PLAN_V2', registryDigest: 'a'.repeat(64), summary: 'Owner dispatch package binding',
    owners: [{ id: 'build', name: 'Build', description: 'Build boundary', scope: ['scripts/**'], exclude: [] }],
    tasks: [{ id: 'bootstrap', title: 'Bootstrap acceptance command', role: 'work', ownerId: 'build', write: ['scripts/**'],
      dependsOn: [], resources: [], verify: ['command-contract'], done: ['The command accepts --suite <name>.'],
      onFailure: { action: 'repair_owner', maxAttempts: 2 } }],
    verifications: [{ id: 'command-contract', run: ['node', 'scripts/verify-acceptance-command.mjs'], cwd: '.' }],
  })
}

test('dispatch and Owner repair retain the same immutable planning package binding', () => {
  let state = createControlState({ catalogId: '/catalog' })
  const send = event => { const result = transition(state, event, 1_000); state = result.state; return result.result }
  const currentPlan = plan()
  send({ type: 'workflow.create', id: 'wf', root: '/project', rootSessionId: 'root', request: 'fixture', baseCommit: 'base' })
  send({ type: 'plan.activate', workflowId: 'wf', parentVersion: 0, plan: currentPlan,
    authorization: { scope: 'implementation', sourceId: 'fixture' }, sources,
    review: { status: 'passed', planDigest: kernelDigest(currentPlan), evidenceRef: '/review' } })
  send({ type: 'drive' })
  const actions = kind => Object.values(state.actions).filter(action => action.kind === kind)
  const first = actions('execute_owner')[0]
  const expected = { packagesRef: sources.packagesRef, checkpointId: sources.checkpointId, snapshotDigest: sources.snapshotDigest,
    planVersion: 1, planDigest: kernelDigest(currentPlan), taskId: 'bootstrap', ownerId: 'build' }
  assert.deepEqual(first.input.taskPackage, expected)

  send({ type: 'action.claim', actionId: first.id, token: 'owner', hostId: 'host' })
  send({ type: 'action.started', actionId: first.id, token: 'owner', evidence: { handleId: 'owner', sessionId: 'owner' } })
  const attempt = state.workflows.wf.attempts[first.attemptId]
  send({ type: 'owner.submit', workflowId: 'wf', attemptId: attempt.id, authority: attempt.authority,
    report: { status: 'completed', summary: 'Candidate' }, manifestDigest: 'manifest', artifact: '/submission' })
  send({ type: 'action.result', actionId: first.id, token: 'owner', result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  const seal = actions('seal_candidate')[0]
  send({ type: 'action.claim', actionId: seal.id, token: 'seal', hostId: 'host' })
  send({ type: 'action.result', actionId: seal.id, token: 'seal', result: { artifact: '/candidate', commitSha: 'content', authority: attempt.authority } })
  const verification = actions('verify_candidate')[0]
  assert.deepEqual(verification.input.taskPackage, expected)
  send({ type: 'action.claim', actionId: verification.id, token: 'verify', hostId: 'host' })
  send({ type: 'action.result', actionId: verification.id, token: 'verify', result: { passed: false, commitSha: 'content', executionSettled: true,
    results: [{ verificationId: 'command-contract', passed: false, exitCode: 1, commitSha: 'content' }] } })
  const issueId = state.workflows.wf.attempts[attempt.id].issueId
  send({ type: 'task.retry', workflowId: 'wf', taskId: 'bootstrap', issueId, instructions: 'Repair the failed assertion', decisionRef: 'root:repair' })
  send({ type: 'drive' })
  const repaired = actions('execute_owner').at(-1)
  assert.notEqual(repaired.attemptId, first.attemptId)
  assert.deepEqual(repaired.input.taskPackage, expected)
  assert.equal(repaired.input.repair.fromAttemptId, first.attemptId)
})

test('a legacy same-candidate verification retry derives and persists its current immutable package binding', () => {
  let state = createControlState({ catalogId: '/catalog' })
  const send = event => { const result = transition(state, event, 1_000); state = result.state; return result.result }
  const currentPlan = plan()
  const expected = { packagesRef: sources.packagesRef, checkpointId: sources.checkpointId, snapshotDigest: sources.snapshotDigest,
    planVersion: 1, planDigest: kernelDigest(currentPlan), taskId: 'bootstrap', ownerId: 'build' }
  send({ type: 'workflow.create', id: 'wf', root: '/project', rootSessionId: 'root', request: 'fixture', baseCommit: 'base' })
  send({ type: 'plan.activate', workflowId: 'wf', parentVersion: 0, plan: currentPlan,
    authorization: { scope: 'implementation', sourceId: 'fixture' }, sources,
    review: { status: 'passed', planDigest: kernelDigest(currentPlan), evidenceRef: '/review' } })
  send({ type: 'drive' })
  const actions = kind => Object.values(state.actions).filter(action => action.kind === kind)
  const owner = actions('execute_owner')[0]
  send({ type: 'action.claim', actionId: owner.id, token: 'owner', hostId: 'host' })
  send({ type: 'action.started', actionId: owner.id, token: 'owner', evidence: { handleId: 'owner', sessionId: 'owner' } })
  const attempt = state.workflows.wf.attempts[owner.attemptId]
  send({ type: 'owner.submit', workflowId: 'wf', attemptId: attempt.id, authority: attempt.authority,
    report: { status: 'completed', summary: 'Candidate' }, manifestDigest: 'manifest', artifact: '/submission' })
  send({ type: 'action.result', actionId: owner.id, token: 'owner', result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  const seal = actions('seal_candidate')[0]
  send({ type: 'action.claim', actionId: seal.id, token: 'seal', hostId: 'host' })
  send({ type: 'action.result', actionId: seal.id, token: 'seal', result: { artifact: '/candidate', commitSha: 'content', authority: attempt.authority } })
  const failedId = actions('verify_candidate')[0].id
  send({ type: 'action.claim', actionId: failedId, token: 'verify', hostId: 'host' })
  send({ type: 'action.result', actionId: failedId, token: 'verify', result: { passed: false, commitSha: 'content', executionSettled: true,
    results: [{ verificationId: 'command-contract', status: 'execution_error', passed: false, commitSha: 'content', commandTermination: { managedRangeStopped: true } }] } })

  const failed = state.actions[failedId]
  failed.input.taskPackage = null
  failed.inputDigest = kernelDigest(failed.input)
  assert.throws(() => send({ type: 'action.retry', workflowId: 'wf', actionId: failed.id,
    reason: 'Dependency preparation is available', decisionRef: 'root:null-package' }), /source is no longer current/)

  delete failed.input.taskPackage
  failed.inputDigest = kernelDigest(failed.input)
  const id = send({ type: 'action.retry', workflowId: 'wf', actionId: failed.id,
    reason: 'Dependency preparation is available', decisionRef: 'root:legacy-package' })
  assert.deepEqual(state.actions[id].input.taskPackage, expected)
  assert.equal(state.actions[id].attemptId, attempt.id)
})

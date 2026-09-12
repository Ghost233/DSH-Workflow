import assert from 'node:assert/strict'
import test from 'node:test'
import { planReviewResult } from '../src/model.mjs'
import { plannerSubmitDefinition, planReviewSubmitDefinition } from '../index.js'
import { createRecoverySessionFixture, readRecoverySessionState, mutateRecoverySessionState, reopenRecoverySessionFixture } from './fixtures/recovery-session-fixture.mjs'

const review = status => ({ contract: 'DSH_PLAN_REVIEW_V1', status, summary: 'Independent candidate review.', issues: status === 'needs_revision' ? [{ severity: 'medium', title: 'Local repair incomplete', detail: 'Repair needs another local adjustment.', suggestion: 'Complete the existing local contract.', obligationId: 'review-local-verification', sourceId: 'local-review-observation', sourceVersion: 'fixture-v1', targetTaskIds: ['T1'], closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' } }] : [] })
async function setup(t, reviews, options = {}) {
  for (const value of reviews) planReviewResult(value)
  let payload
  const f = await createRecoverySessionFixture(t, { executable: true, limits: { totalLimit: 4, problemLimit: 4 },
    modelScript: m => [() => m.toolCallResponse('plan', 'workflow_plan_submit', { plan: payload }), 'hang-slow',
      ...reviews.flatMap((result, index) => [m.toolCallResponse(`review-${index}`, 'workflow_plan_review_submit', { review: result }), 'hang-slow'])], ...options })
  f.ctx.tools.register(plannerSubmitDefinition(f.runtime))
  f.ctx.tools.register(planReviewSubmitDefinition(f.runtime))
  const state = await readRecoverySessionState(f)
  payload = { ...structuredClone(state.plan), summary: 'Candidate awaiting independent review', owners: state.plan.owners.map(owner => ({ id: owner.id })) }
  const stage = state.plan.tasks[0], owner = state.plan.owners.find(item => item.id === stage.ownerId)
  await f.runtime.recordHandoffs(state, stage, { owner, branch: 'fixture-owner' }, { status: 'blocked',
    handoffs: [{ targetType: 'owner', targetOwnerId: owner.id, files: ['src/api/repair.mjs'], summary: 'Bounded local repair.' }] })
  await f.runtime.replanHandoffs(f.admissionAgent, f.workflowId)
  return f
}

for (const status of ['passed', 'needs_revision']) test(`T15 actual candidate ${status} Review consumes its own attempt in the Planner root and replays raw receipts`, { timeout: 30_000 }, async t => {
  const f = await setup(t, [review(status)])
  const before = await readRecoverySessionState(f)
  const result = await f.runtime.reviewPendingPlanRevision(f.admissionAgent)
  const state = await readRecoverySessionState(f)
  assert.equal(result.contract, 'DSH_PLAN_REVISION_REVIEW_RESULT_V1')
  assert.equal(state.recoveryAdmission.budget.totalUsed, 2)
  assert.equal(state.recoveryAdmission.budget.problems.length, 1)
  assert.equal(state.recoveryAdmission.budget.attempts[1].result.status, 'succeeded')
  assert.deepEqual(state.plan, before.plan)
  assert.deepEqual(state.ownerRuns, before.ownerRuns)
  assert.equal(state.planDigest, before.planDigest)
  assert.equal(state.pendingPlanRevision.planDigest, before.pendingPlanRevision.planDigest)
  const op = Object.values(state.candidateReviews)[0]
  assert.equal(op.phase, 'applied')
  assert.equal(op.origin.planDigest, before.planDigest)
  assert.equal(op.candidate.planDigest, before.pendingPlanRevision.planDigest)
  assert.notEqual(op.origin.planDigest, op.candidate.planDigest)
  assert.equal(state.replanSessions[op.requestId].phase, 'applied')
  const events = (await f.readFrom(state.replanSessions[op.requestId].executionIdentity.sessionId)).events
  assert.ok(events.some(event => event.type === 'tool/call' && event.data.name === 'workflow_plan_review_submit'))
  assert.ok(events.some(event => event.type === 'turn/end'))
  const calls = f.adapter.requests.length
  assert.equal((await f.runtime.reviewPendingPlanRevision(f.admissionAgent)).replayed, true)
  assert.equal(f.adapter.requests.length, calls)
  const reopened = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try {
    assert.equal((await reopened.runtime.reviewPendingPlanRevision(reopened.admissionAgent)).replayed, true)
    assert.equal(reopened.adapter.requests.length, 0)
  } finally { await reopened.dispose() }
})

test('T15 invalid semantic Reviews each consume one ordinal, then exhaustion starts no child', { timeout: 30_000 }, async t => {
  const invalid = { ...review('needs_split'), targetTaskIds: ['missing-task'] }
  const f = await setup(t, [invalid, invalid], { limits: { totalLimit: 3, problemLimit: 3 } })
  for (let used = 2; used <= 3; used++) {
    await assert.rejects(f.runtime.reviewPendingPlanRevision(f.admissionAgent), /不存在的 targetTaskId/)
    const state = await readRecoverySessionState(f)
    assert.equal(state.recoveryAdmission.budget.totalUsed, used)
    assert.equal(state.recoveryAdmission.budget.problems.length, 1)
    assert.equal(Object.values(state.candidateReviews)[0].ordinal, used - 1)
    assert.equal(state.recoveryAdmission.budget.attempts[used - 1].result.status, 'failed')
    assert.equal(state.pendingPlanRevision.review, undefined)
  }
  const calls = f.adapter.requests.length
  await assert.rejects(f.runtime.reviewPendingPlanRevision(f.admissionAgent), /admission refused/)
  assert.equal(f.adapter.requests.length, calls)
})

function duringReview(f, action) {
  const child = f.runtime.runChild.bind(f.runtime), stream = f.adapter.stream.bind(f.adapter)
  let pending = false
  f.runtime.runChild = (...args) => { if (args[4]?.requirePlanReviewSubmission) pending = true; return child(...args) }
  f.adapter.stream = async function* (options) {
    if (pending) { pending = false; await action() }
    yield* stream(options)
  }
}

test('T15 Review does not hold workflow lock during child execution and preserves independent task changes', { timeout: 30_000 }, async t => {
  const f = await setup(t, [review('passed')], { includeIndependentOwner: true })
  let changed = false
  duringReview(f, () => f.runtime.withWorkflowLock(f.workflowId, async () => {
    await mutateRecoverySessionState(f, state => { state.tasks.find(task => task.taskId === 'T2').note = 'independent update' })
    changed = true
  }))
  await f.runtime.reviewPendingPlanRevision(f.admissionAgent)
  assert.equal(changed, true)
  assert.equal((await readRecoverySessionState(f)).tasks.find(task => task.taskId === 'T2').note, 'independent update')
})

test('T15 candidate replacement during real Review cannot apply or become permission for a free retry', { timeout: 30_000 }, async t => {
  const f = await setup(t, [review('passed')])
  duringReview(f, () => mutateRecoverySessionState(f, state => { state.pendingPlanRevision.parent += 1 }))
  await assert.rejects(f.runtime.reviewPendingPlanRevision(f.admissionAgent), /candidate\/source changed/)
  const state = await readRecoverySessionState(f)
  assert.equal(state.pendingPlanRevision.review, undefined)
  assert.equal(state.recoveryAdmission.budget.totalUsed, 2)
  assert.equal(state.recoveryAdmission.budget.attempts[1].state, 'running')
  const calls = f.adapter.requests.length
  await assert.rejects(f.runtime.reviewPendingPlanRevision(f.admissionAgent), /candidate\/source changed/)
  assert.equal(f.adapter.requests.length, calls)
})

test('T15 stripped candidate provenance cannot fall back to the unmetered Review entry', { timeout: 30_000 }, async t => {
  const f = await setup(t, [review('passed')])
  await mutateRecoverySessionState(f, state => {
    delete state.pendingPlanRevision.origin
    delete state.pendingPlanRevision.recoveryRequestId
    delete state.pendingPlanRevision.recoveryOrigin
  })
  const calls = f.adapter.requests.length
  await assert.rejects(f.runtime.reviewPendingPlanRevision(f.admissionAgent), /缺少已结算Planner来源/)
  assert.equal(f.adapter.requests.length, calls)
  assert.equal((await readRecoverySessionState(f)).recoveryAdmission.budget.totalUsed, 1)
})

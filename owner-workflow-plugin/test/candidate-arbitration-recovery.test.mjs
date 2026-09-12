import assert from 'node:assert/strict'
import test from 'node:test'
import { plannerSubmitDefinition, planReviewSubmitDefinition } from '../index.js'
import { setup as setupPaidArbitration } from './fixtures/candidate-arbitration-fixture.mjs'
import { createRecoverySessionFixture, readRecoverySessionState } from './fixtures/recovery-session-fixture.mjs'

const ownerAdvice = {
  contract: 'DSH_OWNER_PLANNING_ADVICE_V1',
  ownerId: 'api',
  scopeFit: 'full',
  facts: ['The active API Owner remains the relevant consultation source.'],
  constraints: ['Do not alter the recovery candidate while only testing arbitration reachability.'],
  suggestedNodes: [],
  dependencies: [],
  handoffs: [],
  risks: [],
  verificationSuggestions: [],
}


async function setupExhaustedRecoveryCandidate(t) {
  let payload
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    limits: { totalLimit: 1, problemLimit: 1 },
    // The first response is the paid recovery Planner.  The following finite
    // responses make direct arbitration's unmetered Owner consult and invalid
    // Reviewer retries observable without a hanging transport.
    modelScript: m => [
      () => m.toolCallResponse('paid-recovery-planner', 'workflow_plan_submit', { plan: payload }),
      'hang-slow',
      m.textResponse(JSON.stringify(ownerAdvice)),
      m.textResponse('{}'),
      m.textResponse('{}'),
    ],
  })
  f.ctx.tools.register(plannerSubmitDefinition(f.runtime))
  f.ctx.tools.register(planReviewSubmitDefinition(f.runtime))
  const state = await readRecoverySessionState(f)
  payload = {
    ...structuredClone(state.plan),
    summary: 'R75 recovery candidate for arbitration bypass proof',
    owners: state.plan.owners.map(owner => ({ id: owner.id })),
  }
  const stage = state.plan.tasks[0]
  const owner = state.plan.owners.find(item => item.id === stage.ownerId)
  await f.runtime.recordHandoffs(state, stage, { owner, branch: 'fixture-owner' }, {
    status: 'blocked',
    handoffs: [{ targetType: 'owner', targetOwnerId: owner.id, files: ['src/api/repair.mjs'], summary: 'Bounded local repair.' }],
  })
  await f.runtime.replanHandoffs(f.admissionAgent, f.workflowId)
  return f
}

async function setupReviewedExhaustedRecoveryCandidate(t) {
  return setupPaidArbitration(t, { limit: 2, adviceScript: m => [m.textResponse('Candidate technical pause notice received.')] })
}

test('R75 regression: paid recovery arbitration refuses an exhausted root before any advisor starts', { timeout: 30_000 }, async t => {
  const f = await setupReviewedExhaustedRecoveryCandidate(t)
  const admitted = await readRecoverySessionState(f)
  assert.equal(admitted.recoveryAdmission.budget.totalUsed, 2)
  assert.equal(admitted.recoveryAdmission.budget.totalLimit, 2)
  assert.ok(admitted.pendingPlanRevision?.recoveryOrigin)

  const before = await readRecoverySessionState(f)
  const modelRequestsBefore = f.adapter.requests.length

  await assert.rejects(
    f.runtime.arbitratePendingPlanRevision(f.admissionAgent, undefined, { source: 'r75-post-gate-direct' }),
    /admission refused/,
  )

  const after = await readRecoverySessionState(f)
  assert.deepEqual(after, before)
  assert.equal(f.adapter.requests.length, modelRequestsBefore)
})

test('R75 driver durably pauses an exhausted recovery arbitration and then remains a technical wait', { timeout: 30_000 }, async t => {
  const f = await setupReviewedExhaustedRecoveryCandidate(t)
  const before = await readRecoverySessionState(f)
  assert.equal(before.pendingPlanRevision.review.status, 'needs_revision')
  assert.equal(before.recoveryAdmission.budget.totalUsed, 2)
  assert.equal(before.recoveryAdmission.budget.totalLimit, 2)
  const modelRequestsBefore = f.adapter.requests.length

  const paused = await f.runtime.driveWorkflow(f.admissionAgent, f.workflowId, 'plan-revision-drive', undefined, {
    source: 'r75-post-gate-driver',
  })
  assert.equal(paused.action, 'candidate-recovery-paused')
  assert.notEqual(paused.action, 'awaiting-user-authority')
  const afterPause = await readRecoverySessionState(f)
  assert.equal(afterPause.recoveryAdmission.budget.totalUsed, before.recoveryAdmission.budget.totalUsed)
  assert.deepEqual(afterPause.recoveryAdmission.budget.attempts, before.recoveryAdmission.budget.attempts)
  assert.deepEqual(afterPause.pendingPlanRevision, before.pendingPlanRevision)
  assert.equal(afterPause.tasks.find(task => task.taskId === 'T1').action, before.tasks.find(task => task.taskId === 'T1').action)
  const notification = afterPause.mainOutbox[paused.notificationId]
  assert.equal(notification.actionRequired, false)
  assert.equal(notification.status, 'pending')
  assert.equal(f.adapter.requests.length, modelRequestsBefore)

  const notified = await f.runtime.driveWorkflow(f.admissionAgent, f.workflowId, 'plan-revision-drive')
  assert.equal(notified.action, 'candidate-recovery-notified')
  await f.admissionAgent.whenIdle()
  await f.ctx.sessions.flush(f.admissionAgent.session)
  const modelRequestsAfterNotification = f.adapter.requests.length
  const waiting = await f.runtime.driveWorkflow(f.admissionAgent, f.workflowId, 'plan-revision-drive')
  assert.equal(waiting.action, 'waiting')
  assert.equal(waiting.phase, 'candidate_recovery_paused')
  const after = await readRecoverySessionState(f)
  assert.equal(after.mainOutbox[paused.notificationId].status, 'delivered')
  assert.equal(after.mainOutbox[paused.notificationId].actionRequired, false)
  t.diagnostic(JSON.stringify({
    pausedReason: paused.reason,
    persistedReason: after.candidateRecoveryPause.reason,
    modelRequestsBefore,
    modelRequestsAfterNotification,
    modelRequestsAfterStableWait: f.adapter.requests.length,
  }))
  assert.equal(after.candidateRecoveryPause.reason.includes('admission refused'), true)
  assert.deepEqual(after.pendingPlanRevision, before.pendingPlanRevision)
  assert.deepEqual(after.recoveryAdmission.budget, before.recoveryAdmission.budget)
  assert.equal(f.adapter.requests.length, modelRequestsAfterNotification)
})

test('R75 consultPlanningOwners rejects a stripped caller copy when the persisted Workflow remains a recovery candidate', { timeout: 30_000 }, async t => {
  const f = await setupExhaustedRecoveryCandidate(t)
  const before = await readRecoverySessionState(f)
  const stripped = structuredClone(before)
  delete stripped.pendingPlanRevision
  const modelRequestsBefore = f.adapter.requests.length

  await assert.rejects(
    f.runtime.consultPlanningOwners(f.admissionAgent, stripped, [stripped.plan.owners[0]], undefined, { purpose: 'r75-stripped-copy' }),
    /Recovery候选Owner会诊尚未接入逐次预算与持久会话，拒绝未计费启动/,
  )
  assert.deepEqual(await readRecoverySessionState(f), before)
  assert.equal(f.adapter.requests.length, modelRequestsBefore)
})

test('R75 an unprotected initial Owner consultation still uses the real model transport', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    modelScript: m => [m.textResponse(JSON.stringify(ownerAdvice))],
  })
  const state = await readRecoverySessionState(f)
  assert.equal(state.pendingPlanRevision, undefined)
  const modelRequestsBefore = f.adapter.requests.length

  const consultations = await f.runtime.consultPlanningOwners(
    f.admissionAgent,
    state,
    state.plan.owners,
    undefined,
    { purpose: 'r75-initial-positive' },
  )
  assert.deepEqual(consultations, [ownerAdvice])
  assert.equal(f.adapter.requests.length, modelRequestsBefore + 1)
})

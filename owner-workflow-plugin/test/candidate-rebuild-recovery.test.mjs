import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { plannerSubmitDefinition, planReviewSubmitDefinition } from '../index.js'
import { startRecoveryAttempt } from '../src/recovery-budget.mjs'
import { createRecoverySessionFixture, readRecoverySessionState, mutateRecoverySessionState, reopenRecoverySessionFixture } from './fixtures/recovery-session-fixture.mjs'

const review = status => ({ contract: 'DSH_PLAN_REVIEW_V1', status, summary: status === 'needs_revision' ? 'Refine the local repair candidate.' : 'Refinement accepted.', issues: [] })
const planDigest = plan => createHash('sha256').update(JSON.stringify(plan)).digest('hex')
async function setup(t, { invalidFirst = false, limit = 5, obligation = false, expanded = false, renamed = false } = {}) {
  let plans
  const f = await createRecoverySessionFixture(t, { executable: true, includeIndependentOwner: true,
    limits: { totalLimit: limit, problemLimit: limit }, modelScript: m => [
      () => m.toolCallResponse('initial-plan', 'workflow_plan_submit', { plan: plans.initial }), 'hang-slow',
      m.toolCallResponse('initial-review', 'workflow_plan_review_submit', { review: { ...review('needs_revision'), ...(obligation ? { issues: [{ severity: 'high', title: 'Missing verified result', detail: 'Repair needs a current fixed verification result.', suggestion: 'Run and bind unit verification.', obligationId: 'repair-unit-result', sourceId: 'repair-contract', sourceVersion: 'v1', targetTaskIds: ['T1'], closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' } }] } : {}) } }), 'hang-slow',
      ...(invalidFirst ? [() => m.toolCallResponse('invalid-rebuild', 'workflow_plan_submit', { plan: plans.invalid }), 'hang-slow'] : []),
      () => m.toolCallResponse('rebuilt-plan', 'workflow_plan_submit', { plan: plans.rebuilt }), 'hang-slow',
      m.toolCallResponse('rebuilt-review', 'workflow_plan_review_submit', { review: review('passed') }), 'hang-slow',
    ] })
  f.ctx.tools.register(plannerSubmitDefinition(f.runtime))
  f.ctx.tools.register(planReviewSubmitDefinition(f.runtime))
  await mutateRecoverySessionState(f, state => { state.conversationRootSessionId = f.admissionAgent.id })
  const state = await readRecoverySessionState(f)
  const base = { ...structuredClone(state.plan), owners: state.plan.owners.map(owner => ({ id: owner.id })) }
  if (expanded) {
    base.tasks = [
      ...base.tasks.map(task => task.id === 'T1'
        ? { ...task, children: ['T1-split'], entry: ['T1-split'], exit: ['T1-split'] }
        : task),
      { id: 'T1-split', role: 'work', ownerId: 'api', title: 'Split API repair', parentTaskId: 'T1',
        dependsOn: [], write: ['src/api/repair.mjs'], verify: ['unit'], done: ['Split API repair is verified'] },
    ]
  }
  if (renamed) {
    const source = base.tasks.find(task => task.id === 'T1')
    base.tasks = [
      ...base.tasks.filter(task => task.id !== 'T1'),
      { ...source, id: 'T1-renamed', title: 'Renamed API repair' },
    ]
  }
  plans = { initial: { ...base, summary: 'Initial repair candidate' }, rebuilt: { ...base, summary: 'Refined repair candidate' },
    invalid: { ...base, summary: 'Invalid unrelated change', tasks: base.tasks.map(task => task.id === 'T2' ? { ...task, title: 'Unrelated rewritten task' } : task) } }
  const stage = state.plan.tasks[0], owner = state.plan.owners.find(item => item.id === stage.ownerId)
  await f.runtime.recordHandoffs(state, stage, { owner, branch: 'fixture-owner' }, { status: 'blocked',
    handoffs: [expanded
      ? { targetType: 'owner', targetOwnerId: 'worker', files: ['src/worker/independent.mjs'], summary: 'Transfer worker repair' }
      : { targetType: 'owner', targetOwnerId: owner.id, files: ['src/api/repair.mjs'], summary: 'Bounded repair' }] })
  await f.runtime.replanHandoffs(f.admissionAgent, f.workflowId)
  await f.runtime.reviewPendingPlanRevision(f.admissionAgent)
  assert.equal((await readRecoverySessionState(f)).planConvergence.nextStrategy, 'local_subgraph_rewrite')
  return f
}

test('T18 actual Runner activates a rebuilt recovery candidate and preserves its immutable history', { timeout: 30_000 }, async t => {
  const f = await setup(t)
  const before = await readRecoverySessionState(f)
  const result = await f.runtime.drivePendingPlanRevision(f.admissionAgent)
  const state = await readRecoverySessionState(f)
  assert.equal(result.action, 'recovery_rebuilt_and_reviewed')
  assert.equal(result.review.status, 'passed')
  assert.equal(state.recoveryAdmission.budget.totalUsed, 4)
  assert.equal(state.recoveryAdmission.budget.problems.length, 1)
  assert.ok(state.recoveryAdmission.budget.attempts.every(attempt => attempt.result.status === 'succeeded'))
  assert.deepEqual(state.plan, before.plan)
  assert.deepEqual(state.ownerRuns, before.ownerRuns)
  assert.deepEqual(state.tasks, before.tasks)
  assert.equal(state.pendingPlanRevision.plan.summary, 'Refined repair candidate')
  assert.equal(state.pendingPlanRevision.cycleId, before.pendingPlanRevision.cycleId)
  assert.equal(state.planConvergence.cycleId, before.planConvergence.cycleId)
  assert.notEqual(state.pendingPlanRevision.recoveryRequestId, before.pendingPlanRevision.recoveryRequestId)
  const next = Object.values(state.handoffReplans).find(op => op.requestId === state.pendingPlanRevision.recoveryRequestId)
  assert.deepEqual(next.predecessor.candidate, before.pendingPlanRevision)
  assert.equal(next.predecessor.reviewOperation.phase, 'applied')
  assert.deepEqual(next.origin, before.pendingPlanRevision.recoveryOrigin)
  assert.equal(state.lastDiscardedPlanRevision, undefined)
  const calls = f.adapter.requests.length
  assert.equal((await f.runtime.drivePendingPlanRevision(f.admissionAgent)).action, 'awaiting_approval')
  assert.equal(f.adapter.requests.length, calls)
  const stable = await readRecoverySessionState(f)
  const approvals = await Promise.allSettled([
    f.runtime.approvePendingPlanRevision(f.admissionAgent, stable.pendingPlanRevision.planDigest),
    f.runtime.approvePendingPlanRevision(f.admissionAgent, stable.pendingPlanRevision.planDigest),
  ])
  assert.equal(approvals.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(approvals.filter(item => item.status === 'rejected').length, 1)
  const approval = approvals.find(item => item.status === 'fulfilled').value
  assert.equal(approval.revision, 2)
  const activated = await readRecoverySessionState(f)
  assert.equal(activated.planDigest, stable.pendingPlanRevision.planDigest)
  assert.equal(activated.recoveryAdmissionConfig.executionVersion, activated.planDigest)
  assert.equal(activated.recoveryAdmission.executionVersion, stable.planDigest)
  assert.equal(activated.recoveryAdmission.budget.totalUsed, 4)
  assert.deepEqual(activated.recoveryAdmission.budget, stable.recoveryAdmission.budget)
  assert.deepEqual(activated.recoveryAdmission.sources, stable.recoveryAdmission.sources)
  assert.deepEqual(activated.recoveryAdmission.intents, stable.recoveryAdmission.intents)
  assert.equal(activated.recoveryExecutionTransitions.length, 1)
  assert.equal(activated.recoveryExecutionTransitions[0].parentExecutionVersion, stable.planDigest)
  assert.equal(activated.recoveryExecutionTransitions[0].executionVersion, activated.planDigest)
  assert.equal(activated.recoveryExecutionTransitions[0].rootMappings[0].rootProblemId,
    activated.recoveryAdmission.budget.problems[0].rootProblemId)
  const independent = activated.tasks.find(item => item.taskId === 'T2')
  assert.equal(independent.status, stable.tasks.find(item => item.taskId === 'T2').status)
  assert.equal(independent.revisionDisposition, 'carry_valid')
  const beforeLate = await readRecoverySessionState(f)
  const late = await f.runtime.reserveRecoveryAdmission(f.admissionAgent, f.workflowId, {
    contract: 'DSH_RECOVERY_ADMISSION_REQUEST_V1',
    planDigest: stable.planDigest,
    taskId: 'T1',
    ownerId: 'api',
    source: { kind: 'owner_failure', attempt: 2, sessionId: 'T1-api-failed-session' },
  })
  assert.equal(late.outcome, 'rejected')
  assert.equal(late.reason, 'request_plan_digest_mismatch')
  assert.deepEqual((await readRecoverySessionState(f)).recoveryAdmission.budget,
    beforeLate.recoveryAdmission.budget)
  await mutateRecoverySessionState(f, state => {
    const previous = state.ownerRuns['T1:api']
    state.ownerRuns['T1:api'] = {
      ...previous,
      status: 'failed',
      attempt: 3,
      sessionId: 'T1-api-after-revision-failure',
      planDigest: state.planDigest,
      error: 'The inherited repair still needs one bounded attempt',
      autonomousRecovery: { ...previous.autonomousRecovery, strategy: 'diagnose' },
    }
    delete state.ownerRuns['T1:api'].recoverySession
    delete state.ownerRuns['T1:api'].recoveryContinuation
    Object.assign(state.tasks.find(item => item.taskId === 'T1'), {
      status: 'pending', reason: null, action: null,
    })
  })
  const inherited = await f.runtime.reserveRecoveryAdmission(f.admissionAgent, f.workflowId, {
    contract: 'DSH_RECOVERY_ADMISSION_REQUEST_V1',
    planDigest: activated.planDigest,
    taskId: 'T1',
    ownerId: 'api',
    source: { kind: 'owner_failure', attempt: 3, sessionId: 'T1-api-after-revision-failure' },
  })
  assert.equal(inherited.outcome, 'reserved', JSON.stringify(inherited))
  assert.equal(inherited.rootProblemId, activated.recoveryAdmission.budget.problems[0].rootProblemId)
  const inheritedState = await readRecoverySessionState(f)
  assert.equal(inheritedState.recoveryAdmission.budget.totalUsed, 5)
  assert.equal(inheritedState.recoveryAdmission.budget.problems.length, 1)
  assert.equal(inheritedState.recoveryAdmission.intents.at(-1).planDigest, activated.planDigest)
  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try {
    const reopened = await readRecoverySessionState(fresh)
    assert.deepEqual(reopened.recoveryExecutionTransitions, activated.recoveryExecutionTransitions)
    assert.deepEqual(reopened.recoveryAdmission.budget, inheritedState.recoveryAdmission.budget)
  } finally { await fresh.dispose() }
})

test('T18 split task and cross-Owner target inherit one root without resetting the Workflow budget', { timeout: 45_000 }, async t => {
  const f = await setup(t, { expanded: true, limit: 6 })
  await f.runtime.drivePendingPlanRevision(f.admissionAgent)
  const candidate = await readRecoverySessionState(f)
  assert.equal(candidate.pendingPlanRevision.review.status, 'passed')
  const rootProblemId = candidate.recoveryAdmission.budget.problems[0].rootProblemId
  await f.runtime.approvePendingPlanRevision(f.admissionAgent, candidate.pendingPlanRevision.planDigest)
  let state = await readRecoverySessionState(f)
  const mappings = state.recoveryExecutionTransitions[0].rootMappings
  assert.ok(mappings.some(item => item.rootProblemId === rootProblemId
    && item.toTaskId === 'T1-split' && item.toOwnerId === 'api'))
  assert.ok(mappings.some(item => item.rootProblemId === rootProblemId
    && item.toTaskId === 'T2' && item.toOwnerId === 'worker'))

  const failures = [
    { taskId: 'T1-split', ownerId: 'api', attempt: 1, sessionId: 'split-after-revision' },
    { taskId: 'T2', ownerId: 'worker', attempt: 1, sessionId: 'worker-after-revision' },
  ]
  await mutateRecoverySessionState(f, current => {
    for (const failure of failures) {
      current.ownerRuns[`${failure.taskId}:${failure.ownerId}`] = {
        status: 'failed', taskId: failure.taskId, stageId: failure.taskId, ownerId: failure.ownerId,
        attempt: failure.attempt, sessionId: failure.sessionId, planDigest: current.planDigest,
        error: `Inherited failure for ${failure.taskId}`,
        autonomousRecovery: { contract: 'DSH_AUTONOMOUS_RECOVERY_V1', failureClass: 'contract_dag',
          strategy: 'diagnose', message: 'Inherited technical failure', evidenceDigest: 'f'.repeat(64),
          usedStrategies: ['diagnose'], updatedAt: '2026-09-12T00:00:00.000Z' },
      }
      Object.assign(current.tasks.find(item => item.taskId === failure.taskId), {
        status: 'pending', reason: null, action: null,
      })
    }
  })
  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try {
    const receipts = await Promise.all(failures.map((failure, index) => {
      const consumer = index === 0 ? f : fresh
      return consumer.runtime.reserveRecoveryAdmission(consumer.admissionAgent, f.workflowId, {
        contract: 'DSH_RECOVERY_ADMISSION_REQUEST_V1', planDigest: state.planDigest,
        taskId: failure.taskId, ownerId: failure.ownerId,
        source: { kind: 'owner_failure', attempt: failure.attempt, sessionId: failure.sessionId },
      })
    }))
    for (const receipt of receipts) {
      assert.equal(receipt.outcome, 'reserved', JSON.stringify(receipt))
      assert.equal(receipt.rootProblemId, rootProblemId)
    }
  } finally {
    await fresh.dispose()
  }
  state = await readRecoverySessionState(f)
  assert.equal(state.recoveryAdmission.budget.totalUsed, 6)
  assert.equal(state.recoveryAdmission.budget.problems.length, 1)
})

test('T18 renamed task inherits the unresolved root through the reviewed handoff target', { timeout: 30_000 }, async t => {
  const f = await setup(t, { renamed: true, limit: 5 })
  await f.runtime.drivePendingPlanRevision(f.admissionAgent)
  const candidate = await readRecoverySessionState(f)
  const rootProblemId = candidate.recoveryAdmission.budget.problems[0].rootProblemId
  await f.runtime.approvePendingPlanRevision(f.admissionAgent, candidate.pendingPlanRevision.planDigest)
  let state = await readRecoverySessionState(f)
  assert.equal(state.plan.tasks.some(task => task.id === 'T1'), false)
  assert.ok(state.recoveryExecutionTransitions[0].rootMappings.some(item => (
    item.rootProblemId === rootProblemId && item.fromTaskId === 'T1'
      && item.toTaskId === 'T1-renamed' && item.toOwnerId === 'api'
  )))
  await mutateRecoverySessionState(f, current => {
    current.ownerRuns['T1-renamed:api'] = {
      status: 'failed', taskId: 'T1-renamed', stageId: 'T1-renamed', ownerId: 'api', attempt: 1,
      sessionId: 'renamed-after-revision', planDigest: current.planDigest, error: 'Renamed repair still failed',
      autonomousRecovery: { contract: 'DSH_AUTONOMOUS_RECOVERY_V1', failureClass: 'contract_dag',
        strategy: 'diagnose', message: 'Renamed technical failure', evidenceDigest: 'a'.repeat(64),
        usedStrategies: ['diagnose'], updatedAt: '2026-09-12T00:00:00.000Z' },
    }
    Object.assign(current.tasks.find(item => item.taskId === 'T1-renamed'), {
      status: 'pending', reason: null, action: null,
    })
  })
  const receipt = await f.runtime.reserveRecoveryAdmission(f.admissionAgent, f.workflowId, {
    contract: 'DSH_RECOVERY_ADMISSION_REQUEST_V1', planDigest: state.planDigest,
    taskId: 'T1-renamed', ownerId: 'api',
    source: { kind: 'owner_failure', attempt: 1, sessionId: 'renamed-after-revision' },
  })
  assert.equal(receipt.outcome, 'reserved', JSON.stringify(receipt))
  assert.equal(receipt.rootProblemId, rootProblemId)
  state = await readRecoverySessionState(f)
  assert.equal(state.recoveryAdmission.budget.totalUsed, 5)
  assert.equal(state.recoveryAdmission.budget.problems.length, 1)
})

test('T18 consecutive PlanRevisions retain one immutable recovery root chain', { timeout: 30_000 }, async t => {
  const f = await setup(t, { limit: 6 })
  await f.runtime.drivePendingPlanRevision(f.admissionAgent)
  let state = await readRecoverySessionState(f)
  const rootProblemId = state.recoveryAdmission.budget.problems[0].rootProblemId
  await f.runtime.approvePendingPlanRevision(f.admissionAgent, state.pendingPlanRevision.planDigest)
  state = await mutateRecoverySessionState(f, current => {
    const nextPlan = structuredClone(current.plan)
    nextPlan.summary = 'Second reviewed execution version'
    current.pendingPlanRevision = {
      number: 3,
      parent: 2,
      plan: nextPlan,
      planDigest: planDigest(nextPlan),
      intentIds: [],
      review: review('passed'),
    }
  })
  const secondDigest = state.pendingPlanRevision.planDigest
  await f.runtime.approvePendingPlanRevision(f.admissionAgent, secondDigest)
  state = await readRecoverySessionState(f)
  assert.equal(state.recoveryExecutionTransitions.length, 2)
  assert.equal(state.recoveryExecutionTransitions[1].parentExecutionVersion,
    state.recoveryExecutionTransitions[0].executionVersion)
  assert.equal(state.recoveryExecutionTransitions[1].executionVersion, secondDigest)
  assert.equal(state.recoveryAdmission.executionVersion,
    state.recoveryExecutionTransitions[0].parentExecutionVersion)
  assert.equal(state.recoveryAdmissionConfig.executionVersion, secondDigest)
  assert.ok(state.recoveryExecutionTransitions[1].rootMappings.some(item => (
    item.rootProblemId === rootProblemId && item.toTaskId === 'T1' && item.toOwnerId === 'api'
  )))

  await mutateRecoverySessionState(f, current => {
    const previous = current.ownerRuns['T1:api']
    current.ownerRuns['T1:api'] = {
      ...previous,
      status: 'failed',
      attempt: 3,
      sessionId: 'T1-api-after-second-revision',
      planDigest: current.planDigest,
      error: 'The second execution version still needs repair',
      autonomousRecovery: { ...previous.autonomousRecovery, strategy: 'diagnose' },
    }
    delete current.ownerRuns['T1:api'].recoverySession
    delete current.ownerRuns['T1:api'].recoveryContinuation
    Object.assign(current.tasks.find(item => item.taskId === 'T1'), {
      status: 'pending', reason: null, action: null,
    })
  })
  const receipt = await f.runtime.reserveRecoveryAdmission(f.admissionAgent, f.workflowId, {
    contract: 'DSH_RECOVERY_ADMISSION_REQUEST_V1', planDigest: secondDigest,
    taskId: 'T1', ownerId: 'api',
    source: { kind: 'owner_failure', attempt: 3, sessionId: 'T1-api-after-second-revision' },
  })
  assert.equal(receipt.outcome, 'reserved', JSON.stringify(receipt))
  assert.equal(receipt.rootProblemId, rootProblemId)
  state = await readRecoverySessionState(f)
  assert.equal(state.recoveryAdmission.budget.totalUsed, 5)
  assert.equal(state.recoveryAdmission.budget.problems.length, 1)
})

test('T18 missing inheritance source rejects activation without changing plan or budget', { timeout: 30_000 }, async t => {
  const f = await setup(t)
  await f.runtime.drivePendingPlanRevision(f.admissionAgent)
  await mutateRecoverySessionState(f, state => {
    state.pendingPlanRevision.recoveryRequestId = 'unknown-recovery-request'
  })
  const before = await readRecoverySessionState(f)
  await assert.rejects(
    f.runtime.approvePendingPlanRevision(f.admissionAgent, before.pendingPlanRevision.planDigest),
    /recovery_execution_transition_intent_missing/,
  )
  assert.deepEqual(await readRecoverySessionState(f), before)
})

test('T18 old-version running recovery settles after activation without another debit', { timeout: 30_000 }, async t => {
  const f = await setup(t, { limit: 6 })
  await f.runtime.drivePendingPlanRevision(f.admissionAgent)
  let state = await mutateRecoverySessionState(f, current => {
    current.ownerRuns['T2:worker'] = {
      status: 'failed', taskId: 'T2', stageId: 'T2', ownerId: 'worker', attempt: 1,
      sessionId: 'T2-worker-initial-failure', planDigest: current.planDigest,
      error: 'Independent worker recovery is still running across activation',
      autonomousRecovery: { contract: 'DSH_AUTONOMOUS_RECOVERY_V1', failureClass: 'contract_dag',
        strategy: 'diagnose', message: 'Worker technical failure', evidenceDigest: 'b'.repeat(64),
        usedStrategies: ['diagnose'], updatedAt: '2026-09-12T00:00:00.000Z' },
    }
    Object.assign(current.tasks.find(item => item.taskId === 'T2'), {
      status: 'pending', reason: null, action: null,
    })
  })
  const receipt = await f.runtime.reserveRecoveryAdmission(f.admissionAgent, f.workflowId, {
    contract: 'DSH_RECOVERY_ADMISSION_REQUEST_V1', planDigest: state.planDigest,
    taskId: 'T2', ownerId: 'worker',
    source: { kind: 'owner_failure', attempt: 1, sessionId: 'T2-worker-initial-failure' },
  })
  assert.equal(receipt.outcome, 'reserved')
  const leaseToken = 'worker-recovery-across-revision'
  state = await mutateRecoverySessionState(f, current => {
    const intent = current.recoveryAdmission.intents.find(item => item.requestId === receipt.requestId)
    current.recoveryAdmission.budget = startRecoveryAttempt(current.recoveryAdmission.budget, {
      workflowId: current.id, rootProblemId: intent.rootProblemId, requestId: intent.requestId,
      attemptId: intent.attemptId, taskId: intent.taskId, ownerId: intent.ownerId,
      executionVersion: intent.planDigest,
      executionRef: { id: intent.executionIdentity.sessionId, version: intent.executionIdentity.promptId },
    }).ledger
    current.ownerRuns['T2:worker'] = {
      ...current.ownerRuns['T2:worker'], status: 'stopping', phase: 'stopping', attempt: 2,
      sessionId: intent.executionIdentity.sessionId, leaseToken,
      recoverySession: {
        contract: 'DSH_RECOVERY_SESSION_STATE_V1', sourceId: intent.sourceId, rootProblemId: intent.rootProblemId,
        requestId: intent.requestId, attemptId: intent.attemptId,
        planDigest: intent.planDigest, executionIdentity: intent.executionIdentity,
        instruction: { id: intent.executionIdentity.promptId, content: 'recover worker' },
        prompt: { id: intent.executionIdentity.promptId, content: 'recover worker' },
        ownerRunBinding: { attempt: 2, leaseToken }, phase: 'submitted',
      },
      attemptControl: {
        contract: 'DSH_OWNER_ATTEMPT_CONTROL_V1', executionVersion: intent.planDigest,
        attempt: 2, leaseToken, generation: 2, sessionId: intent.executionIdentity.sessionId,
        phase: 'stopping', fixedDeadlineAt: '2026-09-12T01:00:00.000Z', remainingCeilingMs: 0,
        lastObservedAt: '2026-09-12T01:00:00.000Z', observationWindowMs: 30_000,
        cause: 'hard_deadline', cancelRequestId: 'worker-recovery-cancel', cancelState: 'requested',
        requestedAt: '2026-09-12T01:00:00.000Z', observationDeadlineAt: '2026-09-12T01:00:30.000Z',
      },
    }
    Object.assign(current.tasks.find(item => item.taskId === 'T2'), {
      status: 'stopped', reason: 'termination_unconfirmed', action: 'inspect_runtime',
    })
  })
  const beforeActivationBudget = structuredClone(state.recoveryAdmission.budget)
  await f.runtime.approvePendingPlanRevision(f.admissionAgent, state.pendingPlanRevision.planDigest)
  f.runtime.inspectOwnerSessionTerminal = async sessionId => {
    assert.equal(sessionId, receipt.executionIdentity.sessionId)
    return { revision: 23, reason: 'aborted' }
  }
  await mutateRecoverySessionState(f, current => f.runtime.reconcileStoppingOwnerAttempts(current))
  const settled = await readRecoverySessionState(f)
  const attempt = settled.recoveryAdmission.budget.attempts.find(item => item.requestId === receipt.requestId)
  assert.equal(attempt.state, 'settled', JSON.stringify(settled.ownerRuns['T2:worker']))
  assert.equal(attempt.result.status, 'failed')
  assert.equal(settled.recoveryAdmission.budget.totalUsed, beforeActivationBudget.totalUsed)
  assert.equal(settled.recoveryAdmission.budget.problems.length, beforeActivationBudget.problems.length)
  assert.equal(settled.ownerRuns['T2:worker'].recoverySession.phase, 'settled_failed')
})

test('T18 tampered persisted transition fails closed without another debit', { timeout: 30_000 }, async t => {
  const f = await setup(t)
  await f.runtime.drivePendingPlanRevision(f.admissionAgent)
  const candidate = await readRecoverySessionState(f)
  await f.runtime.approvePendingPlanRevision(f.admissionAgent, candidate.pendingPlanRevision.planDigest)
  await mutateRecoverySessionState(f, state => {
    state.recoveryExecutionTransitions[0].rootMappings[0].rootProblemId = 'forged-root'
  })
  const before = await readRecoverySessionState(f)
  const result = await f.runtime.reserveRecoveryAdmission(f.admissionAgent, f.workflowId, {
    contract: 'DSH_RECOVERY_ADMISSION_REQUEST_V1', planDigest: before.planDigest,
    taskId: 'T1', ownerId: 'api',
    source: { kind: 'owner_failure', attempt: 2, sessionId: 'T1-api-failed-session' },
  })
  assert.equal(result.outcome, 'rejected')
  assert.equal(result.reason, 'recovery_execution_transition_root_missing')
  assert.deepEqual(await readRecoverySessionState(f), before)
})

test('T15 failed rebuilt Planner keeps the reviewed predecessor and next ordinal uses the same root', { timeout: 30_000 }, async t => {
  const f = await setup(t, { invalidFirst: true })
  const before = await readRecoverySessionState(f)
  await assert.rejects(f.runtime.drivePendingPlanRevision(f.admissionAgent), /改变了无关task:T2/)
  const failed = await readRecoverySessionState(f)
  assert.deepEqual(failed.pendingPlanRevision, before.pendingPlanRevision)
  assert.equal(failed.recoveryAdmission.budget.totalUsed, 3)
  assert.equal(failed.recoveryAdmission.budget.attempts[2].result.status, 'failed')
  await f.runtime.drivePendingPlanRevision(f.admissionAgent)
  const saved = await readRecoverySessionState(f)
  assert.equal(saved.recoveryAdmission.budget.totalUsed, 5)
  assert.equal(saved.recoveryAdmission.budget.problems.length, 1)
  assert.equal(saved.pendingPlanRevision.review.status, 'passed')
  const op = Object.values(saved.handoffReplans).find(item => item.predecessor)
  assert.equal(op.ordinal, 2)
  assert.deepEqual(op.predecessor.candidate, before.pendingPlanRevision)
})

test('T15 exhausted rebuild preserves the predecessor and starts no Planner', { timeout: 30_000 }, async t => {
  const f = await setup(t, { limit: 2 })
  const before = await readRecoverySessionState(f), calls = f.adapter.requests.length
  await assert.rejects(f.runtime.drivePendingPlanRevision(f.admissionAgent), /admission refused/)
  const state = await readRecoverySessionState(f)
  assert.deepEqual(state.pendingPlanRevision, before.pendingPlanRevision)
  assert.equal(state.recoveryAdmission.budget.totalUsed, 2)
  assert.equal(f.adapter.requests.length, calls)
})

test('T15 changing the settled Review record prevents a new recovery Planner', { timeout: 30_000 }, async t => {
  const f = await setup(t)
  await mutateRecoverySessionState(f, state => { Object.values(state.candidateReviews)[0].receipt.payloadDigest = 'changed' })
  const calls = f.adapter.requests.length
  await assert.rejects(f.runtime.drivePendingPlanRevision(f.admissionAgent), /applied receipt changed/)
  assert.equal(f.adapter.requests.length, calls)
  assert.equal((await readRecoverySessionState(f)).recoveryAdmission.budget.totalUsed, 2)
})

test('T15 predecessor changed during real rebuild cannot be replaced by the late Planner result', { timeout: 30_000 }, async t => {
  const f = await setup(t)
  const child = f.runtime.runChild.bind(f.runtime), stream = f.adapter.stream.bind(f.adapter)
  let pending = false, changed = false
  f.runtime.runChild = (...args) => { if (args[4]?.requirePlannerSubmission) pending = true; return child(...args) }
  f.adapter.stream = async function* (options) {
    if (pending) {
      pending = false
      await mutateRecoverySessionState(f, state => { state.pendingPlanRevision.review.summary = 'Concurrent replacement' })
      changed = true
    }
    yield* stream(options)
  }
  await assert.rejects(f.runtime.drivePendingPlanRevision(f.admissionAgent), /application changed/)
  const state = await readRecoverySessionState(f)
  assert.equal(changed, true)
  assert.equal(state.pendingPlanRevision.plan.summary, 'Initial repair candidate')
  assert.equal(state.pendingPlanRevision.review.summary, 'Concurrent replacement')
  assert.equal(state.recoveryAdmission.budget.totalUsed, 3)
  assert.equal(state.recoveryAdmission.budget.attempts[2].state, 'running')
  const calls = f.adapter.requests.length
  await assert.rejects(f.runtime.rebuildRecoveryCandidate(f.admissionAgent, f.workflowId), /applied receipt changed/)
  assert.equal(f.adapter.requests.length, calls)
})


test('T15 rebuilt candidate inherits open evidence obligations even when its Reviewer returns passed', { timeout: 30_000 }, async t => {
  const f = await setup(t, { obligation: true })
  const before = await readRecoverySessionState(f)
  assert.ok(before.planConvergence.obligations.some(item => item.id === 'repair-unit-result' && item.status === 'open'))
  const result = await f.runtime.drivePendingPlanRevision(f.admissionAgent)
  const state = await readRecoverySessionState(f)
  assert.equal(state.recoveryAdmission.budget.totalUsed, 4)
  assert.equal(state.planConvergence.cycleId, before.planConvergence.cycleId)
  assert.ok(state.planConvergence.obligations.some(item => item.id === 'repair-unit-result' && item.status === 'open'))
  assert.equal(result.review.status, 'needs_revision')
  assert.equal(state.recoveryAdmission.budget.attempts[3].result.status, 'succeeded')
})

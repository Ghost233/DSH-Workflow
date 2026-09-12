import assert from 'node:assert/strict'
import test from 'node:test'
import { plannerSubmitDefinition } from '../index.js'
import { createRecoverySessionFixture, readRecoverySessionState, mutateRecoverySessionState, reopenRecoverySessionFixture } from './fixtures/recovery-session-fixture.mjs'

async function queue(f, { completed = false } = {}) {
  const state = await readRecoverySessionState(f)
  const stage = state.plan.tasks[0]
  const owner = state.plan.owners.find(item => item.id === stage.ownerId)
  return f.runtime.recordHandoffs(state, stage, { owner, branch: 'fixture-owner' }, {
    status: completed ? 'completed' : 'blocked', handoffs: [{ targetType: 'owner', targetOwnerId: owner.id,
      files: ['src/api/repair.mjs'], summary: 'Need a bounded repair for this file.' }],
  }, undefined, completed ? { commitSha: 'fixture-partial-commit' } : undefined)
}

async function setup(t, script, options = {}) {
  const f = await createRecoverySessionFixture(t, { executable: true, modelScript: script, ...options })
  f.ctx.tools.register(plannerSubmitDefinition(f.runtime))
  return f
}

test('T15 actual handoff entry meters one Planner and atomically stages a candidate without activating its version', { timeout: 30_000 }, async t => {
  let payload, f
  f = await setup(t, m => [() => m.toolCallResponse('handoff-submit', 'workflow_plan_submit', { plan: payload }), 'hang-slow'])
  const before = await readRecoverySessionState(f)
  payload = { ...structuredClone(before.plan), summary: 'Repair candidate', owners: before.plan.owners.map(owner => ({ id: owner.id })) }
  const [handoff] = await queue(f)
  assert.equal(handoff.sourceExecution.attempt, 2)
  assert.equal(handoff.sourceExecution.sessionId, 'T1-api-failed-session')
  const result = await f.runtime.replanHandoffs(f.admissionAgent, f.workflowId)
  assert.equal(result.contract, 'DSH_PLAN_REVISION_CANDIDATE_V1')
  const saved = await readRecoverySessionState(f)
  assert.equal(saved.recoveryAdmission.budget.totalUsed, 1)
  assert.equal(saved.recoveryAdmission.budget.attempts[0].result.status, 'succeeded')
  assert.equal(saved.pendingPlanRevision.planDigest, result.planDigest)
  assert.notEqual(result.planDigest, before.planDigest)
  assert.equal(saved.planDigest, before.planDigest)
  assert.deepEqual(saved.plan, before.plan)
  assert.deepEqual(saved.tasks, before.tasks)
  assert.deepEqual(saved.ownerRuns, before.ownerRuns)
  assert.equal(saved.recoveryAdmission.sources[0].attempt, 2)
  const calls = f.adapter.requests.length
  const replay = await f.runtime.replanHandoffs(f.admissionAgent, f.workflowId)
  assert.equal(replay.replayed, true)
  assert.equal(f.adapter.requests.length, calls)
  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try {
    const reopened = await fresh.runtime.replanHandoffs(fresh.admissionAgent, fresh.workflowId)
    assert.equal(reopened.replayed, true)
    assert.equal(fresh.adapter.requests.length, 0)
  } finally { await fresh.dispose() }
})

test('T15 actual invalid handoff candidate consumes its attempt and the next physical call shares the root and finite budget', { timeout: 30_000 }, async t => {
  let payload
  const f = await setup(t, m => [() => m.toolCallResponse('invalid-coverage', 'workflow_plan_submit', { plan: payload }), 'hang-slow',
    () => m.toolCallResponse('invalid-coverage-2', 'workflow_plan_submit', { plan: payload }), 'hang-slow'])
  const state = await readRecoverySessionState(f)
  payload = { ...structuredClone(state.plan), owners: state.plan.owners.map(owner => ({ id: owner.id })),
    tasks: state.plan.tasks.map(task => ({ ...task, write: ['src/api/other.mjs'] })) }
  await queue(f)
  await assert.rejects(f.runtime.replanHandoffs(f.admissionAgent, f.workflowId), /Handoff recovery rejected/)
  const once = await readRecoverySessionState(f)
  assert.equal(once.recoveryAdmission.budget.totalUsed, 1)
  assert.equal(once.recoveryAdmission.budget.attempts[0].result.status, 'failed')
  assert.equal(once.pendingPlanRevision, undefined)
  await assert.rejects(f.runtime.replanHandoffs(f.admissionAgent, f.workflowId), /Handoff recovery rejected/)
  const twice = await readRecoverySessionState(f)
  assert.equal(twice.recoveryAdmission.budget.totalUsed, 2)
  assert.equal(twice.recoveryAdmission.budget.problems.length, 1)
  assert.deepEqual(twice.recoveryAdmission.intents.map(item => item.ordinal), [1, 2])
  const calls = f.adapter.requests.length
  await assert.rejects(f.runtime.replanHandoffs(f.admissionAgent, f.workflowId), /problem_exhausted/)
  assert.equal(f.adapter.requests.length, calls)
  assert.equal((await readRecoverySessionState(f)).recoveryAdmission.budget.totalUsed, 2)
})

test('T15 unbound handoff or changed producing Owner identity cannot launch an unmetered Planner', { timeout: 30_000 }, async t => {
  const f = await setup(t, () => [])
  await queue(f)
  await mutateRecoverySessionState(f, state => { state.handoffQueue[0].sourceExecution.attempt++ })
  await assert.rejects(f.runtime.replanHandoffs(f.admissionAgent, f.workflowId), /refused|mismatch|source/i)
  assert.equal(f.adapter.requests.length, 0)
  await mutateRecoverySessionState(f, state => { delete state.handoffQueue[0].sourceExecution })
  await assert.rejects(f.runtime.replanHandoffs(f.admissionAgent, f.workflowId), /缺少固定执行来源/)
  assert.equal(f.adapter.requests.length, 0)
})


test('T15 handoff Planner runs outside the workflow lock and preserves an independent task update', { timeout: 30_000 }, async t => {
  let f, payload
  f = await setup(t, m => [() => m.toolCallResponse('unlocked-submit', 'workflow_plan_submit', { plan: payload }), 'hang-slow'], { includeIndependentOwner: true })
  beforeFirstModel(f, () => f.runtime.withWorkflowLock(f.workflowId, () => mutateRecoverySessionState(f, state => {
    state.tasks.find(task => task.taskId === 'T2').reason = 'Independent task update during Planner'
  })))
  const state = await readRecoverySessionState(f)
  payload = { ...structuredClone(state.plan), owners: state.plan.owners.map(owner => ({ id: owner.id })) }
  await queue(f)
  await f.runtime.replanHandoffs(f.admissionAgent, f.workflowId)
  const saved = await readRecoverySessionState(f)
  assert.equal(saved.tasks.find(task => task.taskId === 'T2').reason, 'Independent task update during Planner')
  assert.equal(saved.recoveryAdmission.budget.totalUsed, 1)
})

test('T15 a source change during actual Planner execution prevents stale candidate application', { timeout: 30_000 }, async t => {
  let f, payload
  f = await setup(t, m => [() => m.toolCallResponse('stale-submit', 'workflow_plan_submit', { plan: payload }), 'hang-slow'])
  beforeFirstModel(f, () => mutateRecoverySessionState(f, state => { state.handoffQueue[0].summary = 'Changed handoff intent' }))
  const state = await readRecoverySessionState(f)
  payload = { ...structuredClone(state.plan), owners: state.plan.owners.map(owner => ({ id: owner.id })) }
  await queue(f)
  await assert.rejects(f.runtime.replanHandoffs(f.admissionAgent, f.workflowId), /source changed/)
  const saved = await readRecoverySessionState(f)
  assert.equal(saved.pendingPlanRevision, undefined)
  assert.equal(saved.recoveryAdmission.budget.totalUsed, 1)
  assert.equal(saved.recoveryAdmission.budget.attempts[0].state, 'running')
  const calls = f.adapter.requests.length
  await assert.rejects(f.runtime.replanHandoffs(f.admissionAgent, f.workflowId), /binding changed/)
  assert.equal(f.adapter.requests.length, calls)
  assert.equal((await readRecoverySessionState(f)).recoveryAdmission.budget.totalUsed, 1)
})

test('T15 normal partial handoff production records completed provenance without fabricating recovery', { timeout: 30_000 }, async t => {
  const f = await setup(t, () => [])
  const [handoff] = await queue(f, { completed: true })
  assert.equal(handoff.sourceExecution.reportStatus, 'completed')
  assert.equal(handoff.sourceExecution.commitSha, 'fixture-partial-commit')
  assert.equal((await readRecoverySessionState(f)).recoveryAdmission, undefined)
  assert.equal(f.adapter.requests.length, 0)
})

function beforeFirstModel(f, action) {
  const stream = f.adapter.stream.bind(f.adapter)
  let entered = false
  f.adapter.stream = async function* (options) {
    if (!entered) { entered = true; await action() }
    yield* stream(options)
  }
}


test('T15 multiple failed Owner handoffs are split into one source group per candidate', { timeout: 30_000 }, async t => {
  let payload
  const f = await setup(t, m => [() => m.toolCallResponse('group-submit', 'workflow_plan_submit', { plan: payload }), 'hang-slow'], { includeIndependentOwner: true })
  await queue(f)
  await mutateRecoverySessionState(f, state => {
    state.ownerRuns['T2:worker'] = { ...structuredClone(state.ownerRuns['T1:api']), taskId: 'T2', stageId: 'T2',
      ownerId: 'worker', attempt: 1, sessionId: 'T2-worker-failed-session' }
  })
  const state = await readRecoverySessionState(f)
  await f.runtime.recordHandoffs(state, state.plan.tasks[1], { owner: state.plan.owners[1], branch: 'fixture-worker' }, {
    status: 'blocked', handoffs: [{ targetType: 'owner', targetOwnerId: 'worker',
      files: ['src/worker/independent.mjs'], summary: 'Separate worker repair.' }],
  })
  payload = { ...structuredClone(state.plan), owners: state.plan.owners.map(owner => ({ id: owner.id })) }
  const result = await f.runtime.replanHandoffs(f.admissionAgent, f.workflowId)
  assert.equal(result.handoffIds.length, 1)
  const saved = await readRecoverySessionState(f)
  assert.equal(saved.recoveryAdmission.budget.totalUsed, 1)
  const selected = saved.handoffQueue.find(item => item.id === result.handoffIds[0])
  assert.equal(saved.recoveryAdmission.sources[0].ownerId, selected.sourceOwnerId)
  assert.equal(saved.handoffQueue.filter(item => item.status === 'pending').length, 2)
})

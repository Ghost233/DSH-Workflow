import assert from 'node:assert/strict'
import test from 'node:test'
import { writeFile } from 'node:fs/promises'
import { candidateRecoverySource } from '../src/candidate-recovery-pause.mjs'
import { readRecoverySessionState, mutateRecoverySessionState, reopenRecoverySessionFixture } from './fixtures/recovery-session-fixture.mjs'
import { setup, review, advice } from './fixtures/candidate-arbitration-fixture.mjs'

const consult = f => f.runtime.consultRecoveryCandidateOwners(f.admissionAgent, f.workflowId)

test('R77 real paid predecessor is replay-authenticated before consultation', { timeout: 30_000 }, async t => {
  const f = await setup(t)
  const state = await readRecoverySessionState(f)
  assert.equal(Object.values(state.candidateReviews)[0].phase, 'applied')
})

test('R77 actual consultation settles advice in the original root and fresh Harness replays without another model', { timeout: 30_000 }, async t => {
  const f = await setup(t, { independent: true })
  const before = await readRecoverySessionState(f)
  const result = await consult(f)
  assert.deepEqual(result, [advice('api')])
  const state = await readRecoverySessionState(f)
  assert.equal(state.recoveryAdmission.budget.totalUsed, 3)
  assert.equal(state.recoveryAdmission.budget.problems.length, 1)
  const op = Object.values(state.candidateOwnerConsultations)[0]
  assert.equal(op.phase, 'applied')
  assert.equal(op.ownerId, 'api')
  assert.equal(state.replanSessions[op.requestId].phase, 'applied')
  assert.equal(state.recoveryAdmission.budget.attempts.find(a => a.requestId === op.requestId).result.status, 'succeeded')
  assert.deepEqual(state.plan, before.plan)
  assert.deepEqual(state.pendingPlanRevision, before.pendingPlanRevision)
  assert.deepEqual(state.ownerRuns, before.ownerRuns)
  assert.notEqual(candidateRecoverySource(state), candidateRecoverySource(before))
  const events = (await f.readFrom(state.replanSessions[op.requestId].executionIdentity.sessionId)).events
  assert.ok(events.some(e => e.type === 'tool/call' && e.data.name === 'workflow_owner_advice_submit'))
  const calls = f.adapter.requests.length
  assert.deepEqual(await consult(f), result)
  assert.equal(f.adapter.requests.length, calls)
  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try { assert.deepEqual(await consult(fresh), result); assert.equal(fresh.adapter.requests.length, 0) } finally { await fresh.dispose() }
})

test('R77 exhausted actual consultation starts no child and leaves the candidate intact', { timeout: 30_000 }, async t => {
  const f = await setup(t, { limit: 2 })
  const before = await readRecoverySessionState(f), calls = f.adapter.requests.length
  await assert.rejects(consult(f), /admission refused/)
  assert.deepEqual(await readRecoverySessionState(f), before)
  assert.equal(f.adapter.requests.length, calls)
})

test('R77 known missing advice pays a failed ordinal and retries in the same logical operation', { timeout: 30_000 }, async t => {
  const f = await setup(t, { adviceScript: m => [m.textResponse('No structured advice.'), m.toolCallResponse('r77-retry', 'workflow_owner_advice_submit', { advice: advice('api') }), 'hang-slow'] })
  await assert.rejects(consult(f), { name: 'RecoverySemanticFailure' })
  const failed = await readRecoverySessionState(f), op = Object.values(failed.candidateOwnerConsultations)[0]
  assert.equal(op.phase, 'failed'); assert.equal(op.ordinal, 1)
  assert.equal(failed.recoveryAdmission.budget.attempts.at(-1).result.status, 'failed')
  assert.deepEqual(await consult(f), [advice('api')])
  const after = await readRecoverySessionState(f)
  assert.equal(after.recoveryAdmission.budget.totalUsed, 4)
  assert.equal(after.recoveryAdmission.budget.problems.length, 1)
  assert.equal(Object.keys(after.candidateOwnerConsultations).length, 1)
  assert.equal(after.candidateOwnerConsultations[op.operationId].ordinal, 2)
})

for (const field of ['candidate', 'convergence']) test(`R77 changed ${field} cannot reuse an accepted predecessor to fund advice`, { timeout: 30_000 }, async t => {
  const f = await setup(t)
  const before = await mutateRecoverySessionState(f, s => {
    if (field === 'candidate') s.pendingPlanRevision.parent++
    else s.planConvergence.evidenceDigest = 'changed-after-accepted-review'
  })
  const calls = f.adapter.requests.length
  await assert.rejects(consult(f), /changed|变化|不匹配/)
  assert.deepEqual(await readRecoverySessionState(f), before)
  assert.equal(f.adapter.requests.length, calls)
})

test('R77 candidate changes while the actual advisor runs prevent result adoption and preserve the paid attempt', { timeout: 30_000 }, async t => {
  const f = await setup(t)
  const runChild = f.runtime.runChild.bind(f.runtime), stream = f.adapter.stream.bind(f.adapter)
  let pending = false, changed = false
  f.runtime.runChild = (...args) => { if (args[4]?.requireOwnerAdviceSubmission) pending = true; return runChild(...args) }
  f.adapter.stream = async function* (options) {
    if (pending) {
      pending = false; changed = true
      await mutateRecoverySessionState(f, s => { s.pendingPlanRevision.reason = 'A concurrent new candidate decision' })
    }
    yield* stream(options)
  }
  await assert.rejects(consult(f), /changed|变化/)
  assert.equal(changed, true)
  const state = await readRecoverySessionState(f), op = Object.values(state.candidateOwnerConsultations)[0]
  assert.equal(state.pendingPlanRevision.reason, 'A concurrent new candidate decision')
  assert.notEqual(op.phase, 'applied')
  assert.equal(state.recoveryAdmission.budget.totalUsed, 3)
  assert.equal(state.recoveryAdmission.budget.attempts.at(-1).state, 'running')
})

test('R77 actual persisted child creation with a lost response pauses and fresh consultation never creates again', { timeout: 30_000 }, async t => {
  const f = await setup(t)
  const create = f.ctx.agents.create.bind(f.ctx.agents)
  let creates = 0, child
  f.ctx.agents.create = async (...args) => {
    creates++; child = await create(...args)
    await f.ctx.sessions.flush(child.agent.session)
    throw new Error('R77 injected lost response after actual advisor session persistence')
  }
  const calls = f.adapter.requests.length
  await assert.rejects(consult(f), /paused/)
  assert.equal(creates, 1); assert.equal(f.adapter.requests.length, calls)
  const before = await readRecoverySessionState(f), op = Object.values(before.candidateOwnerConsultations)[0]
  assert.equal(op.phase, 'reserved')
  assert.equal(before.replanSessions[op.requestId].phase, 'creating')
  assert.equal(before.recoveryAdmission.budget.totalUsed, 3)
  assert.equal(before.recoveryAdmission.budget.attempts.at(-1).state, 'reserved')
  assert.ok(await f.readRaw(child.agent.id))
  f.ctx.agents.create = create
  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try {
    await assert.rejects(consult(fresh), /paused/)
    assert.equal(fresh.adapter.requests.length, 0)
    assert.deepEqual(await readRecoverySessionState(fresh), before)
  } finally { await fresh.dispose() }
})

test('R77 wrong Owner submission is a paid failure, never a successful unavailable advice', { timeout: 30_000 }, async t => {
  const f = await setup(t, { independent: true, adviceScript: m => [m.toolCallResponse('r77-wrong-owner', 'workflow_owner_advice_submit', { advice: advice('worker') }), m.textResponse('Cannot submit for another Owner.')] })
  await assert.rejects(consult(f), { name: 'RecoverySemanticFailure' })
  const state = await readRecoverySessionState(f), op = Object.values(state.candidateOwnerConsultations)[0]
  assert.equal(op.phase, 'failed')
  assert.equal(op.result, undefined)
  assert.equal(state.recoveryAdmission.budget.totalUsed, 3)
  assert.equal(state.recoveryAdmission.budget.attempts.at(-1).result.status, 'failed')
  assert.equal(state.ownerRuns['T2:worker'], undefined)
})

test('R77 independent task updates survive the unlocked advisor and atomic advice settlement', { timeout: 30_000 }, async t => {
  const f = await setup(t, { independent: true })
  const runChild = f.runtime.runChild.bind(f.runtime), stream = f.adapter.stream.bind(f.adapter)
  let pending = false, changed = false
  f.runtime.runChild = (...args) => { if (args[4]?.requireOwnerAdviceSubmission) pending = true; return runChild(...args) }
  f.adapter.stream = async function* (options) {
    if (pending) {
      pending = false
      await f.runtime.withWorkflowLock(f.workflowId, () => mutateRecoverySessionState(f, s => { s.tasks.find(t => t.taskId === 'T2').note = 'independent update'; changed = true }))
    }
    yield* stream(options)
  }
  assert.deepEqual(await consult(f), [advice('api')])
  assert.equal(changed, true)
  assert.equal((await readRecoverySessionState(f)).tasks.find(t => t.taskId === 'T2').note, 'independent update')
})

test('R77 accepted advice cannot replay after its persisted result is altered', { timeout: 30_000 }, async t => {
  const f = await setup(t)
  await consult(f)
  const before = await mutateRecoverySessionState(f, s => {
    const op = Object.values(s.candidateOwnerConsultations)[0]
    op.result = { ...advice('api'), facts: ['Forged result without a new accepted receipt.'] }
  })
  const calls = f.adapter.requests.length
  await assert.rejects(consult(f), /changed|变化|不匹配/)
  assert.deepEqual(await readRecoverySessionState(f), before)
  assert.equal(f.adapter.requests.length, calls)
})

test('R77 each selected Owner has a separate paid operation and exhausted partial batches never restart an applied Owner', { timeout: 30_000 }, async t => {
  const both = { ...review, issues: review.issues.map(i => ({ ...i, targetTaskIds: ['T1', 'T2'] })) }
  const f = await setup(t, { independent: true, limit: 3, reviewPayload: both })
  await assert.rejects(consult(f), /admission refused/)
  const before = await readRecoverySessionState(f)
  assert.equal(before.recoveryAdmission.budget.totalUsed, 3)
  const ops = Object.values(before.candidateOwnerConsultations)
  assert.equal(ops.length, 1)
  assert.equal(ops[0].ownerId, 'api'); assert.equal(ops[0].phase, 'applied')
  const calls = f.adapter.requests.length
  await assert.rejects(consult(f), /admission refused/)
  assert.equal(f.adapter.requests.length, calls)
  assert.deepEqual(await readRecoverySessionState(f), before)
})

test('R77 both selected Owners settle distinct sessions in one root without creating another OwnerRun', { timeout: 30_000 }, async t => {
  const both = { ...review, issues: review.issues.map(i => ({ ...i, targetTaskIds: ['T1', 'T2'] })) }
  const f = await setup(t, { independent: true, reviewPayload: both, adviceScript: m => [
    m.toolCallResponse('r77-api', 'workflow_owner_advice_submit', { advice: advice('api') }), 'hang-slow',
    m.toolCallResponse('r77-worker', 'workflow_owner_advice_submit', { advice: advice('worker') }), 'hang-slow',
  ] })
  assert.deepEqual(await consult(f), [advice('api'), advice('worker')])
  const state = await readRecoverySessionState(f), ops = Object.values(state.candidateOwnerConsultations)
  assert.equal(state.recoveryAdmission.budget.totalUsed, 4)
  assert.equal(state.recoveryAdmission.budget.problems.length, 1)
  assert.equal(ops.length, 2)
  assert.equal(new Set(ops.map(o => o.requestId)).size, 2)
  assert.equal(state.ownerRuns['T2:worker'], undefined)
})

for (const predecessorKind of ['planner', 'review']) test(`R77 fresh consultation reauthenticates the actual ${predecessorKind} raw receipt before reserving`, { timeout: 30_000 }, async t => {
  const f = await setup(t)
  const before = await readRecoverySessionState(f)
  const op = Object.values(predecessorKind === 'planner' ? before.handoffReplans : before.candidateReviews)[0]
  const raw = await f.readRaw(before.replanSessions[op.requestId].executionIdentity.sessionId)
  const location = f.ctx.sessionPersistence.locate(raw.meta)
  // Actual artifact fault injection, not a mocked successful inspect call.
  await writeFile(location.path, raw.content.slice(0, -1), 'utf8')
  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try {
    await assert.rejects(consult(fresh), /原始回执|receipt changed/)
    assert.equal(fresh.adapter.requests.length, 0)
    assert.deepEqual(await readRecoverySessionState(fresh), before)
  } finally { await fresh.dispose(); await writeFile(location.path, raw.content, 'utf8') }
})

test('R77 later Owner failure retries only that Owner while retaining the first accepted consultation', { timeout: 30_000 }, async t => {
  const both = { ...review, issues: review.issues.map(i => ({ ...i, targetTaskIds: ['T1', 'T2'] })) }
  const f = await setup(t, { independent: true, reviewPayload: both, adviceScript: m => [
    m.toolCallResponse('r77-first-api', 'workflow_owner_advice_submit', { advice: advice('api') }), 'hang-slow',
    m.textResponse('Worker missing submission.'),
    m.toolCallResponse('r77-worker-retry', 'workflow_owner_advice_submit', { advice: advice('worker') }), 'hang-slow',
  ] })
  await assert.rejects(consult(f), { name: 'RecoverySemanticFailure' })
  const failed = await readRecoverySessionState(f)
  const api = Object.values(failed.candidateOwnerConsultations).find(o => o.ownerId === 'api')
  const worker = Object.values(failed.candidateOwnerConsultations).find(o => o.ownerId === 'worker')
  assert.equal(api.phase, 'applied'); assert.equal(worker.phase, 'failed')
  assert.deepEqual(await consult(f), [advice('api'), advice('worker')])
  const after = await readRecoverySessionState(f)
  assert.equal(after.recoveryAdmission.budget.totalUsed, 5)
  assert.deepEqual(after.candidateOwnerConsultations[api.operationId], api)
  assert.equal(after.candidateOwnerConsultations[worker.operationId].ordinal, 2)
  assert.equal(after.candidateOwnerConsultations[worker.operationId].phase, 'applied')
})

test('R77 arbitration without open target obligations consults the candidate Owner set', { timeout: 30_000 }, async t => {
  const f = await setup(t, { independent: true, noOpenTargets: true, adviceScript: m => [
    m.toolCallResponse('r77-fallback-api', 'workflow_owner_advice_submit', { advice: advice('api') }), 'hang-slow',
    m.toolCallResponse('r77-fallback-worker', 'workflow_owner_advice_submit', { advice: advice('worker') }), 'hang-slow',
  ] })
  const state = await readRecoverySessionState(f)
  assert.equal(state.planConvergence.obligations.filter(o => o.status === 'open').length, 0)
  assert.deepEqual(await consult(f), [advice('api'), advice('worker')])
})

test('R77 an observed raw advice with an uncommitted budget cannot masquerade as an applied operation', { timeout: 30_000 }, async t => {
  const f = await setup(t)
  const reconcile = f.runtime.reconcileReplanSession.bind(f.runtime)
  let observed
  f.runtime.reconcileReplanSession = async (...args) => {
    observed = await reconcile(...args)
    throw new Error('R77 stopped after real submission observation, before semantic adoption')
  }
  await assert.rejects(consult(f), /stopped after real submission/)
  assert.equal(observed.outcome, 'submission_observed')
  const before = await mutateRecoverySessionState(f, s => {
    // Fault injection models an inconsistent restored operation row; real raw
    // receipt and real running budget/session are intentionally retained.
    const op = Object.values(s.candidateOwnerConsultations)[0]
    op.phase = 'applied'; op.receipt = observed.receipt; op.result = observed.payload
  })
  assert.equal(before.recoveryAdmission.budget.attempts.at(-1).state, 'running')
  f.runtime.reconcileReplanSession = reconcile
  const calls = f.adapter.requests.length
  await assert.rejects(consult(f), /未结算|phase|applied|结算/)
  assert.deepEqual(await readRecoverySessionState(f), before)
  assert.equal(f.adapter.requests.length, calls)
})

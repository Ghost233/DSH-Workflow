import assert from 'node:assert/strict'
import test from 'node:test'
import { createConnection } from 'node:net'
import { writeFile } from 'node:fs/promises'
import { setup, review, advice } from './fixtures/candidate-arbitration-fixture.mjs'
import { readRecoverySessionState, mutateRecoverySessionState, reopenRecoverySessionFixture } from './fixtures/recovery-session-fixture.mjs'
import { reconcileReviewConvergence } from '../src/convergence.mjs'
import { candidateRecoverySource } from '../src/candidate-recovery-pause.mjs'

const passed = { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: 'Frozen dispute resolved by arbitration.', issues: [] }
const arbitrate = f => f.runtime.arbitratePendingPlanRevision(f.admissionAgent, undefined, { source: 'r78-test' })
async function ready(t, { arbiter = passed, limit = 6, noOpenTargets = true, tail, ...rest } = {}) {
  return setup(t, { limit, noOpenTargets, ...rest, adviceScript: m => [
    m.toolCallResponse('r78-advice', 'workflow_owner_advice_submit', { advice: advice('api') }), 'hang-slow',
    ...(tail?.(m) ?? [m.toolCallResponse('r78-arbitration', 'workflow_plan_review_submit', { review: arbiter }), 'hang-slow']),
  ] })
}
function drive(manifest) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(manifest.socketPath); let buffer = ''
    socket.setEncoding('utf8'); socket.setTimeout(25_000, () => socket.destroy(new Error('R78 socket timeout')))
    socket.on('connect', () => socket.write(`${JSON.stringify({ contract: 'DSH_WORKFLOW_CONTROL_V1', id: 'r78-driver', workflowId: manifest.workflowId,
      token: manifest.token, action: 'workflow-drive', expectedCommand: 'plan-revision-drive' })}\n`))
    socket.on('data', chunk => { buffer += chunk; const end = buffer.indexOf('\n'); if (end < 0) return
      const response = JSON.parse(buffer.slice(0, end)); socket.destroy(); if (response.ok) resolve(response.result); else reject(new Error(response.error)) })
    socket.on('error', reject)
  })
}

test('R78 real paid predecessor permits a nonpassed arbitration to choose an unused local rewrite', { timeout: 30_000 }, async t => {
  const f = await ready(t, { arbiter: review, candidateStrategy: 'owner_council', priorStrategies: ['diagnose', 'owner_council'] })
  const state = await readRecoverySessionState(f)
  const next = reconcileReviewConvergence({ previous: state.planConvergence, candidate: { ...state.pendingPlanRevision, strategy: 'arbitrate' }, review,
    evidenceDigest: 'r78-transition-probe', time: '2026-09-11T01:00:00Z', runtimeEvidence: await f.runtime.planReviewEvidence(state, state.pendingPlanRevision.plan, state.pendingPlanRevision.planDigest) })
  assert.equal(next.nextStrategy, 'local_subgraph_rewrite')
})

test('R78 actual arbitration pays separately after advice, preserves ordinary history, and replays fresh without model calls', { timeout: 30_000 }, async t => {
  const f = await ready(t)
  const before = await readRecoverySessionState(f)
  const result = await arbitrate(f)
  assert.equal(result.contract, 'DSH_PLAN_REVISION_ARBITRATION_RESULT_V1')
  assert.equal(result.review.status, 'passed')
  assert.equal(result.convergence.nextStrategy, 'awaiting_approval')
  const state = await readRecoverySessionState(f), op = Object.values(state.candidateArbitrations)[0]
  assert.equal(op.phase, 'applied')
  assert.equal(state.recoveryAdmission.budget.totalUsed, 4)
  assert.equal(state.recoveryAdmission.budget.problems.length, 1)
  assert.equal(state.replanSessions[op.requestId].phase, 'applied')
  assert.equal(state.recoveryAdmission.budget.attempts.find(a => a.requestId === op.requestId).result.status, 'succeeded')
  assert.deepEqual(state.candidateReviews, before.candidateReviews)
  assert.deepEqual(state.plan, before.plan); assert.deepEqual(state.ownerRuns, before.ownerRuns)
  assert.notEqual(candidateRecoverySource(state), candidateRecoverySource(before))
  const events = (await f.readFrom(state.replanSessions[op.requestId].executionIdentity.sessionId)).events
  assert.ok(events.some(e => e.type === 'tool/call' && e.data.name === 'workflow_plan_review_submit'))
  const calls = f.adapter.requests.length
  assert.equal((await arbitrate(f)).review.status, 'passed')
  assert.equal(f.adapter.requests.length, calls)
  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try { assert.equal((await arbitrate(fresh)).review.status, 'passed'); assert.equal(fresh.adapter.requests.length, 0) } finally { await fresh.dispose() }
})

test('R78 real control socket drives the paid arbitration and next drive recognizes its effective review', { timeout: 30_000 }, async t => {
  const f = await ready(t)
  const manifest = await f.runtime.ensureControlBridge(f.admissionAgent, await readRecoverySessionState(f))
  try {
    const result = await drive(manifest)
    assert.equal(result.action, 'arbitrated')
    assert.equal(result.review.status, 'passed')
    const calls = f.adapter.requests.length
    assert.equal((await f.runtime.drivePendingPlanRevision(f.admissionAgent)).action, 'awaiting_approval')
    assert.equal(f.adapter.requests.length, calls)
  } finally { await f.runtime.closeControlBridge(f.workflowId) }
})

test('R78 exhaustion after a paid advisor does not start an unmetered Arbiter or repeat advice', { timeout: 30_000 }, async t => {
  const f = await ready(t, { limit: 3 })
  await assert.rejects(arbitrate(f), /admission refused/)
  const before = await readRecoverySessionState(f), calls = f.adapter.requests.length
  assert.equal(before.recoveryAdmission.budget.totalUsed, 3)
  assert.equal(Object.values(before.candidateOwnerConsultations)[0].phase, 'applied')
  await assert.rejects(arbitrate(f), /admission refused/)
  assert.equal(f.adapter.requests.length, calls)
  assert.deepEqual(await readRecoverySessionState(f), before)
})

test('R78 invalid arbitration semantics pay a new ordinal while already applied advice stays unchanged', { timeout: 30_000 }, async t => {
  const outside = { ...review, issues: review.issues.map(i => ({ ...i, obligationId: 'r78-outside', title: 'Owner scope is disputed', detail: 'A new Owner boundary allegation.', suggestion: 'Change the responsibility scope.' })) }
  const f = await ready(t, { tail: m => [m.toolCallResponse('r78-invalid', 'workflow_plan_review_submit', { review: outside }), 'hang-slow',
    m.toolCallResponse('r78-retry', 'workflow_plan_review_submit', { review: passed }), 'hang-slow'] })
  await assert.rejects(arbitrate(f), { name: 'RecoverySemanticFailure' })
  const failed = await readRecoverySessionState(f), op = Object.values(failed.candidateArbitrations)[0]
  assert.equal(op.phase, 'failed'); assert.equal(op.ordinal, 1)
  assert.equal(failed.recoveryAdmission.budget.attempts.at(-1).result.status, 'failed')
  assert.equal((await arbitrate(f)).review.status, 'passed')
  const state = await readRecoverySessionState(f)
  assert.equal(state.recoveryAdmission.budget.totalUsed, 5)
  assert.deepEqual(state.candidateOwnerConsultations, failed.candidateOwnerConsultations)
  assert.equal(state.candidateArbitrations[op.operationId].ordinal, 2)
})

test('R78 candidate changes during a real Arbiter turn prevent adoption of its observed receipt', { timeout: 30_000 }, async t => {
  const f = await ready(t)
  const run = f.runtime.runChild.bind(f.runtime), stream = f.adapter.stream.bind(f.adapter)
  let pending = false, changed = false
  f.runtime.runChild = (...args) => { if (args[4]?.requirePlanReviewSubmission) pending = true; return run(...args) }
  f.adapter.stream = async function* (options) {
    if (pending) { pending = false; changed = true; await mutateRecoverySessionState(f, s => { s.pendingPlanRevision.reason = 'Concurrent candidate change during arbitration' }) }
    yield* stream(options)
  }
  await assert.rejects(arbitrate(f), /changed|变化/)
  const state = await readRecoverySessionState(f)
  assert.equal(changed, true)
  assert.equal(state.recoveryAdmission.budget.totalUsed, 4)
  assert.notEqual(Object.values(state.candidateArbitrations)[0].phase, 'applied')
  assert.equal(state.recoveryAdmission.budget.attempts.at(-1).state, 'running')
})

test('R78 real Arbiter creation persisted before response loss never starts twice on a fresh Harness', { timeout: 30_000 }, async t => {
  const f = await ready(t)
  await f.runtime.consultRecoveryCandidateOwners(f.admissionAgent, f.workflowId)
  const create = f.ctx.agents.create.bind(f.ctx.agents); let creates = 0
  f.ctx.agents.create = async (...args) => { creates++; const child = await create(...args); await f.ctx.sessions.flush(child.agent.session); throw new Error('R78 lost actual Arbiter creation response') }
  const calls = f.adapter.requests.length
  await assert.rejects(arbitrate(f), /paused/)
  assert.equal(creates, 1); assert.equal(f.adapter.requests.length, calls)
  const before = await readRecoverySessionState(f), op = Object.values(before.candidateArbitrations)[0]
  assert.equal(before.replanSessions[op.requestId].phase, 'creating')
  assert.equal(before.recoveryAdmission.budget.totalUsed, 4)
  f.ctx.agents.create = create
  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try { await assert.rejects(arbitrate(fresh), /paused/); assert.equal(fresh.adapter.requests.length, 0); assert.deepEqual(await readRecoverySessionState(fresh), before) } finally { await fresh.dispose() }
})

test('R78 real arbitration then driver local rebuild carries the arbitration source and original failure root', { timeout: 40_000 }, async t => {
  let rebuilt
  const f = await ready(t, { policy: true, limits: { totalLimit: 12, problemLimit: 8 },
    candidateStrategy: 'owner_council', priorStrategies: ['diagnose', 'owner_council'], tail: m => [
    m.toolCallResponse('r78-local-arbiter', 'workflow_plan_review_submit', { review }), 'hang-slow',
    () => m.toolCallResponse('r78-rebuild', 'workflow_plan_submit', { plan: rebuilt }), 'hang-slow',
    m.toolCallResponse('r78-rebuilt-review', 'workflow_plan_review_submit', { review: passed }), 'hang-slow',
  ] })
  const original = await readRecoverySessionState(f)
  rebuilt = { ...structuredClone(original.plan), summary: 'R78 post-arbitration local repair', owners: original.plan.owners.map(o => ({ id: o.id })) }
  const arbitration = await f.runtime.drivePendingPlanRevision(f.admissionAgent)
  assert.equal(arbitration.action, 'arbitrated')
  assert.equal(arbitration.convergence.nextStrategy, 'local_subgraph_rewrite')
  const before = await readRecoverySessionState(f)
  const result = await f.runtime.drivePendingPlanRevision(f.admissionAgent)
  assert.equal(result.action, 'recovery_rebuilt_and_reviewed')
  const state = await readRecoverySessionState(f)
  assert.equal(state.recoveryRuntimePolicy.source, 'R92-T19-REPRESENTATIVE-V1')
  assert.equal(state.recoveryAdmissionConfig.totalLimit, 12)
  assert.equal(state.recoveryAdmissionConfig.problemLimit, 8)
  assert.equal(state.pendingPlanRevision.plan.summary, rebuilt.summary)
  assert.equal(state.recoveryAdmission.budget.totalUsed, 6)
  assert.equal(state.recoveryAdmission.budget.problems.length, 1)
  assert.deepEqual(state.plan, original.plan)
  assert.deepEqual(state.candidateArbitrations, before.candidateArbitrations)
  for (const [id, op] of Object.entries(original.candidateReviews)) assert.deepEqual(state.candidateReviews[id], op)
  const planner = Object.values(state.handoffReplans).find(o => o.requestId === state.pendingPlanRevision.recoveryRequestId)
  assert.deepEqual(planner.predecessor.candidate, before.pendingPlanRevision)
  assert.equal(planner.predecessor.arbitrationOperation.requestId, Object.values(before.candidateArbitrations)[0].requestId)
  assert.deepEqual(planner.origin, original.pendingPlanRevision.recoveryOrigin)
  const calls = f.adapter.requests.length
  assert.equal((await f.runtime.drivePendingPlanRevision(f.admissionAgent)).action, 'awaiting_approval')
  assert.equal(f.adapter.requests.length, calls)
})

for (const kind of ['arbitration', 'advice', 'ordinary-review', 'planner']) test(`R78 applied arbitration fresh replay authenticates frozen ${kind} raw evidence`, { timeout: 30_000 }, async t => {
  const f = await ready(t)
  await arbitrate(f)
  const before = await readRecoverySessionState(f)
  const op = Object.values(kind === 'arbitration' ? before.candidateArbitrations : kind === 'advice' ? before.candidateOwnerConsultations : kind === 'planner' ? before.handoffReplans : before.candidateReviews)[0]
  const raw = await f.readRaw(before.replanSessions[op.requestId].executionIdentity.sessionId), location = f.ctx.sessionPersistence.locate(raw.meta)
  await writeFile(location.path, raw.content.slice(0, -1), 'utf8')
  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try { await assert.rejects(arbitrate(fresh)); assert.equal(fresh.adapter.requests.length, 0); assert.deepEqual(await readRecoverySessionState(fresh), before) }
  finally { await fresh.dispose(); await writeFile(location.path, raw.content, 'utf8') }
})

test('R78 an earlier caller delayed after real advice replays arbitration completed by a later caller', { timeout: 30_000 }, async t => {
  const f = await ready(t)
  const consult = f.runtime.consultRecoveryCandidateOwners.bind(f.runtime)
  let release, reached
  const barrier = new Promise(resolve => { release = resolve })
  const firstReady = new Promise(resolve => { reached = resolve })
  let first = true
  f.runtime.consultRecoveryCandidateOwners = async (...args) => {
    const isFirst = first; first = false
    const result = await consult(...args)
    if (isFirst) { reached(); await barrier }
    return result
  }
  const early = arbitrate(f)
  try {
    await firstReady
    const winner = await arbitrate(f)
    const calls = f.adapter.requests.length
    release()
    const replay = await early
    assert.equal(winner.review.status, 'passed')
    assert.equal(replay.review.status, 'passed')
    assert.equal(f.adapter.requests.length, calls)
    assert.equal((await readRecoverySessionState(f)).recoveryAdmission.budget.totalUsed, 4)
  } finally { release(); await early.catch(() => undefined) }
})

for (const checkpoint of ['before-review-authentication', 'after-review-authentication']) test(`R78 arbitration replay survives a winner ${checkpoint} in consultation`, { timeout: 30_000 }, async t => {
  const f = await ready(t)
  const authenticate = f.runtime.reviewRecoveryCandidate.bind(f.runtime)
  let release, reached, first = true
  const barrier = new Promise(resolve => { release = resolve })
  const firstReady = new Promise(resolve => { reached = resolve })
  f.runtime.reviewRecoveryCandidate = async (...args) => {
    const pause = first; first = false
    if (pause && checkpoint === 'before-review-authentication') { reached(); await barrier }
    const result = await authenticate(...args)
    if (pause && checkpoint === 'after-review-authentication') { reached(); await barrier }
    return result
  }
  const early = arbitrate(f)
  try {
    await firstReady
    const winner = await arbitrate(f)
    const before = await readRecoverySessionState(f), calls = f.adapter.requests.length
    release()
    const replay = await early
    assert.equal(winner.review.status, 'passed')
    assert.equal(replay.review.status, 'passed')
    assert.equal(replay.replayed, true)
    assert.equal(replay.provenance.kind, 'arbitration')
    assert.equal(f.adapter.requests.length, calls)
    assert.equal(before.recoveryAdmission.budget.totalUsed, 4)
    assert.deepEqual(await readRecoverySessionState(f), before)
  } finally { release(); await early.catch(() => undefined) }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { writeFile } from 'node:fs/promises'
import { plannerSubmitDefinition, planReviewSubmitDefinition } from '../index.js'
import { inspectReplanSession } from '../src/replan-session.mjs'
import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'
import {
  createRecoverySessionFixture, reopenRecoverySessionFixture, readRecoverySessionState, mutateRecoverySessionState, ownerFailureRequest, appendObservedPrompt,
} from './fixtures/recovery-session-fixture.mjs'

async function reserve(f, operationKind = 'revision_plan', ordinal = 1) {
  const response = await f.runtime.reserveRecoveryAdmission(f.admissionAgent, f.workflowId, {
    contract: 'DSH_REPLAN_ADMISSION_REQUEST_V1', origin: ownerFailureRequest(f),
    operation: { operationKind, operationId: 'controlled-cycle:step', ordinal },
  })
  assert.equal(response.outcome, 'reserved', JSON.stringify(response))
  return response
}
const request = receipt => ({
  contract: 'DSH_REPLAN_SESSION_REQUEST_V1', requestId: receipt.requestId,
  prompt: { id: receipt.executionIdentity.promptId, content: 'Read the plan and submit the requested structured result.' },
})
function register(f) {
  f.ctx.tools.register(plannerSubmitDefinition(f.runtime))
  f.ctx.tools.register(planReviewSubmitDefinition(f.runtime))
}

for (const review of [false, true]) test(`T15 actual ${review ? 'Review' : 'Planner'} reserved child produces a raw accepted receipt and replays without another model call`, { timeout: 30_000 }, async t => {
  let payload
  const f = await createRecoverySessionFixture(t, { executable: true, modelScript: m => [
    () => m.toolCallResponse('actual-submit', review ? 'workflow_plan_review_submit' : 'workflow_plan_submit', { [review ? 'review' : 'plan']: payload }),
    'hang-slow',
  ] })
  const before = await readRecoverySessionState(f)
  payload = review
    ? { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: 'Controlled review.', issues: [] }
    : { ...structuredClone(before.plan), owners: before.plan.owners.map(owner => ({ id: owner.id })) }
  register(f)
  const receipt = await reserve(f, review ? 'revision_review' : 'revision_plan')
  const answer = await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))
  assert.equal(answer.outcome, 'submission_observed', JSON.stringify(answer))
  assert.deepEqual(answer.payload, payload)
  assert.equal(answer.receipt.callId, 'actual-submit')
  assert.equal(answer.receipt.terminalKind, 'aborted')
  const saved = await readRecoverySessionState(f)
  assert.equal(saved.recoveryAdmission.budget.totalUsed, 1)
  assert.equal(saved.recoveryAdmission.budget.attempts[0].state, 'running')
  assert.equal(saved.replanSessions[receipt.requestId].phase, 'submission_observed')
  const intent = saved.recoveryAdmission.intents[0]
  assert.equal((await inspectReplanSession({ persistence: f.ctx.sessionPersistence, intent, prompt: request(receipt).prompt })).reason, 'extra_or_wrong_input')
  assert.equal((await inspectReplanSession({ persistence: f.ctx.sessionPersistence, intent, prompt: request(receipt).prompt, contextMessages: saved.replanSessions[receipt.requestId].contextMessages })).outcome, 'submission_observed')
  assert.deepEqual(saved.ownerRuns, before.ownerRuns)
  assert.deepEqual(saved.plan, before.plan)
  assert.equal(saved.pendingPlanRevision, undefined)
  const raw = await f.readRaw(receipt.executionIdentity.sessionId)
  assert.ok(raw.content.includes('actual-submit'))
  const calls = f.adapter.requests.length
  const reopened = createOwnerWorkflowRuntime(f.ctx, {})
  await reopened.prepareRoot(f.root)
  const replay = await reopened.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))
  assert.equal(replay.outcome, 'submission_observed', JSON.stringify(replay))
  assert.deepEqual(replay.receipt, answer.receipt)
  assert.equal(f.adapter.requests.length, calls)
  assert.deepEqual(await f.readRaw(receipt.executionIdentity.sessionId), raw)
  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try {
    const restarted = await fresh.runtime.reconcileReplanSession(fresh.admissionAgent, fresh.workflowId, request(receipt))
    assert.equal(restarted.outcome, 'submission_observed', JSON.stringify(restarted))
    assert.deepEqual(restarted.payload, payload)
    assert.deepEqual(restarted.receipt, answer.receipt)
    assert.equal(fresh.adapter.requests.length, 0)
  } finally { await fresh.dispose() }
})

test('T15 a real completed child without a submission settles failed and permits one paid next ordinal', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, { executable: true, responses: ['No structured result.'] })
  register(f)
  const receipt = await reserve(f)
  const answer = await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))
  assert.equal(answer.outcome, 'failed', JSON.stringify(answer))
  const saved = await readRecoverySessionState(f)
  assert.equal(saved.recoveryAdmission.budget.attempts[0].state, 'settled')
  assert.equal(saved.recoveryAdmission.budget.attempts[0].result.status, 'failed')
  const calls = f.adapter.requests.length
  assert.equal((await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))).outcome, 'failed')
  assert.equal(f.adapter.requests.length, calls)
  const next = await reserve(f, 'revision_plan', 2)
  assert.equal(next.rootProblemId, receipt.rootProblemId)
  assert.notEqual(next.requestId, receipt.requestId)
  assert.equal((await readRecoverySessionState(f)).recoveryAdmission.budget.totalUsed, 2)
})

test('T15 real multi-step Planner reads evidence before its accepted submission', { timeout: 30_000 }, async t => {
  let payload
  const f = await createRecoverySessionFixture(t, { executable: true, modelScript: m => [
    m.toolCallResponse('inspect-evidence', 'replan_read_probe', {}),
    () => m.toolCallResponse('multi-submit', 'workflow_plan_submit', { plan: payload }),
    'hang-slow',
  ] })
  const initial = await readRecoverySessionState(f)
  payload = { ...structuredClone(initial.plan), owners: initial.plan.owners.map(owner => ({ id: owner.id })) }
  register(f)
  f.ctx.tools.register({
    name: 'replan_read_probe', description: 'Return controlled read-only evidence.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute() { return { observed: true } },
  })
  const receipt = await reserve(f)
  const answer = await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))
  assert.equal(answer.outcome, 'submission_observed', JSON.stringify(answer))
  const events = (await f.readFrom(receipt.executionIdentity.sessionId)).events
  assert.ok(events.filter(event => event.type === 'step/start').length >= 2)
  assert.equal(answer.receipt.callId, 'multi-submit')
  assert.equal((await readRecoverySessionState(f)).recoveryAdmission.budget.totalUsed, 1)
})

test('T15 an uncertain create after a real session creation never resends its prompt', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, { executable: true })
  register(f)
  const receipt = await reserve(f)
  const create = f.ctx.agents.create.bind(f.ctx.agents)
  let creates = 0
  f.ctx.agents.create = async (...args) => {
    creates++
    await create(...args)
    throw new Error('Injected lost response after real create')
  }
  const first = await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))
  assert.equal(first.outcome, 'paused')
  assert.equal(creates, 1)
  assert.equal(f.adapter.requests.length, 0)
  const before = await readRecoverySessionState(f)
  assert.equal(before.replanSessions[receipt.requestId].phase, 'creating')
  assert.equal(before.recoveryAdmission.budget.attempts[0].state, 'reserved')
  f.ctx.agents.create = create
  const reopened = createOwnerWorkflowRuntime(f.ctx, {})
  await reopened.prepareRoot(f.root)
  const second = await reopened.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))
  assert.equal(second.outcome, 'paused')
  assert.equal(f.adapter.requests.length, 0)
  assert.deepEqual(await readRecoverySessionState(f), before)
})

test('T15 wrong prompt and a source awaiting user decision cannot start a child', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, { executable: true })
  register(f)
  const receipt = await reserve(f)
  const before = await readRecoverySessionState(f)
  const wrong = request(receipt); wrong.prompt.id = 'wrong-prompt'
  assert.equal((await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, wrong)).outcome, 'paused')
  assert.deepEqual(await readRecoverySessionState(f), before)
  await mutateRecoverySessionState(f, state => { state.tasks[0].action = 'await_user' })
  const waiting = await readRecoverySessionState(f)
  assert.equal((await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))).outcome, 'paused')
  assert.deepEqual(await readRecoverySessionState(f), waiting)
  assert.equal(f.adapter.requests.length, 0)
})

test('T15 replay rejects altered frozen input and execution receipt without a new call', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, { executable: true, responses: ['No submission.'] })
  register(f)
  const receipt = await reserve(f)
  assert.equal((await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))).outcome, 'failed')
  const calls = f.adapter.requests.length
  const before = await readRecoverySessionState(f)
  const changed = request(receipt); changed.prompt.content = 'Changed instructions.'
  assert.equal((await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, changed)).outcome, 'paused')
  assert.deepEqual(await readRecoverySessionState(f), before)
  await mutateRecoverySessionState(f, state => { state.recoveryAdmission.budget.attempts[0].executionRef.id = 'unrelated-session' })
  const invalid = await readRecoverySessionState(f)
  assert.equal((await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))).outcome, 'paused')
  assert.deepEqual(await readRecoverySessionState(f), invalid)
  assert.equal(f.adapter.requests.length, calls)
})

test('T15 a physically torn JSONL artifact pauses replay without changing the ledger or resending', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, { executable: true, responses: ['No submission.'] })
  register(f)
  const receipt = await reserve(f)
  assert.equal((await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))).outcome, 'failed')
  const before = await readRecoverySessionState(f)
  const raw = await f.readRaw(receipt.executionIdentity.sessionId)
  const location = f.ctx.sessionPersistence.locate(raw.meta)
  assert.equal(typeof location.path, 'string')
  const calls = f.adapter.requests.length
  await writeFile(location.path, raw.content.slice(0, -1), 'utf8')
  try {
    const answer = await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))
    assert.equal(answer.outcome, 'paused')
    assert.equal(answer.reason, 'read_failed')
    assert.deepEqual(await readRecoverySessionState(f), before)
    assert.equal(f.adapter.requests.length, calls)
  } finally { await writeFile(location.path, raw.content, 'utf8') }
})

test('T15 a reserved identity with an existing real session cannot be treated as a fresh launch', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, { executable: true, responses: ['Existing session.'] })
  const receipt = await reserve(f)
  await appendObservedPrompt(f, receipt, request(receipt).prompt.content)
  const before = await readRecoverySessionState(f)
  const raw = await f.readRaw(receipt.executionIdentity.sessionId)
  const calls = f.adapter.requests.length
  const answer = await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))
  assert.equal(answer.outcome, 'paused')
  assert.match(answer.reason, /reserved_session_already_exists/)
  assert.deepEqual(await readRecoverySessionState(f), before)
  assert.deepEqual(await f.readRaw(receipt.executionIdentity.sessionId), raw)
  assert.equal(f.adapter.requests.length, calls)
})

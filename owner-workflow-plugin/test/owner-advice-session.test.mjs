import assert from 'node:assert/strict'
import test from 'node:test'
import { ownerAdviceSubmitDefinition } from '../index.js'
import { normalizeOwnerPlanningAdvice, OWNER_ADVICE_SUBMISSION_SCHEMA } from '../src/owner-advice.mjs'
import { inspectReplanSession } from '../src/replan-session.mjs'
import {
  createRecoverySessionFixture,
  mutateRecoverySessionState,
  ownerFailureRequest,
  readRecoverySessionState,
  reopenRecoverySessionFixture,
} from './fixtures/recovery-session-fixture.mjs'

const adviceFor = ownerId => ({
  contract: 'DSH_OWNER_PLANNING_ADVICE_V1',
  ownerId,
  scopeFit: 'partial',
  facts: ['The current persisted failure belongs to the API owner.'],
  constraints: ['The advisor remains read-only.'],
  suggestedNodes: ['Preserve the existing local verification task.'],
  dependencies: [],
  handoffs: [],
  risks: [],
  verificationSuggestions: ['Keep unit verification fixed.'],
})

function register(f) {
  f.ctx.tools.register(ownerAdviceSubmitDefinition(f.runtime))
}

async function reserveAdvice(f, { ownerId = 'worker', ordinal = 1, operationId = `owner-advice:${ownerId}` } = {}) {
  const response = await f.runtime.reserveRecoveryAdmission(f.admissionAgent, f.workflowId, {
    contract: 'DSH_REPLAN_ADMISSION_REQUEST_V1',
    origin: ownerFailureRequest(f),
    operation: { operationKind: 'owner_consultation', operationId, ordinal },
  })
  assert.equal(response.outcome, 'reserved', JSON.stringify(response))
  return response
}

const request = (receipt, ownerId = 'worker') => ({
  contract: 'DSH_REPLAN_SESSION_REQUEST_V1',
  requestId: receipt.requestId,
  prompt: { id: receipt.executionIdentity.promptId, content: 'Read your Owner memory and submit one structured consultation advice.' },
  ownerId,
})

test('R76 owner-advice normalizer canonicalizes optional lists while the public schema requires every field', () => {
  const normalized = normalizeOwnerPlanningAdvice({
    contract: 'DSH_OWNER_PLANNING_ADVICE_V1', ownerId: 'worker', scopeFit: 'full',
    facts: [' fact ', 'fact', 'second'], constraints: undefined,
    suggestedNodes: undefined, dependencies: undefined, handoffs: undefined,
    risks: undefined, verificationSuggestions: undefined,
  }, 'worker')
  assert.deepEqual(normalized.facts, ['fact', 'second'])
  for (const field of ['constraints', 'suggestedNodes', 'dependencies', 'handoffs', 'risks', 'verificationSuggestions']) {
    assert.deepEqual(normalized[field], [])
  }
  assert.equal(OWNER_ADVICE_SUBMISSION_SCHEMA.additionalProperties, false)
  assert.deepEqual(OWNER_ADVICE_SUBMISSION_SCHEMA.required, [
    'contract', 'ownerId', 'scopeFit', 'facts', 'constraints', 'suggestedNodes',
    'dependencies', 'handoffs', 'risks', 'verificationSuggestions',
  ])
  assert.throws(() => normalizeOwnerPlanningAdvice({ ...adviceFor('api') }, 'worker'), /身份不匹配/)
})

test('R76 paid worker owner-consultation writes an accepted raw receipt and fresh replay cannot spend again', { timeout: 30_000 }, async t => {
  const payload = adviceFor('worker')
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includeIndependentOwner: true,
    modelScript: m => [
      m.toolCallResponse('worker-advice-submit', 'workflow_owner_advice_submit', { advice: payload }),
      'hang-slow',
    ],
  })
  register(f)
  const before = await readRecoverySessionState(f)
  assert.equal(before.ownerRuns['T2:worker'], undefined)
  assert.throws(() => f.runtime.submitOwnerAdvice(f.admissionAgent, payload), /只能由当前Owner会诊子代理调用/)
  assert.deepEqual(await readRecoverySessionState(f), before)

  const receipt = await reserveAdvice(f)
  assert.equal(receipt.rootProblemId, (await readRecoverySessionState(f)).recoveryAdmission.budget.problems[0].rootProblemId)
  const answer = await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))
  assert.equal(answer.outcome, 'submission_observed', JSON.stringify(answer))
  assert.deepEqual(answer.payload, payload)
  assert.equal(answer.receipt.toolName, 'workflow_owner_advice_submit')
  assert.equal(answer.receipt.callId, 'worker-advice-submit')
  assert.equal(answer.receipt.terminalKind, 'aborted')

  const saved = await readRecoverySessionState(f)
  const intent = saved.recoveryAdmission.intents[0]
  assert.equal(intent.operationKind, 'owner_consultation')
  assert.equal(intent.rootProblemId, receipt.rootProblemId)
  assert.equal(saved.recoveryAdmission.budget.totalUsed, 1)
  assert.equal(saved.recoveryAdmission.budget.attempts[0].state, 'running')
  assert.equal(saved.replanSessions[receipt.requestId].ownerId, 'worker')
  assert.equal(saved.replanSessions[receipt.requestId].phase, 'submission_observed')
  assert.equal(saved.ownerRuns['T2:worker'], undefined)
  const observed = await inspectReplanSession({
    persistence: f.ctx.sessionPersistence, intent, prompt: request(receipt).prompt,
    ownerId: 'worker', contextMessages: saved.replanSessions[receipt.requestId].contextMessages,
  })
  assert.equal(observed.outcome, 'submission_observed')
  const events = (await f.readFrom(receipt.executionIdentity.sessionId)).events
  assert.ok(events.some(event => event.type === 'sandbox/mode' && event.data?.mode === 'read-only'))
  const raw = await f.readRaw(receipt.executionIdentity.sessionId)
  assert.ok(raw.content.includes('worker-advice-submit'))

  const calls = f.adapter.requests.length
  const unchanged = await readRecoverySessionState(f)
  const wrongOwner = await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt, 'api'))
  assert.equal(wrongOwner.outcome, 'paused')
  const unknown = await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, {
    ...request(receipt), requestId: 'unknown-owner-advice-request',
  })
  assert.equal(unknown.outcome, 'paused')
  assert.deepEqual(await readRecoverySessionState(f), unchanged)
  assert.equal(f.adapter.requests.length, calls)

  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try {
    const replay = await fresh.runtime.reconcileReplanSession(fresh.admissionAgent, fresh.workflowId, request(receipt))
    assert.equal(replay.outcome, 'submission_observed', JSON.stringify(replay))
    assert.deepEqual(replay.payload, payload)
    assert.deepEqual(replay.receipt, answer.receipt)
    assert.equal(fresh.adapter.requests.length, 0)
  } finally { await fresh.dispose() }
})

test('R76 exhausted owner-consultation admission refuses a second Owner before a child is created', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includeIndependentOwner: true,
    limits: { totalLimit: 1, problemLimit: 1 },
  })
  register(f)
  const first = await reserveAdvice(f, { ownerId: 'worker', operationId: 'owner-advice:worker' })
  const before = await readRecoverySessionState(f)
  const refused = await f.runtime.reserveRecoveryAdmission(f.admissionAgent, f.workflowId, {
    contract: 'DSH_REPLAN_ADMISSION_REQUEST_V1', origin: ownerFailureRequest(f),
    operation: { operationKind: 'owner_consultation', operationId: 'owner-advice:api', ordinal: 1 },
  })
  assert.equal(first.outcome, 'reserved')
  assert.equal(refused.outcome, 'rejected')
  assert.equal((await readRecoverySessionState(f)).recoveryAdmission.budget.totalUsed, before.recoveryAdmission.budget.totalUsed)
  assert.equal(f.adapter.requests.length, 0)
})

test('R76 a wrong-owner structured payload never becomes an accepted advice receipt', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includeIndependentOwner: true,
    modelScript: m => [
      m.toolCallResponse('wrong-owner-advice', 'workflow_owner_advice_submit', { advice: adviceFor('api') }),
      m.textResponse('No accepted advice was submitted.'),
    ],
  })
  register(f)
  const receipt = await reserveAdvice(f)
  const answer = await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))
  assert.equal(answer.outcome, 'failed', JSON.stringify(answer))
  assert.equal(answer.receipt, undefined)
  const state = await readRecoverySessionState(f)
  assert.equal(state.replanSessions[receipt.requestId].phase, 'settled_failed')
  assert.equal(state.recoveryAdmission.budget.attempts[0].result.status, 'failed')
  const raw = await f.readRaw(receipt.executionIdentity.sessionId)
  assert.ok(raw.content.includes('wrong-owner-advice'))
  assert.ok(!raw.content.includes('"accepted":true,"ownerId":"worker"'))
})

test('R76 an uncertain owner-advisor creation preserves its worker binding for fresh Harness reconciliation without a prompt', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, { executable: true, includeIndependentOwner: true })
  register(f)
  const receipt = await reserveAdvice(f)
  const create = f.ctx.agents.create.bind(f.ctx.agents)
  let creates = 0
  let created
  f.ctx.agents.create = async (...args) => {
    creates++
    created = await create(...args)
    await f.ctx.sessions.flush(created.agent.session)
    throw new Error('Injected lost response after real owner-advisor creation')
  }

  const first = await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(receipt))
  assert.equal(first.outcome, 'paused')
  assert.equal(creates, 1)
  assert.equal(f.adapter.requests.length, 0)
  const before = await readRecoverySessionState(f)
  assert.equal(before.replanSessions[receipt.requestId].phase, 'creating')
  assert.equal(before.replanSessions[receipt.requestId].ownerId, 'worker')
  assert.equal(before.recoveryAdmission.budget.attempts[0].state, 'reserved')
  assert.equal(created.agent.id, receipt.executionIdentity.sessionId)
  assert.equal(created.agent.session.header.id, receipt.executionIdentity.sessionId)
  const raw = await f.readRaw(receipt.executionIdentity.sessionId)
  assert.ok(raw)
  assert.ok(!raw.content.includes(request(receipt).prompt.content))

  f.ctx.agents.create = create
  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try {
    const replay = await fresh.runtime.reconcileReplanSession(fresh.admissionAgent, fresh.workflowId, request(receipt))
    assert.equal(replay.outcome, 'paused')
    assert.equal(fresh.adapter.requests.length, 0)
    assert.deepEqual(await readRecoverySessionState(fresh), before)
  } finally { await fresh.dispose() }
})

test('R76 a completed owner-advisor turn without submission settles failed and permits its next paid ordinal', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includeIndependentOwner: true,
    limits: { totalLimit: 2, problemLimit: 2 },
    responses: ['No structured Owner advice.'],
  })
  register(f)
  const first = await reserveAdvice(f)
  const answer = await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(first))
  assert.equal(answer.outcome, 'failed', JSON.stringify(answer))
  const state = await readRecoverySessionState(f)
  assert.equal(state.replanSessions[first.requestId].phase, 'settled_failed')
  assert.equal(state.recoveryAdmission.budget.attempts[0].state, 'settled')
  assert.equal(state.recoveryAdmission.budget.attempts[0].result.status, 'failed')
  const calls = f.adapter.requests.length
  assert.equal((await f.runtime.reconcileReplanSession(f.admissionAgent, f.workflowId, request(first))).outcome, 'failed')
  assert.equal(f.adapter.requests.length, calls)
  const second = await reserveAdvice(f, { ordinal: 2 })
  assert.equal(second.rootProblemId, first.rootProblemId)
  assert.notEqual(second.requestId, first.requestId)
  assert.equal((await readRecoverySessionState(f)).recoveryAdmission.budget.totalUsed, 2)
})

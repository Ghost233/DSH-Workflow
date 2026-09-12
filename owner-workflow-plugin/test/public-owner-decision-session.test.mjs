import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { publicOwnerDecisionSubmitDefinition } from '../index.js'
import {
  PUBLIC_OWNER_CHANGE_DECISION_CONTRACT,
  PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT,
  publicOwnerContextDigest,
} from '../src/public-owner-change.mjs'
import { PUBLIC_OWNER_DECISION_SESSION_REQUEST_CONTRACT } from '../src/public-owner-session.mjs'
import {
  createRecoverySessionFixture,
  mutateRecoverySessionState,
  readRecoverySessionState,
  reopenRecoverySessionFixture,
} from './fixtures/recovery-session-fixture.mjs'

function context(f, overrides = {}) {
  return {
    workflowId: f.workflowId,
    planRevision: 1,
    planDigest: f.planDigest,
    owners: ['session', 'interface', 'cache'],
    tickets: [{ id: 'T-06', revision: 'R4' }],
    acceptanceCriteria: ['AC-05', 'AC-06', 'AC-13', 'AC-29'],
    contracts: [
      { id: 'shared-session', revision: 'K1', ownerId: 'session' },
      { id: 'interface-contract', revision: 'A1', ownerId: 'interface' },
      { id: 'cache-contract', revision: 'B1', ownerId: 'cache' },
    ],
    evidenceRefs: ['ev-gap', 'ev-session', 'ev-interface', 'ev-cache'],
    consumerInventoryComplete: true,
    consumers: [
      { consumerId: 'interface-ui', ownerId: 'interface', contract: { id: 'interface-contract', revision: 'A1' }, evidenceRefs: ['ev-interface'] },
      { consumerId: 'cache-recovery', ownerId: 'cache', contract: { id: 'cache-contract', revision: 'B1' }, evidenceRefs: ['ev-cache'] },
    ],
    ...overrides,
  }
}

function changeRequest(ctx, { requestId = 'ca01-interface-reset', targetOwnerId = 'session', contractId = 'shared-session', revision = 'K1' } = {}) {
  return {
    contract: PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT,
    requestId,
    requestVersion: 1,
    requesterOwnerId: 'interface',
    targetOwnerId,
    source: { tickets: [{ id: 'T-06', revision: 'R4' }], acceptanceCriteria: ['AC-05', 'AC-29'] },
    baseline: {
      workflowId: ctx.workflowId,
      planRevision: ctx.planRevision,
      planDigest: ctx.planDigest,
      contract: { id: contractId, revision },
      contextDigest: publicOwnerContextDigest(ctx),
    },
    expectedBehavior: 'A disconnects without removing B recovery cache.',
    actualGap: 'A requested a global cache clear that would invalidate B recovery.',
    evidenceRefs: ['ev-gap'],
    suggestion: 'Add an interface-only reset while preserving recovery.',
    supersedesRequestDigest: null,
  }
}

function decisionFor(request, requestDigest, ownerId = request.targetOwnerId, overrides = {}) {
  return {
    contract: PUBLIC_OWNER_CHANGE_DECISION_CONTRACT,
    decisionId: `${request.requestId}-decision`,
    requestId: request.requestId,
    requestVersion: request.requestVersion,
    requestDigest,
    targetOwnerId: ownerId,
    baseline: structuredClone(request.baseline),
    outcome: 'compatible_extension',
    summary: 'The public Owner can add K2 while preserving recovery.',
    basisRefs: ['ev-session'],
    affectedConsumers: [
      { consumerId: 'interface-ui', ownerId: 'interface', impact: 'compatible', evidenceRefs: ['ev-interface'] },
      { consumerId: 'cache-recovery', ownerId: 'cache', impact: 'no_change', evidenceRefs: ['ev-cache'] },
    ],
    contractChange: { nextRevision: 'K2', behavior: 'Reset interface state only.', compatibility: 'K1 recovery remains valid.' },
    migrationOrder: [], alternative: null, unknowns: [], businessChange: null,
    ...overrides,
  }
}

function requestFor(f, ctx = context(f), request = changeRequest(ctx), promptId = `prompt-${request.requestId}`) {
  return {
    contract: PUBLIC_OWNER_DECISION_SESSION_REQUEST_CONTRACT,
    request,
    context: ctx,
    prompt: { id: promptId, content: `Judge fixed public change request ${request.requestId}.` },
  }
}

function requestDigest(request) {
  const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : value !== null && typeof value === 'object'
      ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
      : JSON.stringify(value)
  return createHash('sha256').update(canonical(request)).digest('hex')
}

function register(f) {
  f.ctx.tools.register(publicOwnerDecisionSubmitDefinition(f.runtime))
}

test('T28 real public Owner structured submission persists and fresh Runtime replays without a model call', { timeout: 30_000 }, async t => {
  let payload
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    modelScript: m => [
      () => m.toolCallResponse('public-decision-submit', 'workflow_public_owner_decision_submit', { decision: payload }),
      'hang-slow',
    ],
  })
  register(f)
  const raw = requestFor(f)
  payload = decisionFor(raw.request, requestDigest(raw.request))
  const answer = await f.runtime.reconcilePublicOwnerDecisionSession(f.admissionAgent, f.workflowId, raw)
  assert.equal(answer.outcome, 'submission_observed', JSON.stringify(answer))
  assert.equal(answer.projection.action, 'implement_public_extension')
  assert.ok(answer.notificationId.startsWith('pod-'))
  assert.ok(answer.planIntentId.startsWith('intent-public-owner-'))
  const state = await readRecoverySessionState(f)
  const record = state.publicOwnerDecisionSessions['ca01-interface-reset:1']
  assert.equal(record.phase, 'submission_observed')
  assert.equal(record.receipt.toolName, 'workflow_public_owner_decision_submit')
  assert.equal(state.mainOutbox[answer.notificationId].action, 'implement_public_extension')
  assert.equal(state.intents.filter(item => item.sourceKind === 'public-owner-decision').length, 1)
  assert.equal(state.intentPlanRevisionCycle.phase, 'rebuild_pending')
  assert.ok((await f.readRaw(record.executionIdentity.sessionId)).content.includes('public-decision-submit'))

  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try {
    fresh.ctx.tools.register(publicOwnerDecisionSubmitDefinition(fresh.runtime))
    const replay = await fresh.runtime.reconcilePublicOwnerDecisionSession(fresh.admissionAgent, fresh.workflowId, raw)
    assert.equal(replay.outcome, 'submission_observed')
    assert.equal(replay.decisionDigest, answer.decisionDigest)
    assert.equal(fresh.adapter.requests.length, 0)
    const replayedState = await readRecoverySessionState(f)
    assert.equal(replayedState.intents.filter(item => item.sourceKind === 'public-owner-decision').length, 1)
  } finally { await fresh.dispose() }
})

test('T28 ordinary assistant text is a durable no-submit failure and is never parsed as a decision', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    responses: [JSON.stringify({ contract: PUBLIC_OWNER_CHANGE_DECISION_CONTRACT })],
  })
  register(f)
  const raw = requestFor(f)
  const answer = await f.runtime.reconcilePublicOwnerDecisionSession(f.admissionAgent, f.workflowId, raw)
  assert.equal(answer.outcome, 'failed', JSON.stringify(answer))
  assert.equal(answer.reason, 'submission_missing')
  const before = f.adapter.requests.length
  const replay = await f.runtime.reconcilePublicOwnerDecisionSession(f.admissionAgent, f.workflowId, raw)
  assert.equal(replay.outcome, 'failed')
  assert.equal(f.adapter.requests.length, before)
  assert.equal((await readRecoverySessionState(f)).publicOwnerChangeLog.decisions.length, 0)
})

test('T28 wrong Owner structured submission cannot produce a public decision', { timeout: 30_000 }, async t => {
  let payload
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    modelScript: m => [
      () => m.toolCallResponse('wrong-public-owner', 'workflow_public_owner_decision_submit', { decision: payload }),
      m.textResponse('The invalid decision was rejected.'),
    ],
  })
  register(f)
  const raw = requestFor(f)
  payload = decisionFor(raw.request, requestDigest(raw.request), 'cache')
  const answer = await f.runtime.reconcilePublicOwnerDecisionSession(f.admissionAgent, f.workflowId, raw)
  assert.equal(answer.outcome, 'failed', JSON.stringify(answer))
  const state = await readRecoverySessionState(f)
  assert.equal((state.intents ?? []).filter(item => item.sourceKind === 'public-owner-decision').length, 0)
  assert.equal(state.publicOwnerChangeLog.decisions.length, 0)
  assert.equal(state.publicOwnerDecisionSessions['ca01-interface-reset:1'].phase, 'settled_failed')
})

test('T28 K1 response becomes durable stale history when active execution changes during the model turn', { timeout: 30_000 }, async t => {
  let payload
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    modelScript: m => [
      () => m.toolCallResponse('late-public-decision', 'workflow_public_owner_decision_submit', { decision: payload }),
      'hang-slow',
    ],
  })
  register(f)
  const raw = requestFor(f)
  payload = decisionFor(raw.request, requestDigest(raw.request))
  const stream = f.adapter.stream.bind(f.adapter)
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  f.adapter.stream = async function* (options) {
    entered.resolve()
    await release.promise
    yield* stream(options)
  }
  const running = f.runtime.reconcilePublicOwnerDecisionSession(f.admissionAgent, f.workflowId, raw)
  await entered.promise
  await f.runtime.withWorkflowLock(f.workflowId, () => mutateRecoverySessionState(f, state => {
    state.activePlanRevision = 2
    state.plan.summary = 'K2 active public contract plan'
    state.planDigest = createHash('sha256').update(JSON.stringify(state.plan)).digest('hex')
  }))
  release.resolve()
  const answer = await running
  assert.equal(answer.outcome, 'stale', JSON.stringify(answer))
  const state = await readRecoverySessionState(f)
  assert.equal(state.publicOwnerDecisionSessions['ca01-interface-reset:1'].phase, 'stale')
  assert.equal(state.publicOwnerChangeLog.decisions.length, 0)
  const calls = f.adapter.requests.length
  assert.equal((await f.runtime.reconcilePublicOwnerDecisionSession(f.admissionAgent, f.workflowId, raw)).outcome, 'stale')
  assert.equal(f.adapter.requests.length, calls)
})

test('T28 a durable consultation reservation occupies capacity and queues another Owner', { timeout: 30_000 }, async t => {
  let firstPayload
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    modelScript: m => [
      () => m.toolCallResponse('first-public-decision', 'workflow_public_owner_decision_submit', { decision: firstPayload }),
      'hang-slow',
    ],
  })
  register(f)
  await mutateRecoverySessionState(f, state => { state.config = { ...(state.config ?? {}), parallel: 1 } })
  const first = requestFor(f)
  firstPayload = decisionFor(first.request, requestDigest(first.request))
  const stream = f.adapter.stream.bind(f.adapter)
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  f.adapter.stream = async function* (options) {
    entered.resolve()
    await release.promise
    yield* stream(options)
  }
  const running = f.runtime.reconcilePublicOwnerDecisionSession(f.admissionAgent, f.workflowId, first)
  await entered.promise
  const sameOwner = await f.runtime.reconcilePublicOwnerDecisionSession(f.admissionAgent, f.workflowId, first)
  assert.deepEqual({ outcome: sameOwner.outcome, phase: sameOwner.phase, reason: sameOwner.reason }, {
    outcome: 'queued', phase: 'queued', reason: 'owner_busy',
  })
  const secondContext = context(f)
  const secondRequest = changeRequest(secondContext, {
    requestId: 'ca01-cache-check', targetOwnerId: 'cache', contractId: 'cache-contract', revision: 'B1',
  })
  const queued = await f.runtime.reconcilePublicOwnerDecisionSession(
    f.admissionAgent,
    f.workflowId,
    requestFor(f, secondContext, secondRequest),
  )
  assert.deepEqual({ outcome: queued.outcome, phase: queued.phase, reason: queued.reason }, {
    outcome: 'queued', phase: 'queued', reason: 'capacity_full',
  })
  release.resolve()
  assert.equal((await running).outcome, 'submission_observed')
  const state = await readRecoverySessionState(f)
  assert.equal(state.publicOwnerDecisionSessions['ca01-interface-reset:1'].phase, 'submission_observed')
  assert.equal(state.publicOwnerDecisionSessions['ca01-cache-check:1'], undefined)
})

test('T28 timeout settles the consultation and releases capacity for a later request', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    runtimeConfig: { planningChildTimeoutMs: 50 },
    modelScript: () => ['hang-slow'],
  })
  register(f)
  const first = requestFor(f)
  const answer = await f.runtime.reconcilePublicOwnerDecisionSession(f.admissionAgent, f.workflowId, first)
  assert.equal(answer.outcome, 'cancelled', JSON.stringify(answer))
  assert.equal(answer.reason, 'deadline_exceeded')
  const state = await readRecoverySessionState(f)
  assert.equal(state.publicOwnerDecisionSessions['ca01-interface-reset:1'].phase, 'settled_timeout')
  const secondContext = context(f)
  const secondRequest = changeRequest(secondContext, { requestId: 'ca01-next-check' })
  const next = await f.runtime.reconcilePublicOwnerDecisionSession(
    f.admissionAgent,
    f.workflowId,
    requestFor(f, secondContext, secondRequest),
  )
  assert.notEqual(next.reason, 'capacity_full')
})

test('T28 parent cancellation settles the durable consultation and releases its reservation', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    modelScript: () => ['hang-slow'],
  })
  register(f)
  const controller = new AbortController()
  const entered = Promise.withResolvers()
  const stream = f.adapter.stream.bind(f.adapter)
  f.adapter.stream = async function* (options) {
    entered.resolve()
    yield* stream(options)
  }
  const running = f.runtime.reconcilePublicOwnerDecisionSession(
    f.admissionAgent,
    f.workflowId,
    requestFor(f),
    controller.signal,
  )
  await entered.promise
  controller.abort(new Error('parent cancelled public consultation'))
  const answer = await running
  assert.deepEqual({ outcome: answer.outcome, phase: answer.phase, reason: answer.reason }, {
    outcome: 'cancelled', phase: 'settled_cancelled', reason: 'submission_missing',
  })
  const state = await readRecoverySessionState(f)
  assert.equal(state.publicOwnerDecisionSessions['ca01-interface-reset:1'].phase, 'settled_cancelled')
  assert.equal((state.intents ?? []).filter(item => item.sourceKind === 'public-owner-decision').length, 0)
  const nextContext = context(f)
  const nextRequest = changeRequest(nextContext, { requestId: 'ca01-after-parent-cancel' })
  const next = await f.runtime.reconcilePublicOwnerDecisionSession(
    f.admissionAgent,
    f.workflowId,
    requestFor(f, nextContext, nextRequest),
  )
  assert.notEqual(next.reason, 'capacity_full')
})

test('T28 a public Owner business change reaches the main outbox as an explicit user decision', { timeout: 30_000 }, async t => {
  let payload
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    modelScript: m => [
      () => m.toolCallResponse('public-business-decision', 'workflow_public_owner_decision_submit', { decision: payload }),
      'hang-slow',
    ],
  })
  register(f)
  const raw = requestFor(f)
  payload = decisionFor(raw.request, requestDigest(raw.request), raw.request.targetOwnerId, {
    outcome: 'business_decision_required',
    summary: 'Disconnect semantics would remove the existing recovery commitment.',
    affectedConsumers: [],
    contractChange: null,
    businessChange: {
      acceptanceCriterion: 'AC-05',
      currentCommitment: 'Recovery cache remains available after disconnect.',
      proposedCommitment: 'Disconnect removes the recovery cache.',
      consequence: 'The cache consumer can no longer resume the previous session.',
    },
  })
  const answer = await f.runtime.reconcilePublicOwnerDecisionSession(f.admissionAgent, f.workflowId, raw)
  assert.equal(answer.outcome, 'submission_observed', JSON.stringify(answer))
  assert.equal(answer.projection.action, 'user_decision')
  const state = await readRecoverySessionState(f)
  assert.equal((state.intents ?? []).filter(item => item.sourceKind === 'public-owner-decision').length, 0)
  assert.deepEqual(
    {
      reason: state.mainOutbox[answer.notificationId].reason,
      action: state.mainOutbox[answer.notificationId].action,
      outcome: state.mainOutbox[answer.notificationId].outcome,
    },
    {
      reason: 'public_owner_decision_ready',
      action: 'user_decision',
      outcome: 'business_decision_required',
    },
  )
})

test('T28 uncertain child creation is never retried from a missing durable binding', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, { executable: true, includePublicOwnerScenario: true })
  register(f)
  const create = f.ctx.agents.create.bind(f.ctx.agents)
  let creates = 0
  f.ctx.agents.create = async (...args) => {
    creates += 1
    const handle = await create(...args)
    await f.ctx.sessions.flush(handle.agent.session)
    throw new Error('Injected lost response after public Owner child creation')
  }
  const raw = requestFor(f)
  const first = await f.runtime.reconcilePublicOwnerDecisionSession(f.admissionAgent, f.workflowId, raw)
  assert.equal(first.outcome, 'paused')
  assert.equal(creates, 1)
  const replay = await f.runtime.reconcilePublicOwnerDecisionSession(f.admissionAgent, f.workflowId, raw)
  assert.equal(replay.outcome, 'paused')
  assert.equal(replay.reason, 'creation_not_bound')
  assert.equal(creates, 1)
})

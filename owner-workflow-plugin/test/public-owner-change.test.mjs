import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createPublicOwnerChangeLog,
  normalizePublicOwnerChangeLog,
  projectPublicOwnerChange,
  publicOwnerContextDigest,
  registerPublicOwnerChangeDecision,
  registerPublicOwnerChangeRequest,
  PUBLIC_OWNER_CHANGE_DECISION_CONTRACT,
  PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT,
} from '../src/public-owner-change.mjs'

const hash = character => character.repeat(64)

function context(overrides = {}) {
  return {
    workflowId: 'wf-public-owner',
    planRevision: 3,
    planDigest: hash('a'),
    owners: ['public', 'app', 'cache'],
    tickets: [{ id: 'T-06', revision: 'R4' }],
    acceptanceCriteria: ['AC-06', 'AC-29'],
    contracts: [
      { id: 'shared-session', revision: 'K1', ownerId: 'public' },
      { id: 'app-contract', revision: 'A1', ownerId: 'app' },
      { id: 'cache-contract', revision: 'B1', ownerId: 'cache' },
    ],
    evidenceRefs: ['ev-gap', 'ev-shared', 'ev-app', 'ev-cache'],
    consumerInventoryComplete: true,
    consumers: [
      { consumerId: 'app-ui', ownerId: 'app', contract: { id: 'app-contract', revision: 'A1' }, evidenceRefs: ['ev-app'] },
      { consumerId: 'cache-runtime', ownerId: 'cache', contract: { id: 'cache-contract', revision: 'B1' }, evidenceRefs: ['ev-cache'] },
    ],
    ...overrides,
  }
}

function request(ctx = context(), overrides = {}) {
  return {
    contract: PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT,
    requestId: 'shared-session-clear-cache',
    requestVersion: 1,
    requesterOwnerId: 'app',
    targetOwnerId: 'public',
    source: { tickets: [{ id: 'T-06', revision: 'R4' }], acceptanceCriteria: ['AC-06'] },
    baseline: {
      workflowId: ctx.workflowId,
      planRevision: ctx.planRevision,
      planDigest: ctx.planDigest,
      contract: { id: 'shared-session', revision: 'K1' },
      contextDigest: publicOwnerContextDigest(ctx),
    },
    expectedBehavior: 'Disconnect clears interface state while cache recovery remains available.',
    actualGap: 'The current caller can only request clearing the shared cache globally.',
    evidenceRefs: ['ev-gap'],
    suggestion: 'Add a compatible interface-only reset operation.',
    supersedesRequestDigest: null,
    ...overrides,
  }
}

function consumerImpacts(impact = 'no_change') {
  return [
    { consumerId: 'app-ui', ownerId: 'app', impact, evidenceRefs: ['ev-app'] },
    { consumerId: 'cache-runtime', ownerId: 'cache', impact: 'no_change', evidenceRefs: ['ev-cache'] },
  ]
}

function decision(accepted, overrides = {}) {
  return {
    contract: PUBLIC_OWNER_CHANGE_DECISION_CONTRACT,
    decisionId: 'shared-session-clear-cache-decision',
    requestId: accepted.request.requestId,
    requestVersion: accepted.request.requestVersion,
    requestDigest: accepted.requestDigest,
    targetOwnerId: accepted.request.targetOwnerId,
    baseline: structuredClone(accepted.request.baseline),
    outcome: 'capability_sufficient',
    summary: 'The existing contract already exposes the required interface-only reset.',
    basisRefs: ['ev-shared'],
    affectedConsumers: consumerImpacts(),
    contractChange: null,
    migrationOrder: [],
    alternative: null,
    unknowns: [],
    businessChange: null,
    ...overrides,
  }
}

test('T06 accepts and replays one complete versioned public Owner request', () => {
  const ctx = context()
  const first = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), request(ctx), ctx)
  assert.equal(first.outcome, 'accepted')
  assert.match(first.requestDigest, /^[a-f0-9]{64}$/u)
  const replay = registerPublicOwnerChangeRequest(first.log, request(ctx), ctx)
  assert.equal(replay.outcome, 'replayed')
  assert.equal(replay.requestDigest, first.requestDigest)
  assert.deepEqual(replay.log, first.log)
})

test('T06 rejects absent fields and unknown Owner, Ticket, AC, contract, or evidence references', () => {
  const ctx = context()
  const faults = [
    value => { delete value.requestId },
    value => { value.targetOwnerId = 'unknown' },
    value => { value.source.tickets[0].id = 'T-404' },
    value => { value.source.acceptanceCriteria[0] = 'AC-404' },
    value => { value.baseline.contract.id = 'unknown-contract' },
    value => { value.evidenceRefs = ['ev-unknown'] },
    value => { value.baseline.contextDigest = hash('f') },
  ]
  for (const mutate of faults) {
    const value = request(ctx)
    mutate(value)
    assert.throws(() => registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), value, ctx))
  }
})

test('T06 same ID and version conflict, while the next version must exactly supersede the prior digest', () => {
  const ctx = context()
  const first = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), request(ctx), ctx)
  assert.throws(() => registerPublicOwnerChangeRequest(first.log,
    request(ctx, { suggestion: 'Conflicting content at the same request version.' }), ctx),
  /REQUEST_VERSION_CONFLICT/u)
  assert.throws(() => registerPublicOwnerChangeRequest(first.log,
    request(ctx, { requestVersion: 3, supersedesRequestDigest: first.requestDigest }), ctx),
  /INVALID_SUPERSESSION/u)
  const second = registerPublicOwnerChangeRequest(first.log, request(ctx, {
    requestVersion: 2,
    suggestion: 'Use a narrower compatible reset operation.',
    supersedesRequestDigest: first.requestDigest,
  }), ctx)
  assert.equal(second.outcome, 'accepted')
  assert.equal(second.log.requests.length, 2)
})

test('T06 capability-sufficient decision requires every known consumer fact and is the only immediately ready result', () => {
  const ctx = context()
  const accepted = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), request(ctx), ctx)
  assert.throws(() => registerPublicOwnerChangeDecision(accepted.log,
    decision(accepted, { affectedConsumers: consumerImpacts().slice(0, 1) }), ctx),
  /CONSUMER_FACTS_INCOMPLETE/u)
  const decided = registerPublicOwnerChangeDecision(accepted.log, decision(accepted), ctx)
  assert.equal(decided.outcome, 'accepted')
  assert.deepEqual(projectPublicOwnerChange(decided.log, accepted.request.requestId, ctx), {
    status: 'ready', ready: true, action: 'rebind_consumers',
    requestDigest: accepted.requestDigest,
    decisionDigest: decided.decisionDigest,
    outcome: 'capability_sufficient',
  })
  const replay = registerPublicOwnerChangeDecision(decided.log, decision(accepted), ctx)
  assert.equal(replay.outcome, 'replayed')

  const unknownConsumers = context({ consumerInventoryComplete: false, consumers: [] })
  const unknownRequest = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), request(unknownConsumers), unknownConsumers)
  assert.throws(() => registerPublicOwnerChangeDecision(unknownRequest.log,
    decision(unknownRequest, { affectedConsumers: [] }), unknownConsumers),
  /CONSUMER_FACTS_INCOMPLETE/u)
  const missing = registerPublicOwnerChangeDecision(unknownRequest.log, decision(unknownRequest, {
    outcome: 'facts_missing', summary: 'The consumer inventory is incomplete.', affectedConsumers: [],
    unknowns: [{ fact: 'Which Owners consume K1.', ownerId: 'public', closeWhen: 'A bounded repository inventory returns.' }],
  }), unknownConsumers)
  assert.equal(projectPublicOwnerChange(missing.log, unknownRequest.request.requestId, unknownConsumers).action,
    'bounded_investigation')
})

test('T06 compatible extension stays blocked until the public Owner implementation exists', () => {
  const ctx = context()
  const accepted = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), request(ctx), ctx)
  const decided = registerPublicOwnerChangeDecision(accepted.log, decision(accepted, {
    outcome: 'compatible_extension',
    summary: 'K2 adds interface reset without removing K1 cache recovery.',
    affectedConsumers: consumerImpacts('compatible'),
    contractChange: { nextRevision: 'K2', behavior: 'Add interface-only reset.', compatibility: 'K1 recovery remains valid.' },
  }), ctx)
  const projection = projectPublicOwnerChange(decided.log, accepted.request.requestId, ctx)
  assert.equal(projection.ready, false)
  assert.equal(projection.action, 'implement_public_extension')
})

test('T06 migration decision binds the complete impacted consumer set and exact order', () => {
  const ctx = context()
  const accepted = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), request(ctx), ctx)
  const base = decision(accepted, {
    outcome: 'migration_required',
    summary: 'The app consumer must migrate before K1 removal.',
    affectedConsumers: consumerImpacts('update_required'),
    contractChange: { nextRevision: 'K2', behavior: 'Introduce scoped reset.', compatibility: 'K1 remains until migration.' },
    migrationOrder: ['app-ui'],
  })
  assert.equal(registerPublicOwnerChangeDecision(accepted.log, base, ctx).decision.outcome, 'migration_required')
  assert.throws(() => registerPublicOwnerChangeDecision(accepted.log, { ...base, migrationOrder: [] }, ctx), /INVALID_OUTCOME/u)
})

test('T06 rejection, missing facts, and business change use distinct evidence-bearing outcomes', () => {
  for (const variant of [
    {
      outcome: 'rejected', summary: 'Global clearing violates cache recovery.',
      alternative: { kind: 'alternative', detail: 'Use an interface-only reset.' },
    },
    {
      outcome: 'facts_missing', summary: 'Cache consumer behavior is not yet established.',
      affectedConsumers: [], unknowns: [{ fact: 'Whether B persists the recovery cache.', ownerId: 'cache', closeWhen: 'Cache Owner returns a fixed contract reference.' }],
    },
    {
      outcome: 'business_decision_required', summary: 'The proposal would remove AC-06 behavior.',
      affectedConsumers: [], businessChange: {
        acceptanceCriterion: 'AC-06', currentCommitment: 'Cache recovery remains available.',
        proposedCommitment: 'Disconnect removes recovery cache.', consequence: 'B can no longer resume.',
      },
    },
  ]) {
    const ctx = context()
    const accepted = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), request(ctx), ctx)
    const decided = registerPublicOwnerChangeDecision(accepted.log, decision(accepted, variant), ctx)
    const projection = projectPublicOwnerChange(decided.log, accepted.request.requestId, ctx)
    assert.equal(projection.ready, false)
    assert.equal(projection.outcome, variant.outcome)
  }
})

test('T06 a decision bound to an older execution, contract, or consumer context becomes stale', () => {
  const ctx = context()
  const accepted = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), request(ctx), ctx)
  const decided = registerPublicOwnerChangeDecision(accepted.log, decision(accepted), ctx)
  const contexts = [
    context({ planRevision: 4, planDigest: hash('b') }),
    context({ contracts: context().contracts.map(item => item.id === 'shared-session' ? { ...item, revision: 'K2' } : item) }),
    context({ consumers: context().consumers.slice(0, 1) }),
  ]
  for (const changed of contexts) {
    const projection = projectPublicOwnerChange(decided.log, accepted.request.requestId, changed)
    assert.equal(projection.status, 'stale')
    assert.equal(projection.ready, false)
    assert.equal(projection.action, 'request_new_version')
  }
})

test('T06 conflicting decisions cannot overwrite an accepted decision for the same request', () => {
  const ctx = context()
  const accepted = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), request(ctx), ctx)
  const decided = registerPublicOwnerChangeDecision(accepted.log, decision(accepted), ctx)
  assert.throws(() => registerPublicOwnerChangeDecision(decided.log,
    decision(accepted, { summary: 'Different decision for the same fixed request.' }), ctx),
  /DECISION_CONFLICT/u)
})

test('T06 persisted request or decision tampering fails closed even when the attacker recomputes no digest', () => {
  const ctx = context()
  const accepted = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), request(ctx), ctx)
  const decided = registerPublicOwnerChangeDecision(accepted.log, decision(accepted), ctx)
  const requestTamper = structuredClone(decided.log)
  requestTamper.requests[0].request.actualGap = 'tampered'
  assert.throws(() => normalizePublicOwnerChangeLog(requestTamper), /DIGEST_MISMATCH/u)
  const decisionTamper = structuredClone(decided.log)
  decisionTamper.decisions[0].decision.outcome = 'business_decision_required'
  assert.throws(() => normalizePublicOwnerChangeLog(decisionTamper))
})

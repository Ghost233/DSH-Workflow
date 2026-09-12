import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizePlanV2 } from '../src/model.mjs'
import { createPlanRevision } from '../src/plan-revision.mjs'
import {
  PUBLIC_OWNER_CHANGE_DECISION_CONTRACT,
  PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT,
  createPublicOwnerChangeLog,
  publicOwnerContextDigest,
  registerPublicOwnerChangeDecision,
  registerPublicOwnerChangeRequest,
} from '../src/public-owner-change.mjs'
import {
  PUBLIC_OWNER_PLAN_BINDING_CONTRACT,
  assertPublicOwnerPlanAuthority,
} from '../src/public-owner-plan.mjs'

const activeDigest = 'c'.repeat(64)

function authority(outcome = 'compatible_extension') {
  const context = {
    workflowId: 'wf-public-plan', planRevision: 1, planDigest: activeDigest,
    owners: ['public', 'app', 'cache'],
    tickets: [{ id: 'T-30', revision: 'R4' }], acceptanceCriteria: ['AC-05'],
    contracts: [
      { id: 'shared-session', revision: 'K1', ownerId: 'public' },
      { id: 'app-contract', revision: 'A1', ownerId: 'app' },
      { id: 'cache-contract', revision: 'B1', ownerId: 'cache' },
    ],
    evidenceRefs: ['ev-gap', 'ev-public', 'ev-app', 'ev-cache'],
    consumerInventoryComplete: true,
    consumers: [
      { consumerId: 'app-ui', ownerId: 'app', contract: { id: 'app-contract', revision: 'A1' }, evidenceRefs: ['ev-app'] },
      { consumerId: 'cache-runtime', ownerId: 'cache', contract: { id: 'cache-contract', revision: 'B1' }, evidenceRefs: ['ev-cache'] },
    ],
  }
  const request = {
    contract: PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT,
    requestId: 'shared-reset', requestVersion: 1, requesterOwnerId: 'app', targetOwnerId: 'public',
    source: { tickets: [{ id: 'T-30', revision: 'R4' }], acceptanceCriteria: ['AC-05'] },
    baseline: {
      workflowId: context.workflowId, planRevision: 1, planDigest: activeDigest,
      contract: { id: 'shared-session', revision: 'K1' }, contextDigest: publicOwnerContextDigest(context),
    },
    expectedBehavior: 'Reset app state and preserve recovery.', actualGap: 'K1 only exposes global reset.',
    evidenceRefs: ['ev-gap'], suggestion: 'Add K2.', supersedesRequestDigest: null,
  }
  const accepted = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), request, context)
  const decision = {
    contract: PUBLIC_OWNER_CHANGE_DECISION_CONTRACT,
    decisionId: 'shared-reset-decision', requestId: request.requestId, requestVersion: 1,
    requestDigest: accepted.requestDigest, targetOwnerId: 'public', baseline: structuredClone(request.baseline),
    outcome, summary: 'K2 preserves K1 recovery.', basisRefs: ['ev-public'],
    affectedConsumers: [
      { consumerId: 'app-ui', ownerId: 'app', impact: outcome === 'migration_required' ? 'update_required' : 'compatible', evidenceRefs: ['ev-app'] },
      { consumerId: 'cache-runtime', ownerId: 'cache', impact: 'no_change', evidenceRefs: ['ev-cache'] },
    ],
    contractChange: { nextRevision: 'K2', behavior: 'Scoped reset', compatibility: 'K1 remains valid' },
    migrationOrder: outcome === 'migration_required' ? ['app-ui'] : [],
    alternative: null, unknowns: [], businessChange: null,
  }
  const decided = registerPublicOwnerChangeDecision(accepted.log, decision, context)
  return { context, request: accepted.request, requestDigest: accepted.requestDigest,
    decision: decided.decision, decisionDigest: decided.decisionDigest, log: decided.log }
}

const compatibleAuthority = authority()
const migrationAuthority = authority('migration_required')
const requestDigest = compatibleAuthority.requestDigest
const decisionDigest = compatibleAuthority.decisionDigest

function tasks({ consumerOwner = 'app', consumerDependsOn = ['K2-impl'], includeCache = true } = {}) {
  return [
    {
      id: 'K2-impl', role: 'work', ownerId: 'public', title: 'Implement K2', dependsOn: [],
      write: ['src/public/k2.mjs'], verify: ['unit'], done: ['K2 verified'],
    },
    {
      id: 'A-consume', role: 'work', ownerId: consumerOwner, title: 'Consume K2', dependsOn: consumerDependsOn,
      write: [`src/${consumerOwner}/consume.mjs`], verify: ['unit'], done: ['A consumes K2'],
    },
    ...(includeCache ? [{
      id: 'B-check', role: 'verify', ownerId: 'cache', title: 'Keep K1 recovery', dependsOn: ['K2-impl'],
      write: [], verify: ['unit'], done: ['B remains compatible'],
    }] : []),
  ]
}

function binding(overrides = {}) {
  return {
    contract: PUBLIC_OWNER_PLAN_BINDING_CONTRACT,
    requestId: 'shared-reset',
    requestVersion: 1,
    requestDigest,
    decisionId: 'shared-reset-decision',
    decisionDigest,
    targetOwnerId: 'public',
    outcome: 'compatible_extension',
    implementationTaskId: 'K2-impl',
    consumers: [
      { consumerId: 'app-ui', ownerId: 'app', impact: 'compatible', taskId: 'A-consume', contract: { id: 'shared-session', revision: 'K2' } },
      { consumerId: 'cache-runtime', ownerId: 'cache', impact: 'no_change', taskId: null, contract: { id: 'shared-session', revision: 'K1' } },
    ],
    migrationOrder: [],
    ...overrides,
  }
}

function plan(rawBinding = binding(), rawTasks = tasks()) {
  return normalizePlanV2({
    contract: 'DSH_PLAN_V2', registryDigest: 'd'.repeat(64), summary: 'Public Owner K2 plan',
    owners: [
      { id: 'public', name: 'Public', description: 'Shared contract', scope: ['src/public/**'], exclude: [] },
      { id: 'app', name: 'App', description: 'App consumer', scope: ['src/app/**'], exclude: [] },
      { id: 'cache', name: 'Cache', description: 'Cache consumer', scope: ['src/cache/**'], exclude: [] },
    ],
    verifications: [{ id: 'unit', run: ['node', '--test'] }],
    tasks: rawTasks,
    publicOwnerChanges: [rawBinding],
  })
}

function state(outcome = 'compatible_extension', overrides = {}) {
  const source = outcome === 'compatible_extension' ? compatibleAuthority : migrationAuthority
  return {
    id: 'wf-public-plan', activePlanRevision: 1, planDigest: activeDigest,
    plan: { contract: 'DSH_PLAN_V2', publicOwnerChanges: undefined },
    publicOwnerChangeLog: source.log,
    publicOwnerDecisionSessions: {
      'shared-reset:1': {
        phase: 'submission_observed', requestId: 'shared-reset', requestVersion: 1,
        requestDigest: source.requestDigest, decisionDigest: source.decisionDigest,
        ownerId: 'public', planRevision: 1, planDigest: activeDigest,
        receipt: { decisionDigest: source.decisionDigest }, decision: source.decision,
      },
    },
    ...overrides,
  }
}

test('T30 normalizes a PlanRevision with an explicit authoritative public decision binding', () => {
  const candidate = plan()
  const accepted = assertPublicOwnerPlanAuthority({
    state: state(), plan: candidate, requiredDecisionDigests: [decisionDigest],
  })
  assert.equal(accepted[0].decisionDigest, decisionDigest)
  const revision = createPlanRevision({ number: 2, parent: 1, plan: candidate })
  assert.deepEqual(revision.publicOwnerChanges, candidate.publicOwnerChanges)
})

test('T30 rejects incomplete consumers, wrong Owner, missing implementation predecessor, and stale authority', () => {
  assert.throws(() => assertPublicOwnerPlanAuthority({
    state: state(), plan: plan(binding({ consumers: binding().consumers.slice(0, 1) })),
    requiredDecisionDigests: [decisionDigest],
  }), /consumer_coverage_invalid/u)
  assert.throws(() => assertPublicOwnerPlanAuthority({
    state: state(), plan: plan(binding(), tasks({ consumerOwner: 'cache' })),
    requiredDecisionDigests: [decisionDigest],
  }), /consumer_owner_invalid/u)
  assert.throws(() => assertPublicOwnerPlanAuthority({
    state: state(), plan: plan(binding(), tasks({ consumerDependsOn: [] })),
    requiredDecisionDigests: [decisionDigest],
  }), /consumer_predecessor_missing/u)
  assert.throws(() => assertPublicOwnerPlanAuthority({
    state: state('compatible_extension', { activePlanRevision: 2 }), plan: plan(),
    requiredDecisionDigests: [decisionDigest],
  }), /authority_stale/u)
})

test('T30 migration order is an executable dependency chain rooted at the public implementation', () => {
  const migration = binding({
    outcome: 'migration_required',
    decisionDigest: migrationAuthority.decisionDigest,
    consumers: [
      { consumerId: 'app-ui', ownerId: 'app', impact: 'update_required', taskId: 'A-consume', contract: { id: 'shared-session', revision: 'K2' } },
      { consumerId: 'cache-runtime', ownerId: 'cache', impact: 'no_change', taskId: null, contract: { id: 'shared-session', revision: 'K1' } },
    ],
    migrationOrder: ['app-ui'],
  })
  assert.doesNotThrow(() => assertPublicOwnerPlanAuthority({
    state: state('migration_required'), plan: plan(migration), requiredDecisionDigests: [migrationAuthority.decisionDigest],
  }))
  assert.throws(() => assertPublicOwnerPlanAuthority({
    state: state('migration_required'), plan: plan({ ...migration, migrationOrder: [] }),
    requiredDecisionDigests: [migrationAuthority.decisionDigest],
  }), /migration_order_invalid/u)
})

test('T30 carried historical bindings remain immutable without treating their original baseline as current', () => {
  const candidate = plan()
  const current = state('compatible_extension', {
    activePlanRevision: 2,
    planDigest: 'f'.repeat(64),
    plan: candidate,
  })
  assert.doesNotThrow(() => assertPublicOwnerPlanAuthority({ state: current, plan: candidate }))
  const removed = normalizePlanV2({ ...candidate, publicOwnerChanges: undefined })
  assert.throws(() => assertPublicOwnerPlanAuthority({ state: current, plan: removed }), /historical_binding_missing/u)
  const changed = plan(binding({ implementationTaskId: 'A-consume' }))
  assert.throws(() => assertPublicOwnerPlanAuthority({ state: current, plan: changed }), /authority_stale|implementation_owner_invalid/u)
})

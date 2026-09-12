import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { publicOwnerDecisionSubmitDefinition } from '../index.js'
import { normalizePlanV2 } from '../src/model.mjs'
import {
  PUBLIC_OWNER_CHANGE_DECISION_CONTRACT,
  PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT,
  publicOwnerContextDigest,
} from '../src/public-owner-change.mjs'
import { PUBLIC_OWNER_PLAN_BINDING_CONTRACT } from '../src/public-owner-plan.mjs'
import { PUBLIC_OWNER_DECISION_SESSION_REQUEST_CONTRACT } from '../src/public-owner-session.mjs'
import { supervisorNext } from '../src/supervisor.mjs'
import { deriveWorkflowControl } from '../src/workflow-state.mjs'
import {
  createRecoverySessionFixture,
  mutateRecoverySessionState,
  readRecoverySessionState,
  reopenRecoverySessionFixture,
} from './fixtures/recovery-session-fixture.mjs'

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function requestFor(f) {
  const context = {
    workflowId: f.workflowId, planRevision: 1, planDigest: f.planDigest,
    owners: ['session', 'interface', 'cache'],
    tickets: [{ id: 'T-30', revision: 'R4' }],
    acceptanceCriteria: ['AC-05', 'AC-29'],
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
  }
  const request = {
    contract: PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT,
    requestId: 't30-shared-reset', requestVersion: 1,
    requesterOwnerId: 'interface', targetOwnerId: 'session',
    source: { tickets: [{ id: 'T-30', revision: 'R4' }], acceptanceCriteria: ['AC-05', 'AC-29'] },
    baseline: {
      workflowId: f.workflowId, planRevision: 1, planDigest: f.planDigest,
      contract: { id: 'shared-session', revision: 'K1' }, contextDigest: publicOwnerContextDigest(context),
    },
    expectedBehavior: 'Interface reset preserves cache recovery.',
    actualGap: 'K1 only exposes a global reset.', evidenceRefs: ['ev-gap'],
    suggestion: 'Add K2 scoped reset.', supersedesRequestDigest: null,
  }
  return {
    contract: PUBLIC_OWNER_DECISION_SESSION_REQUEST_CONTRACT,
    request, context,
    prompt: { id: 't30-public-owner-prompt', content: 'Judge the fixed K1 to K2 request.' },
  }
}

function decisionFor(raw) {
  const requestDigest = createHash('sha256').update(canonical(raw.request)).digest('hex')
  return {
    contract: PUBLIC_OWNER_CHANGE_DECISION_CONTRACT,
    decisionId: 't30-shared-reset-decision', requestId: raw.request.requestId,
    requestVersion: 1, requestDigest, targetOwnerId: 'session',
    baseline: structuredClone(raw.request.baseline), outcome: 'compatible_extension',
    summary: 'K2 can add a scoped reset while K1 recovery remains valid.', basisRefs: ['ev-session'],
    affectedConsumers: [
      { consumerId: 'interface-ui', ownerId: 'interface', impact: 'compatible', evidenceRefs: ['ev-interface'] },
      { consumerId: 'cache-recovery', ownerId: 'cache', impact: 'no_change', evidenceRefs: ['ev-cache'] },
    ],
    contractChange: { nextRevision: 'K2', behavior: 'Scoped reset.', compatibility: 'K1 remains valid.' },
    migrationOrder: [], alternative: null, unknowns: [], businessChange: null,
  }
}

function revisedPlan(state, record) {
  const binding = {
    contract: PUBLIC_OWNER_PLAN_BINDING_CONTRACT,
    requestId: record.requestId, requestVersion: record.requestVersion,
    requestDigest: record.requestDigest, decisionId: record.decision.decisionId,
    decisionDigest: record.decisionDigest, targetOwnerId: record.ownerId,
    outcome: record.decision.outcome, implementationTaskId: 'K2-implement',
    consumers: [
      { consumerId: 'interface-ui', ownerId: 'interface', impact: 'compatible', taskId: 'A-consume-K2', contract: { id: 'shared-session', revision: 'K2' } },
      { consumerId: 'cache-recovery', ownerId: 'cache', impact: 'no_change', taskId: null, contract: { id: 'shared-session', revision: 'K1' } },
    ],
    migrationOrder: [],
  }
  return normalizePlanV2({
    ...state.plan,
    summary: 'Implement authoritative K2 and then update A while B remains on compatible K1.',
    publicOwnerChanges: [binding],
    tasks: [
      ...state.plan.tasks,
      {
        id: 'K2-implement', role: 'work', ownerId: 'session', title: 'Implement K2', dependsOn: [],
        write: ['src/session/k2.mjs'], verify: ['unit'], done: ['K2 fixed commit and verification integrated'],
      },
      {
        id: 'A-consume-K2', role: 'work', ownerId: 'interface', title: 'Consume K2', dependsOn: ['K2-implement'],
        write: ['src/interface/k2.mjs'], verify: ['unit'], done: ['A consumes K2 after integration'],
      },
    ],
  })
}

test('T30 authoritative K1 decision activates one K2 writer and unlocks its consumer only after integration', { timeout: 30_000 }, async t => {
  let payload
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    modelScript: m => [
      () => m.toolCallResponse('t30-public-decision', 'workflow_public_owner_decision_submit', { decision: payload }),
      'hang-slow',
    ],
  })
  f.ctx.tools.register(publicOwnerDecisionSubmitDefinition(f.runtime))
  const raw = requestFor(f)
  payload = decisionFor(raw)
  const observed = await f.runtime.reconcilePublicOwnerDecisionSession(f.admissionAgent, f.workflowId, raw)
  assert.equal(observed.outcome, 'submission_observed', JSON.stringify(observed))

  let candidateDigest
  await mutateRecoverySessionState(f, state => {
    const record = state.publicOwnerDecisionSessions['t30-shared-reset:1']
    const plan = revisedPlan(state, record)
    candidateDigest = digest(plan)
    state.conversationRootSessionId = f.admissionAgent.id
    state.tasks = state.tasks.map(task => task.taskId === 'T1'
      ? { ...task, status: 'completed', checkState: 'valid' }
      : task)
    state.ownerRuns = {}
    delete state.recoveryAdmission
    delete state.recoveryAdmissionConfig
    state.pendingPlanRevision = {
      number: 2, parent: 1, plan, planDigest: candidateDigest,
      intentIds: [observed.planIntentId], coordinatorSessionId: f.admissionAgent.id,
      createdAt: '2026-09-12T00:00:00.000Z', approvalPolicy: 'autonomous',
      origin: 'public-owner-decision',
      review: {
        contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: 'Binding and lifecycle pass.',
        issues: [], targetTaskIds: [], decisionQuestions: [], discoveryQuestions: [], obligationClosures: [],
        planDigest: candidateDigest,
      },
    }
  })

  const staged = await readRecoverySessionState(f)
  assert.equal(deriveWorkflowControl(staged).command, 'plan-revision-approve')
  const approved = await f.runtime.approvePendingPlanRevision(
    f.admissionAgent, candidateDigest, undefined, { source: 'runner-daemon' },
  )
  assert.equal(approved.revision, 2)
  let state = await readRecoverySessionState(f)
  assert.equal(state.planRevisions.length, 1)
  assert.equal(state.planRevisions[0].publicOwnerChanges[0].decisionDigest, observed.decisionDigest)
  const beforeIntegration = supervisorNext(state)
  assert.ok(beforeIntegration.tasks.some(task => task.taskId === 'K2-implement'))
  assert.ok(!beforeIntegration.tasks.some(task => task.taskId === 'A-consume-K2'))

  await mutateRecoverySessionState(f, current => {
    const implementation = current.tasks.find(task => task.taskId === 'K2-implement')
    Object.assign(implementation, {
      status: 'completed', checkState: 'valid', commitSha: '1'.repeat(40),
      verificationResults: { unit: { passed: true, exitCode: 0, planDigest: current.planDigest } },
    })
  })
  state = await readRecoverySessionState(f)
  const afterIntegration = supervisorNext(state)
  assert.ok(afterIntegration.tasks.some(task => task.taskId === 'A-consume-K2'))

  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try {
    fresh.ctx.tools.register(publicOwnerDecisionSubmitDefinition(fresh.runtime))
    const replay = await fresh.runtime.reconcilePublicOwnerDecisionSession(fresh.admissionAgent, f.workflowId, raw)
    assert.equal(replay.outcome, 'submission_observed')
    assert.equal(replay.replayed, true)
    const replayed = await readRecoverySessionState(f)
    assert.equal(replayed.planRevisions.length, 1)
    assert.equal(replayed.intents.filter(item => item.sourceKind === 'public-owner-decision').length, 1)
    assert.equal(replayed.publicOwnerDecisionSessions['t30-shared-reset:1'].phase, 'submission_observed')
  } finally { await fresh.dispose() }
})

test('T30 activation rejects a consumer plan that omits the authoritative decision binding', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, { executable: true, includePublicOwnerScenario: true })
  const raw = requestFor(f)
  const decision = decisionFor(raw)
  const decisionDigest = createHash('sha256').update(canonical(decision)).digest('hex')
  await mutateRecoverySessionState(f, state => {
    state.conversationRootSessionId = f.admissionAgent.id
    state.intents = [{
      contract: 'DSH_WORKFLOW_INTENT_V1', id: `intent-public-owner-${decisionDigest.slice(0, 24)}`,
      workflowId: f.workflowId, sourceSessionId: f.admissionAgent.id,
      sourceAnchor: { parentSessionId: null, seedLength: null }, content: 'Implement K2', status: 'pending',
      createdAt: '2026-09-12T00:00:00.000Z', sourceKind: 'public-owner-decision', sourceDigest: decisionDigest,
      publicOwnerDecisionKey: 't30-shared-reset:1',
    }]
    state.publicOwnerChangeLog = {
      contract: 'DSH_PUBLIC_OWNER_CHANGE_LOG_V1',
      requests: [{ requestDigest: decision.requestDigest, context: raw.context, request: raw.request }],
      decisions: [{ decisionDigest, decision }],
    }
    state.publicOwnerDecisionSessions = {
      't30-shared-reset:1': {
        phase: 'submission_observed', requestId: raw.request.requestId, requestVersion: 1,
        requestDigest: decision.requestDigest, decisionDigest, ownerId: 'session',
        planRevision: 1, planDigest: state.planDigest, decision, receipt: { decisionDigest }, context: raw.context,
      },
    }
    const plan = normalizePlanV2({
      ...state.plan,
      tasks: [...state.plan.tasks, {
        id: 'A-unbound', role: 'work', ownerId: 'interface', title: 'Unbound consumer', dependsOn: [],
        write: ['src/interface/unbound.mjs'], verify: ['unit'], done: ['Incorrectly consumes K2'],
      }],
    })
    const planDigest = digest(plan)
    state.pendingPlanRevision = {
      number: 2, parent: 1, plan, planDigest,
      intentIds: [state.intents[0].id], coordinatorSessionId: f.admissionAgent.id,
      approvalPolicy: 'autonomous', origin: 'public-owner-decision',
      review: { status: 'passed', issues: [], targetTaskIds: [] },
    }
    delete state.recoveryAdmission
    delete state.recoveryAdmissionConfig
  })
  const state = await readRecoverySessionState(f)
  await assert.rejects(
    f.runtime.approvePendingPlanRevision(f.admissionAgent, state.pendingPlanRevision.planDigest),
    /required_decision_missing/u,
  )
  assert.equal((await readRecoverySessionState(f)).activePlanRevision ?? 1, 1)
})

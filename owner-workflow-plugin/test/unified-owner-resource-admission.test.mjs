import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { normalizePlanV2 } from '../src/model.mjs'
import { PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT, publicOwnerContextDigest } from '../src/public-owner-change.mjs'
import { PUBLIC_OWNER_DECISION_SESSION_REQUEST_CONTRACT } from '../src/public-owner-session.mjs'
import { createTaskState } from '../src/supervisor.mjs'
import {
  createRecoverySessionFixture,
  mutateRecoverySessionState,
  readRecoverySessionState,
} from './fixtures/recovery-session-fixture.mjs'

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function replacePlan(f, tasks, parallel = 2) {
  let nextDigest
  await mutateRecoverySessionState(f, state => {
    const plan = normalizePlanV2({ ...state.plan, tasks })
    nextDigest = digest(plan)
    state.plan = plan
    state.planDigest = nextDigest
    state.planReview = { ...state.planReview, planDigest: nextDigest }
    state.planReviewDigest = nextDigest
    state.tasks = createTaskState(plan)
    state.ownerRuns = {}
    state.config = { ...(state.config ?? {}), parallel }
    delete state.recoveryAdmission
    delete state.recoveryAdmissionConfig
  })
  f.planDigest = nextDigest
}

function publicRequest(f) {
  const context = {
    workflowId: f.workflowId,
    planRevision: 1,
    planDigest: f.planDigest,
    owners: ['session', 'interface', 'cache'],
    tickets: [{ id: 'T-06', revision: 'R4' }],
    acceptanceCriteria: ['AC-05', 'AC-29'],
    contracts: [
      { id: 'shared-session', revision: 'K1', ownerId: 'session' },
      { id: 'interface-contract', revision: 'A1', ownerId: 'interface' },
      { id: 'cache-contract', revision: 'B1', ownerId: 'cache' },
    ],
    evidenceRefs: ['ev-gap', 'ev-interface', 'ev-cache'],
    consumerInventoryComplete: true,
    consumers: [
      { consumerId: 'interface-ui', ownerId: 'interface', contract: { id: 'interface-contract', revision: 'A1' }, evidenceRefs: ['ev-interface'] },
      { consumerId: 'cache-recovery', ownerId: 'cache', contract: { id: 'cache-contract', revision: 'B1' }, evidenceRefs: ['ev-cache'] },
    ],
  }
  return {
    contract: PUBLIC_OWNER_DECISION_SESSION_REQUEST_CONTRACT,
    request: {
      contract: PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT,
      requestId: 't29-public-owner-busy',
      requestVersion: 1,
      requesterOwnerId: 'interface',
      targetOwnerId: 'session',
      source: { tickets: [{ id: 'T-06', revision: 'R4' }], acceptanceCriteria: ['AC-05', 'AC-29'] },
      baseline: {
        workflowId: f.workflowId,
        planRevision: 1,
        planDigest: f.planDigest,
        contract: { id: 'shared-session', revision: 'K1' },
        contextDigest: publicOwnerContextDigest(context),
      },
      expectedBehavior: 'Interface disconnect preserves recovery.',
      actualGap: 'The existing reset would clear the recovery cache.',
      evidenceRefs: ['ev-gap'],
      suggestion: 'Add a scoped reset.',
      supersedesRequestDigest: null,
    },
    context,
    prompt: { id: 't29-public-owner-prompt', content: 'Judge the fixed scoped reset request.' },
  }
}

test('T29 direct Owner start cannot bypass an active public Owner consultation', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    modelScript: () => ['hang-slow'],
  })
  const state = await readRecoverySessionState(f)
  await replacePlan(f, [
    ...state.plan.tasks,
    {
      id: 'T-session', role: 'work', ownerId: 'session', title: 'Implement session contract',
      dependsOn: [], write: ['src/session/contract.mjs'], verify: ['unit'],
      done: ['The session contract is verified'], resources: ['build-cache:session'],
    },
  ], 2)
  const entered = Promise.withResolvers()
  const stream = f.adapter.stream.bind(f.adapter)
  f.adapter.stream = async function* (options) {
    entered.resolve()
    yield* stream(options)
  }
  const controller = new AbortController()
  const consultation = f.runtime.reconcilePublicOwnerDecisionSession(
    f.admissionAgent,
    f.workflowId,
    publicRequest(f),
    controller.signal,
  )
  await entered.promise
  await assert.rejects(
    f.runtime.runExternalOwner(f.admissionAgent, f.workflowId, 'T-session', 'session'),
    /公共判断reservation占用/u,
  )
  const during = await readRecoverySessionState(f)
  assert.equal(during.tasks.find(item => item.taskId === 'T-session').status, 'pending')
  assert.equal(during.ownerRuns['T-session:session'], undefined)
  controller.abort(new Error('finish T29 consultation fixture'))
  assert.equal((await consultation).phase, 'settled_cancelled')
})

test('T29 concurrent direct Owner starts cannot claim the same execution resource', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includeIndependentOwner: true,
  })
  await replacePlan(f, [
    {
      id: 'T-api-resource', role: 'work', ownerId: 'api', title: 'Use test database from API',
      dependsOn: [], write: ['src/api/resource.mjs'], verify: ['unit'],
      done: ['API resource use is verified'], resources: ['db:test'],
    },
    {
      id: 'T-worker-resource', role: 'work', ownerId: 'worker', title: 'Use test database from worker',
      dependsOn: [], write: ['src/worker/resource.mjs'], verify: ['unit'],
      done: ['Worker resource use is verified'], resources: ['db:test'],
    },
  ], 2)
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  f.runtime.runChild = async () => {
    entered.resolve()
    await release.promise
    throw new Error('finish T29 resource fixture')
  }
  const first = f.runtime.runExternalOwner(f.admissionAgent, f.workflowId, 'T-api-resource', 'api')
  await entered.promise
  await assert.rejects(
    f.runtime.runExternalOwner(f.admissionAgent, f.workflowId, 'T-worker-resource', 'worker'),
    /执行资源已被占用：db:test/u,
  )
  const during = await readRecoverySessionState(f)
  assert.equal(during.tasks.find(item => item.taskId === 'T-api-resource').status, 'running')
  assert.equal(during.tasks.find(item => item.taskId === 'T-worker-resource').status, 'pending')
  assert.equal(during.ownerRuns['T-worker-resource:worker'], undefined)
  release.resolve()
  await assert.rejects(first, /finish T29 resource fixture/u)
})

test('T29 direct Owner starts share the configured capacity gate', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includeIndependentOwner: true,
  })
  await replacePlan(f, [
    {
      id: 'T-api-slot', role: 'work', ownerId: 'api', title: 'Use the only execution slot',
      dependsOn: [], write: ['src/api/slot.mjs'], verify: ['unit'],
      done: ['API slot use is verified'], resources: ['db:api'],
    },
    {
      id: 'T-worker-slot', role: 'work', ownerId: 'worker', title: 'Wait for an execution slot',
      dependsOn: [], write: ['src/worker/slot.mjs'], verify: ['unit'],
      done: ['Worker slot use is verified'], resources: ['db:worker'],
    },
  ], 1)
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  f.runtime.runChild = async () => {
    entered.resolve()
    await release.promise
    throw new Error('finish T29 capacity fixture')
  }
  const first = f.runtime.runExternalOwner(f.admissionAgent, f.workflowId, 'T-api-slot', 'api')
  await entered.promise
  await assert.rejects(
    f.runtime.runExternalOwner(f.admissionAgent, f.workflowId, 'T-worker-slot', 'worker'),
    /没有可用执行槽位/u,
  )
  const during = await readRecoverySessionState(f)
  assert.equal(during.tasks.find(item => item.taskId === 'T-worker-slot').status, 'pending')
  assert.equal(during.ownerRuns['T-worker-slot:worker'], undefined)
  release.resolve()
  await assert.rejects(first, /finish T29 capacity fixture/u)
})

test('T29 persisted Supervisor reservations participate in direct admission', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includeIndependentOwner: true,
  })
  await replacePlan(f, [
    {
      id: 'T-api-reserved', role: 'work', ownerId: 'api', title: 'Reserved API database work',
      dependsOn: [], write: ['src/api/reserved.mjs'], verify: ['unit'],
      done: ['Reserved API work is verified'], resources: ['db:test'],
    },
    {
      id: 'T-worker-direct', role: 'work', ownerId: 'worker', title: 'Direct worker database work',
      dependsOn: [], write: ['src/worker/direct.mjs'], verify: ['unit'],
      done: ['Direct worker work is verified'], resources: ['db:test'],
    },
  ], 2)
  await mutateRecoverySessionState(f, state => {
    state.supervisorOutbox = {
      'T-api-reserved:api': {
        contract: 'DSH_SUPERVISOR_OWNER_RESERVATION_V1',
        reservationId: 'sr-t29-persisted',
        actionId: 'sa-t29-persisted',
        taskId: 'T-api-reserved',
        ownerId: 'api',
        status: 'reserved',
        attempts: 0,
        createdAt: new Date().toISOString(),
      },
    }
  })
  await assert.rejects(
    f.runtime.runExternalOwner(f.admissionAgent, f.workflowId, 'T-worker-direct', 'worker'),
    /执行资源已被占用：db:test/u,
  )
  const after = await readRecoverySessionState(f)
  assert.equal(after.tasks.find(item => item.taskId === 'T-worker-direct').status, 'pending')
  assert.equal(after.ownerRuns['T-worker-direct:worker'], undefined)
  assert.equal(after.supervisorOutbox['T-api-reserved:api'].status, 'reserved')
})

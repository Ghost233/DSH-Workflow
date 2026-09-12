import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createRecoverySessionFixture,
  mutateRecoverySessionState,
  readRecoverySessionState,
} from './fixtures/recovery-session-fixture.mjs'
import { createRecoveryRuntimePolicy } from '../src/recovery-policy.mjs'

async function waitFor(read, label, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await read()
    if (value !== undefined && value !== false) return value
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(`${label} was not observed within ${timeoutMs}ms`)
}

async function controlledFixture(t, options = {}) {
  const fixture = await createRecoverySessionFixture(t, {
    executable: true,
    modelScript: () => ['hang-slow', 'hang-slow'],
    runtimeConfig: { ownerAttemptDeadlineMs: 60_000, ownerTerminationObservationMs: 200 },
    ...options,
  })
  await mutateRecoverySessionState(fixture, state => {
    state.ownerRuns = {}
    delete state.recoveryAdmissionConfig
    delete state.recoveryAdmission
    const task = state.tasks.find(item => item.taskId === 'T1')
    task.status = 'pending'
    task.reason = null
    task.action = null
  })
  return fixture
}

async function expireCurrentAttempt(fixture) {
  return mutateRecoverySessionState(fixture, state => {
    const record = state.ownerRuns['T1:api']
    const current = Date.now()
    record.attemptControl.fixedDeadlineAt = new Date(current - 1_000).toISOString()
    record.attemptControl.lastObservedAt = new Date(current - 2_000).toISOString()
    record.attemptControl.remainingCeilingMs = 1
  })
}

function completedWorkerModel({ toolCallResponse, textResponse }) {
  return [
    toolCallResponse('t17-worker-completed', 'owner_submit', { report: {
      contract: 'DSH_OWNER_RESULT_V1', status: 'completed', summary: 'Independent worker completed.',
      changes: [], tests: [], handoffs: [], memory_updates: [],
    } }),
    textResponse('reported'),
    textResponse(JSON.stringify({ contract: 'DSH_OWNER_MEMORY_CURATOR_V1', summary: 'No pages.', pages: [] })),
    textResponse(JSON.stringify({ contract: 'DSH_OWNER_MEMORY_REVIEW_V1', status: 'passed', summary: 'Valid.', issues: [] })),
  ]
}

function createAbortBarrier() {
  const aborted = Promise.withResolvers()
  const released = Promise.withResolvers()
  let releasedOnce = false
  return {
    aborted: aborted.promise,
    release() {
      if (releasedOnce) return
      releasedOnce = true
      released.resolve()
    },
    async wait(signal) {
      if (signal === undefined) throw new Error('barrier requires the real Harness cancellation signal')
      if (signal.aborted) aborted.resolve()
      else signal.addEventListener('abort', () => aborted.resolve(), { once: true })
      await released.promise
      throw new Error('aborted')
    },
  }
}

test('T19 frozen Workflow policy uses the approved task timeout despite later Runtime settings', async t => {
  const fixture = await createRecoverySessionFixture(t, {
    executable: true,
    modelScript: () => ['hang-slow'],
    runtimeConfig: { ownerAttemptDeadlineMs: 1_000, ownerTerminationObservationMs: 200 },
  })
  await mutateRecoverySessionState(fixture, state => {
    state.recoveryRuntimePolicy = createRecoveryRuntimePolicy()
    state.recoveryRuntimeRequired = state.recoveryRuntimePolicy.contract
    state.recoveryProtocol = state.recoveryRuntimePolicy.recoveryProtocol
    state.recoveryAdmissionConfig.totalLimit = state.recoveryRuntimePolicy.totalLimit
    state.recoveryAdmissionConfig.problemLimit = state.recoveryRuntimePolicy.problemLimit
    state.ownerRuns = {}
    const task = state.tasks.find(item => item.taskId === 'T1')
    task.status = 'pending'
    task.reason = null
    task.action = null
  })
  const execution = fixture.runtime.runExternalOwner(
    fixture.admissionAgent, fixture.workflowId, 'T1', 'api',
  )
  const active = await waitFor(() => {
    const [sessionId] = fixture.runtime.activeOwners.entries().next().value ?? []
    const child = sessionId === undefined ? undefined : fixture.ctx.agents.get(sessionId)
    return fixture.adapter.requests.length === 1 && child !== undefined ? { sessionId, child } : undefined
  }, 'policy-bound Owner request')
  const state = await readRecoverySessionState(fixture)
  const task = state.plan.tasks.find(item => item.id === 'T1')
  const control = state.ownerRuns['T1:api'].attemptControl
  assert.equal(Date.parse(control.fixedDeadlineAt) - Date.parse(control.lastObservedAt), task.onTimeout.afterMs)
  assert.equal(control.observationWindowMs, 30_000)
  active.child.cancel('T19 test cleanup')
  await assert.rejects(execution)
})

test('T19 missing or unknown required policy state refuses Owner startup without model calls', async t => {
  const fixture = await createRecoverySessionFixture(t, {
    executable: true,
    modelScript: () => ['hang-slow'],
  })
  for (const fault of ['missing_config', 'unknown_policy']) {
    await mutateRecoverySessionState(fixture, state => {
      state.recoveryRuntimePolicy = createRecoveryRuntimePolicy()
      state.recoveryRuntimeRequired = state.recoveryRuntimePolicy.contract
      state.recoveryProtocol = state.recoveryRuntimePolicy.recoveryProtocol
      state.recoveryAdmissionConfig = {
        contract: 'DSH_RECOVERY_ADMISSION_CONFIG_V1', executionVersion: state.planDigest,
        totalLimit: state.recoveryRuntimePolicy.totalLimit,
        problemLimit: state.recoveryRuntimePolicy.problemLimit,
      }
      state.ownerRuns = {}
      const task = state.tasks.find(item => item.taskId === 'T1')
      task.status = 'pending'
      task.reason = null
      task.action = null
      if (fault === 'missing_config') delete state.recoveryAdmissionConfig
      else state.recoveryRuntimePolicy.version = 2
    })
    await assert.rejects(
      fixture.runtime.runExternalOwner(fixture.admissionAgent, fixture.workflowId, 'T1', 'api'),
      /recovery_|恢复策略/u,
    )
    const state = await readRecoverySessionState(fixture)
    assert.deepEqual(state.ownerRuns, {})
    assert.equal(fixture.adapter.requests.length, 0)
  }
})

test('T17 real hard deadline persists stopping before cancellation and settles only after JSONL terminal', async t => {
  const fixture = await controlledFixture(t)
  const execution = fixture.runtime.runExternalOwner(fixture.admissionAgent, fixture.workflowId, 'T1', 'api')
  const active = await waitFor(() => {
    const [sessionId, owner] = fixture.runtime.activeOwners.entries().next().value ?? []
    const child = sessionId === undefined ? undefined : fixture.ctx.agents.get(sessionId)
    return fixture.adapter.requests.length === 1 && child !== undefined ? { sessionId, owner, child } : undefined
  }, 'live Owner request')
  const expired = await expireCurrentAttempt(fixture)
  const cursor = expired.supervisorEventCursor ?? 0
  const deadlineEvent = await fixture.runtime.awaitSupervisorEvent(
    fixture.admissionAgent, fixture.workflowId, cursor, 1,
  )
  assert.equal(deadlineEvent.event.type, 'supervisor.owner-hard-deadline')
  const stopping = await readRecoverySessionState(fixture)
  assert.equal(stopping.ownerRuns['T1:api'].status, 'stopping')
  assert.equal(stopping.ownerRuns['T1:api'].attemptControl.phase, 'stopping')
  assert.equal(stopping.ownerRuns['T1:api'].attemptControl.sessionId, active.sessionId)

  await assert.rejects(execution)
  const settled = await waitFor(async () => {
    const state = await readRecoverySessionState(fixture)
    return state.ownerRuns['T1:api']?.attemptControl?.phase === 'settled' ? state : undefined
  }, 'deadline settlement')
  const record = settled.ownerRuns['T1:api']
  assert.equal(record.status, 'failed')
  assert.equal(record.attemptControl.terminalReason, 'aborted')
  assert.ok(Number.isSafeInteger(record.attemptControl.terminalRevision))
  const persisted = await fixture.readFrom(active.sessionId)
  assert.equal(persisted.events.filter(event => event.type === 'turn/end').length, 1)
  await assert.rejects(fixture.runtime.assertOwnerLease(active.owner.lease), /不再由当前运行时持有/u)
})

test('T17 a deadline-ended recovery attempt settles the existing T13 debit once', async t => {
  const fixture = await createRecoverySessionFixture(t, {
    executable: true,
    limits: { totalLimit: 2, problemLimit: 2 },
    modelScript: () => ['hang-slow'],
    // The full CA01 suite can keep the host event loop busy while the real
    // one-shot child persists its terminal frame. Keep this far below the
    // production 30s bound, but do not turn scheduler latency into an
    // artificial termination-unknown result.
    runtimeConfig: { ownerAttemptDeadlineMs: 60_000, ownerTerminationObservationMs: 1_000 },
  })
  const recovery = fixture.runtime.recoverOwner(fixture.admissionAgent, fixture.workflowId, 'T1', 'api')
  await waitFor(() => fixture.adapter.requests.length === 1, 'recovery Owner request')
  const expired = await expireCurrentAttempt(fixture)
  await fixture.runtime.awaitSupervisorEvent(
    fixture.admissionAgent, fixture.workflowId, expired.supervisorEventCursor ?? 0, 1,
  )
  await assert.rejects(recovery)
  const settled = await readRecoverySessionState(fixture)
  assert.equal(settled.ownerRuns['T1:api'].attemptControl.phase, 'settled')
  assert.equal(settled.ownerRuns['T1:api'].recoverySession.phase, 'settled_failed')
  assert.equal(settled.recoveryAdmission.budget.totalUsed, 1)
  assert.equal(settled.recoveryAdmission.budget.attempts.length, 1)
  assert.equal(settled.recoveryAdmission.budget.attempts[0].state, 'settled')
})

test('T17 an independent Owner starts while the expired Owner is still stopping', async t => {
  const barrier = createAbortBarrier()
  t.after(() => barrier.release())
  const fixture = await createRecoverySessionFixture(t, {
    executable: true,
    includeIndependentOwner: true,
    modelScript: completedWorkerModel,
    runtimeConfig: { ownerAttemptDeadlineMs: 60_000, ownerTerminationObservationMs: 500 },
  })
  const originalStream = fixture.adapter.stream.bind(fixture.adapter)
  let streamCount = 0
  fixture.adapter.stream = async function* (options) {
    streamCount += 1
    if (streamCount !== 1) {
      yield* originalStream(options)
      return
    }
    fixture.adapter.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'controlled partial API output' }
    await barrier.wait(options.signal)
  }
  await mutateRecoverySessionState(fixture, state => {
    state.ownerRuns = {}
    delete state.recoveryAdmissionConfig
    delete state.recoveryAdmission
    for (const task of state.tasks) {
      task.status = 'pending'
      task.reason = null
      task.action = null
    }
  })
  const apiExecution = fixture.runtime.runExternalOwner(fixture.admissionAgent, fixture.workflowId, 'T1', 'api')
  const apiOutcome = apiExecution.then(value => ({ value }), error => ({ error }))
  const api = await waitFor(() => {
    const [sessionId, owner] = fixture.runtime.activeOwners.entries().next().value ?? []
    const child = sessionId === undefined ? undefined : fixture.ctx.agents.get(sessionId)
    return fixture.adapter.requests.length === 1 && child !== undefined ? { sessionId, owner, child } : undefined
  }, 'API Owner request')
  const expired = await expireCurrentAttempt(fixture)
  await fixture.runtime.awaitSupervisorEvent(
    fixture.admissionAgent, fixture.workflowId, expired.supervisorEventCursor ?? 0, 1,
  )
  await waitFor(async () => Promise.race([
    barrier.aborted.then(() => true),
    new Promise(resolve => setTimeout(() => resolve(false), 5)),
  ]), 'API cancellation signal')
  const workerExecution = fixture.runtime.runExternalOwner(fixture.admissionAgent, fixture.workflowId, 'T2', 'worker')
  await waitFor(() => fixture.adapter.requests.length === 2, 'independent Worker request')
  assert.equal(api.child.session.events.some(event => event.type === 'turn/end'), false)
  const worker = await workerExecution
  assert.equal(worker.ownerId, 'worker')
  assert.equal(api.child.session.events.some(event => event.type === 'turn/end'), false)
  barrier.release()
  const apiSettled = await apiOutcome
  assert.ok(apiSettled.error instanceof Error)
  const settled = await readRecoverySessionState(fixture)
  assert.equal(settled.ownerRuns['T1:api'].attemptControl.phase, 'settled')
  assert.equal(settled.ownerRuns['T2:worker'].status, 'completed')
})

test('T17 cancellation adapter failure pauses, while later persistent terminal proof safely settles it', async t => {
  const fixture = await controlledFixture(t)
  const execution = fixture.runtime.runExternalOwner(fixture.admissionAgent, fixture.workflowId, 'T1', 'api')
  const active = await waitFor(() => {
    const [sessionId, owner] = fixture.runtime.activeOwners.entries().next().value ?? []
    const child = sessionId === undefined ? undefined : fixture.ctx.agents.get(sessionId)
    return fixture.adapter.requests.length === 1 && child !== undefined ? { sessionId, owner, child } : undefined
  }, 'live Owner request')
  const cancel = active.child.cancel.bind(active.child)
  active.child.cancel = () => { throw new Error('cancel adapter exploded') }
  const expired = await expireCurrentAttempt(fixture)
  await fixture.runtime.awaitSupervisorEvent(fixture.admissionAgent, fixture.workflowId, expired.supervisorEventCursor ?? 0, 1)
  const paused = await waitFor(async () => {
    const state = await readRecoverySessionState(fixture)
    return state.ownerRuns['T1:api']?.attemptControl?.technicalPauseReason === 'technical_pause_cancel_unconfirmed'
      ? state
      : undefined
  }, 'cancellation failure pause')
  assert.equal(paused.ownerRuns['T1:api'].status, 'stopping')
  active.child.cancel = cancel
  cancel({ kind: 'user' })
  await assert.rejects(execution)
  const settled = await readRecoverySessionState(fixture)
  assert.equal(settled.ownerRuns['T1:api'].attemptControl.phase, 'settled')
  assert.equal(settled.ownerRuns['T1:api'].attemptControl.terminalReason, 'aborted')
})

test('T17 missing terminal reaches a bounded termination-unknown pause', async t => {
  const fixture = await controlledFixture(t)
  await mutateRecoverySessionState(fixture, state => {
    const now = Date.now()
    state.ownerRuns['T1:api'] = {
      status: 'stopping', phase: 'stopping', ownerId: 'api', taskId: 'T1', stageId: 'T1', attempt: 4,
      settlementGeneration: 9, sessionId: 'partial-session', leaseToken: 'dead-lease', planDigest: state.planDigest,
      startedAt: new Date(now - 3_000).toISOString(),
      attemptControl: {
        contract: 'DSH_OWNER_ATTEMPT_CONTROL_V1', executionVersion: state.planDigest,
        attempt: 4, leaseToken: 'dead-lease', generation: 9, sessionId: 'partial-session', phase: 'stopping',
        fixedDeadlineAt: new Date(now - 2_000).toISOString(), remainingCeilingMs: 0,
        lastObservedAt: new Date(now - 2_000).toISOString(), observationWindowMs: 20,
        cause: 'hard_deadline', cancelRequestId: 'cancel-partial', cancelState: 'requested',
        requestedAt: new Date(now - 1_000).toISOString(), observationDeadlineAt: new Date(now - 500).toISOString(),
      },
    }
    const task = state.tasks.find(item => item.taskId === 'T1')
    task.status = 'running'
    task.executorId = 'partial-session'
  })
  const before = await readRecoverySessionState(fixture)
  const receipt = await fixture.runtime.awaitSupervisorEvent(
    fixture.admissionAgent, fixture.workflowId, before.supervisorEventCursor ?? 0, 1,
  )
  assert.equal(receipt.event.type, 'supervisor.owner-termination-unknown')
  const paused = await readRecoverySessionState(fixture)
  assert.equal(paused.ownerRuns['T1:api'].status, 'stopping')
  assert.equal(paused.ownerRuns['T1:api'].attemptControl.phase, 'technical_pause')
  assert.equal(paused.ownerRuns['T1:api'].attemptControl.technicalPauseReason, 'technical_pause_termination_unknown')
  assert.equal(paused.tasks.find(item => item.taskId === 'T1').status, 'stopped')
  assert.equal(paused.tasks.find(item => item.taskId === 'T1').action, 'inspect_runtime')
})

test('T17 unavailable cancellation target enters a finite technical pause and blocks same Owner re-entry', async t => {
  const fixture = await controlledFixture(t)
  await mutateRecoverySessionState(fixture, state => {
    const now = Date.now()
    state.ownerRuns['T1:api'] = {
      status: 'running', ownerId: 'api', taskId: 'T1', stageId: 'T1', attempt: 4,
      settlementGeneration: 9, sessionId: 'missing-session', leaseToken: 'dead-lease', planDigest: state.planDigest,
      startedAt: new Date(now - 2_000).toISOString(),
      attemptControl: {
        contract: 'DSH_OWNER_ATTEMPT_CONTROL_V1', executionVersion: state.planDigest,
        attempt: 4, leaseToken: 'dead-lease', generation: 9, sessionId: 'missing-session', phase: 'active',
        fixedDeadlineAt: new Date(now - 1_000).toISOString(), remainingCeilingMs: 1,
        lastObservedAt: new Date(now - 2_000).toISOString(), observationWindowMs: 20,
      },
    }
    const task = state.tasks.find(item => item.taskId === 'T1')
    task.status = 'running'
    task.executorId = 'missing-session'
  })
  const before = await readRecoverySessionState(fixture)
  const receipt = await fixture.runtime.awaitSupervisorEvent(
    fixture.admissionAgent, fixture.workflowId, before.supervisorEventCursor ?? 0, 1,
  )
  assert.equal(receipt.event.type, 'supervisor.owner-hard-deadline')
  const paused = await readRecoverySessionState(fixture)
  const record = paused.ownerRuns['T1:api']
  assert.equal(record.status, 'stopping')
  assert.equal(record.attemptControl.phase, 'technical_pause')
  assert.equal(record.attemptControl.technicalPauseReason, 'technical_pause_cancel_unconfirmed')
  assert.equal(paused.tasks.find(item => item.taskId === 'T1').status, 'stopped')
  assert.equal(paused.tasks.find(item => item.taskId === 'T1').action, 'inspect_runtime')
  await assert.rejects(
    fixture.runtime.runExternalOwner(fixture.admissionAgent, fixture.workflowId, 'T1', 'api'),
    /持久化运行记录/u,
  )
  assert.deepEqual(await readRecoverySessionState(fixture), paused)
})

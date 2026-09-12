import assert from 'node:assert/strict'
import test from 'node:test'
import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'

import {
  bindOwnerAttemptSession,
  createOwnerAttemptControl,
  failOwnerAttemptCancellation,
  observeOwnerAttemptClock,
  ownerAttemptBindingMatches,
  pauseUnknownOwnerTermination,
  requestOwnerAttemptStop,
  settleOwnerAttemptControl,
} from '../src/owner-attempt-control.mjs'

const START = Date.parse('2026-09-12T00:00:00.000Z')

function activeControl() {
  return bindOwnerAttemptSession(createOwnerAttemptControl({
    executionVersion: 'plan-v1',
    attempt: 3,
    leaseToken: 'lease-v1',
    generation: 7,
    deadlineMs: 1_000,
    observationWindowMs: 200,
    currentTime: START,
  }), 'session-v1')
}

test('T17 fixed deadline only decreases and heartbeats cannot extend it', () => {
  const initial = activeControl()
  const first = observeOwnerAttemptClock(initial, START + 250)
  assert.equal(first.expired, false)
  assert.equal(first.control.remainingCeilingMs, 750)
  const replayed = { ...first.control, lastHeartbeatAt: new Date(START + 900).toISOString() }
  const second = observeOwnerAttemptClock(replayed, START + 1_000)
  assert.equal(second.expired, true)
  assert.equal(second.control.fixedDeadlineAt, initial.fixedDeadlineAt)
  assert.equal(second.control.remainingCeilingMs, 0)
})

test('T17 wall-clock rollback fails closed without replenishing remaining time', () => {
  const observed = observeOwnerAttemptClock(activeControl(), START + 500).control
  const rollback = observeOwnerAttemptClock(observed, START + 400)
  assert.equal(rollback.technicalPause, true)
  assert.equal(rollback.control.phase, 'technical_pause')
  assert.equal(rollback.control.technicalPauseReason, 'technical_pause_clock_rollback')
  assert.equal(rollback.control.remainingCeilingMs, 500)
})

test('T17 stop request, cancellation failure, unknown termination and terminal settlement are finite and idempotent', () => {
  const stopping = requestOwnerAttemptStop(activeControl(), {
    cancelRequestId: 'cancel-v1',
    currentTime: START + 1_000,
  })
  assert.equal(stopping.phase, 'stopping')
  assert.strictEqual(requestOwnerAttemptStop(stopping, {
    cancelRequestId: 'different', currentTime: START + 1_050,
  }), stopping)

  const unknown = pauseUnknownOwnerTermination(stopping, START + 1_200)
  assert.equal(unknown.phase, 'technical_pause')
  assert.equal(unknown.technicalPauseReason, 'technical_pause_termination_unknown')

  const failedCancel = failOwnerAttemptCancellation(stopping, 'adapter exploded', START + 1_010)
  assert.equal(failedCancel.technicalPauseReason, 'technical_pause_cancel_unconfirmed')
  const recovered = settleOwnerAttemptControl(failedCancel, {
    terminalRevision: 12,
    terminalReason: 'aborted',
    currentTime: START + 1_020,
  })
  assert.equal(recovered.phase, 'settled')
  assert.equal(recovered.terminalRevision, 12)
  assert.strictEqual(settleOwnerAttemptControl(recovered, {
    terminalRevision: 99, terminalReason: 'completed', currentTime: START + 1_030,
  }), recovered)
})

test('T17 late results must match attempt, session, token and settlement generation', () => {
  const control = activeControl()
  const record = {
    planDigest: 'plan-v1', attempt: 3, leaseToken: 'lease-v1', settlementGeneration: 7,
    sessionId: 'session-v1', attemptControl: control,
  }
  const binding = {
    executionVersion: 'plan-v1', attempt: 3, leaseToken: 'lease-v1', generation: 7, sessionId: 'session-v1',
  }
  assert.equal(ownerAttemptBindingMatches(record, binding), true)
  for (const changed of [
    { attempt: 4 }, { leaseToken: 'lease-v2' }, { generation: 8 }, { sessionId: 'session-v2' },
  ]) assert.equal(ownerAttemptBindingMatches(record, { ...binding, ...changed }), false)
  assert.equal(ownerAttemptBindingMatches({ ...record, attemptControl: { ...control, phase: 'stopping' } }, binding), false)
})

test('T17 a fresh Runtime settles stopping from a persistent terminal event', async () => {
  const control = requestOwnerAttemptStop(activeControl(), {
    cancelRequestId: 'cancel-restart', currentTime: START + 1_000,
  })
  const runtime = createOwnerWorkflowRuntime({
    sessionPersistence: {
      async readFrom(sessionId, revision) {
        assert.equal(sessionId, 'session-v1')
        assert.equal(revision, 0)
        return { events: [{ type: 'turn/end', seq: 42, data: { reason: { kind: 'aborted' } } }] }
      },
    },
  }, {})
  const state = {
    id: 'workflow-v1', status: 'running', ownerRuns: {
      'task-v1:owner-v1': {
        status: 'stopping', phase: 'stopping', ownerId: 'owner-v1', stageId: 'task-v1',
        planDigest: 'plan-v1', attempt: 3, leaseToken: 'lease-v1', settlementGeneration: 7,
        sessionId: 'session-v1', attemptControl: control,
      },
    },
    tasks: [{ taskId: 'task-v1', status: 'running', executorId: 'session-v1', cursor: null, unchangedPolls: 0,
      reason: null, action: null }],
  }
  const result = await runtime.reconcileStoppingOwnerAttempts(state, START + 1_050)
  assert.equal(result.settled.length, 1)
  assert.equal(state.ownerRuns['task-v1:owner-v1'].status, 'failed')
  assert.equal(state.ownerRuns['task-v1:owner-v1'].attemptControl.phase, 'settled')
  assert.equal(state.ownerRuns['task-v1:owner-v1'].attemptControl.terminalRevision, 42)
  assert.equal(state.tasks[0].status, 'stopped')
  assert.equal(state.supervisorEvents[0].type, 'supervisor.owner-deadline-settled')
})

test('T17 Runtime rejects invalid hard-deadline configuration', () => {
  assert.throws(() => createOwnerWorkflowRuntime({}, { ownerAttemptDeadlineMs: 0 }), /正安全整数/u)
  assert.throws(() => createOwnerWorkflowRuntime({}, {
    ownerAttemptDeadlineMs: 1_000,
    ownerTerminationObservationMs: 0,
  }), /ownerTerminationObservationMs/u)
})

import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

import {
  createRecoverySessionFixture,
  mutateRecoverySessionState,
  readRecoverySessionState,
} from '../../../../../owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs'

const OWNER_ID = 'api'
const TASK_ID = 'T1'
const OBSERVATION_MS = 5_000

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

function within(promise, timeoutMs, label) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms`)), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timer))
}

async function waitFor(predicate, label, timeoutMs = OBSERVATION_MS) {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    const value = predicate()
    if (value !== undefined && value !== false) return value
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(`${label} was not observed within ${timeoutMs}ms`)
}

function terminalEvents(agent) {
  return agent.session.events
    .filter(event => event.type === 'turn/end')
    .map(event => ({ seq: event.seq, reason: event.data.reason.kind }))
}

async function main() {
  const cleanups = []
  const fixture = await createRecoverySessionFixture({
    after(cleanup) { cleanups.push(cleanup) },
  }, {
    executable: true,
    // The checked-in Harness MockAdapter emits a partial response, then only
    // observes the real Agent cancellation signal after its bounded delay.
    modelScript: () => ['hang-slow'],
  })
  const began = performance.now()
  try {
    await mutateRecoverySessionState(fixture, state => {
      // T-16 verifies a first actual Owner attempt.  The recovery fixture's
      // default failed record and admission ledger describe a later T-22 path.
      state.ownerRuns = {}
      delete state.recoveryAdmissionConfig
      delete state.recoveryAdmission
      const task = state.tasks.find(item => item.taskId === TASK_ID)
      task.status = 'pending'
      task.reason = null
      task.action = null
    })

    const execution = fixture.runtime.runExternalOwner(
      fixture.admissionAgent,
      fixture.workflowId,
      TASK_ID,
      OWNER_ID,
    )
    const active = await waitFor(() => {
      if (fixture.adapter.requests.length !== 1) return undefined
      const [sessionId, owner] = fixture.runtime.activeOwners.entries().next().value ?? []
      const child = sessionId === undefined ? undefined : fixture.ctx.agents.get(sessionId)
      return child === undefined ? undefined : { sessionId, owner, child }
    }, 'a real Owner child model request')

    const stateBeforeCancel = await readRecoverySessionState(fixture)
    const leaseBeforeCancel = await fixture.runtime.assertOwnerLease(active.owner.lease)
    const terminalBeforeCancel = terminalEvents(active.child)
    assert.equal(terminalBeforeCancel.length, 0, 'the live Owner must not be terminal before cancellation')

    const cancelReturn = active.child.cancel({ kind: 'user' })
    assert.equal(cancelReturn, undefined, 'Agent.cancel is a synchronous signal request')
    const terminalImmediatelyAfterCancel = terminalEvents(active.child)
    assert.equal(terminalImmediatelyAfterCancel.length, 0,
      'cancel return is not a terminal event or execution settlement')

    const leaseAfterCancel = await fixture.runtime.assertOwnerLease(active.owner.lease)
    let sameOwnerRefusal
    try {
      await fixture.runtime.withOwnerLease(
        fixture.root,
        OWNER_ID,
        fixture.workflowId,
        TASK_ID,
        undefined,
        async () => 'must not enter',
      )
    } catch (error) {
      sameOwnerRefusal = errorText(error)
    }
    assert.match(sameOwnerRefusal ?? '', /另一个临界区/,
      'the cancelling but unsettled Owner lease must refuse same-Owner re-entry')

    const executionOutcome = await within(execution.then(
      value => ({ state: 'fulfilled', value }),
      error => ({ state: 'rejected', error: errorText(error) }),
    ), OBSERVATION_MS, 'cancelled Owner execution')
    assert.equal(executionOutcome.state, 'rejected', 'the original execution must not complete successfully after cancellation')

    const terminalAfterSettlement = terminalEvents(active.child)
    assert.deepEqual(terminalAfterSettlement.map(event => event.reason), ['aborted'],
      'the real Harness session must record the cancellation terminal event')
    const persistedSession = await fixture.readFrom(active.sessionId)
    const persistedTerminal = persistedSession.events
      .filter(event => event.type === 'turn/end')
      .map(event => ({ seq: event.seq, reason: event.data.reason.kind }))
    assert.deepEqual(persistedTerminal, terminalAfterSettlement,
      'the JSONL persistence record must retain the same terminal event')
    const stateAfterSettlement = await readRecoverySessionState(fixture)
    assert.equal(stateAfterSettlement.ownerRuns['T1:api']?.status, 'failed',
      'the cancelled execution must not leave a completed Owner result')
    await assert.rejects(
      fixture.runtime.assertOwnerLease(active.owner.lease),
      /不再由当前运行时持有/,
      'the production Owner lease is released only after the original execution settles',
    )
    const postSettlementLease = await fixture.runtime.withOwnerLease(
      fixture.root,
      OWNER_ID,
      fixture.workflowId,
      TASK_ID,
      undefined,
      async lease => ({ token: lease.token }),
    )

    const eventsBeforeRepeatCancel = active.child.session.events.length
    const repeatCancelReturn = active.child.cancel({ kind: 'user' })
    assert.equal(repeatCancelReturn, undefined, 'repeat cancel is also a synchronous no-value request')
    await Promise.resolve()
    assert.equal(active.child.session.events.length, eventsBeforeRepeatCancel,
      'repeated cancellation of the already-ended child must not append a second terminal event')
    assert.equal(fixture.adapter.requests.length, 1,
      'repeated cancellation must not start another model request')

    console.log(JSON.stringify({
      scenario: 'real-owner-cancel-signal-to-settlement',
      elapsedMs: performance.now() - began,
      provider: 'mock',
      providerScope: 'checked-in Harness MockAdapter transport only',
      sandbox: 'real LocalSandboxProvider + SandboxPolicyService',
      sessionId: active.sessionId,
      modelRequests: fixture.adapter.requests.length,
      cancelReturn: String(cancelReturn),
      terminalBeforeCancel,
      terminalImmediatelyAfterCancel,
      leaseTokenBeforeCancel: leaseBeforeCancel.token,
      leaseTokenAfterCancel: leaseAfterCancel.token,
      sameOwnerRefusal,
      executionOutcome,
      terminalAfterSettlement,
      persistedTerminal,
      ownerRunStatusBeforeCancel: stateBeforeCancel.ownerRuns['T1:api']?.status,
      ownerRunStatusAfterSettlement: stateAfterSettlement.ownerRuns['T1:api']?.status,
      postSettlementLeaseAcquired: typeof postSettlementLease.token === 'string',
      repeatCancelReturn: String(repeatCancelReturn),
      eventsAfterRepeatCancel: active.child.session.events.length,
    }))
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup()
  }
}

await within(main(), 15_000, 'T-16 probe process')

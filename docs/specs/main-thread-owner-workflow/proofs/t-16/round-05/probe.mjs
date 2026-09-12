import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

import { ownerSubmitDefinition } from '../../../../../../owner-workflow-plugin/index.js'
import {
  createRecoverySessionFixture,
  mutateRecoverySessionState,
  readRecoverySessionState,
} from '../../../../../../owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs'

const API_OWNER = 'api'
const API_TASK = 'T1'
const OBSERVATION_MS = 8_000
const RECOVERY_COMPLETION_MS = 20_000

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

function createCancellationBarrier() {
  const aborted = Promise.withResolvers()
  const released = Promise.withResolvers()
  let releaseCalled = false
  return {
    aborted: aborted.promise,
    release() {
      if (!releaseCalled) {
        releaseCalled = true
        released.resolve(undefined)
      }
    },
    async wait(signal) {
      if (signal === undefined) throw new Error('T16 cancellation barrier requires the real Harness signal')
      const observed = new Promise(resolve => {
        if (signal.aborted) {
          aborted.resolve(undefined)
          resolve(undefined)
          return
        }
        signal.addEventListener('abort', () => {
          aborted.resolve(undefined)
          resolve(undefined)
        }, { once: true })
      })
      const began = performance.now()
      await within(observed, OBSERVATION_MS, 'T16 initial Owner cancellation signal')
      await within(released.promise, Math.max(1, OBSERVATION_MS - (performance.now() - began)),
        'T16 initial Owner barrier release')
      throw new Error('aborted')
    },
  }
}

function createRecoveryGate() {
  const released = Promise.withResolvers()
  let releaseCalled = false
  return {
    release() {
      if (!releaseCalled) {
        releaseCalled = true
        released.resolve(undefined)
      }
    },
    async wait() {
      await within(released.promise, OBSERVATION_MS, 'T16 recovered Owner model gate release')
    },
  }
}

async function settled(promise) {
  return promise.then(
    value => ({ state: 'fulfilled', value }),
    error => ({ state: 'rejected', error: errorText(error) }),
  )
}

function completedOwnerModelScript({ toolCallResponse, textResponse }) {
  const report = {
    contract: 'DSH_OWNER_RESULT_V1',
    status: 'completed',
    summary: 'T16 Round 05 recovered Owner completes through actual owner_submit.',
    changes: [],
    tests: [],
    handoffs: [],
    memory_updates: [],
  }
  // These are model transport responses only. owner_submit, verification,
  // commit, memory curation/review, and recovery settlement are production.
  return [
    toolCallResponse('t16-round05-owner-submit', 'owner_submit', { report }),
    textResponse('submission recorded'),
    textResponse(JSON.stringify({
      contract: 'DSH_OWNER_MEMORY_CURATOR_V1',
      summary: 'The controlled recovery has no memory page to add.',
      pages: [],
    })),
    textResponse(JSON.stringify({
      contract: 'DSH_OWNER_MEMORY_REVIEW_V1',
      status: 'passed',
      summary: 'The controlled empty memory bundle is valid.',
      issues: [],
    })),
  ]
}

async function main() {
  const cleanups = []
  const cancellationBarrier = createCancellationBarrier()
  const recoveryGate = createRecoveryGate()
  let initialExecution
  let recoveryExecution
  const fixture = await createRecoverySessionFixture({
    after(cleanup) { cleanups.push(cleanup) },
  }, {
    executable: true,
    modelScript: completedOwnerModelScript,
  })
  const originalStream = fixture.adapter.stream.bind(fixture.adapter)
  let streamCount = 0
  fixture.adapter.stream = async function* (options) {
    streamCount += 1
    if (streamCount === 1) {
      // First Owner: finite transport hold until real Agent.cancel arrives.
      fixture.adapter.requests.push(options)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'T16 initial Owner partial output' }
      await cancellationBarrier.wait(options.signal)
      return
    }
    if (streamCount === 2) {
      // Recovery Owner: hold after the real child/session/lease are created.
      // On release, delegate to MockAdapter's finite completed Owner script.
      fixture.adapter.requests.push(options)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'T16 recovered Owner partial output' }
      await recoveryGate.wait()
      fixture.adapter.requests.pop()
      yield* originalStream(options)
      return
    }
    yield* originalStream(options)
  }

  const began = performance.now()
  try {
    await mutateRecoverySessionState(fixture, state => {
      // The fixture's recovery admission configuration remains valid and is
      // intentionally preserved. Removing its seeded failure makes this the
      // ordinary first Owner attempt, before any recovery budget is spent.
      state.ownerRuns = {}
      const task = state.tasks.find(item => item.taskId === API_TASK)
      task.status = 'pending'
      task.reason = null
      task.action = null
    })

    initialExecution = fixture.runtime.runExternalOwner(
      fixture.admissionAgent,
      fixture.workflowId,
      API_TASK,
      API_OWNER,
    )
    const oldActive = await waitFor(() => {
      if (fixture.adapter.requests.length !== 1) return undefined
      for (const [sessionId, active] of fixture.runtime.activeOwners) {
        const child = fixture.ctx.agents.get(sessionId)
        if (active.owner.id === API_OWNER && child !== undefined) return { sessionId, active, child }
      }
      return undefined
    }, 'initial API Owner model request')
    const oldToken = (await fixture.runtime.assertOwnerLease(oldActive.active.lease)).token
    assert.deepEqual(terminalEvents(oldActive.child), [])

    const cancelReturn = oldActive.child.cancel({ kind: 'user' })
    assert.equal(cancelReturn, undefined)
    await within(cancellationBarrier.aborted, OBSERVATION_MS, 'initial Owner cancellation observation')
    assert.deepEqual(terminalEvents(oldActive.child), [])
    cancellationBarrier.release()
    const initialOutcome = await within(settled(initialExecution), OBSERVATION_MS, 'initial Owner execution settlement')
    assert.equal(initialOutcome.state, 'rejected')
    const initialTerminal = terminalEvents(oldActive.child)
    assert.deepEqual(initialTerminal.map(event => event.reason), ['aborted'])
    const persistedInitial = await fixture.readFrom(oldActive.sessionId)
    const persistedInitialTerminal = persistedInitial.events
      .filter(event => event.type === 'turn/end')
      .map(event => ({ seq: event.seq, reason: event.data.reason.kind }))
    assert.deepEqual(persistedInitialTerminal, initialTerminal)

    const failedState = await readRecoverySessionState(fixture)
    const oldRecord = structuredClone(failedState.ownerRuns['T1:api'])
    assert.equal(oldRecord.status, 'failed')
    assert.equal(oldRecord.attempt, 1)
    assert.equal(oldRecord.leaseToken, oldToken)
    assert.ok(failedState.recoveryAdmissionConfig,
      'the explicitly valid recovery admission configuration stays present')
    assert.equal(failedState.recoveryAdmission, undefined,
      'the ordinary initial attempt has not consumed a recovery admission')

    // This is the existing direct failure-recovery entry, rather than a
    // hand-built new attempt or a direct state/JSONL write.
    recoveryExecution = fixture.runtime.recoverOwner(
      fixture.admissionAgent,
      fixture.workflowId,
      API_TASK,
      API_OWNER,
    )
    const freshActive = await waitFor(() => {
      if (fixture.adapter.requests.length !== 2) return undefined
      for (const [sessionId, active] of fixture.runtime.activeOwners) {
        const child = fixture.ctx.agents.get(sessionId)
        if (sessionId !== oldActive.sessionId && active.owner.id === API_OWNER && child !== undefined) {
          return { sessionId, active, child }
        }
      }
      return undefined
    }, 'recovered API Owner model request')
    const recoveryState = await readRecoverySessionState(fixture)
    const freshRecord = structuredClone(recoveryState.ownerRuns['T1:api'])
    assert.equal(freshRecord.status, 'running')
    assert.equal(freshRecord.attempt, 2)
    assert.equal(freshRecord.sessionId, freshActive.sessionId)
    assert.notEqual(freshRecord.sessionId, oldActive.sessionId)
    assert.notEqual(freshRecord.leaseToken, oldToken)
    assert.equal(freshRecord.recoverySession?.ownerRunBinding?.attempt, freshRecord.attempt)
    assert.equal(freshRecord.recoverySession?.ownerRunBinding?.leaseToken, freshRecord.leaseToken)
    assert.equal(freshRecord.recoverySession?.executionIdentity?.sessionId, freshActive.sessionId)
    assert.ok(recoveryState.recoveryAdmission)

    const staleSubmission = await settled(ownerSubmitDefinition(fixture.runtime).execute({
      report: {
        contract: 'DSH_OWNER_RESULT_V1',
        status: 'failed',
        summary: 'late old Owner structured submission must not affect recovered attempt',
        changes: [],
        tests: [],
        handoffs: [],
        memory_updates: [],
      },
    }, { agent: oldActive.child }))
    assert.equal(staleSubmission.state, 'rejected')
    assert.match(staleSubmission.error, /只能由当前正在运行的 Owner 子代理调用/)
    const stateAfterStaleSubmission = await readRecoverySessionState(fixture)
    assert.deepEqual(stateAfterStaleSubmission.ownerRuns['T1:api'], freshRecord)

    recoveryGate.release()
    const recoveryOutcome = await within(settled(recoveryExecution), RECOVERY_COMPLETION_MS,
      'recovered Owner completion and settlement')
    assert.equal(recoveryOutcome.state, 'fulfilled')
    assert.equal(recoveryOutcome.value?.outcome, 'settled_succeeded')
    const settledState = await readRecoverySessionState(fixture)
    const settledRecord = settledState.ownerRuns['T1:api']
    assert.equal(settledRecord.status, 'completed')
    assert.equal(settledRecord.attempt, freshRecord.attempt)
    assert.equal(settledRecord.leaseToken, freshRecord.leaseToken)
    assert.equal(settledRecord.sessionId, freshActive.sessionId)
    assert.equal(settledRecord.recoverySession?.phase, 'settled_succeeded')
    assert.equal(settledState.tasks.find(item => item.taskId === API_TASK)?.status, 'completed')
    const persistedRecovery = await fixture.readFrom(freshActive.sessionId)
    const recoverySubmissions = persistedRecovery.events
      .filter(event => event.type === 'tool/call' && event.data.name === 'owner_submit')
    assert.equal(recoverySubmissions.length, 1)

    console.log(JSON.stringify({
      scenario: 'cancelled-owner-recoverOwner-new-attempt-stale-submit-rejected-and-completes',
      probeElapsedMs: performance.now() - began,
      provider: 'mock',
      providerScope: 'bounded local transport only',
      initialCancellationBarrierMs: OBSERVATION_MS,
      recoveryModelGateMs: OBSERVATION_MS,
      recoveryCompletionLimitMs: RECOVERY_COMPLETION_MS,
      sandbox: 'real LocalSandboxProvider + SandboxPolicyService',
      processId: process.pid,
      modelRequests: fixture.adapter.requests.length,
      cancelReturn: String(cancelReturn),
      initial: {
        sessionId: oldActive.sessionId,
        token: oldToken,
        outcome: initialOutcome,
        terminal: initialTerminal,
        persistedTerminal: persistedInitialTerminal,
        record: { status: oldRecord.status, attempt: oldRecord.attempt, leaseToken: oldRecord.leaseToken },
      },
      recovered: {
        sessionId: freshActive.sessionId,
        token: freshRecord.leaseToken,
        recordBeforeStaleSubmission: {
          status: freshRecord.status,
          attempt: freshRecord.attempt,
          sessionId: freshRecord.sessionId,
          leaseToken: freshRecord.leaseToken,
          sourceId: freshRecord.recoverySession?.sourceId,
          rootProblemId: freshRecord.recoverySession?.rootProblemId,
          ownerRunBinding: freshRecord.recoverySession?.ownerRunBinding,
        },
        staleSubmission,
        recordUnchangedAfterStaleSubmission: true,
        outcome: {
          state: recoveryOutcome.state,
          outcome: recoveryOutcome.value?.outcome,
          phase: recoveryOutcome.value?.phase,
        },
        final: {
          status: settledRecord.status,
          attempt: settledRecord.attempt,
          sessionId: settledRecord.sessionId,
          leaseToken: settledRecord.leaseToken,
          recoveryPhase: settledRecord.recoverySession?.phase,
          ownerSubmitCalls: recoverySubmissions.length,
        },
      },
    }))
  } finally {
    cancellationBarrier.release()
    recoveryGate.release()
    await Promise.allSettled(cleanups.reverse().map(cleanup => cleanup()))
  }
}

main().catch(error => {
  console.log(JSON.stringify({ probeError: errorText(error) }))
  process.exitCode = 1
})

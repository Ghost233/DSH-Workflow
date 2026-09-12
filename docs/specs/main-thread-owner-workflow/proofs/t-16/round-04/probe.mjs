import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

import { ownerSubmitDefinition } from '../../../../../../owner-workflow-plugin/index.js'
import {
  createRecoverySessionFixture,
  mutateRecoverySessionState,
  readRecoverySessionState,
} from '../../../../../../owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs'

const API_OWNER = 'api'
const API_TASK = 'T1'
const OBSERVATION_MS = 8_000

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

function createAbortBarrier() {
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
      if (signal === undefined) throw new Error('T16 bounded transport barrier requires a Harness cancellation signal')
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
      await within(observed, OBSERVATION_MS, 'T16 transport barrier did not observe cancellation')
      const remainingMs = OBSERVATION_MS - (performance.now() - began)
      await within(released.promise, Math.max(1, remainingMs), 'T16 transport barrier was not released')
      throw new Error('aborted')
    },
  }
}

async function rejected(promise) {
  return promise.then(
    value => ({ state: 'fulfilled', value }),
    error => ({ state: 'rejected', error: errorText(error) }),
  )
}

async function main() {
  const cleanups = []
  const barrier = createAbortBarrier()
  let apiExecution
  const fixture = await createRecoverySessionFixture({
    after(cleanup) { cleanups.push(cleanup) },
  }, {
    executable: true,
    modelScript: () => [],
  })
  const originalStream = fixture.adapter.stream.bind(fixture.adapter)
  let streamCount = 0
  fixture.adapter.stream = async function* (options) {
    streamCount += 1
    if (streamCount !== 1) {
      yield* originalStream(options)
      return
    }
    // The only replacement is a finite model-transport hold. Agent.cancel,
    // JSONL persistence, owner_submit, Runtime entry, and leases stay real.
    fixture.adapter.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'T16 round-04 controlled API Owner partial output' }
    await barrier.wait(options.signal)
  }

  const began = performance.now()
  try {
    await mutateRecoverySessionState(fixture, state => {
      state.ownerRuns = {}
      delete state.recoveryAdmissionConfig
      delete state.recoveryAdmission
      const task = state.tasks.find(item => item.taskId === API_TASK)
      task.status = 'pending'
      task.reason = null
      task.action = null
    })

    apiExecution = fixture.runtime.runExternalOwner(
      fixture.admissionAgent,
      fixture.workflowId,
      API_TASK,
      API_OWNER,
    )
    const apiActive = await waitFor(() => {
      if (fixture.adapter.requests.length !== 1) return undefined
      for (const [sessionId, active] of fixture.runtime.activeOwners) {
        const child = fixture.ctx.agents.get(sessionId)
        if (active.owner.id === API_OWNER && child !== undefined) return { sessionId, active, child }
      }
      return undefined
    }, 'running API Owner model request')
    const oldToken = (await fixture.runtime.assertOwnerLease(apiActive.active.lease)).token
    assert.deepEqual(terminalEvents(apiActive.child), [])

    const cancelReturn = apiActive.child.cancel({ kind: 'user' })
    assert.equal(cancelReturn, undefined)
    await within(barrier.aborted, OBSERVATION_MS, 'API Owner cancellation signal observation')
    assert.deepEqual(terminalEvents(apiActive.child), [],
      'a cancellation signal alone is not a terminal session event')
    const oldLeaseAfterCancel = await fixture.runtime.assertOwnerLease(apiActive.active.lease)
    assert.equal(oldLeaseAfterCancel.token, oldToken)

    barrier.release()
    const apiOutcome = await within(rejected(apiExecution), OBSERVATION_MS, 'released API Owner execution')
    assert.equal(apiOutcome.state, 'rejected')
    const apiTerminal = terminalEvents(apiActive.child)
    assert.deepEqual(apiTerminal.map(event => event.reason), ['aborted'])
    const persistedApi = await fixture.readFrom(apiActive.sessionId)
    const persistedApiTerminal = persistedApi.events
      .filter(event => event.type === 'turn/end')
      .map(event => ({ seq: event.seq, reason: event.data.reason.kind }))
    assert.deepEqual(persistedApiTerminal, apiTerminal)

    const stateBeforeRetry = await readRecoverySessionState(fixture)
    const oldRecord = structuredClone(stateBeforeRetry.ownerRuns['T1:api'])
    assert.equal(oldRecord.status, 'failed')
    assert.equal(oldRecord.attempt, 1)
    assert.equal(oldRecord.leaseToken, oldToken)
    const oldLeaseAfterTermination = await rejected(fixture.runtime.assertOwnerLease(apiActive.active.lease))
    assert.equal(oldLeaseAfterTermination.state, 'rejected')
    assert.match(oldLeaseAfterTermination.error, /Lease 已不再由当前运行时持有/)

    // This is the existing public Runtime entry. The fixture does not alter
    // failed state into a new attempt, so this records the current missing
    // admission path instead of fabricating one for a fencing claim.
    const retryRun = await rejected(fixture.runtime.runExternalOwner(
      fixture.admissionAgent,
      fixture.workflowId,
      API_TASK,
      API_OWNER,
    ))
    assert.equal(retryRun.state, 'rejected')
    assert.match(retryRun.error, /当前状态不能启动 Owner：failed/)
    const stateAfterRejectedRetry = await readRecoverySessionState(fixture)
    assert.deepEqual(stateAfterRejectedRetry.ownerRuns['T1:api'], oldRecord)

    let freshToken
    let oldLeaseWhileFreshHeld
    let staleSubmission
    let stateAfterStaleSubmission
    await fixture.runtime.withOwnerLease(
      fixture.root,
      API_OWNER,
      fixture.workflowId,
      API_TASK,
      undefined,
      async freshLease => {
        freshToken = (await fixture.runtime.assertOwnerLease(freshLease)).token
        assert.notEqual(freshToken, oldToken)
        oldLeaseWhileFreshHeld = await rejected(fixture.runtime.assertOwnerLease(apiActive.active.lease))
        assert.equal(oldLeaseWhileFreshHeld.state, 'rejected')
        assert.match(oldLeaseWhileFreshHeld.error, /Lease 已不再由当前运行时持有/)

        const report = {
          contract: 'DSH_OWNER_RESULT_V1',
          status: 'failed',
          summary: 'stale Owner structured result must not write',
          changes: [],
          tests: [],
          handoffs: [],
          memory_updates: [],
        }
        // Call the actual registered owner_submit definition with the actual
        // old child identity. No mock submission or direct state write occurs.
        staleSubmission = await rejected(ownerSubmitDefinition(fixture.runtime).execute(
          { report },
          { agent: apiActive.child },
        ))
        assert.equal(staleSubmission.state, 'rejected')
        assert.match(staleSubmission.error, /只能由当前正在运行的 Owner 子代理调用/)
        stateAfterStaleSubmission = await readRecoverySessionState(fixture)
        assert.deepEqual(stateAfterStaleSubmission.ownerRuns['T1:api'], oldRecord)
      },
    )

    console.log(JSON.stringify({
      scenario: 'old-owner-lease-and-stale-structured-submission-rejection',
      probeElapsedMs: performance.now() - began,
      provider: 'mock',
      providerScope: 'bounded local transport barrier only',
      transportBarrierMs: OBSERVATION_MS,
      sandbox: 'real LocalSandboxProvider + SandboxPolicyService',
      processId: process.pid,
      apiSessionId: apiActive.sessionId,
      modelRequests: fixture.adapter.requests.length,
      cancelReturn: String(cancelReturn),
      oldToken,
      freshToken,
      apiTerminalBeforeBarrierRelease: [],
      apiOutcome,
      apiTerminal,
      persistedApiTerminal,
      oldRecord: {
        status: oldRecord.status,
        attempt: oldRecord.attempt,
        leaseToken: oldRecord.leaseToken,
        sessionId: oldRecord.sessionId,
      },
      oldLeaseAfterTermination,
      retryRun,
      oldLeaseWhileFreshHeld,
      staleSubmission,
      recordUnchangedAfterRejectedRetry: true,
      recordUnchangedAfterStaleSubmission: true,
    }))
  } finally {
    barrier.release()
    await Promise.allSettled(cleanups.reverse().map(cleanup => cleanup()))
  }
}

main().catch(error => {
  console.log(JSON.stringify({ probeError: errorText(error) }))
  process.exitCode = 1
})

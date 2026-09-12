import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

import {
  createRecoverySessionFixture,
  mutateRecoverySessionState,
  readRecoverySessionState,
  reopenRecoverySessionFixture,
} from '../../../../../../owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs'

const API_OWNER = 'api'
const WORKER_OWNER = 'worker'
const API_TASK = 'T1'
const WORKER_TASK = 'T2'
const OBSERVATION_MS = 6_000
const BARRIER_MS = 8_000

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

function completedOwnerScript({ toolCallResponse, textResponse }) {
  return [
    toolCallResponse('t16-worker-submit', 'owner_submit', { report: {
      contract: 'DSH_OWNER_RESULT_V1', status: 'completed',
      summary: 'Independent worker Owner completed the controlled task.',
      changes: [], tests: [], handoffs: [], memory_updates: [],
    } }),
    textResponse('submission recorded'),
    textResponse(JSON.stringify({
      contract: 'DSH_OWNER_MEMORY_CURATOR_V1',
      summary: 'No knowledge pages are needed for the controlled worker task.', pages: [],
    })),
    textResponse(JSON.stringify({
      contract: 'DSH_OWNER_MEMORY_REVIEW_V1', status: 'passed',
      summary: 'The controlled empty memory bundle is valid.', issues: [],
    })),
  ]
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
      const signalObserved = new Promise(resolve => {
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
      await within(signalObserved, BARRIER_MS, 'T16 transport barrier did not observe cancellation')
      const remainingMs = BARRIER_MS - (performance.now() - began)
      await within(released.promise, Math.max(1, remainingMs), 'T16 transport barrier was not released')
      throw new Error('aborted')
    },
  }
}

async function main() {
  const cleanups = []
  const barrier = createAbortBarrier()
  let firstExecution
  let secondRuntime
  const fixture = await createRecoverySessionFixture({
    after(cleanup) { cleanups.push(cleanup) },
  }, {
    executable: true,
    includeIndependentOwner: true,
    modelScript: completedOwnerScript,
  })
  const originalStream = fixture.adapter.stream.bind(fixture.adapter)
  let streamCount = 0
  fixture.adapter.stream = async function* (options) {
    streamCount += 1
    if (streamCount !== 1) {
      yield* originalStream(options)
      return
    }
    // This is a bounded local model-transport barrier. It does not replace
    // Agent.cancel, Runtime leases, JSONL persistence, or Runtime endpoints.
    fixture.adapter.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'T16 controlled partial Owner output' }
    await barrier.wait(options.signal)
  }

  const began = performance.now()
  try {
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

    firstExecution = fixture.runtime.runExternalOwner(
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
    assert.deepEqual(terminalEvents(apiActive.child), [], 'API Owner is nonterminal before cancellation')

    const cancelReturn = apiActive.child.cancel({ kind: 'user' })
    assert.equal(cancelReturn, undefined, 'real Agent.cancel is a synchronous signal request')
    await within(barrier.aborted, OBSERVATION_MS, 'API Owner cancellation signal observation')
    assert.deepEqual(terminalEvents(apiActive.child), [],
      'the bounded transport barrier holds the actual turn before turn/end')

    secondRuntime = await reopenRecoverySessionFixture({ root: fixture.root, workflowId: fixture.workflowId })
    const sameOwnerAttempt = await within(secondRuntime.runtime.runExternalOwner(
      secondRuntime.admissionAgent,
      fixture.workflowId,
      API_TASK,
      API_OWNER,
    ).then(
      value => ({ state: 'fulfilled', value }),
      error => ({ state: 'rejected', error: errorText(error) }),
    ), OBSERVATION_MS, 'second Runtime same Owner lease attempt')
    assert.equal(sameOwnerAttempt.state, 'rejected')
    assert.match(sameOwnerAttempt.error ?? '', /存活的 Harness 进程占用/,
      'a second Runtime must be rejected by the real on-disk Owner lease')
    assert.deepEqual(terminalEvents(apiActive.child), [],
      'same-Owner rejection occurs while the first actual turn has no terminal event')

    const workerExecution = fixture.runtime.runExternalOwner(
      fixture.admissionAgent,
      fixture.workflowId,
      WORKER_TASK,
      WORKER_OWNER,
    )
    const workerActive = await waitFor(() => {
      if (fixture.adapter.requests.length < 2) return undefined
      for (const [sessionId, active] of fixture.runtime.activeOwners) {
        const child = fixture.ctx.agents.get(sessionId)
        if (active.owner.id === WORKER_OWNER && child !== undefined) return { sessionId, active, child }
      }
      return undefined
    }, 'independent Worker Owner model request while API Owner remains nonterminal')
    assert.deepEqual(terminalEvents(apiActive.child), [],
      'the Worker Owner begins before the cancelled API Owner has turn/end')

    const workerResult = await within(workerExecution, OBSERVATION_MS, 'independent Worker Owner completion')
    const stateBeforeRelease = await readRecoverySessionState(fixture)
    const workerRecord = stateBeforeRelease.ownerRuns['T2:worker']
    assert.equal(workerRecord?.status, 'completed', 'the independent Owner completes through the production owner_submit path')
    assert.equal(stateBeforeRelease.tasks.find(task => task.taskId === WORKER_TASK)?.status, 'completed')
    assert.equal(typeof workerRecord?.sessionId, 'string')
    const workerPersisted = await fixture.readFrom(workerRecord.sessionId)
    const workerTerminal = workerPersisted.events
      .filter(event => event.type === 'turn/end')
      .map(event => ({ seq: event.seq, reason: event.data.reason.kind }))
    assert.deepEqual(workerTerminal.map(event => event.reason), ['completed'],
      'the independent Owner has a persisted completed turn while API remains nonterminal')
    assert.deepEqual(terminalEvents(apiActive.child), [],
      'API turn still has no terminal event after independent Owner completion')

    barrier.release()
    const apiOutcome = await within(firstExecution.then(
      value => ({ state: 'fulfilled', value }),
      error => ({ state: 'rejected', error: errorText(error) }),
    ), OBSERVATION_MS, 'released API Owner execution')
    assert.equal(apiOutcome.state, 'rejected')
    const apiTerminal = terminalEvents(apiActive.child)
    assert.deepEqual(apiTerminal.map(event => event.reason), ['aborted'])
    const apiPersisted = await fixture.readFrom(apiActive.sessionId)
    const apiPersistedTerminal = apiPersisted.events
      .filter(event => event.type === 'turn/end')
      .map(event => ({ seq: event.seq, reason: event.data.reason.kind }))
    assert.deepEqual(apiPersistedTerminal, apiTerminal)
    const stateAfterTermination = await readRecoverySessionState(fixture)
    assert.equal(stateAfterTermination.ownerRuns['T1:api']?.status, 'failed')

    const newLease = await secondRuntime.runtime.withOwnerLease(
      fixture.root,
      API_OWNER,
      fixture.workflowId,
      API_TASK,
      undefined,
      async lease => ({ token: lease.token }),
    )
    assert.notEqual(newLease.token, oldToken, 'a post-termination Runtime gets a new fencing token')

    console.log(JSON.stringify({
      scenario: 'cross-runtime-owner-cancel-isolation-and-independent-owner',
      elapsedMs: performance.now() - began,
      provider: 'mock',
      providerScope: 'bounded local transport barrier plus checked-in MockAdapter completion responses',
      transportBarrierMs: BARRIER_MS,
      sandbox: 'real LocalSandboxProvider + SandboxPolicyService',
      apiSessionId: apiActive.sessionId,
      workerSessionId: workerActive.sessionId,
      modelRequests: fixture.adapter.requests.length,
      cancelReturn: String(cancelReturn),
      apiTerminalBeforeCrossRuntimeAttempt: [],
      sameOwnerAttempt,
      workerStartedBeforeApiTerminal: true,
      workerResult: { sessionId: workerResult.sessionId, commitSha: workerResult.commitSha },
      workerTerminal,
      apiTerminalBeforeBarrierRelease: [],
      apiOutcome,
      apiTerminal,
      apiPersistedTerminal,
      apiOwnerRunStatusAfterTermination: stateAfterTermination.ownerRuns['T1:api']?.status,
      workerOwnerRunStatus: stateAfterTermination.ownerRuns['T2:worker']?.status,
      oldToken,
      newToken: newLease.token,
    }))
  } finally {
    barrier.release()
    if (firstExecution !== undefined) {
      await within(firstExecution.catch(() => undefined), OBSERVATION_MS, 'T16 API cleanup').catch(() => undefined)
    }
    if (secondRuntime !== undefined) await secondRuntime.dispose()
    for (const cleanup of cleanups.reverse()) await cleanup()
  }
}

await within(main(), 20_000, 'T-16 round-02 probe process')

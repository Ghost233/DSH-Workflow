import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createRecoverySessionFixture,
  mutateRecoverySessionState,
  readRecoverySessionState,
} from '../../../../../../owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs'

const workspaceRoot = fileURLToPath(new URL('../../../../../../', import.meta.url))
const CHILD = fileURLToPath(new URL('./second-runtime-child.mjs', import.meta.url))
const TSX = join(workspaceRoot, 'deepseek-harness/node_modules/tsx/dist/esm/index.mjs')
const API_OWNER = 'api'
const API_TASK = 'T1'
const OBSERVATION_MS = 8_000
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
      await within(observed, BARRIER_MS, 'T16 transport barrier did not observe cancellation')
      const remainingMs = BARRIER_MS - (performance.now() - began)
      await within(released.promise, Math.max(1, remainingMs), 'T16 transport barrier was not released')
      throw new Error('aborted')
    },
  }
}

function launchSecondRuntime(root, workflowId) {
  const child = spawn(process.execPath, ['--import', TSX, CHILD, root, workflowId], {
    cwd: workspaceRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  let stdout = ''
  let stderr = ''
  const messages = []
  const waiters = []
  const resolveWaiters = message => {
    for (const waiter of waiters.splice(0)) {
      if (waiter.type === message.type) waiter.resolve(message)
      else waiters.push(waiter)
    }
  }
  child.stdout.on('data', chunk => {
    stdout += chunk
    for (;;) {
      const index = stdout.indexOf('\n')
      if (index === -1) break
      const line = stdout.slice(0, index)
      stdout = stdout.slice(index + 1)
      if (line.trim() === '') continue
      try {
        const message = JSON.parse(line)
        messages.push(message)
        resolveWaiters(message)
      } catch (error) {
        messages.push({ type: 'invalid-output', error: errorText(error), line })
      }
    }
  })
  child.stderr.on('data', chunk => { stderr += chunk })
  const exited = new Promise(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
  return {
    child,
    processId: child.pid,
    messages,
    exited,
    wait(type) {
      const existing = messages.find(message => message.type === type)
      if (existing !== undefined) return Promise.resolve(existing)
      return new Promise(resolve => { waiters.push({ type, resolve }) })
    },
    command(value) {
      child.stdin.write(`${JSON.stringify(value)}\n`)
    },
    diagnostics() {
      return { stdoutRemainder: stdout, stderr, messages: [...messages] }
    },
    stop() {
      if (!child.killed) child.kill('SIGKILL')
    },
  }
}

async function main() {
  const cleanups = []
  const barrier = createAbortBarrier()
  let apiExecution
  let second
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
    // A bounded transport-only hold. Actual Agent.cancel, JSONL persistence,
    // Runtime entry, and file lease acquisition remain the production paths.
    fixture.adapter.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'T16 controlled API Owner partial output' }
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
      'the second process begins while cancellation has no terminal event')

    second = launchSecondRuntime(fixture.root, fixture.workflowId)
    const sameOwner = await within(second.wait('same-owner-attempt'), OBSERVATION_MS,
      'second OS process same Owner lease attempt')
    assert.notEqual(second.processId, process.pid, 'the lease contender must be a distinct OS process')
    assert.equal(sameOwner.processId, second.processId)
    assert.equal(sameOwner.sameOwnerAttempt.state, 'rejected')
    assert.match(sameOwner.sameOwnerAttempt.error ?? '', /存活的 Harness 进程占用/)
    assert.match(sameOwner.sameOwnerAttempt.error ?? '', new RegExp(`pid=${process.pid}`))
    assert.deepEqual(terminalEvents(apiActive.child), [],
      'the child process lease rejection occurs before API turn/end')

    barrier.release()
    const apiOutcome = await within(apiExecution.then(
      value => ({ state: 'fulfilled', value }),
      error => ({ state: 'rejected', error: errorText(error) }),
    ), OBSERVATION_MS, 'released API Owner execution')
    assert.equal(apiOutcome.state, 'rejected')
    const apiTerminal = terminalEvents(apiActive.child)
    assert.deepEqual(apiTerminal.map(event => event.reason), ['aborted'])
    const persistedApi = await fixture.readFrom(apiActive.sessionId)
    const persistedApiTerminal = persistedApi.events
      .filter(event => event.type === 'turn/end')
      .map(event => ({ seq: event.seq, reason: event.data.reason.kind }))
    assert.deepEqual(persistedApiTerminal, apiTerminal)
    const stateAfterTermination = await readRecoverySessionState(fixture)
    assert.equal(stateAfterTermination.ownerRuns['T1:api']?.status, 'failed')
    assert.equal(stateAfterTermination.ownerRuns['T1:api']?.leaseToken, oldToken)

    second.command({ command: 'acquire-after-termination' })
    const newLease = await within(second.wait('new-lease'), OBSERVATION_MS,
      'second OS process new token acquisition')
    assert.equal(newLease.processId, second.processId)
    assert.notEqual(newLease.token, oldToken)
    const secondExit = await within(second.exited, OBSERVATION_MS, 'second Runtime process exit')
    assert.deepEqual(secondExit, { code: 0, signal: null }, JSON.stringify(second.diagnostics()))

    console.log(JSON.stringify({
      scenario: 'cross-process-owner-cancel-isolation-and-new-token',
      elapsedMs: performance.now() - began,
      provider: 'mock',
      providerScope: 'bounded local transport barrier only',
      transportBarrierMs: BARRIER_MS,
      sandbox: 'real LocalSandboxProvider + SandboxPolicyService',
      primaryProcessId: process.pid,
      secondProcessId: second.processId,
      apiSessionId: apiActive.sessionId,
      modelRequests: fixture.adapter.requests.length,
      cancelReturn: String(cancelReturn),
      apiTerminalBeforeSecondProcessAttempt: [],
      sameOwnerAttempt: sameOwner.sameOwnerAttempt,
      apiTerminalBeforeBarrierRelease: [],
      apiOutcome,
      apiTerminal,
      persistedApiTerminal,
      ownerRun: {
        status: stateAfterTermination.ownerRuns['T1:api']?.status,
        attempt: stateAfterTermination.ownerRuns['T1:api']?.attempt,
        persistedLeaseToken: stateAfterTermination.ownerRuns['T1:api']?.leaseToken,
      },
      oldToken,
      newToken: newLease.token,
    }))
  } finally {
    barrier.release()
    if (apiExecution !== undefined) {
      await within(apiExecution.catch(() => undefined), OBSERVATION_MS, 'T16 API cleanup').catch(() => undefined)
    }
    if (second !== undefined) {
      second.stop()
      await within(second.exited, OBSERVATION_MS, 'T16 second process cleanup').catch(() => undefined)
    }
    for (const cleanup of cleanups.reverse()) await cleanup()
  }
}

await within(main(), 25_000, 'T-16 round-03 probe process')

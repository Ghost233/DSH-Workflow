import assert from 'node:assert/strict'

import {
  createRecoverySessionFixture,
  mutateRecoverySessionState,
} from '../../../../../../owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs'

const OWNER_ID = 'api'
const TASK_ID = 'T1'
const LIMIT_MS = 8_000

function within(promise, timeoutMs, label) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms`)), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timer))
}

async function waitFor(predicate, label) {
  const until = Date.now() + LIMIT_MS
  while (Date.now() < until) {
    const value = predicate()
    if (value !== undefined && value !== false) return value
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(`${label} was not observed within ${LIMIT_MS}ms`)
}

function terminals(session) {
  return session.events
    .filter(event => event.type === 'turn/end')
    .map(event => ({ seq: event.seq, reason: event.data.reason.kind }))
}

const signalObserved = Promise.withResolvers()
const externalRelease = Promise.withResolvers()
const fixture = await createRecoverySessionFixture({ after() {} }, {
  executable: true,
  modelScript: () => [],
})

try {
  const originalStream = fixture.adapter.stream.bind(fixture.adapter)
  let streams = 0
  fixture.adapter.stream = async function* (options) {
    streams += 1
    if (streams !== 1) {
      yield* originalStream(options)
      return
    }
    fixture.adapter.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'round06 controller-loss partial output' }
    const canceled = new Promise(resolve => {
      if (options.signal.aborted) {
        signalObserved.resolve(undefined)
        resolve(undefined)
      } else {
        options.signal.addEventListener('abort', () => {
          signalObserved.resolve(undefined)
          resolve(undefined)
        }, { once: true })
      }
    })
    await within(canceled, LIMIT_MS, 'real cancellation signal')
    // This is bounded in case the parent does not kill this process.  It is not
    // the terminal evidence: the driver sends SIGKILL before it can release.
    await within(externalRelease.promise, LIMIT_MS, 'external controller-loss signal')
    throw new Error('aborted')
  }

  await mutateRecoverySessionState(fixture, state => {
    state.ownerRuns = {}
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
  void execution.catch(() => undefined)
  const active = await waitFor(() => {
    if (fixture.adapter.requests.length !== 1) return undefined
    for (const [sessionId, owner] of fixture.runtime.activeOwners) {
      const child = fixture.ctx.agents.get(sessionId)
      if (owner.owner.id === OWNER_ID && child !== undefined) return { sessionId, owner, child }
    }
  }, 'live Owner')
  const token = (await fixture.runtime.assertOwnerLease(active.owner.lease)).token
  assert.deepEqual(terminals(active.child.session), [])

  // Calls the real Harness Agent.cancel. It returns void synchronously; the
  // barrier reports only the actual AbortSignal observed by model transport.
  const cancelReturn = active.child.cancel({ kind: 'user' })
  assert.equal(cancelReturn, undefined)
  await within(signalObserved.promise, LIMIT_MS, 'model transport abort observation')
  assert.deepEqual(terminals(active.child.session), [])

  // The real public session-store durability checkpoint makes the partial
  // JSONL artifact observable before the controller process disappears.
  await within(fixture.ctx.sessions.flush(active.child.session), LIMIT_MS, 'partial session durability checkpoint')
  console.log(JSON.stringify({
    type: 'ready',
    root: fixture.root,
    workflowId: fixture.workflowId,
    sessionId: active.sessionId,
    leaseToken: token,
    pid: process.pid,
    cancelReturn: String(cancelReturn),
    terminal: terminals(active.child.session),
  }))

  await within(externalRelease.promise, LIMIT_MS, 'driver SIGKILL was not delivered')
} catch (error) {
  console.error(error)
  process.exitCode = 1
}

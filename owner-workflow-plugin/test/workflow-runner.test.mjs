import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkflowStore } from '../src/workflow-store.mjs'
import { WorkflowEffects } from '../src/workflow-effects.mjs'
import { WorkflowRunner } from '../src/workflow-runner.mjs'
import { kernelDigest } from '../src/workflow-engine.mjs'
import { normalizePlanV2 } from '../src/model.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'ukr-runner-'))
  const store = new WorkflowStore(root); await store.initialize()
  await store.transact({ type: 'workflow.create', id: 'wf', root, rootSessionId: 'root', request: 'runner fixture', baseCommit: 'base' })
  t.after(() => rm(root, { recursive: true, force: true }))
  return store
}
function ownerPlan() {
  return normalizePlanV2({
    contract: 'DSH_PLAN_V2', registryDigest: 'a'.repeat(64), summary: 'Lifecycle interruption fixture',
    owners: [{ id: 'owner', name: 'Owner', description: 'Fixture Owner', scope: ['src/**'], exclude: [] }],
    tasks: [{ id: 'T1', title: 'T1', role: 'work', ownerId: 'owner', dependsOn: [], resources: [],
      write: ['src/**'], verify: ['unit'], done: ['The task is complete.'] }],
    verifications: [{ id: 'unit', run: ['node', '--test'] }],
  })
}
test('runner wakes after durable changes, completes once, then sleeps without a polling feedback loop', { timeout: 10_000 }, async t => {
  const store = await fixture(t)
  let executions = 0, pumps = 0
  const effects = new WorkflowEffects(store, { notify_main: { execute: async action => {
    executions++; return { rootSessionId: 'root', messageId: action.id, persisted: true }
  } } })
  const pump = effects.pump.bind(effects); effects.pump = async () => { pumps++; await pump() }
  const runner = new WorkflowRunner(store, effects)
  t.after(() => runner.close()); runner.start()
  await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'notify_main', key: 'notice', input: { rootSessionId: 'root', reason: 'fixture' } })
  const deadline = Date.now() + 3000
  while (executions === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
  await effects.drain(); await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(executions, 1)
  const previous = pumps
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.equal(pumps, previous)
  assert.ok(pumps <= 4)
})

test('effect result validation failures become observable failure facts', async t => {
  const store = await fixture(t)
  await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'notify_main', key: 'notice', input: { rootSessionId: 'root', reason: 'fixture' } })
  const errors = []
  const effects = new WorkflowEffects(store, { notify_main: { execute: async () => ({ persisted: false }) } }, { onError: error => errors.push(error) })
  await effects.pump(); await effects.drain()
  const action = Object.values((await store.read()).actions)[0]
  assert.equal(action.status, 'uncertain')
  assert.match(action.failure, /durable receipt/)
  assert.equal(errors.length, 1)
  assert.ok(action.nextWakeAt > Date.now())
})

test('a fully settled adapter failure is terminal while incomplete failure evidence remains uncertain', async t => {
  const store = await fixture(t)
  const { result: settledId } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'consult_owner',
    key: 'settled-failure', input: { command: 'settled' } })
  const { result: uncertainId } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'consult_owner',
    key: 'uncertain-failure', input: { command: 'uncertain' } })
  const effects = new WorkflowEffects(store, { consult_owner: { execute: async action => action.id === settledId
    ? { failed: true, reason: 'invalid structured delivery', executionSettled: true, managedRangeStopped: true,
        terminationScope: 'dsh-managed-range', terminationId: 'term-settled', evidenceRef: '/settled/action' }
    : { failed: true, reason: 'missing command-range evidence', executionSettled: false } } })
  t.after(() => effects.close())
  await effects.pump(); await effects.drain()
  const state = await store.read()
  assert.equal(state.actions[settledId].status, 'failed')
  assert.equal(state.actions[settledId].termination.terminationId, 'term-settled')
  assert.equal(state.actions[uncertainId].status, 'uncertain')
  assert.match(state.actions[uncertainId].failure, /independent native session evidence/u)
})

test('another effects host cannot observe or replay an invocation while its OS action lock is held', async t => {
  const store = await fixture(t)
  let time = Date.now(); store.clock = () => time
  const release = Promise.withResolvers(), entered = Promise.withResolvers()
  let observations = 0, executions = 0
  const adapters = { notify_main: {
    execute: async action => { executions++; entered.resolve(); await release.promise; return { rootSessionId: 'root', messageId: action.id, persisted: true } },
    observe: async () => { observations++; throw new Error('A live invocation must not be replayed') },
  } }
  const first = new WorkflowEffects(store, adapters), second = new WorkflowEffects(store, adapters)
  t.after(async () => { release.resolve(); await first.close(); await second.close() })
  await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'notify_main', key: 'notice', input: { rootSessionId: 'root' } })
  await first.pump(); await entered.promise
  time += 30_000
  await second.pump(); await second.drain()
  assert.equal(observations, 0); assert.equal(executions, 1)
  release.resolve(); await first.drain()
  assert.equal(Object.values((await store.read()).actions)[0].status, 'succeeded')
})

test('a claimed but undispatched action can resume after a quiescent observation', async t => {
  const store = await fixture(t)
  let time = Date.now(); store.clock = () => time
  const { result: id } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'notify_main', key: 'notice', input: { rootSessionId: 'root' } })
  await store.transact({ type: 'action.claim', actionId: id, token: 'old-claim', hostId: 'old-host' })
  time += 30_000
  let executions = 0
  const effects = new WorkflowEffects(store, { notify_main: {
    observe: async (_action, context) => { assert.equal(context.executionQuiescent, true); return { pending: true, fact: 'not_started', proof: { notDispatched: true, executionQuiescent: true } } },
    execute: async action => { executions++; return { rootSessionId: 'root', messageId: action.id, persisted: true } },
  } })
  t.after(() => effects.close())
  await effects.pump(); await effects.drain()
  await effects.pump(); await effects.drain()
  assert.equal(executions, 1)
  assert.equal((await store.read()).actions[id].status, 'succeeded')
})

test('cancelling a live persisted action reports one terminal cancellation after its stop receipt', async t => {
  const store = await fixture(t)
  const entered = Promise.withResolvers()
  const delivered = [], errors = []
  const { result: actionId } = await store.transact({
    type: 'action.enqueue', workflowId: 'wf', kind: 'consult_owner', key: 'live-operation',
    input: { command: 'wait for cancellation' },
  }, { onError: error => errors.push(error) })
  const effects = new WorkflowEffects(store, {
    consult_owner: { execute: async (_action, { signal }) => {
      entered.resolve()
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    } },
    stop_execution: { execute: async action => ({
      targetActionId: action.input.targetActionId,
      executionSettled: true,
      terminationId: `settled:${action.input.targetActionId}`,
    }) },
    notify_main: { execute: async action => {
      delivered.push(action.input)
      return { rootSessionId: 'root', messageId: action.id, persisted: true }
    } },
  })
  t.after(() => effects.close())

  await effects.pump(); await entered.promise
  await store.transact({ type: 'workflow.cancel', workflowId: 'wf' })
  await effects.pump(); await effects.drain()
  await effects.pump(); await effects.drain()

  const state = await store.read()
  assert.equal(state.actions[actionId].status, 'cancelled')
  assert.equal(delivered.some(input => input.reason === 'execution_failure'), false)
  assert.equal(errors.length, 0)
  const terminal = delivered.filter(input => input.reason === 'workflow_terminal')
  assert.equal(terminal.length, 1)
  assert.deepEqual(terminal[0].detail, {
    contract: 'DSH_WORKFLOW_TERMINAL_NOTICE_V1',
    workflowId: 'wf',
    status: 'cancelled',
    terminal: true,
    revision: terminal[0].detail.revision,
    updatedAt: terminal[0].detail.updatedAt,
    planVersion: 0,
    counts: { totalTasks: 0, completedTasks: 0, failedTasks: 0, pendingTasks: 0, runningTasks: 0 },
    attention: [],
    recovery: { used: 0, limit: 12, baseLimit: 12, authorization: null, issues: [] },
    failure: null,
    outcome: { kind: 'cancellation', result: { settled: true } },
  })
})

test('a persisted governance stop owns an arbitrary adapter interruption before the local controller aborts', async t => {
  const store = await fixture(t)
  const plan = ownerPlan()
  await store.transact({ type: 'plan.activate', workflowId: 'wf', parentVersion: 0, plan,
    authorization: { scope: 'implementation', sourceId: 'fixture' }, sources: { snapshotDigest: 'snapshot' },
    review: { status: 'passed', planDigest: kernelDigest(plan), evidenceRef: '/review' } })
  const entered = Promise.withResolvers(), interrupted = Promise.withResolvers()
  const delivered = [], errors = []
  const effects = new WorkflowEffects(store, {
    execute_owner: { execute: async (action, { started }) => {
      await started({ handleId: 'owner-handle', sessionId: 'owner-session' })
      entered.resolve(action)
      return interrupted.promise
    } },
    stop_execution: { execute: async action => ({
      attemptId: action.input.attemptId,
      authority: action.input.authority,
      executionSettled: true,
      sourceWritesClosed: true,
      terminationId: `settled:${action.input.attemptId}`,
    }) },
    notify_main: { execute: async action => {
      delivered.push(action.input)
      return { rootSessionId: 'root', messageId: action.id, persisted: true }
    } },
  }, { onError: error => errors.push(error) })
  t.after(() => effects.close())

  await effects.pump()
  const claimed = await entered.promise
  const beforeStop = await store.read()
  const attempt = beforeStop.workflows.wf.attempts[claimed.attemptId]
  await store.transact({ type: 'attempt.stop', workflowId: 'wf', attemptId: attempt.id,
    reason: 'public_owner_review_required' })
  const persistedStop = await store.read()
  assert.equal(persistedStop.actions[claimed.id].stopRequested, true)
  assert.equal(persistedStop.workflows.wf.attempts[attempt.id].phase, 'stopping')
  assert.ok(Object.values(persistedStop.actions).some(action => action.kind === 'stop_execution'
    && action.input.attemptId === attempt.id && action.input.reason === 'public_owner_review_required'))

  interrupted.reject(new Error('Session Action authority expired'))
  await effects.drain()
  let state = await store.read()
  assert.equal(state.actions[claimed.id].failure, undefined)
  assert.equal(Object.values(state.actions).some(action => action.kind === 'notify_main'
    && action.input.reason === 'execution_failure'), false)
  assert.equal(errors.length, 0)

  await effects.pump(); await effects.drain()
  await effects.pump(); await effects.drain()
  state = await store.read()
  assert.equal(state.actions[claimed.id].status, 'cancelled')
  assert.equal(state.workflows.wf.attempts[attempt.id].phase, 'failed')
  assert.equal(state.workflows.wf.attempts[attempt.id].failure, 'public_owner_review_required')
  assert.equal(state.workflows.wf.attempts[attempt.id].termination.executionSettled, true)
  assert.equal(delivered.some(input => input.reason === 'execution_failure'), false)
})

test('the same arbitrary adapter error without a persisted stop remains a technical failure', async t => {
  const store = await fixture(t)
  const error = new Error('Session Action authority expired')
  const delivered = [], errors = []
  const { result: actionId } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'consult_owner',
    key: 'uncontrolled-authority-error', input: { command: 'fail without a lifecycle stop' } })
  const effects = new WorkflowEffects(store, {
    consult_owner: { execute: async () => { throw error } },
    notify_main: { execute: async action => {
      delivered.push(action.input)
      return { rootSessionId: 'root', messageId: action.id, persisted: true }
    } },
  }, { onError: value => errors.push(value) })
  t.after(() => effects.close())

  await effects.pump(); await effects.drain()
  await effects.pump(); await effects.drain()
  const state = await store.read()
  assert.equal(state.actions[actionId].status, 'uncertain')
  assert.equal(state.actions[actionId].failure, error.message)
  assert.equal(delivered.filter(input => input.reason === 'execution_failure').length, 1)
  assert.deepEqual(errors, [error])
})

test('a stop adapter failure remains an observable exception and cannot confirm cancellation', async t => {
  const store = await fixture(t)
  const entered = Promise.withResolvers(), errors = [], delivered = []
  await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'consult_owner', key: 'live-operation',
    input: { command: 'wait for cancellation' } })
  const effects = new WorkflowEffects(store, {
    consult_owner: { execute: async (_action, { signal }) => {
      entered.resolve()
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    } },
    stop_execution: { execute: async () => { throw new Error('stop transport failed') } },
    notify_main: { execute: async action => {
      delivered.push(action.input)
      return { rootSessionId: 'root', messageId: action.id, persisted: true }
    } },
  }, { onError: error => errors.push(error) })
  t.after(() => effects.close())

  await effects.pump(); await entered.promise
  await store.transact({ type: 'workflow.cancel', workflowId: 'wf' })
  await effects.pump(); await effects.drain()

  const state = await store.read()
  const stop = Object.values(state.actions).find(action => action.kind === 'stop_execution')
  assert.equal(stop.status, 'uncertain')
  assert.equal(stop.failure, 'stop transport failed')
  assert.equal((await store.readView('wf')).status, 'stopping')
  assert.equal(delivered.length, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /stop transport failed/)
})

for (const unrelated of [false, true]) test(`host shutdown preserves uncertain work and ${unrelated ? 'reports a distinct cleanup failure' : 'does not report its own cancellation as an execution error'}`, async t => {
  const store = await fixture(t), entered = Promise.withResolvers(), errors = []
  const { result: id } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'notify_main', key: 'shutdown', input: { rootSessionId: 'root' } })
  const effects = new WorkflowEffects(store, { notify_main: { execute: async (_action, { signal }) => {
    entered.resolve()
    await new Promise((_, reject) => signal.addEventListener('abort', () => reject(unrelated ? new Error('notification cleanup failed') : signal.reason), { once: true }))
  } } }, { onError: error => errors.push(error) })
  await effects.pump(); await entered.promise; await effects.close()
  const action = (await store.read()).actions[id]
  assert.equal(action.status, 'uncertain')
  assert.ok(action.nextWakeAt)
  assert.equal(errors.length, unrelated ? 1 : 0)
  if (unrelated) assert.match(errors[0].message, /cleanup failed/)
})

test('retirement winning between due snapshot and claim does not fail the runner or invoke an adapter', async t => {
  const store = await fixture(t)
  await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'notify_main', input: { rootSessionId: 'root', reason: 'fixture' }, key: 'race' })
  const transact = store.transact.bind(store)
  store.transact = event => event.type === 'action.claim'
    ? Promise.reject(Object.assign(new Error('Retired attempt action cannot be executed or observed'), { code: 'RETIRED_ATTEMPT_ACTION' }))
    : transact(event)
  const effects = new WorkflowEffects(store, { notify_main: { execute: () => assert.fail('the lost claim must not invoke effects') } })
  await effects.pump()
  assert.equal(effects.active.size, 0)
})

test('retirement committed after a claim fences the adapter when its execution lock is acquired', async t => {
  const store = await fixture(t)
  const read = store.read.bind(store)
  store.read = async () => {
    const state = await read()
    state.workflows.wf.attempts.retired = { sourceAuthorityRetirement: { scope: 'project_write_authority' } }
    return state
  }
  const effects = new WorkflowEffects(store, {})
  await effects.run({ id: 'claimed-before-retirement', workflowId: 'wf', attemptId: 'retired', kind: 'verify_candidate' },
    'observe', 'claim', { observe: () => assert.fail('retired adapter must not prepare files') }, new AbortController().signal)
})

test('a stop committed after claim prevents adapter reentry under the action lock', async t => {
  const store = await fixture(t)
  const { result: id } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'consult_owner', key: 'stop-race', input: {} })
  const { result: claimed } = await store.transact({ type: 'action.claim', actionId: id, token: 'claim', hostId: 'old-host' })
  await store.transact({ type: 'workflow.cancel', workflowId: 'wf' })
  const effects = new WorkflowEffects(store, {})
  let entered = 0
  await effects.run(claimed, 'execute', 'claim', { execute: () => { entered++; throw new Error('revoked adapter entered') } }, new AbortController().signal)
  assert.equal(entered, 0)
})

test('stopped work does not keep the runner on its expired observation clock', async t => {
  const store = await fixture(t)
  let time = store.clock(); store.clock = () => time
  const { result: id } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'consult_owner', key: 'stopped-clock', input: {} })
  await store.transact({ type: 'action.claim', actionId: id, token: 'claim', hostId: 'old-host' })
  await store.transact({ type: 'workflow.cancel', workflowId: 'wf' })
  time += 1
  const state = await store.read(), stopped = state.actions[id]
  assert.equal(stopped.stopRequested, true)
  // Other work has a later wake; only the revoked action retains stale clocks.
  for (const action of Object.values(state.actions)) if (action.id !== id) action.nextWakeAt = time + 5000
  const isolatedStore = { read: async () => state, clock: () => time }
  const runner = new WorkflowRunner(isolatedStore, { pump: async () => {}, active: new Map() })
  await runner.check()
  assert.equal(runner.health.status, 'running')
  assert.ok(runner.health.nextWakeAt > time)
})

test('an expired notice deadline does not turn a deferred delivery into a timer busy loop', async t => {
  const store = await fixture(t)
  const { result: id } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'notify_main',
    key: 'offline-notice', input: { rootSessionId: 'root', reason: 'fixture' } })
  const state = await store.read()
  const time = state.actions[id].deadlineAt + 1
  state.actions[id].nextWakeAt = time + 300_000
  const runner = new WorkflowRunner({ read: async () => state, clock: () => time },
    { pump: async () => {}, active: new Map() }, { maxIntervalMs: 30_000 })
  await runner.check()
  assert.equal(runner.health.status, 'running')
  assert.equal(runner.health.nextWakeAt, time + 30_000)
})

test('observing an offline native root schedules the longer delivery recheck', async t => {
  const store = await fixture(t)
  let time = store.clock(); store.clock = () => time
  const { result: id } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'notify_main',
    key: 'offline-observation', input: { rootSessionId: 'root', reason: 'fixture' } })
  await store.transact({ type: 'action.claim', actionId: id, token: 'previous', hostId: 'previous-host' })
  time += 5_000
  const effects = new WorkflowEffects(store, { notify_main: {
    observe: async () => ({ deferred: true, reason: 'root_session_offline' }),
  } })
  t.after(() => effects.close())
  await effects.pump(); await effects.drain()
  const action = (await store.read()).actions[id]
  assert.equal(action.status, 'running')
  assert.equal(action.waitingReason, 'root_session_offline')
  assert.equal(action.nextWakeAt, time + 300_000)
})

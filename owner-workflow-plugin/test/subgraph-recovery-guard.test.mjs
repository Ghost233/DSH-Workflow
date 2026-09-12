import assert from 'node:assert/strict'
import test from 'node:test'
import { expandCompositeTask } from '../src/model.mjs'
import { requestSubgraphDefinition } from '../index.js'
import { createRecoverySessionFixture, readRecoverySessionState, mutateRecoverySessionState } from './fixtures/recovery-session-fixture.mjs'

const proposal = { children: [
  { id: 'T1-work', role: 'work', ownerId: 'api', title: 'Local work', dependsOn: [], write: ['src/api/repair.mjs'], verify: ['unit'], done: ['Local repair completed'] },
  { id: 'T1-review', role: 'review', ownerId: 'api', title: 'Local review', dependsOn: ['T1-work'], write: [], verify: ['unit'], done: ['Repair reviewed'] },
], entry: ['T1-work'], exit: ['T1-review'] }

const report = status => ({ contract: 'DSH_OWNER_RESULT_V1', status,
  summary: status === 'completed' ? 'Original task completed without expansion.' : 'Original implementation still fails its local requirement.',
  changes: [], tests: [], handoffs: [], memory_updates: [] })

for (const paid of [false, true]) test(`T15 ${paid ? 'paid' : 'initial free'} real Owner subgraph rejection preserves source and permits a normal ${paid ? 'failure' : 'completion'}`, { timeout: 30_000 }, async t => {
  let f, before, checked = false
  f = await createRecoverySessionFixture(t, { executable: true, modelScript: m => [
    () => m.toolCallResponse('guarded-subgraph', 'request_subgraph', {
      workflow_id: f.workflowId, task_id: 'T1', proposal,
    }),
    m.toolCallResponse('original-result', 'owner_submit', { report: report(paid ? 'failed' : 'completed') }),
    m.textResponse('reported'),
  ] })
  f.ctx.tools.register(requestSubgraphDefinition(f.runtime))
  assert.ok(expandCompositeTask((await readRecoverySessionState(f)).plan, 'T1', proposal), 'proposal itself is valid')
  if (!paid) await mutateRecoverySessionState(f, state => { delete state.ownerRuns['T1:api'] })
  const stream = f.adapter.stream.bind(f.adapter)
  let calls = 0
  f.adapter.stream = async function* (options) {
    const index = calls++
    if (index === 0) before = await readRecoverySessionState(f)
    if (index === 1) {
      checked = true
      assert.deepEqual(await readRecoverySessionState(f), before, 'rejected tool must not write workflow state or budget')
    }
    yield* stream(options)
  }
  if (paid) await assert.rejects(f.runtime.recoverOwner(f.admissionAgent, f.workflowId, 'T1', 'api'), { name: 'OwnerReportedError' })
  else await f.runtime.runExternalOwner(f.admissionAgent, f.workflowId, 'T1', 'api', undefined, { deferFinish: true })
  assert.equal(checked, true)
  const state = await readRecoverySessionState(f)
  assert.equal(state.planDigest, before.planDigest)
  assert.equal(state.subgraphRequests, undefined)
  const run = state.ownerRuns['T1:api']
  assert.equal(run.sessionId, before.ownerRuns['T1:api'].sessionId)
  assert.equal(run.attempt, before.ownerRuns['T1:api'].attempt)
  const events = (await f.readFrom(run.sessionId)).events
  const rejection = events.find(event => event.type === 'tool/result' && event.data.message?.source?.callId === 'guarded-subgraph')
  assert.equal(rejection.data.message.content[0].isError, true)
  assert.match(JSON.stringify(rejection.data), /尚不支持运行中的子图版本激活/)
  assert.ok(events.some(event => event.type === 'turn/end'))
  if (paid) {
    assert.equal(state.recoveryAdmission.budget.totalUsed, 1)
    assert.equal(run.recoverySession.phase, 'settled_failed')
    assert.ok(run.recoveryContinuation)
  } else {
    assert.equal(run.status, 'awaiting_finish')
    assert.ok(run.result.commitSha)
    assert.equal(state.recoveryAdmission, undefined)
  }
})

for (const legacy of [false, true]) test(`T15 ${legacy ? 'legacy' : 'protected'} real completion rejects subgraph both during and after accepted submission`, { timeout: 30_000 }, async t => {
  let f, checkedDuring = false, checkedAfter = false
  f = await createRecoverySessionFixture(t, { executable: true, modelScript: m => [
    m.toolCallResponse('ordinary-completed', 'owner_submit', { report: report('completed') }),
    () => m.toolCallResponse('late-subgraph', 'request_subgraph', { workflow_id: f.workflowId, task_id: 'T1', proposal }),
    m.textResponse('reported'),
  ] })
  f.ctx.tools.register(requestSubgraphDefinition(f.runtime))
  assert.ok(expandCompositeTask((await readRecoverySessionState(f)).plan, 'T1', proposal), 'proposal itself is valid')
  await mutateRecoverySessionState(f, state => {
    delete state.ownerRuns['T1:api']
    if (legacy) delete state.recoveryAdmissionConfig
  })
  const inspect = f.runtime.inspectOwnerAttempt.bind(f.runtime)
  f.runtime.inspectOwnerAttempt = async (...args) => {
    if (!checkedDuring) {
      checkedDuring = true
      const active = [...f.runtime.activeOwners.values()].find(item => item.workflowId === f.workflowId)
      assert.equal(active.submitting, true)
      const before = await readRecoverySessionState(f)
      await assert.rejects(requestSubgraphDefinition(f.runtime).execute({ workflow_id: f.workflowId, task_id: 'T1', proposal },
        { agent: { id: active.sessionId } }), /已进入提交关卡或已有结果/)
      assert.deepEqual(await readRecoverySessionState(f), before)
    }
    return inspect(...args)
  }
  const stream = f.adapter.stream.bind(f.adapter)
  let calls = 0, beforeLate
  f.adapter.stream = async function* (options) {
    const index = calls++
    if (index === 1) {
      const active = [...f.runtime.activeOwners.values()].find(item => item.workflowId === f.workflowId)
      assert.ok(active.submission)
      beforeLate = await readRecoverySessionState(f)
    }
    if (index === 2) {
      checkedAfter = true
      assert.deepEqual(await readRecoverySessionState(f), beforeLate)
    }
    yield* stream(options)
  }
  await f.runtime.runExternalOwner(f.admissionAgent, f.workflowId, 'T1', 'api', undefined, { deferFinish: true })
  assert.equal(checkedDuring, true)
  assert.equal(checkedAfter, true)
  const state = await readRecoverySessionState(f)
  assert.equal(state.subgraphRequests, undefined)
  const run = state.ownerRuns['T1:api']
  assert.equal(run.status, 'awaiting_finish')
  assert.ok(run.result.commitSha)
  const events = (await f.readFrom(run.sessionId)).events
  const rejection = events.find(event => event.type === 'tool/result' && event.data.message?.source?.callId === 'late-subgraph')
  assert.equal(rejection.data.message.content[0].isError, true)
  assert.match(JSON.stringify(rejection.data), /已进入提交关卡或已有结果/)
})

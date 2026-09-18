import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { kernelNativeHost } from './fixtures/kernel-native-host.mjs'
import { KernelRuntime } from '../src/kernel-runtime.mjs'
import { kernelToolDefinitions } from '../src/kernel-tools.mjs'

for (const choice of ['allow', 'reject', 'cancel']) test(`native finite recovery permission ${choice} preserves history and never dispatches a Planner`, { timeout: 25_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-recovery-'))
  let runtime, questions = 0
  const errors = []
  const host = await kernelNativeHost(root, { executable: true, model: async function *() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Decision received; remain paused.' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } })
  t.after(async () => { await runtime?.dispose(); await host.close(); await rm(root, { recursive: true, force: true }) })
  const { default: UserQuestions } = await import('../../deepseek-harness/packages/interaction/user-questions/lib/index.js')
  await host.ctx.plugin(UserQuestions)
  host.ctx.on('user-questions/request', async request => {
    questions++
    assert.equal(request.agent, host.parent.agent)
    assert.match(request.questions[0].detail, /恢复总上限.*1 次/u)
    if (choice === 'cancel') throw Object.assign(new Error('human cancelled'), { name: 'UserQuestionError', code: 'ASK_CANCELLED' })
    return { answers: [{ id: request.questions[0].id, selected: [choice === 'allow' ? '允许这轮恢复' : '保持暂停'] }] }
  })
  runtime = new KernelRuntime(host.ctx, { catalogRoot: root, onError: error => errors.push(String(error)) }); await runtime.ready
  const definitions = kernelToolDefinitions(runtime)
  for (const definition of definitions) host.parent.agent.ctx.tools.register(definition)
  const signal = new AbortController().signal
  await runtime.store.transact({ type: 'workflow.create', id: 'wf1', root, rootSessionId: host.parent.agent.id,
    request: 'One diagnosed recovery', baseCommit: 'base' }, { signal })
  const tool = definitions.find(item => item.name === 'workflow_authorize_recovery')
  await tool.execute({ workflow_id: 'wf1', attempts: 1, reason: 'Changed the actual repair boundary; try once' },
    { agent: host.parent.agent, callId: 'native-one-recovery', signal })
  let state, decision
  const end = Date.now() + 12_000
  while (Date.now() < end) {
    state = await runtime.store.read()
    decision = Object.values(state.workflows.wf1.decisions)[0]
    if (decision?.status === 'answered' || errors.length) break
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.deepEqual(errors, [])
  assert.equal(decision.status, 'answered')
  assert.equal(questions, 1)
  assert.equal(state.workflows.wf1.recoveryUsed, 0)
  assert.equal(Object.values(state.actions).filter(action => action.kind === 'plan').length, 0)
  assert.equal(state.workflows.wf1.recoveryWindow?.limit, choice === 'allow' ? 1 : undefined)
  assert.ok(await readFile(decision.evidenceRef, 'utf8'), 'native answer evidence is persisted')
  // Tool replay reuses its decision instead of presenting or granting another window.
  await tool.execute({ workflow_id: 'wf1', attempts: 1, reason: 'Changed the actual repair boundary; try once' },
    { agent: host.parent.agent, callId: 'replayed-one-recovery', signal })
  const replay = await runtime.store.read()
  assert.equal(questions, 1)
  assert.equal(replay.workflows.wf1.recoveryAuthorizations?.length ?? 0, choice === 'allow' ? 1 : 0)
})

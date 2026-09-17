import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { kernelNativeHost } from './fixtures/kernel-native-host.mjs'
import { KernelRuntime } from '../src/kernel-runtime.mjs'
import { kernelToolDefinitions } from '../src/kernel-tools.mjs'
import { applyKernel } from '../src/kernel-plugin.mjs'
import { KERNEL_ORCHESTRATOR_GUIDANCE } from '../src/kernel-guidance.mjs'
import { normalizePlanV2 } from '../src/model.mjs'
import { kernelDigest } from '../src/workflow-engine.mjs'

test('a new root can discover and explicitly cancel a same-project blocker without taking over its execution', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-project-blocker-')))
  const host = await kernelNativeHost(root, { executable: true })
  const runtime = new KernelRuntime(host.ctx, { catalogRoot: root }); await runtime.ready
  runtime.runner.start = () => {}
  const other = await host.ctx.agents.create({ sessionId: 'new-project-root', meta: { cwd: root }, agentOptions: { provider: 'kernel-test', model: 'deterministic' } })
  const definitions = kernelToolDefinitions(runtime)
  const disposers = [host.parent.agent, other.agent].flatMap(agent => definitions.map(tool => agent.ctx.tools.register(tool)))
  t.after(async () => { disposers.toReversed().forEach(dispose => dispose()); await runtime.dispose(); await other.dispose(); await host.close(); await rm(root, { recursive: true, force: true }) })
  await runtime.store.transact({ type: 'workflow.create', id: 'old-workflow', root, rootSessionId: host.parent.agent.id, request: 'Old acceptance', baseCommit: 'base' })
  await mkdir(join(root, 'unrelated'))
  await runtime.store.transact({ type: 'workflow.create', id: 'unrelated-workflow', root: join(root, 'unrelated'), rootSessionId: 'unrelated-root', request: 'Private work', baseCommit: 'base' })
  const status = await runtime.status(other.agent)
  assert.deepEqual(status.workflows, [])
  assert.deepEqual(status.projectBlockers.map(item => item.workflowId), ['old-workflow'])
  assert.equal(status.projectBlockers[0].rootSessionId, host.parent.agent.id)
  await assert.rejects(runtime.workflowFor(other.agent, 'old-workflow'), /different root thread/)

  const { default: Questions } = await import('../../deepseek-harness/packages/interaction/user-questions/lib/index.js')
  await host.ctx.plugin(Questions)
  let approve = false, questions = 0
  host.ctx.on('user-questions/request', request => {
    questions++
    assert.equal(request.agent.id, other.agent.id)
    assert.match(request.questions[0].detail, /old-workflow/)
    return { answers: [{ id: request.questions[0].id, selected: [approve ? '取消该旧工作流' : '保留旧工作流'], custom: '' }] }
  })
  const cancel = definitions.find(tool => tool.name === 'workflow_cancel')
  const invoke = workflowId => cancel.execute({ workflow_id: workflowId }, { agent: other.agent, callId: `cancel-${questions}`, signal: new AbortController().signal })
  await assert.rejects(invoke('unrelated-workflow'), /different project/)
  assert.equal(questions, 0)
  const before = (await runtime.store.read()).workflows['old-workflow']
  await assert.rejects(invoke('old-workflow'), /not approved/)
  assert.deepEqual((await runtime.store.read()).workflows['old-workflow'], before)
  approve = true
  const result = await invoke('old-workflow')
  assert.equal(result.status, 'cancelled')
  const after = (await runtime.store.read()).workflows['old-workflow']
  assert.equal(after.rootSessionId, before.rootSessionId)
  assert.equal(after.recoveryUsed, before.recoveryUsed)
  assert.deepEqual(after.attempts, before.attempts)
  assert.deepEqual((await runtime.status(other.agent)).projectBlockers, [])
  assert.equal(questions, 2)
})

const retryPlan = normalizePlanV2({ contract: 'DSH_PLAN_V2', registryDigest: 'a'.repeat(64), summary: 'Retry candidate verification',
  owners: [{ id: 'api', name: 'api', description: 'API owner', scope: ['src/api/**'], exclude: [] }],
  verifications: [{ id: 'unit', run: ['node', '--test'] }],
  tasks: [{ id: 'T1', title: 'T1', role: 'work', ownerId: 'api', dependsOn: [], resources: [], write: ['src/api/**'], verify: ['unit'], done: ['unit passes'] }] })

test('Owner root guards use native tool scope and do not capture unrelated roots', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-root-scope-'))
  const host = await kernelNativeHost(root, { executable: true })
  const runtime = new KernelRuntime(host.ctx, { catalogRoot: root }); await runtime.ready
  const other = await host.ctx.agents.create({ sessionId: 'ordinary-root', meta: { cwd: root }, agentOptions: { provider: 'kernel-test', model: 'deterministic' } })
  t.after(async () => { await runtime.dispose(); await other.dispose(); await host.close(); await rm(root, { recursive: true, force: true }) })
  for (const definition of kernelToolDefinitions(runtime)) host.parent.agent.ctx.tools.register(definition)
  assert.equal(runtime.modeEnabledForActor({ agent: host.parent.agent }), true)
  assert.equal(runtime.modeEnabledForActor({ agent: other.agent }), false)
  assert.throws(() => runtime.rootAgent(other.agent), /Owner preset/)
  assert.equal(runtime.checkToolExecution({ agent: other.agent, name: 'bash' }), undefined)
  assert.equal(runtime.checkToolExecution({ agent: host.parent.agent, name: 'run_code' }), undefined)
  assert.equal(runtime.checkToolExecution({ agent: host.parent.agent, name: 'workflow_status' }), undefined)
  assert.match(runtime.checkToolExecution({ agent: host.parent.agent, name: 'unknown_external_mutator' }), /controlled/)
  assert.match(runtime.checkToolExecution({ agent: host.parent.agent, name: 'write', arguments: { file_path: 'CLAUDE.md' } }), /planning documents/)
})

test('native workflow_retry_action keeps a settled technical candidate retry bound and returns a lossless view', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-bound-candidate-retry-'))
  const host = await kernelNativeHost(root, { executable: true })
  const runtime = new KernelRuntime(host.ctx, { catalogRoot: root, registryVerifier: async () => {} }); await runtime.ready
  runtime.runner.start = () => {}
  const definitions = kernelToolDefinitions(runtime)
  const disposers = definitions.map(definition => host.parent.agent.ctx.tools.register(definition))
  t.after(async () => { for (const dispose of disposers.toReversed()) dispose(); await runtime.dispose(); await host.close(); await rm(root, { recursive: true, force: true }) })
  const signal = new AbortController().signal
  const transact = event => runtime.store.transact(event, { signal })
  await transact({ type: 'workflow.create', id: 'wf1', root, rootSessionId: host.parent.agent.id, request: 'retry verification', baseCommit: 'base' })
  await transact({ type: 'plan.activate', workflowId: 'wf1', parentVersion: 0, plan: retryPlan,
    authorization: { scope: 'implementation', sourceId: 'fixture' }, sources: { snapshotDigest: 'fixture' },
    review: { status: 'passed', planDigest: kernelDigest(retryPlan), evidenceRef: '/review' } })
  await transact({ type: 'drive' })
  let state = await runtime.store.read()
  const owner = Object.values(state.actions).find(action => action.kind === 'execute_owner')
  await transact({ type: 'action.claim', actionId: owner.id, token: 'owner', hostId: 'fixture' })
  await transact({ type: 'action.started', actionId: owner.id, token: 'owner', evidence: { handleId: 'owner-handle', sessionId: 'owner-session' } })
  state = await runtime.store.read()
  const attempt = state.workflows.wf1.attempts[owner.attemptId]
  await transact({ type: 'owner.submit', workflowId: 'wf1', attemptId: attempt.id, authority: attempt.authority,
    report: { status: 'completed', summary: 'Candidate ready' }, manifestDigest: 'manifest', artifact: '/submission' })
  await transact({ type: 'action.result', actionId: owner.id, token: 'owner',
    result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  state = await runtime.store.read()
  const seal = Object.values(state.actions).find(action => action.kind === 'seal_candidate')
  await transact({ type: 'action.claim', actionId: seal.id, token: 'seal', hostId: 'fixture' })
  await transact({ type: 'action.result', actionId: seal.id, token: 'seal',
    result: { artifact: '/candidate', commitSha: 'content', authority: attempt.authority } })
  state = await runtime.store.read()
  const failed = Object.values(state.actions).find(action => action.kind === 'verify_candidate')
  await transact({ type: 'action.claim', actionId: failed.id, token: 'verify', hostId: 'fixture' })
  await transact({ type: 'action.result', actionId: failed.id, token: 'verify', result: { passed: false, commitSha: 'content', executionSettled: true,
    results: [{ verificationId: 'unit', status: 'execution_error', passed: false, commitSha: 'content', commandTermination: { managedRangeStopped: true } }] } })

  const retry = definitions.find(tool => tool.name === 'workflow_retry_action')
  const result = await retry.execute({ workflow_id: 'wf1', action_id: failed.id, reason: 'Dependency resource recovered' },
    { agent: host.parent.agent, callId: 'native-candidate-retry', signal })
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result)
  state = await runtime.store.read()
  const retried = Object.values(state.actions).find(action => action.retryOf === failed.id)
  assert.equal(retried.kind, 'verify_candidate')
  assert.equal(retried.attemptId, attempt.id)
  assert.deepEqual(retried.input.candidate, failed.input.candidate)
  assert.equal(state.workflows.wf1.attempts[attempt.id].phase, 'verifying')
})

for (const kind of ['plan', 'review_plan']) test(`${kind} retry verifies its admitted planning identity instead of the obsolete active Registry`, async () => {
  const action = { id: 'planning-action', kind, input: { registryDigest: 'approved' } }
  let bound = 0, requests = 0
  const runtime = {
    workflowFor: async () => ({ id: 'wf1', plan: { registryDigest: 'obsolete' } }),
    verifyRegistry: async () => { throw new Error('obsolete active registry must not be consulted') },
    planning: { boundInputs: async value => { assert.equal(value, action); bound++ } },
    store: { read: async () => ({ actions: { [action.id]: action } }), transact: async event => {
      assert.equal(event.type, 'action.retry'); assert.equal(event.actionId, action.id); requests++
    } }, runner: { start() {} }, status: async () => ({ workflowId: 'wf1' }),
  }
  const invoke = () => KernelRuntime.prototype.retryAction.call(runtime, { id: 'root' },
    { workflow_id: 'wf1', action_id: action.id, reason: 'Fixed transport' }, { callId: 'retry', signal: new AbortController().signal })
  await invoke()
  assert.equal(bound, 1); assert.equal(requests, 1)
  runtime.planning.boundInputs = async () => { throw new Error('admission changed') }
  await assert.rejects(invoke(), /admission changed/)
  assert.equal(requests, 1, 'invalid immutable inputs cannot consume a retry')
})

test('two native Owner preset scopes share one catalog executor and dispose independently', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-root-host-'))
  const host = await kernelNativeHost(root, { executable: true })
  const { default: SkillRegistry } = await import('../../deepseek-harness/packages/skill/skill/lib/index.js')
  await host.ctx.plugin(SkillRegistry)
  const other = await host.ctx.agents.create({ sessionId: 'second-owner-root', meta: { cwd: root }, agentOptions: { provider: 'kernel-test', model: 'deterministic' } })
  t.after(async () => { await other.dispose(); await host.close(); await rm(root, { recursive: true, force: true }) })
  const first = await applyKernel(host.parent.agent.ctx, { catalogRoot: root })
  const second = await applyKernel(other.agent.ctx, { catalogRoot: root })
  assert.equal(first, second)
  assert.equal((await host.ctx.skills.get('owner-workflow', { scope: host.parent.agent })).content, KERNEL_ORCHESTRATOR_GUIDANCE)
  const definitions = kernelToolDefinitions(first)
  const toolNames = new Set(definitions.map(tool => tool.name))
  const parameterNames = new Set(definitions.flatMap(tool => Object.keys(tool.parameters.properties)))
  for (const name of KERNEL_ORCHESTRATOR_GUIDANCE.match(/\b(?:workflow|operation)_[a-z_]+\b/g) ?? []) assert.ok(toolNames.has(name) || parameterNames.has(name), `Guidance names an undeclared control tool or parameter: ${name}`)
  assert.equal(first.modeEnabledForActor({ agent: host.parent.agent }), true)
  assert.equal(first.modeEnabledForActor({ agent: other.agent }), true)
  await host.parent.dispose()
  second.host.assertHeld()
  assert.equal((await host.ctx.skills.get('owner-workflow', { scope: other.agent })).content, KERNEL_ORCHESTRATOR_GUIDANCE)
  assert.deepEqual((await second.status(other.agent)).workflows, [])
  await other.dispose()
  assert.throws(second.host.assertHeld, /ended/)
})

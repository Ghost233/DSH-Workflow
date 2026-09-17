import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, realpath, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { kernelNativeHost } from './fixtures/kernel-native-host.mjs'
import { WorkflowStore } from '../src/workflow-store.mjs'
import { NativeSessionEffects } from '../src/native-session-effects.mjs'
import { NativeCommandEffects } from '../src/native-command-effects.mjs'
import { NativePlanningEffects } from '../src/native-planning-effects.mjs'
import { WorkflowEffects } from '../src/workflow-effects.mjs'
import { SubmissionPipeline } from '../src/submission-pipeline.mjs'
import { normalizePlanV2 } from '../src/model.mjs'
import { kernelDigest } from '../src/workflow-engine.mjs'
import { git } from '../src/git.mjs'
import { readSessionEvents } from '../src/dsh-execution.mjs'
import { publishArtifact, readArtifact } from '../src/effect-artifacts.mjs'
import { bindOwnerExecutionFeedback, normalizeOwnerExecutionFeedback, ownerResourceObservation } from '../src/owner-feedback.mjs'

test('Owner feedback schema distinguishes a frozen runner observation from an explicit public contract gap', () => {
  const task = { id: 'api', verify: ['typecheck'] }
  assert.deepEqual(bindOwnerExecutionFeedback({ kind: 'runner_resource_observation', issue: 'typecheck-unavailable',
    detail: 'The Owner worktree has no installed compiler.', verificationId: 'typecheck', observedExitCode: 127 }, task), {
    kind: 'runner_resource_observation', issue: 'typecheck-unavailable',
    detail: 'The Owner worktree has no installed compiler.', verificationId: 'typecheck', observedExitCode: 127,
  })
  assert.throws(() => bindOwnerExecutionFeedback({ kind: 'runner_resource_observation', issue: 'lint-unavailable',
    detail: 'The Owner worktree has no linter.', verificationId: 'lint', observedExitCode: 127 }, task), /frozen task: typecheck/)
  assert.deepEqual(normalizeOwnerExecutionFeedback({ kind: 'public_contract_gap', sourceId: 'runner-gap',
    issue: 'The consumer cannot register.', detail: 'The producer contract is absent.', contractId: 'acceptance-runner' }), {
    kind: 'public_contract_gap', sourceId: 'runner-gap', issue: 'The consumer cannot register.',
    detail: 'The producer contract is absent.', contractId: 'acceptance-runner',
  })
  assert.throws(() => normalizeOwnerExecutionFeedback({ issue: 'ambiguous', detail: 'No explicit class.' }), /kind is unsupported/)
  assert.throws(() => normalizeOwnerExecutionFeedback({ taskId: 'api', kind: 'verification_environment',
    detail: 'Legacy reports are migration input only.' }), /unsupported fields|kind is unsupported/)
  assert.throws(() => normalizeOwnerExecutionFeedback({ taskId: 'api', issueType: 'verification_blocked',
    detail: 'Legacy reports are migration input only.' }), /unsupported fields|kind is unsupported/)
  const legacy = { taskId: 'api', kind: 'verification_environment', detail: 'Legacy environment report.' }
  const definitions = [{ id: 'typecheck', run: ['npm', 'run', 'typecheck'] }, { id: 'lint', run: ['npm', 'run', 'lint'] }]
  assert.equal(ownerResourceObservation(legacy, { id: 'api', verify: ['typecheck', 'lint'] }, definitions), null,
    'a legacy report cannot guess among multiple frozen verifications')
  assert.equal(ownerResourceObservation(legacy, { id: 'other', verify: ['typecheck'] }, definitions), null,
    'a legacy report cannot cross its task binding')
  const legacyBlocked = { taskId: 'api', issueType: 'verification_blocked', detail: 'Free-form legacy detail is not classification input.' }
  assert.equal(ownerResourceObservation(legacyBlocked, { id: 'api', verify: ['typecheck', 'lint'] }, definitions), null,
    'a blocked legacy report cannot guess among multiple frozen verifications')
  assert.equal(ownerResourceObservation(legacyBlocked, { id: 'other', verify: ['typecheck'] }, definitions), null,
    'a blocked legacy report cannot cross its task binding')
  assert.equal(ownerResourceObservation({ ...legacyBlocked, extra: true }, { id: 'api', verify: ['typecheck'] }, definitions), null,
    'a blocked legacy report must retain its exact historical shape')
  assert.equal(ownerResourceObservation({ ...legacyBlocked, issueType: 'verification_failed' },
    { id: 'api', verify: ['typecheck'] }, definitions), null, 'a different legacy enum is not a resource observation')
  assert.deepEqual(ownerResourceObservation(legacyBlocked, { id: 'api', verify: ['typecheck'] }, definitions), {
    kind: 'runner_resource_observation', verificationId: 'typecheck', observedExitCode: 127,
    definition: definitions[0], migration: 'legacy_verification_blocked_v1',
  })
})

async function *model() {
  const block = { type: 'tool-call', id: 'submit-call', name: 'owner_submit', arguments: JSON.stringify({ report: { status: 'completed', summary: 'No source changes needed in this transport fixture' } }) }
  yield { type: 'block-start', index: 0, blockType: 'tool-call', id: block.id, name: block.name }
  yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments }
  yield { type: 'block-end', index: 0, block }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}
const titles = {
  normal: 'native owner_submit ends the actual turn after durable acceptance without waiting for verification',
  preparation: 'Owner preparation interruption resumes the same worktree with one native dispatch',
  activation: 'a legacy preparation receipt without a persisted prompt resumes as not dispatched',
  'receipt-delay': 'a fast native model waits for the persisted dispatch receipt before submitting',
  'receipt-failure': 'failed dispatch receipt cancels waiting native tools without accepting a candidate',
  'tool-failure': 'a rejected owner_submit ends through the persisted stop path with its primary error',
  'natural-end': 'an Owner turn ending without tools settles through one persisted stop',
  'max-tokens': 'an Owner turn exhausting model output keeps its terminal reason through persisted stop',
}
for (const mode of Object.keys(titles)) test(titles[mode], { timeout: 30_000 }, async t => {
  const interruptPreparation = ['preparation', 'activation'].includes(mode)
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-owner-')))
  const project = join(root, 'project'); await mkdir(project)
  await git(project, ['init', '-q']); await mkdir(join(project, 'src')); await writeFile(join(project, 'src', 'a'), 'source')
  await git(project, ['add', '.']); await git(project, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'base'])
  let modelStep = 0
  const naturalEndModel = async function *() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'This turn is ending without a durable submission.' } }
    yield { type: 'finish', reason: { kind: mode === 'max-tokens' ? 'max-tokens' : 'stop' } }
  }
  const toolFailureModel = async function *() {
    if (modelStep++ === 0) { yield* model(); return }
    yield* naturalEndModel()
  }
  const host = await kernelNativeHost(project, { executable: true,
    model: mode === 'tool-failure' ? toolFailureModel : ['natural-end', 'max-tokens'].includes(mode) ? naturalEndModel : model })
  let time = Date.now()
  const store = new WorkflowStore(root, { clock: () => time }); await store.initialize()
  const commands = new NativeCommandEffects(host.ctx, { root: join(root, 'commands') })
  let sessions = new NativeSessionEffects(host.ctx, store, commands, { root: join(root, 'actions') })
  const pipeline = new SubmissionPipeline({ artifactsRoot: join(root, 'artifacts'), assertAuthority: (authority, options) => sessions.assertAuthority(authority, options) })
  sessions.pipeline = pipeline
  if (mode === 'tool-failure') pipeline.captureSubmission = async () => { throw new Error('无法读取 Owner Registry') }
  t.after(async () => { await commands.close(); await sessions.close(); await host.close(); await rm(root, { recursive: true, force: true }) })
  const plan = normalizePlanV2({ contract: 'DSH_PLAN_V2', registryDigest: 'a'.repeat(64), summary: 'Native transport fixture',
    owners: [{ id: 'api', name: 'API', description: 'API module', scope: ['src/**'], exclude: [] }],
    tasks: [{ id: 'T1', title: 'Inspect module', role: 'work', ownerId: 'api', write: ['src/**'], dependsOn: [], resources: [], verify: ['unit'], done: ['Module checked'] }],
    verifications: [{ id: 'unit', run: ['node', '--test'] }] })
  await store.transact({ type: 'workflow.create', id: 'wf', root: project, rootSessionId: host.parent.agent.id, request: 'fixture', baseCommit: await git(project, ['rev-parse', 'HEAD']) })
  await store.transact({ type: 'plan.activate', workflowId: 'wf', parentVersion: 0, plan, authorization: { scope: 'implementation', sourceId: 'fixture' }, sources: { snapshotDigest: 'fixture' }, review: { status: 'passed', evidenceRef: 'fixture', planDigest: kernelDigest(plan) } })
  await store.transact({ type: 'drive' })
  const action = Object.values((await store.read()).actions)[0]
  await store.transact({ type: 'action.claim', actionId: action.id, token: 'claim', hostId: 'fixture' })
  action.status = 'running'
  if (interruptPreparation) {
    const restore = pipeline.restoreCandidate.bind(pipeline)
    const activate = sessions.team.activate.bind(sessions.team)
    if (mode === 'preparation') pipeline.restoreCandidate = async () => { throw new Error('Interrupted after worktree preparation') }
    else sessions.team.activate = async () => { throw new Error('Interrupted during native activation') }
    await assert.rejects(sessions.execute(action, {}), mode === 'preparation'
      ? /Interrupted after worktree preparation/ : /Interrupted during native activation/)
    pipeline.restoreCandidate = restore
    sessions.team.activate = activate
    if (mode === 'activation') {
      const sessionId = `owner-${kernelDigest([action.id, 'owner']).slice(0, 40)}`
      await publishArtifact(join(root, 'actions', sessionId, 'dispatch.json'), {
        actionId: action.id, inputDigest: action.inputDigest, sessionId,
      })
    }
    await sessions.close()
    sessions = new NativeSessionEffects(host.ctx, store, commands, { root: join(root, 'actions'), pipeline })
    await store.transact({ type: 'action.failed', actionId: action.id, token: 'claim', reason: 'preparation interrupted' })
    time += 30_000
    await store.transact({ type: 'action.claim', actionId: action.id, mode: 'observe', token: 'observer', hostId: 'replacement' })
    const observation = await sessions.adapters().execute_owner.observe(action, { executionQuiescent: true })
    assert.equal(observation.fact, 'not_started')
    await store.transact({ type: 'action.observe', actionId: action.id, token: 'observer', fact: observation.fact, proof: observation.proof })
    await store.transact({ type: 'action.claim', actionId: action.id, token: 'claim', hostId: 'replacement' })
  }
  await assert.rejects(sessions.confirmSourceWritesClosed({ action }), /source write authority has not closed/)
  const execution = sessions.execute(action, { started: async evidence => {
    if (mode === 'receipt-failure') throw new Error('Injected dispatch receipt persistence failure')
    if (mode === 'receipt-delay') await new Promise(resolve => setTimeout(resolve, 300))
    return store.transact({ type: 'action.started', actionId: action.id, token: 'claim', evidence })
  } })
  if (mode === 'receipt-failure') {
    await assert.rejects(execution, /Injected dispatch receipt persistence failure/)
    assert.equal((await store.read()).workflows.wf.attempts[action.attemptId].submission, null)
    return
  }
  const result = await execution
  if (['tool-failure', 'natural-end', 'max-tokens'].includes(mode)) {
    const failure = mode === 'tool-failure' ? /无法读取 Owner Registry/u
      : mode === 'max-tokens' ? /owner_turn_max_tokens_without_submission/u : /owner_ended_without_submission/u
    assert.equal(result.pending, true)
    assert.equal(sessions.live.size, 0, 'an ended native turn is not a live execute promise')
    let state = await store.read()
    const attempt = state.workflows.wf.attempts[action.attemptId]
    assert.equal(attempt.phase, 'stopping')
    assert.match(attempt.failure, failure)
    assert.equal(attempt.submission, null)
    assert.equal(state.actions[action.id].stopRequested, true)
    assert.equal(state.actions[action.id].result, null)
    assert.equal(Object.values(state.actions).filter(item => item.kind === 'stop_execution').length, 1)
    await store.transact({ type: 'drive' })
    state = await store.read()
    const stop = Object.values(state.actions).find(item => item.kind === 'stop_execution')
    const claimedStop = (await store.transact({ type: 'action.claim', actionId: stop.id, token: 'stop', hostId: 'fixture' })).result
    const termination = await sessions.stop(claimedStop)
    await store.transact({ type: 'action.result', actionId: stop.id, token: 'stop', result: termination })
    state = await store.read()
    assert.equal(state.workflows.wf.attempts[action.attemptId].phase, 'failed')
    assert.equal(state.workflows.wf.attempts[action.attemptId].termination.sourceWritesClosed, true)
    assert.match(state.workflows.wf.issues[attempt.issueId].lastReason, failure)
    assert.equal(state.actions[action.id].status, 'cancelled')
    return
  }
  assert.equal(result.executionSettled, true)
  assert.equal(result.sourceWritesClosed, true)
  assert.equal(result.managedRangeStopped, true)
  assert.equal(result.terminationScope, 'dsh-managed-range')
  assert.equal(Object.hasOwn(result, 'writersStopped'), false)
  const stored = await readSessionEvents(host.ctx.sessionPersistence, result.sessionId)
  assert.ok(stored.events.some(event => event.type === 'tool/result'))
  const state = await store.read()
  assert.equal(state.workflows.wf.attempts[action.attemptId].submission.id, `sub-${action.attemptId}`)
  assert.equal(state.workflows.wf.attempts[action.attemptId].phase, 'executing')
  assert.equal(Object.values(state.actions).some(action => action.kind === 'verify_candidate'), false)
  assert.equal(host.adapter.calls, 1)
})

test('a terminal read-only role without a report settles a legacy uncertain action through native observation', { timeout: 30_000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-review-no-report-')))
  const host = await kernelNativeHost(root, { executable: true, model: async function *() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Review ended without an accepted report.' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } })
  let time = Date.now()
  const store = new WorkflowStore(root, { clock: () => time }); await store.initialize()
  const commands = new NativeCommandEffects(host.ctx, { root: join(root, 'commands') })
  const sessions = new NativeSessionEffects(host.ctx, store, commands, { root: join(root, 'actions') })
  t.after(async () => { await commands.close(); await sessions.close(); await host.close(); await rm(root, { recursive: true, force: true }) })
  await store.transact({ type: 'workflow.create', id: 'wf', root, rootSessionId: host.parent.agent.id, request: 'Review source', baseCommit: 'base' })
  const { result: id } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'review_plan', key: 'review', input: {} })
  const { result: action } = await store.transact({ type: 'action.claim', actionId: id, token: 'execute', hostId: 'fixture' })
  const first = await sessions.execute(action, { started: evidence => store.transact({ type: 'action.started', actionId: id, token: 'execute', evidence }) },
    { role: 'plan-reviewer', worktree: root, prompt: 'Inspect and submit a report.' })
  assert.equal(first.failed, true); assert.equal(first.executionSettled, true)
  assert.equal(first.managedRangeStopped, true); assert.match(first.reason, /without a structured report/)
  assert.equal(sessions.live.size, 0)
  assert.equal(sessions.bindings.size, 0, 'the prompt-specific terminal is formally suspended')
  const sessionId = `owner-${kernelDigest([id, 'plan-reviewer']).slice(0, 40)}`
  await unlink(join(root, 'actions', sessionId, 'result.json'))
  // Recreate the durable state left by older hosts: execution threw after the
  // terminal turn, so Runtime retained an uncertain action without its receipt.
  await store.transact({ type: 'action.failed', actionId: id, token: 'execute', reason: 'Role finished without a structured report' })
  const errors = [], delivered = []
  const effects = new WorkflowEffects(store, { review_plan: {
    execute: () => assert.fail('an accepted native prompt must be observed, never redispatched'),
    observe: (current, context) => sessions.observeSession(current, sessionId, context),
  }, notify_main: { execute: async notice => {
    delivered.push(notice.input)
    return { rootSessionId: host.parent.agent.id, messageId: notice.id, persisted: true }
  } } },
  { hostId: 'replacement', onError: error => errors.push(error) })
  t.after(() => effects.close())
  await effects.pump(); await effects.drain()
  assert.equal(delivered.length, 1); assert.equal(delivered[0].detail.executionSettled, undefined)
  time += 30_000
  const releasePermit = Promise.withResolvers(); const permitHeld = Promise.withResolvers()
  const writer = sessions.writePermit({ action }, async () => { permitHeld.resolve(); await releasePermit.promise })
  await permitHeld.promise
  await effects.pump()
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal((await store.read()).actions[id].status, 'uncertain', 'observation cannot settle while a prior native permit is held')
  releasePermit.resolve(); await writer; await effects.drain()
  const ended = (await store.read()).actions[id]
  assert.deepEqual(errors, [])
  assert.equal(ended.status, 'failed'); assert.equal(ended.failure, 'Role finished without a structured report')
  assert.equal(ended.termination.executionSettled, true); assert.equal(ended.termination.managedRangeStopped, true)
  assert.equal(ended.termination.promptId, sessionId)
  assert.equal(Object.values((await store.read()).actions).some(item => item.kind === 'stop_execution'), false)
  const notices = Object.values((await store.read()).actions).filter(item => item.kind === 'notify_main'
    && item.input.detail.actionId === id)
  assert.equal(notices.length, 2)
  const settledNotice = notices.find(item => item.input.detail.executionSettled === true)
  assert.equal(settledNotice.input.detail.terminationId, ended.termination.terminationId)
  assert.equal(settledNotice.input.detail.evidenceRef, ended.termination.evidenceRef)
  await effects.pump(); await effects.drain(); await effects.pump(); await effects.drain()
  assert.equal(delivered.filter(item => item.detail.executionSettled === true).length, 1,
    JSON.stringify(Object.values((await store.read()).actions).filter(item => item.kind === 'notify_main')
      .map(item => ({ status: item.status, nextWakeAt: item.nextWakeAt, detail: item.input.detail }))))
  assert.equal(Object.values((await store.read()).actions).filter(item => item.kind === 'notify_main'
    && item.input.detail.actionId === id && item.input.detail.executionSettled === true).length, 1)
  assert.ok(time < ended.deadlineAt)
})

test('a quota-ended reviewer preserves the native model error instead of reporting a missing review', { timeout: 30_000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-review-quota-')))
  const host = await kernelNativeHost(root, { executable: true, model: async function *() {
    yield { type: 'finish', reason: { kind: 'error', failure: {
      message: '429: {"type":"usage_limit_reached","resets_at":1789960839}', code: 'QUOTA',
    } } }
  } })
  const store = new WorkflowStore(root); await store.initialize()
  const commands = new NativeCommandEffects(host.ctx, { root: join(root, 'commands') })
  const sessions = new NativeSessionEffects(host.ctx, store, commands, { root: join(root, 'actions') })
  t.after(async () => { await commands.close(); await sessions.close(); await host.close(); await rm(root, { recursive: true, force: true }) })
  await store.transact({ type: 'workflow.create', id: 'wf', root, rootSessionId: host.parent.agent.id, request: 'Review source', baseCommit: 'base' })
  const { result: id } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'review_plan', key: 'review', input: {} })
  const { result: action } = await store.transact({ type: 'action.claim', actionId: id, token: 'execute', hostId: 'fixture' })
  const result = await sessions.execute(action, { started: evidence => store.transact({ type: 'action.started', actionId: id, token: 'execute', evidence }) },
    { role: 'plan-reviewer', worktree: root, prompt: 'Inspect and submit a report.' })
  assert.equal(result.failed, true)
  assert.match(result.reason, /role_turn_failed: QUOTA: 429: .*usage_limit_reached/)
  assert.equal(result.executionSettled, true)
  const sessionId = `owner-${kernelDigest([id, 'plan-reviewer']).slice(0, 40)}`
  await unlink(join(root, 'actions', sessionId, 'result.json'))
  const observed = await sessions.observeSession(action, sessionId, { executionQuiescent: true })
  assert.equal(observed.reason, result.reason)
})

test('a reviewer without a report preserves native model output exhaustion', { timeout: 30_000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-review-max-tokens-')))
  const host = await kernelNativeHost(root, { executable: true, model: async function *() {
    yield { type: 'finish', reason: { kind: 'max-tokens' } }
  } })
  const store = new WorkflowStore(root); await store.initialize()
  const commands = new NativeCommandEffects(host.ctx, { root: join(root, 'commands') })
  const sessions = new NativeSessionEffects(host.ctx, store, commands, { root: join(root, 'actions') })
  t.after(async () => { await commands.close(); await sessions.close(); await host.close(); await rm(root, { recursive: true, force: true }) })
  await store.transact({ type: 'workflow.create', id: 'wf', root, rootSessionId: host.parent.agent.id, request: 'Review source', baseCommit: 'base' })
  const { result: id } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'review_plan', key: 'review', input: {} })
  const { result: action } = await store.transact({ type: 'action.claim', actionId: id, token: 'execute', hostId: 'fixture' })
  const result = await sessions.execute(action, { started: evidence => store.transact({ type: 'action.started', actionId: id, token: 'execute', evidence }) },
    { role: 'plan-reviewer', worktree: root, prompt: 'Inspect and submit a report.' })
  assert.equal(result.failed, true)
  assert.match(result.reason, /role_turn_max_tokens/u)
  assert.equal(result.executionSettled, true)
})

test('a native Planner preserves a rejected submission and settles a negative review into a concrete root replan notice', { timeout: 30_000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-planner-obstruction-')))
  const previous = normalizePlanV2({ contract: 'DSH_PLAN_V2', registryDigest: 'a'.repeat(64), summary: 'T04 consumer graph',
    owners: [{ id: 'worker', name: 'Worker', description: 'Worker code', scope: ['src/**'], exclude: [] }],
    tasks: [
      { id: 'worker_transport', title: 'Worker transport', role: 'work', ownerId: 'worker', write: ['src/**'], dependsOn: [], resources: [], verify: ['unit'], done: ['Transport works'] },
      { id: 'worker_impact_review', title: 'Worker impact review', role: 'review', ownerId: 'worker', write: [], dependsOn: ['worker_transport'], resources: [], verify: ['unit'], done: ['Impact reviewed'] },
      { id: 'web_host_parity', title: 'Web parity', role: 'work', ownerId: 'worker', write: ['src/**'], dependsOn: ['worker_transport'], resources: [], verify: ['unit'], done: ['Web host works'] },
      { id: 'extension_host_parity', title: 'Extension parity', role: 'work', ownerId: 'worker', write: ['src/**'], dependsOn: ['worker_transport'], resources: [], verify: ['unit'], done: ['Extension host works'] },
      { id: 'final_acceptance', title: 'Final acceptance', role: 'verify', ownerId: 'worker', write: [], dependsOn: ['web_host_parity', 'extension_host_parity'], resources: [], verify: ['unit'], done: ['Acceptance passes'] },
    ], verifications: [{ id: 'unit', run: ['node', '--test'] }],
    planningBindings: { contract: 'DSH_PLANNING_BINDINGS_V1', snapshotId: 'snapshot', sourceDigest: 'b'.repeat(64),
      tasks: ['worker_transport', 'worker_impact_review', 'web_host_parity', 'extension_host_parity', 'final_acceptance'].map(taskId => ({
        taskId, tickets: [{ id: taskId === 'worker_impact_review' ? 'T04' : 'T05', revision: 'R2', fragments: ['ready'] }], contracts: [],
      })) },
  })
  let step = 0
  const review = { contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'Both T04 consumers are outside the admitted boundary.', issues: [
    { severity: 'high', obligationId: 't04-web-consumer', sourceId: 'T04', sourceVersion: 'R2', targetTaskIds: ['web_host_parity'],
      title: 'Bind the web consumer', detail: 'web_host_parity must wait for worker_impact_review.', suggestion: 'Expand the boundary.',
      closeWhen: { kind: 'plan_task_executable', taskId: 'web_host_parity' } },
    { severity: 'high', obligationId: 't04-extension-consumer', sourceId: 'T04', sourceVersion: 'R2', targetTaskIds: ['extension_host_parity'],
      title: 'Bind the extension consumer', detail: 'extension_host_parity must wait for worker_impact_review.', suggestion: 'Expand the boundary.',
      closeWhen: { kind: 'plan_task_executable', taskId: 'extension_host_parity' } },
  ] }
  const host = await kernelNativeHost(root, { executable: true, model: async function *() {
    const report = step++ === 0
      ? { plan: { ...structuredClone(previous), owners: [{ ...previous.owners[0], scope: ['secrets/**'] }] } }
      : { review }
    const block = { type: 'tool-call', id: `planner-submit-${step}`, name: 'workflow_action_submit', arguments: JSON.stringify({ report }) }
    yield { type: 'block-start', index: 0, blockType: 'tool-call', id: block.id, name: block.name }
    yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments }
    yield { type: 'block-end', index: 0, block }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  } })
  const store = new WorkflowStore(root); await store.initialize()
  const commands = new NativeCommandEffects(host.ctx, { root: join(root, 'commands') })
  let planning
  const sessions = new NativeSessionEffects(host.ctx, store, commands, { root: join(root, 'actions'),
    validateReport: (...args) => planning.validate(...args) })
  planning = new NativePlanningEffects({}, store, sessions, join(root, 'actions'))
  planning.boundInputs = async () => ({ snapshot: { source: { references: { tickets: [{ id: 'T04', revision: 'R2', contracts: [] }] } } },
    registry: { owners: previous.owners } })
  const delivered = [], errors = []
  const effects = new WorkflowEffects(store, {
    plan: { execute: (action, context) => sessions.execute(action, context, { role: 'planner', worktree: root, prompt: 'Repair the admitted plan or report the exact obstruction.' }) },
    notify_main: { execute: async action => {
      delivered.push(action.input)
      return { rootSessionId: host.parent.agent.id, messageId: action.id, persisted: true }
    } },
  }, { hostId: 'fixture', onError: error => errors.push(error) })
  t.after(async () => { effects.close(); await commands.close(); await sessions.close(); await host.close(); await rm(root, { recursive: true, force: true }) })
  await store.transact({ type: 'workflow.create', id: 'wf', root, rootSessionId: host.parent.agent.id, request: 'T04 repair', baseCommit: 'base' })
  const boundary = { taskIds: ['final_acceptance', 'worker_impact_review', 'worker_transport'], verificationIds: [] }
  const { result: actionId } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'plan', key: 't04-repair', input: {
    parentVersion: 0, snapshotDigest: 'snapshot', registryDigest: previous.registryDigest,
    previousPlan: previous, previousPlanDigest: kernelDigest(previous), revisionBoundary: boundary,
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  await effects.pump(); await effects.drain(); await effects.pump(); await effects.drain()
  const state = await store.read(); const action = state.actions[actionId]
  assert.deepEqual(errors, [])
  assert.equal(step, 2, 'the same native Planner retries with a structured negative result after tool rejection')
  assert.equal(action.status, 'succeeded'); assert.equal(action.result.blocked, true)
  assert.equal(action.result.executionSettled, true); assert.equal(action.result.managedRangeStopped, true)
  assert.equal(action.result.validationFailures[0].code, 'PLANNING_SUBMISSION_REJECTED')
  assert.equal((await readArtifact(action.result.validationFailures[0].evidenceRef)).actionId, actionId)
  assert.equal(state.workflows.wf.planningFailure, 'revision_boundary_required')
  assert.equal(Object.values(state.actions).filter(item => item.kind === 'review_plan').length, 0)
  const notice = delivered.find(item => item.reason === 'planning_failed')?.detail
    ?? delivered.find(item => item.reason === 'workflow_terminal')?.detail.planningRepair
  assert.deepEqual(notice.review.issues.flatMap(item => item.targetTaskIds).sort(), ['extension_host_parity', 'web_host_parity'])
  assert.equal(notice.evidenceRef, action.result.evidenceRef)
  assert.equal(notice.validationFailures[0].evidenceRef, action.result.validationFailures[0].evidenceRef)
})

test('an initial native Planner with no previous plan reports a frozen-source needs_split issue without fabricating a candidate', { timeout: 30_000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-initial-planner-obstruction-')))
  const review = { contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_split', summary: 'T01 mixes terminal and prerequisite work.', issues: [{
    severity: 'high', obligationId: 'split-t01-terminal', sourceId: 'T01', sourceVersion: 'R1', targetTaskIds: ['terminal_acceptance'],
    title: 'Split terminal work from its prerequisite', detail: 'The frozen Ticket makes its prerequisite and terminal consumer the same work item.',
    suggestion: 'Revise and finalize T01 before replanning.', closeWhen: { kind: 'plan_task_executable', taskId: 'terminal_acceptance' },
  }] }
  const host = await kernelNativeHost(root, { executable: true, model: async function *() {
    const block = { type: 'tool-call', id: 'initial-planner-needs-split', name: 'workflow_action_submit',
      arguments: JSON.stringify({ report: { review } }) }
    yield { type: 'block-start', index: 0, blockType: 'tool-call', id: block.id, name: block.name }
    yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments }
    yield { type: 'block-end', index: 0, block }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  } })
  const store = new WorkflowStore(root); await store.initialize()
  const commands = new NativeCommandEffects(host.ctx, { root: join(root, 'commands') })
  let planning
  const sessions = new NativeSessionEffects(host.ctx, store, commands, { root: join(root, 'actions'),
    validateReport: (...args) => planning.validate(...args) })
  planning = new NativePlanningEffects({}, store, sessions, join(root, 'actions'))
  planning.boundInputs = async action => {
    if (action.inputDigest !== kernelDigest(action.input)) throw new Error('Planning admission identity mismatch')
    return { snapshot: { source: { references: { tickets: [{ id: 'T01', revision: 'R1', contracts: [] }] } } }, registry: { owners: [] } }
  }
  const delivered = [], errors = []
  const effects = new WorkflowEffects(store, {
    plan: { execute: (action, context) => sessions.execute(action, context, { role: 'planner', worktree: root, prompt: 'Compile the initial plan or report a frozen-source obstruction.' }) },
    notify_main: { execute: async action => {
      delivered.push(action.input)
      return { rootSessionId: host.parent.agent.id, messageId: action.id, persisted: true }
    } },
  }, { hostId: 'fixture', onError: error => errors.push(error) })
  t.after(async () => { effects.close(); await commands.close(); await sessions.close(); await host.close(); await rm(root, { recursive: true, force: true }) })
  await store.transact({ type: 'workflow.create', id: 'wf', root, rootSessionId: host.parent.agent.id, request: 'Initial T01 plan', baseCommit: 'base' })
  const { result: actionId } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'plan', key: 'initial', input: {
    parentVersion: 0, snapshotDigest: 'initial-snapshot', registryDigest: 'a'.repeat(64),
    sources: { snapshotDigest: 'initial-snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  await effects.pump(); await effects.drain(); await effects.pump(); await effects.drain()
  const state = await store.read(); const action = state.actions[actionId]
  assert.deepEqual(errors, [])
  assert.equal(action.status, 'succeeded'); assert.equal(action.result.blocked, true)
  assert.equal(action.result.planDigest, null); assert.equal(action.result.executionSettled, true)
  assert.equal(state.workflows.wf.plan, null); assert.equal(state.workflows.wf.planningCandidate, undefined)
  assert.equal(Object.values(state.actions).filter(item => item.kind === 'review_plan').length, 0)
  const notice = delivered.find(item => item.reason === 'planning_failed')?.detail
    ?? delivered.find(item => item.reason === 'workflow_terminal')?.detail.planningRepair
  assert.equal(notice.review.status, 'needs_split')
  assert.equal(notice.review.issues[0].sourceId, 'T01')
  assert.deepEqual(notice.review.issues[0].targetTaskIds, ['terminal_acceptance'])
  assert.equal(notice.evidenceRef, action.result.evidenceRef)
  await assert.rejects(planning.validate({ ...action, inputDigest: '0'.repeat(64) }, { review }, 'planner', {
    evidenceRef: action.result.evidenceRef,
  }), /admission identity mismatch/)
})

test('native observation reads a late structured report only after the write-permit barrier', { timeout: 30_000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-review-late-report-')))
  const host = await kernelNativeHost(root, { executable: true, model: async function *() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'The report writer is still draining.' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } })
  const store = new WorkflowStore(root); await store.initialize()
  const commands = new NativeCommandEffects(host.ctx, { root: join(root, 'commands') })
  const sessions = new NativeSessionEffects(host.ctx, store, commands, { root: join(root, 'actions') })
  t.after(async () => { await commands.close(); await sessions.close(); await host.close(); await rm(root, { recursive: true, force: true }) })
  await store.transact({ type: 'workflow.create', id: 'wf', root, rootSessionId: host.parent.agent.id, request: 'Review source', baseCommit: 'base' })
  const { result: id } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'review_plan', key: 'review', input: {} })
  const { result: action } = await store.transact({ type: 'action.claim', actionId: id, token: 'execute', hostId: 'fixture' })
  await sessions.execute(action, { started: evidence => store.transact({ type: 'action.started', actionId: id, token: 'execute', evidence }) },
    { role: 'plan-reviewer', worktree: root, prompt: 'Inspect and submit a report.' })
  const sessionId = `owner-${kernelDigest([id, 'plan-reviewer']).slice(0, 40)}`
  await unlink(join(root, 'actions', sessionId, 'result.json'))
  const releaseWriter = Promise.withResolvers(); const permitHeld = Promise.withResolvers()
  const report = { review: { status: 'needs_revision', summary: 'Late durable report' } }
  const writer = sessions.writePermit({ action }, async () => {
    permitHeld.resolve(); await releaseWriter.promise
    await writeFile(join(root, 'actions', sessionId, 'report.json'), `${JSON.stringify(report)}\n`)
  })
  await permitHeld.promise
  let observed = false
  const observation = sessions.observeSession(action, sessionId, { executionQuiescent: true }).then(value => { observed = true; return value })
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(observed, false, 'the observer must wait for the prior report writer')
  releaseWriter.resolve(); await writer
  const result = await observation
  assert.deepEqual(result.review, report.review)
  assert.equal(result.failed, undefined)
  assert.equal(result.executionSettled, true)
})

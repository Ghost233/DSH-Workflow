import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { kernelNativeHost } from './fixtures/kernel-native-host.mjs'
import { WorkflowStore } from '../src/workflow-store.mjs'
import { NativeSessionEffects } from '../src/native-session-effects.mjs'
import { NativeCommandEffects } from '../src/native-command-effects.mjs'
import { SubmissionPipeline } from '../src/submission-pipeline.mjs'
import { candidateReviewPrompt, reviewScopeBinding } from '../src/kernel-runtime.mjs'
import { NativePlanningEffects } from '../src/native-planning-effects.mjs'
import { normalizePlanV2 } from '../src/model.mjs'
import { kernelDigest } from '../src/workflow-engine.mjs'
import { compilePlanningPackages } from '../src/planning-packages.mjs'
import { artifactPath, publishArtifact, readArtifact } from '../src/effect-artifacts.mjs'
import { git } from '../src/git.mjs'
import { loadPlanningCheckpointSnapshot, runPlanningCheckpoint } from '../src/planning-checkpoint.mjs'
import { authorizePlanningCheckpoint } from '../src/planning-authority.mjs'
import { applyApprovedRegistryChange, ensureRegistry, proposeRegistryChange } from '../src/registry.mjs'
import { createBoundSource, fixture as checkpointFixture, request as checkpointRequest, trustedAuthorize } from './fixtures/planning-checkpoint-fixture.mjs'

function binding(taskId, value) {
  return {
    taskId,
    tickets: [{ id: value.docs.ticket.id, revision: value.docs.ticket.revision, fragments: ['checkpoint-kernel'] }],
    contracts: [{ id: 'planning-checkpoint-v1', revision: 'v1' }],
  }
}

function planOwners() {
  return [
    { id: 'build', name: 'Build tooling', description: 'Acceptance command boundary', scope: ['scripts/**', 'package.json'], exclude: [] },
    { id: 'quality', name: 'Quality automation', description: 'Acceptance suite boundary', scope: ['tests/**'], exclude: [] },
    { id: 'other', name: 'Unrelated owner', description: 'Unrelated boundary', scope: ['other/**'], exclude: [] },
  ]
}

function planFor(value, snapshot, registryDigest = 'a'.repeat(64)) {
  const owners = planOwners()
  const task = (id, ownerId, verify, dependsOn = [], done = ['A fixed contract is implemented.']) => ({
    id, title: id, role: 'work', ownerId, write: ownerId === 'build' ? ['scripts/**', 'package.json'] : ownerId === 'quality' ? ['tests/**'] : ['other/**'],
    dependsOn, resources: [], verify, done,
  })
  return normalizePlanV2({
    contract: 'DSH_PLAN_V2', registryDigest, summary: 'Native Owner task package dispatch', owners,
    tasks: [
      task('bootstrap', 'build', ['command-contract'], [], ['The acceptance command accepts --suite <name>.']),
      task('foundation', 'quality', ['suite-infrastructure'], ['bootstrap'], ['The infrastructure suite is available.']),
      task('unrelated', 'other', ['unrelated-only']),
    ],
    verifications: [
      { id: 'command-contract', run: ['node', 'scripts/verify-acceptance-command.mjs'], cwd: '.' },
      { id: 'suite-infrastructure', run: ['npm', 'run', 'test:acceptance', '--', '--suite', 'infrastructure'], cwd: '.' },
      { id: 'unrelated-only', run: ['node', 'scripts/unrelated.mjs'], cwd: '.' },
      { id: 'global-gate', run: ['node', 'scripts/global-gate.mjs'], cwd: '.' },
    ],
    planningBindings: {
      contract: 'DSH_PLANNING_BINDINGS_V1', snapshotId: snapshot.id, sourceDigest: snapshot.sourceDigest,
      tasks: ['bootstrap', 'foundation', 'unrelated'].map(taskId => binding(taskId, value)),
    },
  })
}

async function installPlanningRegistry(value) {
  let registry = await ensureRegistry(value.root)
  const proposal = proposeRegistryChange(registry, {
    type: 'batch', reason: 'Establish the frozen planning fixture Owners',
    operations: planOwners().map(owner => ({ type: 'add', owner, reason: `Establish ${owner.id}` })),
  })
  registry = await applyApprovedRegistryChange(value.root, { ...proposal, approvedDigest: proposal.digest })
  await git(value.root, ['commit', '-m', 'establish Owner Registry'])
  value.baseline.head = await git(value.root, ['rev-parse', 'HEAD'])
  return registry
}

function planningAuthorityContext(agent) {
  return {
    agents: { get: id => id === agent.id ? agent : undefined, roots: () => [agent] },
    userQuestions: { ask: async ({ questions }) => ({
      answers: [{ id: questions[0].id, selected: [questions[0].options[0].label] }],
    }) },
  }
}

function checkpointAuthorizer(ctx, agent) {
  return ({ root, source, authorizationId }) => authorizePlanningCheckpoint({
    ctx, agent, exec: { callId: 'planner-frozen-source-authority' }, binding: { root, source, authorizationId },
  })
}

async function *packageAwareModel(options) {
  const prompt = JSON.stringify(options)
  assert.match(prompt, /scripts\/verify-acceptance-command\.mjs/, 'Task role must receive its exact fixed verification argv')
  assert.match(prompt, /--suite/, 'Task role must receive the Ticket CLI contract')
  assert.match(prompt, /infrastructure/, 'Task role must receive the direct consumer suite argv')
  assert.doesNotMatch(prompt, /unrelated\.mjs/, 'Task role must not receive unrelated task packages or commands')
  assert.doesNotMatch(prompt, /test-grant-1/, 'Task role must not receive planning authorization receipts')
  const reviewer = !options.tools?.some(tool => tool.name === 'owner_submit')
  if (reviewer) assert.match(prompt, /candidate-review-content/, 'Candidate reviewer retains its exact candidate prompt')
  const block = reviewer
    ? { type: 'tool-call', id: 'submit-review', name: 'workflow_action_submit', arguments: JSON.stringify({ report: { passed: true, commitSha: 'candidate-review-content', reasons: ['The frozen command and downstream CLI contract are present.'] } }) }
    : { type: 'tool-call', id: 'submit-owner', name: 'owner_submit', arguments: JSON.stringify({ report: { status: 'completed', summary: 'Implemented the fixed acceptance command contract.' } }) }
  yield { type: 'block-start', index: 0, blockType: 'tool-call', id: block.id, name: block.name }
  yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments }
  yield { type: 'block-end', index: 0, block }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}

function repairCapturingModel(prompts) {
  return async function *model(options) {
    const reviewer = !options.tools?.some(tool => tool.name === 'owner_submit')
    const message = options.messages.find(item => item.role === 'user')
    const prompt = typeof message?.content === 'string' ? message.content
      : message?.content?.filter(block => block.type === 'text').map(block => block.text).join('\n')
    prompts.push({ role: reviewer ? 'reviewer' : 'owner', prompt,
      submitParameters: options.tools?.find(tool => tool.name === (reviewer ? 'workflow_action_submit' : 'owner_submit'))?.parameters })
    const block = reviewer
      ? { type: 'tool-call', id: 'submit-review-repair', name: 'workflow_action_submit', arguments: JSON.stringify({ report: {
        passed: true, commitSha: 'candidate-review-content', reasons: ['The repaired candidate now covers the regression.'],
      } }) }
      : { type: 'tool-call', id: 'submit-owner-repair', name: 'owner_submit', arguments: JSON.stringify({ report: {
        status: 'completed', summary: 'Added the requested API regression coverage.',
      } }) }
    yield { type: 'block-start', index: 0, blockType: 'tool-call', id: block.id, name: block.name }
    yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments }
    yield { type: 'block-end', index: 0, block }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  }
}

test('native Planner rejects a bound no-progress report immediately and preserves its validation evidence', async t => {
  const value = await checkpointFixture(t)
  if (!value) return
  const chains = await createBoundSource(value)
  const request = checkpointRequest(value, chains, 'planner-no-progress-preflight')
  await runPlanningCheckpoint({ root: value.root, cwd: value.root, request, authorize: trustedAuthorize({ calls: 0 }),
    withLease: operation => operation({ signal: new AbortController().signal, assertLease: async () => {} }) })
  const snapshot = await loadPlanningCheckpointSnapshot({ root: value.root, id: request.id })
  const plan = planFor(value, snapshot)
  const catalog = await mkdtemp(join(tmpdir(), 'ukr-planner-preflight-'))
  t.after(() => rm(catalog, { recursive: true, force: true }))
  const artifacts = join(catalog, 'artifacts'); await mkdir(artifacts)
  const store = new WorkflowStore(catalog); await store.initialize()
  await store.transact({ type: 'workflow.create', id: 'wf-preflight', root: value.root, rootSessionId: 'root',
    request: 'preflight', baseCommit: 'base' })
  const input = { parentVersion: 0, checkpointId: snapshot.checkpointId, snapshotDigest: kernelDigest(snapshot),
    registryDigest: plan.registryDigest, previousPlanDigest: kernelDigest(plan),
    previousPlan: plan, revisionBoundary: { taskIds: ['bootstrap'], verificationIds: [] },
    sources: { checkpointId: snapshot.checkpointId, snapshotDigest: kernelDigest(snapshot) },
    authorization: { scope: 'implementation', sourceId: 'root' } }
  const created = await store.transact({ type: 'action.enqueue', workflowId: 'wf-preflight', kind: 'plan', key: 'initial', input })
  await store.transact({ type: 'drive' })
  await store.transact({ type: 'action.claim', actionId: created.result, token: 'planner', hostId: 'fixture' })
  const state = await store.read(); const action = state.actions[created.result]
  const packages = compilePlanningPackages({ snapshot, plan })
  const packagesRef = artifactPath(artifacts, `packages-${kernelDigest(packages)}`)
  const effects = new NativePlanningEffects({}, store, {}, artifacts)
  effects.inputs = async () => { throw new Error('Report validation must not repeat live planning admission') }
  effects.boundInputs = async () => ({ snapshot, registry: { owners: plan.owners } })
  const evidenceRef = artifactPath(catalog, 'planner-receipt')
  const invalid = structuredClone(plan)
  invalid.tasks.find(item => item.id === 'foundation').done.push('Out-of-bound change')
  await assert.rejects(effects.validate(action, { plan: invalid }, 'planner', { evidenceRef }), /exceeds declared boundary/)
  await assert.rejects(effects.validate(action, { plan }, 'planner', { evidenceRef }), /planning_no_progress/)
  const obstruction = await effects.validate(action, { review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'The admitted boundary omits an affected consumer.', issues: [{
      severity: 'high', obligationId: 'consumer-boundary', sourceId: value.docs.ticket.id, sourceVersion: value.docs.ticket.revision,
      targetTaskIds: ['foundation'], title: 'Include the affected consumer', detail: 'The consumer execution contract must change.',
      suggestion: 'Replan with the complete affected task boundary.', closeWhen: { kind: 'plan_task_executable', taskId: 'foundation' },
    }],
  } }, 'planner', { evidenceRef })
  assert.equal(obstruction.blocked, true)
  assert.equal(obstruction.review.status, 'needs_revision')
  assert.equal(obstruction.validationFailures.length, 2)
  const noProgressFailure = obstruction.validationFailures.find(item => String(item.detail).includes('planning_no_progress'))
  assert.equal(noProgressFailure.actionId, action.id)
  assert.equal(noProgressFailure.inputDigest, action.inputDigest)
  assert.equal((await readArtifact(noProgressFailure.evidenceRef)).code, 'PLANNING_SUBMISSION_REJECTED')
  await assert.rejects(effects.validate(action, { review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: 'Cannot approve from the Planner role.', issues: [],
  } }, 'planner', { evidenceRef }), /must be negative/)
  const wrongSource = structuredClone(obstruction.review)
  wrongSource.issues[0].sourceVersion = 'unbound-revision'
  await assert.rejects(effects.validate(action, { review: wrongSource }, 'planner', { evidenceRef }), /source is not bound to the frozen planning input/)
  const staleAction = structuredClone(action)
  staleAction.input.previousPlan.tasks.find(item => item.id === 'bootstrap').done.push('Stale parent')
  await assert.rejects(effects.validate(staleAction, { review: obstruction.review }, 'planner', { evidenceRef }), /does not bind the admitted previous plan/)
  assert.equal(await readArtifact(packagesRef), null)
  const after = await store.read()
  assert.equal(after.actions[action.id].status, 'running')
  assert.equal(after.workflows['wf-preflight'].planningFailure, undefined)
  assert.equal(after.workflows['wf-preflight'].recoveryUsed, 0)
})

test('native Planner keeps one admitted frozen source across later live checkout changes and rejects binding tampering', { timeout: 45_000 }, async t => {
  const value = await checkpointFixture(t)
  if (!value) return
  const registry = await installPlanningRegistry(value)
  const chains = await createBoundSource(value)
  const request = checkpointRequest(value, chains, 'planner-frozen-source-admission')
  const authority = planningAuthorityContext(value.agent)
  await runPlanningCheckpoint({ root: value.root, cwd: value.root, request,
    authorize: checkpointAuthorizer(authority, value.agent),
    withLease: operation => operation({ signal: new AbortController().signal, assertLease: async () => {} }) })
  const snapshot = await loadPlanningCheckpointSnapshot({ root: value.root, id: request.id })
  const registryDigest = kernelDigest(registry)
  const plan = planFor(value, snapshot, registryDigest)
  const catalog = await mkdtemp(join(tmpdir(), 'ukr-planner-frozen-source-'))
  const artifacts = join(catalog, 'artifacts'); await mkdir(artifacts)
  t.after(() => rm(catalog, { recursive: true, force: true }))
  const store = new WorkflowStore(catalog); await store.initialize()
  await store.transact({ type: 'workflow.create', id: 'wf-frozen', root: value.root, rootSessionId: value.agent.id,
    request: 'freeze admitted source', baseCommit: snapshot.codeBaseline.checkpointCommit })
  const input = { parentVersion: 0, checkpointId: snapshot.checkpointId, snapshotDigest: kernelDigest(snapshot),
    registryDigest,
    sources: { checkpointId: snapshot.checkpointId, snapshotDigest: kernelDigest(snapshot) },
    authorization: { scope: 'implementation', sourceId: value.agent.id } }
  const created = await store.transact({ type: 'action.enqueue', workflowId: 'wf-frozen', kind: 'plan', key: 'initial', input })
  await store.transact({ type: 'drive' })
  await store.transact({ type: 'action.claim', actionId: created.result, token: 'planner', hostId: 'fixture' })
  const action = (await store.read()).actions[created.result]
  const frozenRoot = join(catalog, 'frozen-source')
  let preparedCommit
  const prepareSource = async (_action, exactCommit) => {
    if (preparedCommit === undefined) {
      await git(catalog, ['clone', '--no-checkout', value.root, frozenRoot])
      await git(frozenRoot, ['checkout', '--detach', exactCommit])
      preparedCommit = exactCommit
    }
    assert.equal(exactCommit, preparedCommit, 'repeat preparation stays on the admitted commit')
    assert.equal(await git(frozenRoot, ['rev-parse', 'HEAD']), exactCommit)
    return { artifact: frozenRoot, baseCommit: exactCommit }
  }
  const dispatches = []
  const sessions = {
    execute: async (_action, _context, options) => {
      dispatches.push(options)
      return { executionSettled: false, sourceWritesClosed: true }
    },
  }
  const effects = new NativePlanningEffects(authority, store, sessions, artifacts, { prepareSource })
  const admitted = await effects.inputs(action)
  assert.equal(admitted.exactCommit, snapshot.codeBaseline.checkpointCommit)
  const frozenTicket = await readFile(join(admitted.source.artifact, value.docs.ticket.path), 'utf8')
  assert.match(frozenTicket, /final checkpoint ticket\./u)

  const liveTicketPath = join(value.root, value.docs.ticket.path)
  await writeFile(liveTicketPath, (await readFile(liveTicketPath, 'utf8')).replace(
    'final checkpoint ticket.', 'later live checkpoint ticket.'))
  await writeFile(join(value.root, 'code.txt'), 'later live code\n')
  await git(value.root, ['add', value.docs.ticket.path, 'code.txt'])
  await git(value.root, ['commit', '-m', 'advance live checkout after planning admission'])
  assert.notEqual(await git(value.root, ['rev-parse', 'HEAD']), admitted.exactCommit)
  assert.match(await readFile(liveTicketPath, 'utf8'), /later live checkpoint ticket\./u)
  assert.equal(await readFile(join(admitted.source.artifact, value.docs.ticket.path), 'utf8'), frozenTicket)

  await effects.execute(action, {})
  assert.equal(dispatches.length, 1)
  assert.equal(dispatches[0].worktree, admitted.source.artifact)
  assert.equal(await readFile(join(dispatches[0].worktree, value.docs.ticket.path), 'utf8'), frozenTicket)
  const evidenceRef = artifactPath(catalog, 'planner-frozen-source-receipt')
  const report = await effects.validate(action, { plan }, 'planner', { evidenceRef })
  assert.equal(report.snapshotDigest, input.snapshotDigest)
  assert.deepEqual((await readArtifact(report.packagesRef)).packages.map(item => item.taskId),
    compilePlanningPackages({ snapshot, plan }).packages.map(item => item.taskId))

  const omittedDigest = structuredClone(plan)
  delete omittedDigest.registryDigest
  const boundReport = await effects.validate(action, { plan: omittedDigest }, 'planner', { evidenceRef })
  assert.deepEqual(boundReport, report, 'omitting model-owned identity must publish the same bound plan and packages')
  assert.equal(Object.hasOwn(omittedDigest, 'registryDigest'), false, 'binding must not mutate the submitted report')
  await assert.rejects(effects.validate(action, { plan: { ...plan, registryDigest: 'f'.repeat(64) } }, 'planner', { evidenceRef }),
    /bound Registry digest/u, 'an explicitly conflicting identity must not be silently corrected')
  const changedScope = structuredClone(omittedDigest)
  changedScope.owners[0].scope.push('secrets/**')
  await assert.rejects(effects.validate(action, { plan: changedScope }, 'planner', { evidenceRef }),
    /cannot redefine Owner scope/u, 'binding the digest must not grant different Owner authority')

  const tamperedAction = structuredClone(action)
  tamperedAction.input.registryDigest = 'f'.repeat(64)
  await assert.rejects(effects.boundInputs(tamperedAction), /admission receipt does not bind this Action/u)
  await assert.rejects(effects.validate(tamperedAction, { plan: omittedDigest }, 'planner', { evidenceRef }),
    /admission receipt does not bind this Action/u, 'omission cannot bypass admission identity validation')
  await assert.rejects(effects.validate(tamperedAction, { review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'Tampered action must not report an obstruction.', issues: [{
      severity: 'high', obligationId: 'tampered-action', sourceId: value.docs.ticket.id, sourceVersion: value.docs.ticket.revision,
      targetTaskIds: ['bootstrap'], title: 'Reject stale identity', detail: 'This report belongs to another action identity.',
      suggestion: 'Use the admitted action.', closeWhen: { kind: 'plan_task_executable', taskId: 'bootstrap' },
    }],
  } }, 'planner', { evidenceRef }), /admission receipt does not bind this Action/u,
  'a negative report cannot bypass its admitted source and Action identity')
  const admissionRef = effects.admissionPath(action)
  const receipt = await readArtifact(admissionRef)
  await writeFile(admissionRef, `${JSON.stringify({ ...receipt, exactCommit: '0'.repeat(40) })}\n`)
  await assert.rejects(effects.boundInputs(action), /admission receipt does not bind this Action/u)
})

test('native Owner and candidate Reviewer receive only the same bound task package and direct consumer command contract', { timeout: 45_000 }, async t => {
  const value = await checkpointFixture(t)
  if (!value) return
  const chains = await createBoundSource(value)
  const ticketPath = join(value.root, value.docs.ticket.path)
  await value.call('edit', { file_path: ticketPath, old_string: 'final checkpoint ticket.',
    new_string: 'final checkpoint ticket. The command contract is test:acceptance -- --suite <name>.' })
  chains.find(item => item.path === value.docs.ticket.path).callIds.push('checkpoint-source-5')
  const ticketContent = await readFile(ticketPath)
  value.docs.ticket.sha256 = createHash('sha256').update(ticketContent).digest('hex')
  const request = checkpointRequest(value, chains, 'owner-package-dispatch')
  await runPlanningCheckpoint({ root: value.root, cwd: value.root, request, authorize: trustedAuthorize({ calls: 0 }),
    withLease: operation => operation({ signal: new AbortController().signal, assertLease: async () => {} }) })
  const snapshot = await loadPlanningCheckpointSnapshot({ root: value.root, id: request.id })
  const plan = planFor(value, snapshot)
  const packages = compilePlanningPackages({ snapshot, plan })
  const catalog = await mkdtemp(join(tmpdir(), 'ukr-owner-package-catalog-'))
  const artifacts = join(catalog, 'artifacts'); await mkdir(artifacts)
  const packagesRef = artifactPath(artifacts, `packages-${kernelDigest(packages)}`)
  await publishArtifact(packagesRef, packages)
  const host = await kernelNativeHost(value.root, { executable: true, model: packageAwareModel })
  const store = new WorkflowStore(catalog); await store.initialize()
  const commands = new NativeCommandEffects(host.ctx, { root: join(catalog, 'commands') })
  const sessions = new NativeSessionEffects(host.ctx, store, commands, { root: join(catalog, 'native-sessions') })
  const pipeline = new SubmissionPipeline({ artifactsRoot: artifacts, assertAuthority: (authority, options) => sessions.assertAuthority(authority, options) })
  sessions.pipeline = pipeline
  t.after(async () => { await commands.close(); await sessions.close(); await host.close(); await rm(catalog, { recursive: true, force: true }) })

  const baseCommit = await git(value.root, ['rev-parse', 'HEAD'])
  await store.transact({ type: 'workflow.create', id: 'wf', root: value.root, rootSessionId: host.parent.agent.id, request: 'dispatch package', baseCommit })
  await store.transact({ type: 'plan.activate', workflowId: 'wf', parentVersion: 0, plan,
    authorization: { scope: 'implementation', sourceId: 'fixture' },
    sources: { checkpointId: request.id, snapshotDigest: kernelDigest(snapshot), packagesRef },
    review: { status: 'passed', evidenceRef: '/review', planDigest: kernelDigest(plan) } })
  await store.transact({ type: 'drive' })
  const action = Object.values((await store.read()).actions).find(item => item.kind === 'execute_owner' && item.input.task.id === 'bootstrap')
  await store.transact({ type: 'action.claim', actionId: action.id, token: 'owner', hostId: 'fixture' })
  action.status = 'running'
  const result = await sessions.execute(action, { started: evidence => store.transact({ type: 'action.started', actionId: action.id, token: 'owner', evidence }) })
  assert.equal(result.executionSettled, true)
  const persisted = await store.read()
  const dispatched = persisted.actions[action.id]
  assert.deepEqual(dispatched.input.taskPackage, {
    packagesRef, checkpointId: request.id, snapshotDigest: kernelDigest(snapshot), planVersion: 1,
    planDigest: kernelDigest(plan), taskId: 'bootstrap', ownerId: 'build',
  })
  const stale = structuredClone(dispatched)
  stale.input.taskPackage.planVersion++
  await assert.rejects(sessions.ownerDispatchContext(stale, persisted.workflows.wf), /package binding changed/)

  await store.transact({ type: 'action.result', actionId: action.id, token: 'owner', result })
  let state = await store.read()
  const seal = Object.values(state.actions).find(item => item.kind === 'seal_candidate')
  await store.transact({ type: 'action.claim', actionId: seal.id, token: 'seal', hostId: 'fixture' })
  const submitted = state.workflows.wf.attempts[action.attemptId].submission
  await store.transact({ type: 'action.result', actionId: seal.id, token: 'seal', result: {
    artifact: value.root, commitSha: 'candidate-review-content', authority: state.workflows.wf.attempts[action.attemptId].authority,
    submissionArtifact: submitted.artifact, baseCommit,
  } })
  state = await store.read()
  const verification = Object.values(state.actions).find(item => item.kind === 'verify_candidate')
  assert.deepEqual(verification.input.taskPackage, dispatched.input.taskPackage)
  const legacy = structuredClone(verification)
  delete legacy.input.taskPackage
  const legacyContext = await sessions.taskAcceptanceContext(legacy, state.workflows.wf, 'reviewer')
  assert.match(JSON.stringify(legacyContext), /scripts\/verify-acceptance-command\.mjs/)
  assert.match(JSON.stringify(legacyContext), /--suite/)

  const combinedState = structuredClone(state)
  const combinedWorkflow = combinedState.workflows.wf
  const combinedAttemptId = combinedWorkflow.tasks.bootstrap.attemptId
  combinedWorkflow.attempts[combinedAttemptId].phase = 'integrating'
  const combinedTasks = [combinedWorkflow.plan.tasks.find(task => task.id === 'bootstrap')]
  const combinedTask = { id: 'combined', title: 'Combined integration acceptance', verify: ['command-contract'],
    done: combinedTasks.flatMap(task => task.done ?? []) }
  combinedState.actions['integrate-bootstrap'] = { id: 'integrate-bootstrap', kind: 'integrate_candidate', attemptId: combinedAttemptId }
  const combinedScope = reviewScopeBinding(combinedWorkflow, 'combined', combinedTasks, {
    integrationHead: combinedWorkflow.integrationHead, candidateCommit: 'combined-candidate',
  })
  const combinedContext = await sessions.reviewScopeContext({ kind: 'integrate_candidate', controlActionId: 'integrate-bootstrap',
    input: { candidate: { baseCommit: 'combined-candidate' }, task: combinedTask,
      verifications: [combinedWorkflow.plan.verifications.find(item => item.id === 'command-contract')], reviewScope: combinedScope } }, combinedWorkflow, combinedState)
  assert.match(JSON.stringify(combinedContext.planningPackage), /scripts\/verify-acceptance-command\.mjs/)
  assert.deepEqual(combinedContext.directConsumers, [{ taskId: 'foundation', title: 'foundation', ownerId: 'quality', write: ['tests/**'],
    done: ['The infrastructure suite is available.'], verification: [combinedWorkflow.plan.verifications.find(item => item.id === 'suite-infrastructure')] }])

  const finalState = structuredClone(state)
  const finalWorkflow = finalState.workflows.wf
  finalWorkflow.integrationHead = 'final-integration'
  for (const task of finalWorkflow.plan.tasks) {
    const attemptId = `final-${task.id}`
    finalWorkflow.tasks[task.id].attemptId = attemptId
    finalWorkflow.attempts[attemptId] = { id: attemptId, taskId: task.id, phase: 'succeeded' }
  }
  const finalTask = { id: 'final', title: 'Complete workflow acceptance', verify: finalWorkflow.plan.verifications.map(item => item.id),
    done: finalWorkflow.plan.tasks.flatMap(task => task.done ?? []) }
  const finalScope = reviewScopeBinding(finalWorkflow, 'final', finalWorkflow.plan.tasks, { integrationHead: finalWorkflow.integrationHead })
  const finalAction = { kind: 'verify_workflow', input: { candidate: { baseCommit: 'final-integration' }, commitSha: 'final-integration',
    planVersion: finalWorkflow.planVersion, plan: finalWorkflow.plan, task: finalTask,
    verifications: finalWorkflow.plan.verifications, reviewScope: finalScope } }
  const finalContext = await sessions.reviewScopeContext(finalAction, finalWorkflow, finalState)
  assert.deepEqual(finalContext.planningPackages.spec, packages.spec)
  assert.deepEqual(finalContext.planningPackages.tasks.map(item => item.taskId), ['bootstrap', 'foundation', 'unrelated'])
  assert.deepEqual(finalContext.planningPackages.tickets.map(item => [item.id, item.revision]), [[value.docs.ticket.id, value.docs.ticket.revision]])
  assert.deepEqual(finalContext.planningPackages.contracts, [{ id: 'planning-checkpoint-v1', revision: 'v1' }])
  assert.match(JSON.stringify(finalContext.planningPackages), /scripts\/verify-acceptance-command\.mjs/)
  assert.deepEqual(finalContext.verifications, finalWorkflow.plan.verifications)
  assert.match(JSON.stringify(finalContext.verifications), /scripts\/global-gate\.mjs/)
  const driftedFinal = structuredClone(finalAction)
  driftedFinal.input.reviewScope.integrationHead = 'another-integration'
  await assert.rejects(sessions.reviewScopeContext(driftedFinal, finalWorkflow, finalState), /Final review binding changed/)

  await store.transact({ type: 'action.claim', actionId: verification.id, token: 'reviewer', hostId: 'fixture' })
  verification.status = 'running'
  const review = await sessions.execute(verification, { started: evidence => store.transact({ type: 'action.started', actionId: verification.id, token: 'reviewer', evidence }) }, {
    role: 'reviewer', worktree: value.root,
    prompt: candidateReviewPrompt({ candidate: verification.input.candidate, task: verification.input.task,
      results: [{ verificationId: 'command-contract', status: 'execution_error', passed: false, error: 'ENOTEMPTY' }] }),
  })
  assert.equal(review.passed, true)
  assert.equal(review.commitSha, 'candidate-review-content')
})

test('native repair Owner and custom candidate Reviewer receive the same compact persisted repair context', { timeout: 45_000 }, async t => {
  const value = await checkpointFixture(t)
  if (!value) return
  const chains = await createBoundSource(value)
  const request = checkpointRequest(value, chains, 'repair-prompt-dispatch')
  await runPlanningCheckpoint({ root: value.root, cwd: value.root, request, authorize: trustedAuthorize({ calls: 0 }),
    withLease: operation => operation({ signal: new AbortController().signal, assertLease: async () => {} }) })
  const snapshot = await loadPlanningCheckpointSnapshot({ root: value.root, id: request.id })
  const plan = planFor(value, snapshot)
  const packages = compilePlanningPackages({ snapshot, plan })
  const catalog = await mkdtemp(join(tmpdir(), 'ukr-repair-prompt-catalog-'))
  const artifacts = join(catalog, 'artifacts'); await mkdir(artifacts)
  const packagesRef = artifactPath(artifacts, `packages-${kernelDigest(packages)}`)
  await publishArtifact(packagesRef, packages)
  const prompts = []
  const host = await kernelNativeHost(value.root, { executable: true, model: repairCapturingModel(prompts) })
  const store = new WorkflowStore(catalog); await store.initialize()
  const commands = new NativeCommandEffects(host.ctx, { root: join(catalog, 'commands') })
  const sessions = new NativeSessionEffects(host.ctx, store, commands, { root: join(catalog, 'native-sessions') })
  sessions.pipeline = new SubmissionPipeline({ artifactsRoot: artifacts,
    assertAuthority: (authority, options) => sessions.assertAuthority(authority, options) })
  sessions.pipeline.restoreCandidate = async () => {}
  t.after(async () => { await commands.close(); await sessions.close(); await host.close(); await rm(catalog, { recursive: true, force: true }) })

  const baseCommit = await git(value.root, ['rev-parse', 'HEAD'])
  await store.transact({ type: 'workflow.create', id: 'wf-repair-prompt', root: value.root,
    rootSessionId: host.parent.agent.id, request: 'repair prompt dispatch', baseCommit })
  await store.transact({ type: 'plan.activate', workflowId: 'wf-repair-prompt', parentVersion: 0, plan,
    authorization: { scope: 'implementation', sourceId: 'fixture' },
    sources: { checkpointId: request.id, snapshotDigest: kernelDigest(snapshot), packagesRef },
    review: { status: 'passed', evidenceRef: '/review', planDigest: kernelDigest(plan) } })
  await store.transact({ type: 'drive' })
  let state = await store.read()
  const firstOwner = Object.values(state.actions).find(action => action.kind === 'execute_owner' && action.input.task.id === 'bootstrap')
  await store.transact({ type: 'action.claim', actionId: firstOwner.id, token: 'first-owner', hostId: 'fixture' })
  await store.transact({ type: 'action.started', actionId: firstOwner.id, token: 'first-owner', evidence: { handleId: 'first-owner' } })
  const firstAttempt = state.workflows['wf-repair-prompt'].attempts[firstOwner.attemptId]
  await store.transact({ type: 'owner.submit', workflowId: 'wf-repair-prompt', attemptId: firstAttempt.id,
    authority: firstAttempt.authority, report: { status: 'completed', summary: 'Initial candidate lacks a regression.' },
    manifestDigest: 'initial-manifest', artifact: '/runtime/submissions/initial.json' })
  await store.transact({ type: 'action.result', actionId: firstOwner.id, token: 'first-owner', result: {
    executionSettled: true, sourceWritesClosed: true, authority: firstAttempt.authority,
  } })
  state = await store.read()
  const firstSeal = Object.values(state.actions).find(action => action.kind === 'seal_candidate' && action.attemptId === firstAttempt.id)
  await store.transact({ type: 'action.claim', actionId: firstSeal.id, token: 'first-seal', hostId: 'fixture' })
  const manifest = Array.from({ length: 1_222 }, (_, index) => ({ path: `docs/figma/export-${index}.json`, digest: `${index}`.padStart(64, '0') }))
  await store.transact({ type: 'action.result', actionId: firstSeal.id, token: 'first-seal', result: {
    artifact: '/runtime/candidates/initial/tree', submissionArtifact: '/runtime/submissions/initial.json',
    commitSha: 'initial-candidate-content', baseCommit, authority: firstAttempt.authority, manifest,
  } })
  state = await store.read()
  const firstVerification = Object.values(state.actions).find(action => action.kind === 'verify_candidate' && action.attemptId === firstAttempt.id)
  await store.transact({ type: 'action.claim', actionId: firstVerification.id, token: 'first-verification', hostId: 'fixture' })
  await store.transact({ type: 'action.result', actionId: firstVerification.id, token: 'first-verification', result: {
    commitSha: 'initial-candidate-content', passed: false, executionSettled: true,
    results: [{ verificationId: 'command-contract', argv: ['node', 'scripts/verify-acceptance-command.mjs'], cwd: '.',
      commitSha: 'initial-candidate-content', passed: false, exitCode: 1, stdout: 'missing API regression', stderr: '',
      commandTermination: { managedRangeStopped: true } }],
    review: { passed: false, commitSha: 'initial-candidate-content', reasons: ['The API regression test is absent.'],
      evidenceRef: '/runtime/reviews/initial.json', executionSettled: true, sessionId: 'runtime-review-session' },
  } })
  state = await store.read()
  const failedAttempt = state.workflows['wf-repair-prompt'].attempts[firstAttempt.id]
  const instructions = 'Add the missing API regression test and keep the fixed command contract.'
  await store.transact({ type: 'task.retry', workflowId: 'wf-repair-prompt', taskId: 'bootstrap', issueId: failedAttempt.issueId,
    instructions, decisionRef: '/runtime/decisions/api-repair.json' })
  await store.transact({ type: 'drive' })
  state = await store.read()
  const repairedOwner = Object.values(state.actions).find(action => action.kind === 'execute_owner'
    && action.input.task.id === 'bootstrap' && action.attemptId !== firstAttempt.id)
  assert.equal(repairedOwner.input.repair.candidate.manifest.length, 1_222, 'Runtime must retain the complete repair candidate')
  await store.transact({ type: 'action.claim', actionId: repairedOwner.id, token: 'repair-owner', hostId: 'fixture' })
  repairedOwner.status = 'running'
  const ownerResult = await sessions.execute(repairedOwner, {
    started: evidence => store.transact({ type: 'action.started', actionId: repairedOwner.id, token: 'repair-owner', evidence }),
  })
  await store.transact({ type: 'action.result', actionId: repairedOwner.id, token: 'repair-owner', result: ownerResult })
  state = await store.read()
  const repairedAttempt = state.workflows['wf-repair-prompt'].attempts[repairedOwner.attemptId]
  const repairedSeal = Object.values(state.actions).find(action => action.kind === 'seal_candidate' && action.attemptId === repairedAttempt.id)
  await store.transact({ type: 'action.claim', actionId: repairedSeal.id, token: 'repair-seal', hostId: 'fixture' })
  await store.transact({ type: 'action.result', actionId: repairedSeal.id, token: 'repair-seal', result: {
    artifact: value.root, commitSha: 'candidate-review-content', authority: repairedAttempt.authority, manifest: [],
    submissionArtifact: repairedAttempt.submission.artifact, baseCommit,
  } })
  state = await store.read()
  const repairedVerification = Object.values(state.actions).find(action => action.kind === 'verify_candidate' && action.attemptId === repairedAttempt.id)
  const reviewContext = await sessions.reviewScopeContext(repairedVerification, state.workflows['wf-repair-prompt'], state)
  assert.equal(reviewContext.ownerSubmission.report.summary, 'Added the requested API regression coverage.')
  const packageFree = structuredClone(state)
  const packageFreeAttempt = packageFree.workflows['wf-repair-prompt'].attempts[repairedAttempt.id]
  const packageFreeAction = packageFree.actions[repairedVerification.id]
  const packageFreeOwner = Object.values(packageFree.actions).find(action => action.kind === 'execute_owner'
    && action.attemptId === repairedAttempt.id)
  packageFreeAttempt.dispatchContract.taskPackage = null
  packageFreeOwner.input.taskPackage = null
  packageFreeOwner.inputDigest = kernelDigest(packageFreeOwner.input)
  packageFreeAction.input.taskPackage = null
  packageFreeAction.inputDigest = kernelDigest(packageFreeAction.input)
  const packageFreeContext = await sessions.reviewScopeContext(packageFreeAction,
    packageFree.workflows['wf-repair-prompt'], packageFree)
  assert.deepEqual(packageFreeContext, { ownerSubmission: reviewContext.ownerSubmission },
    'a candidate without planning packages must still receive its bound Owner submission')
  for (const mutate of [
    current => { current.workflows['wf-repair-prompt'].attempts[repairedAttempt.id].submission.report.summary = 'unbound replacement' },
    current => { current.workflows['wf-repair-prompt'].attempts[repairedAttempt.id].submission.manifestDigest = '0'.repeat(64) },
    current => {
      const action = current.actions[repairedVerification.id]
      action.input.candidate.submissionArtifact = '/runtime/submissions/other.json'
      action.inputDigest = kernelDigest(action.input)
    },
  ]) {
    const drifted = structuredClone(state); mutate(drifted)
    await assert.rejects(sessions.reviewScopeContext(drifted.actions[repairedVerification.id],
      drifted.workflows['wf-repair-prompt'], drifted), /submission review binding changed|Candidate review acceptance context changed/)
  }
  await store.transact({ type: 'action.claim', actionId: repairedVerification.id, token: 'repair-reviewer', hostId: 'fixture' })
  repairedVerification.status = 'running'
  await sessions.execute(repairedVerification, {
    started: evidence => store.transact({ type: 'action.started', actionId: repairedVerification.id, token: 'repair-reviewer', evidence }),
  }, { role: 'reviewer', worktree: value.root, prompt: candidateReviewPrompt({
    candidate: repairedVerification.input.candidate, task: repairedVerification.input.task,
    results: [{ verificationId: 'command-contract', passed: true, exitCode: 0 }],
  }) })

  assert.deepEqual(prompts.map(item => item.role), ['owner', 'reviewer'])
  const ownerPrompt = JSON.parse(prompts[0].prompt)
  const reviewerSupplement = JSON.parse(prompts[1].prompt.split('\n\n').at(-1))
  assert.deepEqual(reviewerSupplement.repair, ownerPrompt.repair)
  assert.equal(reviewerSupplement.ownerSubmission.report.summary, 'Added the requested API regression coverage.')
  assert.equal(reviewerSupplement.ownerSubmission.attemptId, repairedAttempt.id)
  assert.equal(reviewerSupplement.ownerSubmission.candidateCommitSha, 'candidate-review-content')
  assert.equal(typeof reviewerSupplement.ownerSubmission.artifact, 'string')
  assert.equal(typeof reviewerSupplement.ownerSubmission.manifestDigest, 'string')
  assert.deepEqual(reviewerSupplement.ownerSubmission.paths, [])
  assert.equal(prompts[1].submitParameters.properties.report.properties.commitSha.const, 'candidate-review-content')
  assert.equal(ownerPrompt.repair.instructions, instructions)
  assert.deepEqual(ownerPrompt.repair.verification.review.reasons, ['The API regression test is absent.'])
  assert.equal(ownerPrompt.repair.verification.review.evidenceRef, '/runtime/reviews/initial.json')
  assert.deepEqual(ownerPrompt.repair.verification.results[0].argv, ['node', 'scripts/verify-acceptance-command.mjs'])
  for (const { prompt } of prompts) {
    assert.doesNotMatch(prompt, /"manifest"|docs\/figma|runtime-review-session/)
  }
})

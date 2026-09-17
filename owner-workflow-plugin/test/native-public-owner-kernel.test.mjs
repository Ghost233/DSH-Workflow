import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { kernelNativeHost } from './fixtures/kernel-native-host.mjs'
import { KernelRuntime } from '../src/kernel-runtime.mjs'
import { normalizePlanV2 } from '../src/model.mjs'
import { kernelDigest } from '../src/workflow-engine.mjs'
import { publicOwnerContextDigest } from '../src/public-owner-change.mjs'
import { readSessionEvents } from '../src/dsh-execution.mjs'
import { git } from '../src/git.mjs'
import { kernelToolDefinitions } from '../src/kernel-tools.mjs'
import { compilePlanningPackages } from '../src/planning-packages.mjs'
import { artifactPath, publishArtifact } from '../src/effect-artifacts.mjs'
import { loadPlanningCheckpointSnapshot, runPlanningCheckpoint } from '../src/planning-checkpoint.mjs'
import { ensureRegistry, proposeRegistryChange, applyApprovedRegistryChange } from '../src/registry.mjs'
import { registerOrchestratorDocumentGuards } from '../src/orchestrator-documents.mjs'
import { createBoundSource, fixture as checkpointFixture, request as checkpointRequest, sha256, trustedAuthorize } from './fixtures/planning-checkpoint-fixture.mjs'

function *call(id, name, args) {
  const argumentsJson = JSON.stringify(args)
  yield { type: 'block-start', index: 0, blockType: 'tool-call' }
  yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson }
  yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsJson } }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}

function judgment(decision) {
  const { contract, requestId, requestVersion, requestDigest, targetOwnerId, baseline, ...value } = decision
  return value
}

async function settleAction(store, action, token, result) {
  await store.transact({ type: 'action.claim', actionId: action.id, hostId: 'fixture', token })
  return store.transact({ type: 'action.result', actionId: action.id, token, result })
}

function planningDocument(kind, document, body) {
  const { path, sha256: _sourceHash, ...declaration } = document
  const headers = {
    planning_document: 'DSH_PLANNING_DOCUMENT_V1',
    document_kind: kind,
    document_id: document.id,
    document_revision: document.revision,
    ...(kind === 'ticket' ? { spec_id: document.spec.id, spec_revision: document.spec.revision } : {}),
    planning_declaration: JSON.stringify(declaration),
  }
  return `---\n${Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\n')}\n---\n\n# ${document.id}\n\n${body}\n`
}

function sourceDocuments(value, { revision, contracts, specBody, ticketBody, workId }) {
  const spec = { path: value.docs.spec.path, id: value.docs.spec.id, revision, acceptanceCriteria: ['AC-27'], contracts }
  const ticket = { path: value.docs.ticket.path, id: value.docs.ticket.id, revision,
    spec: { id: spec.id, revision: spec.revision },
    acceptanceCriteria: [{ id: 'AC-27', specId: spec.id, specRevision: spec.revision }],
    contracts, dependsOn: [], work: { ready: [{ id: workId }], blocked: [] } }
  const finalSpec = planningDocument('spec', spec, specBody)
  const finalTicket = planningDocument('ticket', ticket, ticketBody)
  return { spec: { ...spec, sha256: sha256(Buffer.from(finalSpec)) }, ticket: { ...ticket, sha256: sha256(Buffer.from(finalTicket)) },
    finalSpec, finalTicket }
}

for (const outcome of ['compatible_extension', 'migration_required', 'capability_sufficient', 'rejected', 'facts_missing', 'business_decision_required']) test(`public Owner independently reads the contract and consumer before ${outcome}`, { timeout: 30_000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-public-')))
  const project = join(root, 'project'); await mkdir(project)
  for (const owner of ['public', 'app', 'cache']) await mkdir(join(project, 'src', owner), { recursive: true })
  await writeFile(join(project, 'src', 'public', 'contract.md'), 'K1: reset clears all state. K2 must preserve the recovery consumer.')
  await writeFile(join(project, 'src', 'cache', 'recovery.md'), 'The cache consumer depends on persisted recovery after a reset.')
  await git(project, ['init', '-q']); await git(project, ['add', '.'])
  await git(project, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'public contract fixture'])
  let report, calls = 0
  const host = await kernelNativeHost(project, { executable: true, filesystem: true, persistenceRoot: join(root, 'sessions'), model: async function *(options) {
    assert.equal(options.tools.some(tool => tool.name === 'write' || tool.name === 'edit'), false)
    if (++calls === 1) yield* call('shared-contract', 'read', { file_path: 'src/public/contract.md' })
    else if (calls === 2) yield* call('downstream-recovery', 'read', { file_path: 'src/cache/recovery.md' })
    else if (calls === 3) yield* call('public-decision', 'workflow_action_submit', { report: { decision: judgment(report) } })
    else assert.fail('Public Owner must conclude after its accepted decision')
  } })
  const runtime = new KernelRuntime(host.ctx, { catalogRoot: root, registryVerifier: async () => {} }); await runtime.ready
  t.after(async () => { await runtime.dispose(); await host.close(); await rm(root, { recursive: true, force: true }) })
  const plan = normalizePlanV2({ contract: 'DSH_PLAN_V2', registryDigest: 'a'.repeat(64), summary: 'Controlled public contract fixture',
    owners: ['public', 'app', 'cache'].map(id => ({ id, name: id, description: id, scope: [`src/${id}/**`], exclude: [] })),
    tasks: ['public', 'app', 'cache'].map(id => ({ id, role: 'work', ownerId: id, title: id, write: [`src/${id}/**`], dependsOn: [], verify: ['unit'], done: ['Keep recovery'] })),
    verifications: [{ id: 'unit', run: ['node', '--test'] }] })
  await runtime.store.transact({ type: 'workflow.create', id: 'wf', root: project, rootSessionId: host.parent.agent.id, request: 'controlled public fixture', baseCommit: await git(project, ['rev-parse', 'HEAD']) })
  await runtime.store.transact({ type: 'plan.activate', workflowId: 'wf', parentVersion: 0, plan,
    sources: { snapshotDigest: 'controlled-fixture' }, authorization: { scope: 'implementation', sourceId: 'controlled-fixture' },
    review: { status: 'passed', planDigest: kernelDigest(plan), evidenceRef: 'controlled-fixture' } })
  const context = { workflowId: 'wf', planRevision: 1, planDigest: kernelDigest(plan), owners: ['public', 'app', 'cache'],
    tickets: [{ id: 'T1', revision: 'R1' }], acceptanceCriteria: ['AC-recovery'],
    contracts: [{ id: 'shared', revision: 'K1', ownerId: 'public' }], evidenceRefs: ['ev-gap', 'ev-shared', 'ev-cache'], consumerInventoryComplete: true,
    consumers: [{ consumerId: 'cache', ownerId: 'cache', contract: { id: 'shared', revision: 'K1' }, evidenceRefs: ['ev-cache'] }] }
  const request = { contract: 'DSH_PUBLIC_OWNER_CHANGE_REQUEST_V1', requestId: 'reset', requestVersion: 1, requesterOwnerId: 'app', targetOwnerId: 'public',
    source: { tickets: context.tickets, acceptanceCriteria: context.acceptanceCriteria },
    baseline: { workflowId: 'wf', planRevision: 1, planDigest: kernelDigest(plan), contract: { id: 'shared', revision: 'K1' }, contextDigest: publicOwnerContextDigest(context) },
    expectedBehavior: 'Clear the app cache', actualGap: 'Global reset loses recovery', evidenceRefs: ['ev-gap'], suggestion: 'Add a scoped reset', supersedesRequestDigest: null }
  const requested = await runtime.store.transact({ type: 'public_owner.request', workflowId: 'wf', context, request })
  const action = (await runtime.store.transact({ type: 'action.claim', actionId: requested.result, hostId: 'fixture', token: 'claim' })).result
  report = { contract: 'DSH_PUBLIC_OWNER_CHANGE_DECISION_V1', decisionId: 'scoped-reset', requestId: request.requestId, requestVersion: 1,
    requestDigest: action.input.requestDigest, targetOwnerId: 'public', baseline: request.baseline, outcome: 'compatible_extension',
    summary: 'Scoped reset preserves cache recovery', basisRefs: ['ev-shared', 'ev-cache'],
    affectedConsumers: [{ consumerId: 'cache', ownerId: 'cache', impact: 'no_change', evidenceRefs: ['ev-cache'] }],
    contractChange: { nextRevision: 'K2', behavior: 'Scoped app reset', compatibility: 'Keep K1 recovery' }, migrationOrder: [], alternative: null, unknowns: [], businessChange: null }
  report.outcome = outcome
  if (outcome === 'migration_required') { report.affectedConsumers[0].impact = 'update_required'; report.migrationOrder = ['cache'] }
  if (!['compatible_extension', 'migration_required'].includes(outcome)) report.contractChange = null
  if (outcome === 'rejected') report.alternative = { kind: 'alternative', detail: 'Reuse the existing scoped storage API without changing global reset.' }
  if (outcome === 'facts_missing') report.unknowns = [{ fact: 'Recovery ordering across scoped stores is not established', ownerId: 'cache', closeWhen: 'Read the scoped storage recovery implementation and provide its exact contract evidence' }]
  if (outcome === 'business_decision_required') report.businessChange = { acceptanceCriterion: 'AC-recovery', currentCommitment: 'Keep recovery after reset', proposedCommitment: 'Discard recovery after reset', consequence: 'The user loses persisted recovery state' }
  const result = await runtime.effects.adapters.consult_owner.execute(action, {
    started: evidence => runtime.store.transact({ type: 'action.started', actionId: action.id, token: 'claim', evidence }) })
  await runtime.store.transact({ type: 'action.result', actionId: action.id, token: 'claim', result })
  const state = await runtime.store.read()
  assert.equal(state.workflows.wf.publicOwnerDecisionSessions['reset:1'].decision.outcome, outcome)
  const events = (await readSessionEvents(host.ctx.sessionPersistence, result.sessionId)).events
  assert.equal(events.filter(event => event.type === 'tool/result' && !event.data.message.content[0].isError).length, 3)
  await runtime.store.transact({ type: 'drive' })
  assert.equal(Object.values((await runtime.store.read()).actions).filter(action => action.kind === 'execute_owner').length, outcome === 'capability_sufficient' ? 3 : 0)
  const projected = await runtime.store.readView('wf')
  if (outcome === 'business_decision_required') { assert.equal(projected.actionRequired, true); assert.equal(projected.status, 'waiting') }
  else if (outcome !== 'capability_sufficient') { assert.equal(projected.status, 'failed'); assert.equal(projected.attention.find(item => item.id === 'public-owner:reset').responsibleParty, 'root_session') }
  if (['compatible_extension', 'migration_required'].includes(outcome)) await assert.rejects(runtime.store.transact({ type: 'plan.activate', workflowId: 'wf', parentVersion: 1, plan,
    sources: { snapshotDigest: 'fixture-2' }, authorization: { scope: 'implementation', sourceId: 'fixture' },
    review: { status: 'passed', planDigest: kernelDigest(plan), evidenceRef: 'fixture-2' } }), /required_decision_missing/)
  const issue = Object.values(state.workflows.wf.issues).find(item => item.origin === 'public_owner')
  assert.equal(issue.status, outcome === 'capability_sufficient' ? 'closed' : 'open')
  if (['facts_missing', 'compatible_extension'].includes(outcome)) {
    const revised = { ...request, requestVersion: 2, supersedesRequestDigest: action.input.requestDigest,
      actualGap: 'The scoped storage recovery contract is now included in ev-cache', evidenceRefs: ['ev-gap', 'ev-cache'] }
    const second = await runtime.store.transact({ type: 'public_owner.request', workflowId: 'wf', context, request: revised })
    assert.equal((await runtime.store.transact({ type: 'public_owner.request', workflowId: 'wf', context, request: revised })).result, second.result)
    const updated = await runtime.store.read()
    assert.equal(updated.workflows.wf.recoveryUsed, 1)
    assert.equal(updated.workflows.wf.issues[issue.id].used, 1)
    await assert.rejects(runtime.store.transact({ type: 'public_owner.request', workflowId: 'wf', context,
      request: { ...request, requestId: 'renamed-request' } }), /original public Owner request identity/)
    await assert.rejects(runtime.store.transact({ type: 'public_owner.request', workflowId: 'wf', context,
      request: { ...revised, requestVersion: 3, supersedesRequestDigest: updated.actions[second.result].input.requestDigest } }), /same facts without progress/)
    const nextAction = (await runtime.store.transact({ type: 'action.claim', actionId: second.result, hostId: 'fixture', token: 'second-claim' })).result
    calls = 0
    report = { ...report, decisionId: 'existing-scoped-capability', requestVersion: 2, requestDigest: nextAction.input.requestDigest,
      outcome: 'capability_sufficient', contractChange: null, unknowns: [], summary: 'The existing scoped storage API meets the original recovery contract' }
    const nextResult = await runtime.effects.adapters.consult_owner.execute(nextAction, {
      started: evidence => runtime.store.transact({ type: 'action.started', actionId: nextAction.id, token: 'second-claim', evidence }) })
    await runtime.store.transact({ type: 'action.result', actionId: nextAction.id, token: 'second-claim', result: nextResult })
    assert.equal((await runtime.store.read()).workflows.wf.issues[issue.id].status, 'closed')
    // The superseded extension decision must not force the new plan to carry
    // a now-invalid extension binding after the Owner verified existing capability.
    await runtime.store.transact({ type: 'plan.activate', workflowId: 'wf', parentVersion: 1, plan,
      sources: { snapshotDigest: 'fixture-2' }, authorization: { scope: 'implementation', sourceId: 'fixture' },
      review: { status: 'passed', planDigest: kernelDigest(plan), evidenceRef: 'fixture-2' } })
    await runtime.store.transact({ type: 'drive' })
    assert.equal(Object.values((await runtime.store.read()).actions).filter(action => action.kind === 'execute_owner').length, 3)
  }
})

test('root public request survives a native contract source revision before independent decision and main notice', { timeout: 60_000 }, async t => {
  // The first checkpoint and the restarted host represent one durable root
  // session. Keep that stable identity instead of bypassing startWorkflow with
  // a source authored by an unrelated fixture session.
  const value = await checkpointFixture(t, { agentId: 'kernel-main' })
  if (!value) return
  const runnerContract = { id: 'acceptance-runner', revision: 'v1' }
  const initialDocuments = sourceDocuments(value, { revision: 'R1', contracts: [],
    specBody: 'final checkpoint specification.', ticketBody: 'final checkpoint ticket.', workId: 'checkpoint-kernel' })
  value.docs = { ...value.docs, ...initialDocuments }
  await writeFile(join(value.root, value.docs.spec.path), planningDocument('spec', value.docs.spec, 'baseline checkpoint specification.'))
  await writeFile(join(value.root, value.docs.ticket.path), planningDocument('ticket', value.docs.ticket, 'baseline checkpoint ticket.'))
  let registry = await ensureRegistry(value.root)
  for (const owner of [
    { id: 'build', name: 'Build tooling', description: 'Owns the public runner', scope: ['scripts/**'], exclude: [] },
    { id: 'quality', name: 'Quality automation', description: 'Consumes the runner', scope: ['tests/**'], exclude: [] },
  ]) {
    const proposal = proposeRegistryChange(registry, { type: 'add', owner, reason: 'Native public Owner source-revision fixture' })
    registry = await applyApprovedRegistryChange(value.root, { ...proposal, approvedDigest: proposal.digest })
  }
  await git(value.root, ['add', '.'])
  await git(value.root, ['commit', '-qm', 'contractless planning source'])
  value.baseline.head = await git(value.root, ['rev-parse', 'HEAD'])
  const chains = await createBoundSource(value)
  const checkpoint = checkpointRequest(value, chains, 'public-owner-root-adapter')
  await runPlanningCheckpoint({ root: value.root, cwd: value.root, request: checkpoint, authorize: trustedAuthorize({ calls: 0 }),
    withLease: operation => operation({ signal: new AbortController().signal, assertLease: async () => {} }) })
  const snapshot = await loadPlanningCheckpointSnapshot({ root: value.root, id: checkpoint.id })
  const owners = registry.owners
  const task = (id, ownerId, dependsOn, verify) => ({ id, title: id, role: 'work', ownerId,
    write: ownerId === 'build' ? ['scripts/**'] : ['tests/**'], dependsOn, resources: [], verify, done: [`${id} done`] })
  const binding = (taskId, contract = []) => ({ taskId, tickets: [{ id: value.docs.ticket.id, revision: value.docs.ticket.revision,
    fragments: ['checkpoint-kernel'] }], contracts: contract })
  const plan = normalizePlanV2({ contract: 'DSH_PLAN_V2', registryDigest: kernelDigest(registry), summary: 'Public Owner root adapter', owners,
    tasks: [task('bootstrap', 'build', [], ['build-check']), task('foundation', 'quality', ['bootstrap'], ['quality-check'])],
    verifications: [{ id: 'build-check', run: [process.execPath, '--version'] }, { id: 'quality-check', run: [process.execPath, '--version'] }],
    planningBindings: { contract: 'DSH_PLANNING_BINDINGS_V1', snapshotId: snapshot.id, sourceDigest: snapshot.sourceDigest,
      tasks: [binding('bootstrap'), binding('foundation')] } })
  const packages = compilePlanningPackages({ snapshot, plan })
  const catalog = await mkdtemp(join(tmpdir(), 'ukr-public-root-'))
  const artifacts = join(catalog, 'artifacts'); await mkdir(artifacts)
  const packagesRef = artifactPath(artifacts, `packages-${kernelDigest(packages)}`)
  await publishArtifact(packagesRef, packages)
  let feedbackSent = false
  let publicActionInput
  const host = await kernelNativeHost(value.root, { executable: true, filesystem: true, persistenceRoot: join(catalog, 'sessions'), model: async function *(options) {
    const prompt = JSON.stringify(options)
    const names = new Set(options.tools?.map(tool => tool.name))
    if (names.has('owner_submit')) {
      assert.match(prompt, /foundation/u)
      if (!feedbackSent) {
        feedbackSent = true
        yield* call('feedback', 'owner_execution_feedback', { report: { kind: 'public_contract_gap', sourceId: 'runner-contract-gap',
          contractId: 'acceptance-runner', issue: 'quality tests cannot register the suite because scripts are owned by build tooling',
          detail: 'The current frozen quality task requires the build-owned public runner contract.' } })
      } else yield* call('blocked', 'owner_submit', { report: { status: 'blocked', summary: 'Waiting for public build-tooling contract review.' } })
      return
    }
    assert.equal(names.has('workflow_action_submit'), true)
    assert.match(prompt, /sourceFeedback/u)
    assert.match(prompt, /quality tests cannot register/u)
    const context = publicActionInput.context
    yield* call('public-decision', 'workflow_action_submit', { report: { decision: {
      decisionId: 'runner-contract-capability', outcome: 'capability_sufficient', summary: 'The frozen runner contract is sufficient.',
      basisRefs: [context.evidenceRefs[0]], affectedConsumers: context.consumers.map(item => ({ consumerId: item.consumerId,
        ownerId: item.ownerId, impact: 'no_change', evidenceRefs: item.evidenceRefs })), contractChange: null,
      migrationOrder: [], alternative: null, unknowns: [], businessChange: null,
    } } })
  } })
  const runtime = new KernelRuntime(host.ctx, { catalogRoot: catalog, registryVerifier: async () => {} }); await runtime.ready
  assert.equal(snapshot.source.source.agentId, host.parent.agent.id)
  assert.equal(snapshot.source.source.sessionId, host.parent.agent.id)
  const definitions = kernelToolDefinitions(runtime)
  const disposers = definitions.map(definition => host.parent.agent.ctx.tools.register(definition))
  disposers.push(...registerOrchestratorDocumentGuards(host.ctx, runtime))
  disposers.push(host.ctx.tools.guard(exec => runtime.checkToolExecution(exec)))
  runtime.runner.start = () => {}
  t.after(async () => { for (const dispose of disposers.reverse()) dispose(); await runtime.dispose(); await host.close(); await rm(catalog, { recursive: true, force: true }) })
  const baseCommit = await git(value.root, ['rev-parse', 'HEAD'])
  await runtime.store.transact({ type: 'workflow.create', id: 'wf-root-public', root: value.root, rootSessionId: host.parent.agent.id,
    request: 'Use the public runner', baseBranch: snapshot.codeBaseline.branch, baseCommit })
  await runtime.store.transact({ type: 'plan.activate', workflowId: 'wf-root-public', parentVersion: 0, plan,
    authorization: { scope: 'implementation', sourceId: 'fixture' },
    sources: { checkpointId: checkpoint.id, snapshotDigest: kernelDigest(snapshot), packagesRef },
    review: { status: 'passed', evidenceRef: '/review', planDigest: kernelDigest(plan) } })
  await runtime.store.transact({ type: 'drive' })
  let state = await runtime.store.read()
  const build = Object.values(state.actions).find(action => action.kind === 'execute_owner')
  await runtime.store.transact({ type: 'action.claim', actionId: build.id, hostId: 'fixture', token: 'build' })
  await runtime.store.transact({ type: 'action.started', actionId: build.id, token: 'build', evidence: { handleId: 'build', sessionId: 'build' } })
  const buildAttempt = state.workflows['wf-root-public'].attempts[build.attemptId]
  await runtime.store.transact({ type: 'owner.submit', workflowId: 'wf-root-public', attemptId: build.attemptId,
    authority: buildAttempt.authority, report: { status: 'completed', summary: 'Existing producer candidate.' }, manifestDigest: 'manifest', artifact: value.root })
  await runtime.store.transact({ type: 'action.result', actionId: build.id, token: 'build', result: {
    executionSettled: true, sourceWritesClosed: true, authority: buildAttempt.authority,
  } })
  state = await runtime.store.read()
  const seal = Object.values(state.actions).find(action => action.kind === 'seal_candidate')
  await settleAction(runtime.store, seal, 'seal', { artifact: value.root, commitSha: 'build-content', authority: buildAttempt.authority })
  state = await runtime.store.read()
  const verify = Object.values(state.actions).find(action => action.kind === 'verify_candidate')
  await settleAction(runtime.store, verify, 'verify', { passed: true, commitSha: 'build-content', executionSettled: true,
    review: { passed: true, commitSha: 'build-content' }, results: [{ verificationId: 'build-check', passed: true,
      exitCode: 0, commitSha: 'build-content' }] })
  state = await runtime.store.read()
  const integrate = Object.values(state.actions).find(action => action.kind === 'integrate_candidate')
  await settleAction(runtime.store, integrate, 'integrate', { commitSha: baseCommit, worklogRef: '/worklog', baseCommit,
    candidateCommit: 'build-content', verified: true })
  await runtime.store.transact({ type: 'drive' })
  state = await runtime.store.read()
  const foundation = Object.values(state.actions).find(action => action.kind === 'execute_owner' && action.input.task.id === 'foundation')
  await runtime.store.transact({ type: 'action.claim', actionId: foundation.id, hostId: 'fixture', token: 'foundation' })
  const settlement = await runtime.sessions.execute(foundation, { started: evidence => runtime.store.transact({ type: 'action.started', actionId: foundation.id,
    token: 'foundation', evidence }) })
  assert.equal(settlement.pending, true)
  assert.equal(Object.values((await runtime.store.read()).actions).filter(action => action.kind === 'stop_execution'
    && action.attemptId === foundation.attemptId).length, 1)
  let status = await runtime.status(host.parent.agent, 'wf-root-public')
  let seed = status.publicOwnerRequests.find(item => item.feedbackOrigin?.taskId === 'foundation')
  assert.equal(seed.status, 'source_revision_required')
  assert.deepEqual(seed.currentSource.contracts, [])
  const tool = definitions.find(item => item.name === 'workflow_public_owner_request')
  const requestInput = { workflow_id: 'wf-root-public', source_issue_id: seed.issueId, target_owner_id: 'build',
    contract_id: runnerContract.id, expected_behavior: 'Quality registers its suite through the public runner.',
    actual_gap: seed.feedbackOrigin.report.issue, suggestion: 'Use the existing public registration contract.',
    consumer_task_ids: ['foundation'], consumer_inventory_complete: true }
  const beforeMissing = await runtime.store.read()
  assert.equal(beforeMissing.workflows['wf-root-public'].issues[seed.issueId].blocksActivation, false)
  const missing = await tool.execute(requestInput,
    { agent: host.parent.agent, callId: 'root-public-missing', signal: new AbortController().signal })
  const afterMissing = await runtime.store.read()
  assert.equal(missing.status, 'source_revision_required')
  assert.equal(afterMissing.workflows['wf-root-public'].recoveryUsed, beforeMissing.workflows['wf-root-public'].recoveryUsed)
  assert.equal(afterMissing.workflows['wf-root-public'].publicOwnerChangeLog, undefined)
  assert.equal(Object.keys(afterMissing.actions).length, Object.keys(beforeMissing.actions).length)

  const revisedDocuments = sourceDocuments(value, { revision: 'R2', contracts: [runnerContract],
    specBody: 'The acceptance runner is a public build-tooling contract.',
    ticketBody: 'Build tooling produces the public acceptance runner for quality consumers.', workId: 'checkpoint-kernel-r2' })
  const rootCall = (name, arguments_, callId) => host.parent.agent.ctx.tools.execute({ name, arguments: arguments_, agent: host.parent.agent,
    callId, signal: new AbortController().signal })
  assert.equal((await rootCall('read', { file_path: join(value.root, value.docs.spec.path) }, 'source-r2-read-spec')).isError, false)
  assert.equal((await rootCall('edit', { file_path: join(value.root, value.docs.spec.path),
    old_string: await readFile(join(value.root, value.docs.spec.path), 'utf8'), new_string: revisedDocuments.finalSpec }, 'source-r2-edit-spec')).isError, false)
  assert.equal((await rootCall('read', { file_path: join(value.root, value.docs.ticket.path) }, 'source-r2-read-ticket')).isError, false)
  assert.equal((await rootCall('edit', { file_path: join(value.root, value.docs.ticket.path),
    old_string: await readFile(join(value.root, value.docs.ticket.path), 'utf8'), new_string: revisedDocuments.finalTicket }, 'source-r2-edit-ticket')).isError, false)
  host.parent.agent.session.append('user/message', { id: 'source-r2-user', role: 'user',
    content: [{ type: 'text', text: 'Declare the public acceptance runner contract and continue this workflow.' }], source: { kind: 'user' } }, { surfaceOp: 'append' })
  const finalize = definitions.find(item => item.name === 'workflow_planning_finalize')
  const revisedFrozen = await finalize.execute({ implementation_request: {
    quote: 'Declare the public acceptance runner contract and continue this workflow.',
    rationale: 'The revision declares the producer contract required by the persisted quality feedback.',
  } }, { agent: host.parent.agent, callId: 'source-r2-finalize', signal: new AbortController().signal })
  const revisedSnapshot = revisedFrozen.snapshot
  assert.equal(revisedSnapshot.parentSnapshotId, snapshot.id)
  const revisedBinding = taskId => ({ taskId, tickets: [{ id: revisedDocuments.ticket.id, revision: revisedDocuments.ticket.revision,
    fragments: ['checkpoint-kernel-r2'] }], contracts: [runnerContract] })
  const revisedPlan = normalizePlanV2({ ...plan, planningBindings: { contract: 'DSH_PLANNING_BINDINGS_V1',
    snapshotId: revisedSnapshot.id, sourceDigest: revisedSnapshot.sourceDigest,
    tasks: [revisedBinding('bootstrap'), revisedBinding('foundation')] } })
  const revisedPackages = compilePlanningPackages({ snapshot: revisedSnapshot, plan: revisedPlan })
  const revisedPackagesRef = artifactPath(artifacts, `packages-${kernelDigest(revisedPackages)}`)
  await publishArtifact(revisedPackagesRef, revisedPackages)
  const replan = definitions.find(item => item.name === 'workflow_replan')
  await replan.execute({ workflow_id: 'wf-root-public', affected_task_ids: ['bootstrap', 'foundation'], affected_verification_ids: [], checkpoint_id: revisedSnapshot.checkpointId,
    reason: 'Bind the declared public runner contract to the same producer and consumer tasks.' },
  { agent: host.parent.agent, callId: 'root-public-source-replan', signal: new AbortController().signal })
  state = await runtime.store.read()
  const planning = Object.values(state.actions).find(action => action.kind === 'plan' && action.input.snapshotDigest === kernelDigest(revisedSnapshot))
  const projectedFeedback = planning.input.ownerFeedbackFacts.find(item => item.id === seed.issueId)
  assert.equal(planning.input.openObligations.some(item => item.id === seed.issueId), false)
  assert.equal(projectedFeedback.blocksActivation, false)
  assert.equal(projectedFeedback.report.issue, 'quality tests cannot register the suite because scripts are owned by build tooling')
  await settleAction(runtime.store, planning, 'source-plan', { plan: revisedPlan, packagesRef: revisedPackagesRef,
    evidenceRef: '/source-plan', snapshotDigest: kernelDigest(revisedSnapshot) })
  state = await runtime.store.read()
  const review = Object.values(state.actions).find(action => action.kind === 'review_plan' && action.input.snapshotDigest === kernelDigest(revisedSnapshot))
  assert.deepEqual(review.input.ownerFeedbackFacts, planning.input.ownerFeedbackFacts)
  assert.equal(review.input.openObligations.some(item => item.id === seed.issueId), false)
  await settleAction(runtime.store, review, 'source-review', { planDigest: kernelDigest(revisedPlan),
    snapshotDigest: kernelDigest(revisedSnapshot), evidenceRef: '/source-review',
    review: { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: 'The public runner has one explicit producer and bound consumer.', issues: [] } })
  state = await runtime.store.read()
  const stoppedAttempt = state.workflows['wf-root-public'].attempts[foundation.attemptId]
  const stop = Object.values(state.actions).find(action => action.kind === 'stop_execution' && action.attemptId === foundation.attemptId)
  await settleAction(runtime.store, stop, 'source-stop', { executionSettled: true, sourceWritesClosed: true,
    terminationId: 'source-revision-stop', authority: stoppedAttempt.authority, attemptId: stoppedAttempt.id })
  await runtime.store.transact({ type: 'drive' })
  state = await runtime.store.read()
  const prepare = Object.values(state.actions).find(action => action.kind === 'prepare_revision' && action.status !== 'succeeded')
  assert.ok(prepare)
  await settleAction(runtime.store, prepare, 'source-prepare', { baseCommit, checkpointCommit: revisedSnapshot.codeBaseline.checkpointCommit,
    commitSha: revisedSnapshot.codeBaseline.checkpointCommit, executionSettled: true, sourceWritesClosed: true, evidenceRef: '/source-prepare' })
  state = await runtime.store.read()
  assert.equal(state.workflows['wf-root-public'].planVersion, 2)
  assert.equal(state.workflows['wf-root-public'].tasks.bootstrap.attemptId, null)
  assert.equal(state.workflows['wf-root-public'].attempts[build.attemptId].phase, 'succeeded')
  assert.equal(state.workflows['wf-root-public'].attempts[build.attemptId].candidate.commitSha, 'build-content')
  status = await runtime.status(host.parent.agent, 'wf-root-public')
  seed = status.publicOwnerRequests.find(item => item.issueId === seed.issueId)
  assert.equal(seed.status, 'ready_for_public_owner_request')
  assert.equal(seed.feedbackOrigin.planVersion, 1)
  assert.equal(seed.currentSource.planVersion, 2)
  assert.equal(seed.currentSource.contracts[0].ownerId, 'build')
  await tool.execute(requestInput, { agent: host.parent.agent, callId: 'root-public-request', signal: new AbortController().signal })
  state = await runtime.store.read()
  publicActionInput = Object.values(state.actions).find(action => action.kind === 'consult_owner').input
  for (let count = 0; count < 12; count++) {
    await runtime.effects.pump(); await runtime.effects.drain()
    state = await runtime.store.read()
    if (Object.values(state.actions).some(action => action.kind === 'notify_main' && action.input.reason === 'public_owner_decision' && action.status === 'succeeded')) break
  }
  state = await runtime.store.read()
  const decision = state.workflows['wf-root-public'].publicOwnerDecisionSessions?.[`${seed.issueId}:1`]?.decision
  assert.equal(decision?.outcome, 'capability_sufficient', JSON.stringify(Object.values(state.actions).map(action => ({
    id: action.id, kind: action.kind, status: action.status, failure: action.failure, input: action.kind === 'consult_owner' ? action.input : undefined,
  }))))
  assert.equal(decision?.targetOwnerId, 'build')
  assert.equal(state.workflows['wf-root-public'].issues[seed.issueId].status, 'closed')
  assert.equal(state.workflows['wf-root-public'].issues[seed.issueId].evidence.kind, 'public_owner_resolution')
  assert.equal((await runtime.status(host.parent.agent, 'wf-root-public')).publicOwnerRequests.some(item => item.issueId === seed.issueId), false)
  const notice = Object.values(state.actions).find(action => action.kind === 'notify_main' && action.input.reason === 'public_owner_decision')
  assert.equal(notice?.status, 'succeeded')
  const events = (await readSessionEvents(host.ctx.sessionPersistence, host.parent.agent.id)).events
  assert.match(JSON.stringify(events), /public_owner_decision/u)
})

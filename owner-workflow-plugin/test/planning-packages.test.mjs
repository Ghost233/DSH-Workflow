import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  compilePlanningPackages,
  normalizePlanningBindings,
  planningPackageForTask,
  dispatchedPlanningPackage,
} from '../src/planning-packages.mjs'
import { NativePlanningEffects, plannerSubmission } from '../src/native-planning-effects.mjs'
import { WorkflowStore } from '../src/workflow-store.mjs'
import { normalizePlanV2 } from '../src/model.mjs'
import { artifactPath, readArtifact } from '../src/effect-artifacts.mjs'
import { kernelDigest } from '../src/workflow-engine.mjs'
import { loadPlanningCheckpointSnapshot, runPlanningCheckpoint } from '../src/planning-checkpoint.mjs'
import { createBoundSource, fixture as checkpointFixture, request as checkpointRequest, trustedAuthorize } from './fixtures/planning-checkpoint-fixture.mjs'

function canonical(value) {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}

function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

function sourceTicket({ id, acceptanceId, dependsOn = [], ready, blocked = [] }) {
  return {
    id,
    revision: 'R1',
    document: { path: `docs/specs/${id}.md`, sha256: `${id.toLowerCase().replace(/[^a-z0-9]/gu, '')}`.padEnd(64, '0').slice(0, 64), content: `# ${id}\n` },
    spec: { id: 'SPEC-PACKAGES', revision: 'R1' },
    acceptanceCriteria: [{ id: acceptanceId, specId: 'SPEC-PACKAGES', specRevision: 'R1' }],
    contracts: [{ id: 'C-1', revision: 'v1' }, { id: 'C-2', revision: 'v2' }],
    dependsOn,
    work: { ready: ready.map(id => ({ id })), blocked: blocked.map(id => ({ id, reason: 'fixed blocker' })) },
  }
}

function fixture() {
  const ticketOne = sourceTicket({ id: 'T-1', acceptanceId: 'AC-1', ready: ['T-1:implementation'], blocked: ['T-1:future'] })
  const ticketTwo = sourceTicket({ id: 'T-2', acceptanceId: 'AC-2', dependsOn: ['T-1'], ready: ['T-2:integration'] })
  const references = {
    contract: 'DSH_PLANNING_REFERENCE_SET_V1',
    spec: {
      id: 'SPEC-PACKAGES', revision: 'R1', path: 'docs/specs/spec.md', sha256: 'a'.repeat(64), content: '# frozen spec\n',
      acceptanceCriteria: ['AC-1', 'AC-2'],
      contracts: [{ id: 'C-1', revision: 'v1', status: 'ready' }, { id: 'C-2', revision: 'v2', status: 'ready' }],
    },
    tickets: [ticketOne, ticketTwo],
    ready: [{ ticketId: 'T-1', segment: { id: 'T-1:implementation' } }],
    blocked: [
      { ticketId: 'T-1', segment: { id: 'T-1:future', reason: 'fixed blocker' }, blockedBy: [{ kind: 'declared_blocked_scope', ticketId: 'T-1', segmentId: 'T-1:future' }] },
      { ticketId: 'T-2', segment: { id: 'T-2:integration' }, blockedBy: [{ kind: 'blocked_dependency', ticketId: 'T-1' }] },
    ],
  }
  const source = { contract: 'DSH_PLANNING_SOURCE_CHAIN_V1', references, baseline: { branch: 'main', head: 'b'.repeat(40) }, source: { agentId: 'main', sessionId: 'session', chains: [] } }
  const sourceDigest = digest(source)
  const snapshot = {
    contract: 'DSH_PLANNING_CHECKPOINT_SNAPSHOT_V1', id: 'snapshot-packages', checkpointId: 'checkpoint-packages',
    projectRoot: '/tmp/frozen', source, sourceDigest,
    codeBaseline: { branch: 'main', sourceHead: 'b'.repeat(40), checkpointCommit: 'c'.repeat(40), checkpointTree: 'd'.repeat(40) },
    authorization: { id: 'grant-1', contract: 'TEST' }, reason: 'package test', parentSnapshotId: null,
  }
  const bindings = {
    contract: 'DSH_PLANNING_BINDINGS_V1', snapshotId: snapshot.id, sourceDigest,
    tasks: [
      { taskId: 'task-s', tickets: [{ id: 'T-1', revision: 'R1', fragments: ['T-1:implementation'] }], contracts: [{ id: 'C-1', revision: 'v1' }, { id: 'C-2', revision: 'v2' }] },
      { taskId: 'task-a', tickets: [{ id: 'T-1', revision: 'R1', fragments: ['T-1:implementation'] }], contracts: [{ id: 'C-1', revision: 'v1' }, { id: 'C-2', revision: 'v2' }] },
      { taskId: 'task-b', tickets: [{ id: 'T-2', revision: 'R1', fragments: ['T-2:integration'] }], contracts: [{ id: 'C-1', revision: 'v1' }, { id: 'C-2', revision: 'v2' }] },
    ],
  }
  const owners = ['s', 'a', 'b'].map(id => ({ id, name: id, description: id, scope: [`src/${id}/**`], exclude: [] }))
  const plan = {
    contract: 'DSH_PLAN_V2', executable: true, registryDigest: 'e'.repeat(64), summary: 'frozen package plan', owners,
    verifications: [{ id: 'verify_unit', run: ['node', '--test'], cwd: '.' }],
    tasks: [
      { id: 'task-s', ownerId: 's', dependsOn: [], verify: ['verify_unit'], role: 'work', write: ['src/s/**'], done: ['S done'] },
      { id: 'task-a', ownerId: 'a', dependsOn: ['task-s'], verify: ['verify_unit'], role: 'work', write: ['src/a/**'], done: ['A done'] },
      { id: 'task-b', ownerId: 'b', dependsOn: ['task-a'], verify: ['verify_unit'], role: 'work', write: ['src/b/**'], done: ['B done'] },
    ],
    planningBindings: bindings,
  }
  return { snapshot, plan, bindings }
}

function refreshSourceDigest(value) {
  value.snapshot.sourceDigest = digest(value.snapshot.source)
  value.plan.planningBindings.sourceDigest = value.snapshot.sourceDigest
}

function addTask(value, { id, ownerId, dependsOn, tickets }) {
  value.plan.owners.push({ id: ownerId, name: ownerId, description: ownerId, scope: [`src/${ownerId}/**`], exclude: [] })
  value.plan.tasks.push({ id, ownerId, dependsOn, verify: ['verify_unit'], role: 'work', write: [`src/${ownerId}/**`], done: [`${id} done`] })
  value.plan.planningBindings.tasks.push({
    taskId: id,
    tickets: tickets.map(ticket => ({ id: ticket.id, revision: ticket.revision, fragments: ticket.work.ready.map(item => item.id) })),
    contracts: [{ id: 'C-1', revision: 'v1' }, { id: 'C-2', revision: 'v2' }],
  })
}

for (const scenario of ['partial-patch', 'extra-binding', 'wrong-binding']) test(`binding diagnostics identify every missing and unknown task: ${scenario}`, () => {
  const { snapshot, plan } = fixture()
  const bindings = structuredClone(plan.planningBindings)
  if (scenario === 'partial-patch') bindings.tasks = bindings.tasks.slice(0, 1)
  if (scenario === 'extra-binding') bindings.tasks.push({ ...structuredClone(bindings.tasks[0]), taskId: 'unknown-task' })
  if (scenario === 'wrong-binding') bindings.tasks[1].taskId = 'unknown-task'
  const action = { input: { previousPlan: plan, registryDigest: plan.registryDigest,
    revisionBoundary: { taskIds: ['task-s'], verificationIds: [] } } }
  const before = structuredClone(plan)
  const merged = plannerSubmission({ planPatch: {
    tasks: [{ ...plan.tasks[0], done: ['Revised outcome'] }], verifications: [], planningBindings: bindings,
  } }, action, { owners: plan.owners })
  assert.deepEqual(plan, before)
  const expected = {
    missingTaskIds: scenario === 'partial-patch' ? ['task-a', 'task-b'] : scenario === 'wrong-binding' ? ['task-a'] : [],
    unknownTaskIds: scenario === 'partial-patch' ? [] : ['unknown-task'],
  }
  assert.throws(() => compilePlanningPackages({ snapshot, plan: merged }), error => {
    assert.equal(error.field, 'plan.planningBindings.tasks')
    assert.ok(error.message.includes(JSON.stringify(expected)), error.message)
    return true
  })
  merged.planningBindings = structuredClone(plan.planningBindings)
  assert.equal(compilePlanningPackages({ snapshot, plan: merged }).packages.length, 3)
})

test('a retained dispatch keeps its original content-addressed source package and rejects provenance or contract drift', () => {
  const { snapshot, plan } = fixture()
  const packages = compilePlanningPackages({ snapshot, plan })
  const original = packages.packages[0]
  const dispatch = { task: original.task, owner: original.owner, verifications: original.verification }
  const input = { snapshot, packages, packageDigest: digest(packages), dispatch }
  assert.deepEqual(dispatchedPlanningPackage(input), original)
  assert.equal(dispatchedPlanningPackage(input).tickets[0].revision, 'R1')
  for (const field of ['task', 'owner', 'verifications']) {
    const changed = structuredClone(dispatch)
    if (field === 'task') changed.task.done = ['A new obligation']
    else if (field === 'owner') changed.owner.scope.push('.npmrc')
    else changed.verifications[0].run = ['node', 'different.mjs']
    assert.throws(() => dispatchedPlanningPackage({ ...input, dispatch: changed }), /PACKAGE_SET_MISMATCH/)
  }
  const tampered = structuredClone(packages)
  tampered.packages[0].tickets[0].revision = 'R11'
  assert.throws(() => dispatchedPlanningPackage({ ...input, packages: tampered }), /PACKAGE_SET_MISMATCH/)
  assert.throws(() => dispatchedPlanningPackage({ ...input, snapshot: { ...snapshot, id: 'snapshot-R11' } }), /PACKAGE_SET_MISMATCH/)
  const blocked = packages.packages[2]
  assert.throws(() => dispatchedPlanningPackage({ ...input,
    dispatch: { task: blocked.task, owner: blocked.owner, verifications: blocked.verification } }), /BLOCKED_PACKAGE/)
})

test('dispatch package compares complete verification definitions by identity without rewriting dispatch order', () => {
  const { snapshot, plan } = fixture()
  plan.verifications.push({ id: 'verify_extra', run: ['node', '--version'], cwd: '.' })
  plan.tasks[0].verify = ['verify_extra', 'verify_unit']
  const packages = compilePlanningPackages({ snapshot, plan })
  const original = packages.packages[0]
  const dispatch = { task: original.task, owner: original.owner,
    verifications: plan.verifications.filter(item => original.task.verify.includes(item.id)) }
  const input = { snapshot, packages, packageDigest: digest(packages), dispatch }
  const before = structuredClone(dispatch)
  assert.deepEqual(dispatchedPlanningPackage(input), original)
  assert.deepEqual(dispatch, before)
  for (const change of ['duplicate', 'missing', 'definition']) {
    const altered = structuredClone(dispatch)
    if (change === 'duplicate') altered.verifications[1] = structuredClone(altered.verifications[0])
    if (change === 'missing') altered.verifications.pop()
    if (change === 'definition') altered.verifications[0].run = ['node', '--help']
    assert.throws(() => dispatchedPlanningPackage({ ...input, dispatch: altered }), /PACKAGE_SET_MISMATCH/)
  }
})

test('one-owner packages retain full frozen Ticket/Spec data, shared AC contributors and dependency blockers', () => {
  const value = fixture()
  const set = compilePlanningPackages({ snapshot: value.snapshot, plan: value.plan })
  assert.equal(set.contract, 'DSH_PLANNING_PACKAGE_SET_V1')
  assert.ok(Object.isFrozen(set))
  assert.deepEqual(set.blockedFragments, value.snapshot.source.references.blocked)
  assert.equal(set.packages.length, 3)
  const [s, a, b] = set.packages
  assert.equal(s.owner.id, 's')
  assert.equal(a.owner.id, 'a')
  assert.equal(b.owner.id, 'b')
  assert.equal(s.registryDigest, value.plan.registryDigest)
  assert.equal(s.status, 'planned')
  assert.equal(a.status, 'planned')
  assert.equal(b.status, 'blocked')
  assert.equal(b.tickets[0].document.content, '# T-2\n')
  assert.deepEqual(b.tickets[0].acceptanceCriteria, value.snapshot.source.references.tickets[1].acceptanceCriteria)
  assert.deepEqual(b.contracts, [{ id: 'C-1', revision: 'v1' }, { id: 'C-2', revision: 'v2' }])
  assert.deepEqual(b.verification[0], { id: 'verify_unit', run: ['node', '--test'], cwd: '.' })
  assert.deepEqual(b.inputs.find(item => item.kind === 'ticket_dependency').producers.map(item => item.taskId), ['task-a', 'task-s'])
  assert.deepEqual(set.acceptanceIndex.find(item => item.id === 'AC-1').contributors.map(item => item.taskId), ['task-a', 'task-s'])
  assert.equal(planningPackageForTask({ snapshot: value.snapshot, plan: value.plan, packages: set, taskId: 'task-s', ownerId: 's' }).taskId, 'task-s')
  assert.throws(() => planningPackageForTask({ snapshot: value.snapshot, plan: value.plan, packages: set, taskId: 'task-b', ownerId: 'b' }), /BLOCKED_PACKAGE/)
})

test('Ticket dependency diagnostics identify downstream claimants that require a main-thread source split', () => {
  const value = fixture()
  const ticketOne = value.snapshot.source.references.tickets[0]
  addTask(value, { id: 'task-z', ownerId: 'z', dependsOn: ['task-b'], tickets: [ticketOne] })
  refreshSourceDigest(value)

  assert.throws(() => compilePlanningPackages({ snapshot: value.snapshot, plan: value.plan }), error => {
    assert.equal(error.code, 'TICKET_DEPENDENCY_UNSATISFIED')
    assert.equal(error.field, 'task(task-b).dependsOn')
    assert.ok(error.message.includes(JSON.stringify({
      dependencyTicketId: 'T-1',
      missingProducerTaskIds: ['task-z'],
      downstreamProducerTaskIds: ['task-z'],
      sourceTicketIssue: 'upstream_and_downstream_work_share_dependency_ticket',
      requiredResolution: 'main_thread_must_split_source_ticket',
    })), error.message)
    return true
  })
})

test('Ticket dependency diagnostics retain every real producer and sort missing producer task ids', () => {
  const value = fixture()
  value.plan.tasks.find(item => item.id === 'task-a').dependsOn = []
  const ticketOne = value.snapshot.source.references.tickets[0]
  addTask(value, { id: 'task-c', ownerId: 'c', dependsOn: [], tickets: [ticketOne] })

  assert.throws(() => compilePlanningPackages({ snapshot: value.snapshot, plan: value.plan }), error => {
    assert.equal(error.code, 'TICKET_DEPENDENCY_UNSATISFIED')
    assert.equal(error.field, 'task(task-b).dependsOn')
    assert.ok(error.message.includes(JSON.stringify({
      dependencyTicketId: 'T-1',
      missingProducerTaskIds: ['task-c', 'task-s'],
      downstreamProducerTaskIds: [],
    })), error.message)
    return true
  })
})

test('native Planner preserves an exact Ticket dependency rejection before reporting every out-of-bound consumer', async t => {
  const value = fixture()
  const ticketOne = value.snapshot.source.references.tickets[0]
  const ticketTwo = value.snapshot.source.references.tickets[1]
  addTask(value, { id: 'task-d', ownerId: 'd', dependsOn: ['task-a'], tickets: [ticketTwo] })
  const previous = normalizePlanV2(value.plan)
  compilePlanningPackages({ snapshot: value.snapshot, plan: previous })
  const candidate = { snapshot: value.snapshot, plan: structuredClone(previous) }
  addTask(candidate, { id: 'task-c', ownerId: 'c', dependsOn: [], tickets: [ticketOne] })
  candidate.plan = normalizePlanV2(candidate.plan)

  const root = await mkdtemp(join(tmpdir(), 'ukr-ticket-boundary-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const artifacts = join(root, 'artifacts'); await mkdir(artifacts)
  const store = new WorkflowStore(root); await store.initialize()
  await store.transact({ type: 'workflow.create', id: 'wf', root, rootSessionId: 'root', request: 'T04 dependency', baseCommit: 'base' })
  const input = { parentVersion: 0, checkpointId: value.snapshot.checkpointId, snapshotDigest: kernelDigest(value.snapshot),
    registryDigest: previous.registryDigest, previousPlan: previous, previousPlanDigest: kernelDigest(previous),
    revisionBoundary: { taskIds: ['task-c'], verificationIds: [] }, sources: { snapshotDigest: kernelDigest(value.snapshot) },
    authorization: { scope: 'implementation', sourceId: 'root' } }
  const { result: id } = await store.transact({ type: 'action.enqueue', workflowId: 'wf', kind: 'plan', key: 'ticket-boundary', input })
  await store.transact({ type: 'drive' })
  await store.transact({ type: 'action.claim', actionId: id, token: 'planner', hostId: 'fixture' })
  const action = (await store.read()).actions[id]
  const effects = new NativePlanningEffects({}, store, {}, artifacts)
  effects.boundInputs = async () => ({ snapshot: value.snapshot, registry: { owners: candidate.plan.owners } })
  const receipt = artifactPath(root, 'planner-receipt')
  await assert.rejects(effects.validate(action, { plan: candidate.plan }, 'planner', { evidenceRef: receipt }), error => {
    assert.equal(error.code, 'TICKET_DEPENDENCY_UNSATISFIED')
    assert.equal(error.field, 'task(task-b).dependsOn')
    assert.match(error.message, /"missingProducerTaskIds":\["task-c"\]/u)
    return true
  })
  const restartedEffects = new NativePlanningEffects({}, store, {}, artifacts)
  restartedEffects.boundInputs = effects.boundInputs
  const blocked = await restartedEffects.validate(action, { review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'Both dependency consumers require the new producer.', issues: [
      { severity: 'high', obligationId: 'task-b-producer', sourceId: 'T-2', sourceVersion: 'R1', targetTaskIds: ['task-b'],
        title: 'Bind task-b to task-c', detail: 'task-b must wait for every T-1 producer.', suggestion: 'Expand the task boundary.',
        closeWhen: { kind: 'plan_task_executable', taskId: 'task-b' } },
      { severity: 'high', obligationId: 'task-d-producer', sourceId: 'T-2', sourceVersion: 'R1', targetTaskIds: ['task-d'],
        title: 'Bind task-d to task-c', detail: 'task-d must wait for every T-1 producer.', suggestion: 'Expand the task boundary.',
        closeWhen: { kind: 'plan_task_executable', taskId: 'task-d' } },
    ],
  } }, 'planner', { evidenceRef: receipt })
  assert.equal(blocked.validationFailures.length, 1)
  assert.equal(blocked.validationFailures[0].code, 'TICKET_DEPENDENCY_UNSATISFIED')
  assert.equal(blocked.validationFailures[0].field, 'task(task-b).dependsOn')
  assert.match(blocked.validationFailures[0].detail, /"dependencyTicketId":"T-1"/u)
  assert.deepEqual((await readArtifact(blocked.validationFailures[0].evidenceRef)).detail, blocked.validationFailures[0].detail)
})

test('a separate terminal acceptance Ticket compiles after all upstream Ticket producers', () => {
  const value = fixture()
  const terminal = sourceTicket({ id: 'T-3', acceptanceId: 'AC-3', dependsOn: ['T-1', 'T-2'], ready: ['T-3:acceptance'] })
  value.snapshot.source.references.tickets.push(terminal)
  value.snapshot.source.references.spec.acceptanceCriteria.push('AC-3')
  value.snapshot.source.references.ready.push({ ticketId: 'T-3', segment: { id: 'T-3:acceptance' } })
  addTask(value, { id: 'task-z', ownerId: 'z', dependsOn: ['task-b'], tickets: [terminal] })
  refreshSourceDigest(value)

  const packages = compilePlanningPackages({ snapshot: value.snapshot, plan: value.plan })
  assert.deepEqual(packages.packages.map(item => item.taskId), ['task-s', 'task-a', 'task-b', 'task-z'])
})

for (const scenario of ['unknown-fragment', 'blocked-fragment', 'unknown-contract', 'missing-known-contract', 'omitted-ready', 'missing-ticket-edge', 'task-cycle', 'wrong-snapshot', 'wrong-source', 'mixed-owner-package']) test(`compiler rejects ${scenario}`, () => {
  const value = fixture()
  if (scenario === 'unknown-fragment') value.plan.planningBindings.tasks[0].tickets[0].fragments = ['T-1:unknown']
  if (scenario === 'blocked-fragment') value.plan.planningBindings.tasks[0].tickets[0].fragments = ['T-1:future']
  if (scenario === 'unknown-contract') value.plan.planningBindings.tasks[0].contracts = [{ id: 'C-404', revision: 'v1' }]
  if (scenario === 'missing-known-contract') value.plan.planningBindings.tasks[0].contracts = [{ id: 'C-1', revision: 'v1' }]
  if (scenario === 'omitted-ready') value.plan.planningBindings.tasks[2].tickets = [{ id: 'T-1', revision: 'R1', fragments: ['T-1:implementation'] }]
  if (scenario === 'missing-ticket-edge') value.plan.tasks[2].dependsOn = []
  if (scenario === 'task-cycle') value.plan.tasks[1].dependsOn = ['task-b']
  if (scenario === 'wrong-snapshot') value.plan.planningBindings.snapshotId = 'snapshot-other'
  if (scenario === 'wrong-source') value.plan.planningBindings.sourceDigest = 'f'.repeat(64)
  if (scenario === 'mixed-owner-package') {
    const set = compilePlanningPackages({ snapshot: value.snapshot, plan: value.plan })
    const altered = structuredClone(set)
    altered.packages[0].owner.id = 'a'
    assert.throws(() => planningPackageForTask({ snapshot: value.snapshot, plan: value.plan, packages: altered, taskId: 'task-s', ownerId: 'a' }), /PACKAGE_SET_MISMATCH/)
    return
  }
  assert.throws(() => compilePlanningPackages({ snapshot: value.snapshot, plan: value.plan }), /Planning packages:/)
})

test('bindings normalizer rejects duplicate task, Ticket fragment and contract identities without mutating optional absence', () => {
  assert.equal(normalizePlanningBindings(undefined), undefined)
  const value = fixture().bindings
  value.tasks.push(structuredClone(value.tasks[0]))
  assert.throws(() => normalizePlanningBindings(value), /DUPLICATE_BINDING/)
})

test('completed checkpoint reader returns frozen persisted snapshot without revalidating current planning files', async t => {
  const value = await checkpointFixture(t)
  if (value === undefined) return
  const chains = await createBoundSource(value)
  const currentRequest = checkpointRequest(value, chains)
  await runPlanningCheckpoint({
    root: value.root,
    cwd: value.root,
    request: currentRequest,
    authorize: trustedAuthorize({ calls: 0 }),
    withLease: operation => operation({ signal: new AbortController().signal, assertLease: async () => {} }),
  })
  await writeFile(`${value.root}/${value.docs.spec.path}`, 'later mutable draft does not alter persisted snapshot')
  const snapshot = await loadPlanningCheckpointSnapshot({ root: value.root, id: currentRequest.id })
  assert.ok(Object.isFrozen(snapshot))
  assert.equal(snapshot.id, `snapshot-${currentRequest.id}`)
  assert.equal(snapshot.source.references.spec.content, value.docs.finalSpec)
})

test('checkpoint snapshot reader rejects a nonterminal journal without resuming it', async t => {
  const value = await checkpointFixture(t)
  if (value === undefined) return
  const chains = await createBoundSource(value)
  const currentRequest = checkpointRequest(value, chains)
  await assert.rejects(runPlanningCheckpoint({
    root: value.root,
    cwd: value.root,
    request: currentRequest,
    authorize: trustedAuthorize({ calls: 0 }),
    withLease: operation => operation({ signal: new AbortController().signal, assertLease: async () => {} }),
    fault: async stage => { if (stage === 'after-journal-prepared') throw new Error('leave durable incomplete checkpoint') },
  }), /leave durable incomplete checkpoint/)
  await assert.rejects(loadPlanningCheckpointSnapshot({ root: value.root, id: currentRequest.id }), /CHECKPOINT_SNAPSHOT_INCOMPLETE/)
})

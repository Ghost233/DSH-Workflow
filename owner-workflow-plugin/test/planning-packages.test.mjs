import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import {
  compilePlanningPackages,
  normalizePlanningBindings,
  planningPackageForTask,
} from '../src/planning-packages.mjs'
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

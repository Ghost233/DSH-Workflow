import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { compilePlanningPackages } from '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/planning-packages.mjs'

function canonical(value) {
  if (value === null) return 'null'
  if (['string', 'boolean', 'number'].includes(typeof value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}

const digest = value => createHash('sha256').update(canonical(value)).digest('hex')
const fragment = id => `${id}:implementation`
const ticket = (id, dependsOn = []) => ({
  id,
  revision: 'R1',
  document: { path: `${id}.md`, sha256: id.replace('-', '').padEnd(64, '0'), content: id },
  spec: { id: 'SPEC', revision: 'R1' },
  acceptanceCriteria: [],
  contracts: [],
  dependsOn,
  work: { ready: [{ id: fragment(id) }], blocked: [] },
})

function input(tasks, claims, ticketDefs = [['T-01', []], ['T-02', ['T-01']]]) {
  const tickets = ticketDefs.map(([id, dependsOn]) => ticket(id, dependsOn))
  const references = {
    contract: 'DSH_PLANNING_REFERENCE_SET_V1',
    spec: { id: 'SPEC', revision: 'R1', acceptanceCriteria: [], contracts: [] },
    tickets,
    ready: tickets.map(item => ({ ticketId: item.id, segment: { id: fragment(item.id) } })),
    blocked: [],
  }
  const source = {
    contract: 'DSH_PLANNING_SOURCE_CHAIN_V1', references,
    baseline: { branch: 'main', head: 'b'.repeat(40) },
    source: { agentId: 'main', sessionId: 'session', chains: [] },
  }
  const snapshot = {
    contract: 'DSH_PLANNING_CHECKPOINT_SNAPSHOT_V1', id: 'snapshot', source,
    sourceDigest: digest(source),
  }
  const taskIds = tasks.map(item => item.id)
  const plan = {
    contract: 'DSH_PLAN_V2', executable: true, registryDigest: 'e'.repeat(64), summary: 'audit',
    owners: taskIds.map(id => ({ id: `owner_${id}`, scope: [`src/${id}/**`], exclude: [] })),
    verifications: [],
    tasks: tasks.map(item => ({
      id: item.id, ownerId: `owner_${item.id}`, dependsOn: item.dependsOn, verify: [],
      role: 'work', write: [`src/${item.id}/**`], done: [`${item.id} done`],
    })),
    planningBindings: {
      contract: 'DSH_PLANNING_BINDINGS_V1', snapshotId: snapshot.id, sourceDigest: snapshot.sourceDigest,
      tasks: taskIds.map(taskId => ({
        taskId,
        tickets: (claims[taskId] ?? []).map(id => ({ id, revision: 'R1', fragments: [fragment(id)] })),
        contracts: [],
      })),
    },
  }
  return { snapshot, plan }
}

function compile(label, tasks, claims, ticketDefs) {
  try {
    const result = compilePlanningPackages(input(tasks, claims, ticketDefs))
    console.log(`${label}: PASS`)
    return result
  } catch (error) {
    console.log(`${label}: ${error.code} ${error.field} :: ${error.message}`)
    return error
  }
}

// One upstream producer of T-01 and one consumer/producer of T-02 is valid.
const baseline = compile('baseline', [
  { id: 'fixtures', dependsOn: [] },
  { id: 'panel', dependsOn: ['fixtures'] },
], { fixtures: ['T-01'], panel: ['T-02'] })
assert.equal(baseline.contract, 'DSH_PLANNING_PACKAGE_SET_V1')

// Exact live shape: downstream journey verification also claims T-01's only fragment.
const downstreamClaim = compile('downstream-journey-claim', [
  { id: 'fixtures', dependsOn: [] },
  { id: 'panel', dependsOn: ['fixtures'] },
  { id: 'journey_tests', dependsOn: ['fixtures', 'panel'] },
], { fixtures: ['T-01'], panel: ['T-02'], journey_tests: ['T-01'] })
assert.equal(downstreamClaim.code, 'TICKET_DEPENDENCY_UNSATISFIED')
assert.equal(downstreamClaim.field, 'task(panel).dependsOn')
assert.match(downstreamClaim.message, /T-01/)

// Making panel depend on the downstream claimant cannot satisfy the model: it creates a DAG cycle.
const reverseEdge = compile('reverse-edge', [
  { id: 'fixtures', dependsOn: [] },
  { id: 'panel', dependsOn: ['fixtures', 'journey_tests'] },
  { id: 'journey_tests', dependsOn: ['fixtures', 'panel'] },
], { fixtures: ['T-01'], panel: ['T-02'], journey_tests: ['T-01'] })
assert.equal(reverseEdge.code, 'TASK_DEPENDENCY_CYCLE')

// Two genuine upstream producers are valid only when the consumer reaches both.
const allProducers = compile('two-real-producers-all-edges', [
  { id: 'producer_a', dependsOn: [] },
  { id: 'producer_b', dependsOn: [] },
  { id: 'panel', dependsOn: ['producer_a', 'producer_b'] },
], { producer_a: ['T-01'], producer_b: ['T-01'], panel: ['T-02'] })
assert.equal(allProducers.contract, 'DSH_PLANNING_PACKAGE_SET_V1')
const panelPackage = allProducers.packages.find(item => item.taskId === 'panel')
assert.deepEqual(panelPackage.inputs.find(item => item.kind === 'ticket_dependency').producers.map(item => item.taskId), ['producer_a', 'producer_b'])

const oneProducerEdgeMissing = compile('two-real-producers-one-edge-missing', [
  { id: 'producer_a', dependsOn: [] },
  { id: 'producer_b', dependsOn: [] },
  { id: 'panel', dependsOn: ['producer_a'] },
], { producer_a: ['T-01'], producer_b: ['T-01'], panel: ['T-02'] })
assert.equal(oneProducerEdgeMissing.code, 'TICKET_DEPENDENCY_UNSATISFIED')

// Moving downstream journey work to a terminal Ticket keeps the compiler rule intact and the DAG expressible.
const splitTerminalTicket = compile('split-terminal-acceptance-ticket', [
  { id: 'fixtures', dependsOn: [] },
  { id: 'panel', dependsOn: ['fixtures'] },
  { id: 'journey_tests', dependsOn: ['fixtures', 'panel'] },
], { fixtures: ['T-01'], panel: ['T-02'], journey_tests: ['T-05'] }, [
  ['T-01', []],
  ['T-02', ['T-01']],
  ['T-05', ['T-01', 'T-02']],
])
assert.equal(splitTerminalTicket.contract, 'DSH_PLANNING_PACKAGE_SET_V1')

console.log('AUDIT_ASSERTIONS_OK')

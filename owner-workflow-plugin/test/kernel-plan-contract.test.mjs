import test from 'node:test'
import assert from 'node:assert/strict'
import { roleReportParameters } from '../src/kernel-role-contracts.mjs'
import { normalizePlanV2, PLAN_V2_SUBMISSION_SCHEMA } from '../src/model.mjs'
import {
  assertPublicOwnerPlanAuthority,
  normalizePublicOwnerPlanBindings,
  PUBLIC_OWNER_PLAN_BINDINGS_SCHEMA,
  PUBLIC_OWNER_PLAN_BINDING_SCHEMA,
} from '../src/public-owner-plan.mjs'
import * as planningEffects from '../src/native-planning-effects.mjs'
import { taskExecutionDigest } from '../src/workflow-engine.mjs'

test('local Planner patch preserves omitted definitions and rejects edits outside its admitted boundary', () => {
  const previousPlan = { contract: 'DSH_PLAN_V2', registryDigest: 'old', summary: 'Preserve',
    owners: [{ id: 'api', scope: ['src/**'] }], tasks: [{ id: 'A', done: ['old'] }, { id: 'B', done: ['stable'] }],
    verifications: [{ id: 'unit', run: ['node', '--test'] }, { id: 'stable', run: ['node', 'stable.mjs'] }],
    planningBindings: { snapshotId: 'old' } }
  const original = structuredClone(previousPlan)
  const action = { input: { previousPlan, registryDigest: 'new', revisionBoundary: { taskIds: ['A'], verificationIds: ['unit'] } } }
  const registry = { owners: [{ id: 'api', scope: ['src/**', 'scripts/**'] }] }
  const patch = { tasks: [{ id: 'A', done: ['fixed'] }], verifications: [{ id: 'unit', run: ['node', 'wrapper.mjs'] }], planningBindings: { snapshotId: 'current' } }
  const result = planningEffects.plannerSubmission({ planPatch: patch }, action, registry)
  assert.deepEqual(result.tasks[1], previousPlan.tasks[1])
  assert.deepEqual(result.verifications[1], previousPlan.verifications[1])
  assert.equal(result.registryDigest, 'new')
  assert.deepEqual(result.owners, registry.owners)
  assert.deepEqual(previousPlan, original)
  assert.throws(() => planningEffects.plannerSubmission({ planPatch: { ...patch, tasks: [{ id: 'B' }] } }, action, registry), /boundary/)
  assert.throws(() => planningEffects.plannerSubmission({ planPatch: { ...patch, removeTaskIds: ['A'] } }, action, registry), /repeats/)
  assert.throws(() => planningEffects.plannerSubmission({ planPatch: patch }, { input: {} }, registry), /previous plan/)
  assert.throws(() => planningEffects.plannerSubmission({ planPatch: patch, plan: previousPlan }, action, registry), /either/)
})

test('a local Planner may create a verification identity only through a real authorized task binding', () => {
  const previousPlan = { contract: 'DSH_PLAN_V2', registryDigest: 'old', summary: 'Preserve',
    owners: [{ id: 'api', scope: ['src/**'] }],
    tasks: [{ id: 'A', ownerId: 'api', verify: ['unit'] }, { id: 'B', ownerId: 'api', verify: ['stable'] }],
    verifications: [{ id: 'unit', run: ['node', '--test'] }, { id: 'stable', run: ['node', 'stable.mjs'] }],
    planningBindings: { snapshotId: 'old' } }
  const action = { input: { previousPlan, registryDigest: 'new',
    revisionBoundary: { taskIds: ['A'], verificationIds: [] } } }
  const registry = { owners: previousPlan.owners }
  const bindings = { snapshotId: 'current' }
  const build = { id: 'web_build', run: ['npm', 'run', 'build'] }
  const changedA = { ...previousPlan.tasks[0], verify: ['unit', build.id] }

  const accepted = planningEffects.plannerSubmission({ planPatch: { tasks: [changedA],
    verifications: [build], planningBindings: bindings } }, action, registry)
  assert.deepEqual(accepted.tasks.find(item => item.id === 'A').verify, ['unit', 'web_build'])
  assert.deepEqual(accepted.verifications.find(item => item.id === 'web_build'), build)

  assert.throws(() => planningEffects.plannerSubmission({ planPatch: { tasks: [],
    verifications: [{ id: 'orphan', run: ['npm', 'run', 'build:ext'] }], planningBindings: bindings } }, action, registry), /boundary/,
  'a new definition without a matching binding is outside the grant')
  assert.throws(() => planningEffects.plannerSubmission({ planPatch: { tasks: [changedA],
    verifications: [{ id: 'unit', run: ['npm', 'run', 'build'] }], planningBindings: bindings } }, action, registry), /boundary/,
  'an existing verification definition still requires its explicit verification boundary')
})

test('an R11-sized rejected candidate can add one evidence leaf without rewriting its 18 tasks or 16 verifications', () => {
  const owners = [
    { id: 'implementation', scope: ['src/**'] },
    { id: 'docs', scope: ['docs/**'] },
  ]
  const verifications = Array.from({ length: 16 }, (_, index) => ({
    id: `verify-${index + 1}`,
    run: ['node', '--test', `tests/suite-${index + 1}.test.mjs`],
  }))
  const tasks = Array.from({ length: 18 }, (_, index) => ({
    id: `task-${index + 1}`,
    title: `R11 task ${index + 1}`,
    role: 'work',
    ownerId: 'implementation',
    dependsOn: index === 0 ? [] : [`task-${index}`],
    resources: [],
    write: ['src/**'],
    verify: [verifications[index % verifications.length].id],
    done: [`R11 outcome ${index + 1}`],
    priority: 0,
    onFailure: { action: 'notify_main' },
    onBlocked: { action: 'notify_main' },
    onTimeout: { action: 'notify_main', afterMs: 1_800_000 },
  }))
  const bindingTasks = revision => tasks.map(task => ({ taskId: task.id,
    tickets: [{ id: 'COINHUB-E2E-001', revision, fragments: ['implementation'] }], contracts: [] }))
  const previousPlan = normalizePlanV2({ contract: 'DSH_PLAN_V2', registryDigest: 'a'.repeat(64),
    summary: 'R11 acceptance candidate', owners, verifications, tasks, planningBindings: {
      contract: 'DSH_PLANNING_BINDINGS_V1', snapshotId: 'snapshot-R11', sourceDigest: 'c'.repeat(64), tasks: bindingTasks('R11'),
    } })
  const beforeTasks = new Map(previousPlan.tasks.map(task => [task.id, taskExecutionDigest(previousPlan, task)]))
  const recordTask = {
    id: 'record-r11-evidence', title: 'Record R11 evidence', role: 'work', ownerId: 'docs',
    dependsOn: ['task-18'], resources: [], write: ['docs/**'], verify: ['verify-record'],
    done: ['Persist the sanitized R11 evidence record.'], priority: 0,
    onFailure: { action: 'notify_main' }, onBlocked: { action: 'notify_main' },
    onTimeout: { action: 'notify_main', afterMs: 1_800_000 },
  }
  const bindings = { contract: 'DSH_PLANNING_BINDINGS_V1', snapshotId: 'snapshot-R12', sourceDigest: 'b'.repeat(64),
    tasks: [...bindingTasks('R12'), { taskId: recordTask.id,
      tickets: [{ id: 'COINHUB-E2E-001', revision: 'R12', fragments: ['implementation'] }], contracts: [] }] }
  const action = { input: { previousPlan, registryDigest: previousPlan.registryDigest,
    revisionBoundary: { taskIds: [recordTask.id], verificationIds: ['verify-record'] } } }
  const revised = normalizePlanV2(planningEffects.plannerSubmission({ planPatch: {
    tasks: [recordTask], verifications: [{ id: 'verify-record', run: ['node', 'scripts/verify-record.mjs'] }],
    planningBindings: bindings,
  } }, action, { owners }))

  assert.equal(revised.tasks.length, 19)
  assert.equal(revised.verifications.length, 17)
  for (const task of previousPlan.tasks) {
    assert.equal(taskExecutionDigest(revised, revised.tasks.find(item => item.id === task.id)), beforeTasks.get(task.id))
  }
  assert.deepEqual(revised.verifications.slice(0, 16), previousPlan.verifications)
})

function matches(schema, value) {
  return new RegExp(schema.pattern, 'u').test(value)
}

function missingRequired(schema, value) {
  return (schema.required ?? []).filter(field => !Object.hasOwn(value, field))
}

test('Planner contract accepts an executable plan with no public Owner change', () => {
  const raw = {
    contract: 'DSH_PLAN_V2',
    registryDigest: 'a'.repeat(64),
    summary: 'No public Owner contract changes',
    owners: [{ id: 'api', name: 'API', description: 'API owner', scope: ['src/**'], exclude: [] }],
    tasks: [{
      id: 'implement_api', title: 'Implement API', role: 'work', ownerId: 'api', write: ['src/**'],
      dependsOn: [], verify: ['unit'], done: ['Unit test passes'], priority: 10,
      decomposition: {
        status: 'leaf', kind: 'leaf', outcome: 'API implementation', ownerCandidates: ['api'], unknowns: [],
      },
      onFailure: { action: 'repair_owner', maxAttempts: 2 },
      onBlocked: { action: 'handoff_replan' },
    }],
    verifications: [{ id: 'unit', run: ['node', '--test', 'test/api.test.mjs'], cwd: '.' }],
    planningBindings: {
      contract: 'DSH_PLANNING_BINDINGS_V1', snapshotId: 'snapshot-1', sourceDigest: 'b'.repeat(64),
      tasks: [{
        taskId: 'implement_api',
        tickets: [{ id: 'T-1', revision: 'R1', fragments: ['implementation'] }],
        contracts: [],
      }],
    },
  }

  const normalized = normalizePlanV2(raw)
  assert.equal(Object.hasOwn(normalized, 'publicOwnerChanges'), false,
    'omission is the domain representation for no public Owner change')
  assert.deepEqual(missingRequired(PLAN_V2_SUBMISSION_SCHEMA, raw), [],
    'the tool contract must not force an omitted optional field to be submitted as []')
  assert.equal(PLAN_V2_SUBMISSION_SCHEMA.properties.publicOwnerChanges.minItems, 1,
    'a present publicOwnerChanges field must contain an authoritative binding')
})

test('Planner required fields follow normalization defaults plus package compilation', () => {
  const plan = PLAN_V2_SUBMISSION_SCHEMA
  assert.deepEqual(plan.required, [
    'contract', 'registryDigest', 'summary', 'owners', 'tasks', 'verifications', 'planningBindings',
  ])
  assert.deepEqual(plan.properties.owners.items.required, ['id', 'scope'],
    'name, description, exclude and parentOwnerId are optional normalization inputs')
  assert.deepEqual(plan.properties.tasks.items.required, ['id', 'role', 'ownerId', 'done'],
    'title, write, dependsOn and policy fields have normalizer defaults')
  assert.deepEqual(plan.properties.verifications.items.required, ['id', 'run'])
  assert.equal(plan.properties.verifications.minItems, undefined,
    'an abstract plan can legitimately have no fixed verification yet')
  assert.ok(plan.required.includes('planningBindings'),
    'compilePlanningPackages requires the frozen source binding for every Planner action')
  assert.equal(plan.required.includes('publicOwnerChanges'), false)
})

test('Planner public Owner binding schema is the exact domain-owned shape', () => {
  const publicChanges = PLAN_V2_SUBMISSION_SCHEMA.properties.publicOwnerChanges
  assert.equal(publicChanges, PUBLIC_OWNER_PLAN_BINDINGS_SCHEMA)
  assert.equal(publicChanges.items, PUBLIC_OWNER_PLAN_BINDING_SCHEMA)
  assert.equal(publicChanges.minItems, 1)
  assert.equal(publicChanges.items.additionalProperties, false)
  assert.deepEqual(publicChanges.items.required, [
    'contract', 'requestId', 'requestVersion', 'requestDigest', 'decisionId',
    'decisionDigest', 'targetOwnerId', 'outcome', 'implementationTaskId',
    'consumers', 'migrationOrder',
  ])
  assert.deepEqual(publicChanges.items.properties.outcome.enum, [
    'compatible_extension', 'migration_required',
  ])

  const consumer = publicChanges.items.properties.consumers.items
  assert.equal(publicChanges.items.properties.consumers.minItems, 1)
  assert.deepEqual(consumer.required, ['consumerId', 'ownerId', 'impact', 'taskId', 'contract'])
  assert.deepEqual(consumer.properties.impact.enum, ['no_change', 'compatible', 'update_required'])
  assert.match(JSON.stringify(consumer.allOf), /no_change/)
  assert.match(JSON.stringify(consumer.allOf), /null/)
  assert.throws(() => normalizePublicOwnerPlanBindings([]), /bindings_invalid/,
    'the domain contract keeps omission distinct from a present authoritative binding list')
})

test('omission cannot bypass required or historical public Owner authority', () => {
  assert.throws(() => assertPublicOwnerPlanAuthority({
    state: { plan: {} },
    plan: {},
    requiredDecisionDigests: ['a'.repeat(64)],
  }), /required_decision_missing/)
  assert.throws(() => assertPublicOwnerPlanAuthority({
    state: { plan: { publicOwnerChanges: [{ decisionDigest: 'b'.repeat(64) }] } },
    plan: {},
  }), /historical_binding_missing/)
})

test('Planner tool contract rejects the five invalid shapes observed in the live workflow', () => {
  const report = roleReportParameters('planner').properties.report
  const plan = report.properties.plan
  assert.equal(report.properties.review.properties.contract.enum[0], 'DSH_PLAN_REVIEW_V1')
  assert.deepEqual(report.oneOf.map(item => item.required[0]), ['plan', 'planPatch', 'review'])
  assert.equal(plan.properties.tasks, PLAN_V2_SUBMISSION_SCHEMA.properties.tasks,
    'execution fields retain the normalizer-owned contract')
  assert.equal(plan.required.includes('registryDigest'), false,
    'the admitted action binds Registry identity without model transcription')
  assert.equal(PLAN_V2_SUBMISSION_SCHEMA.required.includes('registryDigest'), true,
    'persisted plans still require Registry identity')
  const task = plan.properties.tasks.items
  const verification = plan.properties.verifications.items

  assert.equal(matches(verification.properties.cwd, '/Volumes/LargeStorage/code/Coinhub_Online_Demo'), false,
    'verification cwd must reject absolute paths before the Planner submits')
  assert.equal(matches(task.properties.verify.items, 'node scripts/offline-acceptance-precheck.mjs package.json'), false,
    'task.verify entries are verification ids, not shell commands')
  assert.equal(matches(task.properties.resources.items, 'OFFLINE-PRECHECK-001 implementation fragment'), false,
    'task.resources entries are lock identities, not prose')
  assert.equal(matches(task.properties.entry.items, 'The supplied ready implementation fragment is available.'), false,
    'task.entry entries are child task ids, not readiness prose')

  const conditionalContract = JSON.stringify(task.allOf)
  assert.match(conditionalContract, /"minItems":1/,
    'an executable leaf work task must expose its non-empty verify requirement in the tool contract')
})

test('Planner receives frozen requirements without authorization receipts or write journals', () => {
  assert.equal(typeof planningEffects.planningRoleInput, 'function')
  const references = {
    contract: 'DSH_PLANNING_REFERENCE_SET_V1',
    spec: { id: 'OFFLINE-PRECHECK', revision: 'R2', content: 'frozen spec' },
    tickets: [{ id: 'OFFLINE-PRECHECK-001', revision: 'R2', document: { content: 'frozen ticket' } }],
    ready: [{ ticketId: 'OFFLINE-PRECHECK-001', segment: { id: 'implementation' } }],
    blocked: [],
  }
  const snapshot = {
    contract: 'DSH_PLANNING_CHECKPOINT_SNAPSHOT_V1', id: 'snapshot-checkpoint', checkpointId: 'checkpoint',
    projectRoot: '/project', sourceDigest: 'a'.repeat(64), reason: 'implement', parentSnapshotId: null,
    codeBaseline: { branch: 'dev', sourceHead: '1'.repeat(40), checkpointCommit: '2'.repeat(40), checkpointTree: '3'.repeat(40) },
    source: { contract: 'DSH_PLANNING_SOURCE_CHAIN_V1', references, baseline: { branch: 'dev', head: '1'.repeat(40) },
      source: { agentId: 'root', sessionId: 'root', chains: [{ path: 'docs/spec.md', records: [{ secret: 'planning-write-journal-marker' }] }] } },
    authorization: { id: 'grant', receipt: { question: { detail: 'authorization-spec-duplicate' }, answer: { secret: 'native-answer-marker' } } },
  }

  const input = planningEffects.planningRoleInput(snapshot)
  assert.deepEqual(input.references, references)
  assert.equal(input.snapshot.id, snapshot.id)
  assert.equal(input.snapshot.sourceDigest, snapshot.sourceDigest)
  assert.doesNotMatch(JSON.stringify(input), /planning-write-journal-marker|authorization-spec-duplicate|native-answer-marker/)
})

test('Planner and Reviewer receive readable Owner feedback as a non-blocking fact', async () => {
  const prompts = []
  const prepared = []
  const snapshot = {
    id: 'snapshot-R6', checkpointId: 'R6', projectRoot: '/project', sourceDigest: 'a'.repeat(64),
    reason: 'replan', parentSnapshotId: 'snapshot-R5', codeBaseline: {},
    source: { references: { spec: { id: 'Spec', revision: 'R6' }, tickets: [] } },
  }
  const registry = { contract: 'DSH_OWNER_REGISTRY_V2', owners: [] }
  const effects = new planningEffects.NativePlanningEffects(
    { agents: { get: () => ({ id: 'root' }) } },
    { read: async () => ({ workflows: { wf: { rootSessionId: 'root', issues: {}, decisions: {} } } }) },
    { execute: async (_action, _context, options) => { prompts.push(options.prompt); prepared.push(options.worktree); return { pending: true } } },
    '/artifacts',
    { prepareSource: async (_action, commit) => ({ artifact: '/frozen/planning', baseCommit: commit }) },
  )
  effects.inputs = async action => ({ root: '/project', snapshot, registry, exactCommit: '1'.repeat(40),
    source: await effects.prepareSource(action, '1'.repeat(40)) })
  const ownerFeedbackFacts = [{ id: 'issue-feedback', origin: 'owner_feedback', status: 'open', blocksActivation: false,
    source: { taskId: 'foundation', ownerId: 'quality', attemptId: 'try-foundation' },
    report: { issue: 'The quality task cannot register the shared runner.' } }]
  const input = { checkpointId: 'R6', registryDigest: 'b'.repeat(64), openObligations: [], ownerFeedbackFacts,
    plan: { contract: 'DSH_PLAN_V2' }, planDigest: 'c'.repeat(64) }
  await effects.execute({ id: 'plan', workflowId: 'wf', kind: 'plan', input }, {})
  await effects.execute({ id: 'review', workflowId: 'wf', kind: 'review_plan', input }, {})
  for (const prompt of prompts) {
    assert.match(prompt, /ownerFeedbackFacts are persisted, non-blocking execution evidence/u)
    assert.match(prompt, /The quality task cannot register the shared runner/u)
    assert.match(prompt, /"blocksActivation":false/u)
    assert.match(prompt, /"openObligations":\[\]/u)
  }
  assert.deepEqual(prepared, ['/frozen/planning', '/frozen/planning'])
})

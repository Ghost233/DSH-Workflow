import assert from 'node:assert/strict'
import test from 'node:test'

import { kernelToolDefinitions } from '../src/kernel-tools.mjs'
import { kernelDigest } from '../src/workflow-engine.mjs'
import {
  materializePublicOwnerRequest,
  publicOwnerFeedbackSource,
  publicOwnerRequestSeed,
} from '../src/public-owner-adapter.mjs'
import { bindPublicOwnerChangeDecision } from '../src/public-owner-change.mjs'
import { roleReportParameters } from '../src/kernel-role-contracts.mjs'
import { KernelRuntime } from '../src/kernel-runtime.mjs'

const planDigest = 'a'.repeat(64)

function fixture({ contract = true, owner = 'quality', legacy = false } = {}) {
  const sourceId = 'quality-runner-gap'
  const issueId = `issue-${kernelDigest(['try-quality', sourceId]).slice(0, 40)}`
  const workflow = {
    id: 'wf-public', planVersion: 2, activation: { planDigest }, publicOwnerChangeLog: null,
    issues: { [issueId]: { id: issueId, sourceId, status: 'open' } },
    plan: {
      owners: [{ id: 'quality', scope: ['tests/**'] }, { id: 'build', scope: ['scripts/**'] }, { id: 'api', scope: ['src/api/**'] }],
      tasks: [
        { id: 'bootstrap', ownerId: 'build', title: 'Bootstrap runner', write: ['scripts/**'], dependsOn: [] },
        { id: 'quality', ownerId: owner, title: 'Register infrastructure suite', write: ['tests/**'], dependsOn: ['bootstrap'] },
        { id: 'api-consumer', ownerId: 'api', title: 'Use acceptance runner', write: ['src/api/**'], dependsOn: ['quality'] },
      ],
    },
  }
  const state = { actions: {
    owner: { id: 'owner', workflowId: workflow.id, kind: 'execute_owner', attemptId: 'try-quality', input: {
      task: { id: 'quality' }, owner: { id: 'quality' }, taskPackage: { planVersion: 1 },
    } },
    notice: { id: 'notice', workflowId: workflow.id, kind: 'notify_main', input: { reason: 'owner_feedback', detail: {
      issueId, report: legacy
        ? { sourceId, taskId: 'quality', issue: 'tests/** cannot register the scripts acceptance suite', closeWhen: 'public runner contract is resolved' }
        : { kind: 'public_contract_gap', sourceId, contractId: 'acceptance-runner',
          issue: 'tests/** cannot register the scripts acceptance suite', detail: 'The frozen producer contract is required.' },
    } } },
  } }
  const contractRef = { id: 'acceptance-runner', revision: 'v1' }
  const planningPackage = {
    taskId: 'quality', owner: { id: 'quality' },
    spec: { contracts: contract ? [contractRef] : [] },
    tickets: [{ id: 'T-quality', revision: 'R2', acceptanceCriteria: [{ id: 'AC-runner' }] }],
    contracts: [],
    inputs: [{ kind: 'task_dependency', taskId: 'bootstrap', ownerId: 'build', contracts: contract ? [contractRef] : [] }],
  }
  const input = { workflow_id: workflow.id, source_issue_id: issueId, target_owner_id: 'build', contract_id: contractRef.id,
    expected_behavior: 'Each acceptance producer registers its suite through the public runner contract.',
    actual_gap: 'The runner hard-codes suites and quality cannot edit scripts/**.',
    suggestion: 'Expose deterministic suite registration owned by build tooling.', consumer_task_ids: ['quality', 'api-consumer'],
    consumer_inventory_complete: true }
  return { state, workflow, planningPackage, issueId, input }
}

test('root public Owner schema exposes only nine observed facts and no hidden protocol objects', () => {
  const tool = kernelToolDefinitions({}).find(item => item.name === 'workflow_public_owner_request')
  assert.deepEqual(Object.keys(tool.parameters.properties), [
    'workflow_id', 'source_issue_id', 'target_owner_id', 'contract_id', 'expected_behavior',
    'actual_gap', 'suggestion', 'consumer_task_ids', 'consumer_inventory_complete',
  ])
  assert.deepEqual(tool.parameters.required, Object.keys(tool.parameters.properties))
  assert.equal(tool.parameters.additionalProperties, false)
  assert.equal(Object.hasOwn(tool.parameters.properties, 'request'), false)
  assert.equal(Object.hasOwn(tool.parameters.properties, 'context'), false)
})

test('old feedback is rebound to the same task and Owner in the current frozen source', () => {
  const f = fixture({ legacy: true })
  const source = publicOwnerFeedbackSource(f.state, f.workflow, f.issueId)
  const seed = publicOwnerRequestSeed(source, f.planningPackage, f.workflow)
  assert.equal(seed.status, 'ready_for_public_owner_request')
  assert.equal(seed.feedbackOrigin.planVersion, 1)
  assert.equal(seed.currentSource.planVersion, 2)
  assert.deepEqual(seed.currentSource.contracts, [{ id: 'acceptance-runner', revision: 'v1', producerTaskId: 'bootstrap', ownerId: 'build',
    knownConsumerTaskIds: ['api-consumer', 'quality'] }])
  assert.equal(seed.feedbackOrigin.report.issue, 'tests/** cannot register the scripts acceptance suite')

  const moved = fixture({ owner: 'api', legacy: true })
  assert.deepEqual(publicOwnerFeedbackSource(moved.state, moved.workflow, moved.issueId), {
    status: 'feedback_source_mismatch', reason: 'owner_changed', issueId: moved.issueId,
    taskId: 'quality', ownerId: 'quality', currentOwnerId: 'api',
  })
})

test('feedback seed keeps the real issue field while bounding and redacting its persisted text', () => {
  const f = fixture()
  f.state.actions.notice.input.detail.report.issue = `secret=top-secret /private/tmp/private-file ${'界'.repeat(400)}`
  const seed = publicOwnerRequestSeed(publicOwnerFeedbackSource(f.state, f.workflow, f.issueId), f.planningPackage, f.workflow)
  assert.match(seed.feedbackOrigin.report.issue, /\[REDACTED\]/u)
  assert.doesNotMatch(seed.feedbackOrigin.report.issue, /top-secret|private-file/u)
  assert.ok(Buffer.byteLength(seed.feedbackOrigin.report.issue, 'utf8') <= 512)
})

test('missing producer contract returns source_revision_required without creating internal request facts', () => {
  const f = fixture({ contract: false })
  const before = structuredClone({ state: f.state, workflow: f.workflow })
  const source = publicOwnerFeedbackSource(f.state, f.workflow, f.issueId)
  const result = materializePublicOwnerRequest({ workflow: f.workflow, source, planningPackage: f.planningPackage, input: f.input })
  assert.equal(result.status, 'source_revision_required')
  assert.equal(result.accepted, false)
  assert.equal(result.missing.contractId, 'acceptance-runner')
  assert.equal(result.missing.ownerBinding, 'current_public_producer_ticket_and_plan_binding')
  assert.deepEqual({ state: f.state, workflow: f.workflow }, before)
})

test('unknown legacy feedback without a current contract does not invent a public source revision', () => {
  const f = fixture({ contract: false, legacy: true })
  const source = publicOwnerFeedbackSource(f.state, f.workflow, f.issueId)
  const result = publicOwnerRequestSeed(source, f.planningPackage, f.workflow)
  assert.deepEqual(result, { issueId: f.issueId, status: 'feedback_not_public_contract',
    reason: 'explicit_public_contract_gap_required' })
})

test('an explicit runner resource observation never enters the public contract request path', () => {
  const f = fixture()
  f.state.actions.notice.input.detail.report = { kind: 'runner_resource_observation', issue: 'typecheck-unavailable',
    detail: 'Owner-local compiler unavailable.', verificationId: 'typecheck', observedExitCode: 127 }
  f.state.actions.owner.input.task.verify = ['typecheck']
  f.workflow.attempts = { 'try-quality': { dispatchContract: {
    verifications: [{ id: 'typecheck', run: ['npm', 'run', 'typecheck'] }],
  } } }
  const source = publicOwnerFeedbackSource(f.state, f.workflow, f.issueId)
  assert.deepEqual(publicOwnerRequestSeed(source, f.planningPackage, f.workflow), {
    issueId: f.issueId, status: 'feedback_not_public_contract', reason: 'explicit_public_contract_gap_required',
  })
  assert.deepEqual(KernelRuntime.prototype.ownerFeedbackObservations.call({}, f.state, f.workflow, []), [{
    issueId: f.issueId, status: 'runner_verification_pending', taskId: 'quality', attemptId: 'try-quality',
    verificationId: 'typecheck', resumeCondition: 'await_bound_candidate_verification',
  }])
})

test('an unknown legacy feedback kind remains informational instead of becoming a source gap', () => {
  const f = fixture()
  f.state.actions.notice.input.detail.report = { taskId: 'quality', kind: 'verification_environment',
    detail: 'Owner-local npm typecheck returned exit 127.' }
  const source = publicOwnerFeedbackSource(f.state, f.workflow, f.issueId)
  assert.deepEqual(publicOwnerRequestSeed(source, f.planningPackage, f.workflow), {
    issueId: f.issueId, status: 'feedback_not_public_contract', reason: 'explicit_public_contract_gap_required',
  })
})

test('runtime materialization binds the explicit producer and derives every protocol version and digest', () => {
  const f = fixture()
  const source = publicOwnerFeedbackSource(f.state, f.workflow, f.issueId)
  const result = materializePublicOwnerRequest({ workflow: f.workflow, source, planningPackage: f.planningPackage, input: f.input })
  assert.equal(result.accepted, true)
  assert.equal(result.request.requestVersion, 1)
  assert.equal(result.request.supersedesRequestDigest, null)
  assert.equal(result.request.requesterOwnerId, 'quality')
  assert.equal(result.request.targetOwnerId, 'build')
  assert.equal(result.request.baseline.planRevision, 2)
  assert.equal(result.request.baseline.planDigest, planDigest)
  assert.match(result.request.baseline.contextDigest, /^[a-f0-9]{64}$/u)
  assert.deepEqual(result.context.contracts, [{ id: 'acceptance-runner', revision: 'v1', ownerId: 'build' }])
  assert.deepEqual(result.context.consumers.map(item => [item.consumerId, item.ownerId]), [['quality', 'quality'], ['api-consumer', 'api']])
  assert.throws(() => materializePublicOwnerRequest({ workflow: f.workflow, source, planningPackage: f.planningPackage,
    input: { ...f.input, target_owner_id: 'api' } }), /current upstream producer: build/)
  assert.throws(() => materializePublicOwnerRequest({ workflow: f.workflow, source, planningPackage: f.planningPackage,
    input: { ...f.input, consumer_task_ids: [], consumer_inventory_complete: true } }), /must cover: api-consumer, quality/)
  assert.throws(() => materializePublicOwnerRequest({ workflow: f.workflow, source, planningPackage: f.planningPackage,
    input: { ...f.input, consumer_task_ids: ['bootstrap'], consumer_inventory_complete: false } }), /not bound to the current public producer/)

  const reordered = Object.fromEntries(Object.entries(result.request).reverse())
  f.workflow.publicOwnerChangeLog = { requests: [{ request: reordered, requestDigest: 'b'.repeat(64) }], decisions: [] }
  const replay = materializePublicOwnerRequest({ workflow: f.workflow, source, planningPackage: f.planningPackage, input: f.input })
  assert.equal(replay.request.requestVersion, 1)
  assert.equal(replay.request.supersedesRequestDigest, null)
})

test('public Owner submits judgment only and Runtime supplies immutable decision bindings', () => {
  const f = fixture()
  const source = publicOwnerFeedbackSource(f.state, f.workflow, f.issueId)
  const { request, context } = materializePublicOwnerRequest({ workflow: f.workflow, source, planningPackage: f.planningPackage, input: f.input })
  const evidence = context.evidenceRefs[0]
  const judgment = { decisionId: 'acceptance-runner-v1', outcome: 'compatible_extension', summary: 'Add the public suite registration contract.',
    basisRefs: [evidence], affectedConsumers: context.consumers.map(item => ({ consumerId: item.consumerId, ownerId: item.ownerId,
      impact: 'compatible', evidenceRefs: item.evidenceRefs })),
    contractChange: { nextRevision: 'v2', behavior: 'Register named suites.', compatibility: 'Existing all-suite invocation remains valid.' },
    migrationOrder: [], alternative: null, unknowns: [], businessChange: null }
  const decision = bindPublicOwnerChangeDecision(judgment, request, context)
  assert.equal(decision.requestId, request.requestId)
  assert.equal(decision.requestVersion, request.requestVersion)
  assert.equal(decision.targetOwnerId, 'build')
  assert.deepEqual(decision.baseline, request.baseline)
  assert.match(decision.requestDigest, /^[a-f0-9]{64}$/u)
  assert.equal(Object.hasOwn(roleReportParameters('public-owner').properties.report.properties.decision.properties, 'requestDigest'), false)
})

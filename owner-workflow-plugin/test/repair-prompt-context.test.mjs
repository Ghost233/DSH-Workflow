import test from 'node:test'
import assert from 'node:assert/strict'
import { kernelDigest } from '../src/workflow-engine.mjs'
import { projectRepairForPrompt, repairPromptFields } from '../src/repair-prompt-context.mjs'

function repairFixture() {
  return {
    fromAttemptId: 'try-prior',
    issueId: 'issue-verification',
    instructions: 'Add the missing API regression test, then rerun the fixed verification.',
    decisionRef: '/runtime/decisions/repair.json',
    candidate: {
      repositoryRoot: '/runtime/repo',
      submissionArtifact: '/runtime/submissions/prior.json',
      commitSha: 'candidate-digest',
      baseCommit: 'base-commit',
      authority: 'runtime-authority',
      manifest: Array.from({ length: 1_222 }, (_, index) => ({
        path: index < 860 ? `docs/figma/export-${index}.json` : `src/file-${index}.mjs`,
        digest: `${index}`.padStart(64, '0'),
        kind: 'file',
        executable: false,
      })),
    },
    verification: {
      commitSha: 'candidate-digest',
      passed: false,
      executionSettled: true,
      results: [{
        verificationId: 'api-regression', commitSha: 'candidate-digest', passed: false, ok: false, exitCode: 1,
        timedOut: false, aborted: false, stdout: 'one failing assertion', stderr: 'expected regression coverage',
        error: 'test failed', evidenceRef: '/runtime/verifications/api-regression.json',
        argv: ['npm', 'test'], cwd: '.', enforcement: 'fixed',
        commandTermination: { managedRangeStopped: true, commandId: 'command-runtime-id' },
      }, {
        verificationId: 'already-passing', passed: true, ok: true, exitCode: 0,
        stdout: 'pass',
      }],
      review: {
        passed: false,
        commitSha: 'candidate-digest',
        reasons: ['The required API regression test is absent.'],
        evidenceRef: '/runtime/reviews/prior.json',
        executionSettled: true,
        managedRangeStopped: true,
        terminationScope: 'prompt-bound-turn',
        terminationId: 'runtime-termination-id',
        sessionId: 'runtime-session-id',
        promptId: 'runtime-prompt-id',
      },
    },
  }
}

function actionFixture(repair = repairFixture()) {
  const task = { id: 'api_transport', ownerId: 'api-owner', title: 'Repair API transport', write: ['src/api/**'], verify: ['api-regression'] }
  const ownerInput = { task, definitionDigest: 'definition-digest', owner: { id: 'api-owner' }, repair }
  const owner = { id: 'act-owner', kind: 'execute_owner', workflowId: 'wf', attemptId: 'try-current', input: ownerInput,
    inputDigest: kernelDigest(ownerInput) }
  const candidate = { artifact: '/runtime/candidates/current/tree', commitSha: 'current-digest', authority: 'current-authority', manifest: [] }
  const reviewerInput = { task, candidate, verifications: [{ id: 'api-regression' }] }
  const reviewer = { id: 'act-reviewer', kind: 'verify_candidate', workflowId: 'wf', attemptId: 'try-current', input: reviewerInput,
    inputDigest: kernelDigest(reviewerInput) }
  const state = {
    actions: { [owner.id]: owner, [reviewer.id]: reviewer },
    workflows: { wf: { id: 'wf',
      tasks: { api_transport: { id: 'api_transport', attemptId: 'try-current', definitionDigest: 'definition-digest', repair: { mutable: 'ignored' } } },
      attempts: { 'try-current': {
        id: 'try-current', taskId: 'api_transport', definitionDigest: 'definition-digest', candidate,
        dispatchContract: { task },
      } },
    } },
  }
  return { state, owner, reviewer, repair }
}

test('projects a large repair into exact model-facing instructions and bounded evidence', () => {
  const repair = repairFixture()
  const before = structuredClone(repair)
  const projected = projectRepairForPrompt(repair)
  const serialized = JSON.stringify(projected)

  assert.equal(projected.instructions, repair.instructions)
  assert.equal(projected.fromAttemptId, repair.fromAttemptId)
  assert.equal(projected.issueId, repair.issueId)
  assert.equal(projected.decisionRef, repair.decisionRef)
  assert.deepEqual(projected.candidate, {
    repositoryRoot: repair.candidate.repositoryRoot,
    submissionArtifact: repair.candidate.submissionArtifact,
    commitSha: repair.candidate.commitSha,
    baseCommit: repair.candidate.baseCommit,
  })
  assert.deepEqual(projected.verification.results, [{
    verificationId: 'api-regression', argv: ['npm', 'test'], cwd: '.', commitSha: 'candidate-digest',
    passed: false, ok: false, exitCode: 1,
    timedOut: false, aborted: false, stdout: 'one failing assertion', stderr: 'expected regression coverage',
    error: 'test failed', evidenceRef: '/runtime/verifications/api-regression.json',
  }])
  assert.deepEqual(projected.verification.review.reasons, repair.verification.review.reasons)
  assert.equal(projected.verification.review.evidenceRef, '/runtime/reviews/prior.json')
  assert.ok(JSON.stringify(repair).length > 150_000)
  assert.ok(serialized.length < 5_000)
  for (const runtimeOnly of ['manifest', 'figma', 'commandTermination',
    'runtime-authority', 'runtime-session-id', 'runtime-prompt-id', 'runtime-termination-id', 'already-passing']) {
    assert.equal(serialized.includes(runtimeOnly), false, runtimeOnly)
  }
  assert.deepEqual(repair, before)
})

test('Owner and its exact Reviewer resolve the same immutable persisted repair', () => {
  const { state, owner, reviewer } = actionFixture()
  const ownerFields = repairPromptFields({ state, action: structuredClone(owner), role: 'owner' })
  const reviewerFields = repairPromptFields({ state, action: structuredClone(reviewer), role: 'reviewer' })
  assert.deepEqual(reviewerFields, ownerFields)
  assert.equal(reviewerFields.repair.instructions, owner.input.repair.instructions)

  state.workflows.wf.tasks.api_transport.repair = { instructions: 'mutable task record must not be read' }
  assert.deepEqual(repairPromptFields({ state, action: structuredClone(reviewer), role: 'reviewer' }), ownerFields)
})

test('missing repair stays absent and mismatched persisted identities do not expose repair', () => {
  const withoutRepair = actionFixture(null)
  assert.deepEqual(repairPromptFields({ state: withoutRepair.state, action: withoutRepair.owner, role: 'owner' }), {})
  assert.deepEqual(repairPromptFields({ state: withoutRepair.state, action: withoutRepair.reviewer, role: 'reviewer' }), {})

  const cases = [
    ({ state }) => { state.actions['act-owner-copy'] = { ...structuredClone(state.actions['act-owner']), id: 'act-owner-copy' } },
    ({ state }) => { state.actions['act-owner'].workflowId = 'other-workflow' },
    ({ state }) => { state.actions['act-owner'].attemptId = 'other-attempt' },
    ({ state }) => { state.actions['act-owner'].input.task.id = 'other-task' },
    ({ state }) => { state.actions['act-owner'].input.definitionDigest = 'other-definition' },
    ({ state }) => { state.actions['act-owner'].inputDigest = 'stale-input-digest' },
    ({ state }) => { state.workflows.wf.tasks.api_transport.attemptId = 'other-attempt' },
    ({ state }) => { state.workflows.wf.attempts['try-current'].definitionDigest = 'other-definition' },
    ({ state }) => { state.actions['act-reviewer'].inputDigest = 'stale-reviewer-input-digest' },
  ]
  for (const mutate of cases) {
    const fixture = actionFixture()
    mutate(fixture)
    assert.deepEqual(repairPromptFields({ state: fixture.state, action: fixture.reviewer, role: 'reviewer' }), {})
  }

  const ownerMismatch = actionFixture()
  const driftedOwner = structuredClone(ownerMismatch.owner)
  driftedOwner.input.repair.instructions = 'unpersisted replacement'
  assert.deepEqual(repairPromptFields({ state: ownerMismatch.state, action: driftedOwner, role: 'owner' }), {})
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { waitForWorkflowProgress } from './fixtures/workflow-progress-wait.mjs'

function projectedView({ status = 'running', planVersion = 1, phase = 'integrating', actionStatus = 'running', revision = 1, nextWakeAt = 5_000 } = {}) {
  return {
    workflowId: 'wf-progress', status, planVersion, revision, updatedAt: revision,
    terminal: status === 'completed',
    tasks: [{ taskId: 'T1', phase }],
    actions: [{ id: 'integrate', kind: 'integrate_candidate', status: actionStatus, nextWakeAt, observationCount: revision }],
  }
}

test('workflow fixture wait does not let observation churn renew a stuck semantic state', async () => {
  let now = 0
  const result = await waitForWorkflowProgress({
    readView: async () => projectedView({ revision: now, nextWakeAt: now + 5_000 }),
    shouldStop: () => false,
    clock: () => now,
    sleep: async delay => { now += delay },
    pollMs: 1_000,
    idleMs: 10_000,
    absoluteMs: 40_000,
  })
  assert.equal(result.reason, 'idle_timeout')
  assert.equal(result.elapsedMs, 10_000)
})

test('workflow fixture wait renews only for semantic progress and retains an absolute cap', async () => {
  let now = 0
  const completed = await waitForWorkflowProgress({
    readView: async () => now < 8_000
      ? projectedView({ phase: 'verifying', actionStatus: 'pending', revision: now })
      : now < 15_000
        ? projectedView({ phase: 'integrating', actionStatus: 'running', revision: now })
        : projectedView({ status: 'completed', phase: 'succeeded', actionStatus: 'succeeded', revision: now }),
    shouldStop: view => view.terminal,
    clock: () => now,
    sleep: async delay => { now += delay },
    pollMs: 1_000,
    idleMs: 10_000,
    absoluteMs: 40_000,
  })
  assert.equal(completed.reason, 'condition')
  assert.equal(completed.view.status, 'completed')
  assert.equal(completed.elapsedMs, 15_000)

  let sleepCalled = false
  const stoppedOnError = await waitForWorkflowProgress({
    readView: async () => projectedView(),
    shouldStop: () => true,
    clock: () => now,
    sleep: async () => { sleepCalled = true },
  })
  assert.equal(stoppedOnError.reason, 'condition')
  assert.equal(sleepCalled, false)

  now = 0
  const capped = await waitForWorkflowProgress({
    readView: async () => projectedView({ planVersion: Math.floor(now / 9_000), phase: `phase-${Math.floor(now / 9_000)}`, revision: now }),
    shouldStop: () => false,
    clock: () => now,
    sleep: async delay => { now += delay },
    pollMs: 1_000,
    idleMs: 10_000,
    absoluteMs: 40_000,
  })
  assert.equal(capped.reason, 'absolute_timeout')
  assert.equal(capped.elapsedMs, 40_000)
})

test('native planning feedback is persisted in the root tool result and never starts a workflow', { timeout: 60_000 }, async () => {
  const env = { ...process.env, UKR_NATIVE_PLANNING_FEEDBACK_FIXTURE: '1', GIT_AUTHOR_NAME: 'Kernel Fixture', GIT_AUTHOR_EMAIL: 'kernel@invalid', GIT_COMMITTER_NAME: 'Kernel Fixture', GIT_COMMITTER_EMAIL: 'kernel@invalid' }
  delete env.NODE_TEST_CONTEXT
  const result = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./fixtures/kernel-planning-smoke.mjs', import.meta.url))], { env, timeout: 45_000, maxBuffer: 256 * 1024 })
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.equal(report.status, 'passed'); assert.equal(report.actualPersistedPlanningFeedback, true); assert.equal(report.planningFeedbackQuestions, 1)
})

test('native revised Spec/Ticket checkpoint replaces the same task, retains the issue and delivers on its new baseline', { timeout: 60_000 }, async () => {
  const env = { ...process.env, UKR_NATIVE_REVISION_FIXTURE: '1', GIT_AUTHOR_NAME: 'Kernel Fixture', GIT_AUTHOR_EMAIL: 'kernel@invalid', GIT_COMMITTER_NAME: 'Kernel Fixture', GIT_COMMITTER_EMAIL: 'kernel@invalid' }
  delete env.NODE_TEST_CONTEXT
  const result = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./fixtures/kernel-planning-smoke.mjs', import.meta.url))], { env, timeout: 45_000, maxBuffer: 256 * 1024 })
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.equal(report.status, 'passed'); assert.equal(report.actualSourceRevision, true); assert.equal(report.actualExecutionContractRevision, true)
})

test('native Reviewer corrects an invalid obligation id in the same session before any report is accepted', { timeout: 60_000 }, async () => {
  const env = { ...process.env, UKR_NATIVE_PLANNING_PREFLIGHT_FIXTURE: '1', GIT_AUTHOR_NAME: 'Kernel Fixture', GIT_AUTHOR_EMAIL: 'kernel@invalid', GIT_COMMITTER_NAME: 'Kernel Fixture', GIT_COMMITTER_EMAIL: 'kernel@invalid' }
  delete env.NODE_TEST_CONTEXT
  const result = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./fixtures/kernel-planning-smoke.mjs', import.meta.url))], { env, timeout: 45_000, maxBuffer: 256 * 1024 })
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.equal(report.status, 'passed'); assert.equal(report.actualPlanningPreflight, true)
})

test('native positive Reviewer fixes its missing closure in the same action and activates without another recovery', { timeout: 60_000 }, async () => {
  const env = { ...process.env, UKR_NATIVE_INITIAL_REVISION_FIXTURE: '1', UKR_NATIVE_CLOSURE_PREFLIGHT_FIXTURE: '1',
    GIT_AUTHOR_NAME: 'Kernel Fixture', GIT_AUTHOR_EMAIL: 'kernel@invalid', GIT_COMMITTER_NAME: 'Kernel Fixture', GIT_COMMITTER_EMAIL: 'kernel@invalid' }
  delete env.NODE_TEST_CONTEXT
  const result = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./fixtures/kernel-planning-smoke.mjs', import.meta.url))],
    { env, timeout: 45_000, maxBuffer: 256 * 1024 })
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.equal(report.status, 'passed'); assert.equal(report.actualInitialSourceRevision, true)
})

test('native main-thread documents, checkpoint, independent planning and execution reach the user checkout', { timeout: 60_000 }, async () => {
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Kernel Fixture', GIT_AUTHOR_EMAIL: 'kernel@invalid', GIT_COMMITTER_NAME: 'Kernel Fixture', GIT_COMMITTER_EMAIL: 'kernel@invalid' }
  delete env.NODE_TEST_CONTEXT
  const result = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./fixtures/kernel-planning-smoke.mjs', import.meta.url))], { env, timeout: 45_000, maxBuffer: 256 * 1024 })
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.equal(report.status, 'passed'); assert.equal(report.actualNativeSourceWrites, true); assert.equal(report.actualRegistryValidation, true)
})

test('two frozen independent Owner tasks reach actual combined and final Reviewer acceptance with their grouped packages', { timeout: 60_000 }, async () => {
  const env = { ...process.env, UKR_NATIVE_REVIEW_SCOPE_FIXTURE: '1', GIT_AUTHOR_NAME: 'Kernel Fixture', GIT_AUTHOR_EMAIL: 'kernel@invalid', GIT_COMMITTER_NAME: 'Kernel Fixture', GIT_COMMITTER_EMAIL: 'kernel@invalid' }
  delete env.NODE_TEST_CONTEXT
  const result = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./fixtures/kernel-planning-smoke.mjs', import.meta.url))], { env, timeout: 45_000, maxBuffer: 256 * 1024 })
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.equal(report.status, 'passed'); assert.deepEqual(report.reviewerScopes, ['combined', 'final']); assert.equal(report.counts.completedTasks, 2)
})

test('actual failed verification returns to the root and repairs its retained candidate within the same budget', { timeout: 60_000 }, async () => {
  const env = { ...process.env, UKR_NATIVE_REPAIR_FIXTURE: '1', GIT_AUTHOR_NAME: 'Kernel Fixture', GIT_AUTHOR_EMAIL: 'kernel@invalid', GIT_COMMITTER_NAME: 'Kernel Fixture', GIT_COMMITTER_EMAIL: 'kernel@invalid' }
  delete env.NODE_TEST_CONTEXT
  const result = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./fixtures/kernel-planning-smoke.mjs', import.meta.url))], { env, timeout: 45_000, maxBuffer: 256 * 1024 })
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.equal(report.status, 'passed'); assert.equal(report.actualCandidateRepair, true)
})


test('a no-progress first DAG returns to native Spec/Ticket R2 and delivers in the original workflow', { timeout: 60_000 }, async () => {
  const env = { ...process.env, UKR_NATIVE_INITIAL_REVISION_FIXTURE: '1', GIT_AUTHOR_NAME: 'Kernel Fixture', GIT_AUTHOR_EMAIL: 'kernel@invalid', GIT_COMMITTER_NAME: 'Kernel Fixture', GIT_COMMITTER_EMAIL: 'kernel@invalid' }
  delete env.NODE_TEST_CONTEXT
  const result = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./fixtures/kernel-planning-smoke.mjs', import.meta.url))], { env, timeout: 45_000, maxBuffer: 256 * 1024 })
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.equal(report.status, 'passed'); assert.equal(report.actualInitialSourceRevision, true); assert.equal(report.actualExecutionContractRevision, true)
})


test('active Registry narrowing uses one native approval and replans the same Spec/Ticket workflow through delivery', { timeout: 60_000 }, async () => {
  const env = { ...process.env, UKR_NATIVE_REGISTRY_REVISION_FIXTURE: '1', GIT_AUTHOR_NAME: 'Kernel Fixture', GIT_AUTHOR_EMAIL: 'kernel@invalid', GIT_COMMITTER_NAME: 'Kernel Fixture', GIT_COMMITTER_EMAIL: 'kernel@invalid' }
  delete env.NODE_TEST_CONTEXT
  const result = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./fixtures/kernel-planning-smoke.mjs', import.meta.url))], { env, timeout: 45_000, maxBuffer: 256 * 1024 })
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.equal(report.status, 'passed'); assert.equal(report.actualActiveRegistryRevision, true)
})


test('actual scoped preset tools reach Owner execution without inheriting root orchestration instructions', { timeout: 60_000 }, async () => {
  const env = { ...process.env, UKR_NATIVE_PRESET_FIXTURE: '1', GIT_AUTHOR_NAME: 'Kernel Fixture', GIT_AUTHOR_EMAIL: 'kernel@invalid', GIT_COMMITTER_NAME: 'Kernel Fixture', GIT_COMMITTER_EMAIL: 'kernel@invalid' }
  delete env.NODE_TEST_CONTEXT
  const result = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./fixtures/kernel-planning-smoke.mjs', import.meta.url))], { env, timeout: 45_000, maxBuffer: 256 * 1024 })
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.equal(report.status, 'passed'); assert.equal(report.actualScopedPresetTools, true)
})

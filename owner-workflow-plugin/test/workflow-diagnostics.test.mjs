import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlanV2 } from '../src/model.mjs'
import { createControlState, transition, view, kernelDigest } from '../src/workflow-engine.mjs'
import { KernelRuntime } from '../src/kernel-runtime.mjs'
import { kernelToolDefinitions } from '../src/kernel-tools.mjs'

const task = { id: 'T1', title: 'Implement API', role: 'work', ownerId: 'api', dependsOn: [], resources: [],
  write: ['src/api/**'], verify: ['unit'], done: ['API contract passes'] }
const DIGEST = 'c'.repeat(64)

function fixture(verification = { id: 'unit', run: ['node', '--test'] }) {
  let state = createControlState({ catalogId: '/catalog' })
  let time = 100_000
  const send = event => { const applied = transition(state, event, time++); state = applied.state; return applied.result }
  const complete = (action, result) => {
    send({ type: 'action.claim', actionId: action.id, token: `claim-${time}`, hostId: 'host' })
    const token = state.actions[action.id].execution.token
    return send({ type: 'action.result', actionId: action.id, token, result })
  }
  const actions = kind => Object.values(state.actions).filter(action => action.kind === kind)
  const plan = normalizePlanV2({ contract: 'DSH_PLAN_V2', registryDigest: 'a'.repeat(64), summary: 'Diagnostics',
    owners: [{ id: 'api', name: 'API', description: 'API module', scope: ['src/api/**'], exclude: [] }],
    verifications: [verification], tasks: [task] })
  send({ type: 'workflow.create', id: 'wf1', root: '/project', rootSessionId: 'root-session', request: 'diagnose', baseCommit: 'base' })
  send({ type: 'plan.activate', workflowId: 'wf1', parentVersion: 0, plan,
    authorization: { scope: 'implementation', sourceId: 'user-message' }, sources: { snapshotDigest: 'snapshot' },
    review: { status: 'passed', planDigest: kernelDigest(plan), evidenceRef: 'review.json' } })
  send({ type: 'drive' })
  const owner = actions('execute_owner')[0]
  send({ type: 'action.claim', actionId: owner.id, token: 'owner', hostId: 'host' })
  send({ type: 'action.started', actionId: owner.id, token: 'owner', evidence: { handleId: 'handle', sessionId: 'owner-session' } })
  const attempt = state.workflows.wf1.attempts[owner.attemptId]
  send({ type: 'owner.submit', workflowId: 'wf1', attemptId: attempt.id, authority: attempt.authority,
    report: { status: 'completed', summary: 'Candidate' }, manifestDigest: 'manifest', artifact: '/submission' })
  send({ type: 'action.result', actionId: owner.id, token: 'owner', result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  complete(actions('seal_candidate')[0], { artifact: '/candidate', commitSha: DIGEST, authority: attempt.authority })
  return { send, complete, actions, attempt, get state() { return state }, current: () => view(state, 'wf1') }
}

function terminal(f) {
  return f.actions('notify_main').filter(action => action.input.reason === 'workflow_terminal').at(-1).input.detail
}

test('business verification failure keeps task repair and shares one diagnostic with the terminal notice', () => {
  const f = fixture()
  const failed = f.actions('verify_candidate')[0]
  f.complete(failed, { passed: false, commitSha: DIGEST, executionSettled: true,
    results: [{ verificationId: 'unit', passed: false, exitCode: 1, enforcement: 'full',
      stdout: `unrelated stdout ${'x'.repeat(10_000)}`,
      stderr: 'Unknown or unimplemented acceptance suite: infrastructure\n' }],
    review: { passed: false, commitSha: DIGEST, reasons: [
      'The infrastructure suite is not registered at /private/project/tests.',
      'FakeTransport only blocks its own map; api_key=review-secret and global fetch remain untested.',
    ] } })
  const projected = f.current()
  const attention = projected.attention.find(item => item.taskId === 'T1')
  assert.equal(attention.resumeCondition, 'bound_task_repair')
  assert.equal(attention.diagnostic.classification, 'candidate_failure')
  assert.equal(attention.diagnostic.retryTool, 'workflow_retry_task')
  assert.equal(attention.diagnostic.actionId, failed.id)
  assert.deepEqual(attention.diagnostic.results[0].argv, ['node', '--test'])
  assert.equal(attention.diagnostic.results[0].cwd, '.')
  assert.equal(attention.diagnostic.results[0].messageSource, 'stderr')
  assert.equal(attention.diagnostic.results[0].message, 'Unknown or unimplemented acceptance suite: infrastructure\n')
  assert.deepEqual(attention.diagnostic.reviewFindings, [
    'The infrastructure suite is not registered at [REDACTED_PATH]',
    'FakeTransport only blocks its own map; api_key=[REDACTED] and global fetch remain untested.',
  ])
  assert.deepEqual(terminal(f).failure.diagnostic, attention.diagnostic)
  assert.doesNotMatch(JSON.stringify({ projected, terminal: terminal(f) }), /review-secret|\/private\/project|unrelated stdout/)
})

test('reviewer-only rejection remains explainable but unbound or malformed findings are not projected', () => {
  const f = fixture()
  const failed = f.actions('verify_candidate')[0]
  f.complete(failed, { passed: false, commitSha: DIGEST, executionSettled: true,
    results: [{ verificationId: 'unit', passed: true, exitCode: 0, enforcement: 'full' }],
    review: { passed: false, commitSha: DIGEST, reasons: ['Default network isolation is not exercised.'] } })
  let diagnostic = f.current().attention.find(item => item.taskId === 'T1').diagnostic
  assert.equal(diagnostic.classification, 'candidate_failure')
  assert.deepEqual(diagnostic.reviewFindings, ['Default network isolation is not exercised.'])
  assert.equal(diagnostic.results[0].message, null)

  const unbound = fixture()
  unbound.complete(unbound.actions('verify_candidate')[0], { passed: false, commitSha: DIGEST, executionSettled: true,
    results: [{ verificationId: 'unit', passed: true, exitCode: 0, enforcement: 'full' }],
    review: { passed: false, commitSha: 'different', reasons: ['Must not be trusted.'] } })
  diagnostic = unbound.current().attention.find(item => item.taskId === 'T1').diagnostic
  assert.equal(diagnostic.reviewFindings, undefined)

  const missing = fixture()
  const missingAction = missing.actions('verify_candidate')[0]
  missing.complete(missingAction, { passed: false, commitSha: DIGEST, executionSettled: true,
    results: [{ verificationId: 'unit', passed: true, exitCode: 0, enforcement: 'full' }],
    review: { passed: false, commitSha: DIGEST, reasons: ['Undefined must not bind undefined.'] } })
  const malformed = structuredClone(missing.state)
  delete malformed.actions[missingAction.id].result.commitSha
  delete malformed.actions[missingAction.id].result.review.commitSha
  diagnostic = view(malformed, 'wf1').attention.find(item => item.taskId === 'T1').diagnostic
  assert.equal(diagnostic.reviewFindings, undefined)
})

test('business diagnostics bound each finding and their aggregate in UTF-8 bytes', () => {
  const f = fixture()
  f.complete(f.actions('verify_candidate')[0], { passed: false, commitSha: DIGEST, executionSettled: true,
    results: [{ verificationId: 'unit', passed: false, exitCode: 1, enforcement: 'full',
      stderr: `{"api_key":"json-hidden"} ${'故'.repeat(3_000)} Bearer credential-value /Volumes/private/failure` }],
    review: { passed: false, commitSha: DIGEST, reasons: Array.from({ length: 20 }, (_, index) =>
      `{"secret": "quoted-${index}"} ${index}:${'审'.repeat(1_000)} password=hidden-${index}`) } })
  const diagnostic = f.current().attention.find(item => item.taskId === 'T1').diagnostic
  const result = diagnostic.results[0]
  assert.equal(result.messageSource, 'stderr')
  assert.equal(result.messageTruncated, true)
  assert.ok(Buffer.byteLength(result.message, 'utf8') <= 2_000)
  assert.equal(diagnostic.reviewFindingsTruncated, true)
  assert.ok(diagnostic.reviewFindings.length <= 8)
  assert.ok(diagnostic.reviewFindings.every(item => Buffer.byteLength(item, 'utf8') <= 1_000))
  assert.ok(diagnostic.reviewFindings.reduce((sum, item) => sum + Buffer.byteLength(item, 'utf8'), 0) <= 4_000)
  assert.doesNotMatch(JSON.stringify(diagnostic), /credential-value|\/Volumes\/private|hidden-|json-hidden|quoted-/)
})

test('verification execution failure exposes the current retry target while redacting retained evidence', () => {
  const secret = 'api_key=super-secret-value-123456789'
  const f = fixture({ id: 'unit', run: ['node', '--test', `--${secret}`], cwd: 'packages/api' })
  const failed = f.actions('verify_candidate')[0]
  f.complete(failed, { passed: false, commitSha: DIGEST, executionSettled: true,
    results: [{ verificationId: 'unit', status: 'execution_error', passed: false, commitSha: DIGEST,
      error: `Verification environment failed; ${secret}; /private/runtime/secret; ${'故'.repeat(3_000)}`,
      stdout: 'must-not-be-public', stderr: 'must-not-be-public-either',
      timedOut: true,
      commandTermination: { managedRangeStopped: true } }] })

  let projected = f.current()
  let attention = projected.attention.find(item => item.taskId === 'T1')
  assert.equal(attention.resumeCondition, 'execution_obstruction_resolved_then_bound_verification_retry')
  assert.equal(attention.diagnostic.actionId, failed.id)
  assert.equal(attention.diagnostic.classification, 'technical_execution_failure')
  assert.equal(attention.diagnostic.retryTool, 'workflow_retry_action')
  assert.deepEqual(attention.diagnostic.results[0].argv, ['node', '--test', '--api_key=[REDACTED]'])
  assert.equal(attention.diagnostic.results[0].cwd, 'packages/api')
  const publicFailure = JSON.stringify({ projected, notice: terminal(f) })
  assert.doesNotMatch(publicFailure, /super-secret|must-not-be-public|\/private\/runtime/)
  assert.ok(Buffer.byteLength(attention.diagnostic.results[0].message, 'utf8') <= 2_000)
  assert.deepEqual(JSON.parse(JSON.stringify(projected)), projected)

  const retryId = f.send({ type: 'action.retry', workflowId: 'wf1', actionId: failed.id,
    reason: 'Verification environment is available again', decisionRef: 'root:retry-1' })
  const retried = f.state.actions[retryId]
  f.complete(retried, { passed: false, commitSha: DIGEST, executionSettled: true,
    results: [{ verificationId: 'unit', status: 'execution_error', passed: false, commitSha: DIGEST,
      error: 'Dependency cache remains unavailable', commandTermination: { managedRangeStopped: true } }] })
  projected = f.current()
  attention = projected.attention.find(item => item.taskId === 'T1')
  assert.equal(attention.diagnostic.actionId, retried.id)
  assert.notEqual(attention.diagnostic.actionId, failed.id)
})

test('runtime status uses its current clock to expose the expired technical task recovery path', async () => {
  const f = fixture()
  const failed = f.actions('verify_candidate')[0]
  f.complete(failed, { passed: false, commitSha: DIGEST, executionSettled: true,
    results: [{ verificationId: 'unit', status: 'execution_error', passed: false, commitSha: DIGEST,
      commandTermination: { managedRangeStopped: true } }] })

  const live = f.current().tasks.find(item => item.taskId === 'T1')
  assert.equal(live.deadlineExpired, false)
  assert.equal(live.diagnostic.retryTool, 'workflow_retry_action')
  const verificationDeadline = f.state.workflows.wf1.attempts[f.attempt.id].deadlineAt
  const runtime = Object.assign(Object.create(KernelRuntime.prototype), {
    ready: Promise.resolve(), rootAgent() {}, runner: { health: { running: false } },
    publicOwnerSeeds: async () => [], store: { clock: () => verificationDeadline, read: async () => f.state },
  })
  const expired = await KernelRuntime.prototype.status.call(runtime, { id: 'root-session' }, 'wf1')
  const task = expired.tasks.find(item => item.taskId === 'T1')
  const attention = expired.attention.find(item => item.taskId === 'T1')
  assert.equal(task.deadlineAt, verificationDeadline)
  assert.equal(task.deadlineExpired, true)
  assert.equal(task.diagnostic.deadlineExpired, true)
  assert.equal(task.diagnostic.retryTool, 'workflow_retry_task')
  assert.equal(attention.resumeCondition, 'attempt_deadline_expired_then_bound_task_retry')
})

test('retry tool descriptions distinguish a live bound verification from an expired attempt', () => {
  const definitions = kernelToolDefinitions({})
  assert.match(definitions.find(item => item.name === 'workflow_retry_action').description, /deadline remains valid/i)
  assert.match(definitions.find(item => item.name === 'workflow_retry_task').description, /deadline has expired/i)
})

test('final verification failure uses the same safe diagnostic instead of exposing raw results', () => {
  const f = fixture()
  f.complete(f.actions('verify_candidate')[0], { passed: true, commitSha: DIGEST, executionSettled: true,
    review: { passed: true, commitSha: DIGEST }, results: [{ verificationId: 'unit', passed: true, exitCode: 0, commitSha: DIGEST }] })
  f.complete(f.actions('integrate_candidate')[0], { commitSha: 'integrated', worklogRef: '/worklog', baseCommit: 'base', candidateCommit: DIGEST, verified: true })
  f.send({ type: 'drive' })
  const final = f.actions('verify_workflow')[0]
  f.complete(final, { passed: false, commitSha: 'integrated', planVersion: 1, executionSettled: true,
    results: [{ verificationId: 'unit', status: 'execution_error', passed: false,
      error: 'secret=top-secret-final-value', stdout: 'private final stdout', stderr: 'private final stderr' }] })
  const projected = f.current()
  assert.equal(projected.deliveryFailure.reason, 'verification_failed')
  assert.equal(projected.deliveryFailure.diagnostic.kind, 'final_verification')
  assert.equal(projected.deliveryFailure.diagnostic.actionId, final.id)
  assert.equal(projected.deliveryFailure.diagnostic.retryTool, 'workflow_retry_action')
  assert.deepEqual(projected.attention.find(item => item.id === 'delivery').detail, projected.deliveryFailure)
  const serialized = JSON.stringify({ projected, notice: terminal(f) })
  assert.doesNotMatch(serialized, /top-secret-final-value|private final stdout|private final stderr/)
  assert.deepEqual(JSON.parse(serialized).projected, projected)
})

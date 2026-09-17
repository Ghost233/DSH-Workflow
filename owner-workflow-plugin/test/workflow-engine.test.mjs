import test from 'node:test'
import assert from 'node:assert/strict'
import * as engine from '../src/workflow-engine.mjs'
import { normalizePlanV2 } from '../src/model.mjs'
import { createControlState, transition, view, kernelDigest, dueActions, planningIssueContext,
  preflightPlanningResult } from '../src/workflow-engine.mjs'

const owner = id => ({ id, name: id, description: `${id} module`, scope: [`src/${id}/**`], exclude: [] })
const task = (id, ownerId = 'api', dependsOn = [], resources = []) => ({ id, title: id, role: 'work', ownerId,
  dependsOn, resources, write: [`src/${ownerId}/**`], verify: ['unit'], done: ['Module contract and tests pass'] })
function plan(tasks = [task('T1')]) {
  return normalizePlanV2({ contract: 'DSH_PLAN_V2', registryDigest: 'a'.repeat(64), summary: 'Kernel regression',
    owners: [...new Set(tasks.map(task => task.ownerId))].map(owner),
    verifications: [{ id: 'unit', run: ['node', '--test'] }], tasks })
}
function harness(tasks, { parallel = 3, policy = {}, planValue = null } = {}) {
  let state = createControlState({ catalogId: '/catalog', parallel })
  let time = 100_000
  const send = event => { const applied = transition(state, event, time); state = applied.state; return applied.result }
  const create = id => send({ type: 'workflow.create', id, root: '/project', rootSessionId: 'root-session', request: id, baseCommit: 'base', policy })
  const activate = (id, value, parentVersion = 0) => send({ type: 'plan.activate', workflowId: id, parentVersion, plan: value,
    authorization: { scope: 'implementation', sourceId: 'user-message' }, sources: { snapshotDigest: 'snapshot' },
    review: { status: 'passed', planDigest: kernelDigest(value), evidenceRef: 'review.json' } })
  create('wf1'); activate('wf1', planValue ?? plan(tasks))
  const actions = kind => Object.values(state.actions).filter(action => !kind || action.kind === kind)
  const claim = action => send({ type: 'action.claim', actionId: action.id, token: 'claim', hostId: 'host' })
  const complete = (action, result) => { claim(action); return send({ type: 'action.result', actionId: action.id, token: 'claim', result }) }
  return { send, create, activate, actions, claim, complete, get state() { return state }, set time(value) { time = value }, get time() { return time } }
}
function submit(h, taskId) {
  h.send({ type: 'drive' })
  const action = h.actions('execute_owner').find(action => !taskId || action.input.task.id === taskId)
  h.claim(action)
  h.send({ type: 'action.started', actionId: action.id, token: 'claim', evidence: { handleId: 'handle', sessionId: 'owner-session' } })
  const attempt = h.state.workflows.wf1.attempts[action.attemptId]
  const event = { type: 'owner.submit', workflowId: 'wf1', attemptId: attempt.id, authority: attempt.authority,
    report: { status: 'completed', summary: 'Candidate' }, manifestDigest: 'manifest', artifact: '/artifacts/submission.json' }
  h.send(event)
  return { action, attempt, event }
}
function verified(h, taskId) {
  const { action, attempt } = submit(h, taskId)
  h.send({ type: 'action.result', actionId: action.id, token: 'claim', result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  h.complete(h.actions('seal_candidate').find(action => action.attemptId === attempt.id), { artifact: '/candidate', commitSha: 'content', authority: attempt.authority })
  h.complete(h.actions('verify_candidate').find(action => action.attemptId === attempt.id), { passed: true, commitSha: 'content', review: { passed: true, commitSha: 'content' },
    results: [{ verificationId: 'unit', passed: true, exitCode: 0, commitSha: 'content' }] })
  return attempt
}

test('Planner obstruction reports an existing non-review issue id collision without crashing', () => {
  const h = harness()
  const workflow = h.state.workflows.wf1
  const previousPlan = workflow.plan
  const previousPlanDigest = kernelDigest(previousPlan)
  const issueId = 'legacy-planning-issue'
  workflow.issues[issueId] = { id: issueId, sourceId: 'old-snapshot',
    closeWhen: 'bound plan review passes with source evidence', status: 'open', used: 1,
    blocksActivation: false, reviewHistory: [] }
  const actionId = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'obstruction-identity', input: {
    parentVersion: 1, previousPlan, previousPlanDigest, snapshotDigest: 'snapshot',
    registryDigest: previousPlan.registryDigest,
    revisionBoundary: { taskIds: ['T1'], verificationIds: [] },
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  const action = h.state.actions[actionId]
  h.claim(action)
  const result = { blocked: true, planDigest: previousPlanDigest, snapshotDigest: 'snapshot', evidenceRef: '/planner',
    review: { contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'Owner scope mismatch', issues: [{
      severity: 'high', obligationId: issueId, sourceId: 'T-04', sourceVersion: 'R3', targetTaskIds: ['T1'],
      title: 'Move the regression into Owner scope', detail: 'The proposed test path is outside the Worker scope.',
      suggestion: 'Use a fresh obligation id and a test path the Owner may write.',
      closeWhen: { kind: 'plan_task_executable', taskId: 'T1' },
    }] },
  }
  assert.throws(() => preflightPlanningResult(h.state, { actionId, workflowId: 'wf1', kind: 'plan',
    inputDigest: action.inputDigest }, result, h.time), /obligationId.*already belongs to a non-review issue.*new obligationId/)
})

test('Owner settlement, candidate review and integration each receive a bounded phase deadline', () => {
  const h = harness()
  const { action, attempt } = submit(h)
  const ownerDeadline = attempt.deadlineAt
  h.time = ownerDeadline - 1_000
  h.send({ type: 'action.result', actionId: action.id, token: 'claim',
    result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  const current = () => h.state.workflows.wf1.attempts[attempt.id]
  const sealing = h.actions('seal_candidate')[0]
  assert.equal(current().deadlineAt, sealing.deadlineAt)
  assert.ok(current().deadlineAt > ownerDeadline)
  h.time = ownerDeadline + 1
  h.send({ type: 'drive' })
  assert.equal(current().phase, 'sealing', 'the expired Owner clock must not cancel candidate sealing')
  h.complete(sealing, { artifact: '/candidate', commitSha: 'content', authority: attempt.authority })
  const verification = h.actions('verify_candidate')[0]
  assert.equal(current().deadlineAt, verification.deadlineAt)
  assert.ok(current().deadlineAt > sealing.deadlineAt)

  h.time = sealing.deadlineAt + 1
  h.send({ type: 'drive' })
  assert.equal(current().phase, 'verifying', 'the expired sealing clock must not cancel candidate review')
  h.complete(verification, { passed: true, commitSha: 'content', review: { passed: true, commitSha: 'content' },
    results: [{ verificationId: 'unit', passed: true, exitCode: 0, commitSha: 'content' }] })
  const integration = h.actions('integrate_candidate')[0]
  assert.equal(current().deadlineAt, integration.deadlineAt)
  assert.ok(current().deadlineAt > verification.deadlineAt)

  h.time = verification.deadlineAt + 1
  h.send({ type: 'drive' })
  assert.equal(current().phase, 'integrating', 'the expired review clock must not cancel integration')
})

test('an accepted decision for the preceding plan closes its obligation on the direct revision only', () => {
  const h = harness()
  const workflow = h.state.workflows.wf1
  const previousPlan = workflow.plan
  const previousPlanDigest = kernelDigest(previousPlan)
  const obligationId = 'panel-boundary-decision'
  const decisionId = 'decision-panel-boundary'
  workflow.issues[obligationId] = { id: obligationId, origin: 'plan_review', status: 'open', blocksActivation: true,
    source: { id: 'SPEC-PANEL', version: 'R1' }, targetTaskIds: ['T1'],
    closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' } }
  workflow.decisions[decisionId] = { id: decisionId, status: 'answered',
    request: { options: ['保留现有要求', '接受建议变更'] },
    answer: { answers: [{ id: decisionId, selected: ['接受建议变更'] }] },
    binding: { obligationId, taskId: 'T1', source: { id: 'SPEC-PANEL', version: 'R1' },
      planDigest: previousPlanDigest, planVersion: 1 } }
  const planningId = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'panel-boundary-revision', input: {
    parentVersion: 1, previousPlanDigest, snapshotDigest: 'snapshot', registryDigest: previousPlan.registryDigest,
    revisionBoundary: { taskIds: ['T1'], verificationIds: [] },
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  const planning = h.state.actions[planningId]; h.claim(planning)
  const revised = structuredClone(previousPlan)
  revised.tasks[0].done = ['Approved revised module acceptance']
  h.send({ type: 'action.result', actionId: planningId, token: 'claim', result: {
    plan: revised, snapshotDigest: 'snapshot', packagesRef: '/packages', evidenceRef: '/planner',
  } })
  const reviewAction = h.actions('review_plan').at(-1); h.claim(reviewAction)
  const planDigest = kernelDigest(revised)
  const result = { planDigest, snapshotDigest: 'snapshot', evidenceRef: '/review', review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', issues: [], obligationClosures: [{
      obligationId, kind: 'decision_record', taskId: 'T1', planDigest, decisionId,
    }],
  } }
  const preflight = () => preflightPlanningResult(h.state, { actionId: reviewAction.id, workflowId: 'wf1',
    kind: 'review_plan', inputDigest: reviewAction.inputDigest }, result, h.time)
  h.state.workflows.wf1.decisions[decisionId].answer.answers[0].selected = ['保留现有要求']
  assert.throws(preflight, /lacks verified obligationClosures/)
  h.state.workflows.wf1.decisions[decisionId].answer.answers[0].selected = ['接受建议变更']
  h.state.workflows.wf1.decisions[decisionId].binding.planDigest = 'b'.repeat(64)
  assert.throws(preflight, /lacks verified obligationClosures/)
  h.state.workflows.wf1.decisions[decisionId].binding.planDigest = previousPlanDigest
  assert.equal(preflight(), true)
  h.send({ type: 'action.result', actionId: reviewAction.id, token: 'claim', result })
  assert.equal(h.state.workflows.wf1.issues[obligationId].status, 'closed')
})

test('local replanning rejects unrelated changes and preserves a completed independent task', () => {
  const h = harness([task('Seed'), task('Browser', 'web'), task('Panel', 'panel', ['Browser'])])
  const seedAttempt = verified(h, 'Seed')
  h.complete(h.actions('integrate_candidate').find(a => a.attemptId === seedAttempt.id), {
    commitSha: 'seed', worklogRef: '/seed-log', baseCommit: 'base', candidateCommit: 'content', verified: true })
  const seed = structuredClone(h.state.workflows.wf1.tasks.Seed)
  const previous = h.state.workflows.wf1.plan
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'bounded-revision', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: previous.registryDigest,
    revisionBoundary: { taskIds: ['Browser', 'Panel'], verificationIds: [] },
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  const action = h.state.actions[id]; h.claim(action)
  const result = plan => ({ plan, snapshotDigest: 'snapshot', packagesRef: '/packages', evidenceRef: '/native-plan' })
  const check = plan => preflightPlanningResult(h.state, { actionId: id, workflowId: 'wf1', kind: 'plan', inputDigest: action.inputDigest }, result(plan), h.time)
  const revised = structuredClone(previous); revised.tasks.find(t => t.id === 'Browser').done = ['Launch a real local browser']
  for (const change of [
    p => { p.tasks[0].title = 'Renamed seed' },
    p => { p.tasks[0].done = ['Unrelated requirement'] },
    p => { p.tasks[0].decomposition = { unknowns: ['Unrelated reasoning'] } },
    p => { p.verifications[0].run = ['node', '--test', 'other.mjs'] },
    p => { p.verifications.push({ id: 'added', run: ['node', '--version'] }); p.tasks[0].verify = ['added'] },
    p => { p.tasks.push(task('Unrequested')) },
    p => { p.tasks = p.tasks.filter(t => t.id !== 'Seed') },
  ]) {
    const outside = structuredClone(revised); change(outside)
    assert.throws(() => check(outside), /exceeds declared boundary/)
    assert.throws(() => h.send({ type: 'action.result', actionId: id, token: 'claim', result: result(outside) }), /exceeds declared boundary/)
  }
  assert.equal(check(revised), true)
  h.send({ type: 'action.result', actionId: id, token: 'claim', result: result(revised) })
  const review = h.actions('review_plan').at(-1)
  assert.deepEqual(review.input.revisionBoundary, action.input.revisionBoundary)
  h.complete(review, { planDigest: kernelDigest(revised), snapshotDigest: 'snapshot', evidenceRef: '/review', review: { status: 'passed', issues: [] } })
  assert.deepEqual(h.state.workflows.wf1.tasks.Seed, seed)
  assert.equal(h.state.workflows.wf1.attempts[seedAttempt.id].phase, 'succeeded')
})

test('revision boundary includes recursive consumers, source changes, and explicit verification changes', () => {
  const h = harness([task('Browser'), task('Panel', 'web', ['Browser'])])
  const previous = ticketPlan([task('Browser'), task('Panel', 'web', ['Browser'])])
  h.activate('wf1', previous, 1)
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'narrow-boundary', input: {
    parentVersion: 2, snapshotDigest: 'snapshot', registryDigest: previous.registryDigest,
    revisionBoundary: { taskIds: ['Browser'], verificationIds: ['unit', 'replacement'] },
  } })
  const action = h.state.actions[id]; h.claim(action)
  const check = value => preflightPlanningResult(h.state, { actionId: id, workflowId: 'wf1', kind: 'plan', inputDigest: action.inputDigest },
    { plan: value, snapshotDigest: 'snapshot', packagesRef: '/packages', evidenceRef: '/plan' }, h.time)
  const changed = structuredClone(previous); changed.tasks[0].done = ['New browser requirement']
  assert.throws(() => check(changed), /tasks=\[Panel\]/)
  assert.equal(check(ticketPlan([task('Browser'), task('Panel', 'web', ['Browser'])], 'R2')), true,
    'a reviewed document revision alone does not change an otherwise identical task execution contract')
  const separate = harness([task('Only')]); const planBefore = separate.state.workflows.wf1.plan
  const pid = separate.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'verification-replacement', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: planBefore.registryDigest,
    revisionBoundary: { taskIds: ['Only'], verificationIds: ['unit', 'replacement'] },
  } })
  const replacement = structuredClone(planBefore); replacement.verifications[0].id = 'replacement'; replacement.tasks[0].verify = ['replacement']
  separate.complete(separate.state.actions[pid], { plan: replacement, snapshotDigest: 'snapshot', packagesRef: '/packages', evidenceRef: '/plan' })
  assert.equal(separate.actions('review_plan').length, 1)
})

test('task execution identity ignores global verification definition order but binds each full definition', () => {
  const raw = structuredClone(plan([task('T1')]))
  raw.verifications.push({ id: 'lint', run: ['node', '--check', 'src/api/index.mjs'] })
  raw.tasks[0].verify = ['lint', 'unit']
  const original = normalizePlanV2(raw)
  const reorderedRaw = structuredClone(original)
  reorderedRaw.verifications.reverse()
  const reordered = normalizePlanV2(reorderedRaw)
  assert.equal(engine.taskExecutionDigest(original, original.tasks[0]),
    engine.taskExecutionDigest(reordered, reordered.tasks[0]))

  const changedRaw = structuredClone(reordered)
  changedRaw.verifications.find(item => item.id === 'lint').run = ['node', '--check', 'src/api/revised.mjs']
  const changed = normalizePlanV2(changedRaw)
  assert.notEqual(engine.taskExecutionDigest(original, original.tasks[0]),
    engine.taskExecutionDigest(changed, changed.tasks[0]))
})

test('reviewed source and unrelated Owner scope revisions preserve a legacy task identity and its dispatch contract', () => {
  const tasks = [task('Seed'), task('Consumer', 'consumer', ['Seed'])]
  const h = harness(tasks)
  const r8 = ticketPlan(tasks, 'R8')
  h.send({ type: 'plan.activate', workflowId: 'wf1', parentVersion: 1, plan: r8,
    authorization: { scope: 'implementation', sourceId: 'r8-grant' },
    sources: { checkpointId: 'R8', snapshotDigest: 'snapshot-R8', packagesRef: '/packages-R8' },
    review: { status: 'passed', planDigest: kernelDigest(r8), evidenceRef: '/review-R8' } })
  const record = h.state.workflows.wf1.tasks.Seed
  record.definitionDigest = 'legacy-definition-digest'
  h.send({ type: 'drive' })
  const ownerAction = h.actions('execute_owner').find(action => action.input.task.id === 'Seed')
  const attempt = h.state.workflows.wf1.attempts[ownerAction.attemptId]
  const frozenRecord = structuredClone(h.state.workflows.wf1.tasks.Seed)
  assert.equal(attempt.definitionDigest, 'legacy-definition-digest')
  assert.equal(attempt.dispatchContract.taskPackage.planVersion, 2)
  delete h.state.workflows.wf1.attempts[attempt.id].dispatchContract
  delete ownerAction.input.directConsumers
  ownerAction.inputDigest = kernelDigest(ownerAction.input)

  const r11 = structuredClone(ticketPlan(tasks, 'R11'))
  r11.owners[0].scope.push('.npmrc')
  r11.tasks.find(item => item.id === 'Consumer').done = ['Consume the established Seed output under the new source']
  h.send({ type: 'plan.propose', workflowId: 'wf1', parentVersion: 2, plan: r11,
    authorization: { scope: 'implementation', sourceId: 'r11-grant' },
    sources: { checkpointId: 'R11', snapshotDigest: 'snapshot-R11', packagesRef: '/packages-R11' },
    review: { status: 'passed', planDigest: kernelDigest(normalizePlanV2(r11)), evidenceRef: '/review-R11' } })

  const current = h.state.workflows.wf1
  assert.equal(current.planVersion, 3)
  assert.deepEqual(current.tasks.Seed, frozenRecord)
  assert.equal(current.tasks.Seed.definitionDigest, 'legacy-definition-digest')
  assert.equal(current.tasks.Seed.attemptId, attempt.id)
  assert.equal(current.attempts[attempt.id].definitionDigest, 'legacy-definition-digest')
  assert.equal(current.attempts[attempt.id].authority, attempt.authority)
  assert.equal(current.attempts[attempt.id].dispatchContract.planVersion, 2)
  assert.equal(current.attempts[attempt.id].dispatchContract.taskPackage.packagesRef, '/packages-R8')
  assert.equal(current.attempts[attempt.id].dispatchContract.owner.scope.includes('.npmrc'), false)
  assert.deepEqual(current.attempts[attempt.id].dispatchContract.directConsumers, [{
    taskId: 'Consumer', title: 'Consumer', ownerId: 'consumer', write: ['src/consumer/**'],
    done: ['Module contract and tests pass'], verification: [{ id: 'unit', run: ['node', '--test'] }],
  }])
  assert.notDeepEqual(current.attempts[attempt.id].dispatchContract.directConsumers,
    engine.taskDirectConsumers(current.plan, 'Seed'))
  assert.equal(ownerAction.input.taskPackage.packagesRef, '/packages-R8')
  assert.equal(h.actions('stop_execution').length, 0)

  const submitted = submit(h, 'Seed')
  h.send({ type: 'action.result', actionId: submitted.action.id, token: 'claim',
    result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  h.complete(h.actions('seal_candidate').find(action => action.attemptId === attempt.id), {
    artifact: '/candidate', commitSha: 'content', authority: attempt.authority })
  const verification = h.actions('verify_candidate').find(action => action.attemptId === attempt.id)
  assert.equal(verification.input.planVersion, 2)
  assert.equal(verification.input.taskPackage.packagesRef, '/packages-R8')
  assert.deepEqual(verification.input.verifications, h.state.workflows.wf1.attempts[attempt.id].dispatchContract.verifications)
  h.complete(verification, { passed: false, commitSha: 'content', executionSettled: true,
    results: [{ verificationId: 'unit', status: 'execution_error', passed: false, commitSha: 'content',
      commandTermination: { managedRangeStopped: true } }] })
  const retryId = h.send({ type: 'action.retry', workflowId: 'wf1', actionId: verification.id,
    reason: 'The verifier resource is available again', decisionRef: 'root:r8-verifier-retry' })
  const retry = h.state.actions[retryId]
  assert.equal(retry.input.planVersion, 2)
  assert.equal(retry.input.taskPackage.packagesRef, '/packages-R8')
  assert.deepEqual(retry.input.task, h.state.workflows.wf1.attempts[attempt.id].dispatchContract.task)
  assert.deepEqual(retry.input.verifications, h.state.workflows.wf1.attempts[attempt.id].dispatchContract.verifications)
})

test('a legacy in-flight attempt without exact persisted Owner action facts cannot be carried forward', () => {
  const h = harness([task('Seed')])
  h.send({ type: 'drive' })
  const action = h.actions('execute_owner')[0]
  const attempt = h.state.workflows.wf1.attempts[action.attemptId]
  delete attempt.dispatchContract
  delete h.state.actions[action.id]
  const revised = structuredClone(plan([task('Seed')]))
  revised.summary = 'Reviewed successor source'
  assert.throws(() => h.send({ type: 'plan.propose', workflowId: 'wf1', parentVersion: 1, plan: revised,
    authorization: { scope: 'implementation', sourceId: 'successor-grant' },
    sources: { snapshotDigest: 'successor-snapshot' },
    review: { status: 'passed', planDigest: kernelDigest(normalizePlanV2(revised)), evidenceRef: '/successor-review' } }),
  /Cannot safely recover attempt dispatch contract/)
})

test('a reviewer persists an obligation outside the revision boundary and returns it to the root without a repair loop', () => {
  const h = harness([task('Browser'), task('Independent', 'web')])
  const previous = h.state.workflows.wf1.plan
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'review_plan', key: 'boundary-review', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', plan: previous, planDigest: kernelDigest(previous),
    revisionBoundary: { taskIds: ['Browser'], verificationIds: [] },
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  h.complete(h.state.actions[id], { planDigest: kernelDigest(previous), snapshotDigest: 'snapshot', evidenceRef: '/review',
    review: { status: 'needs_revision', summary: 'A separate producer needs a contract change', issues: [{
      obligationId: 'independent-contract', sourceId: 'SPEC', sourceVersion: 'R1', targetTaskIds: ['Independent'],
      title: 'Define the independent producer output', closeWhen: { kind: 'plan_task_executable', taskId: 'Independent' },
    }] } })
  assert.equal(h.state.workflows.wf1.planningFailure, 'revision_boundary_required')
  assert.equal(h.state.workflows.wf1.issues['independent-contract'].status, 'open')
  assert.equal(h.actions('plan').length, 0)
  assert.equal(h.state.workflows.wf1.recoveryUsed, 0)
  assert.equal(h.actions('notify_main').find(action => action.input.reason === 'planning_failed').input.detail.nextTool, 'workflow_replan')
})

test('a Planner reports two out-of-bound Ticket consumers and the root formally replans the same workflow with the complete boundary', () => {
  const tasks = [
    task('worker_transport'),
    task('worker_impact_review', 'review', ['worker_transport']),
    task('web_host_parity', 'web', ['worker_transport']),
    task('extension_host_parity', 'extension', ['worker_transport']),
    task('final_acceptance', 'review', ['web_host_parity', 'extension_host_parity']),
    task('unrelated', 'api'),
  ]
  const h = harness(tasks)
  const previous = h.state.workflows.wf1.plan
  const boundary = { taskIds: ['final_acceptance', 'worker_impact_review', 'worker_transport'], verificationIds: [] }
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'ticket-impact', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: previous.registryDigest,
    previousPlan: previous, previousPlanDigest: kernelDigest(previous), revisionBoundary: boundary,
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  const action = h.state.actions[id]
  h.claim(action)
  const beforeFalseApproval = structuredClone(h.state)
  assert.throws(() => preflightPlanningResult(h.state, { actionId: id, workflowId: 'wf1', kind: 'plan', inputDigest: action.inputDigest }, {
    blocked: true, planDigest: kernelDigest(previous), snapshotDigest: 'snapshot', evidenceRef: '/false-approval',
    review: { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: 'Planner cannot approve.', issues: [] },
  }, h.time), /must be negative|negative issues/)
  assert.deepEqual(h.state, beforeFalseApproval)
  h.send({ type: 'action.result', actionId: id, token: 'claim', result: { blocked: true, planDigest: kernelDigest(previous), snapshotDigest: 'snapshot',
    evidenceRef: '/native-planner-receipt', validationFailures: [{
      contract: 'DSH_PLANNING_VALIDATION_FAILURE_V1', code: 'TICKET_DEPENDENCY_UNSATISFIED',
      actionId: id, workflowId: 'wf1', inputDigest: action.inputDigest, snapshotDigest: 'snapshot',
      field: 'task(web_host_parity).dependsOn', detail: { dependencyTicketId: 'T04', missingProducerTaskIds: ['worker_impact_review'], downstreamProducerTaskIds: [] },
      evidenceRef: '/native-planner-validation-error',
    }], review: { contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'Both T04 consumers must wait for its producer.', issues: [
      { severity: 'high', obligationId: 't04-web-consumer', sourceId: 'T04', sourceVersion: 'R2',
        targetTaskIds: ['web_host_parity'], title: 'Bind the web host consumer to the T04 producer',
        detail: 'web_host_parity consumes T04 and must depend on worker_impact_review.', suggestion: 'Expand the revision boundary and add the dependency.',
        closeWhen: { kind: 'plan_task_executable', taskId: 'web_host_parity' } },
      { severity: 'high', obligationId: 't04-extension-consumer', sourceId: 'T04', sourceVersion: 'R2',
        targetTaskIds: ['extension_host_parity'], title: 'Bind the extension host consumer to the T04 producer',
        detail: 'extension_host_parity consumes T04 and must depend on worker_impact_review.', suggestion: 'Expand the revision boundary and add the dependency.',
        closeWhen: { kind: 'plan_task_executable', taskId: 'extension_host_parity' } },
    ] } } })

  let state = h.state
  assert.equal(state.actions[id].status, 'succeeded', 'a structured planning obstruction is a settled domain result')
  assert.equal(state.workflows.wf1.planningFailure, 'revision_boundary_required')
  assert.equal(h.actions('review_plan').length, 0, 'a negative Planner report is never an independent review or candidate')
  const notice = h.actions('notify_main').find(item => item.input.reason === 'planning_failed')
  assert.deepEqual(notice.input.detail.review.issues.flatMap(issue => issue.targetTaskIds).sort(), ['extension_host_parity', 'web_host_parity'])
  assert.equal(notice.input.detail.evidenceRef, '/native-planner-receipt')
  assert.equal(notice.input.detail.validationFailures[0].evidenceRef, '/native-planner-validation-error')

  const expanded = { taskIds: ['extension_host_parity', 'final_acceptance', 'web_host_parity', 'worker_impact_review', 'worker_transport'], verificationIds: [] }
  const request = { type: 'planning.request', workflowId: 'wf1', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: previous.registryDigest,
    previousPlan: previous, previousPlanDigest: kernelDigest(previous), revisionReason: 'Bind both T04 consumers.',
    revisionBoundary: boundary, sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } }
  assert.throws(() => h.send(request), /complete task and verification revision boundary/)
  request.input.revisionBoundary = expanded
  const repairId = h.send(request)
  const revised = structuredClone(previous)
  for (const consumer of ['web_host_parity', 'extension_host_parity']) revised.tasks.find(item => item.id === consumer).dependsOn.push('worker_impact_review')
  const repair = h.state.actions[repairId]
  h.claim(repair)
  const result = value => ({ plan: value, snapshotDigest: 'snapshot', packagesRef: '/packages', evidenceRef: '/replanned' })
  assert.equal(preflightPlanningResult(h.state, { actionId: repairId, workflowId: 'wf1', kind: 'plan', inputDigest: repair.inputDigest }, result(revised), h.time), true)
  const outside = structuredClone(revised); outside.tasks.find(item => item.id === 'unrelated').done.push('Unrelated change')
  assert.throws(() => preflightPlanningResult(h.state, { actionId: repairId, workflowId: 'wf1', kind: 'plan', inputDigest: repair.inputDigest }, result(outside), h.time), /exceeds declared boundary/)
  h.send({ type: 'action.result', actionId: repairId, token: 'claim', result: result(revised) })
  assert.equal(h.actions('review_plan').length, 1)
})

test('a Planner needs_split report inside its boundary requests source revision without inventing boundary expansion', () => {
  const h = harness([task('worker_transport'), task('worker_impact_review', 'review', ['worker_transport'])])
  const previous = h.state.workflows.wf1.plan
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'source-split', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: previous.registryDigest,
    previousPlan: previous, previousPlanDigest: kernelDigest(previous),
    revisionBoundary: { taskIds: ['worker_impact_review'], verificationIds: [] },
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  h.complete(h.state.actions[id], { blocked: true, planDigest: kernelDigest(previous), snapshotDigest: 'snapshot', evidenceRef: '/split',
    review: { contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_split', summary: 'T04 mixes producer and downstream work.', issues: [{
      severity: 'high', obligationId: 'split-t04', sourceId: 'T04', sourceVersion: 'R2', targetTaskIds: ['worker_impact_review'],
      title: 'Split T04 source work', detail: 'The frozen Ticket combines incompatible producer and downstream work.',
      suggestion: 'Revise and finalize the Ticket decomposition.', closeWhen: { kind: 'plan_task_executable', taskId: 'worker_impact_review' },
    }] },
  })
  assert.equal(h.state.workflows.wf1.planningFailure, 'revision_required')
  const notice = h.actions('notify_main').find(item => item.input.reason === 'planning_failed')
  assert.equal(notice.input.detail.review.status, 'needs_split')
  assert.equal(notice.input.detail.reason, 'revision_required')
})

test('a read-only Owner review is structurally executable through its durable report without business writes or verification commands', () => {
  const reviewTask = { id: 'worker_impact_review', title: 'Review Worker impact', role: 'review', ownerId: 'api',
    dependsOn: [], resources: [], write: [], verify: [], done: ['Record every affected consumer in the durable Owner report'] }
  const h = harness([reviewTask])
  const previous = h.state.workflows.wf1.plan
  const firstId = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'readonly-review-gap', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: previous.registryDigest,
    revisionBoundary: { taskIds: ['worker_impact_review'], verificationIds: [] },
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  h.complete(h.state.actions[firstId], { plan: previous, snapshotDigest: 'snapshot', packagesRef: '/packages-r1', evidenceRef: '/planner-r1' })
  const firstReview = h.actions('review_plan').at(-1)
  h.complete(firstReview, { planDigest: kernelDigest(previous), snapshotDigest: 'snapshot', evidenceRef: '/review-gap',
    review: { contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'Make the review outcome explicit.', issues: [{
      obligationId: 'worker-impact-review', sourceId: 'SPEC', sourceVersion: 'R1', targetTaskIds: ['worker_impact_review'],
      title: 'Persist the Worker impact conclusion', detail: 'The Owner report must identify affected consumers.',
      suggestion: 'State the required impact conclusion in the task contract.',
      closeWhen: { kind: 'plan_task_executable', taskId: 'worker_impact_review' },
    }] },
  })
  const revised = structuredClone(previous)
  revised.tasks[0].done.push('Map each affected consumer to the terminal acceptance rerun recorded by the final Owner.')
  const repairId = h.send({ type: 'planning.request', workflowId: 'wf1', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: previous.registryDigest,
    previousPlan: previous, previousPlanDigest: kernelDigest(previous), previousPlanActionId: firstReview.id,
    revisionReason: 'Make the durable review conclusion explicit.',
    revisionBoundary: { taskIds: ['worker_impact_review'], verificationIds: [] },
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  h.complete(h.state.actions[repairId], { plan: revised, snapshotDigest: 'snapshot', packagesRef: '/packages', evidenceRef: '/planner' })
  const second = h.actions('review_plan').at(-1)
  h.complete(second, { planDigest: kernelDigest(revised), snapshotDigest: 'snapshot', evidenceRef: '/review-passed', review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: 'The read-only Owner report is a durable execution result.', issues: [],
    obligationClosures: [{ obligationId: 'worker-impact-review', kind: 'plan_task_executable',
      taskId: 'worker_impact_review', planDigest: kernelDigest(revised) }],
  } })
  assert.equal(h.state.workflows.wf1.issues['worker-impact-review'].status, 'closed')
  assert.equal(h.state.workflows.wf1.plan.tasks[0].verify.length, 0)
  assert.equal(h.state.workflows.wf1.plan.tasks[0].write.length, 0)
})

test('an unchanged correct plan receives one independent closure review for already-satisfied plan obligations', () => {
  const reviewTask = { id: 'worker_impact_review', title: 'Review Worker impact', role: 'review', ownerId: 'api',
    dependsOn: [], resources: [], write: [], verify: [], done: ['Persist the affected-consumer conclusion'] }
  const h = harness([reviewTask])
  const value = h.state.workflows.wf1.plan
  const plannerId = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'closure-source', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: value.registryDigest,
    revisionBoundary: { taskIds: ['worker_impact_review'], verificationIds: [] },
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  h.complete(h.state.actions[plannerId], { plan: value, snapshotDigest: 'snapshot', packagesRef: '/packages-r1', evidenceRef: '/planner-r1' })
  const firstReview = h.actions('review_plan').at(-1)
  const issues = ['worker-impact-review', 'worker-impact-boundary'].map((obligationId, index) => ({
    obligationId, sourceId: 'SPEC', sourceVersion: 'R1', targetTaskIds: ['worker_impact_review'],
    title: `Worker impact obligation ${index + 1}`, detail: 'The read-only review must be structurally executable.',
    suggestion: 'Use the durable Owner report.', closeWhen: { kind: 'plan_task_executable', taskId: 'worker_impact_review' },
  }))
  h.complete(firstReview, { planDigest: kernelDigest(value), snapshotDigest: 'snapshot', evidenceRef: '/review-gap', review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'The old runtime did not recognize the read-only review.', issues,
  } })
  const repairId = h.send({ type: 'planning.request', workflowId: 'wf1', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: value.registryDigest,
    previousPlan: value, previousPlanDigest: kernelDigest(value), previousPlanActionId: firstReview.id,
    revisionReason: 'Re-evaluate the unchanged correct plan with current closure evidence.',
    revisionBoundary: { taskIds: ['worker_impact_review'], verificationIds: [] },
    openObligations: Object.values(h.state.workflows.wf1.issues).filter(item => item.status === 'open'),
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  const reviewsBefore = h.actions('review_plan').length
  h.complete(h.state.actions[repairId], { plan: value, snapshotDigest: 'snapshot', packagesRef: '/packages-r2', evidenceRef: '/planner-r2' })
  const closureReview = h.actions('review_plan').at(-1)
  assert.equal(h.actions('review_plan').length, reviewsBefore + 1)
  assert.equal(closureReview.input.previousPlanDigest, closureReview.input.planDigest)
  assert.deepEqual(closureReview.input.openObligations.filter(item => item.origin === 'plan_review').map(item => item.id).sort(),
    issues.map(item => item.obligationId).sort())
  h.complete(closureReview, { planDigest: kernelDigest(value), snapshotDigest: 'snapshot', evidenceRef: '/review-passed', review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: 'Both obligations are satisfied by the current plan.', issues: [],
    obligationClosures: issues.map(issue => ({ obligationId: issue.obligationId, ...issue.closeWhen, planDigest: kernelDigest(value) })),
  } })
  for (const issue of issues) assert.equal(h.state.workflows.wf1.issues[issue.obligationId].status, 'closed')
})

test('one negative unchanged-plan closure review blocks only the same plan, source, and obligation identity set', () => {
  const reviewTask = { id: 'readonly_review', title: 'Read-only review', role: 'review', ownerId: 'api',
    dependsOn: [], resources: [], write: [], verify: [], done: ['Persist the review conclusion'] }
  const h = harness([reviewTask])
  const value = h.state.workflows.wf1.plan
  const sourcePlanner = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'repeat-closure-source', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: value.registryDigest,
    revisionBoundary: { taskIds: ['readonly_review'], verificationIds: [] },
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  h.complete(h.state.actions[sourcePlanner], { plan: value, snapshotDigest: 'snapshot', packagesRef: '/packages-r1', evidenceRef: '/planner-r1' })
  const sourceReview = h.actions('review_plan').at(-1)
  const issue = { obligationId: 'readonly-review-obligation', sourceId: 'SPEC', sourceVersion: 'R1', targetTaskIds: ['readonly_review'],
    title: 'Review the current task', detail: 'The closure fact is available.', suggestion: 'Submit the exact closure.',
    closeWhen: { kind: 'plan_task_executable', taskId: 'readonly_review' } }
  h.complete(sourceReview, { planDigest: kernelDigest(value), snapshotDigest: 'snapshot', evidenceRef: '/review-gap', review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'One obligation remains.', issues: [issue],
  } })
  const openObligations = () => Object.values(h.state.workflows.wf1.issues).filter(item => item.status === 'open')
  const request = revisionReason => ({ type: 'planning.request', workflowId: 'wf1', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: value.registryDigest,
    previousPlan: value, previousPlanDigest: kernelDigest(value), previousPlanActionId: h.state.workflows.wf1.planningCandidate.actionId,
    revisionReason, revisionBoundary: { taskIds: ['readonly_review'], verificationIds: [] }, openObligations: openObligations(),
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  const firstPlanner = h.send(request('First closure-only review.'))
  h.complete(h.state.actions[firstPlanner], { plan: value, snapshotDigest: 'snapshot', packagesRef: '/packages-r2', evidenceRef: '/planner-r2' })
  const negativeReview = h.actions('review_plan').at(-1)
  h.complete(negativeReview, { planDigest: kernelDigest(value), snapshotDigest: 'snapshot', evidenceRef: '/negative-review', review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'The same obligation was repeated.', issues: [issue],
  } })
  const secondPlanner = h.send(request('Do not repeat the same empty review.'))
  const secondAction = h.state.actions[secondPlanner]; h.claim(secondAction)
  const result = { plan: value, snapshotDigest: 'snapshot', packagesRef: '/packages-r3', evidenceRef: '/planner-r3' }
  assert.throws(() => preflightPlanningResult(h.state, { actionId: secondPlanner, workflowId: 'wf1', kind: 'plan',
    inputDigest: secondAction.inputDigest }, result, h.time), /planning_no_progress/)
  h.send({ type: 'action.result', actionId: secondPlanner, token: 'claim', result })
  assert.equal(h.state.actions[secondPlanner].failure, 'planning_no_progress')

  const changedSourcePlanner = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'changed-source-closure', input: {
    parentVersion: 1, snapshotDigest: 'snapshot-v2', registryDigest: value.registryDigest,
    previousPlan: value, previousPlanDigest: kernelDigest(value),
    revisionReason: 'Review the same facts from a newly admitted source.',
    revisionBoundary: { taskIds: ['readonly_review'], verificationIds: [] }, openObligations: openObligations(),
    sources: { snapshotDigest: 'snapshot-v2' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  const sourceReviewCount = h.actions('review_plan').length
  h.complete(h.state.actions[changedSourcePlanner], { plan: value, snapshotDigest: 'snapshot-v2',
    packagesRef: '/packages-source-v2', evidenceRef: '/planner-source-v2' })
  assert.equal(h.actions('review_plan').length, sourceReviewCount + 1,
    'a negative closure-only review from another source cannot block this source')
  h.complete(h.actions('review_plan').at(-1), { planDigest: kernelDigest(value), snapshotDigest: 'snapshot-v2',
    evidenceRef: '/negative-review-source-v2', review: {
      contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'The same obligation was repeated for the new source.', issues: [issue],
    } })

  const newIssue = { id: 'new-review-obligation', declaredId: 'new-review-obligation', category: 'plan-contract', severity: 'high',
    title: 'A newly discovered review obligation', detail: 'This identity was not present in the prior closure-only review.',
    suggestion: 'Review its already available structural fact.', source: { id: 'SPEC', version: 'R1' }, targetTaskIds: ['readonly_review'],
    closeWhen: { kind: 'plan_task_executable', taskId: 'readonly_review' }, status: 'open',
    definition: { source: { id: 'SPEC', version: 'R1' }, targetTaskIds: ['readonly_review'],
      closeWhen: { kind: 'plan_task_executable', taskId: 'readonly_review' } }, sourceId: 'SPEC', used: 0,
    blocksActivation: true, origin: 'plan_review' }
  h.state.workflows.wf1.issues[newIssue.id] = newIssue
  const thirdPlanner = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'new-obligation-closure', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: value.registryDigest,
    previousPlan: value, previousPlanDigest: kernelDigest(value),
    revisionReason: 'Review the newly discovered obligation identity.',
    revisionBoundary: { taskIds: ['readonly_review'], verificationIds: [] }, openObligations: openObligations(),
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  const reviewCount = h.actions('review_plan').length
  h.complete(h.state.actions[thirdPlanner], { plan: value, snapshotDigest: 'snapshot', packagesRef: '/packages-r4', evidenceRef: '/planner-r4' })
  assert.equal(h.actions('review_plan').length, reviewCount + 1,
    'an older negative review cannot block a newly admitted obligation identity set')
})

test('an unchanged plan with a genuinely missing closure fact remains no progress', () => {
  const reviewTask = { id: 'readonly_review', title: 'Read-only review', role: 'review', ownerId: 'api',
    dependsOn: [], resources: [], write: [], verify: [], done: ['Persist the review conclusion'] }
  const h = harness([reviewTask])
  const value = h.state.workflows.wf1.plan
  const plannerId = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'missing-fact-source', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: value.registryDigest,
    revisionBoundary: { taskIds: ['readonly_review'], verificationIds: ['unit'] },
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  h.complete(h.state.actions[plannerId], { plan: value, snapshotDigest: 'snapshot', packagesRef: '/packages-r1', evidenceRef: '/planner-r1' })
  const sourceReview = h.actions('review_plan').at(-1)
  h.complete(sourceReview, { planDigest: kernelDigest(value), snapshotDigest: 'snapshot', evidenceRef: '/review-gap', review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'The unit binding is absent.', issues: [{
      obligationId: 'missing-review-binding', sourceId: 'SPEC', sourceVersion: 'R1', targetTaskIds: ['readonly_review'],
      targetVerificationIds: ['unit'], title: 'Bind unit to the review', detail: 'The current plan lacks the binding.',
      suggestion: 'Add the binding only if the source requires it.',
      closeWhen: { kind: 'plan_verification_binding', taskId: 'readonly_review', verificationId: 'unit' },
    }] },
  })
  const repairId = h.send({ type: 'planning.request', workflowId: 'wf1', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: value.registryDigest,
    previousPlan: value, previousPlanDigest: kernelDigest(value), previousPlanActionId: sourceReview.id,
    revisionReason: 'Try the unchanged plan without its required binding.',
    revisionBoundary: { taskIds: ['readonly_review'], verificationIds: ['unit'] },
    openObligations: Object.values(h.state.workflows.wf1.issues).filter(item => item.status === 'open'),
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  const repair = h.state.actions[repairId]; h.claim(repair)
  const result = { plan: value, snapshotDigest: 'snapshot', packagesRef: '/packages-r2', evidenceRef: '/planner-r2' }
  const reviewCount = h.actions('review_plan').length
  assert.throws(() => preflightPlanningResult(h.state, { actionId: repairId, workflowId: 'wf1', kind: 'plan',
    inputDigest: repair.inputDigest }, result, h.time), /planning_no_progress/)
  assert.equal(h.actions('review_plan').length, reviewCount)
})

test('review target verifications remain unchanged when existing terminal bindings already cover the concern', () => {
  const verificationIds = ['journey-suite', 'typecheck', 'extension-typecheck', 'web-build', 'extension-build']
  const value = normalizePlanV2({ contract: 'DSH_PLAN_V2', registryDigest: 'a'.repeat(64), summary: 'Terminal consumer reruns',
    owners: [owner('api'), owner('panel'), owner('web'), owner('extension'), owner('quality')],
    verifications: verificationIds.map(id => ({ id, run: ['node', id] })),
    tasks: [
      { ...task('worker_transport'), verify: ['typecheck'] },
      { id: 'worker_impact_review', title: 'Review Worker impact', role: 'review', ownerId: 'api', dependsOn: ['worker_transport'],
        resources: [], write: [], verify: [], done: ['Record affected consumers in the durable Owner report'] },
      { id: 'panel_journeys', title: 'Panel journeys', role: 'work', ownerId: 'panel', dependsOn: ['worker_transport'],
        resources: [], write: ['src/panel/**'], verify: ['typecheck'], done: ['Panel journeys pass'] },
      { id: 'web_host_parity', title: 'Web host parity', role: 'work', ownerId: 'web', dependsOn: ['worker_impact_review', 'panel_journeys'],
        resources: [], write: ['src/web/**'], verify: ['web-build'], done: ['Web consumes the impact conclusion'] },
      { id: 'extension_host_parity', title: 'Extension host parity', role: 'work', ownerId: 'extension', dependsOn: ['worker_impact_review', 'panel_journeys'],
        resources: [], write: ['src/extension/**'], verify: ['extension-typecheck', 'extension-build'], done: ['Extension consumes the impact conclusion'] },
      { id: 'final_acceptance', title: 'Terminal acceptance', role: 'verify', ownerId: 'quality',
        dependsOn: ['worker_impact_review', 'panel_journeys', 'web_host_parity', 'extension_host_parity'], resources: [], write: [],
        verify: verificationIds, done: ['Run every possible affected consumer after the impact review and deliveries'] },
    ] })
  const h = harness(); h.activate('wf1', value, 1)
  const taskIds = value.tasks.map(task => task.id)
  const plannerId = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'terminal-rerun-review', input: {
    parentVersion: 2, snapshotDigest: 'snapshot', registryDigest: value.registryDigest,
    revisionBoundary: { taskIds, verificationIds },
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  h.complete(h.state.actions[plannerId], { plan: value, snapshotDigest: 'snapshot', packagesRef: '/packages-r1', evidenceRef: '/planner-r1' })
  const firstReview = h.actions('review_plan').at(-1)
  h.complete(firstReview, { planDigest: kernelDigest(value), snapshotDigest: 'snapshot', evidenceRef: '/review-gap', review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'Clarify the durable impact conclusion.', issues: [{
      obligationId: 'terminal-impact-reruns', sourceId: 'SPEC', sourceVersion: 'R1',
      targetTaskIds: ['worker_transport', 'worker_impact_review', 'final_acceptance'], targetVerificationIds: verificationIds,
      title: 'Bind the Worker impact conclusion to terminal reruns', detail: 'The review report must identify the covered consumers.',
      suggestion: 'Map the conclusion to the existing terminal reruns without changing correct commands.',
      closeWhen: { kind: 'plan_task_executable', taskId: 'worker_impact_review' },
    }] },
  })
  assert.equal(h.state.workflows.wf1.issues['terminal-impact-reruns'].verificationRepairBaseline, undefined,
    'target verification ids do not create an undeclared mutation baseline')
  const legacyBaseline = Object.fromEntries(verificationIds.map(id => [id, {
    definitionDigest: kernelDigest(value.verifications.find(item => item.id === id)),
    bindingDigest: kernelDigest(value.tasks.filter(task => task.verify.includes(id)).map(task => task.id).sort()),
  }]))
  h.state.workflows.wf1.issues['terminal-impact-reruns'].verificationRepairBaseline = legacyBaseline
  const revised = structuredClone(value)
  revised.tasks.find(item => item.id === 'worker_impact_review').done.push('Map each conclusion to the existing terminal verification ids.')
  const repairId = h.send({ type: 'planning.request', workflowId: 'wf1', input: {
    parentVersion: 2, snapshotDigest: 'snapshot', registryDigest: value.registryDigest,
    previousPlan: value, previousPlanDigest: kernelDigest(value), previousPlanActionId: firstReview.id,
    revisionReason: 'Clarify the existing terminal rerun evidence.',
    revisionBoundary: { taskIds, verificationIds },
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  h.complete(h.state.actions[repairId], { plan: revised, snapshotDigest: 'snapshot', packagesRef: '/packages-r2', evidenceRef: '/planner-r2' })
  const secondReview = h.actions('review_plan').at(-1)
  h.complete(secondReview, { planDigest: kernelDigest(revised), snapshotDigest: 'snapshot', evidenceRef: '/review-passed', review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: 'The existing terminal reruns cover every possible consumer.', issues: [],
    obligationClosures: [{ obligationId: 'terminal-impact-reruns', kind: 'plan_task_executable',
      taskId: 'worker_impact_review', planDigest: kernelDigest(revised) }],
  } })
  assert.deepEqual(h.state.workflows.wf1.plan.verifications, value.verifications)
  for (const id of verificationIds) {
    const before = value.tasks.filter(task => task.verify.includes(id)).map(task => task.id).sort()
    const after = h.state.workflows.wf1.plan.tasks.filter(task => task.verify.includes(id)).map(task => task.id).sort()
    assert.deepEqual(after, before, `${id} keeps its already-correct bindings`)
  }
  assert.equal(h.state.workflows.wf1.issues['terminal-impact-reruns'].status, 'closed')
  assert.deepEqual(h.state.workflows.wf1.issues['terminal-impact-reruns'].verificationRepairBaseline, legacyBaseline,
    'legacy evidence stays intact but does not invent an undeclared mutation condition')
})

test('an explicit plan verification binding obligation stays open when the target task lacks that binding', () => {
  const h = harness()
  const value = structuredClone(h.state.workflows.wf1.plan)
  value.tasks[0].role = 'review'
  value.tasks[0].write = []
  value.tasks[0].verify = []
  const plannerId = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'plan', key: 'missing-explicit-binding', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: value.registryDigest,
    revisionBoundary: { taskIds: ['T1'], verificationIds: ['unit'] },
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  h.complete(h.state.actions[plannerId], { plan: value, snapshotDigest: 'snapshot', packagesRef: '/packages', evidenceRef: '/planner' })
  const firstReview = h.actions('review_plan').at(-1)
  h.complete(firstReview, { planDigest: kernelDigest(value), snapshotDigest: 'snapshot', evidenceRef: '/review-gap', review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'T1 lacks the required unit binding.', issues: [{
      obligationId: 'missing-unit-binding', sourceId: 'SPEC', sourceVersion: 'R1', targetTaskIds: ['T1'], targetVerificationIds: ['unit'],
      title: 'Bind unit verification to T1', detail: 'The declared verification is not bound to its producer.',
      suggestion: 'Add unit to T1.verify.', closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
    }] },
  })
  const secondId = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'review_plan', key: 'false-binding-closure', input: firstReview.input })
  const second = h.state.actions[secondId]; h.claim(second)
  assert.throws(() => h.send({ type: 'action.result', actionId: secondId, token: 'claim', result: {
    planDigest: kernelDigest(value), snapshotDigest: 'snapshot', evidenceRef: '/false-closure', review: {
      contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: 'Incorrectly claims the missing binding.', issues: [],
      obligationClosures: [{ obligationId: 'missing-unit-binding', kind: 'plan_verification_binding', taskId: 'T1',
        verificationId: 'unit', planDigest: kernelDigest(value) }],
    },
  } }), /passed review lacks verified obligationClosures for missing-unit-binding/)
  assert.equal(h.state.workflows.wf1.issues['missing-unit-binding'].status, 'open')
})

for (const verificationInBoundary of [false, true]) test(`review target scope returns to root without forcing an unrelated command mutation (verification allowed: ${verificationInBoundary})`, () => {
  const h = harness()
  const value = h.state.workflows.wf1.plan
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'review_plan', key: 'wrapper-review', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', plan: value, planDigest: kernelDigest(value),
    revisionBoundary: { taskIds: ['T1'], verificationIds: verificationInBoundary ? ['unit'] : [] },
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  h.complete(h.state.actions[id], { planDigest: kernelDigest(value), snapshotDigest: 'snapshot', evidenceRef: '/review',
    review: { status: 'needs_revision', summary: 'The task contract needs a clearer evidence statement.', issues: [{
      obligationId: 'wrapper-command', sourceId: 'SPEC', sourceVersion: 'R1', targetTaskIds: ['T1'], targetVerificationIds: ['unit'],
      title: 'Clarify the evidence statement', closeWhen: { kind: 'plan_task_executable', taskId: 'T1' },
    }] } })
  assert.equal(h.actions('plan').length, 0, 'a review is evidence for the root, never authority for another planner')
  assert.equal(h.state.workflows.wf1.recoveryUsed, 0)
  assert.equal(h.state.workflows.wf1.planningFailure, verificationInBoundary ? 'revision_required' : 'revision_boundary_required')
  assert.deepEqual(h.state.workflows.wf1.issues['wrapper-command'].targetVerificationIds, ['unit'])
  const request = { type: 'planning.request', workflowId: 'wf1', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: value.registryDigest,
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
    revisionReason: 'Clarify the task evidence statement', revisionBoundary: { taskIds: ['T1'], verificationIds: [] },
  } }
  const before = structuredClone(h.state)
  assert.throws(() => h.send(request), /complete task and verification revision boundary/)
  assert.deepEqual(h.state, before, 'an incomplete repair scope consumes no allowance or action')
  request.input.revisionBoundary.verificationIds = ['unit']
  const repair = h.send(request); const action = h.state.actions[repair]; h.claim(action)
  const changed = structuredClone(value); changed.tasks[0].done.push('Records the evidence covered by unit')
  const result = plan => ({ plan, snapshotDigest: 'snapshot', packagesRef: '/packages', evidenceRef: '/planner' })
  assert.equal(preflightPlanningResult(h.state, { actionId: repair, workflowId: 'wf1', kind: 'plan', inputDigest: action.inputDigest },
    result(changed), h.time), true)
  assert.deepEqual(changed.verifications, value.verifications, 'target verification ids are review scope, not mandatory mutations')
  h.send({ type: 'action.result', actionId: repair, token: 'claim', result: result(changed) })
  const reviewAction = h.actions('review_plan').at(-1); h.claim(reviewAction)
  const beforeIncomplete = structuredClone(h.state)
  const incomplete = { planDigest: kernelDigest(changed), snapshotDigest: 'snapshot', evidenceRef: '/incomplete-review',
    review: { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', issues: [] } }
  assert.throws(() => preflightPlanningResult(h.state, { actionId: reviewAction.id, workflowId: 'wf1',
    kind: 'review_plan', inputDigest: reviewAction.inputDigest }, incomplete, h.time), /passed review lacks.*wrapper-command/)
  assert.deepEqual(h.state, beforeIncomplete, 'incomplete positive review must remain correctable in this same native action')
  const legacy = structuredClone(beforeIncomplete)
  legacy.actions[reviewAction.id].status = 'succeeded'
  legacy.actions[reviewAction.id].result = { ...incomplete, executionSettled: true }
  legacy.workflows.wf1.planningFailure = 'revision_required'
  const reviewRetry = { type: 'action.retry', workflowId: 'wf1', actionId: reviewAction.id,
    reason: 'Correct the missing report closure against the same plan', decisionRef: 'root-review-correction' }
  const restored = transition(legacy, reviewRetry, h.time)
  assert.equal(restored.state.actions[restored.result].kind, 'review_plan')
  assert.deepEqual(restored.state.actions[restored.result].input, { ...legacy.actions[reviewAction.id].input, repairReason: reviewRetry.reason })
  assert.equal(restored.state.workflows.wf1.recoveryUsed, legacy.workflows.wf1.recoveryUsed + 1)
  legacy.workflows.wf1.recoveryWindow = { limit: legacy.workflows.wf1.recoveryUsed, issueLimits: {} }
  assert.throws(() => transition(legacy, reviewRetry, h.time), /budget exhausted/)
  h.send({ type: 'action.result', actionId: reviewAction.id, token: 'claim', result: { planDigest: kernelDigest(changed), snapshotDigest: 'snapshot', evidenceRef: '/fixed-review',
    review: { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', issues: [], obligationClosures: [{
      obligationId: 'wrapper-command', kind: 'plan_task_executable', taskId: 'T1', planDigest: kernelDigest(changed),
    }] } } })
  assert.equal(h.state.workflows.wf1.issues['wrapper-command'].status, 'closed')
})

test('one native recovery authorization preserves exhausted history and allows exactly one root repair across reload', () => {
  const h = harness(undefined, { policy: { totalRecovery: 1, issueRecovery: 1 } })
  const input = { parentVersion: 1, snapshotDigest: 'snapshot', revisionReason: 'first repair' }
  const first = h.send({ type: 'planning.request', workflowId: 'wf1', input })
  stoppedAction(h, h.state.actions[first])
  const records = structuredClone(h.state.workflows.wf1.tasks)
  h.send({ type: 'recovery.request', workflowId: 'wf1', id: 'one-more', attempts: 1, reason: 'Fixed the observed boundary bug; try once' })
  const decision = h.state.workflows.wf1.decisions['one-more']
  assert.equal(h.state.workflows.wf1.recoveryUsed, 1)
  assert.equal(view(h.state, 'wf1').recovery.limit, 1, 'pending permission grants no allowance')
  h.send({ type: 'decision.answer', workflowId: 'wf1', id: decision.id, requestDigest: decision.requestDigest,
    rootSessionId: 'root-session', evidenceRef: '/native-answer', answer: { answers: [{ id: decision.id, selected: ['允许这轮恢复'] }] } })
  assert.equal(view(h.state, 'wf1').recovery.limit, 2)
  assert.equal(h.state.workflows.wf1.recoveryUsed, 1, 'history must never be zeroed')
  const loaded = JSON.parse(JSON.stringify(h.state))
  const next = transition(loaded, { type: 'planning.request', workflowId: 'wf1', input: { ...input, revisionReason: 'actual fix' } }, h.time)
  assert.equal(next.state.workflows.wf1.recoveryUsed, 2)
  assert.deepEqual(next.state.workflows.wf1.tasks, records)
  assert.equal(next.state.workflows.wf1.recoveryAuthorizations[0].evidenceRef, '/native-answer')
  // A replayed native answer cannot add another attempt.
  const replay = transition(next.state, { type: 'decision.answer', workflowId: 'wf1', id: decision.id, requestDigest: decision.requestDigest,
    rootSessionId: 'root-session', evidenceRef: '/native-answer', answer: { answers: [{ id: decision.id, selected: ['允许这轮恢复'] }] } }, h.time)
  assert.equal(view(replay.state, 'wf1').recovery.limit, 2)
  let after = next.state
  const send = event => { const value = transition(after, event, h.time); after = value.state; return value.result }
  const claim = action => send({ type: 'action.claim', actionId: action.id, token: 'claim', hostId: 'host' })
  stoppedAction({ send, claim, actions: kind => Object.values(after.actions).filter(action => action.kind === kind),
    complete: (action, result) => { claim(action); send({ type: 'action.result', actionId: action.id, token: 'claim', result }) },
    get time() { return h.time }, set time(value) { h.time = value } }, after.actions[next.result])
  // The next entry must reject before dispatch even if the prior failure is settled.
  const exhausted = structuredClone(after)
  assert.throws(() => send({ type: 'planning.request', workflowId: 'wf1', input: { ...input, revisionReason: 'another repair' } }), /budget exhausted/)
  assert.deepEqual(after, exhausted)
  assert.throws(() => send({ type: 'action.retry', workflowId: 'wf1', actionId: next.result,
    reason: 'Try the alternate entry', decisionRef: 'root-call' }), /budget exhausted/)
  assert.deepEqual(after, exhausted, 'action retry shares the same approved cap')
})

test('recovery authorization can be granted while an unrelated healthy Owner keeps running', () => {
  const h = harness([task('T1'), task('T2', 'web')])
  h.send({ type: 'drive' })
  const running = h.actions('execute_owner').find(action => action.input.task.id === 'T1')
  h.claim(running)
  h.send({ type: 'action.started', actionId: running.id, token: 'claim',
    evidence: { handleId: 'handle', sessionId: 'owner-session' } })
  h.state.workflows.wf1.recoveryUsed = h.state.workflows.wf1.policy.totalRecovery
  const before = structuredClone(h.state.actions[running.id])

  h.send({ type: 'recovery.request', workflowId: 'wf1', id: 'bounded-replan', attempts: 1,
    reason: 'One scoped planning correction unrelated to the active Owner' })
  const decision = h.state.workflows.wf1.decisions['bounded-replan']
  h.send({ type: 'decision.answer', workflowId: 'wf1', id: decision.id, requestDigest: decision.requestDigest,
    rootSessionId: 'root-session', evidenceRef: '/native-answer',
    answer: { answers: [{ id: decision.id, selected: ['允许这轮恢复'] }] } })

  assert.equal(view(h.state, 'wf1').recovery.limit, h.state.workflows.wf1.policy.totalRecovery + 1)
  assert.equal(h.state.workflows.wf1.recoveryUsed, h.state.workflows.wf1.policy.totalRecovery)
  assert.deepEqual(h.state.actions[running.id], before, 'authorization must not stop or mutate the active Owner')
})

test('recovery approval cannot apply after another recovery changed its bound counter', () => {
  const h = harness()
  h.send({ type: 'recovery.request', workflowId: 'wf1', id: 'stale-recovery', attempts: 1, reason: 'single try' })
  const d = h.state.workflows.wf1.decisions['stale-recovery']
  const id = h.send({ type: 'planning.request', workflowId: 'wf1', input: { parentVersion: 1, snapshotDigest: 'snapshot', revisionReason: 'other repair' } })
  stoppedAction(h, h.state.actions[id])
  const before = structuredClone(h.state)
  assert.throws(() => h.send({ type: 'decision.answer', workflowId: 'wf1', id: d.id, requestDigest: d.requestDigest,
    rootSessionId: 'root-session', evidenceRef: '/answer', answer: { answers: [{ id: d.id, selected: ['允许这轮恢复'] }] } }), /stale/)
  assert.deepEqual(h.state, before)
})

for (const answer of [[], ['保持暂停']]) test(`recovery permission ${JSON.stringify(answer)} grants nothing`, () => {
  const h = harness()
  h.send({ type: 'recovery.request', workflowId: 'wf1', id: 'denied', attempts: 1, reason: 'one diagnostic retry' })
  const d = h.state.workflows.wf1.decisions.denied
  h.send({ type: 'decision.answer', workflowId: 'wf1', id: d.id, requestDigest: d.requestDigest,
    rootSessionId: 'root-session', evidenceRef: '/answer', answer: { answers: [{ id: d.id, selected: answer }] } })
  assert.equal(h.state.workflows.wf1.recoveryWindow, undefined)
  assert.equal(h.state.workflows.wf1.recoveryAuthorizations, undefined)
  assert.equal(h.actions('plan').length, 0)
})

test('changed source activation waits for its Git baseline binding and preserves unrelated execution', () => {
  const h = harness([task('T1', 'api'), task('T2', 'web')])
  h.send({ type: 'drive' })
  const first = h.actions('execute_owner').find(action => action.input.task.id === 'T1')
  const second = h.actions('execute_owner').find(action => action.input.task.id === 'T2')
  h.claim(first); h.claim(second)
  const revised = plan([{ ...task('T1', 'api'), done: ['Revised business requirement'] }, task('T2', 'web')])
  h.send({ type: 'plan.propose', workflowId: 'wf1', parentVersion: 1, plan: revised,
    authorization: { scope: 'implementation', sourceId: 'revised-native-grant' },
    sources: { checkpointId: 'new-checkpoint', snapshotDigest: 'new-snapshot', codeBaseline: { sourceHead: 'base', checkpointCommit: 'doc-checkpoint' } },
    review: { status: 'passed', planDigest: kernelDigest(revised), evidenceRef: '/review' } })
  assert.equal(h.state.workflows.wf1.attempts[first.attemptId].phase, 'stopping')
  assert.equal(h.state.workflows.wf1.attempts[second.attemptId].phase, 'dispatching')
  const stopped = h.actions('stop_execution').find(action => action.attemptId === first.attemptId)
  const attempt = h.state.workflows.wf1.attempts[first.attemptId]
  h.complete(stopped, { executionSettled: true, sourceWritesClosed: true, terminationId: 'fixture-stop', authority: attempt.authority, attemptId: attempt.id })
  h.send({ type: 'drive' }); h.send({ type: 'drive' })
  assert.equal(h.actions('prepare_revision').length, 1)
  assert.equal(h.state.workflows.wf1.planVersion, 1)
  assert.equal(h.state.workflows.wf1.baseCommit, 'base')
  h.complete(h.actions('prepare_revision')[0], { baseCommit: 'base', checkpointCommit: 'doc-checkpoint', commitSha: 'combined-sources', evidenceRef: '/git-revision', executionSettled: true, sourceWritesClosed: true })
  assert.equal(h.state.workflows.wf1.baseCommit, 'doc-checkpoint')
  assert.equal(h.state.workflows.wf1.integrationHead, 'combined-sources')
  assert.equal(h.state.workflows.wf1.planVersion, 2)
  assert.equal(h.state.workflows.wf1.tasks.T2.attemptId, second.attemptId)
})

test('a persisted legacy Owner feedback issue remains visible without deadlocking its source revision', () => {
  const h = harness()
  h.send({ type: 'drive' })
  const ownerAction = h.actions('execute_owner')[0]
  const sourceId = 'public-contract-gap'
  const issueId = `issue-${kernelDigest([ownerAction.attemptId, sourceId]).slice(0, 40)}`
  h.send({ type: 'issue.register', workflowId: 'wf1', issue: { id: issueId, sourceId,
    closeWhen: 'public producer contract is reviewed', blocksActivation: true } })
  h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'notify_main', key: issueId,
    input: { rootSessionId: 'root-session', reason: 'owner_feedback', detail: { issueId,
      report: { taskId: 'T1', sourceId, issue: 'The public producer contract is undeclared.' } } } })
  const context = planningIssueContext(h.state, h.state.workflows.wf1)
  assert.deepEqual(context.openObligations, [])
  assert.deepEqual(context.ownerFeedbackFacts, [{
    id: issueId, origin: 'owner_feedback', status: 'open', blocksActivation: false,
    source: { taskId: 'T1', ownerId: 'api', attemptId: ownerAction.attemptId },
    report: { sourceId, taskId: 'T1', issue: 'The public producer contract is undeclared.' },
  }])
  const active = h.state.workflows.wf1.plan
  const planningId = h.send({ type: 'planning.request', workflowId: 'wf1', input: { parentVersion: 1,
    checkpointId: 'R2', snapshotDigest: 'source-R2', previousSnapshotDigest: 'snapshot', registryDigest: active.registryDigest,
    sources: { checkpointId: 'R2', snapshotDigest: 'source-R2', codeBaseline: { sourceHead: 'base', checkpointCommit: 'docs-R2' } },
    authorization: { scope: 'implementation', sourceId: 'native-R2' }, revisionReason: 'Declare the public producer contract' } })
  h.complete(h.state.actions[planningId], { plan: active, packagesRef: '/packages-R2', evidenceRef: '/planner-R2', snapshotDigest: 'source-R2' })
  const review = h.actions('review_plan').at(-1)
  h.complete(review, { planDigest: kernelDigest(active), snapshotDigest: 'source-R2', evidenceRef: '/review-R2',
    review: { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: 'The revised source is bound.', issues: [] } })
  assert.equal(h.state.workflows.wf1.issues[issueId].status, 'open')
  assert.equal(h.state.workflows.wf1.issues[issueId].blocksActivation, true, 'persisted identity is not rewritten')
  assert.equal(h.actions('prepare_revision').length, 1)
  assert.equal(h.actions('notify_main').filter(action => action.input.reason === 'plan_activated').length, 0,
    'a pending source revision is not an activation')
  h.complete(h.actions('prepare_revision')[0], { baseCommit: 'base', checkpointCommit: 'docs-R2',
    commitSha: 'combined-source-R2', evidenceRef: '/git-revision-R2', executionSettled: true, sourceWritesClosed: true })
  assert.equal(h.state.workflows.wf1.planVersion, 2)
  const activated = h.actions('notify_main').filter(action => action.input.reason === 'plan_activated')
  assert.equal(activated.length, 1)
  assert.deepEqual(activated[0].input.detail, {
    planVersion: 2,
    planDigest: kernelDigest(active),
    unresolvedOwnerFeedback: true,
    feedbackIssueCount: 1,
    nextTool: 'workflow_status',
  })
  h.send({ type: 'drive' }); h.send({ type: 'drive' })
  assert.equal(h.actions('notify_main').filter(action => action.input.reason === 'plan_activated').length, 1)
})

test('plan activation does not notify for absent, closed or unproved Owner feedback', () => {
  const h = harness()
  assert.equal(h.actions('notify_main').filter(action => action.input.reason === 'plan_activated').length, 0)
  h.send({ type: 'drive' })
  const ownerAction = h.actions('execute_owner')[0]
  const sourceId = 'resolved-contract-gap'
  const closeWhen = 'public producer contract is reviewed'
  const issueId = `issue-${kernelDigest([ownerAction.attemptId, sourceId]).slice(0, 40)}`
  h.send({ type: 'issue.register', workflowId: 'wf1', issue: { id: issueId, sourceId, closeWhen, blocksActivation: true } })
  h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'notify_main', key: issueId,
    input: { rootSessionId: 'root-session', reason: 'owner_feedback', detail: { issueId,
      report: { taskId: 'T1', sourceId, issue: 'This feedback was resolved before activation.' } } } })
  h.send({ type: 'issue.close', workflowId: 'wf1', issueId,
    evidence: { ref: '/public-owner-resolution', sourceId, closeWhen } })
  const active = h.state.workflows.wf1.plan
  h.send({ type: 'plan.activate', workflowId: 'wf1', parentVersion: 1, plan: active,
    authorization: { scope: 'implementation', sourceId: 'closed-feedback-revision' },
    sources: { snapshotDigest: 'closed-feedback-R2' },
    review: { status: 'passed', planDigest: kernelDigest(active), evidenceRef: '/closed-feedback-review' } })
  assert.equal(h.actions('notify_main').filter(action => action.input.reason === 'plan_activated').length, 0)

  const opaque = { id: 'unproved-owner-feedback', sourceId: 'opaque-call', closeWhen: null, blocksActivation: false }
  h.send({ type: 'issue.register', workflowId: 'wf1', issue: opaque })
  h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'notify_main', key: opaque.id,
    input: { rootSessionId: 'root-session', reason: 'owner_feedback', detail: { issueId: opaque.id,
      report: { sourceId: opaque.sourceId, issue: 'This notice has no matching Owner execution.' } } } })
  h.send({ type: 'plan.activate', workflowId: 'wf1', parentVersion: 2, plan: active,
    authorization: { scope: 'implementation', sourceId: 'unproved-feedback-revision' },
    sources: { snapshotDigest: 'unproved-feedback-R3' },
    review: { status: 'passed', planDigest: kernelDigest(active), evidenceRef: '/unproved-feedback-review' } })
  assert.equal(h.actions('notify_main').filter(action => action.input.reason === 'plan_activated').length, 0)
})

test('a feedback notice without its bound execute action remains an ordinary blocking obligation', () => {
  const h = harness()
  const issue = { id: 'opaque-feedback', sourceId: 'opaque-call', closeWhen: null,
    status: 'open', used: 0, blocksActivation: true }
  h.send({ type: 'issue.register', workflowId: 'wf1', issue })
  h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'notify_main', key: issue.id,
    input: { rootSessionId: 'root-session', reason: 'owner_feedback', detail: { issueId: issue.id,
      report: { sourceId: issue.sourceId, issue: 'Unproved feedback must not weaken activation.' } } } })
  const context = planningIssueContext(h.state, h.state.workflows.wf1)
  assert.deepEqual(context.ownerFeedbackFacts, [])
  assert.deepEqual(context.openObligations, [h.state.workflows.wf1.issues[issue.id]])
})

function runnerResourceFeedbackHarness(report) {
  const planValue = normalizePlanV2({ contract: 'DSH_PLAN_V2', registryDigest: 'a'.repeat(64), summary: 'Runner resource feedback',
    owners: [owner('api')],
    verifications: [{ id: 'typecheck', run: ['npm', 'run', 'typecheck'] }],
    tasks: [{ ...task('T1'), verify: ['typecheck'] }],
  })
  const h = harness(undefined, { planValue })
  h.send({ type: 'drive' })
  const action = h.actions('execute_owner')[0]
  h.claim(action)
  h.send({ type: 'action.started', actionId: action.id, token: 'claim', evidence: { handleId: 'owner', sessionId: 'owner' } })
  const attempt = h.state.workflows.wf1.attempts[action.attemptId]
  const sourceId = report.sourceId ?? 'feedback-call'
  const issueId = `issue-${kernelDigest([attempt.id, sourceId]).slice(0, 40)}`
  const closeWhen = report.kind === 'runner_resource_observation'
    ? { kind: 'runner_resource_available', verificationId: report.verificationId, observedExitCode: report.observedExitCode }
    : undefined
  h.send({ type: 'issue.register', workflowId: 'wf1', issue: { id: issueId, sourceId, closeWhen, blocksActivation: false } })
  h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'notify_main', key: issueId,
    input: { rootSessionId: 'root-session', reason: 'owner_feedback', detail: { issueId, report } } })
  h.send({ type: 'owner.submit', workflowId: 'wf1', attemptId: attempt.id, authority: attempt.authority,
    report: { status: 'completed', summary: 'Candidate' }, manifestDigest: 'manifest', artifact: '/submission' })
  h.send({ type: 'action.result', actionId: action.id, token: 'claim',
    result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  h.complete(h.actions('seal_candidate')[0], { artifact: '/candidate', commitSha: 'candidate', authority: attempt.authority })
  return { h, attempt, issueId, verify: h.actions('verify_candidate')[0] }
}

function failedTypecheck(h, verify, { exitCode = 2, kind } = {}) {
  h.complete(verify, { passed: false, commitSha: 'candidate', executionSettled: true,
    results: [{ verificationId: 'typecheck', argv: ['npm', 'run', 'typecheck'], cwd: '.', commitSha: 'candidate',
      passed: false, exitCode, enforcement: 'full', ...(kind ? { kind } : {}),
      commandTermination: { managedRangeStopped: true, terminationScope: 'dsh-managed-range', terminationId: 'typecheck-exit' } }] })
}

test('runner exit 1 or 2 closes only the resource observation while failed typecheck recovery stays open', () => {
  for (const exitCode of [1, 2]) {
    const report = { kind: 'runner_resource_observation', sourceId: 'typecheck-resource', issue: 'typecheck-unavailable',
      detail: 'The Owner worktree has no installed compiler.', verificationId: 'typecheck', observedExitCode: 127 }
    const { h, issueId, verify } = runnerResourceFeedbackHarness(report)
    failedTypecheck(h, verify, { exitCode })
    const workflow = h.state.workflows.wf1
    assert.equal(workflow.issues[issueId].status, 'closed')
    assert.deepEqual({ ...workflow.issues[issueId].evidence, resolvedAt: 0 }, {
      kind: 'runner_resource_available', resolvedAt: 0, actionId: verify.id, attemptId: verify.attemptId,
      verificationId: 'typecheck', commitSha: 'candidate', exitCode,
      commandTermination: { managedRangeStopped: true, terminationScope: 'dsh-managed-range', terminationId: 'typecheck-exit' },
    })
    const execution = Object.values(workflow.issues).find(issue => issue.origin === 'execution')
    assert.equal(execution.status, 'open', 'a runnable compiler does not prove the candidate typecheck passed')
  }
})

test('missing runner resources and sandbox failure do not close feedback', () => {
  for (const options of [
    { exitCode: 126 },
    { exitCode: 127 },
    { exitCode: 128 },
    { exitCode: 2, kind: 'sandbox_unavailable' },
  ]) {
    const report = { kind: 'runner_resource_observation', issue: 'typecheck-unavailable', detail: 'Owner-local compiler unavailable.',
      verificationId: 'typecheck', observedExitCode: 127 }
    const { h, issueId, verify } = runnerResourceFeedbackHarness(report)
    failedTypecheck(h, verify, options)
    assert.equal(h.state.workflows.wf1.issues[issueId].status, 'open')
  }
})

test('restart drive narrowly migrates the exact legacy typecheck observation from settled evidence', () => {
  const report = { issue: 'typecheck-unavailable', detail: 'Legacy Owner observed exit 127.' }
  const { h, issueId, verify } = runnerResourceFeedbackHarness(report)
  failedTypecheck(h, verify)
  const issue = h.state.workflows.wf1.issues[issueId]
  assert.equal(issue.status, 'closed')
  issue.status = 'open'; delete issue.evidence
  h.send({ type: 'drive' })
  const migrated = h.state.workflows.wf1.issues[issueId]
  assert.equal(migrated.status, 'closed')
  assert.equal(migrated.evidence.migration, 'legacy_typecheck_unavailable_v1')

  const unknown = runnerResourceFeedbackHarness({ issue: 'lint-unavailable', detail: 'Unknown legacy shape.' })
  failedTypecheck(unknown.h, unknown.verify)
  assert.equal(unknown.h.state.workflows.wf1.issues[unknown.issueId].status, 'open')

  const liveUnknown = runnerResourceFeedbackHarness({ taskId: 'T1', kind: 'verification_environment',
    detail: 'Owner-local npm typecheck returned exit 127.' })
  failedTypecheck(liveUnknown.h, liveUnknown.verify)
  assert.equal(liveUnknown.h.state.workflows.wf1.issues[liveUnknown.issueId].status, 'closed')
  assert.equal(liveUnknown.h.state.workflows.wf1.issues[liveUnknown.issueId].evidence.migration,
    'legacy_verification_environment_v1')

  const blockedUnknown = runnerResourceFeedbackHarness({ taskId: 'T1', issueType: 'verification_blocked',
    detail: 'Owner-local npm typecheck returned exit 127.' })
  failedTypecheck(blockedUnknown.h, blockedUnknown.verify)
  assert.equal(blockedUnknown.h.state.workflows.wf1.issues[blockedUnknown.issueId].status, 'closed')
  assert.equal(blockedUnknown.h.state.workflows.wf1.issues[blockedUnknown.issueId].evidence.migration,
    'legacy_verification_blocked_v1')

  const wrongTask = runnerResourceFeedbackHarness({ taskId: 'other-task', kind: 'verification_environment',
    detail: 'Owner-local npm typecheck returned exit 127.' })
  failedTypecheck(wrongTask.h, wrongTask.verify)
  assert.equal(wrongTask.h.state.workflows.wf1.issues[wrongTask.issueId].status, 'open')
})

test('composite children wait for parent inputs and carry real upstream integration evidence', () => {
  const tasks = [task('Prepare', 'api'), { ...task('Group', 'api', ['Prepare']), children: ['Child'], entry: ['Child'], exit: ['Child'] },
    { ...task('Child', 'web'), parentTaskId: 'Group' }, task('Consumer', 'consumer', ['Group'])]
  const h = harness(tasks)
  h.send({ type: 'drive' })
  assert.deepEqual(h.actions('execute_owner').map(action => action.input.task.id), ['Prepare'])
  const before = h.state.workflows.wf1.tasks.Child.definitionDigest
  const attempt = verified(h)
  h.complete(h.actions('integrate_candidate')[0], { commitSha: 'prepare-commit', worklogRef: '/prepare-log', baseCommit: 'base', candidateCommit: 'content', verified: true })
  h.send({ type: 'drive' })
  const child = h.actions('execute_owner').find(action => action.input.task.id === 'Child')
  assert.equal(child.input.inputs.Prepare.commitSha, 'prepare-commit')
  assert.equal(h.actions('execute_owner').some(action => action.input.task.id === 'Consumer'), false)
  verified(h, 'Child')
  h.complete(h.actions('integrate_candidate').find(action => action.attemptId === child.attemptId), { commitSha: 'child-commit', worklogRef: '/child-log', baseCommit: 'prepare-commit', candidateCommit: 'content', verified: true })
  h.send({ type: 'drive' })
  const consumer = h.actions('execute_owner').find(action => action.input.task.id === 'Consumer')
  assert.equal(consumer.input.inputs.Group.outputs.Child.commitSha, 'child-commit')
  const revised = plan([task('Prepare', 'api'), { ...task('Group', 'api'), children: ['Child'], entry: ['Child'], exit: ['Child'] },
    { ...task('Child', 'web'), parentTaskId: 'Group' }, task('Consumer', 'consumer', ['Group'])])
  const clean = harness(revised.tasks)
  assert.notEqual(clean.state.workflows.wf1.tasks.Child.definitionDigest, before)
  assert.equal(h.state.workflows.wf1.attempts[attempt.id].phase, 'succeeded')
})

test('a ready sibling behind a quarantined Owner is a visible technical failure, not endless running', () => {
  const h = harness([task('T1'), task('T2')], { policy: { terminationWindowMs: 10 } })
  h.send({ type: 'drive' })
  const action = h.actions('execute_owner')[0]; h.claim(action)
  h.send({ type: 'attempt.stop', workflowId: 'wf1', attemptId: action.attemptId, reason: 'unconfirmed writer' })
  h.time += 11; h.send({ type: 'drive' })
  const result = view(h.state, 'wf1')
  assert.equal(result.status, 'failed')
  assert.equal(result.tasks.find(task => task.taskId === 'T2').waiting.reason, 'quarantined_resource')
  assert.equal(result.tasks.find(task => task.taskId === 'T2').waiting.resumeCondition, 'writers_stopped_evidence')
})

test('equivalent local port spellings contend across projects while project resources remain independent', () => {
  const h = harness([task('T1', 'api', [], ['tcp:localhost:05432', 'build-cache:local'])])
  h.send({ type: 'workflow.create', id: 'wf2', root: '/other-project', rootSessionId: 'other-root', request: 'other', baseCommit: 'base' })
  h.activate('wf2', plan([task('T2', 'web', [], ['host:port:5432'])]))
  h.send({ type: 'drive' })
  assert.equal(h.actions('execute_owner').length, 1)
  assert.ok(Object.values(h.state.workflows.wf1.attempts)[0].locks.includes('host:port:5432'))
  assert.equal(h.state.workflows.wf2.tasks.T2.attemptId, null)
})

test('plan replacement fences affected attempts and preserves unrelated work until safe activation', () => {
  const h = harness([task('T1', 'api'), task('T2', 'web')])
  h.send({ type: 'drive' })
  const first = h.actions('execute_owner').find(action => action.input.task.id === 'T1')
  const second = h.actions('execute_owner').find(action => action.input.task.id === 'T2')
  h.claim(first); h.claim(second)
  const revised = plan([{ ...task('T1', 'api'), title: 'Correct the API contract' }, task('T2', 'web')])
  h.send({ type: 'plan.propose', workflowId: 'wf1', parentVersion: 1, plan: revised,
    authorization: { scope: 'implementation', sourceId: 'user-message' }, sources: { snapshotDigest: 'snapshot-2' },
    review: { status: 'passed', planDigest: kernelDigest(revised), evidenceRef: 'review-2.json' } })
  let workflow = h.state.workflows.wf1
  assert.equal(workflow.planVersion, 1)
  assert.equal(workflow.attempts[first.attemptId].phase, 'stopping')
  assert.equal(h.state.actions[second.id].status, 'running')
  assert.throws(() => h.send({ type: 'action.result', actionId: first.id, token: 'claim', result: {} }), /Stopped action/)
  h.send({ type: 'drive' }); assert.equal(h.actions('execute_owner').length, 2)
  const stop = h.actions('stop_execution')[0]
  h.complete(stop, { executionSettled: true, sourceWritesClosed: true, authority: workflow.attempts[first.attemptId].authority, terminationId: 'actual-stop-fixture' })
  h.send({ type: 'drive' }); workflow = h.state.workflows.wf1
  assert.equal(workflow.planVersion, 2)
  assert.equal(workflow.tasks.T2.attemptId, second.attemptId)
  assert.notEqual(workflow.tasks.T1.attemptId, first.attemptId)
  assert.equal(workflow.retiredTasks[0].attemptId, first.attemptId)
})

test('source replacement supersedes a pending product question and rejects a late answer', () => {
  const h = harness()
  h.send({ type: 'decision.request', workflowId: 'wf1', id: 'product', kind: 'product', request: { question: 'Change scope?' }, binding: { planVersion: 1 } })
  const decision = h.state.workflows.wf1.decisions.product
  h.activate('wf1', plan(), 1)
  assert.equal(h.state.workflows.wf1.decisions.product.status, 'superseded')
  assert.equal(view(h.state, 'wf1').actionRequired, false)
  assert.throws(() => h.send({ type: 'decision.answer', workflowId: 'wf1', id: 'product', rootSessionId: 'root-session',
    requestDigest: decision.requestDigest, answer: { value: 'yes' }, evidenceRef: 'native-answer' }), /expired/)
})

test('known checkout obstruction ends delivery explicitly and preserves integrated candidate', () => {
  const h = harness(); verified(h)
  h.complete(h.actions('integrate_candidate')[0], { commitSha: 'commit', worklogRef: 'log', candidateCommit: 'content', verified: true, baseCommit: 'base' })
  h.send({ type: 'drive' })
  h.complete(h.actions('verify_workflow')[0], { passed: true, commitSha: 'commit', planVersion: 1 })
  h.complete(h.actions('deliver_workflow')[0], { blocked: true, executionSettled: true, sourceWritesClosed: true, reason: 'user_checkout_dirty', evidenceRef: 'checkout-snapshot' })
  assert.equal(view(h.state, 'wf1').status, 'failed')
  assert.equal(view(h.state, 'wf1').counts.completedTasks, 1)
  assert.equal(h.state.workflows.wf1.integrationHead, 'commit')
  for (let n = 0; n < 10; n++) h.send({ type: 'drive' })
  assert.equal(h.actions('deliver_workflow').length, 1)
})

test('KAC-02: unchanged drive is referentially stable and does not manufacture progress', () => {
  const h = harness(); h.send({ type: 'drive' })
  const state = h.state
  for (let i = 0; i < 100; i++) h.send({ type: 'drive' })
  assert.equal(h.state, state)
  assert.equal(h.actions().length, 1)
})

test('KAC-03: same owner and host resource are serialized across workflows', () => {
  const h = harness([task('T1', 'api', [], ['host:port:3000']), task('T2', 'web', [], ['host:port:3000']), task('T3', 'worker')])
  h.create('wf2'); h.activate('wf2', plan([task('Other', 'api')]))
  h.send({ type: 'drive' })
  assert.deepEqual(h.actions('execute_owner').map(action => action.input.task.id), ['T1', 'T3'])
  const action = h.actions()[0]; h.claim(action)
  assert.throws(() => h.claim(action), /not executable/)
})

test('KAC-06: submit acknowledges a durable candidate without claiming verification or delivery', () => {
  const h = harness(); const { event, attempt } = submit(h)
  const receipt = h.send(event)
  assert.equal(receipt.status, 'accepted')
  assert.equal(h.state.workflows.wf1.attempts[attempt.id].writeFrozen, true)
  assert.equal(view(h.state, 'wf1').counts.completedTasks, 0)
  assert.throws(() => h.send({ ...event, manifestDigest: 'different' }), /Conflicting duplicate/)
})

test('KAC-10: a model turn ending without writer termination cannot start sealing', () => {
  const h = harness(); const { action } = submit(h)
  assert.throws(() => h.send({ type: 'action.result', actionId: action.id, token: 'claim', result: { turnEnded: true } }), /source write closure/)
  assert.equal(h.actions('seal_candidate').length, 0)
})

test('managed process settlement and obsolete writersStopped cannot replace Owner source closure', () => {
  const h = harness(); const { action, attempt } = submit(h)
  for (const result of [
    { authority: attempt.authority, writersStopped: true },
    { authority: attempt.authority, executionSettled: true, managedRangeStopped: true, terminationScope: 'dsh-managed-range' },
    { authority: attempt.authority, sourceWritesClosed: true },
  ]) {
    assert.throws(() => h.send({ type: 'action.result', actionId: action.id, token: 'claim', result }), /source write closure/)
    assert.equal(h.actions('seal_candidate').length, 0)
  }
  h.send({ type: 'action.result', actionId: action.id, token: 'claim',
    result: { authority: attempt.authority, executionSettled: true, sourceWritesClosed: true } })
  assert.equal(h.actions('seal_candidate').length, 1)
})

test('managed range termination alone cannot release a stopped Owner for redispatch', () => {
  const h = harness(); const { attempt } = submit(h)
  h.send({ type: 'attempt.stop', workflowId: 'wf1', attemptId: attempt.id, reason: 'fixture cancel' })
  const stop = h.actions('stop_execution')[0]; h.claim(stop)
  assert.throws(() => h.send({ type: 'action.result', actionId: stop.id, token: 'claim',
    result: { authority: attempt.authority, executionSettled: true, managedRangeStopped: true,
      terminationScope: 'dsh-managed-range', terminationId: 'range-only' } }), /source write closure/)
  assert.equal(h.state.workflows.wf1.attempts[attempt.id].phase, 'stopping')
  h.send({ type: 'drive' })
  assert.equal(h.actions('execute_owner').length, 1)
})

test('pre-split kernel control records are rejected without silently upgrading evidence', () => {
  const previous = createControlState({ catalogId: '/catalog' })
  previous.contract = 'DSH_OWNER_WORKFLOW_KERNEL_V1'
  assert.throws(() => transition(previous, { type: 'drive' }), /Unsupported or corrupt control state/)
})

test('KAC-08/09: verification and integration bind content and expected base', () => {
  const h = harness(); verified(h)
  const action = h.actions('integrate_candidate')[0]
  h.claim(action)
  const result = { commitSha: 'commit', worklogRef: 'log', candidateCommit: 'content', verified: true, baseCommit: 'wrong' }
  assert.throws(() => h.send({ type: 'action.result', actionId: action.id, token: 'claim', result }), /base moved/)
  result.baseCommit = 'base'
  h.send({ type: 'action.result', actionId: action.id, token: 'claim', result })
  assert.equal(view(h.state, 'wf1').counts.completedTasks, 1)
  const revision = h.state.revision
  h.send({ type: 'action.result', actionId: action.id, token: 'claim', result })
  assert.equal(h.state.revision, revision)
  assert.notEqual(view(h.state, 'wf1').status, 'completed')
  h.send({ type: 'drive' })
  h.complete(h.actions('verify_workflow')[0], { passed: true, commitSha: 'commit', planVersion: 1 })
  assert.notEqual(view(h.state, 'wf1').status, 'completed')
  h.complete(h.actions('deliver_workflow')[0], { commitSha: 'commit', planVersion: 1, userCheckoutUpdated: true, evidenceRef: '/delivery' })
  assert.equal(view(h.state, 'wf1').status, 'completed')
  const completed = h.actions('notify_main').filter(action => action.input.reason === 'workflow_terminal')
  assert.equal(completed.length, 1)
  assert.equal(completed[0].input.detail.status, 'completed')
  assert.equal(completed[0].input.detail.workflowId, 'wf1')
  assert.equal(completed[0].input.detail.revision, h.state.workflows.wf1.revision)
  assert.deepEqual(completed[0].input.detail.outcome, {
    kind: 'delivery',
    result: { passed: true, commitSha: 'commit', planVersion: 1, userCheckoutUpdated: true, evidenceRef: '/delivery' },
  })
})

test('KAC-01/11: deadline produces stop action, unknown termination stays quarantined and observable', () => {
  const h = harness(undefined, { policy: { deadlineMs: 100, terminationWindowMs: 30 } })
  h.send({ type: 'drive' })
  const action = h.actions()[0]; h.claim(action)
  h.time = h.state.workflows.wf1.attempts[action.attemptId].deadlineAt + 1; h.send({ type: 'drive' })
  assert.equal(h.actions('stop_execution').length, 1)
  h.time += 31; h.send({ type: 'drive' })
  const current = view(h.state, 'wf1')
  assert.equal(current.tasks[0].failure, 'termination_unconfirmed')
  assert.equal(current.status, 'failed')
  assert.ok(dueActions(h.state, h.time).length > 0)
  h.create('wf2'); h.activate('wf2', plan())
  h.send({ type: 'drive' })
  assert.equal(h.actions('execute_owner').length, 1)
})

test('KAC-11: later real termination releases quarantine and permits an explicit task repair', () => {
  const h = harness(undefined, { policy: { deadlineMs: 100, terminationWindowMs: 30 } })
  h.send({ type: 'drive' }); h.time = Object.values(h.state.workflows.wf1.attempts)[0].deadlineAt + 1; h.send({ type: 'drive' }); h.time += 31; h.send({ type: 'drive' })
  const stop = h.actions('stop_execution')[0]
  const attempt = h.state.workflows.wf1.attempts[stop.attemptId]
  h.complete(stop, { executionSettled: true, sourceWritesClosed: true, terminationId: 'terminated', authority: attempt.authority })
  assert.equal(h.state.workflows.wf1.attempts[attempt.id].quarantined, false)
  assert.equal(view(h.state, 'wf1').tasks[0].phase, 'failed')
  h.send({ type: 'task.retry', workflowId: 'wf1', taskId: 'T1', issueId: attempt.issueId,
    instructions: 'Retry after the scoped stop closed every source writer', decisionRef: 'root:confirmed-stop-repair' })
  h.send({ type: 'drive' })
  const current = h.state.workflows.wf1
  assert.notEqual(current.tasks.T1.attemptId, attempt.id)
  assert.equal(current.attempts[current.tasks.T1.attemptId].generation, attempt.generation + 1)
})

test('a late non-attempt stop receipt notifies the root after the quarantined failure notice was delivered', () => {
  const h = harness(undefined, { policy: { terminationWindowMs: 30 } })
  h.create('wf2')
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf2', kind: 'plan', key: 'planner', input: {
    parentVersion: 0, snapshotDigest: 'snapshot', registryDigest: 'a'.repeat(64),
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  const action = h.state.actions[id]; h.claim(action)
  h.send({ type: 'action.failed', actionId: id, token: 'claim', reason: 'Role finished without a structured report' })
  h.time += 30_000
  h.send({ type: 'action.claim', actionId: id, token: 'observe', hostId: 'host', mode: 'observe' })
  h.send({ type: 'action.observe', actionId: id, token: 'observe', fact: 'unknown' })
  const stop = h.actions('stop_execution').find(item => item.input.targetActionId === id)
  h.claim(stop)
  h.time = h.state.actions[id].stopDeadlineAt + 1; h.send({ type: 'drive' })
  assert.equal(h.state.actions[id].status, 'failed'); assert.equal(h.state.actions[id].quarantined, true)
  const oldNotice = h.actions('notify_main').find(item => item.input.reason === 'workflow_terminal' && item.input.detail.workflowId === 'wf2')
  h.complete(oldNotice, { rootSessionId: 'root-session', messageId: oldNotice.id, persisted: true })
  const result = { targetActionId: id, executionSettled: true, terminationId: 'late-planner-stop' }
  h.send({ type: 'action.result', actionId: stop.id, token: 'claim', result })
  assert.equal(h.state.actions[id].quarantined, false)
  const settled = h.actions('notify_main').filter(item => item.input.reason === 'execution_settled'
    && item.input.detail.actionId === id)
  assert.equal(settled.length, 1)
  assert.equal(settled[0].input.detail.terminationId, result.terminationId)
  h.send({ type: 'action.result', actionId: stop.id, token: 'claim', result })
  assert.equal(h.actions('notify_main').filter(item => item.input.reason === 'execution_settled'
    && item.input.detail.actionId === id).length, 1)
})

test('KAC-12: notification completion requires correct root and persistent message identity', () => {
  const h = harness()
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'notify_main', input: { reason: 'test' }, key: 'notice' })
  h.claim(h.state.actions[id])
  assert.throws(() => h.send({ type: 'action.result', actionId: id, token: 'claim', result: { delivered: true } }), /durable receipt/)
  h.send({ type: 'action.result', actionId: id, token: 'claim', result: { rootSessionId: 'root-session', messageId: id, persisted: true } })
  assert.equal(h.state.actions[id].status, 'succeeded')
})

test('KAC-13: genuine user wait suspends active deadline; stale root cannot answer', () => {
  const h = harness(); const { attempt } = submit(h)
  h.send({ type: 'decision.request', workflowId: 'wf1', id: 'approval', kind: 'permission', request: 'Run fixed verifier',
    binding: { attemptId: attempt.id, authority: attempt.authority } })
  h.time += 2_000_000; h.send({ type: 'drive' })
  assert.equal(h.actions('stop_execution').length, 0)
  const decision = h.state.workflows.wf1.decisions.approval
  const answer = { type: 'decision.answer', workflowId: 'wf1', id: 'approval', requestDigest: decision.requestDigest,
    rootSessionId: 'wrong', answer: { allowed: true }, evidenceRef: 'native-answer' }
  assert.throws(() => h.send(answer), /wrong root/)
  h.send({ ...answer, rootSessionId: 'root-session' })
  assert.equal(h.state.workflows.wf1.attempts[attempt.id].deadlineAt, attempt.deadlineAt + 2_000_000)
})

test('KAC-15: open obligations prevent activation; same label does not replace closure evidence', () => {
  const h = harness()
  h.send({ type: 'issue.register', workflowId: 'wf1', issue: { id: 'issue1', sourceId: 'source', closeWhen: { kind: 'test' }, blocksActivation: true } })
  assert.throws(() => h.activate('wf1', plan(), 1), /Open obligations/)
  assert.throws(() => h.send({ type: 'issue.close', workflowId: 'wf1', issueId: 'issue1', evidence: { ref: 'test', sourceId: 'other', closeWhen: { kind: 'test' } } }), /does not match/)
  h.send({ type: 'issue.close', workflowId: 'wf1', issueId: 'issue1', evidence: { ref: 'test', sourceId: 'source', closeWhen: { kind: 'test' } } })
  h.activate('wf1', plan(), 1)
  assert.equal(h.state.workflows.wf1.planVersion, 2)
})





test('upstream semantic changes invalidate completed or pending consumer inputs', () => {
  const h = harness([task('T1'), task('T2', 'web', ['T1'])])
  const before = h.state.workflows.wf1.tasks.T2.definitionDigest
  const changed = plan([task('T1'), task('T2', 'web', ['T1'])])
  changed.tasks[0].done = ['New required contract']
  h.activate('wf1', changed, 1)
  assert.notEqual(h.state.workflows.wf1.tasks.T2.definitionDigest, before)
})

test('workflow capacity is local while catalog capacity remains global', () => {
  const h = harness([task('T1')], { parallel: 3, policy: { parallel: 1 } })
  h.create('wf2'); h.activate('wf2', plan([task('T2', 'web')]))
  h.send({ type: 'drive' })
  assert.equal(h.actions('execute_owner').length, 2)
})



test('bound verification failure becomes a visible failure instead of a hanging action', () => {
  const h = harness(); const { action, attempt } = submit(h)
  h.send({ type: 'action.result', actionId: action.id, token: 'claim', result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  h.complete(h.actions('seal_candidate')[0], { artifact: '/candidate', commitSha: 'content', authority: attempt.authority })
  h.complete(h.actions('verify_candidate')[0], { passed: false, commitSha: 'content', results: [{ verificationId: 'unit', passed: false }], executionSettled: true })
  assert.equal(view(h.state, 'wf1').status, 'failed')
  assert.equal(h.actions('integrate_candidate').length, 0)
  assert.equal(h.actions('verify_candidate')[0].status, 'failed')
  assert.equal(h.actions('notify_main')[0].input.reason, 'verification_failed')
  const terminal = h.actions('notify_main').filter(action => action.input.reason === 'workflow_terminal')
  assert.equal(terminal.length, 1)
  assert.equal(terminal[0].input.detail.status, 'failed')
  assert.equal(terminal[0].input.detail.workflowId, 'wf1')
  assert.equal(terminal[0].input.detail.revision, h.state.workflows.wf1.revision)
  assert.deepEqual(terminal[0].input.detail.failure, {
    attentionId: `task:${terminal[0].input.detail.attention[0].taskId}`,
    reason: 'task_failed',
    detail: 'verification_failed',
    diagnostic: view(h.state, 'wf1').attention[0].diagnostic,
  })
  assert.equal(terminal[0].input.detail.attention[0].detail, 'verification_failed')
  assert.equal(terminal[0].input.detail.recovery.issues[0].lastReason, 'verification_failed')
})

test('a nonterminal verification notification carries the same safe summary instead of raw command results', () => {
  const h = harness([task('T1', 'api'), task('T2', 'web')])
  const { action, attempt } = submit(h, 'T1')
  h.send({ type: 'action.result', actionId: action.id, token: 'claim',
    result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  h.complete(h.actions('seal_candidate').find(item => item.attemptId === attempt.id),
    { artifact: '/candidate', commitSha: 'content', authority: attempt.authority })
  h.complete(h.actions('verify_candidate').find(item => item.attemptId === attempt.id), {
    passed: false, commitSha: 'content', executionSettled: true,
    results: [{ verificationId: 'unit', passed: false, exitCode: 1, enforcement: 'full',
      stderr: 'Failure at /private/project api_key=notify-secret' }],
    review: { passed: false, commitSha: 'content', reasons: ['Global fetch is not intercepted.'] },
  })
  const notice = h.actions('notify_main').find(item => item.input.reason === 'verification_failed')
  assert.ok(notice)
  assert.equal(notice.status, 'pending')
  assert.equal(notice.input.detail.results, undefined)
  assert.deepEqual(notice.input.detail.diagnostic, view(h.state, 'wf1').attention.find(item => item.taskId === 'T1').diagnostic)
  assert.doesNotMatch(JSON.stringify(notice.input.detail), /notify-secret|\/private\/project/)
})

test('a settled verification execution failure retries the same candidate verification without redispatching its Owner', () => {
  const h = harness(); const { action, attempt } = submit(h)
  h.send({ type: 'action.result', actionId: action.id, token: 'claim', result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  h.complete(h.actions('seal_candidate')[0], { artifact: '/candidate', commitSha: 'content', authority: attempt.authority })
  const failed = h.actions('verify_candidate')[0]
  h.complete(failed, { passed: false, commitSha: 'content', executionSettled: true,
    results: [{ verificationId: 'unit', status: 'execution_error', passed: false, commitSha: 'content',
      commandTermination: { managedRangeStopped: true } }] })

  const issueId = h.state.workflows.wf1.attempts[attempt.id].issueId
  assert.throws(() => h.send({ type: 'task.retry', workflowId: 'wf1', taskId: 'T1', issueId,
    instructions: 'Repair the verification environment', decisionRef: 'root:wrong-owner-repair' }), /candidate verification/)

  const retry = h.send({ type: 'action.retry', workflowId: 'wf1', actionId: failed.id,
    reason: 'Verification environment is available again', decisionRef: 'root:retry-verification' })
  const retried = h.state.actions[retry]
  assert.equal(retried.kind, 'verify_candidate')
  assert.equal(retried.attemptId, attempt.id)
  assert.deepEqual(retried.input.candidate, failed.input.candidate)
  assert.equal(h.state.workflows.wf1.attempts[attempt.id].phase, 'verifying')
  assert.equal(h.actions('execute_owner').length, 1)
  assert.equal(h.state.actions[failed.id].status, 'failed')
  assert.ok(h.state.actions[failed.id].result, 'the failed verification evidence remains durable')

  h.complete(retried, { passed: true, commitSha: 'content', review: { passed: true, commitSha: 'content' },
    results: [{ verificationId: 'unit', passed: true, exitCode: 0, commitSha: 'content' }] })
  assert.equal(h.actions('integrate_candidate').length, 1)
  h.complete(h.actions('integrate_candidate')[0], { commitSha: 'integrated', worklogRef: '/worklog', baseCommit: 'base', candidateCommit: 'content', verified: true })
  assert.equal(h.state.workflows.wf1.issues[issueId].status, 'closed')
})

test('an expired settled candidate verification routes to one task repair without consuming a doomed action retry', () => {
  const h = harness(); const { action, attempt } = submit(h)
  h.send({ type: 'action.result', actionId: action.id, token: 'claim',
    result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  h.complete(h.actions('seal_candidate')[0], { artifact: '/candidate', commitSha: 'content', authority: attempt.authority })
  const failed = h.actions('verify_candidate')[0]
  h.complete(failed, { passed: false, commitSha: 'content', executionSettled: true,
    results: [{ verificationId: 'unit', status: 'execution_error', passed: false, commitSha: 'content',
      commandTermination: { managedRangeStopped: true } }] })

  const workflow = h.state.workflows.wf1
  const issueId = workflow.attempts[attempt.id].issueId
  h.time = attempt.deadlineAt
  const before = structuredClone(h.state)
  assert.throws(() => h.send({ type: 'action.retry', workflowId: 'wf1', actionId: failed.id,
    reason: 'The dependency resource is available', decisionRef: 'root:expired-action-retry' }),
  /attempt deadline expired.*workflow_retry_task/i)
  assert.deepEqual(h.state, before)
  assert.equal(workflow.recoveryUsed, 0)
  assert.equal(workflow.issues[issueId].used, 0)
  assert.equal(h.actions('verify_candidate').length, 1)

  const result = h.send({ type: 'task.retry', workflowId: 'wf1', taskId: 'T1', issueId,
    instructions: 'Retry the preserved candidate in a fresh task attempt', decisionRef: 'root:expired-task-retry' })
  assert.deepEqual(result, { repairRequested: true, fromAttemptId: attempt.id })
  let current = h.state.workflows.wf1
  assert.equal(current.recoveryUsed, 1)
  assert.equal(current.issues[issueId].used, 1)
  assert.deepEqual(current.tasks.T1.repair.candidate, before.workflows.wf1.attempts[attempt.id].candidate)
  assert.deepEqual(current.tasks.T1.repair.verification, before.workflows.wf1.attempts[attempt.id].verification)
  h.send({ type: 'drive' })
  current = h.state.workflows.wf1
  const next = current.attempts[current.tasks.T1.attemptId]
  assert.equal(next.generation, attempt.generation + 1)
  assert.ok(next.deadlineAt > attempt.deadlineAt)
  assert.equal(h.actions('execute_owner').length, 2)
})

function expiredCandidateActionRepair(h, key) {
  const { action, attempt } = submit(h)
  h.send({ type: 'action.result', actionId: action.id, token: 'claim',
    result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  h.complete(h.actions('seal_candidate')[0], { artifact: '/candidate-old', commitSha: 'old-content', authority: attempt.authority })
  const first = h.actions('verify_candidate')[0]
  const technicalFailure = { passed: false, commitSha: 'old-content', executionSettled: true,
    results: [{ verificationId: 'unit', status: 'execution_error', passed: false, commitSha: 'old-content',
      commandTermination: { managedRangeStopped: true } }] }
  h.complete(first, technicalFailure)
  const retryId = h.send({ type: 'action.retry', workflowId: 'wf1', actionId: first.id,
    reason: 'Retry the settled verifier', decisionRef: `root:action-retry:${key}` })
  const retry = h.state.actions[retryId]
  h.complete(retry, technicalFailure)
  const actionIssueId = retry.retryIssueId
  const executionIssueId = h.state.workflows.wf1.attempts[attempt.id].issueId
  const failureEvidence = structuredClone(h.state.actions[retryId].result)
  const recoveryUsed = h.state.workflows.wf1.recoveryUsed
  h.time = attempt.deadlineAt
  h.send({ type: 'task.retry', workflowId: 'wf1', taskId: 'T1', issueId: executionIssueId,
    instructions: 'Use the preserved candidate in a fresh bounded attempt', decisionRef: `root:task-retry:${key}` })
  return { attempt, actionIssueId, executionIssueId, failureEvidence, recoveryUsed, retryId }
}

function passFreshAttempt(h, { commitSha = 'fresh-content', integrate = true } = {}) {
  h.send({ type: 'drive' })
  const workflow = h.state.workflows.wf1
  const fresh = workflow.attempts[workflow.tasks.T1.attemptId]
  const ownerAction = h.actions('execute_owner').find(item => item.attemptId === fresh.id)
  h.claim(ownerAction)
  h.send({ type: 'action.started', actionId: ownerAction.id, token: 'claim', evidence: { handleId: 'fresh-handle', sessionId: 'fresh-owner' } })
  h.send({ type: 'owner.submit', workflowId: 'wf1', attemptId: fresh.id, authority: fresh.authority,
    report: { status: 'completed', summary: 'Recovered candidate' }, manifestDigest: 'fresh-manifest', artifact: '/fresh-submission' })
  h.send({ type: 'action.result', actionId: ownerAction.id, token: 'claim',
    result: { executionSettled: true, sourceWritesClosed: true, authority: fresh.authority } })
  h.complete(h.actions('seal_candidate').find(item => item.attemptId === fresh.id),
    { artifact: '/candidate-fresh', commitSha, authority: fresh.authority })
  h.complete(h.actions('verify_candidate').find(item => item.attemptId === fresh.id), {
    passed: true, commitSha, review: { passed: true, commitSha },
    results: [{ verificationId: 'unit', passed: true, exitCode: 0, commitSha }] })
  if (integrate) h.complete(h.actions('integrate_candidate').find(item => item.attemptId === fresh.id), {
    commitSha: 'fresh-commit', worklogRef: '/fresh-worklog', baseCommit: 'base',
    candidateCommit: commitSha, verified: true })
  return fresh
}

test('a successful fresh task attempt closes only the expired candidate action repair it superseded', () => {
  const h = harness()
  const repairedFrom = expiredCandidateActionRepair(h, 'successful')
  assert.deepEqual(h.state.workflows.wf1.issues[repairedFrom.executionIssueId].repairHistory.map(item => ({
    attemptId: item.attemptId, decisionRef: item.decisionRef,
  })), [{ attemptId: repairedFrom.attempt.id, decisionRef: 'root:task-retry:successful' }])
  const fresh = passFreshAttempt(h, { integrate: false })

  assert.equal(h.state.workflows.wf1.issues[repairedFrom.actionIssueId].status, 'open', 'verification alone is not integrated repair evidence')
  h.complete(h.actions('integrate_candidate').find(item => item.attemptId === fresh.id), {
    commitSha: 'fresh-commit', worklogRef: '/fresh-worklog', baseCommit: 'base',
    candidateCommit: 'fresh-content', verified: true })

  const repaired = h.state.workflows.wf1
  assert.equal(repaired.issues[repairedFrom.executionIssueId].status, 'closed')
  assert.equal(repaired.issues[repairedFrom.actionIssueId].status, 'closed')
  assert.deepEqual(h.state.actions[repairedFrom.retryId].result, repairedFrom.failureEvidence, 'the original action failure remains durable')
  assert.equal(repaired.recoveryUsed, repairedFrom.recoveryUsed + 1, 'closure does not refund or add recovery budget')
  assert.equal(repaired.issues[repairedFrom.actionIssueId].evidence.fromAttemptId, repairedFrom.attempt.id)
  assert.equal(repaired.issues[repairedFrom.actionIssueId].evidence.attemptId, fresh.id)
  assert.equal(repaired.issues[repairedFrom.actionIssueId].evidence.taskCommitSha, 'fresh-content')
  h.send({ type: 'drive' })
  h.complete(h.actions('verify_workflow')[0], { passed: true, commitSha: 'fresh-commit', planVersion: 1 })
  assert.equal(h.actions('deliver_workflow').length, 1)
})

test('a later plan can close a pre-upgrade action repair from its retained successful task-retry chain', () => {
  const h = harness()
  const repairedFrom = expiredCandidateActionRepair(h, 'historical-r5')
  const fresh = passFreshAttempt(h)
  const issue = h.state.workflows.wf1.issues[repairedFrom.actionIssueId]
  assert.equal(issue.status, 'closed')
  // Recreate the only missing pre-upgrade projection: all source actions,
  // attempts, repairHistory and verification/integration evidence already exist.
  issue.status = 'open'
  delete issue.evidence
  const revised = plan([{ ...task('T1'), done: ['A later planning revision changes the active definition'] }])
  h.activate('wf1', revised, 1)

  const recovered = h.state.workflows.wf1.issues[repairedFrom.actionIssueId]
  assert.equal(h.state.workflows.wf1.tasks.T1.attemptId, null)
  assert.notEqual(h.state.workflows.wf1.tasks.T1.definitionDigest, fresh.definitionDigest)
  assert.equal(recovered.status, 'closed')
  assert.equal(recovered.evidence.fromAttemptId, repairedFrom.attempt.id)
  assert.equal(recovered.evidence.attemptId, fresh.id)
  assert.deepEqual(recovered.evidence.repairDecisionRefs, ['root:task-retry:historical-r5'])
})

test('a task retry cannot close its old candidate action repair after the verification definition changes', () => {
  const h = harness()
  const repairedFrom = expiredCandidateActionRepair(h, 'changed-verification')
  const changed = plan()
  changed.verifications[0].run = ['node', '--test', 'different-suite']
  h.activate('wf1', changed, 1)
  passFreshAttempt(h)

  assert.equal(h.state.workflows.wf1.issues[repairedFrom.actionIssueId].status, 'open')
  assert.equal(h.state.workflows.wf1.issues[repairedFrom.actionIssueId].evidence, undefined)
  assert.deepEqual(h.state.actions[repairedFrom.retryId].result, repairedFrom.failureEvidence)
})

test('a candidate action retry admitted before the attempt deadline keeps that original deadline', () => {
  const h = harness(); const { action, attempt } = submit(h)
  h.send({ type: 'action.result', actionId: action.id, token: 'claim',
    result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  h.complete(h.actions('seal_candidate')[0], { artifact: '/candidate', commitSha: 'content', authority: attempt.authority })
  const failed = h.actions('verify_candidate')[0]
  h.complete(failed, { passed: false, commitSha: 'content', executionSettled: true,
    results: [{ verificationId: 'unit', status: 'execution_error', passed: false, commitSha: 'content',
      commandTermination: { managedRangeStopped: true } }] })
  h.time = attempt.deadlineAt - 1
  h.send({ type: 'action.retry', workflowId: 'wf1', actionId: failed.id,
    reason: 'The dependency resource is available', decisionRef: 'root:live-action-retry' })
  assert.equal(h.state.workflows.wf1.attempts[attempt.id].deadlineAt, attempt.deadlineAt)
})

test('an execution-identity-unconfirmed attempt cannot be converted into an Owner repair', () => {
  const h = harness(); const { action, attempt } = submit(h)
  h.send({ type: 'action.result', actionId: action.id, token: 'claim', result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  h.complete(h.actions('seal_candidate')[0], { artifact: '/candidate', commitSha: 'content', authority: attempt.authority })
  const verification = h.actions('verify_candidate')[0]
  h.claim(verification)
  h.send({ type: 'action.failed', actionId: verification.id, token: 'claim', reason: 'verification cleanup could not prove the writer stopped' })
  h.time += 30_000
  h.send({ type: 'action.claim', actionId: verification.id, mode: 'observe', token: 'observe', hostId: 'replacement' })
  h.send({ type: 'action.observe', actionId: verification.id, token: 'observe', fact: 'unknown' })
  const stop = h.actions('stop_execution').find(item => item.attemptId === attempt.id)
  h.complete(stop, { executionSettled: true, sourceWritesClosed: true, terminationId: 'confirmed-stop', authority: attempt.authority })

  assert.equal(h.state.workflows.wf1.attempts[attempt.id].failure, 'execution_identity_unconfirmed')
  const issueId = h.state.workflows.wf1.attempts[attempt.id].issueId
  assert.throws(() => h.send({ type: 'task.retry', workflowId: 'wf1', taskId: 'T1', issueId,
    instructions: 'Retry after an unconfirmed stop', decisionRef: 'root:unconfirmed-owner-repair' }), /Execution identity/)
  assert.equal(h.actions('execute_owner').length, 1)
})

test('deferred root-session action attention remains lossless JSON', () => {
  const h = harness()
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'consult_owner', key: 'offline', ownerId: 'api', input: { command: 'test' } })
  const action = h.state.actions[id]
  h.claim(action)
  h.send({ type: 'action.deferred', actionId: action.id, token: 'claim', notDispatched: true, reason: 'root_session_offline' })
  const projected = view(h.state, 'wf1')
  assert.equal(projected.attention.find(item => item.id === action.id).detail, null)
  assert.deepEqual(JSON.parse(JSON.stringify(projected)), projected)
})

test('an offline root preserves its notification and backs off without pretending delivery', () => {
  const h = harness()
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'notify_main', input: { reason: 'test' }, key: 'offline-notice' })
  h.claim(h.state.actions[id])
  h.send({ type: 'action.deferred', actionId: id, token: 'claim', notDispatched: true, reason: 'root_session_offline' })
  assert.equal(h.state.actions[id].status, 'pending')
  assert.equal(h.state.actions[id].nextWakeAt, h.time + 300_000)
  assert.equal(h.state.actions[id].waitingReason, 'root_session_offline')
  h.time = h.state.actions[id].nextWakeAt
  h.claim(h.state.actions[id])
  h.time += 5_000
  h.send({ type: 'action.claim', actionId: id, token: 'observe', hostId: 'host', mode: 'observe' })
  h.send({ type: 'action.observe', actionId: id, token: 'observe', fact: 'root_session_offline' })
  assert.equal(h.state.actions[id].status, 'running')
  assert.equal(h.state.actions[id].nextWakeAt, h.time + 300_000)
  assert.equal(h.state.actions[id].result, null)
})

test('planning, independent review and activation are one persisted action chain', () => {
  const h = harness(); h.create('wf2')
  const input = { snapshotDigest: 'frozen', registryDigest: 'a'.repeat(64), parentVersion: 0,
    sources: { snapshotDigest: 'frozen' }, authorization: { scope: 'implementation', sourceId: 'root-grant' } }
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf2', kind: 'plan', key: 'initial', input })
  const value = plan([task('Independent', 'web')])
  h.complete(h.state.actions[id], { plan: value, snapshotDigest: 'frozen', packagesRef: '/packages', evidenceRef: '/planner' })
  assert.equal(h.state.workflows.wf2.planVersion, 0)
  const review = h.actions('review_plan')[0]
  h.complete(review, { planDigest: kernelDigest(value), snapshotDigest: 'frozen', evidenceRef: '/review', review: { status: 'passed', issues: [] } })
  assert.equal(h.state.workflows.wf2.planVersion, 1)
  assert.equal(h.state.workflows.wf2.activation.sources.packagesRef, '/packages')
})

test('a rejected initial candidate remains the bounded authoring parent and is recoverable from settled history', () => {
  const h = harness(); h.create('wf2')
  const value = plan([task('Stable'), task('Repair', 'web')])
  const input = { parentVersion: 0, snapshotDigest: 'frozen', registryDigest: value.registryDigest,
    sources: { snapshotDigest: 'frozen' }, authorization: { scope: 'implementation', sourceId: 'root-grant' } }
  const plannerId = h.send({ type: 'action.enqueue', workflowId: 'wf2', kind: 'plan', key: 'initial-candidate', input })
  h.complete(h.state.actions[plannerId], { plan: value, snapshotDigest: 'frozen', packagesRef: '/packages', evidenceRef: '/planner' })
  const review = h.actions('review_plan').find(action => action.workflowId === 'wf2')
  h.complete(review, { planDigest: kernelDigest(value), snapshotDigest: 'frozen', evidenceRef: '/review', review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'Repair one task.', issues: [{
      obligationId: 'repair-one-task', sourceId: 'SPEC', sourceVersion: 'R1', targetTaskIds: ['Repair'],
      title: 'Repair one task', detail: 'Only Repair needs a revised executable contract.', suggestion: 'Preserve Stable.',
      closeWhen: { kind: 'plan_task_executable', taskId: 'Repair' },
    }],
  } })

  assert.equal(h.state.workflows.wf2.plan, null)
  const current = engine.planningAuthoringCandidate(h.state, h.state.workflows.wf2)
  assert.equal(current.actionId, review.id)
  assert.equal(current.planDigest, kernelDigest(value))
  assert.deepEqual(current.plan, value)

  delete h.state.workflows.wf2.planningCandidate
  const recovered = engine.planningAuthoringCandidate(h.state, h.state.workflows.wf2)
  assert.equal(recovered.actionId, review.id, 'legacy state recovers only its settled current-source review candidate')

  const revisionInput = { parentVersion: 0, snapshotDigest: 'frozen', registryDigest: value.registryDigest,
    previousPlan: recovered.plan, previousPlanDigest: recovered.planDigest, previousPlanActionId: recovered.actionId,
    revisionReason: 'Repair the one reviewed task.', revisionBoundary: { taskIds: ['Repair'], verificationIds: [] },
    sources: { snapshotDigest: 'frozen' }, authorization: { scope: 'implementation', sourceId: 'root-grant' } }
  const repairId = h.send({ type: 'planning.request', workflowId: 'wf2', input: revisionInput })
  const revised = structuredClone(value)
  revised.tasks.find(item => item.id === 'Repair').done = ['The repaired task is executable.']
  h.complete(h.state.actions[repairId], { plan: revised, snapshotDigest: 'frozen', packagesRef: '/packages-r2', evidenceRef: '/planner-r2' })
  const newerReview = h.actions('review_plan').at(-1)
  h.complete(newerReview, { planDigest: kernelDigest(revised), snapshotDigest: 'frozen', evidenceRef: '/review-r2', review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'The same bounded task still needs review.', issues: [{
      obligationId: 'repair-one-task', sourceId: 'SPEC', sourceVersion: 'R1', targetTaskIds: ['Repair'],
      title: 'Repair one task', detail: 'The current repair remains incomplete.', suggestion: 'Keep the repair within its task.',
      closeWhen: { kind: 'plan_task_executable', taskId: 'Repair' },
    }],
  } })
  assert.throws(() => h.send({ type: 'planning.request', workflowId: 'wf2', input: {
    ...revisionInput, revisionReason: 'Attempt to reuse the superseded candidate.',
  } }), /authoring parent changed/, 'an older same-source candidate cannot bypass a newer authoring head')

  h.state.workflows.wf2.planningSources = { snapshotDigest: 'newer-source' }
  assert.throws(() => engine.planningAuthoringCandidate(h.state, h.state.workflows.wf2), /does not bind its frozen review action/,
    'a persisted reference fails closed if its source head is changed without a bound replan')
  delete h.state.workflows.wf2.planningCandidate
  assert.equal(engine.planningAuthoringCandidate(h.state, h.state.workflows.wf2), null,
    'an older candidate cannot cross the current authoring source head')
})

test('an unactivated candidate enforces its revision boundary for full plan submissions', () => {
  const h = harness(); h.create('wf2')
  const previous = plan([task('Stable'), task('Repair', 'web')])
  h.state.workflows.wf2.planningSources = { snapshotDigest: 'frozen' }
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf2', kind: 'plan', key: 'bounded-initial-repair', input: {
    parentVersion: 0, snapshotDigest: 'frozen', registryDigest: previous.registryDigest,
    previousPlan: previous, previousPlanDigest: kernelDigest(previous),
    revisionBoundary: { taskIds: ['Repair'], verificationIds: [] },
    sources: { snapshotDigest: 'frozen' }, authorization: { scope: 'implementation', sourceId: 'root-grant' },
  } })
  const outside = structuredClone(previous)
  outside.tasks.find(task => task.id === 'Stable').done = ['Silently changed outside the repair boundary']
  assert.throws(() => h.complete(h.state.actions[id], {
    plan: outside, snapshotDigest: 'frozen', packagesRef: '/packages', evidenceRef: '/planner',
  }), /exceeds declared boundary/)
})

test('a full plan may add a verification only when every real binding is inside the authorized task boundary', () => {
  const h = harness(); h.create('wf2')
  const previous = plan([task('Stable'), task('Repair', 'web')])
  h.state.workflows.wf2.planningSources = { snapshotDigest: 'frozen' }
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf2', kind: 'plan', key: 'bounded-new-verification', input: {
    parentVersion: 0, snapshotDigest: 'frozen', registryDigest: previous.registryDigest,
    previousPlan: previous, previousPlanDigest: kernelDigest(previous),
    revisionBoundary: { taskIds: ['Repair'], verificationIds: [] },
    sources: { snapshotDigest: 'frozen' }, authorization: { scope: 'implementation', sourceId: 'root-grant' },
  } })
  const action = h.state.actions[id]; h.claim(action)
  const expected = { actionId: action.id, workflowId: 'wf2', kind: 'plan', inputDigest: action.inputDigest }
  const result = candidate => ({ plan: candidate, snapshotDigest: 'frozen', packagesRef: '/packages', evidenceRef: '/planner' })
  const allowed = structuredClone(previous)
  allowed.verifications.push({ id: 'web_build', run: ['npm', 'run', 'build'] })
  allowed.tasks.find(item => item.id === 'Repair').verify.push('web_build')
  assert.equal(preflightPlanningResult(h.state, expected, result(allowed), h.time), true)

  const orphan = structuredClone(previous)
  orphan.verifications.push({ id: 'orphan_build', run: ['npm', 'run', 'build:ext'] })
  assert.throws(() => preflightPlanningResult(h.state, expected, result(orphan), h.time), /exceeds declared boundary/)
  const outside = structuredClone(previous)
  outside.verifications.push({ id: 'outside_build', run: ['npm', 'run', 'build:ext'] })
  outside.tasks.find(item => item.id === 'Stable').verify.push('outside_build')
  assert.throws(() => preflightPlanningResult(h.state, expected, result(outside), h.time), /exceeds declared boundary/)
})

test('an explicit verification binding repair keeps argv stable while no-progress remains a separate planning result', () => {
  const stable = task('Stable')
  const h = harness([stable, task('Repair', 'web')])
  const value = structuredClone(h.state.workflows.wf1.plan)
  value.verifications.push({ id: 'other', run: ['node', '--test', 'other.mjs'] })
  value.tasks.find(task => task.id === 'Repair').verify = ['other']
  h.activate('wf1', value, 1)
  const baseline = h.state.workflows.wf1.plan
  const reviewId = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'review_plan', key: 'binding-only-review', input: {
    parentVersion: 2, snapshotDigest: 'snapshot', plan: baseline, planDigest: kernelDigest(baseline),
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  h.complete(h.state.actions[reviewId], { planDigest: kernelDigest(baseline), snapshotDigest: 'snapshot', evidenceRef: '/review', review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'Bind the existing unit command after its producer.', issues: [{
      obligationId: 'bind-existing-unit', sourceId: 'SPEC', sourceVersion: 'R1', targetTaskIds: ['Repair'],
      targetVerificationIds: ['unit'], title: 'Bind existing unit', detail: 'The argv is already correct; only its task binding is absent.',
      suggestion: 'Bind unit to Repair without changing argv.',
      closeWhen: { kind: 'plan_verification_binding', taskId: 'Repair', verificationId: 'unit' },
    }],
  } })
  const request = { type: 'planning.request', workflowId: 'wf1', input: {
    parentVersion: 2, snapshotDigest: 'snapshot', registryDigest: baseline.registryDigest,
    previousPlan: baseline, previousPlanDigest: kernelDigest(baseline),
    sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
    revisionReason: 'Add the missing task binding without changing the command.',
    revisionBoundary: { taskIds: ['Repair'], verificationIds: ['unit'] },
  } }
  const plannerId = h.send(request); const planner = h.state.actions[plannerId]; h.claim(planner)
  const result = candidate => ({ plan: candidate, snapshotDigest: 'snapshot', packagesRef: '/packages', evidenceRef: '/planner' })
  assert.throws(() => preflightPlanningResult(h.state, {
    actionId: planner.id, workflowId: 'wf1', kind: 'plan', inputDigest: planner.inputDigest,
  }, result(baseline), h.time), /planning_no_progress/, 'a missing binding is not reviewable closure evidence')
  const changed = structuredClone(baseline)
  changed.tasks.find(task => task.id === 'Repair').verify = ['unit']
  assert.equal(preflightPlanningResult(h.state, { actionId: planner.id, workflowId: 'wf1', kind: 'plan', inputDigest: planner.inputDigest },
    result(changed), h.time), true)
  assert.deepEqual(changed.verifications.find(item => item.id === 'unit'), baseline.verifications.find(item => item.id === 'unit'))
  h.send({ type: 'action.result', actionId: planner.id, token: 'claim', result: result(changed) })
  const repairedReview = h.actions('review_plan').at(-1)
  h.complete(repairedReview, { planDigest: kernelDigest(changed), snapshotDigest: 'snapshot', evidenceRef: '/fixed-review', review: {
    contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: 'The required binding now exists.', issues: [],
    obligationClosures: [{ obligationId: 'bind-existing-unit', kind: 'plan_verification_binding', taskId: 'Repair',
      verificationId: 'unit', planDigest: kernelDigest(changed) }],
  } })
  assert.equal(h.state.workflows.wf1.issues['bind-existing-unit'].status, 'closed')
})

test('planning preflight rejects an invalid obligation id without mutating control state', () => {
  const h = harness()
  const value = h.state.workflows.wf1.plan
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'review_plan', key: 'preflight-invalid-id',
    input: { plan: value, planDigest: kernelDigest(value), parentVersion: 1, snapshotDigest: 'snapshot',
      sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' } } })
  const action = h.state.actions[id]; h.claim(action)
  const before = structuredClone(h.state)
  const result = { planDigest: action.input.planDigest, snapshotDigest: 'snapshot', evidenceRef: '/native-review',
    review: { contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'One obligation remains.', issues: [{
      obligationId: 'issue/with/slash', sourceId: 'TICKET', sourceVersion: 'R1', targetTaskIds: ['T1'],
      title: 'Repair the plan', closeWhen: { kind: 'plan_task_executable', taskId: 'T1' },
    }] } }
  assert.throws(() => preflightPlanningResult(h.state, { actionId: action.id, workflowId: action.workflowId,
    kind: action.kind, inputDigest: action.inputDigest }, result, h.time), /review\.issues\[\]\.obligationId.*letters.*digits/u)
  assert.deepEqual(h.state, before)
})

test('planning preflight rejects a true no-progress result immediately without mutating live state', () => {
  const h = harness(); h.create('wf2')
  const unchanged = plan()
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf2', kind: 'plan', key: 'preflight-no-progress', input: {
    parentVersion: 0, snapshotDigest: 'snapshot', registryDigest: unchanged.registryDigest,
    previousPlanDigest: kernelDigest(unchanged), sources: { snapshotDigest: 'snapshot' },
    authorization: { scope: 'implementation', sourceId: 'root' },
  } })
  const action = h.state.actions[id]; h.claim(action)
  const before = structuredClone(h.state)
  const result = { plan: unchanged, snapshotDigest: 'snapshot',
    packagesRef: '/packages', evidenceRef: '/native-plan' }
  assert.throws(() => preflightPlanningResult(h.state, { actionId: action.id, workflowId: action.workflowId,
    kind: action.kind, inputDigest: action.inputDigest }, result, h.time), /planning_no_progress/)
  assert.deepEqual(h.state, before)
  h.send({ type: 'action.result', actionId: action.id, token: 'claim', result })
  assert.equal(h.state.actions[action.id].status, 'failed')
  assert.equal(h.state.workflows.wf2.planningFailure, 'planning_no_progress')
  const notice = h.actions('notify_main').find(item => item.input.reason === 'planning_failed')
  assert.equal(notice.input.detail.reason, 'planning_no_progress')
  assert.equal(notice.input.detail.actionId, action.id)
})

test('a valid planning preflight cannot authorize a stale later commit', () => {
  const h = harness()
  const value = h.state.workflows.wf1.plan
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'review_plan', key: 'preflight-race',
    input: { plan: value, planDigest: kernelDigest(value), parentVersion: 1, snapshotDigest: 'snapshot',
      sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' } } })
  const action = h.state.actions[id]; h.claim(action)
  const result = { planDigest: action.input.planDigest, snapshotDigest: 'snapshot', evidenceRef: '/native-review',
    review: { contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'One obligation remains.', issues: [{
      obligationId: 'stable-obligation', sourceId: 'TICKET', sourceVersion: 'R1', targetTaskIds: ['T1'],
      title: 'Repair the plan', closeWhen: { kind: 'plan_task_executable', taskId: 'T1' },
    }] } }
  assert.equal(preflightPlanningResult(h.state, { actionId: action.id, workflowId: action.workflowId,
    kind: action.kind, inputDigest: action.inputDigest }, result, h.time), true)
  h.send({ type: 'issue.register', workflowId: 'wf1', issue: { id: 'stable-obligation', sourceId: 'other-source',
    closeWhen: { kind: 'runtime_evidence_required' }, blocksActivation: true } })
  assert.throws(() => h.send({ type: 'action.result', actionId: action.id, token: 'claim', result }), /already belongs to a non-review issue/u)
})

test('planning preflight updates current obligation text for the same identity and rejects a different identity', () => {
  const h = harness()
  const original = h.state.workflows.wf1.plan
  const issue = (sourceVersion, suffix = '') => ({ obligationId: 'stable-review-contract', sourceId: 'TICKET', sourceVersion,
    targetTaskIds: ['T1'], severity: suffix ? 'high' : 'medium', title: `Keep unit verification bound${suffix}`,
    detail: `The task must retain its unit verification.${suffix}`, suggestion: `Preserve the current verification binding.${suffix}`,
    closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' } })
  const firstId = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'review_plan', key: 'declare-obligation',
    input: { plan: original, planDigest: kernelDigest(original), registryDigest: original.registryDigest, parentVersion: 1, snapshotDigest: 'snapshot',
      sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' } } })
  h.complete(h.state.actions[firstId], { planDigest: kernelDigest(original), snapshotDigest: 'snapshot', evidenceRef: '/review-1',
    review: { contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'Retain the verification.', issues: [issue('R1')] } })
  const revised = plan([{ ...task('T1'), title: 'Revised task with retained verification' }])
  const plannerId = h.send({ type: 'planning.request', workflowId: 'wf1', input: { parentVersion: 1, snapshotDigest: 'snapshot',
    registryDigest: original.registryDigest, sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'root' },
    revisionReason: 'Root reviewed the obligation and chose this repair' } })
  h.complete(h.state.actions[plannerId], { plan: revised, snapshotDigest: 'snapshot', packagesRef: '/packages-2', evidenceRef: '/planner-2' })
  const action = h.actions('review_plan').at(-1); h.claim(action)
  const expected = { actionId: action.id, workflowId: action.workflowId, kind: action.kind, inputDigest: action.inputDigest }
  const result = item => ({ planDigest: action.input.planDigest, snapshotDigest: 'snapshot', evidenceRef: '/review-2',
    review: { contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'Check the retained verification.', issues: [item] } })
  const current = issue('R1', ' after the partial repair')
  assert.equal(preflightPlanningResult(h.state, expected, result(current), h.time), true)
  assert.throws(() => preflightPlanningResult(h.state, expected, result(issue('R2')), h.time), error => {
    assert.match(error.message, /Review obligation identity changed/u)
    assert.match(error.message, /existing immutable identity=.*stable-review-contract/u)
    assert.match(error.message, /update only current title\/detail\/suggestion/u)
    return true
  })
  h.send({ type: 'action.result', actionId: action.id, token: 'claim', result: result(current) })
  assert.equal(h.state.workflows.wf1.issues['stable-review-contract'].severity, 'high')
  assert.equal(h.state.workflows.wf1.issues['stable-review-contract'].title, current.title)
  assert.equal(h.state.workflows.wf1.issues['stable-review-contract'].detail, current.detail)
  assert.equal(h.state.workflows.wf1.issues['stable-review-contract'].suggestion, current.suggestion)
})

test('execution obligations permit implementation, close only on integration and reopen when their task changes', () => {
  const h = harness()
  const value = plan()
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'review_plan', key: 'execution-obligation',
    input: { plan: value, planDigest: kernelDigest(value), parentVersion: 1, snapshotDigest: 'snapshot',
      sources: { snapshotDigest: 'snapshot' }, authorization: { scope: 'implementation', sourceId: 'user-message' } } })
  h.complete(h.state.actions[id], { planDigest: kernelDigest(value), snapshotDigest: 'snapshot', evidenceRef: '/review',
    review: { status: 'passed', issues: [{ obligationId: 'proof-unit', sourceId: 'ticket-unit', sourceVersion: '1',
      targetTaskIds: ['T1'], title: 'The produced module must pass unit verification',
      closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' } }] } })
  assert.equal(h.state.workflows.wf1.planVersion, 2)
  assert.equal(h.state.workflows.wf1.issues['proof-unit'].status, 'open')
  verified(h)
  assert.equal(h.state.workflows.wf1.issues['proof-unit'].status, 'open')
  h.complete(h.actions('integrate_candidate')[0], { commitSha: 'commit', worklogRef: 'log', candidateCommit: 'content', verified: true, baseCommit: 'base' })
  assert.equal(h.state.workflows.wf1.issues['proof-unit'].status, 'closed')
  h.activate('wf1', plan([{ ...task('T1'), title: 'A changed implementation contract' }]), 2)
  assert.equal(h.state.workflows.wf1.issues['proof-unit'].status, 'open')
  assert.equal(h.state.workflows.wf1.issues['proof-unit'].evidence, undefined)
})

test('a final passing test cannot hide an unclosed obligation or deliver the checkout', () => {
  const h = harness(); verified(h)
  h.complete(h.actions('integrate_candidate')[0], { commitSha: 'commit', worklogRef: 'log', candidateCommit: 'content', verified: true, baseCommit: 'base' })
  h.send({ type: 'issue.register', workflowId: 'wf1', issue: { id: 'unclosed', sourceId: 'requirement', closeWhen: { kind: 'explicit_evidence' }, blocksActivation: false } })
  h.send({ type: 'drive' })
  h.complete(h.actions('verify_workflow')[0], { passed: true, commitSha: 'commit', planVersion: 1 })
  assert.equal(h.actions('deliver_workflow').length, 0)
  assert.equal(h.state.workflows.wf1.deliveryFailure.reason, 'unresolved_obligations')
  assert.notEqual(view(h.state, 'wf1').status, 'completed')
})

test('a real permission wait pauses an ordinary action deadline and cancellation expires its question', () => {
  const h = harness(undefined, { policy: { deadlineMs: 100, terminationWindowMs: 30 } })
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf1', kind: 'consult_owner', key: 'operation', ownerId: 'api', input: { command: 'test' } })
  h.claim(h.state.actions[id])
  const deadline = h.state.actions[id].deadlineAt
  h.send({ type: 'decision.request', workflowId: 'wf1', id: 'permission', kind: 'permission', request: { question: 'Allow this exact command?' },
    binding: { actionId: id, inputDigest: h.state.actions[id].inputDigest } })
  h.time += 10_000; h.send({ type: 'drive' })
  assert.equal(h.actions('stop_execution').length, 0)
  const decision = h.state.workflows.wf1.decisions.permission
  h.send({ type: 'decision.answer', workflowId: 'wf1', id: 'permission', requestDigest: decision.requestDigest,
    rootSessionId: 'root-session', answer: { value: 'allow' }, evidenceRef: 'native-answer' })
  assert.equal(h.state.actions[id].deadlineAt, deadline + 10_000)
  h.send({ type: 'workflow.cancel', workflowId: 'wf1' })
  h.time += 31; h.send({ type: 'drive' })
  assert.equal(view(h.state, 'wf1').status, 'failed')
  assert.equal(h.state.actions[id].quarantined, true)
  assert.notEqual(view(h.state, 'wf1').status, 'cancelled')
})

test('parallel cancellation emits one canonical terminal notice only after every stop settles', () => {
  const h = harness([task('T1', 'api'), task('T2', 'web')])
  h.send({ type: 'drive' })
  for (const action of h.actions('execute_owner')) h.claim(action)

  h.send({ type: 'workflow.cancel', workflowId: 'wf1' })
  assert.equal(view(h.state, 'wf1').status, 'stopping')
  assert.equal(h.actions('notify_main').filter(action => action.input.reason === 'workflow_terminal').length, 0)

  const stops = h.actions('stop_execution')
  const result = stop => {
    const attempt = h.state.workflows.wf1.attempts[stop.attemptId]
    return { authority: attempt.authority, executionSettled: true, sourceWritesClosed: true,
      terminationId: `settled:${attempt.id}` }
  }
  h.complete(stops[0], result(stops[0]))
  assert.equal(view(h.state, 'wf1').status, 'stopping')
  assert.equal(h.actions('notify_main').filter(action => action.input.reason === 'workflow_terminal').length, 0)

  const secondResult = result(stops[1])
  h.complete(stops[1], secondResult)
  const terminal = h.actions('notify_main').filter(action => action.input.reason === 'workflow_terminal')
  assert.equal(view(h.state, 'wf1').status, 'cancelled')
  assert.equal(terminal.length, 1)
  assert.equal(terminal[0].input.detail.status, 'cancelled')
  assert.equal(terminal[0].input.detail.revision, h.state.workflows.wf1.revision)

  const revision = h.state.revision
  h.send({ type: 'action.result', actionId: stops[1].id, token: 'claim', result: secondResult })
  assert.equal(h.state.revision, revision)
  assert.equal(h.actions('notify_main').filter(action => action.input.reason === 'workflow_terminal').length, 1)
})

test('a late stop receipt corrects failed cancellation once and identifies the superseded notice', () => {
  const h = harness(undefined, { policy: { terminationWindowMs: 30 } })
  h.send({ type: 'drive' })
  const ownerAction = h.actions('execute_owner')[0]
  h.claim(ownerAction)
  h.send({ type: 'workflow.cancel', workflowId: 'wf1' })
  const stop = h.actions('stop_execution')[0]
  h.claim(stop)
  h.send({ type: 'action.failed', actionId: stop.id, token: 'claim', reason: 'stop transport failed' })

  h.time += 31
  h.send({ type: 'drive' })
  assert.equal(view(h.state, 'wf1').status, 'failed')
  assert.equal(h.state.workflows.wf1.attempts[stop.attemptId].quarantined, true)
  const failedNotice = h.actions('notify_main').find(action => action.input.reason === 'workflow_terminal')
  assert.equal(failedNotice.input.detail.status, 'failed')

  const attempt = h.state.workflows.wf1.attempts[stop.attemptId]
  const late = { authority: attempt.authority, executionSettled: true, sourceWritesClosed: true,
    terminationId: `late:${attempt.id}` }
  h.send({ type: 'action.result', actionId: stop.id, token: 'claim', result: late })
  assert.equal(view(h.state, 'wf1').status, 'cancelled')
  assert.equal(h.state.workflows.wf1.attempts[stop.attemptId].quarantined, false)

  const terminal = h.actions('notify_main').filter(action => action.input.reason === 'workflow_terminal')
  assert.equal(terminal.length, 2)
  const corrected = terminal.find(action => action.input.detail.status === 'cancelled')
  assert.equal(corrected.input.detail.correctionReason, 'late_stop_receipt')
  assert.deepEqual(corrected.input.detail.supersedes, {
    noticeId: failedNotice.id,
    status: 'failed',
    revision: failedNotice.input.detail.revision,
  })

  const revision = h.state.revision
  h.send({ type: 'action.result', actionId: stop.id, token: 'claim', result: late })
  assert.equal(h.state.revision, revision)
  assert.equal(h.actions('notify_main').filter(action => action.input.reason === 'workflow_terminal').length, 2)
})

test('identical technical replan requests consume one persistent recovery slot', () => {
  const h = harness()
  const event = { type: 'planning.request', workflowId: 'wf1', input: { parentVersion: 1, snapshotDigest: 'snapshot', revisionReason: 'Repair the verification dependency' } }
  const id = h.send(event); const state = h.state
  assert.equal(h.send(event), id); assert.equal(h.state, state)
  assert.equal(h.state.workflows.wf1.recoveryUsed, 1)
  assert.equal(h.actions('plan').length, 1)
  const projected = view(h.state, 'wf1')
  assert.deepEqual(JSON.parse(JSON.stringify(projected)), projected, 'workflow tool views must be lossless JSON')
  assert.equal(projected.recovery.issues.find(issue => issue.id === h.state.workflows.wf1.planningIssueId).lastReason, null)
})

function failedAttempt(h) {
  const { action, attempt } = submit(h)
  h.send({ type: 'action.result', actionId: action.id, token: 'claim', result: { executionSettled: true, sourceWritesClosed: true, authority: attempt.authority } })
  h.complete(h.actions('seal_candidate').find(action => action.attemptId === attempt.id), { artifact: '/candidate', commitSha: 'content', authority: attempt.authority })
  h.complete(h.actions('verify_candidate').find(action => action.attemptId === attempt.id), { passed: false, commitSha: 'content', executionSettled: true,
    results: [{ verificationId: 'unit', passed: false, exitCode: 1, commitSha: 'content' }] })
  return h.state.workflows.wf1.attempts[attempt.id]
}

function readOnlyReviewPlan() {
  return plan([{
    id: 'ImpactReview', title: 'Impact review', role: 'review', ownerId: 'api', dependsOn: [], resources: [],
    write: [], verify: [], done: ['Persist the reviewed impact report'],
  }])
}

function finishReadOnlyReviewAttempt(h, { reviewPassed, commitSha = 'review-commit', integrate = true }) {
  h.send({ type: 'drive' })
  const action = h.actions('execute_owner').find(item => item.input.task.id === 'ImpactReview' && item.status === 'pending')
  h.claim(action)
  h.send({ type: 'action.started', actionId: action.id, token: 'claim',
    evidence: { handleId: `owner:${action.attemptId}`, sessionId: `owner:${action.attemptId}` } })
  const attempt = h.state.workflows.wf1.attempts[action.attemptId]
  h.send({ type: 'owner.submit', workflowId: 'wf1', attemptId: attempt.id, authority: attempt.authority,
    report: { status: 'completed', summary: 'Durable impact report' }, manifestDigest: `manifest:${attempt.id}`,
    artifact: `/submission/${attempt.id}` })
  h.send({ type: 'action.result', actionId: action.id, token: 'claim', result: {
    executionSettled: true, sourceWritesClosed: true, managedRangeStopped: true,
    terminationScope: 'dsh-managed-range', terminationId: `owner:${attempt.id}`,
    sessionId: `owner:${attempt.id}`, authority: attempt.authority,
  } })
  const taskCommitSha = commitSha === 'review-commit' ? `content:${attempt.id}` : `${commitSha}:${attempt.id}`
  h.complete(h.actions('seal_candidate').find(item => item.attemptId === attempt.id), {
    repositoryRoot: '/project', commitSha: taskCommitSha, authority: attempt.authority,
  })
  h.complete(h.actions('verify_candidate').find(item => item.attemptId === attempt.id), {
    passed: reviewPassed, commitSha: taskCommitSha, executionSettled: true, results: [],
    review: {
      passed: reviewPassed, commitSha: taskCommitSha, evidenceRef: `/review/${attempt.id}`,
      executionSettled: true, managedRangeStopped: true, terminationScope: 'dsh-managed-range',
      terminationId: `reviewer:${attempt.id}`, sessionId: `reviewer:${attempt.id}`,
      ...(reviewPassed ? {} : { reasons: ['The Owner report omits the required impact evidence.'] }),
    },
  })
  if (reviewPassed && integrate) h.complete(h.actions('integrate_candidate').find(item => item.attemptId === attempt.id), {
    commitSha, worklogRef: `/worklog/${attempt.id}`, baseCommit: h.state.workflows.wf1.integrationHead,
    candidateCommit: taskCommitSha, verified: true,
  })
  return h.state.workflows.wf1.attempts[attempt.id]
}

test('a corrected read-only review report closes its bound execution issue only after independent review and integration', () => {
  const h = harness(undefined, { planValue: readOnlyReviewPlan() })
  const failed = finishReadOnlyReviewAttempt(h, { reviewPassed: false })
  const issueId = failed.issueId
  assert.deepEqual(h.state.workflows.wf1.issues[issueId].closeWhen,
    { passingCurrentTaskVerification: [], verifications: [] })
  const failedVerification = h.actions('verify_candidate').find(item => item.attemptId === failed.id)
  const actionIssueId = 'legacy-read-only-review-action-failure'
  h.state.workflows.wf1.issues[actionIssueId] = {
    id: actionIssueId, origin: 'action', sourceId: failedVerification.id, status: 'open', used: 1,
    blocksActivation: false,
    closeWhen: { actionKind: 'verify_candidate', inputDigest: failedVerification.inputDigest },
  }

  h.send({ type: 'task.retry', workflowId: 'wf1', taskId: 'ImpactReview', issueId,
    instructions: 'Complete the missing impact evidence in the durable report.', decisionRef: 'root:review-repair' })
  h.send({ type: 'drive' })
  const succeeded = finishReadOnlyReviewAttempt(h, { reviewPassed: true, integrate: false })
  assert.equal(h.state.workflows.wf1.issues[issueId].status, 'open')
  assert.equal(h.state.workflows.wf1.issues[actionIssueId].status, 'open')
  h.complete(h.actions('integrate_candidate').find(item => item.attemptId === succeeded.id), {
    commitSha: 'review-commit', worklogRef: `/worklog/${succeeded.id}`,
    baseCommit: h.state.workflows.wf1.integrationHead, candidateCommit: succeeded.candidate.commitSha, verified: true,
  })

  const issue = h.state.workflows.wf1.issues[issueId]
  assert.equal(issue.status, 'closed')
  assert.equal(issue.evidence.kind, 'review_report_verified_integration')
  assert.equal(issue.evidence.attemptId, succeeded.id)
  assert.deepEqual(issue.evidence.failedAttemptIds, [failed.id])
  assert.equal(h.state.workflows.wf1.issues[actionIssueId].status, 'closed')
  assert.equal(h.state.workflows.wf1.issues[actionIssueId].evidence.kind, 'task_retry')
  assert.deepEqual(h.state.workflows.wf1.issues[actionIssueId].evidence.verifications, [])
})

test('a read-only report failure stays open before integration and without independent review identity or durable submission', () => {
  for (const mutate of [
    attempt => { attempt.verification.review.sessionId = attempt.writerTermination.sessionId },
    attempt => { delete attempt.submission },
  ]) {
    const h = harness(undefined, { planValue: readOnlyReviewPlan() })
    const failed = finishReadOnlyReviewAttempt(h, { reviewPassed: false })
    h.send({ type: 'task.retry', workflowId: 'wf1', taskId: 'ImpactReview', issueId: failed.issueId,
      instructions: 'Complete the durable report.', decisionRef: `root:${failed.id}` })
    const succeeded = finishReadOnlyReviewAttempt(h, { reviewPassed: true, integrate: false })
    assert.equal(h.state.workflows.wf1.issues[failed.issueId].status, 'open')
    mutate(succeeded)
    h.complete(h.actions('integrate_candidate').find(item => item.attemptId === succeeded.id), {
      commitSha: `commit:${succeeded.id}`, worklogRef: `/worklog/${succeeded.id}`,
      baseCommit: h.state.workflows.wf1.integrationHead, candidateCommit: succeeded.candidate.commitSha, verified: true,
    })
    assert.equal(h.state.workflows.wf1.issues[failed.issueId].status, 'open')
  }
})

test('an empty verification list closes only a legal review report task', () => {
  const value = readOnlyReviewPlan()
  value.tasks[0].role = 'work'
  value.tasks[0].write = ['src/api/**']
  assert.throws(() => normalizePlanV2(value), /必须绑定至少一个验证/,
    'the plan contract already rejects an unverified source-writing task')
  value.tasks[0].role = 'verify'
  value.tasks[0].write = []
  const h = harness(undefined, { planValue: normalizePlanV2(value) })
  const failed = finishReadOnlyReviewAttempt(h, { reviewPassed: false })
  h.send({ type: 'task.retry', workflowId: 'wf1', taskId: 'ImpactReview', issueId: failed.issueId,
    instructions: 'Repair the code-writing review task.', decisionRef: 'root:code-review-repair' })
  finishReadOnlyReviewAttempt(h, { reviewPassed: true })
  assert.equal(h.state.workflows.wf1.issues[failed.issueId].status, 'open')
})

function ticketPlan(tasks, revision = 'R1', command = ['node', '--test']) {
  return normalizePlanV2({ ...plan(tasks), verifications: [{ id: 'unit', run: command }],
    planningBindings: { contract: 'DSH_PLANNING_BINDINGS_V1', snapshotId: `snapshot-${revision}`, sourceDigest: 'c'.repeat(64),
      tasks: tasks.map(item => ({ taskId: item.id, tickets: [{ id: 'ticket-contract', revision, fragments: ['required-behavior'] }], contracts: [] })) } })
}

test('renaming and splitting a Ticket preserves its issue, budget and all descendant closure evidence', () => {
  const h = harness()
  h.activate('wf1', ticketPlan([task('T1')]), 1)
  const failed = failedAttempt(h), issueId = failed.issueId
  h.send({ type: 'planning.request', workflowId: 'wf1', input: { parentVersion: 2, snapshotDigest: 'snapshot', revisionReason: 'Split the same Ticket into two bounded packages' } })
  assert.equal(h.state.workflows.wf1.issues[issueId].used, 1)
  h.activate('wf1', ticketPlan([task('RenamedA'), task('RenamedB', 'web')], 'R2'), 2)
  for (const id of ['RenamedA', 'RenamedB']) assert.deepEqual(h.state.workflows.wf1.tasks[id].inheritedIssueIds, [issueId])
  for (const [index, id] of ['RenamedA', 'RenamedB'].entries()) {
    const attempt = verified(h, id)
    h.complete(h.actions('integrate_candidate').find(action => action.attemptId === attempt.id), {
      commitSha: `commit-${id}`, worklogRef: `/log-${id}`, baseCommit: h.state.workflows.wf1.integrationHead, candidateCommit: 'content', verified: true })
    assert.equal(h.state.workflows.wf1.issues[issueId].status, index === 0 ? 'open' : 'closed')
  }
  assert.equal(h.state.workflows.wf1.issues[issueId].evidence.attempts.length, 2)
  assert.equal(h.state.workflows.wf1.recoveryUsed, 1)
})

test('keeping a verification ID while replacing its command cannot close the original failure', () => {
  const h = harness()
  h.activate('wf1', ticketPlan([task('T1')]), 1)
  const failed = failedAttempt(h)
  h.activate('wf1', ticketPlan([task('Renamed')], 'R2', ['node', '-e', 'process.exit(0)']), 2)
  const attempt = verified(h, 'Renamed')
  h.complete(h.actions('integrate_candidate').find(action => action.attemptId === attempt.id), {
    commitSha: 'different-test', worklogRef: '/log', baseCommit: 'base', candidateCommit: 'content', verified: true })
  assert.equal(h.state.workflows.wf1.issues[failed.issueId].status, 'open')
  assert.equal(h.state.workflows.wf1.issues[failed.issueId].evidence, undefined)
})

test('a failed recoverable workflow still reserves its project until explicitly cancelled and settled', () => {
  const h = harness()
  failedAttempt(h)
  assert.equal(view(h.state, 'wf1').status, 'failed')
  const create = { type: 'workflow.create', id: 'duplicate', root: '/project', rootSessionId: 'new-root', request: 'same project', baseCommit: 'base', exclusiveRoot: true }
  assert.throws(() => h.send(create), /active or unresolved/)
  h.send({ type: 'workflow.cancel', workflowId: 'wf1' })
  assert.equal(h.send(create), 'duplicate')
})

test('replanning cannot bypass the original execution issue limit', () => {
  const h = harness(undefined, { policy: { issueRecovery: 1 } })
  const failed = failedAttempt(h)
  h.send({ type: 'planning.request', workflowId: 'wf1', input: { parentVersion: 1, snapshotDigest: 'snapshot', revisionReason: 'Repair same contract' } })
  stoppedAction(h, h.actions('plan').at(-1))
  h.activate('wf1', plan([{ ...task('T1'), title: 'Reworded' }]), 1)
  assert.equal(h.state.workflows.wf1.issues[failed.issueId].used, 1)
  assert.throws(() => h.send({ type: 'planning.request', workflowId: 'wf1', input: { parentVersion: 2, snapshotDigest: 'snapshot', revisionReason: 'Reword again' } }), /budget exhausted/)
})

for (const kind of ['verify_workflow', 'deliver_workflow']) test(`settled ${kind} failure repairs the same input with inherited budget and retained evidence`, () => {
  const h = harness()
  verified(h)
  h.complete(h.actions('integrate_candidate')[0], { commitSha: 'integrated', worklogRef: '/history', baseCommit: 'base', candidateCommit: 'content', verified: true })
  h.send({ type: 'drive' })
  const final = h.actions('verify_workflow')[0]
  const passed = { passed: true, planVersion: 1, commitSha: 'integrated', evidenceRef: '/final-proof' }
  let failed = final
  if (kind === 'deliver_workflow') {
    h.complete(final, passed)
    failed = h.actions('deliver_workflow')[0]
    h.complete(failed, { blocked: true, executionSettled: true, sourceWritesClosed: true, reason: 'User checkout has a modification', evidenceRef: '/blocked-proof' })
  } else h.complete(final, { ...passed, passed: false, executionSettled: true, results: [{ passed: false, exitCode: 1 }] })
  assert.equal(view(h.state, 'wf1').status, 'failed')
  const event = { type: 'action.retry', workflowId: 'wf1', actionId: failed.id, reason: 'The external obstruction is resolved', decisionRef: 'root-call:repair' }
  const id = h.send(event)
  assert.equal(h.send(event), id)
  assert.equal(h.state.workflows.wf1.recoveryUsed, 1)
  assert.equal(h.state.actions[failed.id].status, 'failed')
  assert.deepEqual(h.state.actions[id].input, failed.input)
  h.complete(h.state.actions[id], kind === 'verify_workflow' ? passed : { commitSha: 'integrated', planVersion: 1, userCheckoutUpdated: true, evidenceRef: '/delivery-proof' })
  assert.equal(h.state.workflows.wf1.issues[h.state.actions[id].retryIssueId].status, 'closed')
  assert.equal(h.state.actions[failed.id].resolution.kind, 'retry_succeeded')
  assert.equal(view(h.state, 'wf1').attention.some(item => item.id === failed.id), false)
  if (kind === 'verify_workflow') assert.equal(h.actions('deliver_workflow').length, 1)
  else assert.equal(view(h.state, 'wf1').status, 'completed')
})

function stoppedAction(h, action) {
  h.claim(action)
  h.send({ type: 'action.failed', actionId: action.id, token: 'claim', reason: 'transport interrupted' })
  h.time += 30_000
  h.send({ type: 'action.claim', actionId: action.id, token: 'observe', hostId: 'host', mode: 'observe' })
  h.send({ type: 'action.observe', actionId: action.id, token: 'observe', fact: 'unknown' })
  const stop = h.actions('stop_execution').find(item => item.input.targetActionId === action.id)
  h.complete(stop, { targetActionId: action.id, executionSettled: true, sourceWritesClosed: true, terminationId: `stopped:${action.id}` })
}

for (const kind of ['plan', 'review_plan']) test(`initial ${kind} transport failure can recover without fabricating an active plan`, () => {
  const h = harness()
  h.create('wf2')
  const value = plan()
  const input = { parentVersion: 0, snapshotDigest: 'initial-source', registryDigest: value.registryDigest,
    sources: { snapshotDigest: 'initial-source' }, authorization: { scope: 'implementation', sourceId: 'native-user' },
    ...(kind === 'review_plan' ? { plan: value, planDigest: kernelDigest(value), packagesRef: '/packages' } : {}) }
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf2', kind, key: 'initial', input })
  stoppedAction(h, h.state.actions[id])
  const retry = h.send({ type: 'action.retry', workflowId: 'wf2', actionId: id, reason: 'Native model transport recovered', decisionRef: `root:${kind}` })
  assert.equal(h.state.workflows.wf2.plan, null)
  const result = { snapshotDigest: 'initial-source', evidenceRef: '/native-result', executionSettled: true, sourceWritesClosed: true,
    ...(kind === 'plan' ? { plan: value, packagesRef: '/packages' } : { planDigest: kernelDigest(value), review: { status: 'passed', issues: [] } }) }
  h.complete(h.state.actions[retry], result)
  assert.equal(h.state.workflows.wf2.recoveryUsed, 1)
  assert.equal(h.state.actions[id].status, 'failed')
  assert.equal(h.state.actions[id].resolution.kind, 'retry_succeeded')
  if (kind === 'plan') assert.ok(h.actions('review_plan').some(action => action.workflowId === 'wf2'))
  else assert.equal(h.state.workflows.wf2.planVersion, 1)
})

test('a settled Planner delivery failure unblocks formal replanning on the same workflow', () => {
  const h = harness()
  h.create('wf2')
  const value = plan()
  const input = { parentVersion: 0, snapshotDigest: 'ticket-r2', registryDigest: value.registryDigest,
    sources: { snapshotDigest: 'ticket-r2', checkpointId: 'checkpoint-r2' },
    authorization: { scope: 'implementation', sourceId: 'native-user' } }
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf2', kind: 'plan', key: 'initial', input })
  h.claim(h.state.actions[id])
  const termination = { failed: true, reason: 'Role finished without a structured report', executionSettled: true,
    managedRangeStopped: true, terminationScope: 'dsh-managed-range', terminationId: 'planner-turn-ended',
    evidenceRef: '/native-sessions/planner/result.json' }
  h.send({ type: 'action.failed', actionId: id, token: 'claim', reason: termination.reason, termination })
  h.send({ type: 'action.failed', actionId: id, token: 'claim', reason: termination.reason, termination })
  assert.equal(h.state.actions[id].status, 'failed')
  assert.equal(h.state.actions[id].termination.terminationId, 'planner-turn-ended')
  const settledNotices = h.actions('notify_main').filter(action => action.input.detail.actionId === id
    && action.input.detail.executionSettled === true)
  assert.equal(settledNotices.length, 1)
  assert.equal(settledNotices[0].input.detail.evidenceRef, termination.evidenceRef)
  const next = h.send({ type: 'planning.request', workflowId: 'wf2', input: {
    parentVersion: 0, snapshotDigest: 'ticket-r2', revisionReason: 'Split the Ticket loop into bounded executable tasks',
  } })
  assert.equal(h.state.actions[next].kind, 'plan')
  assert.equal(h.state.actions[next].input.previousPlanActionId, undefined)
  assert.equal(h.state.workflows.wf2.recoveryUsed, 1)
})

test('a stopped source preparation retries the exact pending reviewed proposal once', () => {
  const h = harness()
  const revised = plan([{ ...task('T1'), done: ['New behavior from R2'] }])
  h.send({ type: 'plan.propose', workflowId: 'wf1', parentVersion: 1, plan: revised,
    sources: { snapshotDigest: 'R2', codeBaseline: { sourceHead: 'base', checkpointCommit: 'docs-R2' } },
    authorization: { scope: 'implementation', sourceId: 'native-R2' },
    review: { status: 'passed', planDigest: kernelDigest(revised), evidenceRef: '/R2-review' } })
  const original = h.actions('prepare_revision')[0]
  stoppedAction(h, original)
  const retry = h.send({ type: 'action.retry', workflowId: 'wf1', actionId: original.id, reason: 'Git access recovered', decisionRef: 'root:source-retry' })
  h.send({ type: 'drive' })
  assert.equal(h.actions('prepare_revision').length, 2)
  assert.equal(h.actions('execute_owner').length, 0)
  assert.deepEqual(h.state.actions[retry].input, original.input)
  h.complete(h.state.actions[retry], { baseCommit: 'base', checkpointCommit: 'docs-R2', commitSha: 'combined', executionSettled: true, sourceWritesClosed: true, evidenceRef: '/git-result' })
  assert.equal(h.state.workflows.wf1.planVersion, 2)
  assert.equal(h.state.workflows.wf1.pendingActivation, null)
  assert.equal(h.state.workflows.wf1.issues[h.state.actions[retry].retryIssueId].status, 'closed')
  assert.equal(h.state.workflows.wf1.recoveryUsed, 1)
})

test('Registry changes cannot use failed-but-recoverable work as a settled project', () => {
  const h = harness(); failedAttempt(h)
  assert.throws(() => h.send({ type: 'registry.request', id: 'registry-new', root: '/project', rootSessionId: 'root-session',
    proposal: { digest: 'proposal' }, beforeExists: true, baseline: { ref: 'refs/heads/main', head: 'base' } }), /settled project work/)
})

test('review failure returns to root without automatically charging an exhausted execution issue', () => {
  const h = harness(undefined, { policy: { issueRecovery: 1 } })
  const failed = failedAttempt(h)
  const id = h.send({ type: 'planning.request', workflowId: 'wf1', input: {
    parentVersion: 1, snapshotDigest: 'snapshot', registryDigest: 'a'.repeat(64), sources: { snapshotDigest: 'snapshot' },
    authorization: { scope: 'implementation', sourceId: 'native-user' }, revisionReason: 'Repair the failing Ticket' } })
  const revised = plan([{ ...task('T1'), title: 'Same Ticket, revised execution' }])
  h.complete(h.state.actions[id], { plan: revised, packagesRef: '/packages', evidenceRef: '/planner', snapshotDigest: 'snapshot' })
  const review = h.actions('review_plan').at(-1)
  h.complete(review, { planDigest: kernelDigest(revised), snapshotDigest: 'snapshot', evidenceRef: '/review',
    review: { contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'Further revision requested', issues: [] } })
  assert.equal(h.actions('plan').length, 1, 'a review loop cannot acquire a fresh issue budget')
  assert.equal(h.state.workflows.wf1.planningFailure, 'revision_required')
  assert.equal(h.state.workflows.wf1.issues[failed.issueId].used, 1)
  assert.equal(h.state.workflows.wf1.recoveryUsed, 1)
})

test('technical planner retries cannot bypass the original execution issue limit', () => {
  const h = harness(undefined, { policy: { issueRecovery: 1 } })
  const failed = failedAttempt(h)
  const id = h.send({ type: 'planning.request', workflowId: 'wf1', input: { parentVersion: 1, snapshotDigest: 'snapshot', revisionReason: 'Repair original issue' } })
  stoppedAction(h, h.state.actions[id])
  assert.throws(() => h.send({ type: 'action.retry', workflowId: 'wf1', actionId: id,
    reason: 'Transport recovered', decisionRef: 'retry-native-planner' }), /recovery budget exhausted/)
  assert.equal(h.state.workflows.wf1.issues[failed.issueId].used, 1)
})

test('an initial no-progress plan is a recoverable failure and receives the bound root diagnosis', () => {
  const h = harness(); h.create('wf2')
  const unchanged = plan()
  const input = { parentVersion: 0, snapshotDigest: 'initial', registryDigest: unchanged.registryDigest,
    previousPlanDigest: kernelDigest(unchanged), sources: { snapshotDigest: 'initial' },
    authorization: { scope: 'implementation', sourceId: 'native-user' } }
  const id = h.send({ type: 'action.enqueue', workflowId: 'wf2', kind: 'plan', key: 'no-progress', input })
  h.complete(h.state.actions[id], { plan: unchanged, snapshotDigest: 'initial', packagesRef: '/packages', evidenceRef: '/no-progress', executionSettled: true, sourceWritesClosed: true })
  assert.equal(h.state.actions[id].status, 'failed')
  assert.equal(view(h.state, 'wf2').status, 'failed')
  const reason = 'Split the producer and consumer while retaining the same Spec and test obligations'
  const next = h.send({ type: 'action.retry', workflowId: 'wf2', actionId: id, reason, decisionRef: 'root:diagnosis' })
  assert.equal(h.state.actions[next].input.repairReason, reason)
  assert.equal(h.state.actions[next].input.snapshotDigest, 'initial')
  assert.equal(h.state.workflows.wf2.planningFailure, null)
  h.complete(h.state.actions[next], { plan: unchanged, snapshotDigest: 'initial', packagesRef: '/packages', evidenceRef: '/still-no-progress', executionSettled: true, sourceWritesClosed: true })
  assert.equal(h.state.actions[next].status, 'failed', 'the same DAG remains a failure after a root explanation')
  assert.equal(h.state.workflows.wf2.issues[h.state.actions[next].retryIssueId].status, 'open')
  assert.equal(h.state.workflows.wf2.recoveryUsed, 1)
})


test('first rejected planning sources can be revised before any plan exists without resetting the workflow', () => {
  const h = harness()
  const input = { parentVersion: 0, checkpointId: 'R1', snapshotDigest: 'source-R1', registryDigest: 'a'.repeat(64),
    sources: { checkpointId: 'R1', snapshotDigest: 'source-R1', codeBaseline: { checkpointCommit: 'docs-R1' } },
    authorization: { scope: 'implementation', sourceId: 'native-user' } }
  h.send({ type: 'workflow.create', id: 'wf2', root: '/other', rootSessionId: 'root-session', request: 'initial sources', baseCommit: 'docs-R1', planning: input })
  const old = h.actions('plan').find(action => action.workflowId === 'wf2')
  const event = { type: 'planning.request', workflowId: 'wf2', input: { ...input, checkpointId: 'R2', snapshotDigest: 'source-R2',
    previousSnapshotDigest: 'source-R1', sources: { checkpointId: 'R2', snapshotDigest: 'source-R2', codeBaseline: { sourceHead: 'docs-R1', checkpointCommit: 'docs-R2' } },
    revisionReason: 'Clarify the same acceptance before first activation' } }
  assert.throws(() => h.send(event), /still unsettled/)
  stoppedAction(h, old)
  const id = h.send(event)
  assert.equal(h.send(event), id)
  assert.equal(h.state.workflows.wf2.recoveryUsed, 1)
  assert.equal(h.state.workflows.wf2.plan, null)
  assert.equal(h.state.workflows.wf2.planningSources.checkpointId, 'R2')
  assert.throws(() => h.send({ type: 'action.retry', workflowId: 'wf2', actionId: old.id,
    reason: 'Retry the stale source', decisionRef: 'stale' }), /source is no longer current/)
})

test('a failed prepared proposal can be retired only after termination and unchanged integration evidence', () => {
  const h = harness()
  const revised = plan([{ ...task('T1'), title: 'R2 proposal' }])
  h.send({ type: 'plan.propose', workflowId: 'wf1', parentVersion: 1, plan: revised,
    sources: { snapshotDigest: 'R2', codeBaseline: { sourceHead: 'base', checkpointCommit: 'docs-R2' } },
    authorization: { scope: 'implementation', sourceId: 'native-R2' },
    review: { status: 'passed', planDigest: kernelDigest(revised), evidenceRef: '/review-R2' } })
  const preparation = h.actions('prepare_revision')[0]
  const event = { type: 'planning.request', workflowId: 'wf1', integrationHead: 'base', input: { parentVersion: 1,
    snapshotDigest: 'snapshot', sources: { snapshotDigest: 'snapshot' }, revisionReason: 'Withdraw the failed proposal, retaining evidence and obligations' } }
  assert.throws(() => h.send(event), /still unsettled/)
  stoppedAction(h, preparation)
  assert.throws(() => h.send({ ...event, integrationHead: 'unrecorded-commit' }), /unchanged integration/)
  h.send(event)
  assert.equal(h.state.workflows.wf1.pendingActivation, null)
  assert.equal(h.state.workflows.wf1.retiredProposals[0].proposal.sources.snapshotDigest, 'R2')
  assert.equal(h.state.actions[preparation.id].resolution.kind, 'source_superseded')
  assert.equal(h.state.workflows.wf1.recoveryUsed, 1)
  assert.equal(h.state.workflows.wf1.planVersion, 1)
})


test('failed Registry governance reserves the project and retries the original proposal with its budget', () => {
  const h = harness()
  h.send({ type: 'workflow.cancel', workflowId: 'wf1' })
  const request = { type: 'registry.request', id: 'registry-one', root: '/project', rootSessionId: 'root-session',
    proposal: { digest: 'proposal', reason: 'Module scopes' }, beforeExists: true, baseline: { ref: 'refs/heads/main', head: 'base' } }
  h.send(request)
  const original = h.actions('change_registry')[0]
  stoppedAction(h, original)
  assert.throws(() => h.send({ ...request, id: 'registry-two' }), /settled project/)
  const retry = h.send({ type: 'action.retry', workflowId: 'registry-one', actionId: original.id,
    reason: 'The failed install command is available again', decisionRef: 'root:registry-repair' })
  assert.equal(h.state.actions[retry].retryRootId, original.id)
  assert.deepEqual(h.state.actions[retry].input, original.input)
  h.complete(h.state.actions[retry], { applied: true, proposalDigest: 'proposal', registryDigest: 'after', commitSha: 'installed', evidenceRef: '/native-approval', executionSettled: true, sourceWritesClosed: true })
  assert.equal(h.state.workflows['registry-one'].recoveryUsed, 1)
  assert.equal(h.state.actions[original.id].resolution.kind, 'retry_succeeded')
  const terminal = h.actions('notify_main').find(item => item.workflowId === 'registry-one'
    && item.input.reason === 'workflow_terminal' && item.input.detail.status === 'completed')
  assert.deepEqual(terminal.input.detail.outcome, { kind: 'registry', result: h.state.workflows['registry-one'].registryResult })
})


for (const approved of [true, false]) test(`active Registry change ${approved ? 'approval' : 'rejection'} waits for actual stopped owners and supersedes their old questions`, () => {
  const h = harness()
  h.send({ type: 'drive' })
  const ownerAction = h.actions('execute_owner')[0]; h.claim(ownerAction)
  const attempt = h.state.workflows.wf1.attempts[ownerAction.attemptId]
  h.send({ type: 'decision.request', workflowId: 'wf1', id: 'old-owner-question', kind: 'permission', request: { question: 'Old command?' },
    binding: { attemptId: attempt.id, authority: attempt.authority, planVersion: 1 } })
  const request = { type: 'registry.request', workflowId: 'wf1', id: 'active-governance', root: '/project', rootSessionId: 'root-session',
    proposal: { digest: 'proposal', reason: 'Narrow API scope' }, beforeExists: true, baseline: { head: 'base', ref: 'refs/heads/main' } }
  assert.equal(h.send(request), 'wf1'); assert.equal(h.send(request), 'wf1')
  assert.equal(h.state.workflows.wf1.decisions['old-owner-question'].status, 'superseded')
  const action = h.actions('change_registry')[0]
  assert.equal(dueActions(h.state, h.time).some(item => item.actionId === action.id), false)
  assert.equal(h.state.workflows.wf1.attempts[attempt.id].phase, 'stopping')
  const stop = h.actions('stop_execution').find(item => item.attemptId === attempt.id)
  h.complete(stop, { authority: attempt.authority, executionSettled: true, sourceWritesClosed: true, terminationId: 'native-stop' })
  h.complete(action, { applied: approved, proposalDigest: 'proposal', registryDigest: 'registry-after', commitSha: 'registry-commit', evidenceRef: '/native-approval', executionSettled: true, sourceWritesClosed: true })
  h.send({ type: 'drive' })
  if (approved) {
    assert.equal(h.actions('execute_owner').length, 1)
    assert.equal(view(h.state, 'wf1').status, 'waiting')
    assert.equal(h.state.workflows.wf1.registryBaseline.commitSha, 'registry-commit')
    assert.equal(h.state.workflows.wf1.pendingRegistry.phase, 'replan_required')
  } else {
    assert.equal(h.state.workflows.wf1.pendingRegistry, null)
    assert.equal(h.actions('execute_owner').length, 2)
    assert.equal(h.state.workflows.wf1.recoveryUsed, 0)
  }
  assert.equal(h.state.workflows.wf1.attempts[attempt.id].termination.executionSettled, true)
})

for (const approved of [true, false]) test(`Registry pending checkpoint ${approved ? 'approval' : 'rejection'} preserves failed planning and exact source lineage`, () => {
  const h = harness()
  h.send({ type: 'workflow.create', id: 'wf2', root: '/pending-project', rootSessionId: 'root-session', request: 'governance recovery', baseCommit: 'R8', baseBranch: 'main' })
  h.activate('wf2', plan())
  const r9 = { checkpointId: 'R9', snapshotDigest: 'snapshot-R9', sourceDigest: 'source-R9',
    codeBaseline: { sourceHead: 'R8', checkpointCommit: 'R9', branch: 'main' } }
  const planningId = h.send({ type: 'planning.request', workflowId: 'wf2', input: {
    parentVersion: 1, snapshotDigest: r9.snapshotDigest, previousSnapshotDigest: 'snapshot', sources: r9, revisionReason: 'R9 contract' } })
  const pending = structuredClone(h.state.workflows.wf2.pendingPlanning)
  const r10 = { checkpointId: 'R10', snapshotDigest: 'snapshot-R10', sourceDigest: 'source-R10',
    codeBaseline: { sourceHead: 'R8', checkpointCommit: 'R10', branch: 'main' } }
  const request = { type: 'registry.request', id: 'pending-governance', workflowId: 'wf2', root: '/pending-project', rootSessionId: 'root-session',
    proposal: { digest: 'proposal', reason: 'Add browser config scope' }, beforeExists: true, baseline: { head: 'R10', ref: 'refs/heads/main' }, planningSources: r10 }
  assert.throws(() => h.send(request), /Settle planning/)
  stoppedAction(h, h.state.actions[planningId])
  assert.throws(() => h.send({ ...request, planningSources: undefined }), /settled planning/)
  assert.throws(() => h.send({ ...request, baseline: { ...request.baseline, head: 'unbound' } }), /exact checkpoint/)
  assert.throws(() => h.send({ ...request, planningSources: { ...r10, codeBaseline: { ...r10.codeBaseline, sourceHead: 'unrelated' } } }), /source lineage/)
  const before = structuredClone(h.state.workflows.wf2)
  assert.equal(h.send(request), 'wf2'); assert.equal(h.send(request), 'wf2')
  const action = h.actions('change_registry').find(item => item.workflowId === 'wf2')
  assert.equal(action.input.supersededPlanning, undefined)
  assert.deepEqual(h.state.workflows.wf2.pendingPlanning, pending, 'an unapproved proposal does not replace the failed planning pointer')
  assert.deepEqual(h.state.workflows.wf2.planningSources, r9, 'pending sources are not promoted before approval')
  h.complete(action, { applied: approved, proposalDigest: 'proposal', registryDigest: 'registry-after', commitSha: 'registry-commit', evidenceRef: '/approval', executionSettled: true })
  const current = h.state.workflows.wf2
  assert.deepEqual(current.activation, before.activation)
  assert.equal(current.recoveryUsed, before.recoveryUsed)
  assert.equal(h.state.actions[planningId].status, 'failed')
  if (!approved) {
    assert.deepEqual(current.planningSources, r9); assert.deepEqual(current.pendingPlanning, pending)
    return
  }
  assert.deepEqual(current.planningSources, r10)
  assert.equal(current.registryBaseline.snapshotDigest, r10.snapshotDigest)
  assert.equal(current.registryBaseline.commitSha, 'registry-commit')
  assert.equal(current.pendingPlanning, null)
  const next = { ...r10, registryBaseline: current.registryBaseline, executionBaseline: current.registryBaseline }
  const replan = h.send({ type: 'planning.request', workflowId: 'wf2', input: { parentVersion: 1,
    snapshotDigest: next.snapshotDigest, sources: next, revisionReason: 'Compile the same approved R10 source with its Registry baseline' } })
  assert.equal(h.state.actions[replan].input.sources.checkpointId, 'R10')
  assert.equal(h.state.actions[replan].input.sources.executionBaseline.commitSha, 'registry-commit')
})

function isolatedFailure() {
  const h = harness(); const { action, attempt } = submit(h)
  h.send({ type: 'action.result', actionId: action.id, token: 'claim', result: { executionSettled: true, sourceWritesClosed: true, terminationId: 'owner-stopped', authority: attempt.authority } })
  h.complete(h.actions('seal_candidate')[0], { artifact: '/candidate', commitSha: 'content', authority: attempt.authority })
  const failed = h.actions('verify_candidate')[0]
  h.complete(failed, { passed: false, commitSha: 'content', executionSettled: true,
    results: [{ verificationId: 'unit', status: 'execution_error', passed: false, commitSha: 'content', commandTermination: { managedRangeStopped: true } }] })
  const retry = h.send({ type: 'action.retry', workflowId: 'wf1', actionId: failed.id, reason: 'Installation fixed', decisionRef: 'retry' })
  h.claim(h.state.actions[retry])
  h.time = attempt.deadlineAt + 1; h.send({ type: 'drive' })
  h.time += 30_001; h.send({ type: 'drive' })
  return { h, attempt: h.state.workflows.wf1.attempts[attempt.id], retry }
}
function isolationProof(h, attempt, retry) {
  return { contract: 'DSH_ISOLATED_ATTEMPT_V1', scope: 'project_write_authority', workflowId: 'wf1', attemptId: attempt.id,
    authority: attempt.authority, candidateCommit: 'content', stateBinding: engine.retirementStateBinding(h.state, 'wf1', attempt.id),
    retainedExecutionUnconfirmed: true, sharedTempEffectsUnconfirmed: true, protectedRoots: ['/project', '/candidate'],
    commands: [{ commandId: 'cmd-isolated', actionId: retry, attemptId: attempt.id, authority: attempt.authority,
      cwd: '/catalog/dependencies/key/installer', mode: 'workspace-write', bindingDigest: 'b'.repeat(64), intentRef: '/command/intent.json' }] }
}
test('one recovery window respects retired project authority without settling or releasing private quarantine', () => {
  const { h, attempt, retry } = isolatedFailure()
  const request = { type: 'recovery.request', workflowId: 'wf1', id: 'isolated-recovery', attempts: 1, reason: 'Bound project-only repair' }
  assert.throws(() => h.send(request), /must settle/)
  h.send({ type: 'attempt.retire_isolated', workflowId: 'wf1', attemptId: attempt.id,
    proof: isolationProof(h, attempt, retry), evidenceRef: '/retirement/proof.json' })
  const retained = structuredClone(h.state.workflows.wf1.attempts[attempt.id])
  const stop = structuredClone(h.actions('stop_execution')[0])
  h.send(request)
  const d = h.state.workflows.wf1.decisions[request.id]
  h.send({ type: 'decision.answer', workflowId: 'wf1', id: d.id, requestDigest: d.requestDigest,
    rootSessionId: 'root-session', evidenceRef: '/native-answer', answer: { answers: [{ id: d.id, selected: ['允许这轮恢复'] }] } })
  assert.deepEqual(h.state.workflows.wf1.attempts[attempt.id], retained)
  assert.deepEqual(h.state.actions[stop.id], stop)
  assert.equal(view(h.state, 'wf1').retainedExecutions[0].retainedCapacity, 1)
  assert.equal(h.actions('plan').length, 0)
})
for (const approved of [true, false]) test(`Registry ${approved ? 'approval' : 'rejection'} proceeds after project authority retirement while retaining unknown execution`, () => {
  const { h, attempt, retry } = isolatedFailure()
  const used = h.state.workflows.wf1.recoveryUsed
  const request = { type: 'registry.request', workflowId: 'wf1', id: 'retained-governance', root: '/project', rootSessionId: 'root-session',
    proposal: { digest: 'proposal', reason: 'Add one project tooling file' }, beforeExists: true, baseline: { head: 'base', ref: 'refs/heads/main' } }
  const unretired = transition(h.state, request, h.time).state
  const pending = Object.values(unretired.actions).find(item => item.kind === 'change_registry')
  assert.equal(dueActions(unretired, h.time).some(item => item.actionId === pending.id), false,
    'unconfirmed execution with project authority must block governance')
  const proof = isolationProof(h, h.state.workflows.wf1.attempts[attempt.id], retry)
  h.send({ type: 'attempt.retire_isolated', workflowId: 'wf1', attemptId: attempt.id, proof, evidenceRef: '/retirement/proof.json' })
  h.send(request)
  const action = h.actions('change_registry')[0]
  const retained = structuredClone(h.state.workflows.wf1.attempts[attempt.id])
  assert.equal(dueActions(h.state, h.time).some(item => item.actionId === action.id), true,
    'retained private execution must not prevent the native Registry decision from dispatching')
  h.complete(action, { applied: approved, proposalDigest: 'proposal', registryDigest: 'registry-after', commitSha: 'registry-commit',
    evidenceRef: '/native-approval', executionSettled: true, sourceWritesClosed: true })
  assert.deepEqual(h.state.workflows.wf1.attempts[attempt.id], retained)
  assert.equal(retained.quarantined, true)
  assert.equal(view(h.state, 'wf1').retainedExecutions[0].retainedCapacity, 1)
  assert.equal(h.state.workflows.wf1.recoveryUsed, used)
  assert.ok(!dueActions(h.state, h.time).some(item => item.actionId === retry))
})

test('isolated failed verification can repair the same task while old range and capacity remain quarantined', () => {
  const { h, attempt, retry } = isolatedFailure()
  const before = structuredClone(h.state.workflows.wf1)
  const proof = isolationProof(h, attempt, retry)
  h.send({ type: 'attempt.retire_isolated', workflowId: 'wf1', attemptId: attempt.id, proof, evidenceRef: '/retirement/proof.json' })
  assert.ok(!dueActions(h.state, h.time + 60_000).some(item => item.actionId === retry))
  assert.throws(() => h.send({ type: 'action.claim', actionId: retry, token: 'stale-observer', hostId: 'host', mode: 'observe' }), /Retired attempt/)
  assert.equal(h.state.workflows.wf1.attempts[attempt.id].quarantined, true)
  assert.equal(h.state.workflows.wf1.attempts[attempt.id].failure, 'termination_unconfirmed')
  assert.equal(h.state.workflows.wf1.recoveryUsed, before.recoveryUsed)
  assert.deepEqual(h.state.workflows.wf1.issues, before.issues)
  h.send({ type: 'task.retry', workflowId: 'wf1', taskId: 'T1', issueId: attempt.issueId,
    instructions: 'Reuse the preserved candidate after isolated execution retirement', decisionRef: 'repair-isolated' })
  h.send({ type: 'drive' })
  const current = h.state.workflows.wf1
  assert.notEqual(current.tasks.T1.attemptId, attempt.id)
  assert.equal(current.recoveryUsed, before.recoveryUsed + 1)
  assert.equal(current.attempts[attempt.id].quarantined, true)
  assert.equal(view(h.state, 'wf1').retainedExecutions[0].attemptId, attempt.id)
  assert.throws(() => h.send({ type: 'action.result', actionId: retry, token: 'claim', result: { passed: true } }), /Stopped|Stale|retired/)
  const stop = h.actions('stop_execution')[0]
  const wrongStopState = structuredClone(h.state), wrongStop = wrongStopState.actions[stop.id]
  wrongStop.input.attemptId = 'different-attempt'; wrongStop.inputDigest = kernelDigest(wrongStop.input)
  assert.throws(() => transition(wrongStopState, { type: 'action.claim', actionId: stop.id, token: 'wrong-stop', hostId: 'host', mode: 'observe' }, h.time + 60_000), /Stale attempt/)
  h.complete(stop, { executionSettled: true, sourceWritesClosed: true, terminationId: 'real-late-stop', authority: attempt.authority })
  assert.equal(h.state.workflows.wf1.attempts[attempt.id].quarantined, false)
  assert.equal(h.state.workflows.wf1.tasks.T1.attemptId, current.tasks.T1.attemptId)
})

test('isolated retirement rejects stale, missing, or unsafe proofs without changing control state', () => {
  for (const corrupt of [
    proof => { proof.stateBinding = 'stale' },
    proof => { proof.authority = 'other' },
    proof => { proof.candidateCommit = 'other' },
    proof => { proof.commands = [] },
    proof => { proof.commands[0].actionId = 'unrelated' },
    proof => { proof.commands[0].mode = 'unrestricted' },
    proof => { proof.retainedExecutionUnconfirmed = false },
    proof => { proof.protectedRoots = [] },
  ]) {
    const { h, attempt, retry } = isolatedFailure(), proof = isolationProof(h, attempt, retry)
    corrupt(proof); const before = structuredClone(h.state)
    assert.throws(() => h.send({ type: 'attempt.retire_isolated', workflowId: 'wf1', attemptId: attempt.id, proof, evidenceRef: '/proof' }))
    assert.deepEqual(h.state, before)
  }
})
test('retiring project locks does not free execution capacity or host resource locks', () => {
  const { h, attempt, retry } = isolatedFailure()
  h.state.parallel = 1
  attempt.locks.push('host:port:8999')
  const proof = isolationProof(h, attempt, retry)
  h.send({ type: 'attempt.retire_isolated', workflowId: 'wf1', attemptId: attempt.id, proof, evidenceRef: '/proof' })
  h.send({ type: 'task.retry', workflowId: 'wf1', taskId: 'T1', issueId: attempt.issueId, instructions: 'Repair', decisionRef: 'repair' })
  h.send({ type: 'drive' })
  assert.equal(h.state.workflows.wf1.tasks.T1.attemptId, null)
  assert.equal(view(h.state, 'wf1').retainedExecutions[0].retainedCapacity, 1)
  assert.ok(h.state.workflows.wf1.attempts[attempt.id].locks.includes('host:port:8999'))
  const stop = h.actions('stop_execution')[0]
  h.complete(stop, { executionSettled: true, sourceWritesClosed: true, terminationId: 'real-stop', authority: attempt.authority })
  h.send({ type: 'drive' })
  assert.ok(h.state.workflows.wf1.tasks.T1.attemptId)
})

test('observer lease renewal cannot invalidate a source-isolation proof, but changed command inputs can', () => {
  const { h, attempt, retry } = isolatedFailure(), stop = h.actions('stop_execution')[0]
  h.claim(stop)
  const proof = isolationProof(h, attempt, retry)
  h.time += 5_001
  h.send({ type: 'action.claim', actionId: stop.id, mode: 'observe', token: 'observer', hostId: 'host' })
  h.send({ type: 'action.observe', actionId: stop.id, token: 'observer', fact: 'running' })
  for (const mutate of [
    state => { state.actions[retry].input.changed = true; state.actions[retry].inputDigest = kernelDigest(state.actions[retry].input) },
    state => { state.actions[retry].stopRequested = false },
    state => { state.workflows.wf1.tasks.T1.definitionDigest = 'changed' },
    state => { state.workflows.wf1.attempts[attempt.id].candidate.commitSha = 'changed' },
    state => { state.workflows.wf1.attempts[attempt.id].writerTermination.authority = 'changed' },
    state => { state.workflows.wf1.attempts[attempt.id].quarantined = false },
  ]) {
    const changed = structuredClone(h.state); mutate(changed)
    const before = structuredClone(changed)
    assert.throws(() => transition(changed, { type: 'attempt.retire_isolated', workflowId: 'wf1', attemptId: attempt.id, proof, evidenceRef: '/proof' }, h.time))
    assert.deepEqual(changed, before)
  }
  h.send({ type: 'attempt.retire_isolated', workflowId: 'wf1', attemptId: attempt.id, proof, evidenceRef: '/proof' })
  assert.equal(h.state.workflows.wf1.attempts[attempt.id].quarantined, true)
})

test('stop lane owns settlement while stopped actions cannot be scheduled or claimed again', () => {
  const { h, attempt, retry } = isolatedFailure()
  const stop = h.actions('stop_execution')[0]
  assert.ok(dueActions(h.state, h.time).some(item => item.actionId === stop.id))
  assert.ok(!dueActions(h.state, h.time).some(item => item.actionId === retry))
  const projection = view(h.state, 'wf1').actions.find(item => item.id === retry)
  assert.equal(projection.nextWakeAt, null)
  assert.equal(projection.waiting.nextWakeAt, null)
  for (const mode of ['execute', 'observe']) assert.throws(() => h.send({ type: 'action.claim', actionId: retry,
    mode, token: 'revoked-claim', hostId: 'host' }), error => error.code === 'STOPPED_ACTION')
  h.state.actions[retry].nextWakeAt = h.time - 1000
  h.state.actions[stop.id].nextWakeAt = h.time + 50
  assert.equal(view(h.state, 'wf1').tasks.find(item => item.taskId === attempt.taskId).waiting.nextWakeAt, h.time + 50)
  h.time += 50
  h.complete(stop, { executionSettled: true, sourceWritesClosed: true, terminationId: 'real-stop', authority: attempt.authority })
  assert.equal(h.state.workflows.wf1.attempts[attempt.id].quarantined, false)
  assert.equal(h.state.actions[retry].status, 'cancelled')
})

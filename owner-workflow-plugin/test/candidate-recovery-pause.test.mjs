import { candidateIndependentDispatch, candidateIndependentNext, assertCandidateIndependentReservation } from '../src/candidate-independent-supervisor.mjs'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import test from 'node:test'
import { createConnection } from 'node:net'
import { promisify } from 'node:util'
import { plannerSubmitDefinition, planReviewSubmitDefinition } from '../index.js'
import { deriveWorkflowControl } from '../src/workflow-state.mjs'
import { discoverRunnableWorkflows } from '../src/external-runner.mjs'
import { createRecoverySessionFixture, readRecoverySessionState, mutateRecoverySessionState, reopenRecoverySessionFixture } from './fixtures/recovery-session-fixture.mjs'

const execFileAsync = promisify(execFile)

async function git(cwd, args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  return stdout.trim()
}

function drive(manifest, action = 'workflow-drive', fields = {}) {
  const { expectedCommand = 'plan-revision-drive', ...extra } = fields
  return new Promise((resolve, reject) => {
    const socket = createConnection(manifest.socketPath)
    let buffer = ''
    socket.setEncoding('utf8'); socket.setTimeout(20_000, () => socket.destroy(new Error('control socket timeout')))
    socket.on('connect', () => socket.write(`${JSON.stringify({ contract: 'DSH_WORKFLOW_CONTROL_V1', id: 'candidate-pause-test',
      workflowId: manifest.workflowId, token: manifest.token, action, ...extra, expectedCommand })}\n`))
    socket.on('data', chunk => {
      buffer += chunk
      const end = buffer.indexOf('\n')
      if (end < 0) return
      const response = JSON.parse(buffer.slice(0, end)); socket.destroy()
      if (response.ok) resolve(response.result); else reject(new Error(response.error))
    })
    socket.on('error', reject)
  })
}

function completedOwnerModel({ toolCallResponse, textResponse }) {
  return [
    toolCallResponse('candidate-pause-completed', 'owner_submit', { report: {
      contract: 'DSH_OWNER_RESULT_V1', status: 'completed', summary: 'Completed the independent candidate task.',
      changes: [], tests: [], handoffs: [], memory_updates: [],
    } }),
    textResponse('The completed result has been submitted.'),
    textResponse(JSON.stringify({
      contract: 'DSH_OWNER_MEMORY_CURATOR_V1', summary: 'No knowledge pages needed.', pages: [],
    })),
    textResponse(JSON.stringify({
      contract: 'DSH_OWNER_MEMORY_REVIEW_V1', status: 'passed', summary: 'Empty bundle is valid.', issues: [],
    })),
  ]
}

async function setup(t, limit = 1, { includeIndependentOwner = true, ownerModel = () => [] } = {}) {
  let plan
  const invalid = { contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_split', summary: 'Wrong target', issues: [], targetTaskIds: ['missing-task'] }
  const f = await createRecoverySessionFixture(t, { executable: true, includeIndependentOwner,
    limits: { totalLimit: limit, problemLimit: limit }, modelScript: m => [
      () => m.toolCallResponse('planner', 'workflow_plan_submit', { plan }), 'hang-slow',
      ...(limit === 3 ? [m.toolCallResponse('review-1', 'workflow_plan_review_submit', { review: invalid }), 'hang-slow',
        m.toolCallResponse('review-2', 'workflow_plan_review_submit', { review: invalid }), 'hang-slow'] : []),
      m.textResponse('Technical pause notice received.'), ...ownerModel(m),
    ] })
  f.ctx.tools.register(plannerSubmitDefinition(f.runtime)); f.ctx.tools.register(planReviewSubmitDefinition(f.runtime))
  const state = await readRecoverySessionState(f)
  plan = { ...structuredClone(state.plan), summary: 'Candidate for pause proof', owners: state.plan.owners.map(owner => ({ id: owner.id })) }
  const stage = state.plan.tasks[0], owner = state.plan.owners.find(item => item.id === stage.ownerId)
  await f.runtime.recordHandoffs(state, stage, { owner, branch: 'fixture-owner' }, { status: 'blocked',
    handoffs: [{ targetType: 'owner', targetOwnerId: owner.id, files: ['src/api/repair.mjs'], summary: 'Repair' }] })
  await f.runtime.replanHandoffs(f.admissionAgent, f.workflowId)
  f.manifest = await f.runtime.ensureControlBridge(f.admissionAgent, await readRecoverySessionState(f))
  t.after(() => f.runtime.closeControlBridge(f.workflowId))
  return f
}

test('T15 socket admission refusal with no independent task persists one notice, then daemon discovery and fresh Harness wait', { timeout: 30_000 }, async t => {
  const f = await setup(t, 1, { includeIndependentOwner: false })
  const before = await readRecoverySessionState(f)
  assert.equal((await discoverRunnableWorkflows(f.root)).length, 1)
  const paused = await drive(f.manifest)
  assert.equal(paused.action, 'candidate-recovery-paused')
  const state = await readRecoverySessionState(f)
  assert.deepEqual(state.pendingPlanRevision, before.pendingPlanRevision)
  assert.deepEqual(state.tasks, before.tasks); assert.deepEqual(state.ownerRuns, before.ownerRuns)
  assert.equal(state.recoveryAdmission.budget.totalUsed, 1)
  assert.equal(state.mainOutbox[paused.notificationId].actionRequired, false)
  assert.equal(deriveWorkflowControl(state).phase, 'candidate_recovery_report_pending')
  assert.equal((await discoverRunnableWorkflows(f.root))[0].command, 'plan-revision-drive')
  assert.equal((await drive(f.manifest)).action, 'candidate-recovery-notified')
  await f.admissionAgent.whenIdle(); await f.ctx.sessions.flush(f.admissionAgent.session)
  assert.ok((await f.readRaw(f.admissionAgent.id)).content.includes(paused.notificationId))
  const calls = f.adapter.requests.length
  for (let index = 0; index < 3; index++) {
    assert.equal((await drive(f.manifest)).action, 'waiting')
    assert.deepEqual(await discoverRunnableWorkflows(f.root), [])
  }
  assert.equal(f.adapter.requests.length, calls)
  await mutateRecoverySessionState(f, current => {
    current.updatedAt = '2099-01-01T00:00:00Z'
    current.pendingPlanRevision.createdAt = '2099-01-01T00:00:00Z'
  })
  assert.equal(deriveWorkflowControl(await readRecoverySessionState(f)).phase, 'candidate_recovery_paused')
  await f.runtime.closeControlBridge(f.workflowId)
  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try {
    const manifest = await fresh.runtime.ensureControlBridge(fresh.admissionAgent, await readRecoverySessionState(f))
    assert.equal((await drive(manifest)).phase, 'candidate_recovery_paused')
    assert.deepEqual(await discoverRunnableWorkflows(f.root), [])
    assert.equal(fresh.adapter.requests.length, 0)
    assert.equal(Object.keys((await readRecoverySessionState(f)).mainOutbox).length, 1)
    await fresh.runtime.closeControlBridge(f.workflowId)
  } finally { await fresh.dispose() }
})

test('T15 socket preserves finite semantic retry ordinals and only persists pause when the shared budget refuses', { timeout: 30_000 }, async t => {
  const f = await setup(t, 3)
  for (let used = 2; used <= 3; used++) {
    assert.equal((await drive(f.manifest)).action, 'candidate-recovery-retry-ready')
    const state = await readRecoverySessionState(f)
    assert.equal(state.recoveryAdmission.budget.totalUsed, used)
    assert.equal(state.candidateRecoveryPause, undefined)
    assert.equal(state.recoveryAdmission.budget.attempts.at(-1).result.status, 'failed')
  }
  const calls = f.adapter.requests.length
  assert.equal((await drive(f.manifest)).action, 'candidate-recovery-paused')
  assert.equal(f.adapter.requests.length, calls)
  assert.equal(Object.keys((await readRecoverySessionState(f)).mainOutbox).length, 1)
})

test('T15 changed candidate evidence invalidates the prior pause but cannot start an unbound Reviewer', { timeout: 30_000 }, async t => {
  const f = await setup(t)
  const paused = await drive(f.manifest)
  await mutateRecoverySessionState(f, state => { state.pendingPlanRevision.parent += 1 })
  const control = deriveWorkflowControl(await readRecoverySessionState(f))
  assert.equal(control.command, 'plan-revision-drive')
  assert.notEqual(control.phase, 'candidate_recovery_report_pending')
  const calls = f.adapter.requests.length
  const changed = await drive(f.manifest)
  assert.equal(changed.action, 'candidate-recovery-paused')
  assert.notEqual(changed.notificationId, paused.notificationId)
  assert.equal(f.adapter.requests.length, calls)
})

test('T15 an authoritative user-wait task projection takes priority over a candidate technical pause', { timeout: 30_000 }, async t => {
  const f = await setup(t)
  await drive(f.manifest)
  await mutateRecoverySessionState(f, state => { state.tasks.find(task => task.taskId === 'T1').action = 'await_user' })
  const control = deriveWorkflowControl(await readRecoverySessionState(f))
  assert.equal(control.phase, 'awaiting_main_discussion')
  assert.equal(control.actionRequired, true)
  const calls = f.adapter.requests.length
  assert.equal((await drive(f.manifest)).action, 'waiting')
  assert.equal(f.adapter.requests.length, calls)
})

for (const [field, change] of [
  ['parent', candidate => { candidate.parent += 1 }],
  ['review', candidate => { candidate.review = { status: 'needs_revision', summary: 'Concurrent review' } }],
  ['plan content', candidate => { candidate.plan.summary = 'Concurrent candidate content' }],
]) {
  test(`T15 stale admission failure cannot pause a concurrently changed candidate ${field}`, { timeout: 30_000 }, async t => {
    const f = await setup(t)
    const pause = f.runtime.pauseCandidateRecovery.bind(f.runtime)
    let reached = false
    f.runtime.pauseCandidateRecovery = async (...args) => {
      reached = true
      await mutateRecoverySessionState(f, state => change(state.pendingPlanRevision))
      return pause(...args)
    }
    const calls = f.adapter.requests.length
    assert.equal((await drive(f.manifest)).action, 'state-changed')
    assert.equal(reached, true)
    const state = await readRecoverySessionState(f)
    assert.equal(state.candidateRecoveryPause, undefined)
    assert.equal(Object.keys(state.mainOutbox ?? {}).length, 0)
    assert.equal(state.recoveryAdmission.budget.totalUsed, 1)
    assert.equal(f.adapter.requests.length, calls)
  })
}

test('T15 first uncertain real Reviewer creation persists pause despite its own new operation and session', { timeout: 30_000 }, async t => {
  const f = await setup(t, 2)
  const before = await readRecoverySessionState(f)
  const create = f.ctx.agents.create.bind(f.ctx.agents)
  let creates = 0
  f.ctx.agents.create = async (...args) => {
    creates++
    await create(...args)
    throw new Error('Injected lost response after real Reviewer creation')
  }
  const calls = f.adapter.requests.length
  assert.equal((await drive(f.manifest)).action, 'candidate-recovery-paused')
  const state = await readRecoverySessionState(f)
  assert.deepEqual(state.pendingPlanRevision, before.pendingPlanRevision)
  assert.equal(creates, 1)
  assert.equal(f.adapter.requests.length, calls)
  assert.equal(state.recoveryAdmission.budget.totalUsed, 2)
  const review = Object.values(state.candidateReviews)[0]
  assert.equal(state.replanSessions[review.requestId].phase, 'creating')
  assert.equal(Object.keys(state.mainOutbox).length, 1)
  f.ctx.agents.create = create
  await assert.rejects(f.runtime.reviewPendingPlanRevision(f.admissionAgent), /暂停/)
  assert.equal(f.adapter.requests.length, calls)
})

async function notifiedPause(t, options = {}) {
  const f = await setup(t, 1, options)
  await drive(f.manifest)
  await drive(f.manifest)
  await f.admissionAgent.whenIdle()
  await f.ctx.sessions.flush(f.admissionAgent.session)
  return f
}

test('T15 a delivered candidate pause with an obsolete Review digest cannot discover, drive, or reserve work', { timeout: 30_000 }, async t => {
  const f = await notifiedPause(t)
  const before = await readRecoverySessionState(f)
  const receipt = candidateIndependentNext(before)
  const calls = f.adapter.requests.length
  const changed = await mutateRecoverySessionState(f, state => { state.planReviewDigest = 'obsolete-review-digest' })

  const dispatch = candidateIndependentDispatch(changed)
  assert.equal(dispatch.action, 'wait')
  assert.match(dispatch.reason, /有效审查和批准/)
  assert.deepEqual(await discoverRunnableWorkflows(f.root), [])
  const waited = await drive(f.manifest, 'workflow-drive', { expectedCommand: 'candidate-independent-drive' })
  assert.equal(waited.action, 'waiting')
  assert.equal(waited.phase, 'candidate_recovery_paused')
  await assert.rejects(f.runtime.reserveCandidateIndependentTasks(f.admissionAgent, f.workflowId, receipt.actionId), /有效审查和批准/)
  assert.deepEqual(await readRecoverySessionState(f), changed)
  assert.equal(f.adapter.requests.length, calls)
})

for (const [field, revoke] of [
  ['approval', state => { state.planApproved = false }],
  ['Review result', state => { state.planReview = { ...state.planReview, status: 'needs_revision' } }],
]) {
  test(`T15 a ${field} change between candidate dispatch and reserve rejects the latest transaction without target writes`, { timeout: 30_000 }, async t => {
    const f = await notifiedPause(t)
    const before = await readRecoverySessionState(f)
    assert.equal(candidateIndependentDispatch(before).action, 'create')
    const calls = f.adapter.requests.length
    const originalReserve = f.runtime.reserveCandidateIndependentTasks.bind(f.runtime)
    let changed
    let injected = false
    f.runtime.reserveCandidateIndependentTasks = async (...args) => {
      if (!injected) {
        injected = true
        changed = await mutateRecoverySessionState(f, revoke)
      }
      return originalReserve(...args)
    }

    await assert.rejects(
      drive(f.manifest, 'workflow-drive', { expectedCommand: 'candidate-independent-drive' }),
      /有效审查和批准/,
    )
    assert.equal(injected, true)
    const after = await readRecoverySessionState(f)
    assert.deepEqual(after, changed)
    assert.equal(after.ownerRuns['T2:worker'], undefined)
    assert.equal(after.supervisorOutbox?.['T2:worker'], undefined)
    assert.deepEqual(after.tasks.find(task => task.taskId === 'T2'), before.tasks.find(task => task.taskId === 'T2'))
    assert.equal(f.adapter.requests.length, calls)
  })
}

test('T15 a live Registry drift after independent claim pauses only that reservation before an Owner exists', { timeout: 30_000 }, async t => {
  const f = await notifiedPause(t)
  const before = await readRecoverySessionState(f)
  assert.equal(candidateIndependentDispatch(before).action, 'create')
  const source = before.candidateRecoveryPause.source
  const calls = f.adapter.requests.length
  const originalRunExternalOwner = f.runtime.runExternalOwner.bind(f.runtime)
  let claimed = false
  f.runtime.runExternalOwner = async (...args) => {
    if (!claimed) {
      claimed = true
      const launching = await readRecoverySessionState(f)
      assert.equal(launching.supervisorOutbox['T2:worker'].status, 'launching')
      assert.equal(launching.ownerRuns['T2:worker'], undefined)
      await mutateRecoverySessionState(f, state => { state.registryDigest = '0'.repeat(64) })
    }
    return originalRunExternalOwner(...args)
  }

  const driven = await drive(f.manifest, 'workflow-drive', { expectedCommand: 'candidate-independent-drive' })
  assert.equal(claimed, true)
  assert.equal(driven.action, 'candidate-independent-driven')
  assert.equal(driven.outcome, 'paused')
  assert.match(driven.reason, /Registry.*漂移/)

  const after = await readRecoverySessionState(f)
  const task = after.tasks.find(item => item.taskId === 'T2')
  const reservation = after.supervisorOutbox['T2:worker']
  assert.equal(after.candidateRecoveryPause.source, source)
  assert.deepEqual(after.pendingPlanRevision, before.pendingPlanRevision)
  assert.deepEqual(after.recoveryAdmission.budget, before.recoveryAdmission.budget)
  assert.equal(after.status, before.status)
  assert.equal(after.error, before.error)
  assert.equal(after.ownerRuns['T2:worker'], undefined)
  assert.equal(reservation.status, 'stopped')
  assert.match(reservation.error, /Registry.*漂移/)
  assert.equal(task.status, 'stopped')
  assert.equal(task.executorId, null)
  assert.equal(task.reason, 'runtime_failed')
  assert.equal(task.action, 'retry_runtime')
  assert.equal(after.supervisorEvents.at(-1).type, 'supervisor.candidate-independent-paused')
  assert.equal(f.adapter.requests.length, calls)

  const paused = structuredClone(after)
  for (let index = 0; index < 2; index++) {
    assert.deepEqual(await discoverRunnableWorkflows(f.root), [])
    assert.equal((await drive(f.manifest, 'workflow-drive', { expectedCommand: 'candidate-independent-drive' })).action, 'waiting')
  }
  assert.deepEqual(await readRecoverySessionState(f), paused)
  assert.equal(f.adapter.requests.length, calls)
})

test('T15 daemon discovery drives one independent candidate through socket verification, merge, and terminal quiescence', { timeout: 45_000 }, async t => {
  const f = await notifiedPause(t, { ownerModel: completedOwnerModel })
  const before = await readRecoverySessionState(f)
  const independent = candidateIndependentDispatch(before)
  assert.equal(independent.action, 'create')
  assert.deepEqual((await discoverRunnableWorkflows(f.root)).map(item => item.command), ['candidate-independent-drive'])
  const calls = f.adapter.requests.length
  const originalStream = f.adapter.stream.bind(f.adapter)
  let concurrent
  f.adapter.stream = async function* (options) {
    if (concurrent === undefined && options.tools?.some(tool => tool.name === 'owner_submit')) {
      concurrent = await drive(f.manifest, 'workflow-drive', { expectedCommand: 'candidate-independent-drive' })
    }
    yield* originalStream(options)
  }

  const obsolete = await drive(f.manifest)
  assert.equal(obsolete.action, 'state-changed')
  assert.equal(obsolete.command, 'candidate-independent-drive')
  assert.equal(f.adapter.requests.length, calls)
  const driven = await drive(f.manifest, 'workflow-drive', { expectedCommand: 'candidate-independent-drive' })
  assert.equal(driven.action, 'candidate-independent-driven')
  assert.equal(driven.outcome, 'completed', driven.reason)
  assert.equal(concurrent.action, 'waiting')
  assert.equal(f.adapter.requests.length, calls + 4)

  const after = await readRecoverySessionState(f)
  const task = after.tasks.find(item => item.taskId === 'T2')
  const owner = after.ownerRuns['T2:worker']
  assert.equal(task.status, 'completed')
  assert.equal(task.verificationResults.unit.passed, true)
  assert.equal(task.verificationResults.unit.exitCode, 0)
  assert.equal(owner.status, 'completed')
  assert.equal(after.supervisorOutbox['T2:worker'].status, 'completed')
  assert.equal(await git(after.workflowWorktree, ['rev-parse', 'HEAD']), after.workflowHead)
  await git(after.workflowWorktree, ['merge-base', '--is-ancestor', owner.result.commitSha, after.workflowHead])
  assert.equal(after.recoveryAdmission.budget.totalUsed, before.recoveryAdmission.budget.totalUsed)
  assert.deepEqual(await discoverRunnableWorkflows(f.root), [])
})

test('T15 fresh Harness resumes a persisted candidate reservation with no Owner history', { timeout: 45_000 }, async t => {
  const f = await notifiedPause(t)
  const before = await readRecoverySessionState(f)
  const dispatch = candidateIndependentDispatch(before)
  assert.equal(dispatch.action, 'create')
  const reserved = await f.runtime.reserveCandidateIndependentTasks(f.admissionAgent, f.workflowId, dispatch.actionId)
  assert.equal(reserved.replay, false)
  assert.equal((await readRecoverySessionState(f)).ownerRuns['T2:worker'], undefined)
  assert.equal(candidateIndependentDispatch(await readRecoverySessionState(f)).action, 'reserved')
  const calls = f.adapter.requests.length
  await f.runtime.closeControlBridge(f.workflowId)
  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId, modelScript: completedOwnerModel })
  try {
    const manifest = await fresh.runtime.ensureControlBridge(fresh.admissionAgent, await readRecoverySessionState(fresh))
    assert.deepEqual((await discoverRunnableWorkflows(f.root)).map(item => item.command), ['candidate-independent-drive'])
    const driven = await drive(manifest, 'workflow-drive', { expectedCommand: 'candidate-independent-drive' })
    assert.equal(driven.action, 'candidate-independent-driven')
    assert.equal(driven.outcome, 'completed', driven.reason)
    const after = await readRecoverySessionState(fresh)
    assert.equal(after.tasks.find(task => task.taskId === 'T2').status, 'completed')
    assert.equal(after.ownerRuns['T2:worker'].status, 'completed')
    assert.equal(after.supervisorOutbox['T2:worker'].status, 'completed')
    assert.equal(f.adapter.requests.length, calls)
    assert.equal(fresh.adapter.requests.length, 4)
    assert.deepEqual(await discoverRunnableWorkflows(f.root), [])
    await fresh.runtime.closeControlBridge(f.workflowId)
  } finally { await fresh.dispose() }
})

for (const scenario of ['launching', 'unknown Owner history']) test(`T15 fresh Harness leaves candidate ${scenario} as a stable non-dispatch wait`, { timeout: 45_000 }, async t => {
  const f = await notifiedPause(t)
  if (scenario === 'launching') {
    const receipt = candidateIndependentDispatch(await readRecoverySessionState(f))
    const reserved = await f.runtime.reserveCandidateIndependentTasks(f.admissionAgent, f.workflowId, receipt.actionId)
    await mutateRecoverySessionState(f, state => {
      state.supervisorOutbox['T2:worker'] = { ...reserved.reservations[0], status: 'launching' }
    })
  } else {
    await mutateRecoverySessionState(f, state => {
      state.ownerRuns['T2:worker'] = { status: 'failed', ownerId: 'worker', stageId: 'T2', planDigest: state.planDigest }
    })
  }
  const before = await readRecoverySessionState(f)
  assert.equal(candidateIndependentDispatch(before).action, 'wait')
  await f.runtime.closeControlBridge(f.workflowId)
  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId, modelScript: () => [] })
  try {
    const manifest = await fresh.runtime.ensureControlBridge(fresh.admissionAgent, await readRecoverySessionState(fresh))
    assert.deepEqual(await discoverRunnableWorkflows(f.root), [])
    assert.equal((await drive(manifest, 'workflow-drive', { expectedCommand: 'candidate-independent-drive' })).action, 'waiting')
    assert.equal(fresh.adapter.requests.length, 0)
    assert.deepEqual(await readRecoverySessionState(fresh), before)
    await fresh.runtime.closeControlBridge(f.workflowId)
  } finally { await fresh.dispose() }
})

test('T15 independent reservation atomically patches only its task and survives concurrent replay and fresh Harness', { timeout: 30_000 }, async t => {
  const f = await notifiedPause(t)
  await mutateRecoverySessionState(f, state => { state.tasks.find(task => task.taskId === 'T2').customEvidence = 'preserve me' })
  const before = await readRecoverySessionState(f)
  const receipt = candidateIndependentNext(before)
  const calls = f.adapter.requests.length
  const results = await Promise.all([0, 1].map(() => f.runtime.reserveCandidateIndependentTasks(f.admissionAgent, f.workflowId, receipt.actionId)))
  assert.deepEqual(results.map(result => result.replay).sort(), [false, true])
  assert.deepEqual(results[0].reservations, results[1].reservations)
  const state = await readRecoverySessionState(f)
  for (const key of ['status', 'error', 'plan', 'planDigest', 'pendingPlanRevision', 'candidateRecoveryPause', 'handoffQueue',
    'handoffReplans', 'candidateReviews', 'replanSessions', 'recoveryAdmission', 'mainOutbox', 'ownerRuns', 'config']) {
    assert.deepEqual(state[key], before[key], key)
  }
  assert.deepEqual(state.tasks.find(task => task.taskId === 'T1'), before.tasks.find(task => task.taskId === 'T1'))
  const independent = state.tasks.find(task => task.taskId === 'T2')
  assert.equal(independent.status, 'running')
  assert.equal(independent.customEvidence, 'preserve me')
  const reservation = results[0].reservations[0]
  assert.equal(independent.executorId, reservation.reservationId)
  assertCandidateIndependentReservation(state, reservation)
  assert.equal(Object.keys(state.supervisorOutbox).length, 1)
  assert.equal(state.supervisorEvents.filter(event => event.type === 'supervisor.candidate-independent-reserved').length, 1)
  assert.equal(f.adapter.requests.length, calls)
  await assert.rejects(f.runtime.runSupervisorReservation(f.admissionAgent, f.workflowId, 'T2:worker'), /生命周期尚未接线/)
  await assert.rejects(f.runtime.runProtectedSupervisorReservation(f.admissionAgent, f.workflowId, 'T2:worker'), /生命周期尚未接线/)
  f.runtime.queueSupervisorReservations(f.admissionAgent, f.workflowId, ['T2:worker'])
  await f.runtime.supervisorDispatches.get(`${f.workflowId}:T2:worker`)
  assert.deepEqual(await readRecoverySessionState(f), state)
  const fresh = await reopenRecoverySessionFixture({ root: f.root, workflowId: f.workflowId })
  try {
    const replay = await fresh.runtime.reserveCandidateIndependentTasks(fresh.admissionAgent, f.workflowId, receipt.actionId)
    assert.equal(replay.replay, true)
    assert.deepEqual(replay.reservations, results[0].reservations)
    assert.equal(fresh.adapter.requests.length, 0)
  } finally { await fresh.dispose() }
})

test('T15 candidate replacement invalidates persisted reservation replay', { timeout: 30_000 }, async t => {
  const f = await notifiedPause(t)
  const receipt = candidateIndependentNext(await readRecoverySessionState(f))
  const result = await f.runtime.reserveCandidateIndependentTasks(f.admissionAgent, f.workflowId, receipt.actionId)
  await mutateRecoverySessionState(f, state => { state.pendingPlanRevision.parent += 1 })
  const changed = await readRecoverySessionState(f)
  assert.throws(() => assertCandidateIndependentReservation(changed, result.reservations[0]), /绑定失效/)
  await assert.rejects(f.runtime.reserveCandidateIndependentTasks(f.admissionAgent, f.workflowId, receipt.actionId), /绑定失效/)
  assert.deepEqual(await readRecoverySessionState(f), changed)
})

test('T15 a stale create action cannot overwrite a newly arrived Owner history', { timeout: 30_000 }, async t => {
  const f = await notifiedPause(t)
  const receipt = candidateIndependentNext(await readRecoverySessionState(f))
  await mutateRecoverySessionState(f, state => { state.ownerRuns['T2:worker'] = { status: 'failed', ownerId: 'worker' } })
  const changed = await readRecoverySessionState(f)
  await assert.rejects(f.runtime.reserveCandidateIndependentTasks(f.admissionAgent, f.workflowId, receipt.actionId), /已过期/)
  assert.deepEqual(await readRecoverySessionState(f), changed)
})

test('T15 candidate replacement before reservation rejects the stale create action without task writes', { timeout: 30_000 }, async t => {
  const f = await notifiedPause(t)
  const receipt = candidateIndependentNext(await readRecoverySessionState(f))
  await mutateRecoverySessionState(f, state => { state.pendingPlanRevision.parent += 1 })
  const changed = await readRecoverySessionState(f)
  await assert.rejects(f.runtime.reserveCandidateIndependentTasks(f.admissionAgent, f.workflowId, receipt.actionId), /有效候选暂停/)
  assert.deepEqual(await readRecoverySessionState(f), changed)
})

test('T15 public and direct Owner entry points cannot bypass a candidate reservation', { timeout: 30_000 }, async t => {
  const f = await notifiedPause(t)
  const action = candidateIndependentNext(await readRecoverySessionState(f))
  await f.runtime.reserveCandidateIndependentTasks(f.admissionAgent, f.workflowId, action.actionId)
  const before = await readRecoverySessionState(f)
  const calls = f.adapter.requests.length
  for (const action of ['owner-sync', 'run-owner', 'owner-finish']) {
    await assert.rejects(drive(f.manifest, action, { stageId: 'T2', ownerId: 'worker' }), /V2 工作流拒绝 legacy 控制动作/)
  }
  for (const name of ['runExternalOwner', 'recoverOwner', 'recoverOwnerWithAdmission', 'finishOwner']) {
    await assert.rejects(f.runtime[name](f.admissionAgent, f.workflowId, 'T2', 'worker'), /生命周期尚未接线/)
  }
  assert.equal(f.adapter.requests.length, calls)
  assert.equal((await readRecoverySessionState(f)).ownerRuns['T2:worker'], undefined)
  assert.deepEqual(await readRecoverySessionState(f), before)
})

for (const status of ['stopped', 'completed']) {
  test(`T15 reservation replay rejects persisted ${status} task before neutralizing its projection`, { timeout: 30_000 }, async t => {
    const f = await notifiedPause(t)
    const receipt = candidateIndependentNext(await readRecoverySessionState(f))
    await f.runtime.reserveCandidateIndependentTasks(f.admissionAgent, f.workflowId, receipt.actionId)
    await mutateRecoverySessionState(f, state => {
      const task = state.tasks.find(task => task.taskId === 'T2')
      Object.assign(task, { status, executorId: null, reason: status === 'stopped' ? 'runtime_failed' : null,
        action: status === 'stopped' ? 'retry_runtime' : null })
    })
    const changed = await readRecoverySessionState(f)
    await assert.rejects(f.runtime.reserveCandidateIndependentTasks(f.admissionAgent, f.workflowId, receipt.actionId), /任务状态矛盾/)
    assert.deepEqual(await readRecoverySessionState(f), changed)
  })
}

test('T15 Owner startup rechecks a reservation arriving after its initial read', { timeout: 30_000 }, async t => {
  const f = await notifiedPause(t)
  const receipt = candidateIndependentNext(await readRecoverySessionState(f))
  await f.runtime.reserveCandidateIndependentTasks(f.admissionAgent, f.workflowId, receipt.actionId)
  const reserved = await readRecoverySessionState(f)
  await mutateRecoverySessionState(f, state => {
    delete state.supervisorOutbox['T2:worker']
    Object.assign(state.tasks.find(task => task.taskId === 'T2'), { status: 'pending', executorId: null })
  })
  const lock = f.runtime.withWorkflowLock.bind(f.runtime)
  let inserted = false
  f.runtime.withWorkflowLock = async (workflowId, operation) => {
    if (!inserted && workflowId === f.workflowId) {
      inserted = true
      await mutateRecoverySessionState(f, state => {
        state.supervisorOutbox['T2:worker'] = reserved.supervisorOutbox['T2:worker']
        Object.assign(state.tasks.find(task => task.taskId === 'T2'), reserved.tasks.find(task => task.taskId === 'T2'))
      })
    }
    return lock(workflowId, operation)
  }
  const calls = f.adapter.requests.length
  await assert.rejects(f.runtime.runExternalOwner(f.admissionAgent, f.workflowId, 'T2', 'worker'), /生命周期尚未接线/)
  assert.equal(inserted, true)
  const state = await readRecoverySessionState(f)
  assert.equal(state.ownerRuns['T2:worker'], undefined)
  assert.deepEqual(state.tasks, reserved.tasks)
  assert.deepEqual(state.supervisorOutbox, reserved.supervisorOutbox)
  assert.equal(f.adapter.requests.length, calls)
})

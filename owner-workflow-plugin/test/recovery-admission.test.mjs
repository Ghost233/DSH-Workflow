import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { fork } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import test from 'node:test'
import {
  PLAN_V2_CONTRACT,
  STATE_CONTRACT,
  normalizePlanV2,
} from '../src/model.mjs'
import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'
import { createTaskState } from '../src/supervisor.mjs'
import { startRecoveryAttempt, settleRecoveryAttempt } from '../src/recovery-budget.mjs'

const execFileAsync = promisify(execFile)
const WORKER = new URL('./fixtures/recovery-admission-worker.mjs', import.meta.url)

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function git(root, args) {
  await execFileAsync('git', args, { cwd: root, encoding: 'utf8' })
}

function recoveryConfig(planDigest, { totalLimit = 3, problemLimit = 2 } = {}) {
  return {
    contract: 'DSH_RECOVERY_ADMISSION_CONFIG_V1',
    executionVersion: planDigest,
    totalLimit,
    problemLimit,
  }
}

function recoveryRecord(taskId, ownerId, planDigest, {
  status = 'failed',
  attempt = 2,
  sessionId = `${taskId}-${ownerId}-failed-session`,
  strategy = 'diagnose',
} = {}) {
  return {
    status,
    taskId,
    stageId: taskId,
    ownerId,
    attempt,
    sessionId,
    planDigest,
    error: 'Owner tool schema did not match the runtime contract',
    autonomousRecovery: {
      contract: 'DSH_AUTONOMOUS_RECOVERY_V1',
      failureClass: 'contract_dag',
      strategy,
      message: 'Owner tool schema did not match the runtime contract',
      evidenceDigest: 'e'.repeat(64),
      usedStrategies: [strategy],
      updatedAt: '2026-09-11T00:00:00.000Z',
    },
  }
}

function planFixture() {
  return normalizePlanV2({
    contract: PLAN_V2_CONTRACT,
    registryDigest: 'a'.repeat(64),
    summary: 'T20 recovery admission integration fixture',
    owners: [
      { id: 'api', name: 'API Owner', description: 'Owns API sources', scope: ['src/api/**'], exclude: [] },
      { id: 'worker', name: 'Worker Owner', description: 'Owns worker sources', scope: ['src/worker/**'], exclude: [] },
    ],
    verifications: [{ id: 'unit', run: ['node', '--test'] }],
    tasks: [
      {
        id: 'T1', role: 'work', ownerId: 'api', title: 'Repair API', dependsOn: [],
        write: ['src/api/repair.mjs'], verify: ['unit'], done: ['API repair is verified'],
      },
      {
        id: 'T2', role: 'work', ownerId: 'worker', title: 'Repair worker', dependsOn: [],
        write: ['src/worker/repair.mjs'], verify: ['unit'], done: ['Worker repair is verified'],
      },
    ],
  })
}

function recoveryTaskState(plan, taskId, strategy) {
  return createTaskState(plan).map(task => task.taskId !== taskId ? task : {
    ...task,
    status: 'pending',
    reason: null,
    action: null,
    autonomousRecovery: {
      contract: 'DSH_AUTONOMOUS_RECOVERY_V1',
      failureClass: 'contract_dag',
      strategy,
    },
  })
}

async function createFixture(t, { limits, workflowId = 'wf-recovery-admission' } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-t20-tests-recovery-admission-')))
  t.after(async () => {
    await chmod(root, 0o700).catch(() => undefined)
    await chmod(join(root, '.dsh-workflow'), 0o700).catch(() => undefined)
    await chmod(join(root, '.dsh-workflow', 'workflows'), 0o700).catch(() => undefined)
    await rm(root, { recursive: true, force: true, maxRetries: 3 })
  })
  await git(root, ['init', '-q', '-b', 'main'])
  await git(root, ['config', 'user.email', 'recovery-admission@test.invalid'])
  await git(root, ['config', 'user.name', 'Recovery Admission Test'])
  await writeFile(join(root, 'README.md'), 'recovery admission fixture\n', 'utf8')
  await git(root, ['add', 'README.md'])
  await git(root, ['commit', '-qm', 'fixture'])
  const baseHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })).stdout.trim()

  const runtime = createOwnerWorkflowRuntime({ agents: { get: () => undefined } }, {})
  await runtime.prepareRoot(root)
  const plan = planFixture()
  const planDigest = digest(plan)
  const ownerRuns = {
    'T1:api': recoveryRecord('T1', 'api', planDigest),
    'T2:worker': recoveryRecord('T2', 'worker', planDigest, {
      status: 'blocked', attempt: 1, sessionId: null,
    }),
  }
  const state = {
    contract: STATE_CONTRACT,
    id: workflowId,
    root,
    baseBranch: 'main',
    baseRef: 'main',
    baseHead,
    workflowBranch: `dsh/workflow/${workflowId}`,
    workflowWorktree: root,
    request: 'exercise the persisted recovery-admission contract',
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
    status: 'running',
    attempt: 1,
    revision: 0,
    ownerRuns,
    ownerSessions: {},
    plan,
    planDigest,
    planReview: {
      contract: 'DSH_PLAN_REVIEW_V1',
      status: 'passed',
      summary: 'The exact plan digest was independently reviewed.',
      issues: [],
      planDigest,
    },
    planReviewDigest: planDigest,
    planApproved: true,
    planApprovedAt: '2026-09-11T00:00:00.000Z',
    planApprovedBy: 'recovery-admission-test',
    tasks: recoveryTaskState(plan, 'T1', 'diagnose').map(task => task.taskId !== 'T2' ? task : {
      ...task,
      status: 'pending',
      reason: null,
      action: null,
      autonomousRecovery: {
        contract: 'DSH_AUTONOMOUS_RECOVERY_V1',
        failureClass: 'contract_dag',
        strategy: 'diagnose',
      },
    }),
    recoveryAdmissionConfig: recoveryConfig(planDigest, limits),
  }
  await writeState(root, workflowId, state)
  return {
    root,
    runtime,
    workflowId,
    planDigest,
    agent: {
      id: 'recovery-admission-test-agent',
      session: { id: 'recovery-admission-test-session', header: { cwd: root } },
    },
  }
}

function statePath(root, workflowId) {
  return join(root, '.dsh-workflow', 'workflows', `${workflowId}.json`)
}

async function readState(root, workflowId) {
  return JSON.parse(await readFile(statePath(root, workflowId), 'utf8'))
}

async function writeState(root, workflowId, state) {
  const path = statePath(root, workflowId)
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function mutateState(fixture, mutate) {
  const state = await readState(fixture.root, fixture.workflowId)
  await mutate(state)
  await writeState(fixture.root, fixture.workflowId, state)
  return state
}

function ownerRequest(fixture, {
  taskId = 'T1', ownerId = 'api', source,
} = {}) {
  const record = source ?? (taskId === 'T1'
    ? { kind: 'owner_failure', attempt: 2, sessionId: 'T1-api-failed-session' }
    : { kind: 'owner_failure', attempt: 1, sessionId: null })
  return {
    contract: 'DSH_RECOVERY_ADMISSION_REQUEST_V1',
    planDigest: fixture.planDigest,
    taskId,
    ownerId,
    source: record,
  }
}

function obligationRequest(fixture, id = 'technical-api-obligation') {
  return {
    contract: 'DSH_RECOVERY_ADMISSION_REQUEST_V1',
    planDigest: fixture.planDigest,
    taskId: 'T1',
    ownerId: 'api',
    source: { kind: 'obligation', id },
  }
}

function convergenceFor(planDigest, obligation) {
  return {
    contract: 'DSH_WORKFLOW_CONVERGENCE_V1',
    nextStrategy: 'same_owner_repair',
    history: [{ candidatePlanDigest: planDigest }],
    obligations: [obligation],
  }
}

function technicalObligation(planDigest, {
  id = 'technical-api-obligation',
  authority = 'orchestrator',
} = {}) {
  return {
    id,
    source: { id: 'review/api-contract', version: planDigest },
    targetTaskIds: ['T1'],
    closeWhen: authority === 'user'
      ? { kind: 'decision_record', taskId: 'T1', authority }
      : { kind: 'plan_task_executable', taskId: 'T1' },
    status: 'open',
  }
}

function assertReceipt(response, outcome) {
  assert.equal(response.contract, 'DSH_RECOVERY_ADMISSION_V1')
  assert.equal(response.outcome, outcome)
  assert.equal(response.launchAuthorized, false)
  if (outcome !== 'rejected') {
    assert.equal(typeof response.rootProblemId, 'string')
    assert.equal(typeof response.requestId, 'string')
    assert.equal(typeof response.attemptId, 'string')
    assert.equal(typeof response.executionIdentity?.sessionId, 'string')
    assert.equal(typeof response.executionIdentity?.promptId, 'string')
  }
}

function childReserve(input) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = fork(WORKER, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      rejectPromise(new Error('recovery-admission child IPC timed out'))
    }, 5_000)
    const settle = action => value => {
      clearTimeout(timeout)
      child.removeAllListeners()
      action(value)
    }
    child.once('message', settle(resolvePromise))
    child.once('error', settle(rejectPromise))
    child.once('exit', (code, signal) => {
      if (code !== 0 && signal === null) settle(rejectPromise)(new Error(`recovery-admission child exited ${code}`))
    })
    child.send(input)
  })
}

test('T20 persists a bounded owner-failure reservation and returns only a launch-disabled receipt', async t => {
  const fixture = await createFixture(t)
  const response = await fixture.runtime.reserveRecoveryAdmission(
    fixture.agent, fixture.workflowId, ownerRequest(fixture),
  )
  assertReceipt(response, 'reserved')
  const saved = await readState(fixture.root, fixture.workflowId)
  assert.equal(saved.recoveryAdmission.contract, 'DSH_RECOVERY_ADMISSION_STATE_V1')
  assert.equal(saved.recoveryAdmission.workflowId, fixture.workflowId)
  assert.equal(saved.recoveryAdmission.executionVersion, fixture.planDigest)
  assert.equal(saved.recoveryAdmission.budget.totalUsed, 1)
  assert.equal(saved.tasks.find(task => task.taskId === 'T1').action, null)
})

test('T20 reloads the same durable request through a new Runtime without rebilling or changing identity', async t => {
  const fixture = await createFixture(t)
  const request = ownerRequest(fixture)
  const first = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
  const newRuntime = createOwnerWorkflowRuntime({ agents: { get: () => undefined } }, {})
  const replay = await newRuntime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
  assertReceipt(first, 'reserved')
  assertReceipt(replay, 'replayed')
  assert.equal(replay.requestId, first.requestId)
  assert.equal(replay.attemptId, first.attemptId)
  assert.deepEqual(replay.executionIdentity, first.executionIdentity)
  assert.equal((await readState(fixture.root, fixture.workflowId)).recoveryAdmission.budget.totalUsed, 1)
})

test('T20 derives A/B/A from persisted strategy, keeping one root but distinct durable requests', async t => {
  const fixture = await createFixture(t, { limits: { totalLimit: 3, problemLimit: 3 } })
  const request = ownerRequest(fixture)
  const originalFailure = '\n Owner tool schema did not match the runtime contract \n'
  await mutateState(fixture, state => { state.ownerRuns['T1:api'].error = originalFailure })
  const strategyA = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
  const firstSaved = await readState(fixture.root, fixture.workflowId)
  assert.equal(firstSaved.recoveryAdmission.sources[0].failureReason, originalFailure)
  const reloadedRuntime = createOwnerWorkflowRuntime({ agents: { get: () => undefined } }, {})
  const rawReasonReplay = await reloadedRuntime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
  assertReceipt(rawReasonReplay, 'replayed')
  assert.deepEqual(rawReasonReplay.executionIdentity, strategyA.executionIdentity)
  await mutateState(fixture, state => {
    state.ownerRuns['T1:api'].error = 'A later diagnostic added more detail but did not redefine the cause'
    state.ownerRuns['T1:api'].autonomousRecovery.strategy = 'repair_runtime'
    state.ownerRuns['T1:api'].autonomousRecovery.usedStrategies.push('repair_runtime')
    state.tasks.find(task => task.taskId === 'T1').autonomousRecovery.strategy = 'repair_runtime'
  })
  const strategyB = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
  await mutateState(fixture, state => {
    state.ownerRuns['T1:api'].autonomousRecovery.strategy = 'diagnose'
    state.tasks.find(task => task.taskId === 'T1').autonomousRecovery.strategy = 'diagnose'
  })
  const replayA = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
  assertReceipt(strategyA, 'reserved')
  assertReceipt(strategyB, 'reserved')
  assertReceipt(replayA, 'replayed')
  assert.equal(strategyA.rootProblemId, strategyB.rootProblemId)
  assert.notEqual(strategyA.requestId, strategyB.requestId)
  assert.equal(replayA.requestId, strategyA.requestId)
  const saved = await readState(fixture.root, fixture.workflowId)
  assert.equal(saved.recoveryAdmission.budget.totalUsed, 2)
  assert.equal(saved.recoveryAdmission.sources[0].failureReason, originalFailure)
})

test('T20 rejects forged request fields and incorrect source binding without creating a recovery account', async t => {
  const fixture = await createFixture(t)
  const before = await readState(fixture.root, fixture.workflowId)
  for (const field of ['strategy', 'rootProblemId', 'requestId', 'attemptId', 'totalLimit', 'problemLimit', 'verified']) {
    const response = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, {
      ...ownerRequest(fixture),
      [field]: field === 'verified' ? true : 'caller-forged',
    })
    assertReceipt(response, 'rejected')
    assert.deepEqual(await readState(fixture.root, fixture.workflowId), before)
  }
  const mismatchedAttempt = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, ownerRequest(fixture, {
    source: { kind: 'owner_failure', attempt: 3, sessionId: 'T1-api-failed-session' },
  }))
  const wrongDigest = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, {
    ...ownerRequest(fixture), planDigest: 'f'.repeat(64),
  })
  assertReceipt(mismatchedAttempt, 'rejected')
  assertReceipt(wrongDigest, 'rejected')
  assert.deepEqual(await readState(fixture.root, fixture.workflowId), before)
})

test('T20 rejects a missing strategy and owner-failure records that no longer describe a failed technical task', async t => {
  const fixture = await createFixture(t)
  const request = ownerRequest(fixture)
  const original = await readState(fixture.root, fixture.workflowId)
  const cases = [
    state => { delete state.ownerRuns['T1:api'].autonomousRecovery },
    state => {
      state.ownerRuns['T1:api'].status = 'completed'
      state.tasks.find(task => task.taskId === 'T1').status = 'completed'
      state.tasks.find(task => task.taskId === 'T1').reason = null
      state.tasks.find(task => task.taskId === 'T1').action = null
    },
    state => {
      state.tasks.find(task => task.taskId === 'T1').status = 'running'
      state.tasks.find(task => task.taskId === 'T1').reason = null
      state.tasks.find(task => task.taskId === 'T1').action = null
    },
  ]
  for (const mutate of cases) {
    const candidate = structuredClone(original)
    mutate(candidate)
    await writeState(fixture.root, fixture.workflowId, candidate)
    const response = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
    assertReceipt(response, 'rejected')
    assert.deepEqual(await readState(fixture.root, fixture.workflowId), candidate)
  }
})

test('T20 admits only a live technical obligation and preserves the user-authority boundary', async t => {
  const fixture = await createFixture(t)
  await mutateState(fixture, state => {
    state.planConvergence = convergenceFor(state.planDigest, technicalObligation(state.planDigest))
  })
  const technical = await fixture.runtime.reserveRecoveryAdmission(
    fixture.agent, fixture.workflowId, obligationRequest(fixture),
  )
  assertReceipt(technical, 'reserved')
  assert.equal((await readState(fixture.root, fixture.workflowId)).recoveryAdmission.budget.totalUsed, 1)

  const userFixture = await createFixture(t, { workflowId: 'wf-recovery-admission-user-obligation' })
  await mutateState(userFixture, state => {
    state.planConvergence = convergenceFor(state.planDigest, technicalObligation(state.planDigest, {
      id: 'user-authority-obligation', authority: 'user',
    }))
  })
  const before = await readState(userFixture.root, userFixture.workflowId)
  const userAuthority = await userFixture.runtime.reserveRecoveryAdmission(
    userFixture.agent, userFixture.workflowId, obligationRequest(userFixture, 'user-authority-obligation'),
  )
  assertReceipt(userAuthority, 'rejected')
  assert.deepEqual(await readState(userFixture.root, userFixture.workflowId), before)
})

test('T20 makes approval, current plan digest, cancellation, malformed state, and absent config hard wrapper gates', async t => {
  const fixture = await createFixture(t)
  const request = ownerRequest(fixture)
  const original = await readState(fixture.root, fixture.workflowId)

  await mutateState(fixture, state => { state.planApproved = false })
  await assert.rejects(fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request), /审批|通过/u)
  await writeState(fixture.root, fixture.workflowId, structuredClone(original))

  await mutateState(fixture, state => { state.planReviewDigest = 'f'.repeat(64) })
  await assert.rejects(fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request), /审批|通过/u)
  await writeState(fixture.root, fixture.workflowId, structuredClone(original))

  await mutateState(fixture, state => { state.planDigest = 'f'.repeat(64) })
  await assert.rejects(fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request), /摘要不匹配/u)
  await writeState(fixture.root, fixture.workflowId, structuredClone(original))

  await mutateState(fixture, state => { state.status = 'cancelled' })
  await assert.rejects(fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request), /取消/u)
  await writeState(fixture.root, fixture.workflowId, structuredClone(original))

  await mutateState(fixture, state => { delete state.recoveryAdmissionConfig })
  const noConfig = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
  assertReceipt(noConfig, 'rejected')
  const expectedNoConfig = structuredClone(original)
  delete expectedNoConfig.recoveryAdmissionConfig
  assert.deepEqual(await readState(fixture.root, fixture.workflowId), expectedNoConfig)

  await writeFile(statePath(fixture.root, fixture.workflowId), '{', 'utf8')
  await assert.rejects(fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request))
})

test('T20 rejects changed limits after accounting begins and never returns a receipt when the first save cannot commit', async t => {
  const fixture = await createFixture(t)
  const request = ownerRequest(fixture)
  const first = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
  assertReceipt(first, 'reserved')
  await mutateState(fixture, state => {
    state.recoveryAdmissionConfig.totalLimit = 4
    state.ownerRuns['T1:api'].autonomousRecovery.strategy = 'owner_council'
  })
  const beforeLimitRejection = await readState(fixture.root, fixture.workflowId)
  const changedLimits = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
  assertReceipt(changedLimits, 'rejected')
  assert.deepEqual(await readState(fixture.root, fixture.workflowId), beforeLimitRejection)

  const saveFixture = await createFixture(t, { workflowId: 'wf-recovery-admission-save-failure' })
  const workflows = join(saveFixture.root, '.dsh-workflow', 'workflows')
  const beforeSaveFailure = await readState(saveFixture.root, saveFixture.workflowId)
  await chmod(workflows, 0o500)
  try {
    await assert.rejects(saveFixture.runtime.reserveRecoveryAdmission(
      saveFixture.agent, saveFixture.workflowId, ownerRequest(saveFixture),
    ))
  } finally {
    await chmod(workflows, 0o700)
  }
  assert.deepEqual(await readState(saveFixture.root, saveFixture.workflowId), beforeSaveFailure)
})

test('T20 cross-process distinct requests consume the final workflow credit once', async t => {
  const fixture = await createFixture(t, { limits: { totalLimit: 1, problemLimit: 1 } })
  const [left, right] = await Promise.all([
    childReserve({ root: fixture.root, workflowId: fixture.workflowId, request: ownerRequest(fixture), agentId: 'child-left' }),
    childReserve({ root: fixture.root, workflowId: fixture.workflowId, request: ownerRequest(fixture, { taskId: 'T2', ownerId: 'worker' }), agentId: 'child-right' }),
  ])
  assert.equal(left.ok, true, left.error?.message)
  assert.equal(right.ok, true, right.error?.message)
  assert.equal([left.response.outcome, right.response.outcome].filter(outcome => outcome === 'reserved').length, 1)
  assert.equal([left.response.outcome, right.response.outcome].filter(outcome => outcome === 'rejected').length, 1)
  assert.equal((await readState(fixture.root, fixture.workflowId)).recoveryAdmission.budget.totalUsed, 1)
})

test('T20 cross-process competition for one request yields one receipt identity and one debit', async t => {
  const fixture = await createFixture(t, { limits: { totalLimit: 1, problemLimit: 1 } })
  const input = { root: fixture.root, workflowId: fixture.workflowId, request: ownerRequest(fixture) }
  const [left, right] = await Promise.all([
    childReserve({ ...input, agentId: 'same-child-left' }),
    childReserve({ ...input, agentId: 'same-child-right' }),
  ])
  assert.equal(left.ok, true, left.error?.message)
  assert.equal(right.ok, true, right.error?.message)
  assert.deepEqual(new Set([left.response.outcome, right.response.outcome]), new Set(['reserved', 'replayed']))
  assert.equal(left.response.requestId, right.response.requestId)
  assert.equal(left.response.attemptId, right.response.attemptId)
  assert.deepEqual(left.response.executionIdentity, right.response.executionIdentity)
  assert.equal((await readState(fixture.root, fixture.workflowId)).recoveryAdmission.budget.totalUsed, 1)
})

// T22 producer state is constructed here; no external session or model runs.
// Admission itself is always exercised through real Runtime + saveState.
async function recordRecoveryFailure(fixture, receipt, { started = true, terminal = 'failed' } = {}) {
  return mutateState(fixture, state => {
    const admission = state.recoveryAdmission
    const intent = admission.intents.find(item => item.attemptId === receipt.attemptId)
    const predecessor = admission.sources.find(item => item.sourceId === intent.sourceId)
    const binding = {
      workflowId: state.id, rootProblemId: intent.rootProblemId,
      requestId: intent.requestId, attemptId: intent.attemptId,
      taskId: intent.taskId, ownerId: intent.ownerId, executionVersion: intent.planDigest,
    }
    const { sessionId, promptId } = intent.executionIdentity
    let budget = admission.budget
    if (started) budget = startRecoveryAttempt(budget, {
      ...binding, executionRef: { id: sessionId, version: promptId },
    }).ledger
    if (terminal !== null) budget = settleRecoveryAttempt(budget, {
      ...binding, result: { status: terminal, reference: { id: promptId, version: sessionId } },
    }).ledger
    admission.budget = budget
    const attempt = (predecessor.attempt ?? 0) + 1
    state.ownerRuns[`${intent.taskId}:${intent.ownerId}`] = {
      ...recoveryRecord(intent.taskId, intent.ownerId, intent.planDigest, { attempt, sessionId }),
      recoveryContinuation: {
        contract: 'DSH_RECOVERY_CONTINUATION_V1',
        sourceId: intent.sourceId, rootProblemId: intent.rootProblemId,
        requestId: intent.requestId, attemptId: intent.attemptId,
        taskId: intent.taskId, ownerId: intent.ownerId, planDigest: intent.planDigest,
        executionIdentity: { sessionId, promptId },
        ownerRunBinding: { attempt, sessionId },
      },
    }
  })
}

function currentFailureRequest(fixture, state) {
  const record = state.ownerRuns['T1:api']
  return ownerRequest(fixture, { source: {
    kind: 'owner_failure', attempt: record.attempt, sessionId: record.sessionId,
  } })
}

async function assertAdmissionRefusedUnchanged(fixture, request) {
  const before = await readState(fixture.root, fixture.workflowId)
  const response = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
  assertReceipt(response, 'rejected')
  assert.equal(Object.hasOwn(response, 'attemptId'), false)
  assert.deepEqual(await readState(fixture.root, fixture.workflowId), before)
  return response
}

test('R15 next failed executions with the same strategy inherit the root and persist replay across Runtime restarts', async t => {
  const fixture = await createFixture(t, { limits: { totalLimit: 4, problemLimit: 4 } })
  const first = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, ownerRequest(fixture))
  const initial = await readState(fixture.root, fixture.workflowId)
  const firstSource = structuredClone(initial.recoveryAdmission.sources[0])
  let prior = first
  for (let used = 2; used <= 3; used++) {
    const failed = await recordRecoveryFailure(fixture, prior)
    const request = currentFailureRequest(fixture, failed)
    const next = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
    assertReceipt(next, 'reserved')
    assert.equal(next.rootProblemId, first.rootProblemId)
    assert.notEqual(next.requestId, prior.requestId)
    assert.notEqual(next.attemptId, prior.attemptId)
    const reloaded = createOwnerWorkflowRuntime({ agents: { get: () => undefined } }, {})
    const replay = await reloaded.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
    assertReceipt(replay, 'replayed')
    assert.deepEqual(replay, { ...next, outcome: 'replayed' })
    const saved = await readState(fixture.root, fixture.workflowId)
    assert.equal(saved.recoveryAdmission.budget.problems.length, 1)
    assert.equal(saved.recoveryAdmission.budget.totalUsed, used)
    assert.equal(saved.recoveryAdmission.budget.problems[0].used, used)
    assert.deepEqual(saved.recoveryAdmission.sources[0], firstSource)
    prior = next
  }
})

test('R15 rejects missing, wrong, and unknown continuation bindings without changing the saved revision or budget', async t => {
  const fixture = await createFixture(t)
  const first = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, ownerRequest(fixture))
  const valid = await recordRecoveryFailure(fixture, first)
  const cases = [
    ['missing', state => { delete state.ownerRuns['T1:api'].recoveryContinuation }],
    ...['contract', 'sourceId', 'rootProblemId', 'requestId', 'attemptId', 'taskId', 'ownerId', 'planDigest'].map(field => [field, state => {
      state.ownerRuns['T1:api'].recoveryContinuation[field] = 'incorrect'
    }]),
    ...['sessionId', 'promptId'].map(field => [`identity ${field}`, state => {
      state.ownerRuns['T1:api'].recoveryContinuation.executionIdentity[field] = 'incorrect'
    }]),
    ['run attempt', state => { state.ownerRuns['T1:api'].recoveryContinuation.ownerRunBinding.attempt++ }],
    ['run session', state => { state.ownerRuns['T1:api'].recoveryContinuation.ownerRunBinding.sessionId = 'incorrect' }],
    ['unknown field', state => { state.ownerRuns['T1:api'].recoveryContinuation.verified = true }],
    ['execution receipt', state => { state.recoveryAdmission.budget.attempts[0].executionRef.id = 'incorrect' }],
    ['result receipt', state => { state.recoveryAdmission.budget.attempts[0].result.reference.id = 'incorrect' }],
  ]
  for (const [name, change] of cases) await t.test(name, async () => {
    const changed = structuredClone(valid)
    change(changed)
    await writeState(fixture.root, fixture.workflowId, changed)
    await assertAdmissionRefusedUnchanged(fixture, currentFailureRequest(fixture, changed))
  })
})

for (const [name, options] of [
  ['never started', { started: false }], ['still running', { terminal: null }],
  ['succeeded', { terminal: 'succeeded' }], ['cancelled', { terminal: 'cancelled' }],
]) test(`R15 rejects a predecessor that ${name}`, async t => {
  const fixture = await createFixture(t)
  const first = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, ownerRequest(fixture))
  const state = await recordRecoveryFailure(fixture, first, options)
  await assertAdmissionRefusedUnchanged(fixture, currentFailureRequest(fixture, state))
})

for (const [name, limits] of [
  ['problem', { totalLimit: 3, problemLimit: 1 }],
  ['workflow', { totalLimit: 1, problemLimit: 3 }],
]) test(`R15 continuation cannot reset exhausted ${name} credit`, async t => {
  const fixture = await createFixture(t, { limits })
  const first = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, ownerRequest(fixture))
  const state = await recordRecoveryFailure(fixture, first)
  const response = await assertAdmissionRefusedUnchanged(fixture, currentFailureRequest(fixture, state))
  assert.equal(response.reason, `${name}_exhausted`)
})

test('R15 a settled execution cannot be reused as a differently numbered successor; saved chain and missing edges fail closed', async t => {
  const fixture = await createFixture(t, { limits: { totalLimit: 5, problemLimit: 5 } })
  const first = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, ownerRequest(fixture))
  const failed = await recordRecoveryFailure(fixture, first)
  const request = currentFailureRequest(fixture, failed)
  const second = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
  assertReceipt(second, 'reserved')
  const saved = await readState(fixture.root, fixture.workflowId)
  const cases = [
    ['renumber the same execution', state => {
      state.ownerRuns['T1:api'].attempt++
      state.ownerRuns['T1:api'].recoveryContinuation.ownerRunBinding.attempt++
    }],
    ['drop current continuation', state => { delete state.ownerRuns['T1:api'].recoveryContinuation }],
    ['drop historical edge', state => { delete state.recoveryAdmission.sources[1].continuation }],
    ['redirect historical parent', state => { state.recoveryAdmission.sources[1].continuation.attemptId = second.attemptId }],
    ['redirect successor root', state => { state.recoveryAdmission.intents[1].rootProblemId = 'incorrect' }],
  ]
  for (const [name, change] of cases) await t.test(name, async () => {
    const changed = structuredClone(saved)
    change(changed)
    await writeState(fixture.root, fixture.workflowId, changed)
    await assertAdmissionRefusedUnchanged(fixture, currentFailureRequest(fixture, changed))
  })
})

test('R15 concurrent continuation calls from separate processes share one successor receipt and one debit', async t => {
  const fixture = await createFixture(t)
  const first = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, ownerRequest(fixture))
  const failed = await recordRecoveryFailure(fixture, first)
  const request = currentFailureRequest(fixture, failed)
  const input = { root: fixture.root, workflowId: fixture.workflowId, request }
  const [left, right] = await Promise.all([childReserve(input), childReserve(input)])
  assert.equal(left.ok, true)
  assert.equal(right.ok, true)
  assert.deepEqual([left.response.outcome, right.response.outcome].sort(), ['replayed', 'reserved'])
  assert.equal(left.response.rootProblemId, first.rootProblemId)
  assert.equal(left.response.attemptId, right.response.attemptId)
  assert.deepEqual(left.response.executionIdentity, right.response.executionIdentity)
  assert.equal((await readState(fixture.root, fixture.workflowId)).recoveryAdmission.budget.totalUsed, 2)
})

test('R15 a technical obligation recovery can produce a failed Owner continuation under its original root', async t => {
  const fixture = await createFixture(t)
  await mutateState(fixture, state => {
    state.planConvergence = convergenceFor(fixture.planDigest, technicalObligation(fixture.planDigest))
  })
  const first = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, obligationRequest(fixture))
  assertReceipt(first, 'reserved')
  const failed = await recordRecoveryFailure(fixture, first)
  const second = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, currentFailureRequest(fixture, failed))
  assertReceipt(second, 'reserved')
  assert.equal(second.rootProblemId, first.rootProblemId)
  const saved = await readState(fixture.root, fixture.workflowId)
  assert.equal(saved.recoveryAdmission.sources[0].kind, 'obligation')
  assert.equal(saved.recoveryAdmission.sources[1].kind, 'owner_failure')
  assert.equal(saved.recoveryAdmission.budget.problems.length, 1)
})

test('R15 derived source retains A/B/A replay without erasing the continuation edge', async t => {
  const fixture = await createFixture(t, { limits: { totalLimit: 4, problemLimit: 4 } })
  const first = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, ownerRequest(fixture))
  const failed = await recordRecoveryFailure(fixture, first)
  const request = currentFailureRequest(fixture, failed)
  const a = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
  assertReceipt(a, 'reserved')
  await mutateState(fixture, state => { state.ownerRuns['T1:api'].autonomousRecovery.strategy = 'repair_runtime' })
  const b = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
  assertReceipt(b, 'reserved')
  assert.equal(b.rootProblemId, first.rootProblemId)
  assert.notEqual(b.attemptId, a.attemptId)
  await mutateState(fixture, state => { state.ownerRuns['T1:api'].autonomousRecovery.strategy = 'diagnose' })
  const replay = await fixture.runtime.reserveRecoveryAdmission(fixture.agent, fixture.workflowId, request)
  assert.deepEqual(replay, { ...a, outcome: 'replayed' })
  const saved = await readState(fixture.root, fixture.workflowId)
  assert.equal(saved.recoveryAdmission.sources.length, 2)
  assert.equal(saved.recoveryAdmission.budget.totalUsed, 3)
})

const replanRequest = (fixture, operation = {}, origin = ownerRequest(fixture)) => ({
  contract: 'DSH_REPLAN_ADMISSION_REQUEST_V1', origin,
  operation: { operationKind: 'revision_plan', operationId: 'cycle-1:planner', ordinal: 1, ...operation },
})
async function operationSettlement(fixture, receipt, { status = 'failed', start = true } = {}) {
  return mutateState(fixture, state => {
    const intent = state.recoveryAdmission.intents.find(item => item.requestId === receipt.requestId)
    const binding = {
      workflowId: fixture.workflowId, rootProblemId: intent.rootProblemId,
      requestId: intent.requestId, attemptId: intent.attemptId, executionVersion: intent.planDigest,
      executionKind: intent.executionKind, operationKind: intent.operationKind, operationId: intent.operationId,
    }
    if (start) state.recoveryAdmission.budget = startRecoveryAttempt(state.recoveryAdmission.budget, {
      ...binding, executionRef: { id: intent.executionIdentity.sessionId, version: intent.executionIdentity.promptId },
    }).ledger
    state.recoveryAdmission.budget = settleRecoveryAttempt(state.recoveryAdmission.budget, {
      ...binding, result: { status, reference: { id: intent.executionIdentity.promptId, version: intent.executionIdentity.sessionId } },
    }).ledger
  })
}

test('T15 replan admission can originate at first free Owner failure and share its root with an Owner retry', async t => {
  const f = await createFixture(t)
  await mutateState(f, s => { s.ownerRuns['T1:api'].attempt = 1 })
  const origin = ownerRequest(f, { source: { kind: 'owner_failure', attempt: 1, sessionId: 'T1-api-failed-session' } })
  const operation = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f, {}, origin))
  assertReceipt(operation, 'reserved')
  const owner = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, origin)
  assertReceipt(owner, 'reserved')
  assert.equal(operation.rootProblemId, owner.rootProblemId)
  const saved = await readState(f.root, f.workflowId)
  assert.equal(saved.recoveryAdmission.budget.totalUsed, 2)
  assert.equal(saved.recoveryAdmission.sources.length, 1)
  assert.equal(saved.recoveryAdmission.budget.problems.length, 1)
  const intent = saved.recoveryAdmission.intents[0]
  assert.equal(intent.executionKind, 'replan_operation')
  assert.equal(Object.hasOwn(intent, 'ownerId'), false)
  assert.equal(Object.hasOwn(intent, 'taskId'), false)
  assert.equal(saved.ownerRuns['T1:api'].attempt, 1)
  assert.equal(saved.ownerRuns['T1:api'].status, 'failed')
})

test('T15 replan restart replays reserved call; next ordinal requires a failed matching receipt', async t => {
  const f = await createFixture(t, { limits: { totalLimit: 4, problemLimit: 4 } })
  const first = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f))
  assertReceipt(first, 'reserved')
  const reopened = createOwnerWorkflowRuntime({ agents: { get: () => undefined } }, {})
  const replay = await reopened.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f))
  assertReceipt(replay, 'replayed')
  assert.equal(replay.requestId, first.requestId)
  assert.deepEqual(replay.executionIdentity, first.executionIdentity)
  const next = replanRequest(f, { ordinal: 2 })
  const before = await readState(f.root, f.workflowId)
  const denied = await reopened.reserveRecoveryAdmission(f.agent, f.workflowId, next)
  assert.equal(denied.reason, 'replan_previous_not_failed')
  assert.deepEqual(await readState(f.root, f.workflowId), before)
  await operationSettlement(f, first)
  const second = await reopened.reserveRecoveryAdmission(f.agent, f.workflowId, next)
  assertReceipt(second, 'reserved')
  assert.notEqual(first.requestId, second.requestId)
  assert.notEqual(first.executionIdentity.sessionId, second.executionIdentity.sessionId)
  assert.equal(first.rootProblemId, second.rootProblemId)
  assert.equal((await readState(f.root, f.workflowId)).recoveryAdmission.budget.totalUsed, 2)
  assert.equal((await reopened.reserveRecoveryAdmission(f.agent, f.workflowId, next)).requestId, second.requestId)
})

test('T15 plan/review/handoff operations cannot reset the source budget by changing step identity', async t => {
  const f = await createFixture(t, { limits: { totalLimit: 3, problemLimit: 2 } })
  const first = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f))
  const second = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f, {
    operationKind: 'revision_review', operationId: 'candidate-1:review',
  }))
  assert.equal(first.rootProblemId, second.rootProblemId)
  const before = await readState(f.root, f.workflowId)
  const denied = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f, {
    operationKind: 'handoff_replan', operationId: 'different-step',
  }))
  assert.equal(denied.reason, 'problem_exhausted')
  assert.deepEqual(await readState(f.root, f.workflowId), before)
  const independent = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, ownerRequest(f, { taskId: 'T2', ownerId: 'worker' }))
  assertReceipt(independent, 'reserved')
  assert.notEqual(independent.rootProblemId, first.rootProblemId)
})

test('T15 replan operation rejects skipped ordinals and forged envelope/source fields before saving', async t => {
  const f = await createFixture(t)
  const before = await readState(f.root, f.workflowId)
  const mutations = [
    q => { q.operation.ordinal = 2 }, q => { q.operation.ordinal = 0 },
    q => { q.operation.operationKind = 'unlimited_repair' }, q => { q.operation.operationId = ' ' },
    q => { q.operation.ownerId = 'fake-planner' }, q => { q.rootProblemId = 'fresh-budget' },
    q => { q.origin.source.attempt = 100 }, q => { q.origin.planDigest = 'wrong' },
    q => { q.origin.taskId = 'missing' }, q => { q.origin.source.sessionId = 'wrong' },
  ]
  for (const mutate of mutations) {
    const request = replanRequest(f); mutate(request)
    const response = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, request)
    assertReceipt(response, 'rejected')
    assert.deepEqual(await readState(f.root, f.workflowId), before)
  }
})

test('T15 mixed admission rejects operation/ledger identity corruption and missing intents', async t => {
  const f = await createFixture(t)
  await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f))
  const original = await readState(f.root, f.workflowId)
  const cases = [
    s => { s.recoveryAdmission.intents[0].ownerId = 'fake' },
    s => { s.recoveryAdmission.intents[0].operationId = 'changed' },
    s => { s.recoveryAdmission.intents[0].ordinal = 2 },
    s => { s.recoveryAdmission.intents[0].executionKind = 'owner' },
    s => { s.recoveryAdmission.budget.attempts[0].operationKind = 'revision_review' },
    s => { s.recoveryAdmission.intents = [] },
    s => { s.recoveryAdmission.budget.attempts[0].operationId = 'changed' },
  ]
  for (const mutate of cases) {
    const candidate = structuredClone(original); mutate(candidate)
    await writeState(f.root, f.workflowId, candidate)
    const response = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, ownerRequest(f))
    assertReceipt(response, 'rejected')
    assert.deepEqual(await readState(f.root, f.workflowId), candidate)
  }
})

for (const status of ['succeeded', 'cancelled']) test(`T15 ${status} operation does not authorize the next physical retry`, async t => {
  const f = await createFixture(t)
  const first = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f))
  await operationSettlement(f, first, { status, start: status === 'succeeded' })
  const before = await readState(f.root, f.workflowId)
  const response = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f, { ordinal: 2 }))
  assert.equal(response.reason, 'replan_previous_not_failed')
  assert.deepEqual(await readState(f.root, f.workflowId), before)
  assert.equal((await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f))).requestId, first.requestId)
})

test('T15 operation admission retains live-source and user-decision gates', async t => {
  const f = await createFixture(t)
  const original = await readState(f.root, f.workflowId)
  for (const mutate of [
    s => { s.tasks[0].status = 'running' },
    s => { s.tasks[0].action = 'await_user' },
    s => { s.ownerRuns['T1:api'].autonomousRecovery.strategy = 'request_user_authority' },
    s => { s.ownerRuns['T1:api'].status = 'completed' },
  ]) {
    const candidate = structuredClone(original); mutate(candidate)
    await writeState(f.root, f.workflowId, candidate)
    const response = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f))
    assertReceipt(response, 'rejected')
    assert.deepEqual(await readState(f.root, f.workflowId), candidate)
  }
})

test('T15 separate processes replay the same operation reservation without double debit', async t => {
  const f = await createFixture(t)
  const request = replanRequest(f)
  const results = await Promise.all([1, 2].map(i => childReserve({
    root: f.root, workflowId: f.workflowId, request, agentId: `replan-process-${i}`,
  })))
  for (const result of results) assert.equal(result.ok, true, JSON.stringify(result))
  assert.deepEqual(results.map(r => r.response.outcome).sort(), ['replayed', 'reserved'])
  assert.equal(results[0].response.requestId, results[1].response.requestId)
  assert.equal((await readState(f.root, f.workflowId)).recoveryAdmission.budget.totalUsed, 1)
})

test('T15 separate Owner/replan reservations compete for one shared last Workflow credit', async t => {
  const f = await createFixture(t, { limits: { totalLimit: 1, problemLimit: 2 } })
  const requests = [replanRequest(f), ownerRequest(f, { taskId: 'T2', ownerId: 'worker' })]
  const results = await Promise.all(requests.map(request => childReserve({ root: f.root, workflowId: f.workflowId, request })))
  for (const result of results) assert.equal(result.ok, true, JSON.stringify(result))
  assert.deepEqual(results.map(r => r.response.outcome).sort(), ['rejected', 'reserved'])
  assert.equal(results.find(r => r.response.outcome === 'rejected').response.reason, 'workflow_exhausted')
  const saved = await readState(f.root, f.workflowId)
  assert.equal(saved.recoveryAdmission.budget.totalUsed, 1)
  assert.equal(saved.recoveryAdmission.intents.length, 1)
})

test('T15 an operation intent cannot enter the Owner-only session driver', async t => {
  const f = await createFixture(t)
  const receipt = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f))
  const before = await readState(f.root, f.workflowId)
  const response = await f.runtime.reconcileRecoverySession(f.agent, f.workflowId, {
    contract: 'DSH_RECOVERY_SESSION_REQUEST_V1', requestId: receipt.requestId,
    taskId: 'T1', ownerId: 'api', prompt: { id: receipt.executionIdentity.promptId, content: 'do not launch an Owner' },
  })
  assert.equal(response.reason, 'owner_session_requires_owner_intent')
  assert.deepEqual(await readState(f.root, f.workflowId), before)
})

test('T15 replan after a paid Owner failure inherits the admitted predecessor root', async t => {
  const f = await createFixture(t)
  const first = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, ownerRequest(f))
  const failed = await recordRecoveryFailure(f, first)
  const operation = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId,
    replanRequest(f, {}, currentFailureRequest(f, failed)))
  assertReceipt(operation, 'reserved')
  assert.equal(operation.rootProblemId, first.rootProblemId)
  const saved = await readState(f.root, f.workflowId)
  assert.equal(saved.recoveryAdmission.sources.length, 2)
  assert.equal(saved.recoveryAdmission.budget.problems.length, 1)
  assert.equal(saved.recoveryAdmission.budget.totalUsed, 2)
  const denied = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId,
    replanRequest(f, { operationId: 'another-plan-step' }, currentFailureRequest(f, saved)))
  assert.equal(denied.reason, 'problem_exhausted')
})

test('T15 replan accepts a live technical obligation but cannot charge a user decision', async t => {
  const f = await createFixture(t)
  await mutateState(f, s => { s.planConvergence = convergenceFor(s.planDigest, technicalObligation(s.planDigest)) })
  const response = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId,
    replanRequest(f, {}, obligationRequest(f)))
  assertReceipt(response, 'reserved')
  const owner = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, obligationRequest(f))
  assert.equal(owner.rootProblemId, response.rootProblemId)
  await mutateState(f, s => {
    s.planConvergence = convergenceFor(s.planDigest, technicalObligation(s.planDigest, { authority: 'user', id: 'human' }))
  })
  const before = await readState(f.root, f.workflowId)
  assertReceipt(await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId,
    replanRequest(f, { operationId: 'human-decision' }, obligationRequest(f, 'human'))), 'rejected')
  assert.deepEqual(await readState(f.root, f.workflowId), before)
})

test('T15 a running or mismatched failed operation receipt cannot authorize a new ordinal', async t => {
  const f = await createFixture(t)
  const first = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f))
  const failed = await operationSettlement(f, first)
  for (const change of [
    a => { a.state = 'running'; delete a.result },
    a => { a.result.reference.id = 'wrong-prompt' },
    a => { a.executionRef.id = 'wrong-session' },
  ]) {
    const candidate = structuredClone(failed); change(candidate.recoveryAdmission.budget.attempts[0])
    await writeState(f.root, f.workflowId, candidate)
    const response = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f, { ordinal: 2 }))
    assertReceipt(response, 'rejected')
    assert.deepEqual(await readState(f.root, f.workflowId), candidate)
  }
})

for (const release of [true, false]) test(`R78 state-lock inspection ${release ? 'reacquires a concurrently released directory' : 'preserves other filesystem errors'}`, async t => {
  const f = await createFixture(t)
  const before = await readState(f.root, f.workflowId)
  const directory = `${statePath(f.root, f.workflowId)}.write-lock`
  fs.mkdirSync(directory, { mode: 0o700 })
  const original = fs.lstatSync
  let observed = false
  fs.lstatSync = function (path, ...args) {
    if (path === directory && !observed) {
      observed = true
      if (release) fs.rmSync(directory, { recursive: true })
      else throw Object.assign(new Error('Injected permission error during lock inspection'), { code: 'EACCES' })
    }
    return original.call(this, path, ...args)
  }
  syncBuiltinESMExports()
  try {
    if (release) {
      const receipt = await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f))
      assert.equal(receipt.outcome, 'reserved')
      const saved = await readState(f.root, f.workflowId)
      assert.equal(saved.recoveryAdmission.budget.totalUsed, 1)
      assert.equal((await f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f))).outcome, 'replayed')
      assert.equal((await readState(f.root, f.workflowId)).recoveryAdmission.budget.totalUsed, 1)
    } else {
      await assert.rejects(f.runtime.reserveRecoveryAdmission(f.agent, f.workflowId, replanRequest(f)), { code: 'EACCES' })
      assert.deepEqual(await readState(f.root, f.workflowId), before)
    }
    assert.equal(observed, true)
  } finally { fs.lstatSync = original; syncBuiltinESMExports() }
})

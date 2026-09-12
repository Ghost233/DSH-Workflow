import fsPromises, { readFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { join } from 'node:path'

import { RECOVERY_SESSION_REQUEST_CONTRACT } from '../../../../../owner-workflow-plugin/src/recovery-session.mjs'
import {
  createRecoverySessionFixture,
  readRecoverySessionState,
  writeRecoverySessionState,
  reopenRecoverySessionFixture,
  reserveRecoverySession,
} from '../../../../../owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs'

const content = 'recover the failed owner task'

function request(receipt) {
  return {
    contract: RECOVERY_SESSION_REQUEST_CONTRACT,
    taskId: 'T1',
    ownerId: 'api',
    requestId: receipt.requestId,
    prompt: { id: receipt.executionIdentity.promptId, content },
  }
}

function failedOwnerModelScript({ toolCallResponse, textResponse }) {
  return [
    toolCallResponse('t22-restart-owner-submit-failed', 'owner_submit', {
      report: {
        contract: 'DSH_OWNER_RESULT_V1',
        status: 'failed',
        summary: 'Controlled Owner reports a recoverable failure before fixed verification.',
        changes: [], tests: [], handoffs: [], memory_updates: [],
      },
    }),
    textResponse('submission recorded'),
  ]
}

function completedOwnerModelScript({ toolCallResponse, textResponse }) {
  const report = {
    contract: 'DSH_OWNER_RESULT_V1',
    status: 'completed',
    summary: 'Controlled Owner completed the recovered task through owner_submit.',
    changes: [], tests: [], handoffs: [], memory_updates: [],
  }
  // The first two responses exercise the production Owner child and its
  // owner_submit gate.  The next two let finishOwner complete its ordinary
  // curator/reviewer path, rather than bypassing final task settlement.
  return [
    toolCallResponse('t22-owner-submit-completed', 'owner_submit', { report }),
    textResponse('submission recorded'),
    textResponse(JSON.stringify({
      contract: 'DSH_OWNER_MEMORY_CURATOR_V1',
      summary: 'This controlled recovery has no durable knowledge page to add.',
      pages: [],
    })),
    textResponse(JSON.stringify({
      contract: 'DSH_OWNER_MEMORY_REVIEW_V1',
      status: 'passed',
      summary: 'The controlled empty memory bundle is valid.',
      issues: [],
    })),
  ]
}

function submittedOwnerModelScript({ textResponse }) {
  return [textResponse('The Owner is ready to submit its controlled result.')]
}

function serializeError(error) {
  return {
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error),
  }
}

async function send(message) {
  if (typeof process.send !== 'function') throw new Error('restart child requires an IPC parent')
  await new Promise((resolvePromise, rejectPromise) => {
    process.send(message, error => error === null || error === undefined ? resolvePromise() : rejectPromise(error))
  })
}

function statePath(root, workflowId) {
  return join(root, '.dsh-workflow', 'workflows', `${workflowId}.json`)
}

async function capture(fixture, receipt, unmaterializedLocation) {
  const stateBytes = await readFile(statePath(fixture.root, fixture.workflowId), 'utf8')
  const raw = await fixture.readRaw(receipt.executionIdentity.sessionId)
  if (raw === undefined && unmaterializedLocation === undefined) throw new Error('restart checkpoint has no reserved session artifact')
  // readRaw parses the persisted header from the artifact itself, so this
  // remains available after a completed one-shot Owner is no longer live in
  // the Context's session store.
  const location = raw === undefined ? unmaterializedLocation : fixture.ctx.sessionPersistence.locate(raw.meta)
  const state = JSON.parse(stateBytes)
  const record = state.ownerRuns?.['T1:api']
  const budgetAttempt = state.recoveryAdmission?.budget?.attempts?.find(
    item => item.requestId === receipt.requestId,
  )
  return {
    stateBytes,
    rawContent: raw?.content ?? null,
    ...(location?.kind === 'jsonl' ? { rawLocationPath: location.path } : {}),
    checkpoint: {
      phase: record?.recoverySession?.phase,
      ownerStatus: record?.status,
      budgetAttempt: structuredClone(budgetAttempt),
      modelRequests: fixture.adapter.requests.length,
      executionIdentity: structuredClone(receipt.executionIdentity),
    },
  }
}

async function holdAfterCheckpoint(fixture, receipt, scenario, unmaterializedLocation) {
  const evidence = await capture(fixture, receipt, unmaterializedLocation)
  await send({
    type: 'checkpoint',
    scenario,
    pid: process.pid,
    root: fixture.root,
    workflowId: fixture.workflowId,
    receipt,
    request: request(receipt),
    ...evidence,
  })
  await new Promise(() => {})
}

async function produceCreated(input) {
  const fixture = await createRecoverySessionFixture({ after() {} }, {
    executable: true,
    temporaryDirectory: input.fixtureParent,
    modelScript: submittedOwnerModelScript,
  })
  const receipt = await reserveRecoverySession(fixture)
  let location
  const create = fixture.ctx.agents.create.bind(fixture.ctx.agents)
  fixture.ctx.agents.create = async (...args) => {
    const handle = await create(...args)
    if (handle.agent.id === receipt.executionIdentity.sessionId) {
      location = fixture.ctx.sessionPersistence.locate(handle.agent.session.header)
    }
    return handle
  }
  const persistSession = fixture.runtime.persistOwnerSession.bind(fixture.runtime)
  fixture.runtime.persistOwnerSession = async (...args) => {
    if (location?.kind !== 'jsonl') throw new Error('created session has no physical target location')
    await holdAfterCheckpoint(fixture, receipt, 'created', location)
    return await persistSession(...args)
  }
  await fixture.runtime.reconcileRecoverySession(
    fixture.admissionAgent, fixture.workflowId, request(receipt),
  )
  throw new Error('created producer completed after its kill checkpoint')
}

async function produceSubmitted(input) {
  const fixture = await createRecoverySessionFixture({ after() {} }, {
    executable: true,
    temporaryDirectory: input.fixtureParent,
    modelScript: submittedOwnerModelScript,
  })
  const receipt = await reserveRecoverySession(fixture)
  const persistSubmitted = fixture.runtime.persistRecoverySessionSubmitted.bind(fixture.runtime)
  fixture.runtime.persistRecoverySessionSubmitted = async (...args) => {
    await holdAfterCheckpoint(fixture, receipt, 'submitted')
    return await persistSubmitted(...args)
  }
  await fixture.runtime.reconcileRecoverySession(
    fixture.admissionAgent,
    fixture.workflowId,
    request(receipt),
  )
  throw new Error('submitted producer completed after its kill checkpoint')
}

async function produceFirstAppend(input) {
  const fixture = await createRecoverySessionFixture({ after() {} }, {
    executable: true, temporaryDirectory: input.fixtureParent, modelScript: () => ['hang'],
  })
  const receipt = await reserveRecoverySession(fixture)
  const persistence = fixture.ctx.sessionPersistence
  const append = persistence.appendBatch.bind(persistence)
  persistence.appendBatch = async (meta, events, isMaterialized) => {
    await append(meta, events, isMaterialized)
    if (meta.id === receipt.executionIdentity.sessionId && isMaterialized === false) {
      const location = persistence.locate(meta)
      if (location.kind !== 'jsonl') throw new Error('first append has no JSONL location')
      // Read physical bytes directly: entering coordinator readRaw while its
      // appendBatch is awaiting this checkpoint would wait on ourselves.
      const rawContent = await readFile(location.path, 'utf8')
      const stateBytes = await readFile(statePath(fixture.root, fixture.workflowId), 'utf8')
      const state = JSON.parse(stateBytes)
      const run = state.ownerRuns['T1:api']
      await send({ type: 'checkpoint', scenario: 'first_append', pid: process.pid,
        root: fixture.root, workflowId: fixture.workflowId, receipt, request: request(receipt),
        stateBytes, rawContent, rawLocationPath: location.path,
        firstBatch: { isMaterialized, eventTypes: events.map(event => event.type) },
        checkpoint: { phase: run.recoverySession.phase, ownerStatus: run.status,
          modelRequests: fixture.adapter.requests.length,
          executionIdentity: receipt.executionIdentity,
          budgetAttempt: state.recoveryAdmission.budget.attempts.find(a => a.requestId === receipt.requestId),
        },
      })
      await new Promise(() => {})
    }
  }
  await fixture.runtime.reconcileRecoverySession(fixture.admissionAgent, fixture.workflowId, request(receipt))
  throw new Error('first append producer completed without its checkpoint')
}

async function produceSettlementPending(input) {
  const success = input.result === 'succeeded'
  const phase = success ? 'settled_succeeded' : 'settled_failed'
  const scenario = success ? 'success_settlement_pending' : 'settlement_pending'
  const fixture = await createRecoverySessionFixture({ after() {} }, {
    executable: true, temporaryDirectory: input.fixtureParent, modelScript: success ? completedOwnerModelScript : failedOwnerModelScript,
  })
  const receipt = await reserveRecoverySession(fixture)
  const target = statePath(fixture.root, fixture.workflowId)
  const rename = fsPromises.rename
  fsPromises.rename = async (from, to) => {
    if (to === target && typeof from === 'string' && from.startsWith(`${target}.tmp-`)) {
      const pendingBytes = await readFile(from, 'utf8')
      const pending = JSON.parse(pendingBytes)
      if (pending.ownerRuns?.['T1:api']?.recoverySession?.phase === phase) {
        const evidence = await capture(fixture, receipt)
        await send({ type: 'checkpoint', scenario, pid: process.pid,
          root: fixture.root, workflowId: fixture.workflowId, receipt, request: request(receipt),
          pendingPath: from, pendingBytes, ...evidence,
        })
        await new Promise(() => {})
      }
    }
    return await rename(from, to)
  }
  syncBuiltinESMExports()
  try {
    await fixture.runtime.reconcileRecoverySession(fixture.admissionAgent, fixture.workflowId, request(receipt))
    throw new Error('settlement producer completed without reaching rename checkpoint')
  } finally {
    fsPromises.rename = rename
    syncBuiltinESMExports()
  }
}

async function produceSettledFailed(input) {
  const fixture = await createRecoverySessionFixture({ after() {} }, {
    executable: true,
    temporaryDirectory: input.fixtureParent,
    modelScript: failedOwnerModelScript,
  })
  const receipt = await reserveRecoverySession(fixture)
  try {
    await fixture.runtime.reconcileRecoverySession(
      fixture.admissionAgent,
      fixture.workflowId,
      request(receipt),
    )
  } catch (error) {
    if (error?.name !== 'OwnerReportedError') throw error
  }
  const state = await readRecoverySessionState(fixture)
  if (state.ownerRuns?.['T1:api']?.recoverySession?.phase !== 'settled_failed') {
    throw new Error('failed producer did not durably settle its recovery receipt')
  }
  await holdAfterCheckpoint(fixture, receipt, 'settled_failed')
}

async function produceSettledSucceeded(input) {
  const fixture = await createRecoverySessionFixture({ after() {} }, {
    executable: true,
    temporaryDirectory: input.fixtureParent,
    modelScript: completedOwnerModelScript,
  })
  const receipt = await reserveRecoverySession(fixture)
  const result = await fixture.runtime.reconcileRecoverySession(
    fixture.admissionAgent, fixture.workflowId, request(receipt),
  )
  if (result.outcome !== 'settled_succeeded') {
    throw new Error('successful producer did not complete real Owner settlement')
  }
  await holdAfterCheckpoint(fixture, receipt, 'settled_succeeded')
}

function observeAgentOperations(fixture) {
  const operations = { create: 0, resume: 0, followup: 0 }
  const observeFollowup = agent => {
    if (typeof agent?.followup !== 'function') return agent
    const followup = agent.followup.bind(agent)
    agent.followup = (...args) => {
      operations.followup += 1
      return followup(...args)
    }
    return agent
  }
  observeFollowup(fixture.admissionAgent)
  const create = fixture.ctx.agents.create.bind(fixture.ctx.agents)
  fixture.ctx.agents.create = async (...args) => {
    operations.create += 1
    const handle = await create(...args)
    observeFollowup(handle.agent)
    return handle
  }
  const resume = fixture.ctx.agents.resume.bind(fixture.ctx.agents)
  fixture.ctx.agents.resume = async (...args) => {
    operations.resume += 1
    const handle = await resume(...args)
    observeFollowup(handle.agent)
    return handle
  }
  return operations
}

async function replay(input) {
  const fixture = await reopenRecoverySessionFixture({
    root: input.root,
    workflowId: input.workflowId,
    executable: true,
  })
  try {
    const before = await capture(fixture, input.receipt, input.scenario === 'created' ? { kind: 'jsonl', path: input.rawLocationPath } : undefined)
    // These wrappers remain transparent: they count and immediately delegate
    // to the real source Harness APIs.  The parent itself was created before
    // instrumentation, so the count covers reconciliation only.
    const agentOperations = observeAgentOperations(fixture)
    const result = await fixture.runtime.reconcileRecoverySession(
      fixture.admissionAgent,
      fixture.workflowId,
      input.request,
    )
    const after = await capture(fixture, input.receipt, input.scenario === 'created' ? { kind: 'jsonl', path: input.rawLocationPath } : undefined)
    await send({
      type: 'replayed',
      scenario: input.scenario,
      pid: process.pid,
      result,
      modelRequests: fixture.adapter.requests.length,
      agentOperations,
      before,
      after,
    })
  } finally {
    await fixture.dispose()
  }
}

async function admissionSaveFailure(input) {
  const fixture = await createRecoverySessionFixture({ after() {} }, {
    executable: true, temporaryDirectory: input.fixtureParent,
  })
  const target = statePath(fixture.root, fixture.workflowId)
  const directory = join(fixture.root, '.dsh-workflow', 'workflows')
  const originalWrite = fsPromises.writeFile
  const beforeState = await readFile(target, 'utf8')
  const operations = observeAgentOperations(fixture)
  let injected = false
  let error
  let receipt
  fsPromises.writeFile = async (path, ...args) => {
    if (typeof path === 'string' && path.startsWith(`${target}.tmp-`)) {
      injected = true
      // Real OS write refusal after the admission reducer and write-lock
      // acquisition. Do not replace writeFile with a fabricated exception.
      await fsPromises.chmod(directory, 0o500)
      try {
        return await originalWrite(path, ...args)
      } finally {
        // Let normal Runtime cleanup release its write lock; otherwise a
        // cleanup rmdir error would mask the original temporary-write error.
        await fsPromises.chmod(directory, 0o700)
      }
    }
    return await originalWrite(path, ...args)
  }
  syncBuiltinESMExports()
  try {
    try {
      receipt = await reserveRecoverySession(fixture)
    } catch (caught) {
      error = { ...serializeError(caught), code: caught.code }
    } finally {
      fsPromises.writeFile = originalWrite
      syncBuiltinESMExports()
      await fsPromises.chmod(directory, 0o700)
    }
    await send({ type: 'replayed', pid: process.pid, injected, error, receipt,
      beforeState, afterState: await readFile(target, 'utf8'),
      operations, modelRequests: fixture.adapter.requests.length,
    })
  } finally {
    await fixture.dispose()
  }
}

async function produceAdmissionPending(input) {
  const fixture = await createRecoverySessionFixture({ after() {} }, {
    executable: true, temporaryDirectory: input.fixtureParent,
  })
  const target = statePath(fixture.root, fixture.workflowId)
  const originalWrite = fsPromises.writeFile
  const originalRename = fsPromises.rename
  const beforeState = await readFile(target, 'utf8')
  async function checkpoint(path, bytes) {
    const pending = JSON.parse(bytes)
    const intent = pending.recoveryAdmission?.intents?.[0]
    if (!intent) return
    await send({ type: 'checkpoint', scenario: input.boundary, pid: process.pid,
      root: fixture.root, workflowId: fixture.workflowId, beforeState,
      stateBytes: await readFile(target, 'utf8'), pendingPath: path, pendingBytes: bytes,
      // This is an uncommitted reducer candidate, NOT an admitted receipt.
      candidateIntent: intent, request: request(intent),
      modelRequests: fixture.adapter.requests.length,
      rawPresent: await fixture.readRaw(intent.executionIdentity.sessionId) !== undefined,
    })
    await new Promise(() => {})
  }
  fsPromises.writeFile = async (path, bytes, ...args) => {
    if (input.boundary === 'admission_before_write' && typeof path === 'string'
      && path.startsWith(`${target}.tmp-`)) await checkpoint(path, bytes)
    return await originalWrite(path, bytes, ...args)
  }
  fsPromises.rename = async (from, to) => {
    if (input.boundary === 'admission_before_rename' && to === target
      && typeof from === 'string' && from.startsWith(`${target}.tmp-`)) {
      await checkpoint(from, await readFile(from, 'utf8'))
    }
    return await originalRename(from, to)
  }
  syncBuiltinESMExports()
  try {
    await reserveRecoverySession(fixture)
    throw new Error('admission committed without reaching the requested checkpoint')
  } finally {
    fsPromises.writeFile = originalWrite
    fsPromises.rename = originalRename
    syncBuiltinESMExports()
  }
}

async function replayUncommitted(input) {
  const fixture = await reopenRecoverySessionFixture({ root: input.root, workflowId: input.workflowId, executable: true })
  try {
    const beforeState = await readFile(statePath(fixture.root, fixture.workflowId), 'utf8')
    const operations = observeAgentOperations(fixture)
    const result = await fixture.runtime.reconcileRecoverySession(fixture.admissionAgent, fixture.workflowId, input.request)
    await send({ type: 'replayed', pid: process.pid, result, beforeState,
      afterState: await readFile(statePath(fixture.root, fixture.workflowId), 'utf8'),
      operations, modelRequests: fixture.adapter.requests.length,
      rawPresent: await fixture.readRaw(input.candidateIntent.executionIdentity.sessionId) !== undefined,
    })
  } finally {
    await fixture.dispose()
  }
}

async function produceReserved(input) {
  const fixture = await createRecoverySessionFixture({ after() {} }, {
    executable: true, temporaryDirectory: input.fixtureParent,
  })
  const receipt = await reserveRecoverySession(fixture)
  await send({
    type: 'checkpoint', scenario: 'reserved', pid: process.pid,
    root: fixture.root, workflowId: fixture.workflowId, receipt, request: request(receipt),
    stateBytes: await readFile(statePath(fixture.root, fixture.workflowId), 'utf8'),
    modelRequests: fixture.adapter.requests.length,
    rawPresent: await fixture.readRaw(receipt.executionIdentity.sessionId) !== undefined,
  })
  await new Promise(() => {})
}

async function launchReserved(input) {
  const fixture = await reopenRecoverySessionFixture({
    root: input.root, workflowId: input.workflowId,
    executable: true, modelScript: failedOwnerModelScript,
  })
  try {
    const beforeState = await readFile(statePath(fixture.root, fixture.workflowId), 'utf8')
    const operations = observeAgentOperations(fixture)
    let errorName
    try {
      await fixture.runtime.reconcileRecoverySession(fixture.admissionAgent, fixture.workflowId, input.request)
    } catch (error) {
      if (error.name !== 'OwnerReportedError') throw error
      errorName = error.name
    }
    if (errorName !== 'OwnerReportedError') throw new Error('Expected real failed Owner submission')
    const settled = await capture(fixture, input.receipt)
    const operationsAfterLaunch = { ...operations }
    const modelRequestsAfterLaunch = fixture.adapter.requests.length
    const replay = await fixture.runtime.reconcileRecoverySession(fixture.admissionAgent, fixture.workflowId, input.request)
    const afterReplay = await capture(fixture, input.receipt)
    await send({
      type: 'replayed', pid: process.pid, beforeState, errorName, settled, replay, afterReplay,
      operationsAfterLaunch, operationsAfterReplay: operations,
      modelRequestsAfterLaunch, modelRequestsAfterReplay: fixture.adapter.requests.length,
    })
  } finally {
    await fixture.dispose()
  }
}

async function competeReserved(input) {
  const fixture = await reopenRecoverySessionFixture({
    root: input.root, workflowId: input.workflowId,
    executable: true, modelScript: failedOwnerModelScript,
  })
  try {
    const operations = observeAgentOperations(fixture)
    const go = new Promise(resolve => process.once('message', resolve))
    await send({ type: 'ready', pid: process.pid })
    const release = await go
    if (release?.type !== 'go') throw new Error('competition barrier requires go')
    let result
    let errorName
    try {
      result = await fixture.runtime.reconcileRecoverySession(fixture.admissionAgent, fixture.workflowId, input.request)
    } catch (error) {
      if (error.name !== 'OwnerReportedError') throw error
      errorName = error.name
    }
    await send({ type: 'competed', pid: process.pid, result, errorName, operations, modelRequests: fixture.adapter.requests.length })
  } finally {
    await fixture.dispose()
  }
}

async function produceCandidates(input) {
  const fixture = await createRecoverySessionFixture({ after() {} }, {
    executable: true, includeIndependentOwner: true,
    temporaryDirectory: input.fixtureParent, limits: { totalLimit: 1, problemLimit: 1 },
  })
  // Initial failed-source input, just as the existing fixture seeds T1.
  // No reservation, external recovery or success receipt is manufactured.
  const state = await readRecoverySessionState(fixture)
  state.ownerRuns['T2:worker'] = {
    ...structuredClone(state.ownerRuns['T1:api']),
    taskId: 'T2', stageId: 'T2', ownerId: 'worker', sessionId: 'T2-worker-failed-session',
    branch: `dsh/owner/${fixture.workflowId}/worker`,
    worktree: join(fixture.root, '.dsh-workflow', 'worktrees', fixture.workflowId, 'owners', 'worker'),
  }
  await writeRecoverySessionState(fixture, state)
  await send({ type: 'checkpoint', scenario: 'candidates', pid: process.pid,
    root: fixture.root, workflowId: fixture.workflowId, planDigest: fixture.planDigest,
    stateBytes: await readFile(statePath(fixture.root, fixture.workflowId), 'utf8'),
  })
  await new Promise(() => {})
}

async function competeCredit(input) {
  const fixture = await reopenRecoverySessionFixture({
    root: input.root, workflowId: input.workflowId, executable: true, modelScript: failedOwnerModelScript,
  })
  try {
    const operations = observeAgentOperations(fixture)
    const go = new Promise(resolve => process.once('message', resolve))
    await send({ type: 'ready', pid: process.pid })
    if ((await go)?.type !== 'go') throw new Error('credit barrier requires go')
    const admissionRequest = {
      contract: 'DSH_RECOVERY_ADMISSION_REQUEST_V1', planDigest: input.planDigest,
      taskId: input.taskId, ownerId: input.ownerId,
      source: { kind: 'owner_failure', attempt: 2, sessionId: `${input.taskId}-${input.ownerId}-failed-session` },
    }
    // Same bounded CAS/lease retry as the T20 cross-process fixture. Never
    // retry execution; preserve every contention response in the evidence.
    const admissionErrors = []
    const deadline = Date.now() + 2500
    let receipt
    for (;;) {
      try {
        receipt = await fixture.runtime.reserveRecoveryAdmission(
          fixture.admissionAgent, fixture.workflowId, admissionRequest)
        break
      } catch (error) {
        admissionErrors.push(serializeError(error))
        if (!/状态正在由另一个 Harness 临界区更新|状态已被其他 Harness 更新/u.test(String(error?.message ?? ''))
          || Date.now() >= deadline) throw error
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    }
    let errorName
    let raw
    let rawPath
    if (['reserved', 'replayed'].includes(receipt.outcome)) {
      try {
        await fixture.runtime.reconcileRecoverySession(fixture.admissionAgent, fixture.workflowId, {
          ...request(receipt), taskId: input.taskId, ownerId: input.ownerId,
        })
      } catch (error) {
        if (error.name !== 'OwnerReportedError') throw error
        errorName = error.name
      }
      raw = await fixture.readRaw(receipt.executionIdentity.sessionId)
      rawPath = fixture.ctx.sessionPersistence.locate(raw.meta).path
    }
    await send({ type: 'competed', pid: process.pid, taskId: input.taskId, ownerId: input.ownerId,
      receipt, admissionErrors, errorName, operations, modelRequests: fixture.adapter.requests.length, raw, rawPath,
    })
  } finally {
    await fixture.dispose()
  }
}

async function dispatch(input) {
  switch (input?.mode) {
    case 'admission_save_failure': return await admissionSaveFailure(input)
    case 'produce_first_append': return await produceFirstAppend(input)
    case 'produce_admission_pending': return await produceAdmissionPending(input)
    case 'replay_uncommitted': return await replayUncommitted(input)
    case 'produce_settlement_pending': return await produceSettlementPending(input)
    case 'produce_candidates': return await produceCandidates(input)
    case 'compete_credit': return await competeCredit(input)
    case 'compete_reserved': return await competeReserved(input)
    case 'produce_reserved': return await produceReserved(input)
    case 'launch_reserved': return await launchReserved(input)
    case 'produce_created':
      return await produceCreated(input)
    case 'produce_submitted':
      return await produceSubmitted(input)
    case 'produce_settled_failed':
      return await produceSettledFailed(input)
    case 'produce_settled_succeeded':
      return await produceSettledSucceeded(input)
    case 'produce_fixture_error':
      // Fail after the real Git/worktree fixture exists but before any
      // checkpoint reveals its root to the parent.
      await createRecoverySessionFixture({ after() {} }, {
        executable: true,
        temporaryDirectory: input.fixtureParent,
      })
      throw new Error('controlled pre-checkpoint failure')
    case 'replay':
      return await replay(input)
    default:
      throw new Error(`unknown restart child mode ${String(input?.mode)}`)
  }
}

process.once('message', input => {
  void dispatch(input).catch(async error => {
    await send({ type: 'error', pid: process.pid, error: serializeError(error) })
  }).finally(() => {
    if (process.connected) process.disconnect()
  })
})

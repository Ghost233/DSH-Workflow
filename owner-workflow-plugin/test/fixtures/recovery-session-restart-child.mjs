import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { RECOVERY_SESSION_REQUEST_CONTRACT } from '../../src/recovery-session.mjs'
import {
  createRecoverySessionFixture,
  readRecoverySessionState,
  reopenRecoverySessionFixture,
  reserveRecoverySession,
} from './recovery-session-fixture.mjs'

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
    const saved = await persistSession(...args)
    if (location?.kind !== 'jsonl') throw new Error('created session has no physical target location')
    await holdAfterCheckpoint(fixture, receipt, 'created', location)
    return saved
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
    const saved = await persistSubmitted(...args)
    await holdAfterCheckpoint(fixture, receipt, 'submitted')
    return saved
  }
  await fixture.runtime.reconcileRecoverySession(
    fixture.admissionAgent,
    fixture.workflowId,
    request(receipt),
  )
  throw new Error('submitted producer completed after its kill checkpoint')
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
    process.disconnect?.()
  }
}

async function dispatch(input) {
  switch (input?.mode) {
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
    try {
      await send({ type: 'error', pid: process.pid, error: serializeError(error) })
    } finally {
      process.disconnect?.()
    }
  })
})

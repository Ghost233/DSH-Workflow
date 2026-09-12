import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  createPublicOwnerChangeLog,
  projectPublicOwnerChange,
  publicOwnerContextDigest,
  registerPublicOwnerChangeDecision,
  registerPublicOwnerChangeRequest,
  PUBLIC_OWNER_CHANGE_DECISION_CONTRACT,
  PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT,
} from '../src/public-owner-change.mjs'
import {
  createRecoverySessionFixture,
  readRecoverySessionState,
} from './fixtures/recovery-session-fixture.mjs'

const hash = character => character.repeat(64)

function publicContext(f, overrides = {}) {
  return {
    workflowId: f.workflowId,
    planRevision: 1,
    planDigest: f.planDigest,
    owners: ['session', 'interface', 'cache'],
    tickets: [{ id: 'T-06', revision: 'R4' }],
    acceptanceCriteria: ['AC-06', 'AC-29'],
    contracts: [
      { id: 'shared-session', revision: 'K1', ownerId: 'session' },
      { id: 'interface-contract', revision: 'A1', ownerId: 'interface' },
      { id: 'cache-contract', revision: 'B1', ownerId: 'cache' },
    ],
    evidenceRefs: ['ev-gap', 'ev-session', 'ev-interface', 'ev-cache'],
    consumerInventoryComplete: true,
    consumers: [
      { consumerId: 'interface-ui', ownerId: 'interface', contract: { id: 'interface-contract', revision: 'A1' }, evidenceRefs: ['ev-interface'] },
      { consumerId: 'cache-recovery', ownerId: 'cache', contract: { id: 'cache-contract', revision: 'B1' }, evidenceRefs: ['ev-cache'] },
    ],
    ...overrides,
  }
}

function changeRequest(ctx) {
  return {
    contract: PUBLIC_OWNER_CHANGE_REQUEST_CONTRACT,
    requestId: 'ca01-interface-reset', requestVersion: 1,
    requesterOwnerId: 'interface', targetOwnerId: 'session',
    source: { tickets: [{ id: 'T-06', revision: 'R4' }], acceptanceCriteria: ['AC-06', 'AC-29'] },
    baseline: {
      workflowId: ctx.workflowId, planRevision: ctx.planRevision, planDigest: ctx.planDigest,
      contract: { id: 'shared-session', revision: 'K1' }, contextDigest: publicOwnerContextDigest(ctx),
    },
    expectedBehavior: 'A disconnects without removing B recovery cache.',
    actualGap: 'A requested a global cache clear that would invalidate B recovery.',
    evidenceRefs: ['ev-gap'],
    suggestion: 'S should add a compatible interface-only reset K2.',
    supersedesRequestDigest: null,
  }
}

function compatibleDecision(accepted, overrides = {}) {
  return {
    contract: PUBLIC_OWNER_CHANGE_DECISION_CONTRACT,
    decisionId: 'ca01-interface-reset-decision',
    requestId: accepted.request.requestId,
    requestVersion: accepted.request.requestVersion,
    requestDigest: accepted.requestDigest,
    targetOwnerId: 'session',
    baseline: structuredClone(accepted.request.baseline),
    outcome: 'compatible_extension',
    summary: 'S can add K2 while preserving B recovery.',
    basisRefs: ['ev-session'],
    affectedConsumers: [
      { consumerId: 'interface-ui', ownerId: 'interface', impact: 'compatible', evidenceRefs: ['ev-interface'] },
      { consumerId: 'cache-recovery', ownerId: 'cache', impact: 'no_change', evidenceRefs: ['ev-cache'] },
    ],
    contractChange: { nextRevision: 'K2', behavior: 'Reset interface state only.', compatibility: 'K1 cache recovery remains valid.' },
    migrationOrder: [], alternative: null, unknowns: [], businessChange: null,
    ...overrides,
  }
}

function captureSubagents(fixture) {
  const original = fixture.ctx.agents.create.bind(fixture.ctx.agents)
  const captured = []
  fixture.ctx.agents.create = async (...args) => {
    const handle = await original(...args)
    if (args[0]?.meta?.origin === 'subagent') captured.push(handle.agent)
    return handle
  }
  return captured
}

function runPublicSession(f, prompt, signal, options = {}) {
  return f.runtime.runChild(f.admissionAgent, f.workflowWorktree, prompt, signal, {
    role: 'owner-advisor',
    workflowRoot: f.root,
    workflowId: f.workflowId,
    timeoutMs: 5_000,
    rolePrompt: '你是公共Session Owner的只读判断会话。只核对固定请求与消费者事实，不修改代码、DAG或Registry；返回DSH_PUBLIC_OWNER_CHANGE_DECISION_V1。',
    ...options,
  })
}

async function waitFor(read, label, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await read()
    if (value !== undefined && value !== false) return value
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(`${label} not observed`)
}

test('T08 real Harness read-only S session returns a T06-compatible decision to the main adapter', { timeout: 30_000 }, async t => {
  let payload
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    modelScript: m => [() => m.textResponse(JSON.stringify(payload))],
  })
  const ctx = publicContext(f)
  const accepted = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), changeRequest(ctx), ctx)
  payload = compatibleDecision(accepted)
  const before = await readRecoverySessionState(f)
  const children = captureSubagents(f)
  const output = await runPublicSession(f, JSON.stringify(accepted.request))
  const decided = registerPublicOwnerChangeDecision(accepted.log, JSON.parse(output), ctx)
  assert.equal(projectPublicOwnerChange(decided.log, accepted.request.requestId, ctx).action, 'implement_public_extension')
  assert.deepEqual(await readRecoverySessionState(f), before)
  assert.equal(children.length, 1)
  assert.equal(children[0].session.header.parentSession, f.admissionAgent.id)
  assert.ok(children[0].session.events.some(event => event.type === 'sandbox/mode' && event.data?.mode === 'read-only'))
  assert.ok(children[0].session.events.some(event => event.type === 'approval/policy' && event.data?.policy === 'never'))
  assert.ok(JSON.stringify(children[0].session.events).includes(PUBLIC_OWNER_CHANGE_DECISION_CONTRACT))
  assert.equal(await f.readRaw(children[0].id), undefined)
  assert.equal(f.runtime.activeOwners.size, 0)
})

test('T08 public Owner cannot write its module before returning the fixed decision', { timeout: 30_000 }, async t => {
  let payload
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    modelScript: m => [
      m.toolCallResponse('t08-write-attempt', 'bash', {
        command: "mkdir -p src/session && printf tamper > src/session/forbidden.txt",
        description: 'attempt forbidden public module write',
      }),
      () => m.textResponse(JSON.stringify(payload)),
    ],
  })
  const ctx = publicContext(f)
  const accepted = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), changeRequest(ctx), ctx)
  payload = compatibleDecision(accepted)
  const children = captureSubagents(f)
  const output = await runPublicSession(f, JSON.stringify(accepted.request))
  assert.equal(registerPublicOwnerChangeDecision(accepted.log, JSON.parse(output), ctx).outcome, 'accepted')
  await assert.rejects(readFile(`${f.workflowWorktree}/src/session/forbidden.txt`, 'utf8'), { code: 'ENOENT' })
  const events = JSON.stringify(children[0].session.events)
  assert.ok(events.includes('t08-write-attempt'))
  assert.match(events, /read-only|sandbox|not permitted|denied|拒绝/iu)
})

test('T08 a wrong public Owner identity cannot become a decision even after a real model turn', { timeout: 30_000 }, async t => {
  let payload
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    modelScript: m => [() => m.textResponse(JSON.stringify(payload))],
  })
  const ctx = publicContext(f)
  const accepted = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), changeRequest(ctx), ctx)
  payload = compatibleDecision(accepted, { targetOwnerId: 'cache' })
  const children = captureSubagents(f)
  const output = await runPublicSession(f, JSON.stringify(accepted.request))
  assert.throws(() => registerPublicOwnerChangeDecision(accepted.log, JSON.parse(output), ctx), /DECISION_REQUEST_MISMATCH/u)
  assert.ok(JSON.stringify(children[0].session.events).includes('\\"targetOwnerId\\":\\"cache\\"'))
  assert.equal(projectPublicOwnerChange(accepted.log, accepted.request.requestId, ctx).status, 'pending')
})

test('T08 K1 changing while S is deciding makes its real late K1 response stale', { timeout: 30_000 }, async t => {
  let payload
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    modelScript: m => [() => m.textResponse(JSON.stringify(payload))],
  })
  const ctx = publicContext(f)
  const accepted = registerPublicOwnerChangeRequest(createPublicOwnerChangeLog(), changeRequest(ctx), ctx)
  payload = compatibleDecision(accepted)
  const original = f.adapter.stream.bind(f.adapter)
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  f.adapter.stream = async function* (options) {
    entered.resolve()
    await release.promise
    yield* original(options)
  }
  const execution = runPublicSession(f, JSON.stringify(accepted.request))
  await entered.promise
  const changed = publicContext(f, {
    planRevision: 2,
    planDigest: hash('b'),
    contracts: publicContext(f).contracts.map(item => item.id === 'shared-session' ? { ...item, revision: 'K2' } : item),
  })
  release.resolve()
  const output = await execution
  assert.throws(() => registerPublicOwnerChangeDecision(accepted.log, JSON.parse(output), changed), /STALE_BASELINE/u)
  assert.deepEqual(projectPublicOwnerChange(accepted.log, accepted.request.requestId, changed), {
    status: 'stale', ready: false, action: 'request_new_version', requestDigest: accepted.requestDigest,
  })
})

test('T08 timeout and parent cancellation both terminate the read-only judgment without a decision', { timeout: 30_000 }, async t => {
  const timeoutFixture = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    modelScript: () => ['hang-slow'],
  })
  const timeoutChildren = captureSubagents(timeoutFixture)
  await assert.rejects(runPublicSession(timeoutFixture, 'wait forever', undefined, { timeoutMs: 50 }), /超过 50ms/u)
  assert.equal(timeoutChildren.length, 1)
  assert.ok(timeoutChildren[0].session.events.some(event => event.type === 'turn/end'))

  const cancelFixture = await createRecoverySessionFixture(t, {
    workflowId: 'wf-public-owner-cancel',
    executable: true,
    includePublicOwnerScenario: true,
    modelScript: () => ['hang-slow'],
  })
  const cancelChildren = captureSubagents(cancelFixture)
  const controller = new AbortController()
  const cancelled = runPublicSession(cancelFixture, 'cancel this judgment', controller.signal)
  await waitFor(() => cancelFixture.adapter.requests.length === 1, 'public Owner request')
  controller.abort(new Error('T08 parent cancelled'))
  await assert.rejects(cancelled)
  assert.equal(cancelChildren.length, 1)
  assert.ok(cancelChildren[0].session.events.some(event => event.type === 'turn/end'))
  assert.equal(cancelFixture.runtime.activeOwners.size, 0)
})

test('T08 current generic consultation seam has no Runner capacity reservation', { timeout: 30_000 }, async t => {
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    includePublicOwnerScenario: true,
    modelScript: m => [m.textResponse('session finished'), m.textResponse('cache finished')],
  })
  const original = f.adapter.stream.bind(f.adapter)
  const bothEntered = Promise.withResolvers()
  const release = Promise.withResolvers()
  let entered = 0
  f.adapter.stream = async function* (options) {
    entered += 1
    if (entered === 2) bothEntered.resolve()
    await release.promise
    yield* original(options)
  }
  const session = runPublicSession(f, 'S judgment')
  const cache = runPublicSession(f, 'B independent read-only check', undefined, {
    rolePrompt: '你是Cache Owner的独立只读核对会话。',
  })
  await bothEntered.promise
  assert.equal(entered, 2)
  assert.equal(f.runtime.activeOwners.size, 0)
  release.resolve()
  assert.deepEqual((await Promise.all([session, cache])).sort(), ['cache finished', 'session finished'])
  assert.equal(f.runtime.activeOwners.size, 0)
})

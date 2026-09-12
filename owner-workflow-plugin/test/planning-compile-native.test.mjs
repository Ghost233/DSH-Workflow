import { planningActivateDefinition, planningCompileDefinition, planningReviewDefinition, planningRevisionCheckpointDefinition, planReviewSubmitDefinition } from '../index.js'
import { execFile as execFileCallback, fork as forkChild } from 'node:child_process'
import { createHash } from 'node:crypto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, readFile, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { fixture, manifest, writeBoundDocuments, git } from './fixtures/planning-authority-native.mjs'
import { ensureRegistry, proposeRegistryChange, applyApprovedRegistryChange } from '../src/registry.mjs'
import { ownerTaskPrompt } from '../src/owner-agent.mjs'
import { createRecoverySessionFixture } from './fixtures/recovery-session-fixture.mjs'
import { persistPlanningReviewReceipt, readPlanningReviewReceipt } from '../src/planning-review.mjs'
import { readPlanningCandidate } from '../src/planning-candidate.mjs'

const execFile = promisify(execFileCallback)
const revisionRestartChild = fileURLToPath(new URL('./fixtures/planning-revision-restart-child.mjs', import.meta.url))

async function runRevisionRestartChild(mode, root, workflowId) {
  const result = await execFile(process.execPath, [revisionRestartChild, mode, root, workflowId], {
    encoding: 'utf8',
  })
  return JSON.parse(result.stdout)
}

function childMessage(child, expectedType, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`child did not send ${expectedType}`)), timeoutMs)
    const onMessage = message => {
      if (message?.type === expectedType) finish(undefined, message)
    }
    const onExit = (code, signal) => finish(new Error(`child exited before ${expectedType}: ${String(code ?? signal)}`))
    const finish = (error, message) => {
      clearTimeout(timeout)
      child.off('message', onMessage)
      child.off('exit', onExit)
      if (error !== undefined) reject(error)
      else resolve(message)
    }
    child.on('message', onMessage)
    child.once('exit', onExit)
  })
}

async function holdStaleOwnerProcess(t, root, workflowId) {
  const child = forkChild(revisionRestartChild, ['late_receipt_wait', root, workflowId], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  })
  t.after(() => { if (child.exitCode === null) child.kill() })
  await childMessage(child, 'ready')
  return async () => {
    const result = childMessage(child, 'late_receipt')
    child.send({ type: 'attempt' })
    return await result
  }
}

async function prepared(t) {
  const value = await fixture(t, { setup: async root => {
    let registry = await ensureRegistry(root)
    for (const id of ['s', 'a', 'b']) {
      const proposal = proposeRegistryChange(registry, { type: 'add', owner: {
        id, name: id, description: `${id} 模块`, scope: [`src/${id}/**`], exclude: [],
      }, reason: '临时夹具的既定模块边界' })
      registry = await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    }
  } })
  if (!value) return
  const [{ default: Registry }, { default: Questions }] = await Promise.all([
    import('../../deepseek-harness/packages/core/agent/lib/index.js'),
    import('../../deepseek-harness/packages/interaction/user-questions/lib/index.js'),
  ])
  const registry = await value.ctx.plugin(Registry), questions = await value.ctx.plugin(Questions)
  value.ctx.agents.enter(value.agent, undefined)
  let asked = 0
  const dispose = value.ctx.userQuestions.registerProvider({ ask: async request => {
    asked += 1
    const q = request.questions[0]
    return { answers: [{ id: q.id, selected: [q.options[0].label] }] }
  } })
  t.after(async () => { dispose(); await questions.dispose(); await registry.dispose() })
  const chains = await writeBoundDocuments(value)
  const checkpoint = await value.runtime.checkpointPlanningDocuments(value.agent, {
    id: 'compile-source', manifest: manifest(value.documents), baseline: value.baseline, chains, reason: '固定编排来源',
  }, { callId: 'checkpoint-before-compile', signal: new AbortController().signal })
  return { ...value, checkpoint, asked: () => asked }
}

function planFor(value) {
  return { contract: 'DSH_PLAN_V2', registryDigest: '0'.repeat(64), summary: 'S/A/B共同贡献完整业务Ticket',
    owners: ['s', 'a', 'b'].map(id => ({ id })),
    verifications: [{ id: 'unit', run: [process.execPath, '--test'] }],
    tasks: ['s', 'a', 'b'].map((id, i) => ({ id: `task-${id}`, ownerId: id, role: 'work',
      dependsOn: i === 0 ? [] : [`task-${['s', 'a', 'b'][i - 1]}`], write: [`src/${id}/code.js`], verify: ['unit'], done: [`${id}贡献`] })),
    planningBindings: { contract: 'DSH_PLANNING_BINDINGS_V1', snapshotId: value.checkpoint.snapshot.id,
      sourceDigest: value.checkpoint.sourceDigest, tasks: ['s', 'a', 'b'].map(id => ({ taskId: `task-${id}`,
        tickets: [{ id: 'T25', revision: 'R1', fragments: ['source-chain'] }],
        contracts: [{ id: 'planning-source-chain-v1', revision: 'v1' }] })) },
  }
}

// The native Registry/Questions/files/Git are real. This is the external
// Subagent-service double, not a real model: production runChild and structured
// submitPlannerPlan execute unchanged and consume the provider's response.
function plannerBackend(value, raw) {
  const requests = []
  value.runtime.subagentRuntime = () => ({ start: async (_provider, request) => {
    const pending = value.runtime.pendingChildStarts.get(request.prompt)
    assert.equal(pending.options.role, 'planner')
    assert.equal(pending.options.requirePlannerSubmission, true)
    requests.push(request)
    const id = `controlled-planner-${requests.length}`
    const child = { id, session: { id, header: { id, cwd: value.root } } }
    value.runtime.agentRoles.set(id, { ...pending.options, parentId: value.agent.id })
    value.runtime.submitPlannerPlan(child, structuredClone(raw))
    return { localAgent: child, result: Promise.resolve({ stopReason: 'completed', output: [] }), dispose: async () => {} }
  } })
  return requests
}

test('真实Runtime经生产Planner提交路径编排固定快照；Owner提示保留完整Ticket，未激活Workflow', async t => {
  const value = await prepared(t)
  if (!value) return
  await writeFile(join(value.root, value.documents.spec.path), 'mutable-spec-is-not-the-source\n')
  await writeFile(join(value.root, value.documents.ticket.path), 'mutable-ticket-is-not-the-source\n')
  const beforeIndex = await readFile(join(value.root, '.git/index'))
  const requests = plannerBackend(value, planFor(value))
  await assert.rejects(value.runtime.compilePlanningCheckpoint({ ...value.agent }, 'compile-source', {}), /实际根主线程/)
  assert.equal(requests.length, 0)
  const output = await planningCompileDefinition(value.runtime).execute({ checkpoint_id: 'compile-source' }, { agent: value.agent, callId: 'compile', signal: new AbortController().signal })
  const candidate = output
  assert.equal(requests.length, 1)
  const prompt = requests[0].prompt[0].text
  assert.ok(prompt.includes(JSON.stringify(value.documents.finalSpec)))
  assert.doesNotMatch(prompt, /mutable-spec-is-not-the-source/)
  assert.equal(candidate.activationAuthorized, false)
  assert.equal(candidate.packages.packages.length, 3)
  assert.equal(candidate.snapshot.authorization.id, value.checkpoint.snapshot.authorization.id)
  assert.equal(value.asked(), 1)
  assert.deepEqual(await readPlanningCandidate({ root: candidate.root, id: candidate.id }), candidate)
  for (const task of candidate.plan.tasks) {
    const owner = candidate.plan.owners.find(owner => owner.id === task.ownerId)
    const ownerPrompt = ownerTaskPrompt({ plan: candidate.plan, planningSnapshot: candidate.snapshot,
      planningPackages: candidate.packages }, task, owner, [task])
    assert.ok(ownerPrompt.includes('final ticket content.'))
    assert.ok(ownerPrompt.includes('AC-27'))
    assert.doesNotMatch(ownerPrompt, /mutable-ticket-is-not-the-source/)
    assert.throws(() => ownerTaskPrompt({ plan: candidate.plan, planningSnapshot: candidate.snapshot,
      planningPackages: candidate.packages }, task, { ...owner, id: 'not-the-owner' }, [task]))
  }
  assert.equal(await git(value.root, 'rev-parse', 'HEAD'), value.checkpoint.checkpointCommit)
  assert.deepEqual(await readFile(join(value.root, '.git/index')), beforeIndex)
  assert.equal((await value.runtime.preflightWorkflow(value.agent)).activeWorkflowId, null)
  assert.equal((await readdir(join(value.root, '.dsh-workflow/planning-candidates'))).length, 1)
  const altered = structuredClone(candidate)
  altered.packages.packages[0].task.ownerId = 'b'
  await writeFile(join(value.root, '.dsh-workflow/planning-candidates', `${candidate.id}.json`), JSON.stringify(altered))
  await assert.rejects(readPlanningCandidate({ root: candidate.root, id: candidate.id }))
})

test('丢失ready片段映射由实际Planner校验拒绝，有限两次后不发布候选', async t => {
  const value = await prepared(t)
  if (!value) return
  const raw = planFor(value)
  raw.planningBindings.tasks[0].tickets[0].fragments = ['unknown-fragment']
  const requests = plannerBackend(value, raw)
  await assert.rejects(value.runtime.compilePlanningCheckpoint(value.agent, 'compile-source', { callId: 'invalid-compile' }), /FRAGMENT/)
  assert.equal(requests.length, 2)
  await assert.rejects(readdir(join(value.root, '.dsh-workflow/planning-candidates')), { code: 'ENOENT' })
  assert.equal(await git(value.root, 'rev-parse', 'HEAD'), value.checkpoint.checkpointCommit)
})

function reviewBackend(value, raw, { omitCallId = false, mutate } = {}) {
  const requests = []
  value.runtime.subagentRuntime = () => ({ start: async (_provider, request) => {
    const pending = value.runtime.pendingChildStarts.get(request.prompt)
    assert.equal(pending.options.role, 'plan-reviewer')
    requests.push(request)
    const id = `controlled-reviewer-${requests.length}`
    const child = { id, session: { id, header: { id, cwd: value.root } } }
    value.runtime.agentRoles.set(id, { ...pending.options, parentId: value.agent.id })
    await mutate?.()
    await planReviewSubmitDefinition(value.runtime).execute({ review: structuredClone(raw) }, {
      agent: child, ...(omitCallId ? {} : { callId: `review-call-${requests.length}` }),
    })
    return { localAgent: child, result: Promise.resolve({ stopReason: 'completed', output: [] }), dispose: async () => {} }
  } })
  return requests
}
const passedReview = { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: 'fixed candidate reviewed',
  issues: [], targetTaskIds: [], decisionQuestions: [], discoveryQuestions: [], obligationClosures: [] }

test('固定候选通过独立Reviewer工具提交后持久保存原始来源，passed不激活', async t => {
  const value = await prepared(t)
  if (!value) return
  plannerBackend(value, planFor(value))
  const candidate = await value.runtime.compilePlanningCheckpoint(value.agent, 'compile-source', {})
  const beforeIndex = await readFile(join(value.root, '.git/index'))
  const requests = reviewBackend(value, passedReview)
  const receipt = await planningReviewDefinition(value.runtime).execute({ candidate_id: candidate.id }, { agent: value.agent, callId: 'review-root' })
  assert.equal(requests.length, 1)
  assert.ok(requests[0].prompt[0].text.includes(JSON.stringify(value.documents.finalTicket)))
  assert.equal(receipt.candidateId, candidate.id)
  assert.equal(receipt.source.callId, 'review-call-1')
  assert.equal(receipt.source.sessionId, 'controlled-reviewer-1')
  assert.equal(receipt.source.parentId, value.agent.id)
  assert.deepEqual(receipt.source.rawReview, passedReview)
  assert.equal(receipt.review.status, 'passed')
  assert.equal(receipt.activationAuthorized, false)
  assert.equal(value.asked(), 1)
  assert.deepEqual(await readPlanningReviewReceipt({ root: receipt.root, id: receipt.id }), receipt)
  assert.deepEqual(await readFile(join(value.root, '.git/index')), beforeIndex)
  assert.equal(await git(value.root, 'rev-parse', 'HEAD'), candidate.snapshot.codeBaseline.checkpointCommit)
  assert.equal((await value.runtime.preflightWorkflow(value.agent)).activeWorkflowId, null)
  const tampered = structuredClone(receipt)
  tampered.source.callId = 'forged'
  await writeFile(join(value.root, '.dsh-workflow/planning-reviews', `${receipt.id}.json`), JSON.stringify(tampered))
  await assert.rejects(readPlanningReviewReceipt({ root: receipt.root, id: receipt.id }), /RECEIPT_CHANGED/)
})

test('固定候选Reviewer缺少原始调用来源时两次后拒绝，无审查回执', async t => {
  const value = await prepared(t)
  if (!value) return
  plannerBackend(value, planFor(value))
  const candidate = await value.runtime.compilePlanningCheckpoint(value.agent, 'compile-source', {})
  const requests = reviewBackend(value, passedReview, { omitCallId: true })
  await assert.rejects(value.runtime.reviewPlanningCandidate(value.agent, candidate.id, {}), /原始工具调用来源/)
  assert.equal(requests.length, 2)
  await assert.rejects(readdir(join(value.root, '.dsh-workflow/planning-reviews')), { code: 'ENOENT' })
})

test('Reviewer改写当前规划文档即使仍为相同Git dirty状态也不能发布回执', async t => {
  const value = await prepared(t)
  if (!value) return
  plannerBackend(value, planFor(value))
  const candidate = await value.runtime.compilePlanningCheckpoint(value.agent, 'compile-source', {})
  await writeFile(join(value.root, value.documents.spec.path), 'already dirty before review')
  reviewBackend(value, passedReview, { mutate: () => writeFile(join(value.root, value.documents.spec.path), 'changed while reviewing') })
  await assert.rejects(value.runtime.reviewPlanningCandidate(value.agent, candidate.id, {}), /改变了审查现场/)
  await assert.rejects(readdir(join(value.root, '.dsh-workflow/planning-reviews')), { code: 'ENOENT' })
})

test('真实agents.create/provider与原生工具提交保留候选身份和独立审查原始来源', async t => {
  const value = await prepared(t)
  if (!value) return
  plannerBackend(value, planFor(value))
  const candidate = await value.runtime.compilePlanningCheckpoint(value.agent, 'compile-source', {})
  const f = await createRecoverySessionFixture(t, { modelScript: m => [
    m.toolCallResponse('native-review-call', 'workflow_plan_review_submit', { review: passedReview }),
    m.textResponse('review submitted'),
  ] })
  f.ctx.tools.register(planReviewSubmitDefinition(f.runtime))
  let source
  const review = await f.runtime.runChild(f.admissionAgent, value.root, JSON.stringify(candidate), undefined, {
    role: 'plan-reviewer', workflowRoot: value.root, workflowId: `candidate-${candidate.id}`,
    requirePlanReviewSubmission: true, planningCandidateId: candidate.id, timeoutMs: 10000,
    onStructuredSubmission: value => { source = value },
  })
  assert.equal(source.candidateId, candidate.id)
  assert.equal(source.callId, 'native-review-call')
  assert.equal(source.parentId, f.admissionAgent.id)
  assert.notEqual(source.sessionId, f.admissionAgent.id)
  assert.deepEqual(source.rawReview, passedReview)
  const receipt = await persistPlanningReviewReceipt({ root: candidate.root, candidateId: candidate.id,
    planDigest: createHash('sha256').update(JSON.stringify(candidate.plan)).digest('hex'), registryDigest: candidate.plan.registryDigest,
    authorizationId: candidate.snapshot.authorization.id, orchestratorId: f.admissionAgent.id, source, review })
  assert.deepEqual(await readPlanningReviewReceipt({ root: candidate.root, id: receipt.id }), receipt)
  assert.equal(receipt.activationAuthorized, false)
})

async function reviewedCandidate(value, suffix = '') {
  const plan = planFor(value)
  plan.summary += suffix
  plannerBackend(value, plan)
  const candidate = await value.runtime.compilePlanningCheckpoint(value.agent, 'compile-source', {})
  reviewBackend(value, passedReview)
  const receipt = await value.runtime.reviewPlanningCandidate(value.agent, candidate.id, {})
  return { candidate, receipt }
}

test('同一固定父快照的两个候选竞争时只有一个完整Workflow可见', async t => {
  const value = await prepared(t)
  if (!value) return
  const first = await reviewedCandidate(value, '-first')
  const second = await reviewedCandidate(value, '-second')
  assert.notEqual(first.candidate.id, second.candidate.id)
  const outcomes = await Promise.allSettled([
    value.runtime.activatePlanningCandidate(value.agent, first.candidate.id, first.receipt.id, {}),
    value.runtime.activatePlanningCandidate(value.agent, second.candidate.id, second.receipt.id, {}),
  ])
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(outcomes.filter(item => item.status === 'rejected').length, 1)
  const workflows = await readdir(join(value.root, '.dsh-workflow/workflows'))
  assert.equal(workflows.length, 1)
  const state = JSON.parse(await readFile(join(value.root, '.dsh-workflow/workflows', workflows[0]), 'utf8'))
  assert.equal(state.status, 'approved')
  assert.ok([first.candidate.id, second.candidate.id].includes(state.planningCandidateId))
  assert.equal(state.planRevisions.length, 1)
})

test('worktree就绪但状态未发布的激活可恢复，期间preflight拒绝另一条图', async t => {
  const value = await prepared(t)
  if (!value) return
  const { candidate, receipt } = await reviewedCandidate(value)
  const activated = await value.runtime.activatePlanningCandidate(value.agent, candidate.id, receipt.id, {})
  const journalPath = join(value.root, '.dsh-workflow/planning-activations', `${candidate.id}.json`)
  const statePath = join(value.root, '.dsh-workflow/workflows', `${activated.activation.workflowId}.json`)
  const journal = JSON.parse(await readFile(journalPath, 'utf8'))
  await writeFile(journalPath, JSON.stringify({ ...journal, phase: 'worktree_ready' }))
  await unlink(statePath)
  const pending = await value.runtime.preflightWorkflow(value.agent)
  assert.equal(pending.canStart, false)
  assert.deepEqual(pending.planningActivationPending, [candidate.id])
  assert.equal(pending.activeWorkflowId, null)
  const resumed = await value.runtime.activatePlanningCandidate(value.agent, candidate.id, receipt.id, {})
  assert.equal(resumed.activation.phase, 'active')
  const state = JSON.parse(await readFile(statePath, 'utf8'))
  assert.equal(state.planningCandidateId, candidate.id)
  assert.equal(state.status, 'approved')
  assert.equal((await readdir(join(value.root, '.dsh-workflow/workflows'))).length, 1)
})

test('固定候选与独立审查在一个持久事务中激活完整Workflow，重放不创建第二版本', async t => {
  const value = await prepared(t)
  if (!value) return
  const { candidate, receipt } = await reviewedCandidate(value)
  const beforeIndex = await readFile(join(value.root, '.git/index'))
  const first = await planningActivateDefinition(value.runtime).execute({
    candidate_id: candidate.id,
    review_id: receipt.id,
  }, { agent: value.agent, callId: 'activate-first' })
  assert.equal(first.contract, 'DSH_PLANNING_ACTIVATED_V1')
  assert.equal(first.activation.phase, 'active')
  assert.equal(first.workflow.status, 'approved')
  assert.equal(first.workflow.planApproved, true)
  const statePath = join(value.root, '.dsh-workflow/workflows', `${first.activation.workflowId}.json`)
  const state = JSON.parse(await readFile(statePath, 'utf8'))
  assert.equal(state.planningCandidateId, candidate.id)
  assert.equal(state.planningReviewReceiptId, receipt.id)
  assert.equal(state.planningAuthorizationId, candidate.snapshot.authorization.id)
  assert.deepEqual(state.planningSnapshot, candidate.snapshot)
  assert.deepEqual(state.planningPackages, candidate.packages)
  assert.equal(state.planReview.status, 'passed')
  assert.equal(state.planApproved, true)
  assert.deepEqual(state.recoveryRuntimePolicy, {
    contract: 'DSH_RECOVERY_RUNTIME_POLICY_V1', version: 1,
    source: 'R92-T19-REPRESENTATIVE-V1', recoveryProtocol: 'DSH_RECOVERY_ADMISSION_V1',
    totalLimit: 12, problemLimit: 8, ownerAttemptDeadline: 'approved_task_on_timeout',
    ownerTerminationObservationMs: 30_000,
  })
  assert.equal(state.recoveryRuntimeRequired, 'DSH_RECOVERY_RUNTIME_POLICY_V1')
  assert.equal(state.recoveryProtocol, 'DSH_RECOVERY_ADMISSION_V1')
  assert.deepEqual(state.recoveryAdmissionConfig, {
    contract: 'DSH_RECOVERY_ADMISSION_CONFIG_V1', executionVersion: state.planDigest,
    totalLimit: 12, problemLimit: 8,
  })
  assert.equal(state.activePlanRevision, 1)
  assert.equal(state.planRevisions.length, 1)
  assert.equal(state.tasks.length, candidate.plan.tasks.length)
  assert.ok(state.tasks.every(task => task.status === 'pending' && task.planRevision === 1))
  assert.deepEqual(await readFile(join(value.root, '.git/index')), beforeIndex)
  assert.equal((await value.runtime.preflightWorkflow(value.agent)).activeWorkflowId, state.id)
  assert.equal(await git(value.root, 'rev-parse', 'HEAD'), candidate.snapshot.codeBaseline.checkpointCommit)

  const replay = await value.runtime.activatePlanningCandidate(value.agent, candidate.id, receipt.id, {})
  assert.equal(replay.activation.workflowId, state.id)
  const replayedState = JSON.parse(await readFile(statePath, 'utf8'))
  assert.equal(replayedState.revision, state.revision)
  assert.equal(replayedState.planRevisions.length, 1)
  assert.equal((await readdir(join(value.root, '.dsh-workflow/workflows'))).length, 1)

  const manifest = await value.runtime.ensureControlBridge(value.agent, replayedState)
  const started = await value.runtime.dispatchControlRequest({
    contract: manifest.contract,
    id: 'activation-supervisor-start',
    workflowId: state.id,
    token: manifest.token,
    action: 'supervisor-start',
    parallel: 2,
  })
  assert.equal(started.status, 'running')
  const next = await value.runtime.dispatchControlRequest({
    contract: manifest.contract,
    id: 'activation-supervisor-next',
    workflowId: state.id,
    token: manifest.token,
    action: 'supervisor-next',
  })
  assert.equal(next.action, 'create')
  assert.deepEqual(next.tasks.map(task => task.taskId), ['task-s'])
})

test('T19 legacy active Workflow replay is not silently enrolled into the new recovery policy', async t => {
  const value = await prepared(t)
  if (!value) return
  const { candidate, receipt } = await reviewedCandidate(value)
  const activated = await value.runtime.activatePlanningCandidate(value.agent, candidate.id, receipt.id, {})
  const statePath = join(value.root, '.dsh-workflow/workflows', `${activated.activation.workflowId}.json`)
  const legacy = JSON.parse(await readFile(statePath, 'utf8'))
  delete legacy.recoveryRuntimeRequired
  delete legacy.recoveryRuntimePolicy
  delete legacy.recoveryProtocol
  delete legacy.recoveryAdmissionConfig
  await writeFile(statePath, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8')
  const replay = await value.runtime.activatePlanningCandidate(value.agent, candidate.id, receipt.id, {})
  assert.equal(replay.activation.workflowId, legacy.id)
  const after = JSON.parse(await readFile(statePath, 'utf8'))
  assert.equal(after.recoveryRuntimeRequired, undefined)
  assert.equal(after.recoveryRuntimePolicy, undefined)
  assert.equal(after.recoveryProtocol, undefined)
  assert.equal(after.recoveryAdmissionConfig, undefined)
})

test('激活拒绝错配审查和blocked包，且不暴露半激活Workflow', async t => {
  const value = await prepared(t)
  if (!value) return
  const { candidate, receipt } = await reviewedCandidate(value)
  const mismatched = await persistPlanningReviewReceipt({
    root: candidate.root,
    candidateId: 'f'.repeat(64),
    planDigest: receipt.planDigest,
    registryDigest: receipt.registryDigest,
    authorizationId: receipt.authorizationId,
    orchestratorId: receipt.orchestratorId,
    source: { ...receipt.source, candidateId: 'f'.repeat(64) },
    review: receipt.review,
  })
  await assert.rejects(
    value.runtime.activatePlanningCandidate(value.agent, candidate.id, mismatched.id, {}),
    /绑定不匹配/,
  )
  await assert.rejects(readdir(join(value.root, '.dsh-workflow/workflows')), { code: 'ENOENT' })

  const blockedCandidate = structuredClone(candidate)
  blockedCandidate.packages.packages[0].status = 'blocked'
  await writeFile(join(value.root, '.dsh-workflow/planning-candidates', `${candidate.id}.json`), JSON.stringify(blockedCandidate))
  await assert.rejects(
    value.runtime.activatePlanningCandidate(value.agent, candidate.id, receipt.id, {}),
    /CANDIDATE_CHANGED|PACKAGES_CHANGED/,
  )
  await assert.rejects(readdir(join(value.root, '.dsh-workflow/workflows')), { code: 'ENOENT' })
})

test('没有事务记录的同名workflow branch不能被激活入口接管', async t => {
  const value = await prepared(t)
  if (!value) return
  const { candidate, receipt } = await reviewedCandidate(value)
  const branch = `${value.runtime.config.workflowBranchPrefix}/plan-${candidate.id.slice(0, 20)}`
  await git(value.root, 'branch', branch, candidate.snapshot.codeBaseline.checkpointCommit)
  await assert.rejects(
    value.runtime.activatePlanningCandidate(value.agent, candidate.id, receipt.id, {}),
    /没有对应事务记录/,
  )
  assert.deepEqual(await readdir(join(value.root, '.dsh-workflow/workflows')), [])
  await assert.rejects(readdir(join(value.root, '.dsh-workflow/planning-activations')), { code: 'ENOENT' })
})

test('活跃Workflow从修订Spec/Ticket固定父版本，经独立审查切换PlanRevision且重放不重复迁移', async t => {
  const value = await prepared(t)
  if (!value) return
  const initial = await reviewedCandidate(value)
  const activated = await value.runtime.activatePlanningCandidate(value.agent, initial.candidate.id, initial.receipt.id, {})
  const statePath = join(value.root, '.dsh-workflow/workflows', `${activated.activation.workflowId}.json`)
  const running = JSON.parse(await readFile(statePath, 'utf8'))
  running.status = 'running'
  running.tasks.find(task => task.taskId === 'task-s').status = 'completed'
  running.tasks.find(task => task.taskId === 'task-a').status = 'running'
  running.tasks.find(task => task.taskId === 'task-b').status = 'running'
  running.ownerRuns['task-b:b'] = {
    taskId: 'task-b', stageId: 'task-b', ownerId: 'b', status: 'running', attempt: 1,
    sessionId: 'old-task-b', planDigest: running.planDigest, leaseToken: 'old-lease', settlementGeneration: 1,
    attemptControl: {
      contract: 'DSH_OWNER_ATTEMPT_CONTROL_V1', executionVersion: running.planDigest,
      attempt: 1, leaseToken: 'old-lease', generation: 1, sessionId: 'old-task-b', phase: 'active',
      fixedDeadlineAt: '2026-09-12T01:00:00.000Z', remainingCeilingMs: 3_600_000,
      lastObservedAt: '2026-09-12T00:00:00.000Z', observationWindowMs: 30_000,
    },
  }
  await writeFile(statePath, JSON.stringify(running))
  const attemptLateReceipt = await holdStaleOwnerProcess(t, value.root, running.id)
  const legacy = structuredClone(running)
  delete legacy.planningSnapshot
  delete legacy.planningCandidateId
  delete legacy.planningAuthorizationId
  await writeFile(statePath, JSON.stringify(legacy))
  await assert.rejects(value.runtime.checkpointPlanningRevisionDocuments(value.agent, {
    workflowId: running.id, expectedPlanRevision: 1,
  }, {}), /legacy Workflow/)
  await writeFile(statePath, JSON.stringify(running))

  const revisedSpec = value.documents.finalSpec
    .replaceAll('"R1"', '"R2"')
    .replace('document_revision: R1', 'document_revision: R2')
    .replace('final specification content.', 'revised specification content.')
  const revisedTicket = value.documents.finalTicket
    .replaceAll('"R1"', '"R2"')
    .replace('document_revision: R1', 'document_revision: R2')
    .replace('spec_revision: R1', 'spec_revision: R2')
    .replace('final ticket content.', 'revised ticket content.')
  const spec = { ...value.documents.spec, revision: 'R2', sha256: createHash('sha256').update(revisedSpec).digest('hex') }
  const ticket = { ...value.documents.ticket, revision: 'R2', spec: { ...value.documents.ticket.spec, revision: 'R2' },
    acceptanceCriteria: value.documents.ticket.acceptanceCriteria.map(item => ({ ...item, specRevision: 'R2' })),
    sha256: createHash('sha256').update(revisedTicket).digest('hex') }
  const specPath = join(value.root, spec.path), ticketPath = join(value.root, ticket.path)
  assert.equal((await value.call('read', { file_path: specPath })).isError, false)
  assert.equal((await value.call('edit', { file_path: specPath, old_string: value.documents.finalSpec, new_string: revisedSpec })).isError, false)
  assert.equal((await value.call('read', { file_path: ticketPath })).isError, false)
  assert.equal((await value.call('edit', { file_path: ticketPath, old_string: value.documents.finalTicket, new_string: revisedTicket })).isError, false)
  const baseline = { branch: await git(value.root, 'symbolic-ref', '--short', 'HEAD'), head: await git(value.root, 'rev-parse', 'HEAD') }
  const checkpoint = await planningRevisionCheckpointDefinition(value.runtime).execute({
    workflow_id: running.id,
    expected_plan_revision: 1,
    id: 'revision-source-r2',
    manifest: manifest({ spec, ticket }),
    baseline,
    chains: [
      { path: spec.path, callIds: ['source-chain-8'] },
      { path: ticket.path, callIds: ['source-chain-10'] },
    ],
    reason: '固定执行中的R2规划来源',
  }, { agent: value.agent, callId: 'revision-checkpoint' })
  assert.deepEqual(checkpoint.snapshot.executionParent, {
    workflowId: running.id,
    planRevision: 1,
    planDigest: running.planDigest,
    workflowBranch: running.workflowBranch,
  })

  const revisionValue = { ...value, checkpoint }
  const revisionPlan = planFor(revisionValue)
  revisionPlan.summary = 'R2 fixed planning revision'
  revisionPlan.tasks.find(task => task.id === 'task-a').title = 'a contribution revised'
  revisionPlan.tasks = revisionPlan.tasks.filter(task => task.id !== 'task-b')
  revisionPlan.planningBindings.tasks = revisionPlan.planningBindings.tasks
    .filter(binding => binding.taskId !== 'task-b')
  for (const binding of revisionPlan.planningBindings.tasks) binding.tickets[0].revision = 'R2'
  plannerBackend(value, revisionPlan)
  const candidate = await value.runtime.compilePlanningCheckpoint(value.agent, checkpoint.checkpointId, {})
  reviewBackend(value, passedReview)
  const receipt = await value.runtime.reviewPlanningCandidate(value.agent, candidate.id, {})
  const competingPlan = structuredClone(revisionPlan)
  competingPlan.summary = 'competing R2 fixed planning revision'
  plannerBackend(value, competingPlan)
  const competingCandidate = await value.runtime.compilePlanningCheckpoint(value.agent, checkpoint.checkpointId, {})
  reviewBackend(value, passedReview)
  const competingReceipt = await value.runtime.reviewPlanningCandidate(value.agent, competingCandidate.id, {})

  const approve = value.runtime.approvePendingPlanRevision
  value.runtime.approvePendingPlanRevision = async () => { throw new Error('simulated crash after durable staging') }
  await assert.rejects(value.runtime.activatePlanningCandidate(value.agent, candidate.id, receipt.id, {}), /simulated crash/)
  const stagedState = JSON.parse(await readFile(statePath, 'utf8'))
  assert.equal(stagedState.activePlanRevision, 1)
  assert.equal(stagedState.pendingPlanRevision.fixedPlanning.candidateId, candidate.id)
  value.runtime.approvePendingPlanRevision = approve
  const result = await value.runtime.activatePlanningCandidate(value.agent, candidate.id, receipt.id, {})
  assert.equal(result.contract, 'DSH_PLANNING_REVISION_ACTIVATED_V1')
  assert.equal(result.revision, 2)
  assert.equal(result.parent, 1)
  let revised = JSON.parse(await readFile(statePath, 'utf8'))
  assert.equal(revised.activePlanRevision, 2)
  assert.equal(revised.planRevisions.length, 2)
  assert.equal(revised.planningRevisionSources.length, 1)
  assert.equal(revised.planningCandidateId, candidate.id)
  assert.equal(revised.planningSnapshot.id, checkpoint.snapshot.id)
  assert.equal(revised.tasks.find(task => task.taskId === 'task-a').status, 'running')
  assert.equal(revised.tasks.find(task => task.taskId === 'task-a').checkState, 'pending_check')
  assert.equal(revised.tasks.find(task => task.taskId === 'task-b'), undefined)
  assert.equal(revised.ownerRuns['task-b:b'].status, 'stopping')
  assert.equal(revised.ownerRuns['task-b:b'].attemptControl.phase, 'technical_pause')
  assert.equal(revised.ownerRunHistory, undefined)
  const lateReceipt = await attemptLateReceipt()
  assert.equal(lateReceipt.rejected, true)
  assert.match(lateReceipt.message, /attempt\/session\/token\/generation 已失效/u)
  const terminal = await runRevisionRestartChild('terminal_reconcile', value.root, revised.id)
  assert.equal(terminal.changed, true)
  assert.equal(terminal.settled, 1)
  revised = JSON.parse(await readFile(statePath, 'utf8'))
  assert.equal(revised.ownerRuns['task-b:b'], undefined)
  assert.equal(revised.ownerRunHistory.at(-1).ownerRun.attemptControl.phase, 'settled')
  assert.equal(revised.ownerRunHistory.at(-1).ownerRun.sessionId, 'old-task-b')
  assert.equal(revised.tasks.find(task => task.taskId === 'task-b'), undefined)
  assert.equal(value.asked(), 1, 'revision reuses the original implementation authority')
  await assert.rejects(
    value.runtime.activatePlanningCandidate(value.agent, competingCandidate.id, competingReceipt.id, {}),
    /父执行版本已变化/,
  )

  const replay = await value.runtime.activatePlanningCandidate(value.agent, candidate.id, receipt.id, {})
  assert.equal(replay.replayed, true)
  const replayed = JSON.parse(await readFile(statePath, 'utf8'))
  assert.equal(replayed.planRevisions.length, 2)
  assert.equal(replayed.planningRevisionSources.length, 1)
})

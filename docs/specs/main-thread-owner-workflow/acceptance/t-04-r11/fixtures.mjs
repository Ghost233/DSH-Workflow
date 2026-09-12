import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnection } from 'node:net'
import { createHash } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { apply as applyPlugin } from '../../../../../owner-workflow-plugin/index.js'
import {
  applyApprovedRegistryChange,
  ensureRegistry,
  loadRegistry,
  proposeRegistryChange,
} from '../../../../../owner-workflow-plugin/src/registry.mjs'
import { createOwnerWorkflowRuntime } from '../../../../../owner-workflow-plugin/src/runtime.mjs'
import { listBranches, statusRecords } from '../../../../../owner-workflow-plugin/src/git.mjs'
import { createTaskState } from '../../../../../owner-workflow-plugin/src/supervisor.mjs'
import { createPlanRevision } from '../../../../../owner-workflow-plugin/src/plan-revision.mjs'
import { normalizePlanV2 } from '../../../../../owner-workflow-plugin/src/model.mjs'
import { deriveWorkflowControl } from '../../../../../owner-workflow-plugin/src/workflow-state.mjs'

function reviewClosureContract(obligationId, kind, taskId = 'T1', authority = 'user') {
  return {
    obligationId,
    sourceId: `control/${obligationId}`,
    sourceVersion: '1',
    targetTaskIds: [taskId],
    closeWhen: { kind, taskId, ...(kind === 'decision_record' ? { authority } : {}) },
    ...(kind === 'decision_record' ? { classificationBasis: {
      source: { id: `control/${obligationId}`, version: '1' },
      technicalFacts: ['当前候选的决定尚未记录，原有执行边界保持。'],
      ...(authority === 'user' ? { businessCommitmentDelta: {
        currentCommitment: '仅执行已确认的现有方案',
        proposedCommitment: '采用待确认的方案 A',
        consequence: '改变当前候选向调用方提供的行为，需要明确选择。',
      } } : {}),
    } } : {}),
  }
}

const execFileAsync = promisify(execFile)
const EXTERNAL_RUNNER_PATH = fileURLToPath(new URL('../../../../../owner-workflow-plugin/src/external-runner.mjs', import.meta.url))

async function git(cwd, args) {
  await execFileAsync('git', args, { cwd, encoding: 'utf8' })
}

function addOwnerOperation(id = 'registry-owner') {
  return {
    type: 'add',
    owner: {
      id,
      name: `${id} 负责人`,
      description: `${id} 的职责`,
      scope: [`src/${id}/**`],
      exclude: [],
    },
    reason: `建立 ${id} 的正式职责`,
  }
}

function assertV2PlannerPrompt(prompt) {
  assert.equal(typeof prompt, 'string')
  assert.match(prompt, /DSH_PLAN_V2/u)
  assert.match(prompt, /registryDigest/u)
  assert.match(prompt, /verifications/u)
  assert.match(prompt, /tasks/u)
  assert.match(prompt, /代码责任域/u)
  assert.match(prompt, /当前 Workflow.*阶段/u)
  assert.match(prompt, /DAG task/u)
  assert.match(prompt, /\^\[a-z\]\[a-z0-9_-\]\{0,63\}\$/u)
  assert.match(prompt, /字段名必须是 run/u)
  assert.match(prompt, /禁止使用 argv/u)
  assert.match(prompt, /decomposition\.status 只允许 abstract、leaf、expanded/u)
  assert.match(prompt, /review 或 role=verify 的 task\.write 必须是空数组/u)
  assert.match(prompt, /所有 work 叶子必须至少绑定一个 verification|leaf work task 必须提供精确 write 与至少一个固定 verification/u)
  assert.match(prompt, /优先使用扁平 leaf DAG/u)
  assert.doesNotMatch(prompt, /DSH_PLAN_V1/u)
  assert.doesNotMatch(prompt, /\bstages\b/u)
  assert.doesNotMatch(prompt, /\bfiles\b/u)
  assert.doesNotMatch(prompt, /\bacceptance\b/u)
}

function canonicalDigestValue(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalDigestValue).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalDigestValue(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function registryContentDigest(registry) {
  return createHash('sha256').update(canonicalDigestValue(registry)).digest('hex')
}

async function applyRegistryOperation(worktree, registry, operation) {
  const proposal = proposeRegistryChange(registry, operation)
  return applyApprovedRegistryChange(worktree, { ...proposal, approvedDigest: proposal.digest })
}

async function registryWorkflowFixture(config = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-runtime-registry-'))
  const runtime = createOwnerWorkflowRuntime({}, config)
  await git(root, ['init', '-b', 'main'])
  await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
  await git(root, ['config', 'user.name', 'Owner Workflow Test'])
  await writeFile(join(root, 'README.md'), 'Registry 运行时测试\n', 'utf8')
  await git(root, ['add', 'README.md'])
  await git(root, ['commit', '-m', '初始化 Registry 运行时测试'])
  await runtime.prepareRoot(root)
  const id = 'wf-registry-runtime'
  const workflowBranch = `dsh/workflow/${id}`
  const workflowWorktree = join(root, '.dsh-workflow', 'worktrees', id, 'workflow')
  await git(root, ['worktree', 'add', '-b', workflowBranch, workflowWorktree, 'HEAD'])
  const registry = await ensureRegistry(workflowWorktree)
  const plan = {
    contract: 'DSH_PLAN_V1',
    summary: 'Registry 运行时测试计划',
    owners: [{ id: 'plan-owner', name: '计划 Owner', description: '旧计划职责', scope: ['README.md'], exclude: [] }],
    stages: [{ id: 'stage-1', name: '旧计划阶段', dependsOn: [], tasks: [{ id: 'task-1', ownerId: 'plan-owner', title: '旧计划任务', description: '旧计划任务', files: ['README.md'] }] }],
  }
  const planDigest = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
  const agent = { id: 'registry-agent', session: { id: 'registry-agent', header: { cwd: root } } }
  const state = {
    contract: 'DSH_WORKFLOW_STATE_V1',
    id,
    root: await runtime.resolveRoot(agent),
    baseBranch: 'main',
    baseRef: 'main',
    workflowBranch,
    workflowWorktree,
    status: 'planned',
    plan,
    planDigest,
    registryDigest: registryContentDigest(registry),
    planReview: { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '旧计划已通过', issues: [] },
    planReviewDigest: planDigest,
    planApproved: true,
    planApprovedAt: new Date().toISOString(),
    planApprovedBy: 'registry-agent',
    completedStages: [],
    stageResults: [],
    ownerRuns: {},
    ownerSessions: {},
  }
  await writeFile(
    join(root, '.dsh-workflow', 'workflows', `${id}.json`),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  )
  return { root, runtime, agent, state }
}

async function planApprovalFixture(config = {}) {
  const fixture = await registryWorkflowFixture(config)
  const { root, state } = fixture
  let registry = await loadRegistry(state.workflowWorktree)
  registry = await applyRegistryOperation(state.workflowWorktree, registry, {
    type: 'add',
    owner: state.plan.owners[0],
    reason: '登记计划审批测试 Owner',
  })
  state.registryDigest = registryContentDigest(registry)
  state.planApproved = false
  state.planApprovedAt = undefined
  state.planApprovedBy = undefined
  await writeFile(
    join(root, '.dsh-workflow', 'workflows', `${state.id}.json`),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  )
  return { ...fixture, registry }
}

async function closureReceiptFixture() {
  const fixture = await planApprovalFixture()
  const { root, state, agent } = fixture
  state.plan = normalizePlanV2({
    contract: 'DSH_PLAN_V2', registryDigest: state.registryDigest, summary: '关闭回执测试',
    owners: state.plan.owners,
    verifications: [{ id: 'unit', run: ['node', '--test'], cwd: '.' }],
    tasks: [{ id: 'T1', role: 'work', ownerId: state.plan.owners[0].id,
      title: '实现已决定的行为', dependsOn: [], write: ['README.md'], verify: ['unit'], done: ['行为验证通过'],
      decomposition: { status: 'leaf', kind: 'leaf', ownerCandidates: [state.plan.owners[0].id], unknowns: [] },
    }],
  })
  state.planDigest = createHash('sha256').update(JSON.stringify(state.plan)).digest('hex')
  state.tasks = createTaskState(state.plan)
  state.planReview = undefined
  state.planReviewDigest = undefined
  state.orchestratorSessionId = agent.id
  state.conversationRootSessionId = agent.id
  const statePath = join(root, '.dsh-workflow', 'workflows', `${state.id}.json`)
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  return { ...fixture, statePath }
}

function request(manifest, action, payload = {}) {
  return new Promise((resolveResponse, rejectResponse) => {
    const socket = createConnection(manifest.socketPath)
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('connect', () => {
      socket.write(`${JSON.stringify({
        contract: 'DSH_WORKFLOW_CONTROL_V1',
        id: 'test-request',
        token: manifest.token,
        workflowId: manifest.workflowId,
        action,
        ...payload,
      })}\n`)
    })
    socket.on('data', chunk => {
      buffer += chunk
      const lineEnd = buffer.indexOf('\n')
      if (lineEnd < 0) return
      const response = JSON.parse(buffer.slice(0, lineEnd))
      socket.destroy()
      if (response.ok === true) resolveResponse(response.result)
      else rejectResponse(new Error(response.error))
    })
    socket.on('error', rejectResponse)
  })
}

async function waitForWorkflowState(path, predicate, label) {
  const deadline = Date.now() + 5_000
  let state
  while (Date.now() < deadline) {
    state = JSON.parse(await readFile(path, 'utf8'))
    if (predicate(state)) return state
    await delay(10)
  }
  throw new Error(`等待 workflow 状态超时：${label}；最后状态=${JSON.stringify(state)}`)
}

async function waitForCondition(predicate, label) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (predicate()) return
    await delay(10)
  }
  throw new Error(`等待条件超时：${label}`)
}

async function removeFixtureRoot(root) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(root, { recursive: true, force: true })
      return
    } catch (error) {
      if (error?.code !== 'ENOTEMPTY' || attempt === 4) throw error
      await delay(25 * (attempt + 1))
    }
  }
}

async function supervisorControlFixture({ materializeWorkflow = false, ctx = {}, config = {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-control-'))
  const runtime = createOwnerWorkflowRuntime(ctx, config)
  await git(root, ['init', '-b', 'main'])
  await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
  await git(root, ['config', 'user.name', 'Owner Workflow Test'])
  await writeFile(join(root, 'README.md'), 'Supervisor 控制桥测试\n', 'utf8')
  await git(root, ['add', 'README.md'])
  await git(root, ['commit', '-m', '初始化 Supervisor 控制桥测试'])
  await runtime.prepareRoot(root)
  const plan = {
    contract: 'DSH_PLAN_V2',
    registryDigest: 'a'.repeat(64),
    summary: 'Supervisor 控制桥计划',
    owners: [{ id: 'api', name: 'API', description: 'API Owner', scope: ['src/api/**'], exclude: [] }],
    verifications: [{ id: 'unit', run: ['node', '--test'] }],
    tasks: [{
      id: 'T1',
      role: 'work',
      ownerId: 'api',
      title: '实现 API',
      dependsOn: [],
      write: ['src/api/t1.mjs'],
      verify: ['unit'],
      done: ['API 完成'],
    }],
  }
  const planDigest = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
  const id = 'wf-supervisor-control'
  const agent = { id: 'supervisor-agent', session: { id: 'supervisor-agent', header: { cwd: root } } }
  const resolvedRoot = await runtime.resolveRoot(agent)
  const workflowBranch = `dsh/workflow/${id}`
  const workflowWorktree = materializeWorkflow
    ? join(resolvedRoot, '.dsh-workflow', 'worktrees', id, 'workflow')
    : resolvedRoot
  if (materializeWorkflow) {
    await mkdir(join(resolvedRoot, '.dsh-workflow', 'worktrees', id), { recursive: true })
    await git(resolvedRoot, ['worktree', 'add', '-b', workflowBranch, workflowWorktree, 'HEAD'])
  }
  const workflowHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: workflowWorktree,
    encoding: 'utf8',
  })).stdout.trim()
  const state = {
    contract: 'DSH_WORKFLOW_STATE_V1',
    id,
    root: resolvedRoot,
    baseBranch: 'main',
    baseRef: 'main',
    workflowBranch,
    workflowWorktree,
    status: 'approved',
    plan,
    planDigest,
    planReview: { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '通过', issues: [] },
    planReviewDigest: planDigest,
    planApproved: true,
    workflowHead,
    ownerRuns: {},
    ownerSessions: {},
  }
  await writeFile(
    join(root, '.dsh-workflow', 'workflows', `${id}.json`),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  )
  const manifest = await runtime.ensureControlBridge(agent, state)
  return {
    root,
    runtime,
    agent,
    state,
    manifest,
    statePath: join(root, '.dsh-workflow', 'workflows', `${id}.json`),
  }
}

async function preparePlanReviewRecoveryState(fixture) {
  let registry = await ensureRegistry(fixture.state.workflowWorktree)
  registry = await applyRegistryOperation(fixture.state.workflowWorktree, registry, {
    type: 'add',
    owner: fixture.state.plan.owners[0],
    reason: '登记计划审查恢复测试 Owner',
  })
  const registryDigest = registryContentDigest(registry)
  const owner = registry.owners.find(item => item.id === 'api')
  const plan = {
    ...fixture.state.plan,
    registryDigest,
    owners: [{
      id: owner.id,
      name: owner.name,
      description: owner.description,
      scope: [...owner.scope],
      exclude: [...owner.exclude],
    }],
  }
  const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
  state.status = 'planned'
  state.plan = plan
  state.planDigest = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
  delete state.registryDigest
  delete state.planReview
  delete state.planReviewDigest
  state.planApproved = false
  state.planningAgent = {
    childId: 'planner-recovery-child',
    phase: 'failed',
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 30_000).toISOString(),
    error: '模拟计划审查驱动中断',
    recoveryAttempts: 0,
  }
  await writeFile(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  return { state, registryDigest }
}

async function executionFeedbackFixture() {
  const fixture = await closureReceiptFixture()
  const { runtime, root, state, statePath } = fixture
  const registry = await applyRegistryOperation(state.workflowWorktree, await loadRegistry(state.workflowWorktree), addOwnerOperation('independent'))
  state.registryDigest = registryContentDigest(registry)
  const independent = registry.owners.find(owner => owner.id === 'independent')
  state.plan = normalizePlanV2({ ...state.plan, registryDigest: state.registryDigest,
    owners: [...state.plan.owners, independent],
    tasks: [...state.plan.tasks, { ...state.plan.tasks[0], id: 'T2', ownerId: 'independent', write: ['src/independent/value.mjs'], decomposition: { status: 'leaf', kind: 'leaf', ownerCandidates: ['independent'], unknowns: [] } }],
  })
  state.planDigest = createHash('sha256').update(JSON.stringify(state.plan)).digest('hex')
  state.planApproved = true
  state.planReview = { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '当前计划通过', issues: [] }
  state.planReviewDigest = state.planDigest
  state.status = 'running'
  state.attempt = 1
  state.tasks = createTaskState(state.plan)
  const owner = state.plan.owners[0]
  const sessionId = 'r09-active-owner'
  const key = `T1:${owner.id}`
  state.tasks[0].status = 'running'
  state.tasks[0].executorId = sessionId
  state.ownerRuns[key] = { status: 'running', taskId: 'T1', stageId: 'T1', ownerId: owner.id, sessionId,
    attempt: 1, planDigest: state.planDigest, startedAt: '2026-09-10T12:10:00.000Z', worktree: state.workflowWorktree, branch: state.workflowBranch }
  state.supervisorOutbox = { [key]: { status: 'running', taskId: 'T1', ownerId: owner.id, attempts: 1 } }
  await writeFile(statePath, JSON.stringify(state), 'utf8')
  const acquired = await runtime.acquireOwnerLease(root, owner.id, state.id, 'T1')
  const active = { workflowRoot: state.root, workflowId: state.id, stageId: 'T1', owner, sessionId,
    worktree: state.workflowWorktree, lease: acquired.lease, state, stage: state.plan.tasks[0], attempt: 1, planDigest: state.planDigest,
    authority: { id: owner.id, name: owner.name, description: owner.description, scope: [...owner.scope], exclude: [...owner.exclude] } }
  runtime.activeOwners.set(sessionId, active)
  return { ...fixture, key, active, exec: { agent: { id: sessionId }, signal: undefined },
    async cleanup() { runtime.activeOwners.delete(sessionId); await runtime.releaseOwnerLease(acquired.lease); await runtime.dispose(); await rm(root, { recursive: true, force: true }) } }
}

function executionFeedback(mode = 'permission') {
  return { expected: '按现有合同读取指定账本', actual: '该执行环境无法读取指定账本',
    evidence: [{ kind: 'service_response', detail: 'remote-ledger 请求返回缺少 read:ledger 范围；本记录保留响应观察' }],
    technical_facts: ['当前任务需要读取指定账本；权限未在本轮任务中获得。'],
    ...(mode === 'permission' ? { external_permission_gap: { required_permission: 'read:ledger', target: 'remote-ledger', blocked_action: '读取指定账本' } } : {}),
    ...(mode === 'business' ? { business_commitment_delta: { current_commitment: '保留三十天', proposed_commitment: '保留七天', consequence: '第八天数据不可读取' } } : {}),
  }
}



export { executionFeedbackFixture, executionFeedback };

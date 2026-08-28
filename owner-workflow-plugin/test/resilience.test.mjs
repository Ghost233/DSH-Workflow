import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import test from 'node:test'
import {
  addWorktree,
  commitFiles,
  deleteBranch,
  head,
  isCommitAncestor,
  listBranches,
  mergeCommit,
  removeWorktree,
  statusRecords,
} from '../src/git.mjs'
import {
  IMPLEMENTATION_REVIEW_CONTRACT,
  PLAN_CONTRACT,
  PLAN_V2_CONTRACT,
  STATE_CONTRACT,
  normalizePlan,
  normalizePlanV2,
} from '../src/model.mjs'
import {
  applyApprovedRegistryChange,
  ensureRegistry,
  loadRegistry,
  proposeRegistryChange,
} from '../src/registry.mjs'
import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'
import { createTaskState } from '../src/supervisor.mjs'

const execFileAsync = promisify(execFile)

async function runGit(cwd, args) {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' })
  return String(result.stdout ?? '')
}

async function createRepository() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-owner-resilience-')))
  await runGit(root, ['init', '-q', '-b', 'main'])
  await runGit(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
  await runGit(root, ['config', 'user.name', 'Owner Workflow Test'])
  await writeFile(join(root, 'README.md'), '初始内容\n', 'utf8')
  await runGit(root, ['add', 'README.md'])
  await runGit(root, ['commit', '-qm', '初始化测试仓库'])
  return { root, baseHead: (await runGit(root, ['rev-parse', 'HEAD'])).trim() }
}

function createPlan({ secondStageOwner = 'owner-a', secondStageFile = 'owned/next.txt' } = {}) {
  const owners = [
      {
        id: 'owner-a',
        name: '区域甲 Owner',
        description: '负责 owned 文件区域',
        scope: ['owned/**'],
        exclude: [],
      },
      {
        id: 'owner-b',
        name: '区域乙 Owner',
        description: '负责 handoff 文件区域',
        scope: ['handoff/**'],
        exclude: [],
      },
    ]
  return normalizePlanV2({
    contract: PLAN_V2_CONTRACT,
    registryDigest: 'a'.repeat(64),
    summary: '故障恢复测试计划',
    owners,
    verifications: [{ id: 'unit', run: ['node', '--test'] }],
    tasks: [
      {
      id: 'stage-1',
      role: 'work',
      ownerId: 'owner-a',
      title: '完成基础文件',
      dependsOn: [],
      write: ['owned/result.txt'],
      verify: ['unit'],
      done: ['文件内容正确'],
      },
      {
      id: 'stage-2',
      role: 'work',
      ownerId: secondStageOwner,
      title: '完成后续文件',
      dependsOn: ['stage-1'],
      write: [secondStageFile],
      verify: ['unit'],
      done: ['后续文件内容正确'],
      },
    ],
  })
}

function planTask(plan, taskId) {
  const task = plan.tasks.find(item => item.id === taskId)
  assert.notEqual(task, undefined, `V2 task ${taskId} must exist`)
  return task
}

function setTaskStatus(state, taskId, status) {
  const task = state.tasks.find(item => item.taskId === taskId)
  assert.notEqual(task, undefined, `V2 task state ${taskId} must exist`)
  task.status = status
  task.executorId = null
  task.cursor = null
  task.unchangedPolls = 0
  task.reason = null
  task.action = null
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
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

async function writeState(root, state) {
  const path = join(root, '.dsh-workflow', 'workflows', `${state.id}.json`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function readState(root, workflowId) {
  return JSON.parse(await readFile(join(root, '.dsh-workflow', 'workflows', `${workflowId}.json`), 'utf8'))
}

async function waitForPath(path, label) {
  const deadline = Date.now() + 2_000
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error(`等待 ${label} 超时：${path}`)
    await new Promise(resolvePromise => setTimeout(resolvePromise, 10))
  }
}

async function waitForCondition(condition, label) {
  const deadline = Date.now() + 2_000
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`等待 ${label} 超时`)
    await new Promise(resolvePromise => setTimeout(resolvePromise, 10))
  }
}

async function createWorkflow(root, runtime, plan, {
  id,
  status = 'running',
} = {}) {
  await runtime.prepareRoot(root)
  const workflowId = id ?? `wf-resilience-${Date.now().toString(36)}`
  const workflowBranch = `dsh/workflow/${workflowId}`
  const workflowWorktree = join(root, '.dsh-workflow', 'worktrees', workflowId, 'workflow')
  await mkdir(dirname(workflowWorktree), { recursive: true })
  await addWorktree(root, workflowBranch, workflowWorktree, 'main')
  const baseHead = await head(workflowWorktree)
  const registry = await registerPlanOwners(workflowWorktree, plan)
  const registryFiles = [...new Set((await statusRecords(workflowWorktree)).flatMap(record => [
    record.path,
    ...(record.originalPath === undefined ? [] : [record.originalPath]),
  ]))]
  if (registryFiles.length > 0) {
    await commitFiles(workflowWorktree, registryFiles, '登记 resilience fixture Owner Registry')
  }
  const statePlan = plan.contract === PLAN_V2_CONTRACT
    ? { ...plan, registryDigest: registryContentDigest(registry) }
    : plan
  const planDigest = digest(statePlan)
  const state = {
    contract: STATE_CONTRACT,
    id: workflowId,
    root,
    baseBranch: 'main',
    baseRef: 'main',
    baseHead,
    workflowBranch,
    workflowWorktree,
    request: '故障恢复测试需求',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status,
    attempt: 1,
    ownerRuns: {},
    ownerSessions: {},
    plan: statePlan,
    planDigest,
    planReview: {
      contract: 'DSH_PLAN_REVIEW_V1',
      status: 'passed',
      summary: '旧计划审查通过',
      issues: [],
    },
    planReviewDigest: planDigest,
    planApproved: true,
    planApprovedAt: new Date().toISOString(),
    planApprovedBy: '测试编排者',
    tasks: createTaskState(statePlan),
  }
  await writeState(root, state)
  return {
    runtime,
    state,
    agent: { id: 'resilience-agent', session: { id: 'resilience-agent', header: { cwd: root } } },
  }
}

async function createOwner(_root, workflow, taskId = 'stage-1', ownerId = 'owner-a') {
  const task = workflow.state.plan.tasks.find(item => item.id === taskId)
  assert.notEqual(task, undefined, `V2 task ${taskId} must exist`)
  return workflow.runtime.createOwnerEntry(workflow.state, task, ownerId)
}

test('Supervisor 将没有活跃子代理的 running Owner 收敛为 orphaned，而不是继续报告运行中', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({ agents: { get: () => undefined } }, {})
  let workflow
  try {
    workflow = await createWorkflow(root, runtime, createPlan(), { id: 'wf-owner-orphaned' })
    const state = await readState(root, workflow.state.id)
    setTaskStatus(state, 'stage-1', 'running')
    state.tasks.find(task => task.taskId === 'stage-1').executorId = 'missing-owner-session'
    state.ownerRuns['stage-1:owner-a'] = {
      status: 'running',
      taskId: 'stage-1',
      stageId: 'stage-1',
      ownerId: 'owner-a',
      sessionId: 'missing-owner-session',
      startedAt: '2026-08-20T08:00:00.000Z',
    }
    await writeState(root, state)

    const status = await runtime.supervisorStatus(workflow.agent, state.id)
    const saved = await readState(root, state.id)
    assert.equal(saved.ownerRuns['stage-1:owner-a'].status, 'orphaned')
    assert.deepEqual(
      saved.tasks.map(task => ({ id: task.taskId, status: task.status, reason: task.reason, action: task.action })),
      [
        { id: 'stage-1', status: 'stopped', reason: 'owner_orphaned', action: 'recover_owner' },
        { id: 'stage-2', status: 'pending', reason: null, action: null },
      ],
    )
    assert.equal(status.workflows[0].issues.some(issue => issue.code === 'owner-orphaned'), true)
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow)
  }
})

test('Supervisor inspect 路径同样执行 task timeout，不能以持续 inspect 无限续命', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({ agents: { get: id => (
    id === 'owner-timeout-session' ? { id, status: 'running' } : undefined
  ) } }, {})
  const timeoutPlan = createPlan()
  timeoutPlan.tasks[0] = {
    ...timeoutPlan.tasks[0],
    onTimeout: { action: 'notify_main', afterMs: 60_000 },
  }
  let workflow
  try {
    workflow = await createWorkflow(root, runtime, timeoutPlan, { id: 'wf-owner-inspect-timeout' })
    const state = await readState(root, workflow.state.id)
    setTaskStatus(state, 'stage-1', 'running')
    Object.assign(state.tasks.find(task => task.taskId === 'stage-1'), {
      executorId: 'owner-timeout-session',
      unchangedPolls: 10,
    })
    state.ownerRuns['stage-1:owner-a'] = {
      status: 'running',
      taskId: 'stage-1',
      stageId: 'stage-1',
      ownerId: 'owner-a',
      sessionId: 'owner-timeout-session',
      startedAt: '2026-08-20T08:00:00.000Z',
    }
    await writeState(root, state)

    const result = await runtime.awaitSupervisorEvent(workflow.agent, state.id, 0, 1)
    const saved = await readState(root, state.id)
    assert.equal(result.event.type, 'supervisor.task-timeout')
    assert.equal(saved.status, 'blocked')
    assert.equal(saved.tasks[0].status, 'stopped')
    assert.equal(saved.tasks[0].reason, 'decision_required')
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow)
  }
})

test('Owner 子代理启动时立即持久化 session、phase 与 heartbeat', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  let workflow
  try {
    workflow = await createWorkflow(root, runtime, createPlan(), { id: 'wf-owner-session-start' })
    const state = await readState(root, workflow.state.id)
    setTaskStatus(state, 'stage-1', 'running')
    state.ownerRuns['stage-1:owner-a'] = {
      status: 'starting',
      taskId: 'stage-1',
      stageId: 'stage-1',
      ownerId: 'owner-a',
      startedAt: new Date().toISOString(),
    }
    await writeState(root, state)

    await runtime.persistOwnerSession({
      workflowRoot: root,
      workflowId: state.id,
      stageId: 'stage-1',
      owner: { id: 'owner-a' },
    }, 'owner-session-start')
    const saved = await readState(root, state.id)
    assert.equal(saved.ownerRuns['stage-1:owner-a'].sessionId, 'owner-session-start')
    assert.equal(saved.ownerRuns['stage-1:owner-a'].phase, 'running')
    assert.equal(typeof saved.ownerRuns['stage-1:owner-a'].lastHeartbeatAt, 'string')
    assert.equal(saved.tasks[0].executorId, 'owner-session-start')
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow)
  }
})

test('Owner 宿主授权等待会持久化到 workflow，并在结束后恢复 running', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  let workflow
  try {
    workflow = await createWorkflow(root, runtime, createPlan(), { id: 'wf-owner-approval-state' })
    const state = await readState(root, workflow.state.id)
    setTaskStatus(state, 'stage-1', 'running')
    state.tasks[0].executorId = 'owner-approval-session'
    state.ownerRuns['stage-1:owner-a'] = {
      status: 'running',
      taskId: 'stage-1',
      stageId: 'stage-1',
      ownerId: 'owner-a',
      sessionId: 'owner-approval-session',
      startedAt: new Date().toISOString(),
    }
    await writeState(root, state)
    const active = {
      workflowRoot: root,
      workflowId: state.id,
      stageId: 'stage-1',
      owner: { id: 'owner-a' },
      sessionId: 'owner-approval-session',
    }

    const pending = await runtime.recordOwnerApprovalState(active, {
      callId: 'approval-call',
      toolName: 'owner_host_exec',
      reason: '需要读取共享 Xcode Package 缓存',
    })
    let saved = await readState(root, state.id)
    assert.equal(saved.ownerRuns['stage-1:owner-a'].status, 'waiting_approval')
    assert.equal(saved.pendingOwnerApprovals[pending.approvalId].sessionId, 'owner-approval-session')

    await runtime.resolveOwnerApprovalState(active, pending.approvalId, 'allowed-once')
    saved = await readState(root, state.id)
    assert.equal(saved.ownerRuns['stage-1:owner-a'].status, 'running')
    assert.equal(saved.pendingOwnerApprovals[pending.approvalId].status, 'allowed-once')
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow)
  }
})

test('主会话 Owner 恢复只负责后台派发，不同步等待完整 LLM 执行', async () => {
  const runtime = createOwnerWorkflowRuntime({}, {})
  let release
  const pending = new Promise(resolvePromise => { release = resolvePromise })
  runtime.recoverOwner = async () => pending
  const result = await runtime.dispatchOwnerRecovery(
    { id: 'root-agent', session: { id: 'root-agent' } },
    'wf-owner-background',
    'T1',
    'owner-a',
  )
  assert.equal(result.status, 'recovery_started')
  assert.equal(runtime.manualOwnerRecoveries.has('wf-owner-background:T1:owner-a'), true)
  release({ status: 'completed' })
  await runtime.manualOwnerRecoveries.get('wf-owner-background:T1:owner-a')
  await new Promise(resolvePromise => setImmediate(resolvePromise))
  assert.equal(runtime.manualOwnerRecoveries.has('wf-owner-background:T1:owner-a'), false)
  await disposeRuntime(runtime)
})

test('workflow_status 默认保持紧凑，完整历史只通过分页 detail 返回', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  let workflow
  try {
    workflow = await createWorkflow(root, runtime, createPlan(), { id: 'wf-compact-status' })
    const state = await readState(root, workflow.state.id)
    state.planRevisions = Array.from({ length: 100 }, (_, index) => ({
      number: index + 1,
      explanation: '历史修订说明'.repeat(100),
    }))
    state.ownerMemoryWorklogs = {
      'stage-1:owner-a': {
        contract: 'DSH_OWNER_WORKLOG_V1',
        taskId: 'stage-1',
        title: '历史记录',
        ownerId: 'owner-a',
        status: 'active',
        notes: [{ type: '结论', text: '历史上下文'.repeat(100) }],
      },
    }
    await writeState(root, state)

    const compact = await runtime.status(workflow.agent, state.id, { ensureBridge: false })
    assert.ok(JSON.stringify(compact).length < 8 * 1024)
    assert.equal(Object.hasOwn(compact, 'logs'), false)
    assert.equal(Object.hasOwn(compact.workflow, 'planRevisions'), false)

    const detail = await runtime.status(workflow.agent, state.id, {
      ensureBridge: false,
      detail: true,
      logCursor: 0,
      logLimit: 1,
    })
    assert.equal(Array.isArray(detail.workflow.planRevisions), true)
    assert.equal(detail.logPage.limit, 1)
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow)
  }
})

test('相同根因和运行时版本只允许一次 Owner 恢复', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  let workflow
  try {
    workflow = await createWorkflow(root, runtime, createPlan(), { id: 'wf-owner-recovery-fingerprint' })
    const state = await readState(root, workflow.state.id)
    state.status = 'failed'
    state.error = 'Owner 工具 Schema 与运行时不匹配'
    state.tasks[0] = {
      ...state.tasks[0],
      status: 'stopped',
      reason: 'task_failed',
      action: 'repair_task',
    }
    const failure = 'Owner 工具 Schema 与运行时不匹配'
    state.ownerRuns['stage-1:owner-a'] = {
      status: 'failed',
      taskId: 'stage-1',
      stageId: 'stage-1',
      ownerId: 'owner-a',
      error: failure,
      recoveryCount: 1,
      lastRecoveryFingerprint: runtime.ownerRecoveryFingerprint(state, 'stage-1', 'owner-a', failure),
    }
    await writeState(root, state)

    await assert.rejects(
      runtime.recoverOwner(workflow.agent, state.id, 'stage-1', 'owner-a'),
      /同一根因已经恢复过一次/u,
    )
    const saved = await readState(root, state.id)
    assert.equal(saved.status, 'blocked')
    assert.equal(saved.ownerRuns['stage-1:owner-a'].phase, 'recovery_blocked')
    assert.equal(saved.ownerRuns['stage-1:owner-a'].recoveryCount, 1)
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow)
  }
})

test('同一 Owner 的第二个 V2 任务复用分支和 worktree 并同步最新 workflow HEAD', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  const plan = normalizePlanV2({
    contract: 'DSH_PLAN_V2',
    registryDigest: 'a'.repeat(64),
    summary: '同一 Owner 连续执行两个任务',
    owners: [{
      id: 'api',
      name: 'API Owner',
      description: '负责 API 文件',
      scope: ['owned/**'],
      exclude: [],
    }],
    verifications: [{ id: 'unit', run: ['node', '--test'] }],
    tasks: [
      {
        id: 'T1',
        role: 'work',
        ownerId: 'api',
        title: '首个任务',
        dependsOn: [],
        write: ['owned/first.txt'],
        verify: ['unit'],
        done: ['首个文件完成'],
      },
      {
        id: 'T2',
        role: 'work',
        ownerId: 'api',
        title: '第二个任务',
        dependsOn: ['T1'],
        write: ['owned/second.txt'],
        verify: ['unit'],
        done: ['第二个文件完成'],
      },
    ],
  })
  let workflow
  const owners = []
  try {
    workflow = await createWorkflow(root, runtime, plan, { id: 'wf-v2-owner-reuse' })
    const first = await runtime.createOwnerEntry(workflow.state, plan.tasks[0], 'api')
    owners.push(first)
    const firstCommit = await commitFile(first.worktree, 'owned/first.txt', '首任务内容\n', '完成首个任务')
    await mergeCommit(workflow.state.workflowWorktree, firstCommit, '合并首个任务')
    const workflowHead = await head(workflow.state.workflowWorktree)

    const second = await runtime.createOwnerEntry(workflow.state, plan.tasks[1], 'api')
    owners.push(second)

    assert.equal(first.branch, `dsh/owner/${workflow.state.id}/api`)
    assert.equal(first.worktree, join(
      root,
      '.dsh-workflow',
      'worktrees',
      workflow.state.id,
      'owners',
      'api',
    ))
    assert.equal(second.branch, first.branch)
    assert.equal(second.worktree, first.worktree)
    assert.equal(await head(second.worktree), workflowHead)
    assert.equal(second.baseCommit, workflowHead)
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow, owners)
  }
})

test('V2 task finish 合入固定 SHA、完成 task/ownerRun，并让后继从新 workflow HEAD 同步', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  const plan = normalizePlanV2({
    contract: PLAN_V2_CONTRACT,
    registryDigest: 'a'.repeat(64),
    summary: 'V2 task finish 测试计划',
    owners: [{
      id: 'owner-a',
      name: '区域甲 Owner',
      description: '负责 owned 文件区域',
      scope: ['owned/**'],
      exclude: [],
    }],
    verifications: [{ id: 'unit', run: ['node', '--test'] }],
    tasks: [
      {
        id: 'T1', role: 'work', ownerId: 'owner-a', title: '首任务', dependsOn: [],
        write: ['owned/first.txt'], verify: ['unit'], done: ['首任务完成'],
      },
      {
        id: 'T2', role: 'work', ownerId: 'owner-a', title: '后继任务', dependsOn: ['T1'],
        write: ['owned/second.txt'], verify: ['unit'], done: ['后继任务完成'],
      },
    ],
  })
  let workflow
  let first
  let second
  try {
    workflow = await createWorkflow(root, runtime, plan, { id: 'wf-v2-task-finish' })
    runtime.assertRequiredTaskVerifications = async () => ({
      contentDigest: 'a'.repeat(64),
      verificationIds: ['unit'],
    })
    first = await runtime.createOwnerEntry(workflow.state, plan.tasks[0], 'owner-a')
    const fixedSha = await commitFile(first.worktree, 'owned/first.txt', '固定 SHA 内容\n', 'Owner 固定 SHA')
    const state = await readState(root, workflow.state.id)
    state.tasks = createTaskState(plan).map(task => task.taskId === 'T1'
      ? { ...task, status: 'running', executorId: 'owner-session' }
      : task)
    state.ownerRuns = {
      'T1:owner-a': {
        status: 'awaiting_finish',
        taskId: 'T1',
        stageId: 'T1',
        ownerId: 'owner-a',
        branch: first.branch,
        worktree: first.worktree,
        baseCommit: first.baseCommit,
        result: {
          ownerId: 'owner-a',
          branch: first.branch,
          worktree: first.worktree,
          baseCommit: first.baseCommit,
          commitSha: fixedSha,
          sessionId: 'owner-session',
          report: {
            summary: '固定 SHA 完成',
            changes: [],
            tests: [],
            handoffs: [],
            memoryUpdates: [{
              type: 'history',
              title: '固定 SHA 交付',
              summary: 'Owner 完成固定 SHA 交付并已合入 workflow。',
              files: ['owned/first.txt'],
              ownerIds: ['owner-a'],
              supersedes: [],
              derivedFrom: [],
            }],
          },
        },
      },
    }
    await writeState(root, state)

    await runtime.finishOwner(workflow.agent, state.id, 'T1', 'owner-a')

    const saved = await readState(root, state.id)
    const task = saved.tasks.find(item => item.taskId === 'T1')
    assert.equal(task.status, 'completed')
    assert.equal(saved.ownerRuns['T1:owner-a'].status, 'completed')
    assert.equal(saved.workflowHead, await head(saved.workflowWorktree))
    assert.equal(await isCommitAncestor(root, fixedSha, saved.workflowHead), true)
    assert.equal(saved.ownerRuns['T1:owner-a'].result.memory.enabled, true)
    assert.equal(saved.ownerRuns['T1:owner-a'].result.memory.memoryCommitSha, saved.workflowHead)
    assert.equal(saved.pendingMemoryCompilation, undefined)
    assert.match(
      await readFile(join(saved.workflowWorktree, '.owner-memory', 'index.md'), 'utf8'),
      /固定 SHA 交付/u,
    )
    assert.match(
      await readFile(join(saved.workflowWorktree, '.owner-memory', 'log.md'), 'utf8'),
      /owner-memory-stage:wf-v2-task-finish:T1:start/u,
    )
    assert.match(
      await readFile(join(saved.workflowWorktree, '.owner-memory', '.sources', 'wf-v2-task-finish', 't1.md'), 'utf8'),
      /固定 SHA 完成/u,
    )

    second = await runtime.createOwnerEntry(saved, plan.tasks[1], 'owner-a')
    assert.equal(await head(second.worktree), saved.workflowHead)
    assert.equal(second.baseCommit, saved.workflowHead)
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow, [first, second].filter(Boolean))
  }
})

test('记忆编译失败后恢复 awaiting_finish Owner 时只重试结算', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  const plan = createPlan()
  let workflow
  let owner
  try {
    workflow = await createWorkflow(root, runtime, plan, { id: 'wf-memory-finish-recovery' })
    owner = await createOwner(root, workflow, 'stage-1', 'owner-a')
    const state = await readState(root, workflow.state.id)
    setTaskStatus(state, 'stage-1', 'running')
    state.status = 'failed'
    state.error = 'Owner 长期记忆编译失败：pages[0].derivedFrom 包含无效记忆编号'
    state.pendingTaskMerge = { taskId: 'stage-1', ownerId: 'owner-a' }
    state.ownerRuns = {
      'stage-1:owner-a': {
        status: 'awaiting_finish',
        taskId: 'stage-1',
        stageId: 'stage-1',
        ownerId: 'owner-a',
        branch: owner.branch,
        worktree: owner.worktree,
        result: {
          ownerId: 'owner-a',
          branch: owner.branch,
          worktree: owner.worktree,
          sessionId: 'memory-recovery-owner',
        },
      },
    }
    await writeState(root, state)

    let finishCalls = 0
    let bridgeState
    runtime.finishOwner = async () => {
      finishCalls += 1
      const resumed = await readState(root, workflow.state.id)
      assert.equal(resumed.status, 'running')
      assert.equal(resumed.error, undefined)
      return { resumed: true }
    }
    runtime.ensureControlBridge = async (_agent, state) => {
      bridgeState = state
      return { workflowId: state.id }
    }

    assert.deepEqual(
      await runtime.recoverOwner(workflow.agent, workflow.state.id, 'stage-1', 'owner-a'),
      { resumed: true },
    )
    assert.equal(finishCalls, 1)
    assert.equal(bridgeState?.id, workflow.state.id)
    assert.equal(bridgeState?.status, 'running')
    const saved = await readState(root, workflow.state.id)
    assert.equal(saved.status, 'running')
    assert.equal(saved.ownerRuns['stage-1:owner-a'].status, 'awaiting_finish')
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow, owner === undefined ? [] : [owner])
  }
})

test('cancel 活动 Owner 时中止执行并删除 dirty 临时分支与 worktree', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  const plan = createPlan()
  let workflow
  let owner
  const ownerStarted = Promise.withResolvers()
  const ownerGate = Promise.withResolvers()
  try {
    workflow = await createWorkflow(root, runtime, plan, { id: 'wf-cancel-preserves-active-owner' })
    const registry = await registerPlanOwners(workflow.state.workflowWorktree, plan)
    const registryRecords = await statusRecords(workflow.state.workflowWorktree)
    const registryFiles = [...new Set(registryRecords.flatMap(record => [
      record.path,
      ...(record.originalPath === undefined ? [] : [record.originalPath]),
    ]))]
    await commitFiles(workflow.state.workflowWorktree, registryFiles, '登记 cancel 测试 Owner Registry')
    const state = await readState(root, workflow.state.id)
    state.registryDigest = registryContentDigest(registry)
    await writeState(root, state)

    runtime.runOwnerEntry = async (_agent, _state, _stage, entry, signal) => {
      owner = entry
      await writeFile(join(entry.worktree, 'README.md'), 'cancel tracked 现场\n', 'utf8')
      await writeFile(join(entry.worktree, 'owner-untracked.txt'), 'cancel untracked 现场\n', 'utf8')
      await writeFile(join(root, '.git', 'info', 'exclude'), 'owner-ignored.txt\n', 'utf8')
      await writeFile(join(entry.worktree, 'owner-ignored.txt'), 'cancel ignored 现场\n', 'utf8')
      ownerStarted.resolve()
      await Promise.race([
        ownerGate.promise,
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason ?? new Error('Workflow 已取消')), { once: true })
        }),
      ])
      return {
        ownerId: entry.owner.id,
        branch: entry.branch,
        worktree: entry.worktree,
        baseCommit: entry.baseCommit,
        commitSha: await head(entry.worktree),
        report: { summary: 'cancel 后不应结算', changes: [], tests: [] },
        changedFiles: [],
        ahead: 0,
      }
    }

    const run = runtime.runExternalOwner(workflow.agent, state.id, 'stage-1', 'owner-a')
    const runOutcome = run.then(
      value => ({ value }),
      error => ({ error }),
    )
    await ownerStarted.promise
    await writeFile(join(workflow.state.workflowWorktree, 'workflow-draft.txt'), 'workflow 现场\n', 'utf8')
    const activeState = await readState(root, state.id)
    activeState.tasks = activeState.tasks.map((task, index) => ({
      ...task,
      status: index === 0 ? 'running' : 'pending',
      executorId: index === 0 ? 'owner-session' : null,
      cursor: null,
      unchangedPolls: 0,
      reason: null,
      action: null,
    }))
    activeState.supervisorOutbox = {
      'stage-1:owner-a': { taskId: 'stage-1', ownerId: 'owner-a', status: 'launching' },
      'stage-2:owner-a': { taskId: 'stage-2', ownerId: 'owner-a', status: 'reserved' },
    }
    await writeState(root, activeState)
    await runtime.cancelWorkflow(workflow.agent, state.id)

    let saved = await readState(root, state.id)
    assert.equal(saved.status, 'cancelled')
    assert.equal(saved.ownerRuns['stage-1:owner-a'].status, 'stopped')
    assert.equal(saved.ownerRuns['stage-1:owner-a'].reason, 'decision_required')
    assert.equal(saved.ownerRuns['stage-1:owner-a'].action, 'await_user')
    assert.deepEqual(saved.tasks.map(task => [task.status, task.reason, task.action]), [
      ['stopped', 'decision_required', 'await_user'],
      ['stopped', 'decision_required', 'await_user'],
    ])
    assert.deepEqual(Object.values(saved.supervisorOutbox).map(reservation => [
      reservation.status,
      reservation.reason,
      reservation.action,
    ]), [
      ['stopped', 'decision_required', 'await_user'],
      ['stopped', 'decision_required', 'await_user'],
    ])
    assert.equal(saved.temporaryArtifactsCleaned, true)
    assert.equal(typeof saved.temporaryArtifactsCleanedAt, 'string')
    assert.equal(existsSync(owner.worktree), false)
    assert.equal(existsSync(workflow.state.workflowWorktree), false)
    assert.deepEqual(await listBranches(root, owner.branch), [])
    assert.deepEqual(await listBranches(root, workflow.state.workflowBranch), [])

    const cancellationRevision = saved.revision
    await runtime.cancelWorkflow(workflow.agent, state.id)
    saved = await readState(root, state.id)
    assert.equal(saved.revision, cancellationRevision)
    await assert.rejects(runtime.runExternalOwner(workflow.agent, state.id, 'stage-2', 'owner-a'), /cancelled|已取消/u)
    await assert.rejects(runtime.approvePlan(workflow.agent, state.id, saved.planDigest), /cancelled|已取消/u)

    const stoppedRun = await runOutcome
    assert.equal(stoppedRun.value, undefined)
    assert.match(
      `${stoppedRun.error?.message ?? ''}\n${stoppedRun.error?.cause?.message ?? ''}`,
      /cancelled|已取消|清理|Lease/u,
    )
    await assert.rejects(
      runtime.finishOwner(workflow.agent, state.id, 'stage-1', 'owner-a'),
      /cancelled|已取消/u,
    )
    saved = await readState(root, state.id)
    assert.equal(saved.status, 'cancelled')
    assert.equal(saved.ownerRuns['stage-1:owner-a'].status, 'stopped')
    const status = await runtime.status(workflow.agent, state.id, { ensureBridge: false, detail: true })
    assert.equal(status.workflow.status, 'cancelled')
    assert.equal(status.workflow.temporaryArtifactsCleaned, true)
    assert.equal(status.logs.filter(entry => entry.event === 'workflow.cancelled').length, 1)
    assert.equal(status.logs.filter(entry => entry.event === 'workflow.temporary-artifacts-cleaned').length, 1)
    assert.equal(status.logs.some(entry => entry.event === 'owner.failed'), false)
  } finally {
    ownerGate.resolve()
    await Promise.allSettled([...runtime.externalOwnerRuns.values()])
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow, owner === undefined ? [] : [owner])
  }
})

test('cancel 拒绝已 finalized 的 workflow，且不改写持久化状态', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  let workflow
  try {
    workflow = await createWorkflow(root, runtime, createPlan(), {
      id: 'wf-cancel-finalized-rejected',
      status: 'completed',
    })
    const state = await readState(root, workflow.state.id)
    state.finalized = true
    state.finalizedAt = new Date().toISOString()
    await writeState(root, state)

    await assert.rejects(runtime.cancelWorkflow(workflow.agent, state.id), /finalized/u)

    const saved = await readState(root, state.id)
    assert.equal(saved.status, 'completed')
    assert.equal(saved.finalized, true)
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow)
  }
})

test('Owner A 保留未提交修改原地恢复，并以 Owner B 已合并的新 HEAD 作为共同审计 base', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, { maxOwnerRepairTurns: 0 })
  runtime.assertRequiredTaskVerifications = async () => ({
    contentDigest: 'a'.repeat(64),
    verificationIds: ['unit'],
  })
  const plan = createPlan({ secondStageOwner: 'owner-b', secondStageFile: 'handoff/request.txt' })
  let workflow
  const owners = []
  try {
    workflow = await createWorkflow(root, runtime, plan, {
      id: 'wf-owner-recovery-rebases-audit-base',
      status: 'running',
    })
    const registry = await registerPlanOwners(workflow.state.workflowWorktree, plan)
    const registryFiles = (await statusRecords(workflow.state.workflowWorktree))
      .flatMap(record => [record.path, ...(record.originalPath === undefined ? [] : [record.originalPath])])
    await commitFiles(workflow.state.workflowWorktree, [...new Set(registryFiles)], '登记恢复测试 Owner Registry')
    let state = await readState(root, workflow.state.id)
    state.registryDigest = registryContentDigest(registry)
    await writeState(root, state)

    const ownerA = await runtime.createOwnerEntry(state, planTask(plan, 'stage-1'), 'owner-a')
    const ownerB = await runtime.createOwnerEntry(state, planTask(plan, 'stage-2'), 'owner-b')
    owners.push(ownerA, ownerB)
    const ownerBCommit = await commitFile(
      ownerB.worktree,
      'handoff/request.txt',
      'Owner B 已合并内容\n',
      'Owner B 完成独立任务',
    )
    await mergeCommit(workflow.state.workflowWorktree, ownerBCommit, '合并 Owner B 任务')
    const workflowHeadAfterB = await head(workflow.state.workflowWorktree)
    await mkdir(join(ownerA.worktree, 'owned'), { recursive: true })
    await writeFile(join(ownerA.worktree, 'owned', 'result.txt'), 'Owner A 上次失败后保留的未提交内容\n', 'utf8')

    state = await readState(root, workflow.state.id)
    state.status = 'failed'
    state.error = '模拟 Owner A 在没有独有提交时失败'
    state.ownerRuns['stage-1:owner-a'] = {
      status: 'failed',
      ownerId: 'owner-a',
      stageId: 'stage-1',
      branch: ownerA.branch,
      worktree: ownerA.worktree,
      baseCommit: ownerA.baseCommit,
      error: state.error,
    }
    state.supervisorTimeouts = {
      'stage-1': {
        taskId: 'stage-1',
        ownerId: 'owner-a',
        timedOutAt: new Date(Date.now() - 60_000).toISOString(),
      },
    }
    await writeState(root, state)

    runtime.runChild = async (_agent, _cwd, _prompt, _signal, options) => {
      const entry = options.activeOwner.entry
      assert.equal(entry.resumedDirty, true)
      assert.deepEqual(entry.recoveryFiles, ['owned/result.txt'])
      assert.equal(await readFile(join(entry.worktree, 'owned', 'result.txt'), 'utf8'), 'Owner A 上次失败后保留的未提交内容\n')
      const report = JSON.parse(ownerResult({ files: ['owned/result.txt'], summary: 'Owner A 原地恢复完成' }))
      const inspection = await runtime.inspectOwnerAttempt(options.activeOwner.state, entry, report)
      const committed = await runtime.commitOwnerAttempt(options.activeOwner.state, options.activeOwner.stage, entry, inspection)
      return {
        sessionId: 'owner-a-recovered-session',
        report,
        committed,
      }
    }

    const result = await runtime.recoverOwner(workflow.agent, state.id, 'stage-1', 'owner-a')
    const saved = await readState(root, state.id)
    assert.equal(result.baseCommit, ownerA.baseCommit)
    assert.equal(saved.ownerRuns['stage-1:owner-a'].baseCommit, ownerA.baseCommit)
    assert.equal(saved.supervisorTimeouts?.['stage-1'], undefined)
    assert.deepEqual(result.changedFiles, ['owned/result.txt'])
    assert.equal(result.changedFiles.includes('handoff/request.txt'), false)
    const mergedWorkflowHead = await head(workflow.state.workflowWorktree)
    assert.notEqual(mergedWorkflowHead, workflowHeadAfterB)
    assert.equal(await isCommitAncestor(root, ownerBCommit, mergedWorkflowHead), true)
    assert.equal(await isCommitAncestor(root, result.commitSha, mergedWorkflowHead), true)
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow, owners)
  }
})

test('恢复记录含独有固定提交但分支历史丢失时拒绝重置审计基线', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  const plan = createPlan({ secondStageOwner: 'owner-b', secondStageFile: 'handoff/request.txt' })
  let workflow
  const owners = []
  try {
    workflow = await createWorkflow(root, runtime, plan, {
      id: 'wf-owner-recovery-preserves-fixed-commit-audit',
      status: 'running',
    })
    const registry = await registerPlanOwners(workflow.state.workflowWorktree, plan)
    const registryFiles = (await statusRecords(workflow.state.workflowWorktree))
      .flatMap(record => [record.path, ...(record.originalPath === undefined ? [] : [record.originalPath])])
    await commitFiles(workflow.state.workflowWorktree, [...new Set(registryFiles)], '登记固定提交审计测试 Owner Registry')
    let state = await readState(root, workflow.state.id)
    state.registryDigest = registryContentDigest(registry)
    await writeState(root, state)

    const ownerA = await runtime.createOwnerEntry(state, planTask(plan, 'stage-1'), 'owner-a')
    const ownerB = await runtime.createOwnerEntry(state, planTask(plan, 'stage-2'), 'owner-b')
    owners.push(ownerA, ownerB)
    const ownerACommit = await commitFile(
      ownerA.worktree,
      'owned/result.txt',
      'Owner A 的独有固定提交\n',
      'Owner A 产生固定提交',
    )
    const ownerBCommit = await commitFile(
      ownerB.worktree,
      'handoff/request.txt',
      'Owner B 已合并内容\n',
      'Owner B 完成独立任务',
    )
    await mergeCommit(workflow.state.workflowWorktree, ownerBCommit, '合并 Owner B 任务')
    const workflowHeadAfterB = await head(workflow.state.workflowWorktree)

    await runGit(ownerA.worktree, ['reset', '--hard', workflowHeadAfterB])
    state = await readState(root, workflow.state.id)
    state.status = 'failed'
    state.error = '模拟恢复记录的 Owner 分支丢失独有固定提交'
    state.ownerRuns['stage-1:owner-a'] = {
      status: 'failed',
      ownerId: 'owner-a',
      stageId: 'stage-1',
      branch: ownerA.branch,
      worktree: ownerA.worktree,
      baseCommit: ownerA.baseCommit,
      result: {
        baseCommit: ownerA.baseCommit,
        commitSha: ownerACommit,
      },
      error: state.error,
    }
    await writeState(root, state)

    runtime.runOwnerContinuable = async (_agent, _state, _stage, entry) => {
      await mkdir(join(entry.worktree, 'owned'), { recursive: true })
      await writeFile(join(entry.worktree, 'owned', 'result.txt'), '不应执行恢复\n', 'utf8')
      return {
        sessionId: 'owner-a-audit-invariant-session',
        output: ownerResult({ files: ['owned/result.txt'], summary: '不应执行恢复' }),
      }
    }

    await assert.rejects(
      runtime.recoverOwner(workflow.agent, state.id, 'stage-1', 'owner-a'),
      /固定提交.*持久化 Owner 分支历史|审计/u,
    )
    state = await readState(root, state.id)
    assert.equal(state.ownerRuns['stage-1:owner-a'].baseCommit, ownerA.baseCommit)
    assert.equal(state.ownerRuns['stage-1:owner-a'].result.commitSha, ownerACommit)
    assert.equal(await head(ownerA.worktree), workflowHeadAfterB)
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow, owners)
  }
})

async function registerPlanOwners(worktree, plan) {
  let registry = await ensureRegistry(worktree)
  for (const owner of plan.owners) {
    if (registry.owners.some(current => current.id === owner.id)) continue
    const proposal = proposeRegistryChange(registry, {
      type: 'add',
      owner,
      reason: `为 resilience fixture 登记 ${owner.id}`,
    })
    registry = await applyApprovedRegistryChange(worktree, {
      ...proposal,
      approvedDigest: proposal.digest,
    })
  }
  return registry
}

test('控制桥使用持久 lease，不能被第二个 Harness 进程抢占 socket', async () => {
  const { root } = await createRepository()
  const first = createOwnerWorkflowRuntime({}, {})
  const second = createOwnerWorkflowRuntime({}, {})
  try {
    const workflow = await createWorkflow(root, first, createPlan(), { id: 'wf-control-lease', status: 'planned' })
    const firstManifest = await first.ensureControlBridge(workflow.agent, workflow.state)
    await assert.rejects(
      second.ensureControlBridge(
        { id: 'second-agent', session: { id: 'second-agent', header: { cwd: root } } },
        workflow.state,
      ),
      /控制桥|存活的 Harness 进程|占用/u,
    )
    assert.equal(existsSync(firstManifest.socketPath), true)
    await first.dispose()
    const recovered = await second.ensureControlBridge(
      { id: 'second-agent', session: { id: 'second-agent', header: { cwd: root } } },
      workflow.state,
    )
    assert.equal(existsSync(recovered.socketPath), true)
  } finally {
    await first.dispose()
    await second.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('Registry 提案更新后拒绝用陈旧快照重新保存规划状态', async () => {
  const { root } = await createRepository()
  const firstRuntime = createOwnerWorkflowRuntime({}, {})
  const secondRuntime = createOwnerWorkflowRuntime({}, {})
  let workflow
  try {
    workflow = await createWorkflow(root, firstRuntime, createPlan(), {
      id: 'wf-state-cas',
      status: 'planned',
    })
    await registerPlanOwners(workflow.state.workflowWorktree, workflow.state.plan)
    await secondRuntime.prepareRoot(root)
    const secondAgent = {
      id: 'second-agent',
      session: { id: 'second-agent', header: { cwd: root } },
    }
    const staleState = await readState(root, workflow.state.id)
    const proposal = await secondRuntime.proposeOwnerChange(secondAgent, workflow.state.id, {
      type: 'add',
      owner: {
        id: 'owner-c',
        name: '区域丙 Owner',
        description: '负责区域丙文件',
        scope: ['extra-c/**'],
        exclude: [],
      },
      reason: '为陈旧状态 CAS 测试提出正式 Owner Registry 变更',
    })
    firstRuntime.runChild = async () => JSON.stringify(workflow.state.plan)

    await assert.rejects(
      firstRuntime.planWorkflowState(workflow.agent, staleState),
      /状态已被其他 Harness 更新/u,
    )

    const saved = await readState(root, workflow.state.id)
    assert.equal(saved.revision, 1)
    assert.equal(saved.pendingRegistryProposal.digest, proposal.digest)
    assert.equal(saved.suggestedRegistryOperation, undefined)
  } finally {
    await disposeRuntime(firstRuntime)
    await disposeRuntime(secondRuntime)
    await cleanupWorkflow(root, workflow)
  }
})

test('两个 Runtime 竞争批准时 Registry 与 workflow state 保持同一结果', async () => {
  const { root } = await createRepository()
  const firstRuntime = createOwnerWorkflowRuntime({}, {})
  const secondRuntime = createOwnerWorkflowRuntime({}, {})
  let workflow
  try {
    workflow = await createWorkflow(root, firstRuntime, createPlan(), {
      id: 'wf-registry-approval-race',
      status: 'planned',
    })
    const registry = await registerPlanOwners(workflow.state.workflowWorktree, workflow.state.plan)
    const state = await readState(root, workflow.state.id)
    state.registryDigest = registryContentDigest(registry)
    await writeState(root, state)
    await secondRuntime.prepareRoot(root)
    const proposal = await firstRuntime.proposeOwnerChange(workflow.agent, state.id, {
      type: 'add',
      owner: {
        id: 'owner-c',
        name: '区域丙 Owner',
        description: '负责区域丙文件',
        scope: ['extra-c/**'],
        exclude: [],
      },
      reason: '验证两个 Runtime 的批准竞争',
    })
    const secondAgent = { id: 'second-agent', session: { id: 'second-agent', header: { cwd: root } } }

    const results = await Promise.allSettled([
      firstRuntime.approveOwnerChange(workflow.agent, state.id, proposal.digest),
      secondRuntime.approveOwnerChange(secondAgent, state.id, proposal.digest),
    ])
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(results.filter(result => result.status === 'rejected').length, 1)
    assert.match(results.find(result => result.status === 'rejected').reason.message, /临界区|其他 Harness|没有待批准|状态已被/u)

    const liveRegistry = await loadRegistry(workflow.state.workflowWorktree)
    const saved = await readState(root, state.id)
    assert.deepEqual(liveRegistry.owners.map(owner => owner.id), ['owner-a', 'owner-b', 'owner-c'])
    assert.equal(saved.registryDigest, registryContentDigest(liveRegistry))
    assert.equal(saved.approvedProposalDigest, proposal.digest)
    assert.equal(saved.pendingRegistryProposal, undefined)
    assert.equal(saved.status, 'registry_pending_plan')
    assert.match(
      await runGit(workflow.state.workflowWorktree, ['ls-files', '--stage', '--', '.owner-workflow']),
      /\.owner-workflow\/owners\/owner-c\.md/u,
    )
    assert.equal(await runGit(workflow.state.workflowWorktree, ['diff', '--name-only', '--', '.owner-workflow']), '')
  } finally {
    await disposeRuntime(firstRuntime)
    await disposeRuntime(secondRuntime)
    await cleanupWorkflow(root, workflow)
  }
})

test('Registry 批准先赢 workflow state 锁时，另一个 Runtime 不得启动旧计划 Owner', async () => {
  const { root } = await createRepository()
  const ownerRuntime = createOwnerWorkflowRuntime({}, {})
  const approvalRuntime = createOwnerWorkflowRuntime({}, {})
  const ownerGate = Promise.withResolvers()
  let workflow
  let ownerStart
  let entryCalls = 0
  let runCalls = 0
  try {
    workflow = await createWorkflow(root, ownerRuntime, createPlan(), {
      id: 'wf-registry-approval-owner-start-race',
      status: 'approved',
    })
    const registry = await registerPlanOwners(workflow.state.workflowWorktree, workflow.state.plan)
    const state = await readState(root, workflow.state.id)
    state.registryDigest = registryContentDigest(registry)
    await writeState(root, state)
    await approvalRuntime.prepareRoot(root)
    const approvalAgent = {
      id: 'approval-agent',
      session: { id: 'approval-agent', header: { cwd: root } },
    }
    const proposal = await approvalRuntime.proposeOwnerChange(approvalAgent, state.id, {
      type: 'add',
      owner: {
        id: 'owner-c',
        name: '区域丙 Owner',
        description: '负责区域丙文件',
        scope: ['extra-c/**'],
        exclude: [],
      },
      reason: '验证 Registry 批准与另一个 Runtime 的 Owner 启动竞争',
    })

    ownerRuntime.createOwnerEntry = async (latestState, stage, ownerId) => {
      entryCalls += 1
      const commitSha = await head(latestState.workflowWorktree)
      return {
        owner: latestState.plan.owners.find(owner => owner.id === ownerId),
        tasks: stage.tasks.filter(task => task.ownerId === ownerId),
        branch: latestState.workflowBranch,
        worktree: latestState.workflowWorktree,
        baseCommit: commitSha,
        stageId: stage.id,
      }
    }
    ownerRuntime.runOwnerEntry = async (_agent, latestState, stage, entry) => {
      runCalls += 1
      return {
        ownerId: entry.owner.id,
        branch: entry.branch,
        worktree: entry.worktree,
        baseCommit: entry.baseCommit,
        commitSha: entry.baseCommit,
        report: {
          summary: '旧计划 Owner 不应执行',
          changes: [],
          tests: [],
          handoffs: [],
        },
        changedFiles: [],
        ahead: 0,
        stageId: stage.id,
        workflowId: latestState.id,
      }
    }

    ownerRuntime.workflowLocks.set(state.id, ownerGate.promise)
    ownerStart = ownerRuntime.runExternalOwner(workflow.agent, state.id, 'stage-1', 'owner-a')
    await waitForCondition(
      () => ownerRuntime.workflowLocks.get(state.id) !== ownerGate.promise,
      'Owner 排队等待本 Runtime workflow 锁',
    )

    await approvalRuntime.approveOwnerChange(approvalAgent, state.id, proposal.digest)
    ownerGate.resolve()

    await assert.rejects(
      ownerStart,
      /registry_pending_plan|当前状态不能启动|状态已被其他 Harness 更新/u,
    )
    ownerStart = undefined

    const liveRegistry = await loadRegistry(workflow.state.workflowWorktree)
    const saved = await readState(root, state.id)
    assert.deepEqual(liveRegistry.owners.map(owner => owner.id), ['owner-a', 'owner-b', 'owner-c'])
    assert.equal(saved.registryDigest, registryContentDigest(liveRegistry))
    assert.equal(saved.approvedProposalDigest, proposal.digest)
    assert.equal(saved.pendingRegistryProposal, undefined)
    assert.equal(saved.status, 'registry_pending_plan')
    assert.equal(saved.planApproved, false)
    assert.equal(saved.planReview, undefined)
    assert.equal(saved.planReviewDigest, undefined)
    assert.equal(saved.ownerRuns['stage-1:owner-a'], undefined)
    assert.equal(entryCalls, 0)
    assert.equal(runCalls, 0)
    assert.equal(existsSync(ownerRuntime.leasePath(root, 'owner-owner-a')), false)
  } finally {
    ownerGate.resolve()
    await ownerStart?.catch(() => undefined)
    await disposeRuntime(ownerRuntime)
    await disposeRuntime(approvalRuntime)
    await cleanupWorkflow(root, workflow)
  }
})

test('Owner 获得 lease 后必须用 Registry 批准写入的最新 state 拒绝启动旧计划', async () => {
  const { root } = await createRepository()
  const ownerRuntime = createOwnerWorkflowRuntime({}, {})
  let workflow
  let entryCalls = 0
  let runCalls = 0
  try {
    workflow = await createWorkflow(root, ownerRuntime, createPlan(), {
      id: 'wf-owner-start-fresh-state',
      status: 'approved',
    })
    const registry = await registerPlanOwners(workflow.state.workflowWorktree, workflow.state.plan)
    const state = await readState(root, workflow.state.id)
    state.registryDigest = registryContentDigest(registry)
    await writeState(root, state)

    ownerRuntime.createOwnerEntry = async (latestState, stage, ownerId) => {
      entryCalls += 1
      const commitSha = await head(latestState.workflowWorktree)
      return {
        owner: latestState.plan.owners.find(owner => owner.id === ownerId),
        tasks: stage.tasks.filter(task => task.ownerId === ownerId),
        branch: latestState.workflowBranch,
        worktree: latestState.workflowWorktree,
        baseCommit: commitSha,
        stageId: stage.id,
      }
    }
    ownerRuntime.runOwnerEntry = async (_agent, latestState, stage, entry) => {
      runCalls += 1
      return {
        ownerId: entry.owner.id,
        branch: entry.branch,
        worktree: entry.worktree,
        baseCommit: entry.baseCommit,
        commitSha: entry.baseCommit,
        report: {
          summary: '失效计划不应执行',
          changes: [],
          tests: [],
          handoffs: [],
        },
        changedFiles: [],
        ahead: 0,
        stageId: stage.id,
        workflowId: latestState.id,
      }
    }
    const withOwnerLease = ownerRuntime.withOwnerLease
    let invalidated = false
    ownerRuntime.withOwnerLease = async (...args) => {
      const [leaseRoot, leaseOwnerId, leaseWorkflowId] = args
      if (leaseRoot === root && leaseOwnerId === `workflow-lock-${state.id}` && leaseWorkflowId === state.id) {
        const operation = args.at(-1)
        args[args.length - 1] = async (...operationArgs) => {
          if (!invalidated) {
            invalidated = true
            const latest = await readState(root, state.id)
            latest.status = 'registry_pending_plan'
            latest.planApproved = false
            latest.planApprovedAt = undefined
            latest.planApprovedBy = undefined
            latest.planReview = undefined
            latest.planReviewDigest = undefined
            latest.planReviewedAt = undefined
            await writeState(root, latest)
          }
          return operation(...operationArgs)
        }
      }
      return withOwnerLease(...args)
    }

    await assert.rejects(
      ownerRuntime.runExternalOwner(workflow.agent, state.id, 'stage-1', 'owner-a'),
      /registry_pending_plan|当前状态不能启动/u,
    )

    const saved = await readState(root, state.id)
    assert.equal(invalidated, true)
    assert.equal(saved.status, 'registry_pending_plan')
    assert.equal(saved.planApproved, false)
    assert.equal(saved.planReview, undefined)
    assert.equal(saved.planReviewDigest, undefined)
    assert.equal(saved.ownerRuns['stage-1:owner-a'], undefined)
    assert.equal(entryCalls, 0)
    assert.equal(runCalls, 0)
  } finally {
    await disposeRuntime(ownerRuntime)
    await cleanupWorkflow(root, workflow)
  }
})

test('另一个 Runtime 持有 workflow CAS 锁时批准不会先改 Registry', async () => {
  const { root } = await createRepository()
  const firstRuntime = createOwnerWorkflowRuntime({}, {})
  const secondRuntime = createOwnerWorkflowRuntime({}, {})
  let workflow
  let lockDirectory
  try {
    workflow = await createWorkflow(root, firstRuntime, createPlan(), {
      id: 'wf-registry-approval-cas-lock',
      status: 'planned',
    })
    const registry = await registerPlanOwners(workflow.state.workflowWorktree, workflow.state.plan)
    const state = await readState(root, workflow.state.id)
    state.registryDigest = registryContentDigest(registry)
    await writeState(root, state)
    await secondRuntime.prepareRoot(root)
    const proposal = await firstRuntime.proposeOwnerChange(workflow.agent, state.id, {
      type: 'add',
      owner: {
        id: 'owner-c',
        name: '区域丙 Owner',
        description: '负责区域丙文件',
        scope: ['extra-c/**'],
        exclude: [],
      },
      reason: '验证 CAS 锁先于 Registry 应用',
    })
    const stateFile = join(root, '.dsh-workflow', 'workflows', `${state.id}.json`)
    lockDirectory = `${stateFile}.write-lock`
    const indexBefore = await runGit(workflow.state.workflowWorktree, ['ls-files', '--stage', '-z', '--', '.owner-workflow'])
    await mkdir(lockDirectory, { mode: 0o700 })
    await writeFile(join(lockDirectory, 'lease.json'), `${JSON.stringify({
      pid: process.pid,
      token: 'second-runtime-holds-cas',
      createdAt: new Date().toISOString(),
    })}\n`, 'utf8')

    await assert.rejects(
      firstRuntime.approveOwnerChange(workflow.agent, state.id, proposal.digest),
      /另一个 Harness 临界区|状态正在由另一个 Harness/u,
    )
    const liveRegistry = await loadRegistry(workflow.state.workflowWorktree)
    const saved = await readState(root, state.id)
    assert.deepEqual(liveRegistry.owners.map(owner => owner.id), ['owner-a', 'owner-b'])
    assert.equal(saved.pendingRegistryProposal.digest, proposal.digest)
    assert.equal(saved.registryDigest, registryContentDigest(liveRegistry))
    assert.equal(saved.approvedProposalDigest, undefined)
    assert.equal(
      await runGit(workflow.state.workflowWorktree, ['ls-files', '--stage', '-z', '--', '.owner-workflow']),
      indexBefore,
    )
    assert.equal(await runGit(workflow.state.workflowWorktree, ['diff', '--name-only', '--', '.owner-workflow']), '')
  } finally {
    if (lockDirectory !== undefined) await rm(lockDirectory, { recursive: true, force: true })
    await disposeRuntime(firstRuntime)
    await disposeRuntime(secondRuntime)
    await cleanupWorkflow(root, workflow)
  }
})

test('workflow state 原子保存失败时回滚 Registry 内容和 index', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  let workflow
  let registryLock
  let displacedStateFile
  let stateFile
  try {
    workflow = await createWorkflow(root, runtime, createPlan(), {
      id: 'wf-registry-approval-state-save-failure',
      status: 'planned',
    })
    const registry = await registerPlanOwners(workflow.state.workflowWorktree, workflow.state.plan)
    const state = await readState(root, workflow.state.id)
    state.registryDigest = registryContentDigest(registry)
    await writeState(root, state)
    const proposal = await runtime.proposeOwnerChange(workflow.agent, state.id, {
      type: 'add',
      owner: {
        id: 'owner-c',
        name: '区域丙 Owner',
        description: '负责区域丙文件',
        scope: ['extra-c/**'],
        exclude: [],
      },
      reason: '验证 state 保存失败后的 Registry 可靠恢复',
    })
    stateFile = join(root, '.dsh-workflow', 'workflows', `${state.id}.json`)
    displacedStateFile = `${stateFile}.before-save-failure`
    registryLock = join(workflow.state.workflowWorktree, '.owner-workflow.lock')
    const indexBefore = await runGit(workflow.state.workflowWorktree, ['ls-files', '--stage', '-z', '--', '.owner-workflow'])
    await mkdir(registryLock, { mode: 0o700 })
    await writeFile(join(registryLock, 'owner.json'), `${JSON.stringify({
      contract: 'DSH_OWNER_REGISTRY_LOCK_V1',
      token: 'state-save-failure-fixture',
      pid: process.pid,
      createdAt: new Date().toISOString(),
    })}\n`, 'utf8')

    const approval = runtime.approveOwnerChange(workflow.agent, state.id, proposal.digest)
    await waitForPath(`${stateFile}.write-lock`, 'workflow state CAS 锁')
    await rename(stateFile, displacedStateFile)
    await mkdir(stateFile)
    await rm(registryLock, { recursive: true, force: true })
    registryLock = undefined

    await assert.rejects(approval, /EISDIR|ENOTEMPTY|directory|rename/u)
    await rm(stateFile, { recursive: true, force: true })
    await rename(displacedStateFile, stateFile)
    displacedStateFile = undefined

    const liveRegistry = await loadRegistry(workflow.state.workflowWorktree)
    const saved = await readState(root, state.id)
    assert.deepEqual(liveRegistry.owners.map(owner => owner.id), ['owner-a', 'owner-b'])
    assert.equal(saved.pendingRegistryProposal.digest, proposal.digest)
    assert.equal(saved.registryDigest, registryContentDigest(liveRegistry))
    assert.equal(saved.approvedProposalDigest, undefined)
    assert.equal(
      await runGit(workflow.state.workflowWorktree, ['ls-files', '--stage', '-z', '--', '.owner-workflow']),
      indexBefore,
    )
    assert.equal(await runGit(workflow.state.workflowWorktree, ['diff', '--name-only', '--', '.owner-workflow']), '')
    assert.deepEqual(
      (await readdir(dirname(stateFile))).filter(name => name.startsWith(`${state.id}.json.tmp-`)),
      [],
    )
  } finally {
    if (registryLock !== undefined) await rm(registryLock, { recursive: true, force: true })
    if (stateFile !== undefined && existsSync(stateFile)) await rm(stateFile, { recursive: true, force: true })
    if (displacedStateFile !== undefined && existsSync(displacedStateFile)) await rename(displacedStateFile, stateFile)
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow)
  }
})

test('V2 workflow recovery 只恢复 failed task，并拒绝 planning 状态恢复', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  const plan = createPlan()
  let planningWorkflow
  let failedWorkflow
  try {
    planningWorkflow = await createWorkflow(root, runtime, plan, {
      id: 'wf-recover-planning',
      status: 'planning',
    })
    failedWorkflow = await createWorkflow(root, runtime, plan, {
      id: 'wf-recover-failed-task',
      status: 'failed',
    })
    await assert.rejects(
      runtime.recoverWorkflow(planningWorkflow.agent, planningWorkflow.state.id),
      /当前状态不需要 workflow_recover：planning/u,
    )

    const failedState = await readState(root, failedWorkflow.state.id)
    failedState.tasks = failedState.tasks.map(task => task.taskId === 'stage-1'
      ? {
        ...task,
        status: 'stopped',
        executorId: null,
        cursor: null,
        unchangedPolls: 0,
        reason: 'task_failed',
        action: 'repair_task',
      }
      : {
        ...task,
        status: 'completed',
        executorId: null,
        cursor: 'completed-stage-2',
        unchangedPolls: 0,
        reason: null,
        action: null,
      })
    failedState.ownerRuns = {
      'stage-1:owner-a': {
        status: 'failed',
        taskId: 'stage-1',
        stageId: 'stage-1',
        ownerId: 'owner-a',
        error: '模拟 Owner 失败',
      },
      'stage-2:owner-a': {
        status: 'completed',
        taskId: 'stage-2',
        stageId: 'stage-2',
        ownerId: 'owner-a',
        result: { commitSha: 'fixed-stage-2' },
      },
    }
    failedState.supervisorOutbox = {
      'stage-1:owner-a': {
        taskId: 'stage-1',
        ownerId: 'owner-a',
        status: 'failed',
        error: '模拟 Owner 失败',
      },
      'stage-2:owner-a': {
        taskId: 'stage-2',
        ownerId: 'owner-a',
        status: 'completed',
      },
    }
    failedState.error = 'task stage-1 执行失败'
    await writeState(root, failedState)
    runtime.queueSupervisorReservations = () => undefined

    const failedResult = await runtime.recoverWorkflow(failedWorkflow.agent, failedWorkflow.state.id)
    const failedSaved = await readState(root, failedWorkflow.state.id)
    assert.equal(failedResult.workflow.status, 'running')
    assert.equal(failedSaved.status, 'running')
    assert.equal(failedSaved.plan.contract, PLAN_V2_CONTRACT)
    assert.equal(failedSaved.tasks.find(task => task.taskId === 'stage-1').status, 'pending')
    assert.equal(failedSaved.tasks.find(task => task.taskId === 'stage-2').status, 'completed')
    assert.equal(failedSaved.ownerRuns['stage-1:owner-a'].status, 'pending')
    assert.equal(failedSaved.ownerRuns['stage-2:owner-a'].status, 'completed')
    assert.equal(failedSaved.supervisorOutbox['stage-1:owner-a'].status, 'reserved')
    assert.equal(failedSaved.supervisorOutbox['stage-2:owner-a'].status, 'completed')
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, planningWorkflow)
    await cleanupWorkflow(root, failedWorkflow)
  }
})

async function commitFile(worktree, file, content, message) {
  const path = join(worktree, file)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
  const result = await commitFiles(worktree, [file], message)
  assert.notEqual(result, false)
  return result.commitSha
}

function markAwaitingFinish(state, taskId, ownerEntry, commitSha, sessionId = 'owner-session') {
  setTaskStatus(state, taskId, 'running')
  const taskState = state.tasks.find(task => task.taskId === taskId)
  taskState.executorId = sessionId
  state.ownerRuns[`${taskId}:${ownerEntry.owner.id}`] = {
    status: 'awaiting_finish',
    taskId,
    ownerId: ownerEntry.owner.id,
    branch: ownerEntry.branch,
    worktree: ownerEntry.worktree,
    baseCommit: ownerEntry.baseCommit,
    sessionId,
    result: {
      ownerId: ownerEntry.owner.id,
      taskId,
      branch: ownerEntry.branch,
      worktree: ownerEntry.worktree,
      baseCommit: ownerEntry.baseCommit,
      commitSha,
      sessionId,
      report: {
        summary: 'V2 task 已完成，等待 finish 结算',
        changes: [],
        tests: ['node --test'],
        handoffs: [],
      },
    },
  }
}

function mockRequiredTaskVerifications(runtime) {
  runtime.assertRequiredTaskVerifications = async () => ({
    contentDigest: 'a'.repeat(64),
    verificationIds: ['unit'],
  })
}

async function createFinalizeSafetyFixture(id) {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  const plan = createPlan()
  const workflow = await createWorkflow(root, runtime, plan, { id })
  const owner = await runtime.createOwnerEntry(workflow.state, planTask(plan, 'stage-1'), 'owner-a')
  const reviewedSha = await commitFile(
    workflow.state.workflowWorktree,
    `owned/${id}.txt`,
    '经过审查的交付内容\n',
    `完成 ${id} 实现审查`,
  )
  const preflightBranch = `dsh/preflight/${id}/finalize-safety`
  const preflightWorktree = join(
    root,
    '.dsh-workflow',
    'worktrees',
    id,
    'preflight-finalize-safety',
  )
  await addWorktree(root, preflightBranch, preflightWorktree, workflow.state.workflowBranch)
  const state = await readState(root, id)
  state.status = 'completed'
  for (const task of state.tasks) setTaskStatus(state, task.taskId, 'completed')
  state.implementationReview = {
    contract: IMPLEMENTATION_REVIEW_CONTRACT,
    status: 'passed',
    summary: 'finalize 身份安全审查通过',
    issues: [],
  }
  state.implementationReviewHead = reviewedSha
  state.workflowHead = reviewedSha
  state.ownerRuns['stage-1:owner-a'] = {
    status: 'completed',
    taskId: 'stage-1',
    ownerId: 'owner-a',
    branch: owner.branch,
    worktree: owner.worktree,
    baseCommit: owner.baseCommit,
    result: {
      ownerId: 'owner-a',
      branch: owner.branch,
      worktree: owner.worktree,
      baseCommit: owner.baseCommit,
      commitSha: owner.baseCommit,
      report: { summary: 'finalize 安全夹具', changes: [], tests: [], handoffs: [] },
    },
  }
  await writeState(root, state)
  return {
    root,
    runtime,
    workflow,
    owner,
    state,
    preflightBranch,
    preflightWorktree,
    extraOwners: [],
    extraRoots: [],
  }
}

async function addFinalizeWorktree(fixture, branch, worktree) {
  await mkdir(dirname(worktree), { recursive: true })
  await addWorktree(fixture.root, branch, worktree, 'main')
  const resource = { branch, worktree }
  fixture.extraOwners.push(resource)
  return resource
}

async function addExternalFinalizeWorktree(fixture, suffix) {
  const parent = await mkdtemp(join(tmpdir(), `dsh-finalize-external-${suffix}-`))
  fixture.extraRoots.push(parent)
  return addFinalizeWorktree(
    fixture,
    `dsh/owner/${fixture.state.id}/external-${suffix}`,
    join(parent, 'worktree'),
  )
}

async function cleanupFinalizeSafetyFixture(fixture) {
  if (fixture === undefined) return
  await disposeRuntime(fixture.runtime)
  await cleanupWorkflow(fixture.root, fixture.workflow, [fixture.owner, ...fixture.extraOwners])
  await Promise.all(fixture.extraRoots.map(path => rm(path, { recursive: true, force: true })))
}

function ownerResult({ files = ['owned/result.txt'], summary = '完成区域修改', handoffs = [] } = {}) {
  return JSON.stringify({
    contract: 'DSH_OWNER_RESULT_V1',
    status: 'completed',
    summary,
    changes: [{ summary, files, tests: ['未运行自动化测试：故障恢复夹具'] }],
    tests: ['未运行自动化测试：故障恢复夹具'],
    handoffs,
  })
}

async function cleanupWorkflow(root, workflow, owners = []) {
  if (workflow === undefined) {
    await rm(root, { recursive: true, force: true })
    return
  }
  for (const owner of owners) {
    await removeWorktree(root, owner.worktree, undefined, { missingOk: true }).catch(() => undefined)
    await deleteBranch(root, owner.branch, undefined, { force: true, missingOk: true }).catch(() => undefined)
  }
  await removeWorktree(root, workflow.state.workflowWorktree, undefined, { missingOk: true }).catch(() => undefined)
  await deleteBranch(root, workflow.state.workflowBranch, undefined, { force: true, missingOk: true }).catch(() => undefined)
  await rm(root, { recursive: true, force: true })
}

async function disposeRuntime(runtime) {
  await runtime.dispose().catch(() => undefined)
}

test('Owner 主动报告 blocked 时优先结算阻塞，不会被缺失验证误报为 planDigest 错误', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  let workflow
  let ownerEntry
  try {
    workflow = await createWorkflow(root, runtime, createPlan(), {
      id: 'wf-owner-reported-blocked',
    })
    workflow.state.registryDigest = workflow.state.plan.registryDigest
    await writeState(root, workflow.state)
    runtime.runChild = async () => ({
      sessionId: 'owner-reported-blocked-session',
      report: {
        contract: 'DSH_OWNER_RESULT_V1',
        status: 'blocked',
        summary: 'Owner 必需工具没有注入，无法执行任务',
        changes: [],
        tests: ['未运行：缺少 Owner 工具'],
        handoffs: [],
        memory_updates: [],
      },
    })

    await assert.rejects(
      runtime.runExternalOwner(workflow.agent, workflow.state.id, 'stage-1', 'owner-a'),
      error => error?.code === 'OWNER_REPORTED_BLOCKED'
        && !String(error?.message).includes('planDigest'),
    )

    const saved = await readState(root, workflow.state.id)
    const task = saved.tasks.find(item => item.taskId === 'stage-1')
    const ownerRun = saved.ownerRuns['stage-1:owner-a']
    assert.equal(saved.status, 'blocked')
    assert.equal(task.status, 'stopped')
    assert.equal(task.reason, 'decision_required')
    assert.equal(task.action, 'await_user')
    assert.equal(ownerRun.status, 'blocked')
    assert.match(ownerRun.error, /Owner 必需工具没有注入/u)
    assert.doesNotMatch(ownerRun.error, /planDigest/u)
    ownerEntry = { branch: ownerRun.branch, worktree: ownerRun.worktree }
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow, ownerEntry === undefined ? [] : [ownerEntry])
  }
})

test('同一 Owner 在不同 workflow 间使用磁盘 lease 互斥，并能在过期后恢复', async () => {
  const { root } = await createRepository()
  const firstRuntime = createOwnerWorkflowRuntime({}, { ownerLeaseMs: 10_000 })
  const secondRuntime = createOwnerWorkflowRuntime({}, { ownerLeaseMs: 10_000 })
  try {
    await firstRuntime.prepareRoot(root)
    await secondRuntime.prepareRoot(root)
    const first = await firstRuntime.acquireOwnerLease(root, 'shared-owner', 'workflow-a', 'stage-1')

    await assert.rejects(
      secondRuntime.acquireOwnerLease(root, 'shared-owner', 'workflow-b', 'stage-1'),
      /Owner shared-owner 已被存活的 Harness 进程占用/u,
    )

    clearInterval(first.lease.timer)
    firstRuntime.ownerLeases.delete(`${root}:shared-owner`)
    await writeFile(first.lease.path, `${JSON.stringify({
      ...first.lease,
      pid: 2_147_483_647,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    })}\n`, 'utf8')

    const recovered = await secondRuntime.acquireOwnerLease(root, 'shared-owner', 'workflow-b', 'stage-1')
    assert.equal(recovered.lease.ownerId, 'shared-owner')
    assert.equal(recovered.lease.workflowId, 'workflow-b')
    assert.equal(recovered.lease.stageId, 'stage-1')
    await secondRuntime.releaseOwnerLease(recovered.lease)
  } finally {
    await disposeRuntime(firstRuntime)
    await disposeRuntime(secondRuntime)
    await rm(root, { recursive: true, force: true })
  }
})

test('Lease 的 fencing token 被接管后旧临界区不能继续成功结算', async () => {
  const { root } = await createRepository()
  const firstRuntime = createOwnerWorkflowRuntime({}, { ownerLeaseMs: 10_000 })
  const secondRuntime = createOwnerWorkflowRuntime({}, { ownerLeaseMs: 10_000 })
  const firstEntered = Promise.withResolvers()
  const releaseFirst = Promise.withResolvers()
  const secondEntered = Promise.withResolvers()
  const releaseSecond = Promise.withResolvers()
  let displacedDirectory
  try {
    await firstRuntime.prepareRoot(root)
    await secondRuntime.prepareRoot(root)
    const firstRun = firstRuntime.withOwnerLease(
      root,
      'workflow-lock-fencing',
      'wf-fencing',
      'stage-1',
      undefined,
      async () => {
        firstEntered.resolve()
        await releaseFirst.promise
        return '旧临界区结果'
      },
    )
    await firstEntered.promise
    const firstLease = firstRuntime.ownerLeases.get(`${root}:workflow-lock-fencing`)
    displacedDirectory = `${firstLease.directory}.displaced`
    await rename(firstLease.directory, displacedDirectory)

    const secondRun = secondRuntime.withOwnerLease(
      root,
      'workflow-lock-fencing',
      'wf-fencing',
      'stage-1',
      undefined,
      async () => {
        secondEntered.resolve()
        await releaseSecond.promise
        return '新临界区结果'
      },
    )
    await secondEntered.promise
    releaseFirst.resolve()
    await assert.rejects(firstRun, /fencing token 已变化|Lease 已失效/u)
    releaseSecond.resolve()
    assert.equal(await secondRun, '新临界区结果')
  } finally {
    releaseFirst.resolve()
    releaseSecond.resolve()
    await disposeRuntime(firstRuntime)
    await disposeRuntime(secondRuntime)
    if (displacedDirectory !== undefined) await rm(displacedDirectory, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test('handoff 必须先修复越界文件，再把请求写入 handoff 队列', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, { maxOwnerRepairTurns: 2 })
  const plan = createPlan()
  let workflow
  let owner
  try {
    workflow = await createWorkflow(root, runtime, plan, { id: 'wf-handoff-repair' })
    owner = await createOwner(root, workflow)
    const outsidePath = join(owner.worktree, 'handoff', 'request.txt')
    const ownedPath = join(owner.worktree, 'owned', 'result.txt')
    const handoff = {
      targetType: 'owner',
      targetOwnerId: 'owner-b',
      summary: '需要区域乙 Owner 接管文件',
      reason: '文件属于区域乙 Owner 的责任范围',
      files: ['handoff/request.txt'],
    }
    let turns = 0
    runtime.runChild = async (_agent, _cwd, _prompt, _signal, options) => {
      turns += 1
      await mkdir(dirname(outsidePath), { recursive: true })
      await mkdir(dirname(ownedPath), { recursive: true })
      await writeFile(outsidePath, '越界内容\n', 'utf8')
      await writeFile(ownedPath, '有效内容\n', 'utf8')
      const firstReport = JSON.parse(ownerResult({
        files: ['owned/result.txt', 'handoff/request.txt'],
        summary: '第一次尝试同时修改了两个区域',
        handoffs: [handoff],
      }))
      const firstInspection = await runtime.inspectOwnerAttempt(options.activeOwner.state, options.activeOwner.entry, firstReport)
      assert.ok(firstInspection.violations.length > 0)
      turns += 1
      await rm(outsidePath, { force: true })
      const report = JSON.parse(ownerResult({ handoffs: [handoff] }))
      const inspection = await runtime.inspectOwnerAttempt(options.activeOwner.state, options.activeOwner.entry, report)
      const committed = await runtime.commitOwnerAttempt(options.activeOwner.state, options.activeOwner.stage, options.activeOwner.entry, inspection)
      return { sessionId: 'handoff-owner-session', report, committed }
    }

    const entry = { ...owner, tasks: [planTask(workflow.state.plan, 'stage-1')] }
    runtime.assertRequiredTaskVerifications = async () => ({
      contentDigest: 'a'.repeat(64),
      verificationIds: ['unit'],
    })
    const runningState = await readState(root, workflow.state.id)
    runningState.tasks.find(task => task.taskId === 'stage-1').status = 'running'
    workflow.state.tasks = runningState.tasks
    await writeState(root, runningState)
    await assert.rejects(
      runtime.runOwnerEntry(workflow.agent, workflow.state, planTask(workflow.state.plan, 'stage-1'), entry),
      error => error?.code === 'OWNER_HANDOFF',
    )

    const saved = await readState(root, workflow.state.id)
    assert.equal(turns, 2)
    assert.equal(existsSync(outsidePath), false)
    assert.equal(await readFile(ownedPath, 'utf8'), '有效内容\n')
    assert.equal(saved.handoffQueue.length, 1)
    assert.equal(saved.handoffQueue[0].status, 'pending')
    assert.equal(saved.handoffQueue[0].targetOwnerId, 'owner-b')
    assert.deepEqual(saved.handoffQueue[0].files, ['handoff/request.txt'])
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow, owner === undefined ? [] : [owner])
  }
})

test('handoff_replan 在 live Registry 缺失时拒绝重规划', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  const oldPlan = createPlan({ secondStageOwner: 'owner-a', secondStageFile: 'owned/next.txt' })
  const newPlan = createPlan({ secondStageOwner: 'owner-b', secondStageFile: 'handoff/request.txt' })
  let workflow
  try {
    workflow = await createWorkflow(root, runtime, oldPlan, {
      id: 'wf-handoff-replan-missing-registry',
      status: 'blocked',
    })
    const state = workflow.state
    setTaskStatus(state, 'stage-1', 'completed')
    state.handoffQueue = [{
      id: 'handoff-missing-registry',
      status: 'pending',
      sourceOwnerId: 'owner-a',
      sourceStageId: 'stage-2',
      targetType: 'owner',
      targetOwnerId: 'owner-b',
      summary: '转交后续文件',
      reason: '跨越 Owner 文件边界',
      files: ['handoff/request.txt'],
    }]
    await writeState(root, state)
    await rm(join(workflow.state.workflowWorktree, '.owner-workflow'), { recursive: true, force: true })
    runtime.runChild = async () => JSON.stringify(newPlan)

    await assert.rejects(
      runtime.replanHandoffs(workflow.agent, state.id),
      /Owner Registry|Registry|ENOENT|无法读取/u,
    )
    const saved = await readState(root, state.id)
    assert.equal(saved.status, 'blocked')
    assert.equal(saved.planApproved, true)
    assert.equal(saved.handoffQueue[0].status, 'pending')
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow)
  }
})

test('handoff_replan 拒绝把任务分配给 live Registry 未登记 Owner', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  const oldPlan = createPlan({ secondStageOwner: 'owner-a', secondStageFile: 'owned/next.txt' })
  const newPlan = createPlan({ secondStageOwner: 'owner-b', secondStageFile: 'handoff/request.txt' })
  let workflow
  try {
    workflow = await createWorkflow(root, runtime, oldPlan, {
      id: 'wf-handoff-replan-unregistered-owner',
      status: 'blocked',
    })
    let registry = await loadRegistry(workflow.state.workflowWorktree)
    const removal = proposeRegistryChange(registry, {
      type: 'remove',
      ownerId: 'owner-b',
      reason: '模拟目标 Owner 未登记',
    })
    registry = await applyApprovedRegistryChange(workflow.state.workflowWorktree, {
      ...removal,
      approvedDigest: removal.digest,
    })
    const state = workflow.state
    setTaskStatus(state, 'stage-1', 'completed')
    state.registryDigest = registryContentDigest(registry)
    state.handoffQueue = [{
      id: 'handoff-unregistered-owner',
      status: 'pending',
      sourceOwnerId: 'owner-a',
      sourceStageId: 'stage-2',
      targetType: 'owner',
      targetOwnerId: 'owner-b',
      summary: '转交后续文件',
      reason: '跨越 Owner 文件边界',
      files: ['handoff/request.txt'],
    }]
    await writeState(root, state)
    runtime.runChild = async () => JSON.stringify(newPlan)

    await assert.rejects(
      runtime.replanHandoffs(workflow.agent, state.id),
      /Owner owner-b 未登记到当前正式 Owner Registry/u,
    )
    const saved = await readState(root, state.id)
    assert.equal(saved.status, 'blocked')
    assert.equal(saved.handoffQueue[0].status, 'pending')
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow)
  }
})

test('handoff_replan 会清除旧批准，并要求新的计划审查后才能批准', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  const oldPlan = createPlan({ secondStageOwner: 'owner-a', secondStageFile: 'owned/next.txt' })
  const newPlan = createPlan({ secondStageOwner: 'owner-b', secondStageFile: 'handoff/request.txt' })
  let workflow
  try {
    workflow = await createWorkflow(root, runtime, oldPlan, {
      id: 'wf-handoff-replan',
      status: 'blocked',
    })
    const registry = await registerPlanOwners(workflow.state.workflowWorktree, oldPlan)
    const state = workflow.state
    setTaskStatus(state, 'stage-1', 'completed')
    state.registryDigest = registryContentDigest(registry)
    state.handoffQueue = [{
      id: 'handoff-1',
      status: 'pending',
      sourceOwnerId: 'owner-a',
      sourceStageId: 'stage-2',
      targetType: 'owner',
      targetOwnerId: 'owner-b',
      summary: '转交后续文件',
      reason: '跨越 Owner 文件边界',
      files: ['handoff/request.txt'],
    }]
    await writeState(root, state)
    runtime.runChild = async () => JSON.stringify(newPlan)

    const result = await runtime.replanHandoffs(workflow.agent, state.id)
    const saved = await readState(root, state.id)
    assert.equal(result.workflow.status, 'planned')
    assert.equal(saved.status, 'planned')
    assert.equal(saved.planApproved, false)
    assert.equal(saved.planReview, undefined)
    assert.equal(saved.planReviewDigest, undefined)
    assert.equal(saved.planDigest, digest(saved.plan))
    assert.equal(saved.plan.registryDigest, state.registryDigest)
    assert.equal(saved.handoffQueue[0].status, 'planned')
    assert.equal(saved.handoffQueue[0].plannedAt !== undefined, true)

    await assert.rejects(
      runtime.approvePlan(workflow.agent, state.id, saved.planDigest),
      /当前 planDigest 的独立 Planner Reviewer 审查/u,
    )
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow)
  }
})

test('V2 task finish 使用 Owner 结算时登记的固定 commit SHA', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  mockRequiredTaskVerifications(runtime)
  const plan = createPlan()
  let workflow
  let owner
  try {
    workflow = await createWorkflow(root, runtime, plan, { id: 'wf-v2-fixed-task-sha' })
    owner = await createOwner(root, workflow)
    const fixedSha = await commitFile(owner.worktree, 'owned/fixed.txt', '固定提交\n', 'Owner 固定提交')
    const state = await readState(root, workflow.state.id)
    markAwaitingFinish(state, 'stage-1', owner, fixedSha)
    await writeState(root, state)

    const result = await runtime.finishOwner(workflow.agent, state.id, 'stage-1', 'owner-a')
    const saved = await readState(root, state.id)
    const task = saved.tasks.find(item => item.taskId === 'stage-1')
    const ownerRun = saved.ownerRuns['stage-1:owner-a']
    assert.equal(result.taskId, 'stage-1')
    assert.equal(result.commitSha, fixedSha)
    assert.equal(task.status, 'completed')
    assert.equal(task.fixedCommitSha, fixedSha)
    assert.equal(task.cursor, fixedSha)
    assert.equal(ownerRun.status, 'completed')
    assert.equal(ownerRun.result.commitSha, fixedSha)
    assert.equal(ownerRun.result.workflowHead, saved.workflowHead)
    assert.equal(await head(saved.workflowWorktree), saved.workflowHead)
    assert.equal(await isCommitAncestor(root, fixedSha, saved.workflowHead), true)
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow, owner === undefined ? [] : [owner])
  }
})

test('active Owner 只能追加简短的当前任务临时记忆，并持久化供恢复注入', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  const plan = createPlan()
  let workflow
  let owner
  try {
    workflow = await createWorkflow(root, runtime, plan, { id: 'wf-owner-worklog' })
    owner = await createOwner(root, workflow)
    const state = await readState(root, workflow.state.id)
    setTaskStatus(state, 'stage-1', 'running')
    state.tasks.find(task => task.taskId === 'stage-1').executorId = 'owner-worklog-session'
    state.ownerRuns['stage-1:owner-a'] = {
      status: 'running',
      taskId: 'stage-1',
      stageId: 'stage-1',
      ownerId: 'owner-a',
      branch: owner.branch,
      worktree: owner.worktree,
      sessionId: 'owner-worklog-session',
    }
    await writeState(root, state)
    runtime.activeOwners.set('owner-worklog-session', {
      owner: owner.owner,
      worktree: owner.worktree,
      workflowRoot: root,
      workflowId: state.id,
      stageId: 'stage-1',
    })

    const snapshot = await runtime.recordOwnerMemoryNote(
      { type: '结论', text: '设置页统一展示网络错误提示。' },
      { agent: { id: 'owner-worklog-session' } },
    )
    assert.deepEqual(snapshot.notes, [{ type: '结论', text: '设置页统一展示网络错误提示。' }])
    const saved = await readState(root, state.id)
    assert.deepEqual(saved.ownerMemoryWorklogs['stage-1:owner-a'].notes, snapshot.notes)
    await assert.rejects(
      runtime.recordOwnerMemoryNote(
        { type: '结论', text: '不允许伪造其他 Owner 的临时记忆。' },
        { agent: { id: 'other-session' } },
      ),
      /只能由正在运行的 Owner/u,
    )
  } finally {
    runtime.activeOwners.clear()
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow, owner === undefined ? [] : [owner])
  }
})

test('V2 task finish 在固定提交后拒绝跟随 Owner 分支移动', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  mockRequiredTaskVerifications(runtime)
  const plan = createPlan()
  let workflow
  let owner
  try {
    workflow = await createWorkflow(root, runtime, plan, { id: 'wf-v2-task-branch-move' })
    owner = await createOwner(root, workflow)
    const fixedSha = await commitFile(owner.worktree, 'owned/fixed.txt', '固定提交\n', 'Owner 固定提交')
    const movedSha = await commitFile(owner.worktree, 'owned/moved.txt', '后续移动提交\n', 'Owner 后续提交')
    const state = await readState(root, workflow.state.id)
    markAwaitingFinish(state, 'stage-1', owner, fixedSha)
    await writeState(root, state)

    await assert.rejects(
      runtime.finishOwner(workflow.agent, state.id, 'stage-1', 'owner-a'),
      /owner-sync 后发生变化/u,
    )
    const saved = await readState(root, state.id)
    const task = saved.tasks.find(item => item.taskId === 'stage-1')
    const workflowHead = await head(workflow.state.workflowWorktree)
    assert.equal(task.status, 'running')
    assert.equal(saved.ownerRuns['stage-1:owner-a'].status, 'awaiting_finish')
    assert.equal(await isCommitAncestor(root, fixedSha, workflowHead), false)
    assert.equal(await isCommitAncestor(root, movedSha, workflowHead), false)
    assert.deepEqual(await statusRecords(workflow.state.workflowWorktree), [])
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow, owner === undefined ? [] : [owner])
  }
})

test('V2 task finish 在 workflow 已合入但状态未记账时恢复并幂等完成', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  mockRequiredTaskVerifications(runtime)
  const plan = createPlan()
  let workflow
  let owner
  try {
    workflow = await createWorkflow(root, runtime, plan, { id: 'wf-v2-task-finish-recover' })
    owner = await createOwner(root, workflow)
    const fixedSha = await commitFile(owner.worktree, 'owned/already-merged.txt', '已合并内容\n', '预先合并 Owner 提交')
    await mergeCommit(workflow.state.workflowWorktree, fixedSha, '模拟阶段合并完成')
    const state = await readState(root, workflow.state.id)
    markAwaitingFinish(state, 'stage-1', owner, fixedSha)
    state.workflowHead = undefined
    await writeState(root, state)

    const first = await runtime.finishOwner(workflow.agent, state.id, 'stage-1', 'owner-a')
    const firstHead = await head(workflow.state.workflowWorktree)
    const second = await runtime.finishOwner(workflow.agent, state.id, 'stage-1', 'owner-a')
    const saved = await readState(root, state.id)
    const task = saved.tasks.find(item => item.taskId === 'stage-1')
    const ownerRun = saved.ownerRuns['stage-1:owner-a']
    assert.equal(first.taskId, 'stage-1')
    assert.equal(first.commitSha, fixedSha)
    assert.equal(second.taskId, 'stage-1')
    assert.equal(second.commitSha, fixedSha)
    assert.equal(task.status, 'completed')
    assert.equal(task.fixedCommitSha, fixedSha)
    assert.equal(ownerRun.status, 'completed')
    assert.equal(ownerRun.result.commitSha, fixedSha)
    assert.equal(saved.workflowHead, firstHead)
    assert.equal(ownerRun.workflowHead, firstHead)
    assert.equal(saved.pendingTaskMerge, undefined)
    assert.equal(await head(workflow.state.workflowWorktree), firstHead)
    assert.equal(await isCommitAncestor(root, fixedSha, firstHead), true)
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow, owner === undefined ? [] : [owner])
  }
})

test('V2 task finish 恢复 pendingTaskMerge，只清理 task preflight 并保留 Owner worktree', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  mockRequiredTaskVerifications(runtime)
  const plan = createPlan()
  let workflow
  let owner
  let preflight
  try {
    workflow = await createWorkflow(root, runtime, plan, { id: 'wf-v2-task-cleanup-reentry' })
    owner = await createOwner(root, workflow)
    const fixedSha = await commitFile(owner.worktree, 'owned/cleanup.txt', '待清理的 Owner 提交\n', '准备阶段清理')
    const state = await readState(root, workflow.state.id)
    markAwaitingFinish(state, 'stage-1', owner, fixedSha)
    const workflowHeadBefore = await head(workflow.state.workflowWorktree)
    preflight = await runtime.preflightTaskMerge(
      state,
      planTask(plan, 'stage-1'),
      { owner: owner.owner, commitSha: fixedSha },
      workflowHeadBefore,
    )
    state.pendingTaskMerge = {
      taskId: 'stage-1',
      ownerId: 'owner-a',
      preflight,
      ownerCommitSha: fixedSha,
      createdAt: new Date().toISOString(),
    }
    await writeState(root, state)

    const recovered = await runtime.createOwnerEntry(state, planTask(plan, 'stage-1'), 'owner-a')
    assert.equal(recovered.branch, owner.branch)
    assert.equal(recovered.worktree, owner.worktree)

    const result = await runtime.recoverWorkflow(workflow.agent, state.id)
    const saved = await readState(root, state.id)
    const task = saved.tasks.find(item => item.taskId === 'stage-1')
    const ownerRun = saved.ownerRuns['stage-1:owner-a']
    assert.equal(result.taskId, 'stage-1')
    assert.equal(result.commitSha, fixedSha)
    assert.equal(task.status, 'completed')
    assert.equal(ownerRun.status, 'completed')
    assert.equal(ownerRun.result.commitSha, fixedSha)
    assert.equal(saved.workflowHead, result.workflowHead)
    assert.equal(saved.pendingTaskMerge, undefined)
    assert.equal(existsSync(owner.worktree), true)
    assert.deepEqual(await listBranches(root, owner.branch), [owner.branch])
    assert.equal(existsSync(preflight.worktree), false)
    assert.deepEqual(await listBranches(root, preflight.branch), [])
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow, owner === undefined ? [] : [owner])
  }
})

test('V2 task finish 按 task.write 覆盖把 handoff queue 标记为 completed', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  mockRequiredTaskVerifications(runtime)
  const plan = createPlan({ secondStageOwner: 'owner-b', secondStageFile: 'handoff/request.txt' })
  let workflow
  let owner
  try {
    workflow = await createWorkflow(root, runtime, plan, { id: 'wf-v2-handoff-completed' })
    owner = await createOwner(root, workflow, 'stage-2', 'owner-b')
    const fixedSha = await commitFile(owner.worktree, 'handoff/request.txt', '目标 Owner 已完成\n', '完成 handoff 文件')
    const state = await readState(root, workflow.state.id)
    state.status = 'running'
    setTaskStatus(state, 'stage-1', 'completed')
    state.handoffQueue = [{
      id: 'handoff-v2-task-write',
      status: 'planned',
      sourceTaskId: 'stage-1',
      sourceOwnerId: 'owner-a',
      targetType: 'owner',
      targetOwnerId: 'owner-b',
      summary: '目标 Owner 接管文件',
      reason: '文件属于目标 Owner 的 scope',
      files: ['handoff/request.txt'],
    }]
    markAwaitingFinish(state, 'stage-2', owner, fixedSha)
    await writeState(root, state)

    const result = await runtime.finishOwner(workflow.agent, state.id, 'stage-2', 'owner-b')
    const saved = await readState(root, state.id)
    const task = saved.tasks.find(item => item.taskId === 'stage-2')
    const ownerRun = saved.ownerRuns['stage-2:owner-b']
    const handoff = saved.handoffQueue.find(item => item.id === 'handoff-v2-task-write')
    assert.equal(result.taskId, 'stage-2')
    assert.equal(result.commitSha, fixedSha)
    assert.equal(task.status, 'completed')
    assert.equal(ownerRun.status, 'completed')
    assert.equal(ownerRun.result.commitSha, fixedSha)
    assert.equal(saved.workflowHead, result.workflowHead)
    assert.equal(handoff.status, 'completed')
    assert.equal(handoff.completedTaskId, 'stage-2')
    assert.equal(typeof handoff.completedAt, 'string')
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow, owner === undefined ? [] : [owner])
  }
})

test('finalize 只合并固定的 review SHA，review 后分支移动时拒绝未审查提交', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  const plan = createPlan()
  let workflow
  try {
    workflow = await createWorkflow(root, runtime, plan, { id: 'wf-finalize-review-sha' })
    const reviewedSha = await commitFile(
      workflow.state.workflowWorktree,
      'owned/reviewed.txt',
      '已审查内容\n',
      '实现审查固定提交',
    )
    const unreviewedSha = await commitFile(
      workflow.state.workflowWorktree,
      'owned/unreviewed.txt',
      '未审查内容\n',
      '审查后追加提交',
    )
    const state = await readState(root, workflow.state.id)
    state.status = 'completed'
    for (const task of state.tasks) setTaskStatus(state, task.taskId, 'completed')
    state.implementationReview = {
      contract: IMPLEMENTATION_REVIEW_CONTRACT,
      status: 'passed',
      summary: '固定提交审查通过',
      issues: [],
    }
    state.implementationReviewHead = reviewedSha
    state.workflowHead = unreviewedSha
    await writeState(root, state)

    await assert.rejects(
      runtime.finalizeWorkflow(workflow.agent, state.id),
      /Implementation Review 之后 workflow 分支又发生变化/u,
    )
    assert.equal(await isCommitAncestor(root, reviewedSha, await head(root)), false)
    assert.equal(await isCommitAncestor(root, unreviewedSha, await head(root)), false)
    assert.equal(existsSync(workflow.state.workflowWorktree), true)
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow)
  }
})

test('finalize 遇到 tracked、untracked 或 ignored Owner dirty 时保存 cleanupPending 并保留现场', async t => {
  const cases = [
    {
      name: 'tracked',
      expectedCode: ' M',
      prepare: async ({ owner }) => {
        const path = join(owner.worktree, 'README.md')
        await writeFile(path, 'Owner tracked 现场\n', 'utf8')
        return {
          path,
          content: 'Owner tracked 现场\n',
          clean: () => writeFile(path, '初始内容\n', 'utf8'),
        }
      },
    },
    {
      name: 'untracked',
      expectedCode: '??',
      prepare: async ({ owner }) => {
        const path = join(owner.worktree, 'owner-untracked.txt')
        await writeFile(path, 'Owner untracked 现场\n', 'utf8')
        return {
          path,
          content: 'Owner untracked 现场\n',
          clean: () => rm(path),
        }
      },
    },
    {
      name: 'ignored',
      expectedCode: '!!',
      prepare: async ({ root, owner }) => {
        await writeFile(join(root, '.git', 'info', 'exclude'), 'owner-ignored.txt\n', 'utf8')
        const path = join(owner.worktree, 'owner-ignored.txt')
        await writeFile(path, 'Owner ignored 现场\n', 'utf8')
        return {
          path,
          content: 'Owner ignored 现场\n',
          clean: () => rm(path),
        }
      },
    },
  ]

  for (const dirtyCase of cases) {
    await t.test(dirtyCase.name, async () => {
      const { root } = await createRepository()
      const runtime = createOwnerWorkflowRuntime({}, {})
      const plan = createPlan()
      let workflow
      let owner
      let preflightWorktree
      let preflightBranch
      try {
        workflow = await createWorkflow(root, runtime, plan, { id: `wf-finalize-dirty-${dirtyCase.name}` })
        owner = await runtime.createOwnerEntry(workflow.state, planTask(plan, 'stage-1'), 'owner-a')
        preflightBranch = `dsh/preflight/${workflow.state.id}/orphan-${dirtyCase.name}`
        preflightWorktree = join(
          root,
          '.dsh-workflow',
          'worktrees',
          workflow.state.id,
          `preflight-orphan-${dirtyCase.name}`,
        )
        await addWorktree(root, preflightBranch, preflightWorktree, workflow.state.workflowBranch)
        const reviewedSha = await commitFile(
          workflow.state.workflowWorktree,
          'owned/delivered.txt',
          '经过审查的交付内容\n',
          '完成 dirty finalize 审查',
        )
        const state = await readState(root, workflow.state.id)
        state.status = 'completed'
        for (const task of state.tasks) setTaskStatus(state, task.taskId, 'completed')
        state.implementationReview = {
          contract: IMPLEMENTATION_REVIEW_CONTRACT,
          status: 'passed',
          summary: '实现审查通过',
          issues: [],
        }
        state.implementationReviewHead = reviewedSha
        state.workflowHead = reviewedSha
        state.ownerRuns['stage-1:owner-a'] = {
          status: 'completed',
          ownerId: 'owner-a',
          stageId: 'stage-1',
          branch: owner.branch,
          worktree: owner.worktree,
          baseCommit: owner.baseCommit,
        }
        await writeState(root, state)
        const preserved = await dirtyCase.prepare({ root, owner })
        const dirty = await statusRecords(owner.worktree, undefined, { includeIgnored: true })
        assert.equal(dirty.some(record => record.code === dirtyCase.expectedCode), true)

        await assert.rejects(
          runtime.finalizeWorkflow(workflow.agent, state.id),
          /Owner worktree 不干净，拒绝 finalize 清理/u,
        )

        const saved = await readState(root, state.id)
        assert.equal(saved.cleanupPending, true)
        assert.equal(saved.cleanupKind, 'workflow')
        assert.match(saved.cleanupError, /Owner worktree 不干净/u)
        assert.equal(typeof saved.finalMergeHead, 'string')
        assert.equal(await isCommitAncestor(root, reviewedSha, await head(root)), true)
        assert.equal(existsSync(owner.worktree), true)
        assert.equal(existsSync(workflow.state.workflowWorktree), true)
        assert.equal(existsSync(preflightWorktree), true)
        assert.equal(await readFile(preserved.path, 'utf8'), preserved.content)
        assert.deepEqual(await listBranches(root, owner.branch), [owner.branch])
        assert.deepEqual(await listBranches(root, preflightBranch), [preflightBranch])

        await preserved.clean()
        assert.deepEqual(await statusRecords(owner.worktree, undefined, { includeIgnored: true }), [])

        const retried = await runtime.finalizeWorkflow(workflow.agent, state.id)
        const savedAfterRetry = await readState(root, state.id)
        assert.equal(retried.finalized, true)
        assert.equal(savedAfterRetry.finalized, true)
        assert.equal(savedAfterRetry.cleanupPending, false)
        assert.equal(savedAfterRetry.cleanupError, undefined)
        assert.equal(existsSync(owner.worktree), false)
        assert.equal(existsSync(workflow.state.workflowWorktree), false)
        assert.equal(existsSync(preflightWorktree), false)
        assert.deepEqual(await listBranches(root, owner.branch), [])
        assert.deepEqual(await listBranches(root, preflightBranch), [])
      } finally {
        await disposeRuntime(runtime)
        await cleanupWorkflow(root, workflow, owner === undefined ? [] : [owner])
      }
    })
  }
})

test('finalize 对 legacy ownerRuns 的越界、链接、分支错配和字段冲突一律 fail-closed', async t => {
  const cases = [
    {
      name: 'top worktree 越出当前 workflow 受控目录',
      prepare: async fixture => {
        const external = await addExternalFinalizeWorktree(fixture, 'top-outside')
        const record = fixture.state.ownerRuns['stage-1:owner-a']
        record.worktree = external.worktree
        record.branch = external.branch
        delete record.result.worktree
        record.result.branch = external.branch
      },
    },
    {
      name: 'result worktree 越出当前 workflow 受控目录',
      prepare: async fixture => {
        const external = await addExternalFinalizeWorktree(fixture, 'result-outside')
        const record = fixture.state.ownerRuns['stage-1:owner-a']
        delete record.worktree
        record.branch = external.branch
        record.result.worktree = external.worktree
        record.result.branch = external.branch
      },
    },
    {
      name: 'worktree 路径经过符号链接',
      prepare: async fixture => {
        const external = await addExternalFinalizeWorktree(fixture, 'linked')
        const linkedWorktree = join(
          fixture.root,
          '.dsh-workflow',
          'worktrees',
          fixture.state.id,
          'owners',
          'linked-owner',
        )
        await mkdir(dirname(linkedWorktree), { recursive: true })
        await symlink(external.worktree, linkedWorktree, 'dir')
        const record = fixture.state.ownerRuns['stage-1:owner-a']
        record.worktree = linkedWorktree
        record.branch = external.branch
        record.result.worktree = linkedWorktree
        record.result.branch = external.branch
      },
    },
    {
      name: '记录 branch 与 worktree attached branch 不一致',
      prepare: async fixture => {
        const recordedBranch = `dsh/owner/${fixture.state.id}/recorded-mismatch`
        await runGit(fixture.root, ['branch', recordedBranch, 'main'])
        fixture.extraOwners.push({
          branch: recordedBranch,
          worktree: join(fixture.root, '.missing-recorded-branch-worktree'),
        })
        const record = fixture.state.ownerRuns['stage-1:owner-a']
        record.branch = recordedBranch
        record.result.branch = recordedBranch
      },
    },
    {
      name: 'top 与 result worktree 字段冲突',
      prepare: async fixture => {
        const conflicting = await addFinalizeWorktree(
          fixture,
          `dsh/owner/${fixture.state.id}/stage-conflict/a1/owner-b`,
          join(
            fixture.root,
            '.dsh-workflow',
            'worktrees',
            fixture.state.id,
            'stage-conflicting-owner',
          ),
        )
        const record = fixture.state.ownerRuns['stage-1:owner-a']
        record.result.worktree = conflicting.worktree
        record.result.branch = conflicting.branch
      },
    },
    {
      name: 'top 与 result branch 字段冲突',
      prepare: async fixture => {
        const conflictingBranch = `dsh/owner/${fixture.state.id}/branch-conflict`
        await runGit(fixture.root, ['branch', conflictingBranch, 'main'])
        fixture.extraOwners.push({
          branch: conflictingBranch,
          worktree: join(fixture.root, '.missing-conflicting-branch-worktree'),
        })
        fixture.state.ownerRuns['stage-1:owner-a'].result.branch = conflictingBranch
      },
    },
  ]

  for (const [caseIndex, invalidCase] of cases.entries()) {
    await t.test(invalidCase.name, async () => {
      let fixture
      try {
        fixture = await createFinalizeSafetyFixture(`wf-finalize-identity-${caseIndex + 1}`)
        await invalidCase.prepare(fixture)
        await writeState(fixture.root, fixture.state)
        const protectedWorktrees = [
          fixture.workflow.state.workflowWorktree,
          fixture.owner.worktree,
          fixture.preflightWorktree,
          ...fixture.extraOwners.map(item => item.worktree),
        ].filter(path => existsSync(path))
        const protectedBranches = [...new Set([
          fixture.workflow.state.workflowBranch,
          fixture.owner.branch,
          fixture.preflightBranch,
          ...fixture.extraOwners.map(item => item.branch),
        ])]

        await assert.rejects(
          fixture.runtime.finalizeWorkflow(fixture.workflow.agent, fixture.state.id),
          /Owner cleanup 记录|受控目录|符号链接|attached branch|字段冲突/u,
        )

        const saved = await readState(fixture.root, fixture.state.id)
        assert.equal(saved.cleanupPending, true)
        assert.equal(saved.cleanupKind, 'workflow')
        assert.equal(saved.finalized, undefined)
        for (const worktree of protectedWorktrees) assert.equal(existsSync(worktree), true, worktree)
        for (const branch of protectedBranches) assert.deepEqual(await listBranches(fixture.root, branch), [branch])
      } finally {
        await cleanupFinalizeSafetyFixture(fixture)
      }
    })
  }
})

test('finalize 可清理合法固定 V2 Owner 路径', async () => {
      let fixture
      try {
        fixture = await createFinalizeSafetyFixture('wf-finalize-valid-fixed')
        const result = await fixture.runtime.finalizeWorkflow(fixture.workflow.agent, fixture.state.id)
        const saved = await readState(fixture.root, fixture.state.id)
        assert.equal(result.finalized, true)
        assert.equal(saved.finalized, true)
        assert.equal(saved.cleanupPending, false)
        assert.equal(existsSync(fixture.owner.worktree), false)
        assert.equal(existsSync(fixture.preflightWorktree), false)
        assert.equal(existsSync(fixture.workflow.state.workflowWorktree), false)
        assert.deepEqual(await listBranches(fixture.root, fixture.owner.branch), [])
        assert.deepEqual(await listBranches(fixture.root, fixture.preflightBranch), [])
        assert.deepEqual(await listBranches(fixture.root, fixture.workflow.state.workflowBranch), [])
      } finally {
        await cleanupFinalizeSafetyFixture(fixture)
      }
})

test('finalize 成功后重复调用可以幂等完成清理', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  const plan = createPlan()
  let workflow
  let owner
  try {
    workflow = await createWorkflow(root, runtime, plan, { id: 'wf-finalize-idempotent' })
    owner = await runtime.createOwnerEntry(workflow.state, planTask(plan, 'stage-1'), 'owner-a')
    const reviewedSha = await commitFile(
      workflow.state.workflowWorktree,
      'owned/delivered.txt',
      '交付内容\n',
      '完成实现审查',
    )
    const state = await readState(root, workflow.state.id)
    state.status = 'completed'
    for (const task of state.tasks) setTaskStatus(state, task.taskId, 'completed')
    state.implementationReview = {
      contract: IMPLEMENTATION_REVIEW_CONTRACT,
      status: 'passed',
      summary: '实现审查通过',
      issues: [],
    }
    state.implementationReviewHead = reviewedSha
    state.workflowHead = reviewedSha
    state.ownerRuns['stage-1:owner-a'] = {
      status: 'completed',
      ownerId: 'owner-a',
      stageId: 'stage-1',
      branch: owner.branch,
      worktree: owner.worktree,
      baseCommit: owner.baseCommit,
    }
    await writeState(root, state)

    const first = await runtime.finalizeWorkflow(workflow.agent, state.id)
    const savedAfterFirst = await readState(root, state.id)
    const mainHead = await head(root)
    const second = await runtime.finalizeWorkflow(workflow.agent, state.id)
    const savedAfterSecond = await readState(root, state.id)
    assert.equal(first.finalized, true)
    assert.equal(second.finalized, true)
    assert.equal(savedAfterFirst.finalized, true)
    assert.equal(savedAfterSecond.finalized, true)
    assert.equal(savedAfterFirst.finalMergeHead, savedAfterSecond.finalMergeHead)
    assert.equal(await isCommitAncestor(root, reviewedSha, mainHead), true)
    assert.equal(await readFile(join(root, 'owned', 'delivered.txt'), 'utf8'), '交付内容\n')
    assert.equal(existsSync(workflow.state.workflowWorktree), false)
    assert.equal(existsSync(owner.worktree), false)
    assert.deepEqual(await listBranches(root, owner.branch), [])
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow, owner === undefined ? [] : [owner])
  }
})

test('finalize 合并已经完成但状态未记账时，可以在资源缺失后恢复清理', async () => {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  const plan = createPlan()
  let workflow
  try {
    workflow = await createWorkflow(root, runtime, plan, { id: 'wf-finalize-recovery' })
    const reviewedSha = await commitFile(
      workflow.state.workflowWorktree,
      'owned/recovered.txt',
      '恢复交付内容\n',
      '模拟最终合并提交',
    )
    const finalMerge = await mergeCommit(root, reviewedSha, '模拟状态写入前的最终合并')
    await removeWorktree(root, workflow.state.workflowWorktree, undefined, { missingOk: true })
    await deleteBranch(root, workflow.state.workflowBranch, undefined, { force: true, missingOk: true })
    const state = await readState(root, workflow.state.id)
    state.status = 'completed'
    for (const task of state.tasks) setTaskStatus(state, task.taskId, 'completed')
    state.implementationReview = {
      contract: IMPLEMENTATION_REVIEW_CONTRACT,
      status: 'passed',
      summary: '最终合并前审查通过',
      issues: [],
    }
    state.implementationReviewHead = reviewedSha
    state.workflowHead = reviewedSha
    state.finalMergeHead = finalMerge.head
    state.cleanupPending = true
    state.cleanupError = '模拟进程在记录 finalized 前退出'
    await writeState(root, state)

    const result = await runtime.finalizeWorkflow(workflow.agent, state.id)
    const saved = await readState(root, state.id)
    assert.equal(result.finalized, true)
    assert.equal(saved.finalized, true)
    assert.equal(saved.cleanupPending, false)
    assert.equal(saved.finalMergeHead, finalMerge.head)
    assert.equal(await readFile(join(root, 'owned', 'recovered.txt'), 'utf8'), '恢复交付内容\n')
  } finally {
    await disposeRuntime(runtime)
    await cleanupWorkflow(root, workflow)
  }
})

test('finalize 在启动分支有新提交时以最新 base 预合并固定 review SHA 并成功交付', async () => {
  let fixture
  try {
    fixture = await createFinalizeSafetyFixture('wf-finalize-latest-base-success')
    const reviewedSha = fixture.state.implementationReviewHead
    await commitFile(fixture.root, 'unrelated.md', 'base 的新提交\n', '启动分支新增普通提交')

    const result = await fixture.runtime.finalizeWorkflow(fixture.workflow.agent, fixture.state.id)
    const saved = await readState(fixture.root, fixture.state.id)

    assert.equal(result.finalized, true)
    assert.equal(saved.finalized, true)
    assert.equal(saved.implementationReviewHead, reviewedSha)
    assert.equal(saved.finalMergePreflight.reviewedSha, reviewedSha)
    assert.equal(saved.finalMergePreflight.status, 'passed')
    assert.equal(await isCommitAncestor(fixture.root, reviewedSha, saved.finalMergePreflight.commitSha), true)
    assert.equal(await isCommitAncestor(fixture.root, reviewedSha, saved.finalMergeHead), true)
    assert.equal(await readFile(join(fixture.root, 'unrelated.md'), 'utf8'), 'base 的新提交\n')
    assert.equal(await readFile(join(fixture.root, `owned/${fixture.state.id}.txt`), 'utf8'), '经过审查的交付内容\n')
  } finally {
    await cleanupFinalizeSafetyFixture(fixture)
  }
})

test('finalize 最新 base 预合并冲突时记录失败并保留 workflow、Owner 和 preflight 现场', async () => {
  let fixture
  try {
    fixture = await createFinalizeSafetyFixture('wf-finalize-latest-base-conflict')
    const reviewedSha = fixture.state.implementationReviewHead
    const reviewedFile = `owned/${fixture.state.id}.txt`
    const baseSha = await commitFile(fixture.root, reviewedFile, 'base 的冲突内容\n', '启动分支新增冲突提交')

    await assert.rejects(
      fixture.runtime.finalizeWorkflow(fixture.workflow.agent, fixture.state.id),
      /合并|冲突|final merge/u,
    )

    const saved = await readState(fixture.root, fixture.state.id)
    const preflight = saved.finalMergePreflight
    assert.equal(saved.finalized, undefined)
    assert.equal(saved.finalMergeHead, undefined)
    assert.equal(saved.implementationReviewHead, reviewedSha)
    assert.equal(preflight.reviewedSha, reviewedSha)
    assert.equal(preflight.baseHead, baseSha)
    assert.equal(preflight.status, 'conflicted')
    assert.match(saved.finalMergeError, /合并|冲突|git/u)
    assert.equal(await runGit(preflight.worktree, ['rev-parse', 'MERGE_HEAD']), `${reviewedSha}\n`)
    assert.equal(await head(fixture.root), baseSha)
    assert.deepEqual(await statusRecords(fixture.root), [])
    assert.equal(existsSync(fixture.workflow.state.workflowWorktree), true)
    assert.equal(await head(fixture.workflow.state.workflowWorktree), reviewedSha)
    assert.equal(existsSync(fixture.owner.worktree), true)
    assert.deepEqual(await listBranches(fixture.root, fixture.workflow.state.workflowBranch), [fixture.workflow.state.workflowBranch])
    assert.deepEqual(await listBranches(fixture.root, fixture.owner.branch), [fixture.owner.branch])
    assert.equal(existsSync(preflight.worktree), true)
    assert.deepEqual(await listBranches(fixture.root, preflight.branch), [preflight.branch])
    await assert.rejects(runGit(fixture.root, ['rev-parse', '--verify', 'MERGE_HEAD']), /fatal|not a valid object/u)
    assert.equal(await readFile(join(fixture.root, reviewedFile), 'utf8'), 'base 的冲突内容\n')
  } finally {
    await cleanupFinalizeSafetyFixture(fixture)
  }
})

function requestV2Task(id, role, ownerId, dependsOn = []) {
  return {
    id,
    role,
    ownerId,
    title: `${id} 请求任务`,
    dependsOn,
    write: role === 'work' ? [`src/${ownerId}/${id}.mjs`] : [],
    verify: ['unit'],
    done: [`${id} 完成`],
  }
}

function requestV2Plan() {
  return normalizePlanV2({
    contract: PLAN_V2_CONTRACT,
    registryDigest: 'a'.repeat(64),
    summary: '请求动作测试计划',
    owners: [
      { id: 'api', name: 'API Owner', description: '负责 API', scope: ['src/api/**'], exclude: [] },
      { id: 'web', name: 'Web Owner', description: '负责 Web', scope: ['src/web/**'], exclude: [] },
    ],
    verifications: [{ id: 'unit', run: ['node', '--test'] }],
    tasks: [
      requestV2Task('T1', 'work', 'api'),
      requestV2Task('T2', 'work', 'api', ['T1']),
      requestV2Task('T3', 'work', 'web', ['T2']),
    ],
  })
}

async function createV2RequestFixture(id) {
  const { root } = await createRepository()
  const runtime = createOwnerWorkflowRuntime({}, {})
  const plan = requestV2Plan()
  const workflow = await createWorkflow(root, runtime, plan, { id, status: 'running' })
  const state = await readState(root, id)
  state.tasks = createTaskState(plan).map(task => task.taskId === 'T1'
    ? { ...task, status: 'completed', fixedCommit: 'fixed-t1' }
    : task.taskId === 'T2'
      ? { ...task, status: 'running', executorId: 'owner-session' }
      : task)
  state.planDigest = digest(plan)
  await writeState(root, state)
  const exec = { agent: { id: 'owner-session', session: { id: 'owner-session', header: { cwd: root } } } }
  runtime.activeOwners.set('owner-session', {
    ownerKey: `${root}:api`,
    owner: plan.owners.find(owner => owner.id === 'api'),
    worktree: workflow.state.workflowWorktree,
    workflowRoot: root,
    workflowId: id,
    stageId: 'T2',
    sessionId: 'owner-session',
  })
  return { root, runtime, workflow, plan, state, exec }
}

test('Runtime 当前 Owner 只能通过结构化 request_subgraph 请求并在锁内持久化局部 delta', async () => {
  const fixture = await createV2RequestFixture('wf-request-subgraph')
  try {
    const result = await fixture.runtime.requestSubgraph({
      workflow_id: fixture.workflow.state.id,
      task_id: 'T2',
      proposal: {
        children: [requestV2Task('T2-1', 'work', 'api'), requestV2Task('T2-2', 'review', 'api', ['T2-1'])],
        entry: ['T2-1'],
        exit: ['T2-2'],
      },
    }, fixture.exec)
    const saved = await readState(fixture.root, fixture.workflow.state.id)
    assert.equal(result.taskId, 'T2')
    assert.deepEqual(saved.plan.tasks.find(task => task.id === 'T2').children, ['T2-1', 'T2-2'])
    assert.equal(saved.tasks.find(task => task.taskId === 'T2').status, 'pending')
    assert.equal(saved.subgraphRequests.length, 1)
    assert.equal(saved.subgraphRequests[0].status, 'applied')
    await assert.rejects(
      fixture.runtime.requestSubgraph({ workflow_id: fixture.workflow.state.id, task_id: 'T1', proposal: {} }, fixture.exec),
      /当前任务|active task|active owner|Owner/u,
    )
    await assert.rejects(
      fixture.runtime.requestSubgraph({ workflow_id: fixture.workflow.state.id, task_id: 'T2', proposal: {} }, {
        agent: { id: 'other-session', session: { id: 'other-session', header: { cwd: fixture.root } } },
      }),
      /当前 Owner|active owner|Owner/u,
    )
  } finally {
    await disposeRuntime(fixture.runtime)
    await cleanupWorkflow(fixture.root, fixture.workflow)
  }
})

test('Runtime request_handoff 走局部失效并拒绝通过 delta 绕过 Registry 边界', async () => {
  const fixture = await createV2RequestFixture('wf-request-handoff')
  try {
    await assert.rejects(
      fixture.runtime.requestHandoff({
        workflow_id: fixture.workflow.state.id,
        task_id: 'T2',
        handoff: {
          targetType: 'owner',
          targetOwnerId: 'web',
          summary: '转交 Web 文件',
          reason: '文件属于 Web Owner',
          files: ['src/web/request.mjs'],
        },
        delta: {
          plan: {
            ...fixture.plan,
            owners: [...fixture.plan.owners, { id: 'new-owner', name: '越界 Owner', description: '不应直接加入', scope: ['src/new/**'], exclude: [] }],
          },
        },
      }, fixture.exec),
      /Registry|Owner|边界/u,
    )

    const result = await fixture.runtime.requestHandoff({
      workflow_id: fixture.workflow.state.id,
      task_id: 'T2',
      handoff: {
        targetType: 'owner',
        targetOwnerId: 'web',
        summary: '转交 Web 文件',
        reason: '文件属于 Web Owner',
        files: ['src/web/request.mjs'],
      },
    }, fixture.exec)
    const saved = await readState(fixture.root, fixture.workflow.state.id)
    assert.equal(result.taskId, 'T2')
    assert.equal(saved.handoffQueue.length, 1)
    assert.equal(saved.handoffQueue[0].status, 'pending')
    assert.match(saved.handoffQueue[0].id, /^handoff-/u)
    assert.equal(saved.handoffQueue[0].taskId, 'T2')
    assert.equal(saved.handoffQueue[0].sourceTaskId, 'T2')
    assert.equal(saved.handoffQueue[0].sourceStageId, 'T2')
    assert.equal(saved.handoffQueue[0].sourceOwnerId, 'api')
    assert.equal(saved.handoffQueue[0].sessionId, 'owner-session')
    assert.equal(saved.tasks.find(task => task.taskId === 'T2').status, 'pending')
    assert.equal(saved.tasks.find(task => task.taskId === 'T3').status, 'pending')
  } finally {
    await disposeRuntime(fixture.runtime)
    await cleanupWorkflow(fixture.root, fixture.workflow)
  }
})

test('Runtime request_handoff 只保留白名单字段，调用方元数据不能覆盖生成字段', async () => {
  const fixture = await createV2RequestFixture('wf-request-handoff-whitelist')
  try {
    await fixture.runtime.requestHandoff({
      workflow_id: fixture.workflow.state.id,
      task_id: 'T2',
      handoff: {
        targetType: 'owner',
        targetOwnerId: 'web',
        summary: '转交 Web 文件',
        reason: '文件属于 Web Owner',
        files: ['src/web/request.mjs'],
        id: 'forged-id',
        status: 'completed',
        taskId: 'forged-task',
        sourceOwnerId: 'forged-owner',
        sessionId: 'forged-session',
        unexpected: 'strip-me',
      },
    }, fixture.exec)
    const saved = await readState(fixture.root, fixture.workflow.state.id)
    const queued = saved.handoffQueue[0]
    assert.match(queued.id, /^handoff-/u)
    assert.equal(queued.status, 'pending')
    assert.equal(queued.taskId, 'T2')
    assert.equal(queued.sourceTaskId, 'T2')
    assert.equal(queued.sourceStageId, 'T2')
    assert.equal(queued.sourceOwnerId, 'api')
    assert.equal(queued.sessionId, 'owner-session')
    assert.deepEqual({
      targetType: queued.targetType,
      targetOwnerId: queued.targetOwnerId,
      summary: queued.summary,
      reason: queued.reason,
      files: queued.files,
    }, {
      targetType: 'owner',
      targetOwnerId: 'web',
      summary: '转交 Web 文件',
      reason: '文件属于 Web Owner',
      files: ['src/web/request.mjs'],
    })
    assert.equal(queued.unexpected, undefined)
  } finally {
    await disposeRuntime(fixture.runtime)
    await cleanupWorkflow(fixture.root, fixture.workflow)
  }
})

test('V2 handoff_replan 用 task.write 覆盖 handoff 文件并 carry forward completed task', async () => {
  const fixture = await createV2RequestFixture('wf-v2-handoff-replan-task-write')
  try {
    const state = await readState(fixture.root, fixture.workflow.state.id)
    state.status = 'blocked'
    const targetFile = 'src/web/request.mjs'
    state.handoffQueue = [{
      id: 'handoff-task-write',
      status: 'pending',
      sourceTaskId: 'T2',
      sourceOwnerId: 'api',
      targetType: 'owner',
      targetOwnerId: 'web',
      summary: '转交 Web 文件',
      reason: '文件属于 Web Owner',
      files: [targetFile],
    }]
    const nextPlan = {
      ...fixture.plan,
      tasks: fixture.plan.tasks.map(task => task.id === 'T3'
        ? { ...task, write: ['src/web/**'] }
        : task),
    }
    await writeState(fixture.root, state)
    fixture.runtime.runChild = async () => JSON.stringify(nextPlan)

    const result = await fixture.runtime.replanHandoffs(fixture.workflow.agent, state.id)
    const saved = await readState(fixture.root, state.id)
    assert.equal(result.workflow.status, 'planned')
    assert.equal(saved.status, 'planned')
    assert.equal(saved.tasks.find(task => task.taskId === 'T1').status, 'completed')
    assert.deepEqual(saved.plan.tasks.find(task => task.id === 'T3').write, ['src/web/**'])
    assert.equal(saved.handoffQueue[0].status, 'planned')
  } finally {
    await disposeRuntime(fixture.runtime)
    await cleanupWorkflow(fixture.root, fixture.workflow)
  }
})

test('V2 handoff_replan 拒绝改写已有 ownerRun 对应 task 的语义', async () => {
  const fixture = await createV2RequestFixture('wf-v2-handoff-replan-owner-run-immutable')
  try {
    const state = await readState(fixture.root, fixture.workflow.state.id)
    state.status = 'blocked'
    state.ownerRuns = {
      'T2:api': {
        status: 'failed',
        taskId: 'T2',
        ownerId: 'api',
        stageId: 'T2',
        error: '模拟 Owner 失败',
      },
    }
    state.handoffQueue = [{
      id: 'handoff-owner-run-immutable',
      status: 'pending',
      sourceTaskId: 'T2',
      sourceOwnerId: 'api',
      targetType: 'owner',
      targetOwnerId: 'web',
      summary: '转交 Web 文件',
      reason: '文件属于 Web Owner',
      files: ['src/web/T3.mjs'],
    }]
    const nextPlan = {
      ...fixture.plan,
      tasks: fixture.plan.tasks.map(task => task.id === 'T2'
        ? { ...task, title: '被篡改的已有 task 语义' }
        : task),
    }
    await writeState(fixture.root, state)
    fixture.runtime.runChild = async () => JSON.stringify(nextPlan)

    await assert.rejects(
      fixture.runtime.replanHandoffs(fixture.workflow.agent, state.id),
      /ownerRun|运行现场|task.*语义|immutable/u,
    )
    const saved = await readState(fixture.root, state.id)
    assert.equal(saved.status, 'blocked')
    assert.equal(saved.handoffQueue[0].status, 'pending')
    assert.equal(saved.ownerRuns['T2:api'].status, 'failed')
  } finally {
    await disposeRuntime(fixture.runtime)
    await cleanupWorkflow(fixture.root, fixture.workflow)
  }
})

test('V2 recoverWorkflow 只按 task 状态、ownerRuns 和 Supervisor queue 恢复失败 task', async () => {
  const fixture = await createV2RequestFixture('wf-v2-recover-task-path')
  try {
    const state = await readState(fixture.root, fixture.workflow.state.id)
    state.status = 'failed'
    state.tasks = state.tasks.map(task => task.taskId === 'T2'
      ? { ...task, status: 'stopped', reason: 'task_failed', action: 'repair_task', executorId: null }
      : task)
    const completedOwnerRun = {
      status: 'completed',
      taskId: 'T1',
      ownerId: 'api',
      stageId: 'T1',
      result: { commitSha: 'fixed-t1', branch: 'dsh/owner/fixed/api', worktree: '/fixed/t1' },
    }
    state.ownerRuns = {
      'T1:api': completedOwnerRun,
      'T2:api': {
        status: 'failed',
        taskId: 'T2',
        ownerId: 'api',
        stageId: 'T2',
        error: '模拟 Owner 失败',
      },
    }
    state.supervisorOutbox = {
      'T2:api': { taskId: 'T2', ownerId: 'api', status: 'failed', error: '模拟 Owner 失败' },
    }
    await writeState(fixture.root, state)
    fixture.runtime.queueSupervisorReservations = () => undefined

    const result = await fixture.runtime.recoverWorkflow(fixture.workflow.agent, state.id)
    const saved = await readState(fixture.root, state.id)
    assert.equal(result.workflow.status, 'running')
    assert.equal(saved.status, 'running')
    assert.equal(saved.tasks.find(task => task.taskId === 'T1').status, 'completed')
    assert.equal(saved.tasks.find(task => task.taskId === 'T2').status, 'pending')
    assert.deepEqual(saved.ownerRuns['T1:api'], completedOwnerRun)
    assert.equal(saved.ownerRuns['T2:api'].status, 'pending')
    assert.equal(saved.supervisorOutbox['T2:api'].status, 'reserved')
  } finally {
    await disposeRuntime(fixture.runtime)
    await cleanupWorkflow(fixture.root, fixture.workflow)
  }
})

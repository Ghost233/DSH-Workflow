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
import { apply as applyPlugin } from '../index.js'
import {
  applyApprovedRegistryChange,
  ensureRegistry,
  loadRegistry,
  proposeRegistryChange,
} from '../src/registry.mjs'
import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'
import { listBranches, statusRecords } from '../src/git.mjs'
import { createTaskState } from '../src/supervisor.mjs'

const execFileAsync = promisify(execFile)
const EXTERNAL_RUNNER_PATH = fileURLToPath(new URL('../src/external-runner.mjs', import.meta.url))

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

async function supervisorControlFixture({ materializeWorkflow = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-control-'))
  const runtime = createOwnerWorkflowRuntime({}, {})
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

test('外部控制桥可以驱动 ping 和 status，并在运行时释放后清理', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-control-'))
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
    await git(root, ['config', 'user.name', 'Owner Workflow Test'])
    await writeFile(join(root, 'README.md'), '测试\n', 'utf8')
    await git(root, ['add', 'README.md'])
    await git(root, ['commit', '-m', '初始化测试仓库'])
    await runtime.prepareRoot(root)

    const state = {
      contract: 'DSH_WORKFLOW_STATE_V1',
      id: 'wf-control-test',
      root,
      baseBranch: 'main',
      baseRef: 'HEAD',
      workflowBranch: 'dsh/workflow/wf-control-test',
      workflowWorktree: join(root, '.dsh-workflow', 'worktrees', 'wf-control-test', 'workflow'),
      request: '控制桥测试',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'planned',
      attempt: 0,
      completedStages: [],
      stageResults: [],
      ownerRuns: {},
      plan: {
        contract: 'DSH_PLAN_V1',
        summary: '控制桥测试计划',
        owners: [{ id: 'test-owner', name: '测试 Owner', description: '控制桥测试', scope: ['README.md'], exclude: [] }],
        stages: [{ id: 'stage-1', name: '测试阶段', dependsOn: [], tasks: [{ id: 'task-1', ownerId: 'test-owner', title: '测试', description: '测试' }] }],
      },
    }
    await writeFile(
      join(root, '.dsh-workflow', 'workflows', `${state.id}.json`),
      `${JSON.stringify(state, null, 2)}\n`,
      'utf8',
    )

    const agent = { session: { header: { cwd: root }, id: 'parent-session' } }
    const manifest = await runtime.ensureControlBridge(agent, state)
    const ping = await request(manifest, 'ping')
    assert.equal(ping.workflowId, state.id)
    const status = await request(manifest, 'status')
    assert.equal(status.workflow.workflowId, state.id)
    assert.equal(status.workflow.status, 'planned')

    await runtime.dispose()
    await assert.rejects(readFile(manifest.socketPath), /ENOENT/u)
    await assert.rejects(readFile(join(root, '.dsh-workflow', 'control', `${state.id}.json`)), /ENOENT/u)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('Supervisor create 只持久 reservation，必须由外置 runner 显式 execute 才启动 Owner', async () => {
  const fixture = await supervisorControlFixture()
  const ownerCalls = []
  fixture.runtime.runExternalOwner = async (_agent, workflowId, taskId, ownerId, _signal, options) => {
    ownerCalls.push({ workflowId, taskId, ownerId, stage: options.stageOverride })
    return { sessionId: 'agent-1', commitSha: 'c2', phase: 'synced' }
  }
  fixture.runtime.finishOwner = async () => ({ phase: 'completed' })
  try {
    const started = await request(fixture.manifest, 'supervisor-start', { parallel: 2 })
    assert.equal(started.status, 'running')

    const create = await request(fixture.manifest, 'supervisor-next')
    assert.equal(create.action, 'create')
    assert.deepEqual(create.tasks.map(item => item.taskId), ['T1'])
    await assert.rejects(
      request(fixture.manifest, 'supervisor-ack', {
        actionId: 'sa-0000000000000000',
        observation: {},
      }),
      /actionId/u,
    )
    const created = await request(fixture.manifest, 'supervisor-ack', {
      actionId: create.actionId,
      observation: {},
    })
    assert.deepEqual(created.observation, { tasks: [{ taskId: 'T1', status: 'running' }] })
    assert.equal(created.reservations.length, 1)
    await delay(30)
    assert.equal(ownerCalls.length, 0)
    await request(fixture.manifest, 'supervisor-execute', {
      reservationId: created.reservations[0].reservationId,
    })
    await waitForCondition(() => ownerCalls.length === 1, 'Supervisor reservation 调用 Owner API')
    assert.deepEqual(ownerCalls, [{
      workflowId: fixture.state.id,
      taskId: 'T1',
      ownerId: 'api',
      stage: undefined,
    }])
    const settled = await waitForWorkflowState(
      fixture.statePath,
      state => state.supervisorOutbox?.['T1:api']?.status === 'completed',
      'Supervisor reservation 进入终态',
    )
    assert.equal(settled.supervisorOutbox['T1:api'].status, 'completed')
  } finally {
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Runner daemon 自动发现 approved Workflow 并驱动 Harness 内 Owner 子代理', async () => {
  const fixture = await supervisorControlFixture()
  const ownerCalls = []
  fixture.runtime.runExternalOwner = async (_agent, workflowId, taskId, ownerId) => {
    ownerCalls.push({ workflowId, taskId, ownerId })
    return { sessionId: 'agent-daemon', commitSha: 'c2', phase: 'synced' }
  }
  fixture.runtime.finishOwner = async () => ({ phase: 'completed' })
  const daemon = spawn(process.execPath, [
    EXTERNAL_RUNNER_PATH,
    '--daemon',
    '--catalog-root', fixture.root,
    '--poll-ms', '200',
    '--parallel', '1',
    '--timeout-ms', '10000',
    '--event-wait-ms', '200',
  ], { cwd: fixture.root, stdio: 'ignore' })
  try {
    await waitForCondition(() => ownerCalls.length === 1, 'Runner daemon 自动派发 Owner')
    assert.deepEqual(ownerCalls, [{
      workflowId: fixture.state.id,
      taskId: 'T1',
      ownerId: 'api',
    }])
    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.equal(state.status, 'running')
    assert.ok(state.supervisorEvents.some(event => event.type === 'supervisor.started'))
  } finally {
    daemon.kill('SIGTERM')
    await new Promise(resolveExit => {
      if (daemon.exitCode !== null || daemon.signalCode !== null) resolveExit()
      else daemon.once('exit', resolveExit)
    })
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Runner 启动前可从固定提交重建尚未执行且已丢失的 Workflow worktree', async () => {
  const fixture = await supervisorControlFixture()
  const missingWorktree = join(fixture.root, '.dsh-workflow', 'worktrees', fixture.state.id, 'workflow')
  const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
  state.workflowWorktree = missingWorktree
  state.workflowBranch = `dsh/workflow/${fixture.state.id}-recreated`
  state.baseHead = state.workflowHead
  state.approvedProposalDigest = null
  state.registryBaseCommit = null
  await writeFile(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  try {
    const started = await request(fixture.manifest, 'supervisor-start', { parallel: 1 })
    assert.equal(started.status, 'running')
    const branch = (await execFileAsync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
      cwd: missingWorktree,
      encoding: 'utf8',
    })).stdout.trim()
    assert.equal(branch, state.workflowBranch)
    const saved = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.equal(saved.workflowHead, state.baseHead)
    const log = await readFile(join(fixture.root, '.dsh-workflow', 'logs', `${state.id}.jsonl`), 'utf8')
    assert.match(log, /workflow.worktree-recreated/u)
  } finally {
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('V2 控制桥拒绝 legacy owner 调度动作，唯一入口是 Supervisor', async () => {
  const fixture = await supervisorControlFixture()
  try {
    for (const action of ['run-owner', 'owner-sync', 'owner-finish', 'owner-recover', 'merge-stage']) {
      await assert.rejects(
        request(fixture.manifest, action, { stageId: 'T1', ownerId: 'api' }),
        /V2|legacy|Supervisor|拒绝|唯一/u,
        `V2 控制桥 ${action} 必须拒绝 legacy 调度路径`,
      )
    }
  } finally {
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('runtime.dispose 阻止新 Supervisor dispatch 并等待已登记 dispatch 终态', async () => {
  const runtime = createOwnerWorkflowRuntime({}, {})
  const started = Promise.withResolvers()
  const release = Promise.withResolvers()
  const calls = []
  runtime.runSupervisorReservation = async (_agent, _workflowId, reservationKey) => {
    calls.push(reservationKey)
    started.resolve()
    await release.promise
  }

  let disposal
  try {
    runtime.queueSupervisorReservations({}, 'wf-dispose', ['T1:api'])
    await started.promise

    let disposed = false
    disposal = runtime.dispose().then(() => { disposed = true })
    runtime.queueSupervisorReservations({}, 'wf-dispose', ['T2:api'])
    await delay(20)

    assert.equal(disposed, false)
    assert.deepEqual(calls, ['T1:api'])

    release.resolve()
    await disposal
    assert.equal(runtime.supervisorDispatches.size, 0)
  } finally {
    release.resolve()
    await Promise.allSettled([...runtime.supervisorDispatches.values()])
    await disposal?.catch(() => undefined)
    await runtime.dispose()
  }
})

test('Supervisor create 持久 reservation，并用真实 runExternalOwner 两阶段结算到 completed', async () => {
  const fixture = await supervisorControlFixture()
  const owner = fixture.state.plan.owners[0]
  let registry = await ensureRegistry(fixture.root)
  registry = await applyRegistryOperation(fixture.root, registry, {
    type: 'add',
    owner,
    reason: '为 Supervisor 真实生命周期登记 Owner',
  })
  fixture.state.plan.registryDigest = registryContentDigest(registry)
  fixture.state.registryDigest = fixture.state.plan.registryDigest
  fixture.state.planDigest = createHash('sha256').update(JSON.stringify(fixture.state.plan)).digest('hex')
  fixture.state.planReviewDigest = fixture.state.planDigest
  await writeFile(fixture.statePath, `${JSON.stringify(fixture.state, null, 2)}\n`, 'utf8')
  await git(fixture.root, ['add', '.owner-workflow'])
  await git(fixture.root, ['commit', '-m', '登记 Supervisor 测试 Owner'])
  const commitSha = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: fixture.root, encoding: 'utf8' })).stdout.trim()
  const ownerGate = Promise.withResolvers()
  fixture.runtime.createOwnerEntry = async (_state, task) => ({
    owner,
    tasks: [task],
    branch: 'main',
    worktree: fixture.root,
    baseCommit: commitSha,
    taskId: task.id,
  })
  fixture.runtime.runOwnerEntry = async () => {
    await ownerGate.promise
    return {
      ownerId: owner.id,
      branch: 'main',
      worktree: fixture.root,
      baseCommit: commitSha,
      commitSha,
      sessionId: 'owner-real-lifecycle',
      report: { summary: '真实 Owner 生命周期完成', changes: [], tests: [] },
      changedFiles: [],
      ahead: 0,
    }
  }
  fixture.runtime.assertRequiredTaskVerifications = async () => ({
    contentDigest: 'a'.repeat(64),
    verificationIds: ['unit'],
  })
  const finishOwner = fixture.runtime.finishOwner.bind(fixture.runtime)
  let finishCalls = 0
  fixture.runtime.finishOwner = async (...args) => {
    finishCalls += 1
    return finishOwner(...args)
  }
  try {
    await request(fixture.manifest, 'supervisor-start', { parallel: 1 })
    const create = await request(fixture.manifest, 'supervisor-next')
    const acknowledged = await request(fixture.manifest, 'supervisor-ack', { actionId: create.actionId })
    await request(fixture.manifest, 'supervisor-execute', {
      reservationId: acknowledged.reservations[0].reservationId,
    })

    const reserved = await waitForWorkflowState(
      fixture.statePath,
      state => state.supervisorOutbox?.['T1:api']?.status === 'launching',
      'create reservation 已持久并开始派发',
    )
    assert.equal(reserved.tasks[0].status, 'running')
    assert.equal(reserved.supervisorOutbox['T1:api'].actionId, create.actionId)

    const inFlight = await request(fixture.manifest, 'supervisor-next')
    assert.equal(inFlight.action, 'wait')

    ownerGate.resolve()
    const settled = await waitForWorkflowState(
      fixture.statePath,
      state => state.supervisorOutbox?.['T1:api']?.status === 'completed',
      'Owner 两阶段结算',
    )
    assert.equal(finishCalls, 1)
    assert.equal(settled.ownerRuns['T1:api'].status, 'completed')
    assert.notEqual(settled.ownerRuns['T1:api'].status, 'awaiting_finish')

    const stop = await request(fixture.manifest, 'supervisor-next')
    assert.equal(stop.action, 'stop')
    const stopped = await request(fixture.manifest, 'supervisor-stop', { actionId: stop.actionId })
    assert.equal(stopped.status, 'completed')
  } finally {
    ownerGate.resolve()
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Supervisor 查询会在 Runtime 重启后重建控制桥，供新的外置 runner 显式 recover', async () => {
  const fixture = await supervisorControlFixture()
  let restarted
  try {
    fixture.runtime.queueSupervisorReservations = () => undefined
    await request(fixture.manifest, 'supervisor-start', { parallel: 1 })
    const create = await request(fixture.manifest, 'supervisor-next')
    const acknowledged = await request(fixture.manifest, 'supervisor-ack', { actionId: create.actionId })
    await request(fixture.manifest, 'supervisor-execute', {
      reservationId: acknowledged.reservations[0].reservationId,
    })

    const persisted = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.equal(persisted.supervisorOutbox['T1:api'].status, 'reserved')
    assert.equal(persisted.supervisorOutbox['T1:api'].actionId, create.actionId)
    assert.equal(persisted.tasks[0].status, 'running')

    await fixture.runtime.dispose()
    restarted = createOwnerWorkflowRuntime({}, {})
    const health = await restarted.supervisorStatus(fixture.agent, persisted.id)
    assert.equal(health.workflows[0].workflow.workflowId, persisted.id)
    const restartedManifest = JSON.parse(await readFile(
      join(fixture.root, '.dsh-workflow', 'control', `${persisted.id}.json`),
      'utf8',
    ))
    const recovery = await request(restartedManifest, 'supervisor-recover')

    assert.equal(recovery.reservations.length, 1)
    assert.equal(recovery.reservations[0].taskId, 'T1')
    assert.equal(recovery.reservations[0].ownerId, 'api')
    assert.equal(recovery.reservations[0].status, 'reserved')
  } finally {
    await restarted?.dispose()
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Supervisor Owner 启动失败持久化为决策阻塞，并写入可确认主会话 outbox', async () => {
  const fixture = await supervisorControlFixture()
  fixture.runtime.runExternalOwner = async () => {
    throw new Error('模拟 Owner 启动失败')
  }
  try {
    await request(fixture.manifest, 'supervisor-start', { parallel: 1 })
    const create = await request(fixture.manifest, 'supervisor-next')
    const acknowledged = await request(fixture.manifest, 'supervisor-ack', { actionId: create.actionId })
    await request(fixture.manifest, 'supervisor-execute', {
      reservationId: acknowledged.reservations[0].reservationId,
    })

    const failed = await waitForWorkflowState(
      fixture.statePath,
      state => state.supervisorOutbox?.['T1:api']?.status === 'failed',
      'Owner 启动失败落盘',
    )
    assert.equal(failed.status, 'blocked')
    assert.equal(failed.supervisorOutbox['T1:api'].error, '模拟 Owner 启动失败')
    assert.equal(failed.ownerRuns['T1:api'].status, 'failed')
    assert.equal(failed.ownerRuns['T1:api'].error, '模拟 Owner 启动失败')
    assert.deepEqual(failed.tasks[0], {
      taskId: 'T1',
      status: 'stopped',
      executorId: null,
      cursor: null,
      unchangedPolls: 0,
      reason: 'decision_required',
      action: 'await_user',
    })

    const notify = await request(fixture.manifest, 'supervisor-next')
    assert.equal(notify.action, 'notify')
    const acknowledgedNotify = await request(fixture.manifest, 'supervisor-ack', { actionId: notify.actionId })
    assert.equal(acknowledgedNotify.notification.status, 'pending')
    const outbox = await request(fixture.manifest, 'supervisor-outbox-next')
    assert.equal(outbox.notification.notificationId, acknowledgedNotify.notification.notificationId)
    const delivered = await request(fixture.manifest, 'supervisor-outbox-ack', {
      notificationId: outbox.notification.notificationId,
    })
    assert.equal(delivered.status, 'delivered')
  } finally {
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('DSH_PLAN_V2 的 repair_owner 失败策略会受 maxAttempts 约束地重新进入 DAG', async () => {
  const fixture = await supervisorControlFixture()
  fixture.state.plan.tasks[0].onFailure = { action: 'repair_owner', maxAttempts: 2 }
  await writeFile(fixture.statePath, `${JSON.stringify(fixture.state, null, 2)}\n`, 'utf8')
  fixture.runtime.runExternalOwner = async () => {
    throw new Error('首次 Owner 执行失败')
  }
  try {
    await request(fixture.manifest, 'supervisor-start', { parallel: 1 })
    const create = await request(fixture.manifest, 'supervisor-next')
    const acknowledged = await request(fixture.manifest, 'supervisor-ack', { actionId: create.actionId })
    await request(fixture.manifest, 'supervisor-execute', {
      reservationId: acknowledged.reservations[0].reservationId,
    })
    const retryState = await waitForWorkflowState(
      fixture.statePath,
      state => state.supervisorOutbox?.['T1:api']?.status === 'failed' && state.tasks?.[0]?.status === 'pending',
      'repair_owner 将任务放回待调度队列',
    )
    assert.equal(retryState.status, 'running')
    assert.equal(retryState.ownerRuns['T1:api'].status, 'pending')
    assert.equal(retryState.ownerRuns['T1:api'].retryCount, 1)
    const retry = await request(fixture.manifest, 'supervisor-next')
    assert.equal(retry.action, 'create')
    assert.equal(retry.tasks[0].taskId, 'T1')
  } finally {
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Supervisor inspect 只返回有限宿主字段，未知控制动作关闭处理', async () => {
  const fixture = await supervisorControlFixture()
  fixture.runtime.queueSupervisorReservations = () => undefined
  try {
    await request(fixture.manifest, 'supervisor-start', { parallel: 1 })
    const create = await request(fixture.manifest, 'supervisor-next')
    await request(fixture.manifest, 'supervisor-ack', { actionId: create.actionId, observation: {} })

    const stalled = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    stalled.tasks[0].executorId = 'agent-1'
    stalled.tasks[0].cursor = 'c1'
    stalled.tasks[0].unchangedPolls = 10
    stalled.ownerRuns['T1:api'] = {
      status: 'running',
      taskId: 'T1',
      ownerId: 'api',
      sessionId: 'agent-1',
      worktree: '/sensitive/worktree',
      error: '不得泄漏',
      result: { report: { summary: '不得泄漏' } },
    }
    await writeFile(fixture.statePath, `${JSON.stringify(stalled, null, 2)}\n`, 'utf8')

    const inspect = await request(fixture.manifest, 'supervisor-next')
    assert.equal(inspect.action, 'inspect')
    const observation = await request(fixture.manifest, 'supervisor-inspect', { actionId: inspect.actionId })
    assert.deepEqual(observation, {
      tasks: [{ taskId: 'T1', status: 'running', executorId: 'agent-1', cursor: 'c1' }],
    })
    await assert.rejects(
      request(fixture.manifest, 'supervisor-ack', {
        actionId: inspect.actionId,
        observation: {
          tasks: [{ taskId: 'T1', status: 'completed', executorId: 'forged', cursor: 'forged' }],
        },
      }),
      /inspect.*宿主观察.*不匹配|宿主观察.*不匹配/u,
    )
    const acknowledged = await request(fixture.manifest, 'supervisor-ack', {
      actionId: inspect.actionId,
      observation,
    })
    assert.deepEqual(acknowledged.observation, observation)

    await assert.rejects(request(fixture.manifest, 'launch-task'), /未知的控制动作/u)
  } finally {
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Supervisor await_event 以持久游标阻塞等待，并在超时后记录一次受控观察', async () => {
  const fixture = await supervisorControlFixture()
  fixture.runtime.queueSupervisorReservations = () => undefined
  try {
    await request(fixture.manifest, 'supervisor-start', { parallel: 1 })
    const create = await request(fixture.manifest, 'supervisor-next')
    const acknowledged = await request(fixture.manifest, 'supervisor-ack', { actionId: create.actionId })
    const waited = await request(fixture.manifest, 'supervisor-await-event', {
      cursor: acknowledged.eventCursor,
      waitMs: 1,
    })
    assert.equal(waited.kind, 'timeout')
    assert.ok(waited.cursor > acknowledged.eventCursor)
    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.equal(state.tasks[0].unchangedPolls, 1)
    assert.equal(state.supervisorEvents.at(-1).type, 'supervisor.wait-timeout')
  } finally {
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('任务达到已批准的 onTimeout.afterMs 后进入主会话决策路径', async () => {
  const fixture = await supervisorControlFixture()
  fixture.runtime.queueSupervisorReservations = () => undefined
  fixture.state.plan.tasks[0].onTimeout = { action: 'handoff_replan', afterMs: 60_000 }
  await writeFile(fixture.statePath, `${JSON.stringify(fixture.state, null, 2)}\n`, 'utf8')
  try {
    await request(fixture.manifest, 'supervisor-start', { parallel: 1 })
    const create = await request(fixture.manifest, 'supervisor-next')
    const acknowledged = await request(fixture.manifest, 'supervisor-ack', { actionId: create.actionId })
    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    state.supervisorOutbox['T1:api'] = {
      ...state.supervisorOutbox['T1:api'],
      status: 'launching',
      launchedAt: new Date(Date.now() - 60_001).toISOString(),
    }
    await writeFile(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')

    const timedOut = await request(fixture.manifest, 'supervisor-await-event', {
      cursor: acknowledged.eventCursor,
      waitMs: 1,
    })
    assert.equal(timedOut.event.type, 'supervisor.task-timeout')
    assert.equal(timedOut.status, 'blocked')
    const notify = await request(fixture.manifest, 'supervisor-next')
    assert.equal(notify.action, 'notify')
    const notification = await request(fixture.manifest, 'supervisor-ack', { actionId: notify.actionId })
    assert.deepEqual(notification.notification.tasks[0].policy, { action: 'handoff_replan', afterMs: 60_000 })
  } finally {
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Owner 恢复后使用本次运行时间重置超时基线，不沿用旧 reservation 时间', async () => {
  const fixture = await supervisorControlFixture()
  fixture.runtime.queueSupervisorReservations = () => undefined
  fixture.state.plan.tasks[0].onTimeout = { action: 'notify_main', afterMs: 60_000 }
  await writeFile(fixture.statePath, `${JSON.stringify(fixture.state, null, 2)}\n`, 'utf8')
  try {
    await request(fixture.manifest, 'supervisor-start', { parallel: 1 })
    const create = await request(fixture.manifest, 'supervisor-next')
    const acknowledged = await request(fixture.manifest, 'supervisor-ack', { actionId: create.actionId })
    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    state.supervisorOutbox['T1:api'] = {
      ...state.supervisorOutbox['T1:api'],
      status: 'failed',
      launchedAt: new Date(Date.now() - 120_000).toISOString(),
    }
    state.ownerRuns = {
      'T1:api': {
        status: 'running',
        ownerId: 'api',
        taskId: 'T1',
        startedAt: new Date().toISOString(),
        sessionId: 'recovered-owner',
      },
    }
    fixture.runtime.activeOwners.set('recovered-owner', {
      workflowId: state.id,
      stageId: 'T1',
      owner: { id: 'api' },
    })
    await writeFile(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')

    const waited = await request(fixture.manifest, 'supervisor-await-event', {
      cursor: acknowledged.eventCursor,
      waitMs: 1,
    })
    assert.equal(waited.kind, 'timeout')
    assert.equal(waited.event.type, 'supervisor.wait-timeout')
    const saved = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.equal(saved.status, 'running')
    assert.equal(saved.tasks[0].status, 'running')
  } finally {
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Supervisor receipt 绑定持久 revision，且 blocked workflow 不能确认旧 create', async () => {
  const fixture = await supervisorControlFixture()
  let launches = 0
  fixture.runtime.runExternalOwner = async () => {
    launches += 1
    return { sessionId: 'agent-1', phase: 'synced' }
  }
  try {
    await request(fixture.manifest, 'supervisor-start', { parallel: 1 })
    const original = await request(fixture.manifest, 'supervisor-next')

    const revised = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    revised.revision += 1
    await writeFile(fixture.statePath, `${JSON.stringify(revised, null, 2)}\n`, 'utf8')
    const revisedExpected = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    await assert.rejects(
      request(fixture.manifest, 'supervisor-ack', { actionId: original.actionId }),
      /actionId/u,
    )
    assert.deepEqual(JSON.parse(await readFile(fixture.statePath, 'utf8')), revisedExpected)

    const current = await request(fixture.manifest, 'supervisor-next')
    const blocked = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    blocked.status = 'blocked'
    blocked.revision += 1
    await writeFile(fixture.statePath, `${JSON.stringify(blocked, null, 2)}\n`, 'utf8')
    const blockedExpected = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    await assert.rejects(
      request(fixture.manifest, 'supervisor-ack', { actionId: current.actionId }),
      /running|blocked|actionId/u,
    )
    assert.deepEqual(JSON.parse(await readFile(fixture.statePath, 'utf8')), blockedExpected)
    assert.equal(launches, 0)
  } finally {
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Supervisor create receipt 绑定实际 planDigest，旧 ACK 拒绝且 workflow 不变', async () => {
  const fixture = await supervisorControlFixture()
  fixture.runtime.queueSupervisorReservations = () => undefined
  try {
    await request(fixture.manifest, 'supervisor-start', { parallel: 1 })
    const create = await request(fixture.manifest, 'supervisor-next')
    const changed = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    changed.planDigest = 'b'.repeat(64)
    await writeFile(fixture.statePath, `${JSON.stringify(changed, null, 2)}\n`, 'utf8')
    const expected = JSON.parse(await readFile(fixture.statePath, 'utf8'))

    await assert.rejects(
      request(fixture.manifest, 'supervisor-ack', { actionId: create.actionId }),
      /actionId|planDigest/u,
    )
    assert.deepEqual(JSON.parse(await readFile(fixture.statePath, 'utf8')), expected)
  } finally {
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Supervisor stop receipt 绑定实际 planDigest，旧 stop 拒绝且 workflow 不变', async () => {
  const fixture = await supervisorControlFixture()
  fixture.runtime.queueSupervisorReservations = () => undefined
  try {
    await request(fixture.manifest, 'supervisor-start', { parallel: 1 })
    const create = await request(fixture.manifest, 'supervisor-next')
    await request(fixture.manifest, 'supervisor-ack', { actionId: create.actionId })

    const completed = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    completed.tasks[0].status = 'completed'
    completed.revision += 1
    await writeFile(fixture.statePath, `${JSON.stringify(completed, null, 2)}\n`, 'utf8')
    const stop = await request(fixture.manifest, 'supervisor-next')
    assert.equal(stop.action, 'stop')

    const changed = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    changed.planDigest = 'b'.repeat(64)
    await writeFile(fixture.statePath, `${JSON.stringify(changed, null, 2)}\n`, 'utf8')
    const expected = JSON.parse(await readFile(fixture.statePath, 'utf8'))

    await assert.rejects(
      request(fixture.manifest, 'supervisor-stop', { actionId: stop.actionId }),
      /actionId|planDigest/u,
    )
    assert.deepEqual(JSON.parse(await readFile(fixture.statePath, 'utf8')), expected)
  } finally {
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('blocked、failed、cancelled workflow 都不能把 stop 保存为 completed', async () => {
  for (const terminalStatus of ['blocked', 'failed', 'cancelled']) {
    const fixture = await supervisorControlFixture()
    try {
      await request(fixture.manifest, 'supervisor-start', { parallel: 1 })
      const completed = JSON.parse(await readFile(fixture.statePath, 'utf8'))
      completed.tasks[0].status = 'completed'
      completed.revision += 1
      await writeFile(fixture.statePath, `${JSON.stringify(completed, null, 2)}\n`, 'utf8')
      const stop = await request(fixture.manifest, 'supervisor-next')
      assert.equal(stop.action, 'stop')

      const terminal = JSON.parse(await readFile(fixture.statePath, 'utf8'))
      terminal.status = terminalStatus
      terminal.revision += 1
      await writeFile(fixture.statePath, `${JSON.stringify(terminal, null, 2)}\n`, 'utf8')
      const terminalExpected = JSON.parse(await readFile(fixture.statePath, 'utf8'))
      await assert.rejects(
        request(fixture.manifest, 'supervisor-stop', { actionId: stop.actionId }),
        new RegExp(`running|${terminalStatus}|actionId`, 'u'),
      )
      assert.deepEqual(JSON.parse(await readFile(fixture.statePath, 'utf8')), terminalExpected)
    } finally {
      await fixture.runtime.dispose()
      await rm(fixture.root, { recursive: true, force: true })
    }
  }
})

test('cancel 结算活动记录、清理临时分支与 worktree，并幂等保留审计状态', async () => {
  const fixture = await supervisorControlFixture({ materializeWorkflow: true })
  const queueReservations = fixture.runtime.queueSupervisorReservations.bind(fixture.runtime)
  fixture.runtime.queueSupervisorReservations = () => undefined
  try {
    await request(fixture.manifest, 'supervisor-start', { parallel: 1 })
    const create = await request(fixture.manifest, 'supervisor-next')
    await request(fixture.manifest, 'supervisor-ack', { actionId: create.actionId })

    const active = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    active.ownerRuns['T1:api'] = {
      status: 'running',
      taskId: 'T1',
      ownerId: 'api',
      branch: `dsh/owner/${active.id}/api`,
      worktree: join(active.root, '.dsh-workflow', 'worktrees', active.id, 'owners', 'api'),
    }
    await writeFile(fixture.statePath, `${JSON.stringify(active, null, 2)}\n`, 'utf8')

    const cancelled = await fixture.runtime.cancelWorkflow(fixture.agent, fixture.state.id)
    assert.equal(cancelled.status, 'cancelled')
    assert.equal(typeof cancelled.cancelledAt, 'string')
    assert.equal(cancelled.cancelledBy, fixture.agent.session.id)
    assert.equal(cancelled.temporaryArtifactsCleaned, true)
    assert.equal(typeof cancelled.temporaryArtifactsCleanedAt, 'string')

    const saved = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.deepEqual(
      saved.tasks.map(task => ({ taskId: task.taskId, status: task.status, reason: task.reason, action: task.action })),
      [{ taskId: 'T1', status: 'stopped', reason: 'decision_required', action: 'await_user' }],
    )
    assert.equal(saved.ownerRuns['T1:api'].status, 'stopped')
    assert.equal(saved.ownerRuns['T1:api'].reason, 'decision_required')
    assert.equal(saved.ownerRuns['T1:api'].action, 'await_user')
    assert.equal(saved.supervisorOutbox['T1:api'].status, 'stopped')
    assert.equal(saved.supervisorOutbox['T1:api'].actionId, create.actionId)

    assert.equal(existsSync(fixture.state.workflowWorktree), false)
    assert.deepEqual(await listBranches(fixture.root, fixture.state.workflowBranch), [])

    const status = await fixture.runtime.status(fixture.agent, fixture.state.id, { ensureBridge: false, detail: true })
    assert.equal(status.workflow.status, 'cancelled')
    assert.equal(status.workflow.temporaryArtifactsCleaned, true)
    assert.equal(status.workflow.supervisorOutbox['T1:api'].actionId, create.actionId)
    assert.equal(status.logs.filter(entry => entry.event === 'workflow.cancelled').length, 1)
    assert.equal(status.logs.filter(entry => entry.event === 'workflow.temporary-artifacts-cleaned').length, 1)
    const cancelledManifest = await fixture.runtime.ensureControlBridge(fixture.agent, saved)
    await assert.rejects(request(cancelledManifest, 'supervisor-next'), /running|cancelled/u)
    await fixture.runtime.closeControlBridge(fixture.state.id)
    await assert.rejects(
      fixture.runtime.approvePlan(fixture.agent, fixture.state.id, active.planDigest, active.plan.registryDigest),
      /cancelled/u,
    )

    const ownerCalls = []
    fixture.runtime.runExternalOwner = async (...args) => { ownerCalls.push(args) }
    queueReservations(fixture.agent, fixture.state.id, ['T1:api'])
    await waitForCondition(() => fixture.runtime.supervisorDispatches.size === 0, 'cancelled reservation 停止重放')
    assert.deepEqual(ownerCalls, [])

    const beforeRepeat = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    const repeated = await fixture.runtime.cancelWorkflow(fixture.agent, fixture.state.id)
    const afterRepeat = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.equal(repeated.status, 'cancelled')
    assert.deepEqual(afterRepeat, beforeRepeat)
  } finally {
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('cancel 的持久路径记录异常时 fail-closed，不能删除项目根目录或基础分支', async () => {
  const fixture = await supervisorControlFixture()
  try {
    await assert.rejects(
      fixture.runtime.cancelWorkflow(fixture.agent, fixture.state.id),
      /worktree 不属于当前 workflow/u,
    )
    assert.equal(existsSync(fixture.root), true)
    assert.equal(await readFile(join(fixture.root, 'README.md'), 'utf8'), 'Supervisor 控制桥测试\n')
    const branches = await listBranches(fixture.root, 'main')
    assert.deepEqual(branches, ['main'])
    const saved = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.equal(saved.status, 'cancelled')
    assert.equal(saved.cleanupPending, true)
    assert.equal(saved.cleanupKind, 'cancel-discard')
    assert.equal(saved.temporaryArtifactsCleaned, undefined)
  } finally {
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('cancelled workflow 拒绝 Supervisor start，finalized workflow 拒绝 cancel', async () => {
  const fixture = await supervisorControlFixture({ materializeWorkflow: true })
  try {
    await fixture.runtime.cancelWorkflow(fixture.agent, fixture.state.id)
    const cancelledState = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    const cancelledManifest = await fixture.runtime.ensureControlBridge(fixture.agent, cancelledState)
    await assert.rejects(
      request(cancelledManifest, 'supervisor-start', { parallel: 1 }),
      /cancelled/u,
    )
    await fixture.runtime.closeControlBridge(fixture.state.id)

    const finalized = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    finalized.status = 'completed'
    finalized.finalized = true
    finalized.finalizedAt = new Date().toISOString()
    finalized.revision += 1
    await writeFile(fixture.statePath, `${JSON.stringify(finalized, null, 2)}\n`, 'utf8')
    const expected = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    await assert.rejects(
      fixture.runtime.cancelWorkflow(fixture.agent, fixture.state.id),
      /finalized|最终完成|已完成清理/u,
    )
    assert.deepEqual(JSON.parse(await readFile(fixture.statePath, 'utf8')), expected)
  } finally {
    await fixture.runtime.dispose()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('启用 Owner 工作模式后，主会话写入会被拒绝', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-mode-'))
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
    await git(root, ['config', 'user.name', 'Owner Workflow Test'])
    await writeFile(join(root, 'README.md'), '测试\n', 'utf8')
    await git(root, ['add', 'README.md'])
    await git(root, ['commit', '-m', '初始化测试仓库'])
    const agent = { id: 'main-agent', session: { id: 'main-agent', header: { cwd: root } } }

    const enabled = await runtime.modeEnable(agent)
    assert.equal(enabled.enabled, true)
    assert.match(
      runtime.checkToolExecution({ agent, name: 'write', arguments: {} }),
      /Owner 工作模式已启用/u,
    )
    assert.equal(runtime.checkToolExecution({ agent, name: 'read', arguments: {} }), undefined)
    assert.equal(runtime.checkToolExecution({ agent, name: 'ask_user_question', arguments: {} }), undefined)
    const decision = runtime.checkFilesystemWrite(
      { displayPath: join(root, 'README.md') },
      { agent },
      {},
    )
    assert.equal(decision.kind, 'deny')

    const disabled = await runtime.modeDisable(agent)
    assert.equal(disabled.enabled, false)
    assert.equal(runtime.checkToolExecution({ agent, name: 'write', arguments: {} }), undefined)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('只读审计在脏工作区中运行，不创建 workflow 分支或 worktree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-audit-'))
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
    await git(root, ['config', 'user.name', 'Owner Workflow Test'])
    await writeFile(join(root, 'README.md'), '审计测试\n', 'utf8')
    await git(root, ['add', 'README.md'])
    await git(root, ['commit', '-m', '初始化审计测试'])
    await writeFile(join(root, 'README.md'), '审计测试，包含未提交现场\n', 'utf8')

    const calls = []
    runtime.runChild = async (...args) => {
      calls.push(args)
      return '发现一项可优化项：补充报警去重测试。'
    }
    const agent = {
      id: 'audit-agent',
      session: { id: 'audit-agent', header: { cwd: root } },
      ctx: { get: name => name === 'agentPresets' ? { composedPreset: () => 'owner-workflow' } : undefined },
    }
    const result = await runtime.auditWorkspace(agent, '只读审计报警系统，不修改代码', undefined)

    assert.equal(result.contract, 'DSH_READ_ONLY_AUDIT_RESULT_V1')
    assert.match(result.report, /报警去重测试/u)
    assert.equal(calls.length, 1)
    assert.equal(calls[0][1], result.root)
    assert.equal(calls[0][4].role, 'reviewer')
    assert.match(calls[0][2], /未提交改动/u)
    assert.deepEqual(await statusRecords(root), [{ code: ' M', path: 'README.md' }])
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('workflow_recover 可以重建旧缺陷遗留的空 Supervisor task records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-task-state-repair-'))
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
    await git(root, ['config', 'user.name', 'Owner Workflow Test'])
    await writeFile(join(root, 'README.md'), '任务状态恢复测试\n', 'utf8')
    await git(root, ['add', 'README.md'])
    await git(root, ['commit', '-m', '初始化任务状态恢复测试'])
    await runtime.prepareRoot(root)
    const agent = { id: 'task-state-repair-agent', session: { id: 'task-state-repair-agent', header: { cwd: root } } }
    const resolvedRoot = await runtime.resolveRoot(agent)
    const workflowId = 'wf-task-state-repair'
    const plan = {
      contract: 'DSH_PLAN_V2',
      registryDigest: 'a'.repeat(64),
      summary: '重建任务状态',
      owners: [{ id: 'docs', name: '文档 Owner', description: '负责文档', scope: ['README.md'], exclude: [] }],
      verifications: [{ id: 'check', run: ['git', 'diff', '--check'] }],
      tasks: [{
        id: 'T1',
        role: 'work',
        ownerId: 'docs',
        title: '更新文档',
        dependsOn: [],
        write: ['README.md'],
        verify: ['check'],
        done: ['文档更新完成'],
      }],
    }
    const state = {
      contract: 'DSH_WORKFLOW_STATE_V1',
      id: workflowId,
      root: resolvedRoot,
      baseBranch: 'main',
      baseHead: await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).then(result => result.stdout.trim()),
      baseRef: 'main',
      workflowBranch: `dsh/workflow/${workflowId}`,
      workflowWorktree: resolvedRoot,
      status: 'failed',
      error: 'Supervisor 任务状态数量与计划不一致',
      plan,
      planDigest: createHash('sha256').update(JSON.stringify(plan)).digest('hex'),
      registryDigest: plan.registryDigest,
      tasks: [],
      ownerRuns: {},
      ownerSessions: {},
    }
    await writeFile(join(root, '.dsh-workflow', 'workflows', `${workflowId}.json`), `${JSON.stringify(state, null, 2)}\n`, 'utf8')

    const recovered = await runtime.recoverWorkflow(agent, workflowId)
    assert.match(recovered.nextAction, /任务状态已重建|workflow_plan_review/u)
    const saved = JSON.parse(await readFile(join(root, '.dsh-workflow', 'workflows', `${workflowId}.json`), 'utf8'))
    assert.equal(saved.status, 'planned')
    assert.deepEqual(saved.tasks.map(task => [task.taskId, task.status]), [['T1', 'pending']])
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('只读子代理继承完整工具集并只设置 read-only 沙箱', async () => {
  const sandboxEvents = []
  const preStepListeners = []
  const child = {
    id: 'scoped-reviewer-child',
    session: {
      events: [],
      append(type, data) {
        this.events.push({ type, data })
        if (type === 'sandbox/mode' || type === 'approval/policy') sandboxEvents.push({ type, data })
      },
    },
    followup() {},
    async whenIdle() {
      for (const listener of preStepListeners) {
        await listener({ agent: child }, async () => ({ kind: 'enter' }))
      }
      child.session.events.push({ type: 'turn/end', data: { reason: { kind: 'completed' } } })
    },
  }
  const childContext = {
    agent: child,
    on(name, listener) {
      if (name === 'agent/pre-step') preStepListeners.push(listener)
      return () => {}
    },
    get(name) {
      if (name === 'agentPresets') return { composeFrom() {} }
      return undefined
    },
    tools: { schemas: () => [{ name: 'read' }, { name: 'write' }, { name: 'skill' }] },
    systemPrompt: { section() {} },
  }
  const parent = {
    session: { id: 'scoped-reviewer-parent', header: {} },
    options: {},
    ctx: {
      agents: {
        async create(options) {
          options.setup(childContext)
          return { agent: child, async dispose() {} }
        },
      },
    },
  }
  const providers = new Map()
  const subagents = {
    registerProvider(provider) {
      providers.set(provider.name, provider)
      return () => providers.delete(provider.name)
    },
    async start(name, request) {
      return providers.get(name).start({
        ...request,
        descriptor: { version: 2, mode: 'one-shot', provider: name, label: request.label },
      })
    },
  }
  const runtime = createOwnerWorkflowRuntime({ subagents }, {})
  const disposeProvider = runtime.registerChildProvider()
  try {
    await runtime.runChild(parent, '/workspace', '只读测试', undefined, { role: 'reviewer' })
    assert.deepEqual(sandboxEvents, [
      { type: 'sandbox/mode', data: { mode: 'read-only' } },
      { type: 'approval/policy', data: { policy: 'never', source: 'delegation' } },
    ])
    assert.deepEqual(child.session.events.find(event => event.type === 'subagent/descriptor')?.data, {
      version: 2,
      mode: 'one-shot',
      provider: runtime.childProviderName,
      label: 'Owner Workflow reviewer',
    })
  } finally {
    disposeProvider()
    await runtime.dispose()
  }
})

test('Owner 子代理策略继承完整工具并使用 workspace-write', async () => {
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    assert.deepEqual(runtime.childCapabilityPolicy('owner'), {
      inheritTools: true,
      sandboxMode: 'workspace-write',
    })
  } finally {
    await runtime.dispose()
  }
})

test('Operation 子代理继承完整工具但项目文件使用 read-only 沙箱', async () => {
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    assert.deepEqual(runtime.childCapabilityPolicy('operator'), {
      inheritTools: true,
      sandboxMode: 'read-only',
    })
  } finally {
    await runtime.dispose()
  }
})

test('历史 V1 计划即使 digest 匹配也不能批准执行', async () => {
  const { root, runtime, agent, state } = await planApprovalFixture()
  try {
    await assert.rejects(runtime.approvePlan(agent, state.id, 'wrong-digest', state.registryDigest), /计划 digest 不匹配/u)
    await assert.rejects(runtime.approvePlan(agent, state.id, state.planDigest, 'b'.repeat(64)), /Registry digest 不匹配/u)
    await assert.rejects(
      runtime.approvePlan(agent, state.id, state.planDigest, state.registryDigest),
      /DSH_PLAN_V2|V1.*不能|计划契约/u,
    )
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('计划批准拒绝缺失的 live Registry，即使缓存 digest 匹配', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-approval-missing-registry-'))
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
    await git(root, ['config', 'user.name', 'Owner Workflow Test'])
    await writeFile(join(root, 'README.md'), '测试\n', 'utf8')
    await git(root, ['add', 'README.md'])
    await git(root, ['commit', '-m', '初始化测试仓库'])
    await runtime.prepareRoot(root)
    const plan = {
      contract: 'DSH_PLAN_V1',
      summary: '缺失 Registry 审批测试',
      owners: [{ id: 'approval-owner', name: '审批 Owner', description: '审批测试', scope: ['README.md'], exclude: [] }],
      stages: [{ id: 'stage-1', name: '审批阶段', dependsOn: [], tasks: [{ id: 'task-1', ownerId: 'approval-owner', title: '测试', description: '测试', files: ['README.md'] }] }],
    }
    const planDigest = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
    const registryDigest = 'a'.repeat(64)
    const state = {
      contract: 'DSH_WORKFLOW_STATE_V1',
      id: 'wf-approval-missing-registry',
      root,
      baseBranch: 'main',
      baseRef: 'HEAD',
      workflowBranch: 'dsh/workflow/wf-approval-missing-registry',
      workflowWorktree: join(root, '.dsh-workflow', 'worktrees', 'wf-approval-missing-registry', 'workflow'),
      status: 'planned',
      plan,
      planDigest,
      registryDigest,
      planApproved: false,
      planReview: { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '通过', issues: [] },
      planReviewDigest: planDigest,
      completedStages: [],
      stageResults: [],
      ownerRuns: {},
    }
    await writeFile(join(root, '.dsh-workflow', 'workflows', `${state.id}.json`), `${JSON.stringify(state)}\n`, 'utf8')
    const agent = { id: 'approval-agent', session: { id: 'approval-agent', header: { cwd: root } } }

    await assert.rejects(
      runtime.approvePlan(agent, state.id, planDigest, registryDigest),
      /Owner Registry|Registry|ENOENT|无法读取/u,
    )
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('计划批准拒绝 live Registry 内容漂移，并由 registry_status 暴露 live digest', async () => {
  const { root, runtime, agent, state, registry: original } = await planApprovalFixture()
  try {
    const changed = await applyRegistryOperation(state.workflowWorktree, original, addOwnerOperation('drift-owner'))
    const liveDigest = registryContentDigest(changed)
    assert.notEqual(liveDigest, state.registryDigest)

    const status = await runtime.registryStatus(agent, state.id)
    assert.equal(status.registryDigest, liveDigest)
    assert.equal(status.boundRegistryDigest, state.registryDigest)
    await assert.rejects(
      runtime.approvePlan(agent, state.id, state.planDigest, state.registryDigest),
      /Registry.*漂移|Registry digest 不匹配/u,
    )
    const saved = JSON.parse(await readFile(join(root, '.dsh-workflow', 'workflows', `${state.id}.json`), 'utf8'))
    assert.equal(saved.status, 'planned')
    assert.equal(saved.planApproved, false)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('计划批准在 digest 已重新绑定时仍拒绝 Owner 定义漂移', async () => {
  const { root, runtime, agent, state, registry: original } = await planApprovalFixture()
  try {
    let changed = await applyRegistryOperation(state.workflowWorktree, original, {
      type: 'remove',
      ownerId: state.plan.owners[0].id,
      reason: '准备替换 Owner 定义',
    })
    changed = await applyRegistryOperation(state.workflowWorktree, changed, {
      type: 'add',
      owner: { ...state.plan.owners[0], description: '已经漂移的正式职责定义' },
      reason: '写入漂移后的 Owner 定义',
    })
    const liveDigest = registryContentDigest(changed)
    state.registryDigest = liveDigest
    await writeFile(
      join(root, '.dsh-workflow', 'workflows', `${state.id}.json`),
      `${JSON.stringify(state, null, 2)}\n`,
      'utf8',
    )

    await assert.rejects(
      runtime.approvePlan(agent, state.id, state.planDigest, liveDigest),
      /Owner plan-owner.*Registry 定义不匹配/u,
    )
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('finalize 会把 workflow 分支合并回启动分支并清理 worktree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-finalize-'))
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
    await git(root, ['config', 'user.name', 'Owner Workflow Test'])
    await writeFile(join(root, 'README.md'), '初始\n', 'utf8')
    await git(root, ['add', 'README.md'])
    await git(root, ['commit', '-m', '初始化测试仓库'])
    await runtime.prepareRoot(root)
    const workflowId = 'wf-finalize-test'
    const workflowBranch = 'dsh/workflow/wf-finalize-test'
    const workflowWorktree = join(root, '.dsh-workflow', 'worktrees', workflowId, 'workflow')
    await git(root, ['worktree', 'add', '-b', workflowBranch, workflowWorktree, 'HEAD'])
    await writeFile(join(workflowWorktree, 'README.md'), '已交付\n', 'utf8')
    await git(workflowWorktree, ['add', 'README.md'])
    await git(workflowWorktree, ['commit', '-m', 'Owner 修改'])
    const workflowHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: workflowWorktree, encoding: 'utf8' })).stdout.trim()
    const plan = {
      contract: 'DSH_PLAN_V2',
      registryDigest: 'a'.repeat(64),
      summary: 'finalize 测试',
      owners: [{ id: 'finalize-owner', name: '交付 Owner', description: '交付测试', scope: ['README.md'], exclude: [] }],
      verifications: [{ id: 'unit', run: ['node', '--test'] }],
      tasks: [{
        id: 'T1',
        role: 'work',
        ownerId: 'finalize-owner',
        title: '交付任务',
        dependsOn: [],
        write: ['README.md'],
        verify: ['unit'],
        done: ['交付完成'],
      }],
    }
    const state = {
      contract: 'DSH_WORKFLOW_STATE_V1',
      id: workflowId,
      root,
      baseBranch: 'main',
      baseRef: 'HEAD',
      workflowBranch,
      workflowWorktree,
      status: 'completed',
      tasks: createTaskState(plan).map(task => ({ ...task, status: 'completed' })),
      workflowHead,
      ownerRuns: {},
      plan,
      planApproved: true,
      implementationReview: { contract: 'DSH_IMPLEMENTATION_REVIEW_V1', status: 'passed', summary: '已审查', issues: [] },
      implementationReviewHead: workflowHead,
    }
    await writeFile(join(root, '.dsh-workflow', 'workflows', `${workflowId}.json`), `${JSON.stringify(state)}\n`, 'utf8')
    const agent = { id: 'finalize-agent', session: { id: 'finalize-agent', header: { cwd: root } } }
    const result = await runtime.finalizeWorkflow(agent, workflowId)
    assert.equal(result.finalized, true)
    assert.equal(await readFile(join(root, 'README.md'), 'utf8'), '已交付\n')
    const branches = await execFileAsync('git', ['branch', '--list', workflowBranch], { cwd: root, encoding: 'utf8' })
    assert.equal(branches.stdout.trim(), '')
    await assert.rejects(readFile(workflowWorktree), /ENOENT/u)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('Implementation Review 必须读取实际 workflow HEAD 并保存审查结果', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-implementation-review-'))
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
    await git(root, ['config', 'user.name', 'Owner Workflow Test'])
    await writeFile(join(root, 'README.md'), '初始\n', 'utf8')
    await git(root, ['add', 'README.md'])
    await git(root, ['commit', '-m', '初始化测试仓库'])
    const baseHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })).stdout.trim()
    const workflowId = 'wf-implementation-review'
    const workflowBranch = `dsh/workflow/${workflowId}`
    const workflowWorktree = join(root, '.dsh-workflow', 'worktrees', workflowId, 'workflow')
    await runtime.prepareRoot(root)
    await git(root, ['worktree', 'add', '-b', workflowBranch, workflowWorktree, 'HEAD'])
    await writeFile(join(workflowWorktree, 'README.md'), '已实现\n', 'utf8')
    await git(workflowWorktree, ['add', 'README.md'])
    await git(workflowWorktree, ['commit', '-m', '完成实现'])
    const workflowHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: workflowWorktree, encoding: 'utf8' })).stdout.trim()
    const plan = {
      contract: 'DSH_PLAN_V2',
      registryDigest: 'a'.repeat(64),
      summary: '实现审查计划',
      owners: [{ id: 'review-owner', name: '审查 Owner', description: '审查', scope: ['README.md'], exclude: [] }],
      verifications: [{ id: 'unit', run: ['node', '--test'] }],
      tasks: [{
        id: 'T1',
        role: 'work',
        ownerId: 'review-owner',
        title: '任务',
        dependsOn: [],
        write: ['README.md'],
        verify: ['unit'],
        done: ['完成'],
      }],
    }
    const state = {
      contract: 'DSH_WORKFLOW_STATE_V1',
      id: workflowId,
      root,
      baseBranch: 'main',
      baseHead,
      baseRef: 'main',
      workflowBranch,
      workflowWorktree,
      status: 'completed',
      tasks: createTaskState(plan).map(task => ({ ...task, status: 'completed' })),
      workflowHead,
      ownerRuns: {},
      plan,
    }
    const agent = { id: 'implementation-review-agent', session: { id: 'implementation-review-agent', header: { cwd: root } } }
    state.root = await runtime.resolveRoot(agent)
    await writeFile(join(root, '.dsh-workflow', 'workflows', `${workflowId}.json`), `${JSON.stringify(state)}\n`, 'utf8')
    runtime.runChild = async () => ({
      contract: 'DSH_IMPLEMENTATION_REVIEW_V1',
      status: 'passed',
      summary: '实际 diff 通过',
      issues: [],
    })
    const result = await runtime.implementationReview(agent, workflowId)
    assert.equal(result.review.status, 'passed')
    assert.match(result.workflow.implementationReviewHead, /^[0-9a-f]{40}$/u)
    const saved = JSON.parse(await readFile(join(root, '.dsh-workflow', 'workflows', `${workflowId}.json`), 'utf8'))
    assert.equal(saved.implementationReview.status, 'passed')
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test.skip('旧版 Owner 持久子线程兼容测试（已由按任务回收模型替代）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-continuable-'))
  const children = new Map()
  const owner = {
    id: 'persistent-owner',
    name: '持久 Owner',
    description: '验证持久会话',
    scope: ['README.md'],
    exclude: [],
  }
  const parent = {
    id: 'parent-session',
    options: { provider: 'mock', model: 'mock' },
    session: { header: { id: 'parent-session', cwd: root, delegationDepth: 0 } },
    ctx: {
      tools: {
        schemas: () => [{ name: 'read' }],
      },
    },
  }
  let followups = 0
  const ctx = {
    agents: { get: id => children.get(id) },
    subagents: {
      async startContinuable() {
        const child = {
          id: 'owner-session-1',
          status: 'idle',
          session: { events: [] },
          whenIdle: async () => {},
        }
        children.set(child.id, child)
        runtime.onAgentCreated(child)
        child.session.events.push({
          type: 'assistant/message',
          data: { message: { content: [{ type: 'text', text: JSON.stringify({
            contract: 'DSH_OWNER_RESULT_V1',
            status: 'completed',
            summary: '第一阶段完成',
          }) }] } },
        })
        return { childId: child.id, messageId: 'message-1' }
      },
      async followup(_parent, childId) {
        followups += 1
        const child = children.get(childId)
        child.session.events.push({
          type: 'assistant/message',
          data: { message: { content: [{ type: 'text', text: JSON.stringify({
            contract: 'DSH_OWNER_RESULT_V1',
            status: 'completed',
            summary: '第二阶段完成',
          }) }] } },
        })
        return 'message-2'
      },
    },
  }
  const runtime = createOwnerWorkflowRuntime(ctx, {})
  try {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
    await git(root, ['config', 'user.name', 'Owner Workflow Test'])
    await writeFile(join(root, 'README.md'), '测试\n', 'utf8')
    await git(root, ['add', 'README.md'])
    await git(root, ['commit', '-m', '初始化测试仓库'])
    await runtime.prepareRoot(root)
    const state = {
      contract: 'DSH_WORKFLOW_STATE_V1',
      id: 'wf-continuable-test',
      root,
      workflowBranch: 'dsh/workflow/wf-continuable-test',
      ownerSessions: {
        [owner.id]: {
          ownerId: owner.id,
          childId: 'legacy-owner-session',
          createdAt: new Date(0).toISOString(),
        },
      },
      ownerRuns: {},
      plan: { owners: [owner], stages: [] },
    }
    await writeFile(join(root, '.dsh-workflow', 'workflows', `${state.id}.json`), `${JSON.stringify(state)}\n`, 'utf8')
    const firstStage = { id: 'stage-1', name: '第一阶段', tasks: [{ ownerId: owner.id }] }
    const secondStage = { id: 'stage-2', name: '第二阶段', tasks: [{ ownerId: owner.id }] }
    const firstEntry = { owner, branch: 'dsh/owner/wf-continuable-test/stage-1/a1/persistent-owner', worktree: root, stageId: firstStage.id }
    const secondEntry = { owner, branch: 'dsh/owner/wf-continuable-test/stage-2/a1/persistent-owner', worktree: root, stageId: secondStage.id }
    const first = await runtime.runOwnerContinuable(parent, state, firstStage, firstEntry, '执行第一阶段', undefined, {
      ownerKey: 'wf-continuable-test:persistent-owner',
      owner,
      worktree: root,
      workflowRoot: root,
      workflowId: state.id,
      stageId: firstStage.id,
    })
    const second = await runtime.runOwnerContinuable(parent, state, secondStage, secondEntry, '执行第二阶段', undefined, {
      ownerKey: 'wf-continuable-test:persistent-owner',
      owner,
      worktree: root,
      workflowRoot: root,
      workflowId: state.id,
      stageId: secondStage.id,
    })
    assert.equal(first.sessionId, 'owner-session-1')
    assert.equal(second.sessionId, first.sessionId)
    assert.equal(followups, 1)
    assert.equal(state.ownerSessions[owner.id].childId, 'owner-session-1')
    assert.equal(state.ownerSessions[owner.id].replacedChildId, 'legacy-owner-session')
    assert.equal(typeof state.ownerSessions[owner.id].toolFilterVersion, 'string')
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test.skip('旧版 Owner Shell 白名单测试（已由 worktree 与提交关卡替代）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-shell-'))
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    const owner = { id: 'shell-owner', name: 'Shell Owner', description: 'Shell 审查', scope: ['src/**'], exclude: [] }
    runtime.activeOwners.set('owner-session', {
      owner,
      worktree: root,
      workflowRoot: root,
      ownerKey: 'wf:shell-owner',
    })
    const agent = { id: 'owner-session', session: { id: 'owner-session', header: { cwd: root } } }
    assert.match(
      runtime.checkToolExecution({ agent, name: 'bash', arguments: { command: 'git add .' } }),
      /拒绝|必须显式指定|不能调用/u,
    )
    assert.match(
      runtime.checkToolExecution({ agent, name: 'bash', arguments: { command: 'printf x > src/a.ts' } }),
      /拒绝|必须显式指定|不能调用/u,
    )
    assert.match(
      runtime.checkToolExecution({ agent, name: 'bash', arguments: { command: 'git status' } }),
      /不能调用/u,
    )
    assert.match(
      runtime.checkToolExecution({ agent, name: 'bash', arguments: { command: 'git add src/a.ts', workdir: root } }),
      /不能调用/u,
    )
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test.skip('旧版 Owner 逐写入包装测试（已由提交关卡替代）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-protected-write-'))
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    const owner = { id: 'wide-owner', name: '宽范围 Owner', description: '覆盖全部业务文件', scope: ['**'], exclude: [] }
    runtime.activeOwners.set('wide-owner-session', {
      owner,
      worktree: root,
      workflowRoot: root,
      workflowId: 'wf-protected-write',
      stageId: 'stage-1',
      ownerKey: `${root}:wide-owner`,
    })
    const exec = { agent: { id: 'wide-owner-session', session: { id: 'wide-owner-session' } } }

    await assert.rejects(
      runtime.ownerWrite({
        file_path: '.owner-workflow/config.json',
        content: '{}\n',
        description: '尝试改 Registry',
      }, exec),
      /受保护路径.*\.owner-workflow/u,
    )
    await assert.rejects(
      runtime.ownerEdit({
        file_path: '.owner-workflow/owners/wide-owner.md',
        old_string: '旧定义',
        new_string: '新定义',
        description: '尝试编辑 Registry Owner',
      }, exec),
      /受保护路径.*\.owner-workflow/u,
    )
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test.skip('旧版 owner_bash 快照测试（正式验证现在由 owner_submit 自动执行）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-bash-sandbox-'))
  await git(root, ['init', '-b', 'main'])
  await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
  await git(root, ['config', 'user.name', 'Owner Workflow Test'])
  await writeFile(join(root, 'README.md'), '一次性副本测试\n', 'utf8')
  await git(root, ['add', 'README.md'])
  await git(root, ['commit', '-m', '初始化一次性副本测试'])
  const calls = []
  const runtime = createOwnerWorkflowRuntime({
    shell: {
      sandboxMode: 'workspace-write',
      resolve(spec) {
        calls.push(spec)
        return spec
      },
      async run(spec) {
        return { kind: 'foreground', ok: true, spec, sandbox: { enforcement: 'full' } }
      },
    },
    sandbox: {},
    sandboxPolicy: {},
  }, {})
  try {
    const owner = { id: 'bash-owner', name: 'Bash Owner', description: '沙箱测试', scope: ['src/**'], exclude: [] }
    runtime.activeOwners.set('bash-session', { owner, worktree: root, workflowRoot: root, ownerKey: 'wf:bash-owner' })
    const result = await runtime.runOwnerShell(
      { command: 'git status', description: '检查工作树' },
      { agent: { id: 'bash-session', session: { id: 'bash-session' } }, signal: new AbortController().signal },
    )
    assert.equal(result.ok, true)
    assert.notEqual(calls[0].workdir, root)
    assert.match(calls[0].workdir, /dsh-owner-shell-bash-owner-[^/]+\/workspace$/u)
    assert.deepEqual(calls[0].sandboxPolicy, { mode: 'workspace-write', workspaceRoot: calls[0].workdir, sessionId: 'bash-session' })
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test.skip('旧版多轮修复提示测试（现在由 owner_submit 在同一子线程返回错误）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-repair-'))
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
    await git(root, ['config', 'user.name', 'Owner Workflow Test'])
    await writeFile(join(root, 'README.md'), '测试\n', 'utf8')
    await git(root, ['add', 'README.md'])
    await git(root, ['commit', '-m', '初始化测试仓库'])
    await runtime.prepareRoot(root)
    const workflowBranch = 'dsh/workflow/wf-owner-repair'
    const workflowWorktree = join(root, '.dsh-workflow', 'worktrees', 'wf-owner-repair', 'workflow')
    await git(root, ['worktree', 'add', '-b', workflowBranch, workflowWorktree, 'HEAD'])
    const ownerBranch = 'dsh/owner/wf-owner-repair/stage-1/a1/repair-owner'
    const ownerWorktree = join(root, '.dsh-workflow', 'worktrees', 'wf-owner-repair', 'stage-1-a1-repair-owner')
    await git(root, ['worktree', 'add', '-b', ownerBranch, ownerWorktree, workflowBranch])
    const owner = { id: 'repair-owner', name: '修复 Owner', description: '修复测试', scope: ['src/**'], exclude: [] }
    const stage = { id: 'stage-1', name: '修复阶段', dependsOn: [], tasks: [{ id: 'task-1', ownerId: owner.id, title: '修复', description: '修复' }] }
    const state = {
      contract: 'DSH_WORKFLOW_STATE_V1',
      id: 'wf-owner-repair',
      root,
      workflowBranch,
      workflowWorktree,
      status: 'running',
      plan: { owners: [owner], stages: [stage] },
      ownerRuns: {},
      ownerSessions: {},
      completedStages: [],
      stageResults: [],
    }
    await writeFile(join(root, '.dsh-workflow', 'workflows', `${state.id}.json`), `${JSON.stringify(state)}\n`, 'utf8')
    let turns = 0
    runtime.runOwnerContinuable = async () => {
      turns += 1
      await mkdir(join(ownerWorktree, 'src'), { recursive: true })
      await writeFile(join(ownerWorktree, 'src', 'ok.ts'), 'export const ok = true\n', 'utf8')
      if (turns === 1) {
        await writeFile(join(ownerWorktree, 'outside.txt'), '越界\n', 'utf8')
      } else {
        await rm(join(ownerWorktree, 'outside.txt'), { force: true })
      }
      return {
        sessionId: 'repair-session',
        output: JSON.stringify({
          contract: 'DSH_OWNER_RESULT_V1',
          status: 'completed',
          summary: turns === 1 ? '第一次完成但有越界文件' : '修复完成',
          changes: [{ summary: '修改 src/ok.ts', files: ['src/ok.ts'], tests: [] }],
          tests: [],
        }),
      }
    }
    const result = await runtime.runOwnerEntry(
      { id: 'parent', session: { id: 'parent', header: { cwd: root } } },
      state,
      stage,
      { owner, tasks: stage.tasks, branch: ownerBranch, worktree: ownerWorktree, stageId: stage.id },
    )
    assert.equal(turns, 2)
    assert.deepEqual(result.changedFiles, ['src/ok.ts'])
    assert.equal(result.ahead, 1)
    assert.equal((await statusRecordsForTest(ownerWorktree)).length, 0)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test.skip('旧版 Owner 结果文本结算测试（受保护路径由 owner_submit 提交关卡覆盖）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-protected-shell-'))
  const runtime = createOwnerWorkflowRuntime({}, { maxOwnerRepairTurns: 0 })
  let ownerWorktree
  try {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
    await git(root, ['config', 'user.name', 'Owner Workflow Test'])
    await writeFile(join(root, 'README.md'), 'Registry 保护测试\n', 'utf8')
    await git(root, ['add', 'README.md'])
    await git(root, ['commit', '-m', '初始化测试仓库'])
    await ensureRegistry(root)
    await git(root, ['commit', '-m', '登记正式 Registry'])
    await runtime.prepareRoot(root)
    ownerWorktree = join(root, '.dsh-workflow', 'worktrees', 'wf-protected-shell', 'owner')
    await mkdir(join(root, '.dsh-workflow', 'worktrees', 'wf-protected-shell'), { recursive: true })
    await git(root, ['worktree', 'add', '-b', 'dsh/owner/wf-protected-shell/stage-1/a1/wide-owner', ownerWorktree, 'main'])
    const baseCommit = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: ownerWorktree, encoding: 'utf8' })).stdout.trim()
    const owner = { id: 'wide-owner', name: '宽范围 Owner', description: '覆盖全部业务文件', scope: ['**'], exclude: [] }
    const stage = {
      id: 'stage-1',
      name: 'Registry 保护阶段',
      dependsOn: [],
      tasks: [{ id: 'task-1', ownerId: owner.id, title: '业务修改', description: '不得修改 Registry', files: ['README.md'] }],
    }
    const state = {
      contract: 'DSH_WORKFLOW_STATE_V1',
      id: 'wf-protected-shell',
      root,
      workflowBranch: 'main',
      status: 'running',
      plan: { contract: 'DSH_PLAN_V1', summary: 'Registry 保护计划', owners: [owner], stages: [stage] },
      ownerRuns: {},
      ownerSessions: {},
      completedStages: [],
      stageResults: [],
    }
    await writeFile(join(root, '.dsh-workflow', 'workflows', `${state.id}.json`), `${JSON.stringify(state)}\n`, 'utf8')
    runtime.runOwnerContinuable = async () => {
      await writeFile(join(ownerWorktree, '.owner-workflow', 'config.json'), '{"tampered":true}\n', 'utf8')
      return {
        sessionId: 'wide-owner-session',
        output: JSON.stringify({
          contract: 'DSH_OWNER_RESULT_V1',
          status: 'completed',
          summary: '尝试修改 Registry',
          changes: [{ summary: '篡改 Registry', files: ['.owner-workflow/config.json'], tests: [] }],
          tests: [],
          handoffs: [],
        }),
      }
    }

    await assert.rejects(
      runtime.runOwnerEntry(
        { id: 'parent', session: { id: 'parent', header: { cwd: root } } },
        state,
        stage,
        {
          owner,
          tasks: stage.tasks,
          branch: 'dsh/owner/wf-protected-shell/stage-1/a1/wide-owner',
          worktree: ownerWorktree,
          baseCommit,
          stageId: stage.id,
        },
      ),
      /受保护文件.*\.owner-workflow|\.owner-workflow.*受保护/u,
    )
    const currentHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: ownerWorktree, encoding: 'utf8' })).stdout.trim()
    assert.equal(currentHead, baseCommit)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

async function statusRecordsForTest(cwd) {
  const result = await execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd, encoding: 'utf8' })
  return result.stdout.trim() === '' ? [] : result.stdout.trim().split('\n')
}

test('Owner Registry 提案在没有活动任务时只保存待审批提案', async () => {
  const { root, runtime, agent, state } = await registryWorkflowFixture()
  try {
    const proposal = await runtime.proposeOwnerChange(agent, state.id, addOwnerOperation())
    const saved = JSON.parse(await readFile(join(root, '.dsh-workflow', 'workflows', `${state.id}.json`), 'utf8'))
    assert.equal(saved.pendingRegistryProposal.digest, proposal.digest)
    assert.equal(saved.planApproved, true)
    const status = await runtime.registryStatus(agent, state.id)
    assert.equal(status.pendingProposal.digest, proposal.digest)
    assert.equal(status.registryDigest, state.registryDigest)
    assert.deepEqual((await loadRegistry(state.workflowWorktree)).owners, [])
    await assert.rejects(
      readFile(join(state.workflowWorktree, '.owner-workflow', 'owners', 'registry-owner.md')),
      /ENOENT/u,
    )
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('Owner 设定与批准只能由绑定的 Workflow 主线程执行', async () => {
  const { root, runtime, agent, state } = await registryWorkflowFixture()
  const otherAgent = {
    id: 'other-orchestrator',
    session: { id: 'other-orchestrator', header: { cwd: root } },
  }
  try {
    const proposal = await runtime.proposeOwnerChange(agent, state.id, addOwnerOperation('main-thread-owner'))
    const saved = JSON.parse(await readFile(join(root, '.dsh-workflow', 'workflows', `${state.id}.json`), 'utf8'))
    assert.equal(saved.orchestratorSessionId, agent.id)
    assert.equal(saved.registryProposalCreatedBy, agent.id)
    await assert.rejects(
      runtime.proposeOwnerChange(otherAgent, state.id, addOwnerOperation('other-owner')),
      /只能由 Workflow 主线程/u,
    )
    await assert.rejects(
      runtime.approveOwnerChange(otherAgent, state.id, proposal.digest),
      /只能由 Workflow 主线程/u,
    )
    const approved = await runtime.approveOwnerChange(agent, state.id, proposal.digest)
    assert.equal(approved.orchestratorSessionId, agent.id)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('规划器输出 Registry operation 时只保存结构化建议，不写正式 Registry，并由运行时绑定正式 digest', async () => {
  const { root, runtime, agent, state } = await registryWorkflowFixture()
  try {
    const operation = addOwnerOperation('planner-owner')
    let prompt
    runtime.runChild = async (_agent, _cwd, value) => {
      prompt = value
      return JSON.stringify({
        contract: 'DSH_PLAN_V2',
        registryDigest: 'b'.repeat(64),
        summary: '规划新的 Owner 职责',
        registryOperation: operation,
        owners: [operation.owner],
        verifications: [{ id: 'unit', run: ['node', '--test'] }],
        tasks: [{
          id: 'T1',
          role: 'work',
          ownerId: operation.owner.id,
          title: '规划任务',
          dependsOn: [],
          write: [`src/${operation.owner.id}/entry.mjs`],
          verify: ['unit'],
          done: ['规划任务完成'],
        }],
      })
    }
    const result = await runtime.planWorkflowState(agent, { ...state, request: '规划并建立新的 Owner 职责' })
    assertV2PlannerPrompt(prompt)
    assert.match(prompt, /Owner 是以文件范围为边界的长期代码责任域/u)
    assert.match(prompt, /绝不能根据当前 Workflow 的阶段、任务步骤/u)
    assert.match(prompt, /registryOperation 的 reason 必须说明代码依据/u)
    assert.match(prompt, /registryOperation/u)
    assert.ok(prompt.includes('禁止使用 {"type":"proposal"} 外层包装'))
    assert.deepEqual(result.registryOperation, operation)
    assert.equal(result.plan.registryDigest, state.registryDigest)
    const saved = JSON.parse(await readFile(join(root, '.dsh-workflow', 'workflows', `${state.id}.json`), 'utf8'))
    assert.deepEqual(saved.suggestedRegistryOperation, operation)
    assert.deepEqual(saved.tasks.map(task => [task.taskId, task.status]), [['T1', 'pending']])
    assert.deepEqual((await loadRegistry(state.workflowWorktree)).owners, [])
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('规划器的 proposal 包装会兼容为直接 Registry operation', async () => {
  const { root, runtime, agent, state } = await registryWorkflowFixture()
  try {
    const operation = addOwnerOperation('wrapped-owner')
    runtime.runChild = async () => ({
      contract: 'DSH_PLAN_V2',
      registryDigest: '不是摘要',
      summary: '规划新的 Owner 职责',
      registryOperation: { type: 'proposal', operation },
      owners: [operation.owner],
      verifications: [{ id: 'unit', run: ['node', '--test'] }],
      tasks: [{
        id: 'T1',
        role: 'work',
        ownerId: operation.owner.id,
        title: '规划任务',
        dependsOn: [],
        write: [`src/${operation.owner.id}/entry.mjs`],
        verify: ['unit'],
        done: ['规划任务完成'],
      }],
    })
    const result = await runtime.planWorkflowState(agent, { ...state, request: '规划并建立新的 Owner 职责' })
    assert.deepEqual(result.registryOperation, operation)
    assert.equal(result.plan.registryDigest, state.registryDigest)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('规划提交只接受当前规划子代理的一次结构化结果', async () => {
  const runtime = createOwnerWorkflowRuntime({}, {})
  const planner = { id: 'planner-submit-test', session: { id: 'planner-submit-test' } }
  try {
    runtime.agentRoles.set(planner.id, { role: 'planner', requirePlannerSubmission: true })
    const plan = { contract: 'DSH_PLAN_V2', summary: '结构化提交测试' }
    const result = runtime.submitPlannerPlan(planner, plan)
    assert.deepEqual(result, {
      contract: 'DSH_WORKFLOW_PLAN_SUBMIT_RESULT_V1',
      accepted: true,
      summary: '规划结果已接收，运行时将验证 Owner Registry、任务 DAG 与固定验证。',
    })
    assert.equal(runtime.agentRoles.get(planner.id).plannerSubmission, plan)
    assert.throws(
      () => runtime.submitPlannerPlan(planner, plan),
      /每次运行只能调用一次/u,
    )
    assert.throws(
      () => runtime.submitPlannerPlan({ id: 'not-a-planner' }, plan),
      /只能由当前规划子代理调用/u,
    )
  } finally {
    await runtime.dispose()
  }
})

test('计划审查提交只接受当前 Plan Reviewer 的合法结构化结果', async () => {
  const runtime = createOwnerWorkflowRuntime({}, {})
  const reviewer = { id: 'plan-reviewer-submit-test', session: { id: 'plan-reviewer-submit-test' } }
  try {
    runtime.agentRoles.set(reviewer.id, { role: 'plan-reviewer', requirePlanReviewSubmission: true })
    assert.throws(
      () => runtime.submitPlanReview(reviewer, {
        contract: 'DSH_PLAN_REVIEW_V1',
        status: 'failed',
        summary: '非法状态',
        issues: [],
      }),
      /计划审查状态不受支持：failed/u,
    )
    const review = {
      contract: 'DSH_PLAN_REVIEW_V1',
      status: 'needs_revision',
      summary: '需要补充验证',
      issues: [{
        severity: 'high',
        title: '缺少 Rust 验证',
        detail: '计划会修改 Rust 模块但没有 cargo test。',
        suggestion: '增加固定 Rust 测试。',
      }],
    }
    const result = runtime.submitPlanReview(reviewer, review)
    assert.deepEqual(result, {
      contract: 'DSH_WORKFLOW_PLAN_REVIEW_SUBMIT_RESULT_V1',
      accepted: true,
      status: 'needs_revision',
      summary: '计划审查结果已接收，Runtime 将绑定当前 planDigest 并持久化。',
    })
    assert.deepEqual(runtime.agentRoles.get(reviewer.id).planReviewSubmission, review)
    assert.throws(
      () => runtime.submitPlanReview(reviewer, review),
      /每次运行只能成功调用一次/u,
    )
    assert.throws(
      () => runtime.submitPlanReview({ id: 'not-plan-reviewer' }, review),
      /只能由当前计划审查子代理调用/u,
    )
  } finally {
    await runtime.dispose()
  }
})

test('计划 Reviewer 首轮状态非法时自动携带错误重试并保存结构化问题', async () => {
  const { root, runtime, agent, state } = await planApprovalFixture()
  try {
    let calls = 0
    let firstPrompt
    let retryPrompt
    runtime.runChild = async (_agent, _cwd, prompt) => {
      calls += 1
      if (calls === 1) firstPrompt = prompt
      if (calls === 2) retryPrompt = prompt
      return calls === 1
        ? {
            contract: 'DSH_PLAN_REVIEW_V1',
            status: 'failed',
            summary: '发现可修订问题',
            issues: [],
          }
        : {
            contract: 'DSH_PLAN_REVIEW_V1',
            status: 'needs_revision',
            summary: '需要补充固定验证',
            issues: [{
              severity: 'high',
              title: '缺少 Rust 验证',
              detail: '修改 Rust 模块却没有绑定固定验证。',
              suggestion: '增加 cargo test。',
            }],
          }
    }

    const result = await runtime.reviewPlan(agent, state.id)
    assert.equal(calls, 2)
    assert.match(firstPrompt, /Owner 是否由代码本身的长期责任域决定/u)
    assert.match(firstPrompt, /同一代码责任域仅因 Workflow 流程被拆成多个 Owner/u)
    assert.match(firstPrompt, /同一 Owner 下的多个 DAG task/u)
    assert.match(firstPrompt, /registryOperation.*代码依据/u)
    assert.match(retryPrompt, /计划审查状态不受支持：failed/u)
    assert.match(retryPrompt, /workflow_plan_review_submit/u)
    assert.equal(result.review.status, 'needs_revision')
    assert.equal(result.review.issues[0].title, '缺少 Rust 验证')
    assert.match(result.nextAction, /workflow_plan_revise/u)
    const saved = JSON.parse(await readFile(
      join(root, '.dsh-workflow', 'workflows', `${state.id}.json`),
      'utf8',
    ))
    assert.equal(saved.status, 'planned')
    assert.equal(saved.planReview.status, 'needs_revision')
    assert.equal(saved.planReviewDigest, saved.planDigest)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('计划可在审查约束下有界修订三次，并在达到上限后停止自动修订', async () => {
  const { root, runtime, agent, state } = await planApprovalFixture({ maxPlanRevisionTurns: 3 })
  try {
    const statePath = join(root, '.dsh-workflow', 'workflows', `${state.id}.json`)
    const firstReview = {
      contract: 'DSH_PLAN_REVIEW_V1',
      status: 'needs_revision',
      summary: '第一轮仍缺少验证',
      issues: [{
        severity: 'high',
        title: '缺少固定验证',
        detail: '当前计划没有覆盖关键验收。',
        suggestion: '增加固定验证。',
      }],
    }
    const blockedState = JSON.parse(await readFile(statePath, 'utf8'))
    blockedState.planReview = firstReview
    blockedState.planReviewDigest = blockedState.planDigest
    blockedState.planReviewedAt = new Date().toISOString()
    blockedState.planRevisionCount = 1
    await writeFile(statePath, `${JSON.stringify(blockedState, null, 2)}\n`, 'utf8')

    let plannerRevision = 1
    runtime.runChild = async (_agent, _cwd, prompt, _signal, options) => {
      if (options?.role === 'plan-reviewer') {
        return {
          contract: 'DSH_PLAN_REVIEW_V1',
          status: 'needs_revision',
          summary: '仍需继续修订',
          issues: [{
            severity: 'medium',
            title: '验收仍不完整',
            detail: '还缺少一个边界用例。',
            suggestion: '补充边界验证。',
          }],
        }
      }
      plannerRevision += 1
      assert.match(prompt, /Planner Reviewer 的问题/u)
      return {
        contract: 'DSH_PLAN_V2',
        registryDigest: blockedState.registryDigest,
        summary: `第 ${plannerRevision} 版计划`,
        registryOperation: null,
        owners: [{ id: 'plan-owner' }],
        verifications: [{ id: 'unit', run: ['node', '--test'] }],
        tasks: [{
          id: 'T1',
          role: 'work',
          ownerId: 'plan-owner',
          title: '修订计划任务',
          dependsOn: [],
          write: ['README.md'],
          verify: ['unit'],
          done: ['固定验证通过'],
        }],
      }
    }

    const secondRevision = await runtime.revisePlan(agent, state.id)
    assert.equal(secondRevision.revisionBudget.used, 2)
    assert.equal(secondRevision.revisionBudget.remaining, 1)
    let saved = JSON.parse(await readFile(statePath, 'utf8'))
    assert.equal(saved.planReviewRevisionCount, 2)
    assert.equal(saved.planReview, undefined)
    assert.equal(saved.planReviewHistory.length, 1)
    assert.equal(saved.planReviewHistory[0].planDigest, blockedState.planDigest)

    const secondReview = await runtime.reviewPlan(agent, state.id)
    assert.equal(secondReview.revisionBudget.exhausted, false)
    assert.match(secondReview.nextAction, /还可修订 1 次/u)

    const thirdRevision = await runtime.revisePlan(agent, state.id)
    assert.equal(thirdRevision.revisionBudget.used, 3)
    assert.equal(thirdRevision.revisionBudget.remaining, 0)
    const finalReview = await runtime.reviewPlan(agent, state.id)
    assert.equal(finalReview.revisionBudget.exhausted, true)
    assert.match(finalReview.nextAction, /达到 3 次上限/u)
    assert.match(finalReview.nextAction, /workflow_plan_revision_extend/u)
    assert.doesNotMatch(finalReview.nextAction, /取消.*重新规划/u)
    assert.equal(finalReview.nextTool, 'workflow_plan_revision_extend')
    assert.deepEqual(finalReview.nextArgs, {
      workflow_id: state.id,
      plan_digest: finalReview.workflow.planDigest,
    })

    saved = JSON.parse(await readFile(statePath, 'utf8'))
    assert.equal(saved.status, 'planned')
    assert.equal(saved.planApproved, false)
    assert.equal(saved.planReviewDigest, saved.planDigest)
    assert.equal(saved.planRevisionLimitReached.limit, 3)
    assert.equal(saved.planReviewHistory.length, 2)
    const exhaustedRevision = await runtime.revisePlan(agent, state.id)
    assert.equal(exhaustedRevision.contract, 'DSH_WORKFLOW_PLAN_REVISION_SKIPPED_V1')
    assert.equal(exhaustedRevision.reason, 'revision_limit')
    assert.match(exhaustedRevision.nextAction, /workflow_plan_revision_extend/u)
    assert.equal(exhaustedRevision.nextTool, 'workflow_plan_revision_extend')
    assert.deepEqual(exhaustedRevision.nextArgs, {
      workflow_id: state.id,
      plan_digest: exhaustedRevision.planDigest,
    })

    const extended = await runtime.extendPlanRevisionLimit(agent, state.id, saved.planDigest)
    assert.equal(extended.contract, 'DSH_WORKFLOW_PLAN_REVISION_LIMIT_EXTENDED_V1')
    assert.equal(extended.previousLimit, 3)
    assert.equal(extended.increment, 3)
    assert.deepEqual(extended.revisionBudget, {
      used: 3,
      limit: 6,
      remaining: 3,
      exhausted: false,
    })
    assert.match(extended.nextAction, /workflow_plan_revise/u)
    assert.match(extended.nextAction, /不得调用 workflow_recover/u)
    assert.equal(extended.nextTool, 'workflow_plan_revise')
    assert.deepEqual(extended.nextArgs, { workflow_id: state.id })

    const fourthRevision = await runtime.revisePlan(agent, state.id)
    assert.equal(fourthRevision.revisionBudget.used, 4)
    assert.equal(fourthRevision.revisionBudget.limit, 6)
    assert.equal(fourthRevision.revisionBudget.remaining, 2)
    saved = JSON.parse(await readFile(statePath, 'utf8'))
    assert.equal(saved.planRevisionLimit, 6)
    assert.equal(saved.planRevisionLimitExtensions.length, 1)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('非法修订候选保留原计划并可有界重试，重复修订会幂等指向重新审查', async () => {
  const { root, runtime, agent, state } = await planApprovalFixture({ maxPlanRevisionFailures: 2 })
  try {
    const statePath = join(root, '.dsh-workflow', 'workflows', `${state.id}.json`)
    const original = JSON.parse(await readFile(statePath, 'utf8'))
    original.planReview = {
      contract: 'DSH_PLAN_REVIEW_V1',
      status: 'needs_revision',
      summary: '需要修订验证任务',
      issues: [{
        severity: 'high',
        title: '验证任务必须只读',
        detail: 'verify 任务不能声明写入范围。',
        suggestion: '将 write 改为空数组。',
      }],
    }
    original.planReviewDigest = original.planDigest
    original.planReviewedAt = new Date().toISOString()
    original.planApproved = false
    await writeFile(statePath, `${JSON.stringify(original, null, 2)}\n`, 'utf8')

    let valid = false
    let plannerCalls = 0
    runtime.runChild = async () => {
      plannerCalls += 1
      return {
        contract: 'DSH_PLAN_V2',
        registryDigest: original.registryDigest,
        summary: valid ? '合法修订计划' : '非法 verify 写入计划',
        registryOperation: null,
        owners: [{ id: 'plan-owner' }],
        verifications: [{ id: 'unit', run: ['node', '--test'] }],
        tasks: [{
          id: 'T1',
          role: valid ? 'work' : 'verify',
          ownerId: 'plan-owner',
          title: '修订任务',
          dependsOn: [],
          write: ['README.md'],
          verify: ['unit'],
          done: ['修订完成'],
        }],
      }
    }

    const firstFailure = await runtime.revisePlan(agent, state.id)
    assert.equal(firstFailure.contract, 'DSH_WORKFLOW_PLAN_REVISION_FAILED_V1')
    assert.equal(firstFailure.recoverable, true)
    assert.equal(firstFailure.planRevisionFailureCount, 1)
    assert.match(firstFailure.error, /verify 角色必须将 write 设为空数组/u)
    let saved = JSON.parse(await readFile(statePath, 'utf8'))
    assert.equal(saved.planDigest, original.planDigest)
    assert.equal(saved.planReviewDigest, original.planDigest)
    assert.equal(saved.planReview.status, 'needs_revision')

    const exhaustedFailure = await runtime.revisePlan(agent, state.id)
    assert.equal(exhaustedFailure.recoverable, false)
    assert.equal(exhaustedFailure.planRevisionFailureCount, 2)
    const callsAtLimit = plannerCalls
    valid = true
    const stillExhausted = await runtime.revisePlan(agent, state.id)
    assert.equal(stillExhausted.recoverable, false)
    assert.equal(plannerCalls, callsAtLimit)

    runtime.config.maxPlanRevisionFailures = 3
    const revised = await runtime.revisePlan(agent, state.id)
    assert.equal(revised.plan.summary, '合法修订计划')
    assert.equal(revised.revisionBudget.used, 1)
    saved = JSON.parse(await readFile(statePath, 'utf8'))
    assert.equal(saved.planRevisionFailure, undefined)
    assert.equal(saved.planRevisionFailureCount, 0)
    assert.equal(saved.lastPlanRevision.toPlanDigest, saved.planDigest)

    const duplicate = await runtime.revisePlan(agent, state.id)
    assert.equal(duplicate.contract, 'DSH_WORKFLOW_PLAN_REVISION_SKIPPED_V1')
    assert.equal(duplicate.reason, 'awaiting_review')
    assert.match(duplicate.nextAction, /workflow_plan_review/u)
    assert.equal(plannerCalls, callsAtLimit + 1)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('计划修订拒绝使用不属于当前 planDigest 的旧审查结果', async () => {
  const { root, runtime, agent, state } = await planApprovalFixture()
  try {
    const statePath = join(root, '.dsh-workflow', 'workflows', `${state.id}.json`)
    const saved = JSON.parse(await readFile(statePath, 'utf8'))
    saved.planReview = {
      contract: 'DSH_PLAN_REVIEW_V1',
      status: 'needs_revision',
      summary: '旧计划审查',
      issues: [{
        severity: 'high',
        title: '旧问题',
        detail: '该问题属于旧摘要。',
        suggestion: '重新审查。',
      }],
    }
    saved.planReviewDigest = '0'.repeat(64)
    await writeFile(statePath, `${JSON.stringify(saved, null, 2)}\n`, 'utf8')
    await assert.rejects(
      runtime.revisePlan(agent, state.id),
      /审查结果不属于当前 planDigest/u,
    )
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('规划契约失败返回完整 Workflow ID，并在同一现场有界恢复', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-planning-recovery-'))
  const runtime = createOwnerWorkflowRuntime({}, { maxPlanningFailures: 3 })
  try {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
    await git(root, ['config', 'user.name', 'Owner Workflow Test'])
    await writeFile(join(root, 'README.md'), '规划恢复测试\n', 'utf8')
    await git(root, ['add', 'README.md'])
    await git(root, ['commit', '-m', '初始化规划恢复测试'])

    const agent = { id: 'planning-recovery-agent', session: { id: 'planning-recovery-agent', header: { cwd: root } } }
    const operation = addOwnerOperation('planning-owner')
    let valid = false
    let plannerCalls = 0
    runtime.runChild = async () => {
      plannerCalls += 1
      return {
        contract: 'DSH_PLAN_V2',
        registryDigest: '0'.repeat(64),
        summary: valid ? '恢复后的合法计划' : '缺少 T2 验证的计划',
        registryOperation: operation,
        owners: [{ id: 'planning-owner' }],
        verifications: [{ id: 'unit', run: ['node', '--test'] }],
        tasks: [
          {
            id: 'T1', role: 'work', ownerId: 'planning-owner', title: '首任务', dependsOn: [],
            write: ['src/planning-owner/first.txt'], verify: ['unit'], done: ['首任务完成'],
          },
          {
            id: 'T2', role: 'work', ownerId: 'planning-owner', title: '后续任务', dependsOn: ['T1'],
            write: ['src/planning-owner/second.txt'], verify: valid ? ['unit'] : [], done: ['后续任务完成'],
          },
        ],
      }
    }

    await runtime.modeEnable(agent)
    const preflight = await runtime.preflightWorkflow(agent)
    const failed = await runtime.startWorkflow(agent, '先失败再恢复规划', undefined, preflight.baseDigest)
    assert.equal(failed.contract, 'DSH_WORKFLOW_PLANNING_FAILED_V1')
    assert.match(failed.workflowId, /^wf-/u)
    assert.match(failed.workflowBranch, /^dsh\/workflow\/\d{8}-0001-先失败再恢复规划$/u)
    assert.equal(failed.workflowBranch.includes(failed.workflowId), false)
    assert.equal(failed.workflowSequence, 1)
    assert.equal(failed.recoverable, true)
    assert.equal(failed.planningFailureCount, 1)
    assert.match(failed.error, /task\(T2\)\.verify 不能为空/u)
    assert.match(failed.nextAction, new RegExp(`workflow_recover\\(workflow_id=${failed.workflowId}\\)`, 'u'))
    assert.equal(plannerCalls, 2)

    valid = true
    const recovered = await runtime.recoverWorkflow(agent, failed.workflowId)
    assert.equal(recovered.contract, 'DSH_WORKFLOW_START_RESULT_V1')
    assert.equal(recovered.workflowId, failed.workflowId)
    assert.equal(recovered.status, 'planned')
    assert.equal(plannerCalls, 3)
    const recoveredState = JSON.parse(await readFile(
      join(root, '.dsh-workflow', 'workflows', `${failed.workflowId}.json`),
      'utf8',
    ))
    assert.equal(recoveredState.planningFailure, undefined)
    assert.equal(recoveredState.planningFailureCount, 1)

    await runtime.cancelWorkflow(agent, failed.workflowId)
    runtime.config.maxPlanningFailures = 2
    valid = false
    const secondPreflight = await runtime.preflightWorkflow(agent)
    const terminalCandidate = await runtime.startWorkflow(agent, '验证规划失败上限', undefined, secondPreflight.baseDigest)
    assert.equal(terminalCandidate.recoverable, true)
    assert.match(terminalCandidate.workflowBranch, /^dsh\/workflow\/\d{8}-0002-验证规划失败上限$/u)
    assert.equal(terminalCandidate.workflowSequence, 2)
    const exhausted = await runtime.recoverWorkflow(agent, terminalCandidate.workflowId)
    assert.equal(exhausted.contract, 'DSH_WORKFLOW_PLANNING_FAILED_V1')
    assert.equal(exhausted.recoverable, false)
    assert.equal(exhausted.planningFailureCount, 2)
    const callsAtLimit = plannerCalls
    valid = true
    const stillExhausted = await runtime.recoverWorkflow(agent, terminalCandidate.workflowId)
    assert.equal(stillExhausted.recoverable, false)
    assert.equal(plannerCalls, callsAtLimit)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('Harness agent/status 持久化运行中、空闲和关闭生命周期', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-agent-runtime-status-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const runtime = createOwnerWorkflowRuntime({}, { ownerMemoryEnabled: false })
  const agent = {
    id: 'runtime-status-main',
    status: 'running',
    session: { id: 'runtime-status-main', header: { cwd: root } },
  }
  runtime.orchestratorRoots.set(agent.id, root)
  const path = join(
    root,
    '.dsh-workflow',
    'runtime',
    'agents',
    `${createHash('sha256').update(agent.id).digest('hex')}.json`,
  )
  await runtime.onAgentStatus(agent, 'running')
  assert.equal(JSON.parse(await readFile(path, 'utf8')).lifecycle, 'running')
  await runtime.onAgentStatus(agent, 'idle')
  assert.equal(JSON.parse(await readFile(path, 'utf8')).lifecycle, 'idle')
  await runtime.onAgentDisposed(agent)
  assert.equal(JSON.parse(await readFile(path, 'utf8')).lifecycle, 'closed')
  await runtime.dispose()
})

test('workflow_start 使用一个可续接 Plan Agent，而不是同步串联规划工具', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-continuable-plan-'))
  const calls = { starts: [], followups: [] }
  const ctx = {
    subagents: {
      async startContinuable(spec) {
        calls.starts.push(spec)
        return { childId: spec.childId, messageId: 'plan-initial-message' }
      },
      async followup(parent, childId, content, options) {
        calls.followups.push({ parent, childId, content, options })
        return 'plan-followup-message'
      },
    },
  }
  const runtime = createOwnerWorkflowRuntime(ctx, { ownerMemoryEnabled: false })
  try {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
    await git(root, ['config', 'user.name', 'Owner Workflow Test'])
    await writeFile(join(root, 'README.md'), '可续接 Plan Agent 测试\n', 'utf8')
    await git(root, ['add', 'README.md'])
    await git(root, ['commit', '-m', '初始化可续接 Plan Agent 测试'])
    const agent = {
      id: 'continuable-plan-parent',
      options: { provider: 'test-provider', model: 'test-model' },
      session: { id: 'continuable-plan-parent', header: { cwd: root } },
    }
    await runtime.modeEnable(agent)
    const preflight = await runtime.preflightWorkflow(agent)
    const started = await runtime.startWorkflow(
      agent,
      '创建一个最小可续接 Plan Agent',
      undefined,
      preflight.baseDigest,
      { planningMode: 'continuable' },
    )
    assert.equal(started.contract, 'DSH_WORKFLOW_PLAN_AGENT_STARTED_V1')
    assert.equal(calls.starts.length, 1)
    assert.equal(calls.starts[0].label, `Plan ${started.workflowId}`)
    assert.match(calls.starts[0].request.prompt[0].text, /workflow_plan_submit/u)
    const child = {
      id: started.plannerSessionId,
      session: { id: started.plannerSessionId, append() {} },
    }
    runtime.setupContinuableChild({ agent: child, systemPrompt: { section() {} } })
    assert.equal(runtime.agentRoles.get(child.id).role, 'planner')
    assert.equal(runtime.agentRoles.get(child.id).continuablePlanning, true)
    assert.equal(calls.followups.length, 0)
    const plan = {
      contract: 'DSH_PLAN_V2',
      summary: '单 Owner 的最小计划',
      registryOperation: addOwnerOperation('app'),
      owners: [{ id: 'app' }],
      verifications: [{ id: 'unit', run: ['node', '--test'] }],
      tasks: [{
        id: 'T1', role: 'work', ownerId: 'app', title: '实现最小功能', dependsOn: [],
        write: ['src/app/**'], verify: ['unit'], done: ['最小功能完成'],
      }],
    }
    const submitted = await runtime.submitPlannerPlan(child, plan)
    assert.equal(submitted.status, 'awaiting_registry_approval')
    const registryStatus = await runtime.registryStatus(agent, started.workflowId)
    assert.ok(registryStatus.pendingProposal)
    await runtime.approveOwnerChange(agent, started.workflowId, registryStatus.pendingProposal.digest)
    assert.equal(calls.followups.length, 1)
    assert.equal(calls.followups[0].childId, child.id)
    assert.match(calls.followups[0].content[0].text, /workflow_plan_submit/u)
    let finishReview
    runtime.reviewPlan = async () => new Promise(resolveReview => { finishReview = resolveReview })
    const resubmitted = await runtime.submitPlannerPlan(child, { ...plan, registryOperation: null })
    assert.equal(resubmitted.status, 'reviewing')
    const continued = JSON.parse(await readFile(
      join(root, '.dsh-workflow', 'workflows', `${started.workflowId}.json`),
      'utf8',
    ))
    assert.equal(continued.status, 'planned')
    assert.equal(continued.planningAgent.phase, 'reviewing')
    finishReview({
      review: { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '计划通过', issues: [] },
      workflow: { planDigest: continued.planDigest, registryDigest: continued.registryDigest },
      revisionBudget: { exhausted: false },
    })
    await runtime.planningDrivers.get(started.workflowId)
    const reviewed = JSON.parse(await readFile(
      join(root, '.dsh-workflow', 'workflows', `${started.workflowId}.json`),
      'utf8',
    ))
    assert.equal(reviewed.planningAgent.phase, 'awaiting_plan_approval')
    assert.equal(await git(root, ['rev-parse', continued.workflowBranch]), await git(root, ['rev-parse', 'main']))
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-full-workflow-'))
  const runtime = createOwnerWorkflowRuntime({}, {
    ownerMemoryEnabled: false,
    maxPlanRevisionTurns: 3,
  })
  try {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
    await git(root, ['config', 'user.name', 'Owner Workflow Test'])
    await writeFile(join(root, 'README.md'), '完整工作流测试\n', 'utf8')
    await git(root, ['add', 'README.md'])
    await git(root, ['commit', '-m', '初始化完整工作流测试'])

    const agent = { id: 'full-workflow-agent', session: { id: 'full-workflow-agent', header: { cwd: root } } }
    const registryOperation = addOwnerOperation('app-owner')
    const planResponse = (revision, operation = null) => ({
      contract: 'DSH_PLAN_V2',
      registryDigest: '0'.repeat(64),
      summary: `完整工作流第 ${revision} 版计划`,
      registryOperation: operation,
      owners: [{ id: 'app-owner' }],
      verifications: [{ id: 'unit', run: ['node', '--test'] }],
      tasks: [{
        id: 'T1',
        role: 'work',
        ownerId: 'app-owner',
        title: '实现完整流程文件',
        dependsOn: [],
        write: ['src/app-owner/result.txt'],
        verify: ['unit'],
        done: [`第 ${revision} 版验收通过`],
      }],
    })
    let plannerCalls = 0
    let reviewerCalls = 0
    runtime.runChild = async (_agent, _cwd, _prompt, _signal, options) => {
      if (options?.role === 'planner') {
        plannerCalls += 1
        return planResponse(plannerCalls, plannerCalls === 1 ? registryOperation : null)
      }
      if (options?.role === 'plan-reviewer') {
        reviewerCalls += 1
        return reviewerCalls < 3
          ? {
              contract: 'DSH_PLAN_REVIEW_V1',
              status: 'needs_revision',
              summary: `第 ${reviewerCalls} 轮审查要求修订`,
              issues: [{
                severity: 'high',
                title: '验收仍需收敛',
                detail: '用完整状态链验证计划修订。',
                suggestion: '修订后重新独立审查。',
              }],
            }
          : {
              contract: 'DSH_PLAN_REVIEW_V1',
              status: 'passed',
              summary: '计划审查通过',
              issues: [],
            }
      }
      if (options?.role === 'reviewer') {
        return {
          contract: 'DSH_IMPLEMENTATION_REVIEW_V1',
          status: 'passed',
          summary: '最终实现审查通过',
          issues: [],
        }
      }
      throw new Error(`完整工作流测试收到未知子代理角色：${String(options?.role)}`)
    }

    await runtime.modeEnable(agent)
    const preflight = await runtime.preflightWorkflow(agent)
    assert.equal(preflight.canStart, true)
    const started = await runtime.startWorkflow(agent, '执行完整工作流测试', undefined, preflight.baseDigest)
    assert.equal(started.status, 'planned')
    assert.deepEqual(started.registryOperation, registryOperation)
    assert.match(started.workflowBranch, /^dsh\/workflow\/\d{8}-0001-执行完整工作流测试$/u)
    assert.equal(started.workflowBranch.includes(started.workflowId), false)
    assert.equal(started.workflowSequence, 1)
    assert.equal(started.workflowSlug, '执行完整工作流测试')
    assert.equal(started.orchestratorSessionId, agent.id)

    const proposal = await runtime.proposeOwnerChange(agent, started.workflowId, started.registryOperation)
    const registryApproval = await runtime.approveOwnerChange(agent, started.workflowId, proposal.digest)
    assert.equal(registryApproval.workflow.status, 'registry_pending_plan')
    const replanned = await runtime.recoverWorkflow(agent, started.workflowId)
    assert.equal(replanned.status, 'planned')
    const replannedState = JSON.parse(await readFile(
      join(root, '.dsh-workflow', 'workflows', `${started.workflowId}.json`),
      'utf8',
    ))
    assert.deepEqual(await statusRecords(replannedState.workflowWorktree), [])
    // 模拟修复前已经完成规划、但 Registry 仍停留在工作区的旧现场。
    await git(replannedState.workflowWorktree, ['reset', '--mixed', 'HEAD^'])
    assert.ok((await statusRecords(replannedState.workflowWorktree)).every(record => (
      record.path.startsWith('.owner-workflow/')
    )))

    const firstReview = await runtime.reviewPlan(agent, started.workflowId)
    assert.equal(firstReview.review.status, 'needs_revision')
    await assert.rejects(
      runtime.approvePlan(agent, started.workflowId, firstReview.workflow.planDigest, firstReview.workflow.registryDigest),
      /必须先通过当前 planDigest/u,
    )
    assert.equal((await runtime.revisePlan(agent, started.workflowId)).revisionBudget.used, 1)
    assert.equal((await runtime.reviewPlan(agent, started.workflowId)).review.status, 'needs_revision')
    assert.equal((await runtime.revisePlan(agent, started.workflowId)).revisionBudget.used, 2)
    const passedReview = await runtime.reviewPlan(agent, started.workflowId)
    assert.equal(passedReview.review.status, 'passed')

    const approved = await runtime.approvePlan(
      agent,
      started.workflowId,
      passedReview.workflow.planDigest,
      passedReview.workflow.registryDigest,
    )
    assert.equal(approved.workflow.status, 'approved')
    const supervisorStarted = await request(started.control, 'supervisor-start', { parallel: 1 })
    assert.equal(supervisorStarted.status, 'running')

    runtime.assertRequiredTaskVerifications = async () => ({
      contentDigest: 'a'.repeat(64),
      verificationIds: ['unit'],
    })
    runtime.runExternalOwner = async (_agent, workflowId, taskId, ownerId) => {
      const statePath = join(root, '.dsh-workflow', 'workflows', `${workflowId}.json`)
      const state = JSON.parse(await readFile(statePath, 'utf8'))
      const task = state.plan.tasks.find(item => item.id === taskId)
      const entry = await runtime.createOwnerEntry(state, task, ownerId)
      assert.equal(entry.branch.startsWith(`dsh/owner/${state.workflowBranchName}/`), true)
      assert.equal(entry.branch.includes(state.id), false)
      const target = join(entry.worktree, 'src', 'app-owner', 'result.txt')
      await mkdir(join(entry.worktree, 'src', 'app-owner'), { recursive: true })
      await writeFile(target, '完整流程已经执行\n', 'utf8')
      await git(entry.worktree, ['add', 'src/app-owner/result.txt'])
      await git(entry.worktree, ['commit', '-m', '完成完整工作流任务'])
      const commitSha = (await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd: entry.worktree,
        encoding: 'utf8',
      })).stdout.trim()
      const result = {
        ownerId,
        branch: entry.branch,
        worktree: entry.worktree,
        baseCommit: entry.baseCommit,
        commitSha,
        sessionId: 'full-owner-session',
        report: { summary: 'Owner 完成完整流程文件', changes: [], tests: [], handoffs: [] },
      }
      state.ownerRuns[`${taskId}:${ownerId}`] = {
        status: 'awaiting_finish',
        taskId,
        stageId: taskId,
        ownerId,
        branch: entry.branch,
        worktree: entry.worktree,
        baseCommit: entry.baseCommit,
        result,
      }
      await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
      return result
    }

    const create = await request(started.control, 'supervisor-next')
    assert.equal(create.action, 'create')
    const acknowledged = await request(started.control, 'supervisor-ack', { actionId: create.actionId })
    await request(started.control, 'supervisor-execute', {
      reservationId: acknowledged.reservations[0].reservationId,
    })
    const statePath = join(root, '.dsh-workflow', 'workflows', `${started.workflowId}.json`)
    await waitForWorkflowState(
      statePath,
      state => state.tasks?.[0]?.status === 'completed'
        && state.supervisorOutbox?.['T1:app-owner']?.status === 'completed',
      'Owner 完成并立即合入 workflow',
    )
    const stop = await request(started.control, 'supervisor-next')
    assert.equal(stop.action, 'stop')
    const stopped = await request(started.control, 'supervisor-stop', { actionId: stop.actionId })
    assert.equal(stopped.status, 'completed')

    await assert.rejects(
      runtime.finalizeWorkflow(agent, started.workflowId),
      /尚未通过独立 Implementation Review/u,
    )
    const implementationReview = await runtime.implementationReview(agent, started.workflowId)
    assert.equal(implementationReview.review.status, 'passed')
    const finalized = await runtime.finalizeWorkflow(agent, started.workflowId)
    assert.equal(finalized.finalized, true)
    assert.equal(await readFile(join(root, 'src', 'app-owner', 'result.txt'), 'utf8'), '完整流程已经执行\n')
    assert.equal(plannerCalls, 4)
    assert.equal(reviewerCalls, 3)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('取消功能 Workflow 后项目级 Owner Registry 仍被后续 Workflow 直接复用', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-project-registry-'))
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
    await git(root, ['config', 'user.name', 'Owner Workflow Test'])
    await writeFile(join(root, 'README.md'), '项目级 Registry 测试\n', 'utf8')
    await git(root, ['add', 'README.md'])
    await git(root, ['commit', '-m', '初始化项目级 Registry 测试'])

    const agent = { id: 'project-registry-agent', session: { id: 'project-registry-agent', header: { cwd: root } } }
    const operation = addOwnerOperation('persistent-owner')
    let plannerCalls = 0
    runtime.runChild = async () => {
      plannerCalls += 1
      return {
        contract: 'DSH_PLAN_V2',
        registryDigest: '0'.repeat(64),
        summary: plannerCalls === 1 ? '首次登记固定 Owner' : '复用固定 Owner',
        registryOperation: plannerCalls === 1 ? operation : null,
        owners: [{ id: 'persistent-owner' }],
        verifications: [{ id: 'unit', run: ['node', '--test'] }],
        tasks: [{
          id: 'T1', role: 'work', ownerId: 'persistent-owner', title: '复用 Owner 任务', dependsOn: [],
          write: ['src/persistent-owner/result.txt'], verify: ['unit'], done: ['任务完成'],
        }],
      }
    }

    await runtime.modeEnable(agent)
    const firstPreflight = await runtime.preflightWorkflow(agent)
    const first = await runtime.startWorkflow(agent, '首次建立 Owner', undefined, firstPreflight.baseDigest)
    const proposal = await runtime.proposeOwnerChange(agent, first.workflowId, first.registryOperation)
    const approved = await runtime.approveOwnerChange(agent, first.workflowId, proposal.digest)
    assert.match(approved.registryBaseCommit, /^[0-9a-f]{40}$/u)
    assert.deepEqual((await loadRegistry(root)).owners.map(owner => owner.id), ['persistent-owner'])
    assert.deepEqual(await statusRecords(root), [])
    await runtime.cancelWorkflow(agent, first.workflowId)

    const secondPreflight = await runtime.preflightWorkflow(agent)
    const second = await runtime.startWorkflow(agent, '复用已有 Owner', undefined, secondPreflight.baseDigest)
    assert.equal(second.registryOperation, undefined)
    assert.deepEqual(second.plan.owners.map(owner => owner.id), ['persistent-owner'])
    assert.equal(plannerCalls, 2)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('旧 Workflow 中已批准但未进入基础分支的 Registry 会在继续流程时迁移', async () => {
  const { root, runtime, agent, state } = await planApprovalFixture()
  try {
    const statePath = join(root, '.dsh-workflow', 'workflows', `${state.id}.json`)
    const legacy = JSON.parse(await readFile(statePath, 'utf8'))
    legacy.approvedProposalDigest = 'legacy-approved-registry-digest'
    delete legacy.registryBaseCommit
    await writeFile(statePath, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8')
    runtime.runChild = async () => ({
      contract: 'DSH_PLAN_REVIEW_V1',
      status: 'passed',
      summary: '旧 Workflow 计划仍然有效',
      issues: [],
    })

    const reviewed = await runtime.reviewPlan(agent, state.id)
    assert.equal(reviewed.review.status, 'passed')
    assert.deepEqual((await loadRegistry(root)).owners.map(owner => owner.id), ['plan-owner'])
    assert.deepEqual(await statusRecords(root), [])
    const migrated = JSON.parse(await readFile(statePath, 'utf8'))
    assert.match(migrated.registryBaseCommit, /^[0-9a-f]{40}$/u)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('新建 Workflow 会先迁移已取消旧 Workflow 中最新获批的固定 Owner', async () => {
  const { root, runtime, agent, state } = await planApprovalFixture()
  try {
    const statePath = join(root, '.dsh-workflow', 'workflows', `${state.id}.json`)
    const legacy = JSON.parse(await readFile(statePath, 'utf8'))
    legacy.status = 'cancelled'
    legacy.cancelledAt = new Date().toISOString()
    legacy.temporaryArtifactsCleaned = true
    legacy.temporaryArtifactsCleanedAt = legacy.cancelledAt
    legacy.approvedProposalDigest = 'legacy-cancelled-approved-registry'
    legacy.registryApprovedAt = new Date().toISOString()
    delete legacy.registryBaseCommit
    await writeFile(statePath, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8')
    runtime.runChild = async () => ({
      contract: 'DSH_PLAN_V2',
      registryDigest: legacy.registryDigest,
      summary: '复用旧 Workflow 已批准的固定 Owner',
      registryOperation: null,
      owners: [{ id: 'plan-owner' }],
      verifications: [{ id: 'unit', run: ['node', '--test'] }],
      tasks: [{
        id: 'T1', role: 'work', ownerId: 'plan-owner', title: '复用固定 Owner', dependsOn: [],
        write: ['README.md'], verify: ['unit'], done: ['完成'],
      }],
    })

    await runtime.modeEnable(agent)
    const preflight = await runtime.preflightWorkflow(agent)
    const started = await runtime.startWorkflow(agent, '迁移后复用 Owner', undefined, preflight.baseDigest)
    assert.equal(started.registryOperation, undefined)
    assert.equal(started.registryMigration.sourceWorkflowId, state.id)
    assert.equal(started.registryMigration.sourceWorkflowStatus, 'cancelled')
    assert.deepEqual((await loadRegistry(root)).owners.map(owner => owner.id), ['plan-owner'])
    assert.deepEqual(await statusRecords(root), [])
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('规划器首轮提交不满足契约时，运行时会带校验错误重试一次', async () => {
  const { root, runtime, agent, state } = await registryWorkflowFixture()
  try {
    const operation = addOwnerOperation('retry-owner')
    let calls = 0
    let retryPrompt
    runtime.runChild = async (_agent, _cwd, prompt) => {
      calls += 1
      if (calls === 2) retryPrompt = prompt
      return {
        contract: 'DSH_PLAN_V2',
        registryDigest: 'not-a-digest',
        summary: '首 Owner 规划',
        registryOperation: operation,
        owners: [operation.owner],
        verifications: [{ id: 'unit', run: ['node', '--test'] }],
        tasks: [{
          id: 'T1',
          role: 'verify',
          ownerId: operation.owner.id,
          title: '验证任务',
          dependsOn: [],
          write: calls === 1 ? [`src/${operation.owner.id}/entry.mjs`] : [],
          verify: ['unit'],
          done: ['验证任务完成'],
        }],
      }
    }
    const result = await runtime.planWorkflowState(agent, { ...state, request: '建立首 Owner 并验证任务' })
    assert.equal(calls, 2)
    assert.match(retryPrompt, /verify 角色必须将 write 设为空数组/u)
    assert.deepEqual(result.registryOperation, operation)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('规划器只选择 Owner ID，Runtime 从正式 Registry 注入完整定义', async () => {
  const { root, runtime, agent, state } = await registryWorkflowFixture()
  try {
    const operation = addOwnerOperation('bound-owner')
    const original = await loadRegistry(state.workflowWorktree)
    const registry = await applyRegistryOperation(state.workflowWorktree, original, operation)
    const liveDigest = registryContentDigest(registry)
    state.registryDigest = liveDigest
    runtime.runChild = async () => ({
      contract: 'DSH_PLAN_V2',
      registryDigest: '0'.repeat(64),
      summary: '复用正式 Owner',
      registryOperation: null,
      owners: [{
        id: operation.owner.id,
        name: '被 Planner 改写的名称',
        description: '被 Planner 改写的职责',
        scope: ['**'],
        exclude: [],
      }],
      verifications: [{ id: 'unit', run: ['node', '--test'] }],
      tasks: [{
        id: 'T1',
        role: 'work',
        ownerId: operation.owner.id,
        title: '正式范围内任务',
        dependsOn: [],
        write: [`src/${operation.owner.id}/entry.mjs`],
        verify: ['unit'],
        done: ['完成'],
      }],
    })

    const result = await runtime.planWorkflowState(agent, { ...state, request: '按 ID 选择 Owner' })
    const owner = result.plan.owners[0]
    assert.equal(owner.id, operation.owner.id)
    assert.equal(owner.name, operation.owner.name)
    assert.equal(owner.description, operation.owner.description)
    assert.deepEqual(owner.scope, operation.owner.scope)
    assert.deepEqual(owner.exclude, operation.owner.exclude)
    assert.equal(result.plan.registryDigest, liveDigest)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('Planner 伪造宽 scope 不能绕过正式 Registry 的 task.write 边界', async () => {
  const { root, runtime, agent, state } = await registryWorkflowFixture()
  try {
    const operation = addOwnerOperation('scope-owner')
    const original = await loadRegistry(state.workflowWorktree)
    const registry = await applyRegistryOperation(state.workflowWorktree, original, operation)
    state.registryDigest = registryContentDigest(registry)
    let calls = 0
    runtime.runChild = async () => {
      calls += 1
      return {
        contract: 'DSH_PLAN_V2',
        registryDigest: state.registryDigest,
        summary: '尝试扩大 Owner 范围',
        registryOperation: null,
        owners: [{ id: operation.owner.id, scope: ['**'] }],
        verifications: [{ id: 'unit', run: ['node', '--test'] }],
        tasks: [{
          id: 'T1',
          role: 'work',
          ownerId: operation.owner.id,
          title: '越界任务',
          dependsOn: [],
          write: ['README.md'],
          verify: ['unit'],
          done: ['完成'],
        }],
      }
    }

    await assert.rejects(
      runtime.planWorkflowState(agent, { ...state, request: '不得扩大范围' }),
      /write 范围 README\.md 不属于 Owner scope-owner scope/u,
    )
    assert.equal(calls, 2)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('handoff 重规划 prompt 只声明 V2 任务计划契约', async () => {
  const { root, runtime, agent, state } = await registryWorkflowFixture()
  try {
    const ownerA = addOwnerOperation('owner-a').owner
    const ownerB = addOwnerOperation('owner-b').owner
    let registry = await loadRegistry(state.workflowWorktree)
    registry = await applyRegistryOperation(state.workflowWorktree, registry, {
      type: 'add',
      owner: ownerA,
      reason: '登记 handoff 测试来源 Owner',
    })
    registry = await applyRegistryOperation(state.workflowWorktree, registry, {
      type: 'add',
      owner: ownerB,
      reason: '登记 handoff 测试目标 Owner',
    })
    const registryDigest = registryContentDigest(registry)
    const plan = {
      contract: 'DSH_PLAN_V2',
      registryDigest,
      summary: 'handoff 重规划测试计划',
      owners: [ownerA, ownerB],
      verifications: [{ id: 'unit', run: ['node', '--test'] }],
      tasks: [
        {
          id: 'T1',
          role: 'work',
          ownerId: ownerA.id,
          title: '来源任务',
          dependsOn: [],
          write: ['src/owner-a/T1.mjs'],
          verify: ['unit'],
          done: ['来源任务完成'],
        },
        {
          id: 'T2',
          role: 'work',
          ownerId: ownerB.id,
          title: '目标任务',
          dependsOn: ['T1'],
          write: ['src/owner-b/T2.mjs'],
          verify: ['unit'],
          done: ['目标任务完成'],
        },
      ],
    }
    const workflowHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: state.workflowWorktree,
      encoding: 'utf8',
    })).stdout.trim()
    const handoffState = {
      contract: state.contract,
      id: state.id,
      root: state.root,
      baseBranch: state.baseBranch,
      baseRef: state.baseRef,
      workflowBranch: state.workflowBranch,
      workflowWorktree: state.workflowWorktree,
      status: 'blocked',
      plan,
      registryDigest,
      planDigest: createHash('sha256').update(JSON.stringify(plan)).digest('hex'),
      planApproved: true,
      tasks: createTaskState(plan),
      ownerRuns: {},
      workflowHead,
      handoffQueue: [{
        id: 'handoff-prompt',
        status: 'pending',
        sourceOwnerId: ownerA.id,
        sourceStageId: 'T1',
        targetType: 'owner',
        targetOwnerId: ownerB.id,
        summary: '转交目标路径',
        reason: '目标路径属于另一个 Owner',
        files: ['src/owner-b/T2.mjs'],
      }],
    }
    await writeFile(
      join(root, '.dsh-workflow', 'workflows', `${state.id}.json`),
      `${JSON.stringify(handoffState, null, 2)}\n`,
      'utf8',
    )
    let prompt
    runtime.runChild = async (_agent, _cwd, value) => {
      prompt = value
      throw new Error('停止于 handoff prompt 断言')
    }

    await assert.rejects(
      runtime.replanHandoffs(agent, state.id),
      /停止于 handoff prompt 断言/u,
    )
    assertV2PlannerPrompt(prompt)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('规划器不能用未登记 Owner 绕过 Registry 提案审批', async () => {
  const { root, runtime, agent, state } = await registryWorkflowFixture()
  try {
    runtime.runChild = async () => JSON.stringify({
      contract: 'DSH_PLAN_V2',
      registryDigest: 'b'.repeat(64),
      summary: '尝试绕过正式 Registry',
      registryOperation: null,
      owners: state.plan.owners,
      verifications: [{ id: 'unit', run: ['node', '--test'] }],
      tasks: [{
        id: 'T1',
        role: 'work',
        ownerId: state.plan.owners[0].id,
        title: '未登记 Owner 任务',
        dependsOn: [],
        write: ['README.md'],
        verify: ['unit'],
        done: ['完成'],
      }],
    })
    await assert.rejects(
      runtime.planWorkflowState(agent, { ...state, request: '尝试直接使用未登记 Owner' }),
      /正式 Owner Registry|未登记|不匹配/u,
    )
    assert.deepEqual((await loadRegistry(state.workflowWorktree)).owners, [])
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('Registry 批准要求完全匹配 digest，写入 workflow worktree 并使旧计划审查失效', async () => {
  const { root, runtime, agent, state } = await registryWorkflowFixture()
  try {
    const proposal = await runtime.proposeOwnerChange(agent, state.id, addOwnerOperation())
    await assert.rejects(runtime.approveOwnerChange(agent, state.id, '0'.repeat(64)), /digest 不匹配/u)
    assert.deepEqual((await loadRegistry(state.workflowWorktree)).owners, [])

    const result = await runtime.approveOwnerChange(agent, state.id, proposal.digest)
    const liveRegistry = await loadRegistry(state.workflowWorktree)
    const liveDigest = registryContentDigest(liveRegistry)
    assert.notEqual(liveDigest, proposal.digest)
    assert.equal(result.approvedProposalDigest, proposal.digest)
    assert.equal(result.registryDigest, liveDigest)
    assert.equal(result.workflow.approvedProposalDigest, proposal.digest)
    assert.equal(result.workflow.registryDigest, liveDigest)
    assert.equal(result.workflow.planReview, undefined)
    assert.equal(result.workflow.planApproved, false)
    assert.deepEqual((await loadRegistry(state.workflowWorktree)).owners.map(owner => owner.id), ['registry-owner'])

    const saved = JSON.parse(await readFile(join(root, '.dsh-workflow', 'workflows', `${state.id}.json`), 'utf8'))
    assert.equal(saved.status, 'registry_pending_plan')
    assert.equal(saved.pendingRegistryProposal, undefined)
    assert.equal(saved.planReview, undefined)
    assert.equal(saved.planReviewDigest, undefined)
    assert.equal(saved.planApproved, false)
    assert.equal(saved.planApprovedAt, undefined)
    assert.equal(saved.planApprovedBy, undefined)
    assert.equal(saved.approvedProposalDigest, proposal.digest)
    assert.equal(saved.registryDigest, liveDigest)
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('V2 Registry 批准后的 registry_pending_plan 可以原地重新规划', async () => {
  const { root, runtime, agent, state } = await registryWorkflowFixture()
  try {
    const operation = addOwnerOperation()
    const oldPlan = {
      contract: 'DSH_PLAN_V2',
      registryDigest: state.registryDigest,
      summary: '等待 Registry 批准的旧计划',
      registryOperation: operation,
      owners: [operation.owner],
      verifications: [{ id: 'unit', run: ['node', '--test'] }],
      tasks: [{
        id: 'OLD',
        role: 'work',
        ownerId: operation.owner.id,
        title: '旧任务',
        dependsOn: [],
        write: operation.owner.scope,
        verify: ['unit'],
        done: ['旧任务完成'],
      }],
    }
    state.plan = oldPlan
    state.tasks = createTaskState(oldPlan)
    state.planDigest = 'a'.repeat(64)
    state.request = '使用新 Registry 重新规划'
    await writeFile(
      join(root, '.dsh-workflow', 'workflows', `${state.id}.json`),
      `${JSON.stringify(state, null, 2)}\n`,
      'utf8',
    )

    const proposal = await runtime.proposeOwnerChange(agent, state.id, operation)
    const approved = await runtime.approveOwnerChange(agent, state.id, proposal.digest)
    assert.equal(approved.workflow.status, 'registry_pending_plan')
    const liveRegistry = await loadRegistry(state.workflowWorktree)
    const liveDigest = registryContentDigest(liveRegistry)
    runtime.runChild = async () => JSON.stringify({
      contract: 'DSH_PLAN_V2',
      registryDigest: liveDigest,
      summary: '基于已批准 Registry 的新计划',
      registryOperation: null,
      owners: liveRegistry.owners,
      verifications: [{ id: 'unit', run: ['node', '--test'] }],
      tasks: [{
        id: 'NEW',
        role: 'work',
        ownerId: operation.owner.id,
        title: '新任务',
        dependsOn: [],
        write: operation.owner.scope,
        verify: ['unit'],
        done: ['新任务完成'],
      }],
    })

    const recovered = await runtime.recoverWorkflow(agent, state.id)
    assert.equal(recovered.status, 'planned')
    assert.equal(recovered.registryDigest, liveDigest)
    assert.deepEqual(recovered.plan.tasks.map(task => task.id), ['NEW'])
    assert.match(recovered.nextAction, /workflow_plan_review/u)
    const saved = JSON.parse(await readFile(
      join(root, '.dsh-workflow', 'workflows', `${state.id}.json`),
      'utf8',
    ))
    assert.equal(saved.status, 'planned')
    assert.equal(saved.registryDigest, liveDigest)
    assert.equal(saved.plan.registryDigest, liveDigest)
    assert.deepEqual(saved.tasks.map(task => task.taskId), ['NEW'])
    assert.equal(saved.planReview, undefined)
    assert.equal(saved.planApproved, false)
    assert.deepEqual(saved.ownerRuns, {})
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('运行中任务存在时拒绝 Registry 提案与批准', async () => {
  const { root, runtime, agent, state } = await registryWorkflowFixture()
  try {
    const proposal = await runtime.proposeOwnerChange(agent, state.id, addOwnerOperation())
    const path = join(root, '.dsh-workflow', 'workflows', `${state.id}.json`)
    const running = JSON.parse(await readFile(path, 'utf8'))
    running.status = 'running'
    running.tasks = [{ id: 'T1', status: 'running' }]
    running.ownerRuns = { 'T1:registry-owner': { ownerId: 'registry-owner', status: 'running' } }
    await writeFile(path, `${JSON.stringify(running, null, 2)}\n`, 'utf8')

    await assert.rejects(
      runtime.proposeOwnerChange(agent, state.id, addOwnerOperation('second-owner')),
      /运行中|安全边界|活动任务/u,
    )
    await assert.rejects(
      runtime.approveOwnerChange(agent, state.id, proposal.digest),
      /运行中|安全边界|活动任务/u,
    )
    assert.deepEqual((await loadRegistry(state.workflowWorktree)).owners, [])
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

async function pluginToolFixture(status = 'running', options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-plugin-tool-'))
  await git(root, ['init', '-b', 'main'])
  await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
  await git(root, ['config', 'user.name', 'Owner Workflow Test'])
  await writeFile(join(root, 'README.md'), '主工具测试\n', 'utf8')
  await git(root, ['add', 'README.md'])
  await git(root, ['commit', '-m', '初始化主工具测试仓库'])
  const repositoryRoot = (await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' })).stdout.trim()
  const workflowHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })).stdout.trim()

  const workflowId = 'wf-plugin-tool-cancel'
  const workflowBranch = `dsh/workflow/${workflowId}`
  const workflowWorktree = options.materializeWorkflow === true
    ? join(repositoryRoot, '.dsh-workflow', 'worktrees', workflowId, 'workflow')
    : repositoryRoot
  if (options.materializeWorkflow === true) {
    await mkdir(join(repositoryRoot, '.dsh-workflow', 'worktrees', workflowId), { recursive: true })
    await git(repositoryRoot, ['worktree', 'add', '-b', workflowBranch, workflowWorktree, 'HEAD'])
  }
  const statePath = join(root, '.dsh-workflow', 'workflows', `${workflowId}.json`)
  const state = {
    contract: 'DSH_WORKFLOW_STATE_V1',
    id: workflowId,
    root: repositoryRoot,
    baseBranch: 'main',
    baseRef: 'HEAD',
    workflowBranch,
    workflowWorktree,
    status,
    workflowHead,
    ownerRuns: {},
    supervisorOutbox: {},
    tasks: [{ taskId: 'task-1', status: 'running' }],
    revision: 0,
  }
  await mkdir(join(root, '.dsh-workflow', 'workflows'), { recursive: true })
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')

  const tools = []
  let cleanup
  const ctx = {
    skills: { register() {} },
    systemPrompt: { section() {} },
    tools: { register(tool) { tools.push(tool) }, guard() {} },
    userQuestions: {
      async ask(request) {
        return {
          answers: [{
            id: request.questions[0].id,
            selected: [options.decision ?? '同意'],
          }],
        }
      },
    },
    on() { return () => {} },
    effect(factory) { cleanup = factory() },
  }
  applyPlugin(ctx, {})
  return {
    root,
    statePath,
    tools,
    tool: tools.find(item => item.name === 'owner_workflow'),
    exec: { agent: { id: 'tool-agent', session: { id: 'tool-session', header: { cwd: root } } } },
    async dispose() {
      await cleanup?.()
      await rm(root, { recursive: true, force: true })
    },
  }
}

test('主工具公开 cancel 描述且保留 status 旧动作', async () => {
  const fixture = await pluginToolFixture('running')
  try {
    const actions = fixture.tool.parameters.properties.action.enum
    assert.equal(actions.includes('cancel'), true)
    assert.equal(actions.includes('status'), true)
    assert.match(fixture.tool.parameters.properties.action.description, /cancel/u)
    assert.match(fixture.tool.description, /action=cancel.*原生问询.*删除/u)

    const before = await fixture.tool.execute({ action: 'status', workflow_id: 'wf-plugin-tool-cancel' }, fixture.exec)
    assert.equal(before.workflow.status, 'running')
  } finally {
    await fixture.dispose()
  }
})

test('旧聚合入口不再暴露或执行计划修订与规划恢复', async () => {
  const fixture = await pluginToolFixture('planned')
  try {
    const actions = fixture.tool.parameters.properties.action.enum
    for (const action of ['plan_review', 'plan_revise', 'plan_approve', 'workflow_recover']) {
      assert.equal(actions.includes(action), false, action)
    }

    const reviseRedirect = await fixture.tool.execute(
      { action: 'plan_revise', workflow_id: 'wf-plugin-tool-cancel' },
      fixture.exec,
    )
    assert.equal(reviseRedirect.contract, 'DSH_WORKFLOW_LEGACY_ACTION_REDIRECT_V1')
    assert.equal(reviseRedirect.nextTool, 'workflow_plan_revise')

    const recoverRedirect = await fixture.tool.execute(
      { action: 'workflow_recover', workflow_id: 'wf-plugin-tool-cancel' },
      fixture.exec,
    )
    assert.equal(recoverRedirect.contract, 'DSH_WORKFLOW_LEGACY_ACTION_REDIRECT_V1')
    assert.equal(recoverRedirect.nextTool, 'workflow_recover')
  } finally {
    await fixture.dispose()
  }
})

test('旧聚合入口拒绝 start，强制使用带 preflight digest 的单职责工具', async () => {
  const fixture = await pluginToolFixture('running')
  try {
    await assert.rejects(
      fixture.tool.execute({ action: 'start', request: '不应通过旧入口创建工作流' }, fixture.exec),
      /owner_workflow\(action=start\) 已停用/u,
    )
  } finally {
    await fixture.dispose()
  }
})

test('workflow_git_inspect 只提供受限 Git 证据且拒绝 .git 内部路径', async () => {
  const fixture = await pluginToolFixture('running')
  try {
    const tool = fixture.tools.find(item => item.name === 'workflow_git_inspect')
    assert.notEqual(tool, undefined)

    const status = await tool.execute({ action: 'status' }, fixture.exec)
    assert.equal(status.contract, 'DSH_WORKFLOW_GIT_INSPECT_V1')
    assert.equal(status.action, 'status')
    assert.ok(status.changes.every(item => typeof item.path === 'string' && typeof item.code === 'string'))

    const unfiltered = await tool.execute({ action: 'diff', files: [] }, fixture.exec)
    assert.equal(unfiltered.action, 'diff')
    assert.deepEqual(unfiltered.files, [])

    await assert.rejects(
      tool.execute({ action: 'diff', files: ['.git/index'] }, fixture.exec),
      /\.git/u,
    )
  } finally {
    await fixture.dispose()
  }
})

test('Owner 结构化请求工具只暴露 request_subgraph 和 request_handoff 的最小字段', async () => {
  const fixture = await pluginToolFixture('running')
  try {
    const subgraph = fixture.tools.find(item => item.name === 'request_subgraph')
    const handoff = fixture.tools.find(item => item.name === 'request_handoff')
    assert.notEqual(subgraph, undefined)
    assert.notEqual(handoff, undefined)
    assert.deepEqual(Object.keys(subgraph.parameters.properties).sort(), ['proposal', 'task_id', 'workflow_id'])
    assert.deepEqual(Object.keys(handoff.parameters.properties).sort(), ['delta', 'handoff', 'task_id', 'workflow_id'])
    assert.equal(subgraph.parameters.additionalProperties, false)
    assert.equal(handoff.parameters.additionalProperties, false)
    assert.equal(handoff.parameters.properties.handoff.additionalProperties, false)
    assert.deepEqual(
      Object.keys(handoff.parameters.properties.handoff.properties).sort(),
      ['files', 'reason', 'summary', 'targetOwnerId', 'targetType'],
    )
  } finally {
    await fixture.dispose()
  }
})

test('公开 Owner 工具只保留提交关卡、宿主授权桥和结构化协调入口', async () => {
  const fixture = await pluginToolFixture('running')
  try {
    const submit = fixture.tools.find(item => item.name === 'owner_submit')
    const hostExec = fixture.tools.find(item => item.name === 'owner_host_exec')
    assert.notEqual(submit, undefined)
    assert.notEqual(hostExec, undefined)
    assert.deepEqual(Object.keys(submit.parameters.properties), ['report'])
    assert.deepEqual(submit.parameters.required, ['report'])
    assert.equal(submit.parameters.additionalProperties, false)
    assert.deepEqual(hostExec.parameters.required, ['description', 'justification'])
    assert.equal(hostExec.parameters.properties.argv.maxItems, 128)
    for (const removed of ['owner_write', 'owner_edit', 'owner_bash', 'owner_verify', 'owner_repair']) {
      assert.equal(fixture.tools.some(item => item.name === removed), false, removed)
    }
  } finally {
    await fixture.dispose()
  }
})

test('主工具 cancel 缺少 workflow_id 时拒绝', async () => {
  const fixture = await pluginToolFixture('running')
  try {
    await assert.rejects(
      fixture.tool.execute({ action: 'cancel' }, fixture.exec),
      /cancel 动作必须提供 workflow_id/u,
    )
  } finally {
    await fixture.dispose()
  }
})

test('主工具 cancel 返回 cancelled，随后 status 返回 cancelled', async () => {
  const fixture = await pluginToolFixture('running', { materializeWorkflow: true })
  try {
    const cancelled = await fixture.tool.execute(
      { action: 'cancel', workflow_id: 'wf-plugin-tool-cancel' },
      fixture.exec,
    )
    assert.equal(cancelled.status, 'cancelled')

    const status = await fixture.tool.execute(
      { action: 'status', workflow_id: 'wf-plugin-tool-cancel' },
      fixture.exec,
    )
    assert.equal(status.workflow.status, 'cancelled')
    assert.equal(JSON.parse(await readFile(fixture.statePath, 'utf8')).status, 'cancelled')
  } finally {
    await fixture.dispose()
  }
})

test('主工具只暴露 Registry 审批动作，不保留旧 Owner 直写动作', async () => {
  const tools = []
  const ctx = {
    skills: { register() {} },
    systemPrompt: { section() {} },
    tools: { register(tool) { tools.push(tool) }, guard() {} },
    on() { return () => {} },
    effect() {},
  }
  applyPlugin(ctx, {})
  const tool = tools.find(item => item.name === 'owner_workflow')
  const actions = tool.parameters.properties.action.enum
  assert.equal(actions.includes('cancel'), true)
  assert.equal(actions.includes('registry_status'), true)
  assert.equal(actions.includes('owner_change_propose'), true)
  assert.equal(actions.includes('owner_change_approve'), true)
  assert.deepEqual(
    actions.filter(action => ['owner_add', 'owner_remove', 'owner_scope_add', 'owner_scope_remove'].includes(action)),
    [],
  )
  await assert.rejects(
    tool.execute(
      { action: 'owner_add', workflow_id: 'wf-old-bypass', owner: addOwnerOperation().owner },
      { agent: { id: 'tool-agent', session: { id: 'tool-agent', header: { cwd: process.cwd() } } } },
    ),
    /未知的 Owner 工作流动作/u,
  )
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    assert.equal(typeof runtime.addOwner, 'undefined')
  } finally {
    await runtime.dispose()
  }
})

test('DSH_PLAN_V1 所有控制桥和外置执行入口拒绝但 status 可读', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-finish-'))
  const runtime = createOwnerWorkflowRuntime({}, {})
  try {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
    await git(root, ['config', 'user.name', 'Owner Workflow Test'])
    await writeFile(join(root, 'README.md'), '测试\n', 'utf8')
    await git(root, ['add', 'README.md'])
    await git(root, ['commit', '-m', '初始化测试仓库'])
    await runtime.prepareRoot(root)
    const workflowBranch = 'dsh/workflow/wf-owner-finish'
    const workflowWorktree = join(root, '.dsh-workflow', 'worktrees', 'wf-owner-finish', 'workflow')
    await git(root, ['worktree', 'add', '-b', workflowBranch, workflowWorktree, 'HEAD'])
    const owner = { id: 'finish-owner', name: 'Finish Owner', description: '结算测试', scope: ['README.md'], exclude: [] }
    let registry = await ensureRegistry(workflowWorktree)
    registry = await applyRegistryOperation(workflowWorktree, registry, {
      type: 'add',
      owner,
      reason: '为结算 fixture 登记正式 Owner',
    })
    const plan = {
      contract: 'DSH_PLAN_V1',
      summary: '结算测试计划',
      owners: [owner],
      stages: [{ id: 'stage-1', name: '阶段', dependsOn: [], tasks: [{ id: 'task-1', ownerId: owner.id, title: '任务', description: '任务' }] }],
    }
    const planDigest = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
    const state = {
      contract: 'DSH_WORKFLOW_STATE_V1',
      id: 'wf-owner-finish',
      root,
      status: 'approved',
      attempt: 0,
      workflowBranch,
      workflowWorktree,
      plan,
      planDigest,
      registryDigest: registryContentDigest(registry),
      planReview: { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '通过', issues: [] },
      planReviewDigest: planDigest,
      planApproved: true,
      completedStages: [],
      stageResults: [],
      ownerRuns: {},
      ownerSessions: {},
    }
    const agent = { id: 'finish-agent', session: { id: 'finish-agent', header: { cwd: root } } }
    state.root = await runtime.resolveRoot(agent)
    await writeFile(join(root, '.dsh-workflow', 'workflows', `${state.id}.json`), `${JSON.stringify(state)}\n`, 'utf8')
    const fixedCommit = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })).stdout.trim()
    runtime.createOwnerEntry = async () => ({ owner, tasks: plan.stages[0].tasks, branch: 'main', worktree: root, baseCommit: fixedCommit, stageId: 'stage-1' })
    runtime.runOwnerEntry = async () => ({
      ownerId: owner.id,
      branch: 'main',
      worktree: root,
      baseCommit: fixedCommit,
      commitSha: fixedCommit,
      sessionId: 'owner-session-finish',
      report: { summary: '执行完成', changes: [], tests: [] },
      changedFiles: [],
      ahead: 0,
    })
    const manifest = await runtime.ensureControlBridge(agent, state)
    const status = await request(manifest, 'status')
    assert.equal(status.workflow.status, 'approved')

    const assertV1ExecutionDenied = (label, operation) => assert.rejects(
      operation,
      /DSH_PLAN_V1|V1|只读|不能执行|V2/u,
      label,
    )
    for (const action of ['run-owner', 'owner-sync', 'owner-finish', 'owner-recover', 'merge-stage']) {
      await assertV1ExecutionDenied(
        `控制桥 ${action} 必须拒绝 V1`,
        request(manifest, action, {
          stageId: 'stage-1',
          ownerId: owner.id,
        }),
      )
    }
    for (const action of ['supervisor-start', 'supervisor-next', 'supervisor-ack', 'supervisor-stop']) {
      await assertV1ExecutionDenied(
        `控制桥 ${action} 必须拒绝 V1`,
        request(manifest, action, { actionId: 'forged-action' }),
      )
    }
    await assert.rejects(
      runtime.runExternalOwner(agent, state.id, 'stage-1', owner.id, undefined, { deferFinish: true }),
      /V1|只读|不能执行|V2/u,
    )
    const persisted = JSON.parse(await readFile(join(root, '.dsh-workflow', 'workflows', `${state.id}.json`), 'utf8'))
    persisted.ownerRuns = {
      'stage-1:finish-owner': {
        status: 'completed',
        ownerId: owner.id,
        stageId: 'stage-1',
        result: { branch: 'main', worktree: root, commitSha: fixedCommit },
      },
    }
    await writeFile(join(root, '.dsh-workflow', 'workflows', `${state.id}.json`), `${JSON.stringify(persisted)}\n`, 'utf8')
    await assert.rejects(
      runtime.runExternalOwner(agent, state.id, 'stage-1', owner.id),
      /V1|只读|不能执行|V2/u,
    )
    persisted.ownerRuns['stage-1:finish-owner'].status = 'awaiting_finish'
    await writeFile(join(root, '.dsh-workflow', 'workflows', `${state.id}.json`), `${JSON.stringify(persisted)}\n`, 'utf8')
    await assert.rejects(
      runtime.runExternalOwner(agent, state.id, 'stage-1', owner.id, undefined, { deferFinish: true }),
      /V1|只读|不能执行|V2/u,
    )
    await assert.rejects(
      runtime.finishOwner(agent, state.id, 'stage-1', owner.id),
      /V1|只读|不能执行|V2/u,
    )
    await assert.rejects(
      runtime.recoverOwner(agent, state.id, 'stage-1', owner.id),
      /V1|只读|不能执行|V2/u,
    )
    await assert.rejects(
      runtime.mergeExternalStage(agent, state.id, 'stage-1'),
      /V1|只读|不能执行|V2/u,
    )
    await assert.rejects(
      runtime.recoverWorkflow(agent, state.id),
      /V1|只读|不能执行|V2/u,
    )
    await assert.rejects(
      runtime.finalizeWorkflow(agent, state.id),
      /V1|只读|不能执行|V2/u,
    )
  } finally {
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

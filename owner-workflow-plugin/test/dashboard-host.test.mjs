import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply, createDashboardHandler } from '../dashboard-host.mjs'
import { writeProgressProjection } from '../src/dashboard.mjs'
import { registerDashboardWorkspace } from '../src/dashboard.mjs'
import { createOperationState, writeOperationState } from '../src/operation.mjs'

async function workspaceFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-dashboard-host-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

async function listen(handler) {
  const server = createServer((request, response) => { void handler(request, response) })
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen({ host: '127.0.0.1', port: 0 }, resolveListen)
  })
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: async () => new Promise(resolveClose => server.close(resolveClose)),
  }
}

async function readSseData(reader, initial = '') {
  let buffer = initial
  const decoder = new TextDecoder()
  while (true) {
    const boundary = buffer.indexOf('\n\n')
    if (boundary !== -1) {
      const frame = buffer.slice(0, boundary)
      const rest = buffer.slice(boundary + 2)
      const data = frame.split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart())
        .join('\n')
      if (data !== '') return { value: JSON.parse(data), rest }
      buffer = rest
      continue
    }
    const next = await reader.read()
    if (next.done) throw new Error('SSE 在收到数据前结束')
    buffer += decoder.decode(next.value, { stream: true })
  }
}

test('等待列表 SSE 由文件事件驱动，不运行周期轮询', async () => {
  const source = await readFile(new URL('../src/dashboard.mjs', import.meta.url), 'utf8')
  const start = source.indexOf('export async function serveDashboardWaitEvents')
  const end = source.indexOf('\nfunction projectionEvents', start)
  assert.ok(start >= 0 && end > start)
  const streamSource = source.slice(start, end)
  assert.doesNotMatch(streamSource, /setInterval/u)
  assert.doesNotMatch(source, /WAIT_STREAM_RECONCILE_MS/u)
})

test('内嵌 Dashboard 页面、目录与 DAG 快照都从固定工作区只读提供', async t => {
  const root = await workspaceFixture(t)
  const workflowId = 'wf-dashboard-host'
  await writeProgressProjection(root, {
    workflowId,
    status: 'running',
    summary: 'Dashboard 集成测试',
    tasks: [{
      id: 'TASK-1',
      ownerId: 'frontend',
      role: 'work',
      title: '渲染状态面板',
      dependsOn: [],
      status: 'running',
    }],
  })
  const operation = createOperationState({
    root,
    operationId: 'op-dashboard-host',
    parentSessionId: 'main-session',
    childId: 'operator-session',
    spec: {
      goal: '检查 Android VPN 当前状态',
      context: [],
      constraints: ['不修改项目文件'],
      successCriteria: ['返回诊断证据'],
      capabilities: ['project-read', 'shell'],
    },
  })
  operation.status = 'waiting_approval'
  operation.pending = {
    kind: 'approval',
    id: 'approval-dashboard',
    question: '是否允许切换 Wi-Fi？',
    action: '短暂关闭 Wi-Fi',
    risk: '网络会短暂中断',
    command: 'adb shell svc wifi disable',
  }
  operation.approvals['approval-dashboard'] = {
    id: 'approval-dashboard',
    command: 'adb shell svc wifi disable',
    action: '短暂关闭 Wi-Fi',
    risk: '网络会短暂中断',
    status: 'pending',
    requestedAt: new Date(Date.parse(operation.createdAt) + 5_000).toISOString(),
  }
  await writeOperationState(root, operation)
  const dashboard = await listen(createDashboardHandler(root))
  t.after(() => dashboard.close())

  const page = await fetch(`${dashboard.url}/owner-workflow`)
  assert.equal(page.status, 200)
  const pageText = await page.text()
  assert.match(pageText, /Owner Workflow Dashboard/u)
  assert.match(pageText, /后台 Operation/u)
  assert.equal(page.headers.get('content-security-policy')?.includes("connect-src 'self'"), true)

  const catalog = await fetch(`${dashboard.url}/owner-workflow/api/workflows`)
  assert.deepEqual(await catalog.json(), {
    workflows: [{
      workflowId,
      status: 'running',
      summary: 'Dashboard 集成测试',
      taskCount: 1,
    }],
  })

  const snapshot = await fetch(`${dashboard.url}/owner-workflow/api/snapshot?workflow_id=${workflowId}`)
  assert.equal(snapshot.status, 200)
  assert.deepEqual(await snapshot.json(), {
    workflowId,
    status: 'running',
    summary: 'Dashboard 集成测试',
    tasks: [{
      id: 'TASK-1',
      ownerId: 'frontend',
      role: 'work',
      title: '渲染状态面板',
      dependsOn: [],
      status: 'running',
    }],
    events: [],
  })

  const operations = await fetch(`${dashboard.url}/owner-workflow/api/operations`)
  assert.deepEqual(await operations.json(), {
    operations: [{
      operationId: 'op-dashboard-host',
      status: 'waiting_approval',
      goal: '检查 Android VPN 当前状态',
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
    }],
  })
  const operationSnapshot = await fetch(`${dashboard.url}/owner-workflow/api/operation?operation_id=op-dashboard-host`)
  const operationBody = await operationSnapshot.json()
  assert.equal(operationBody.pending.question, '是否允许切换 Wi-Fi？')
  assert.equal(Object.hasOwn(operationBody.pending, 'command'), false)
  assert.equal(Object.hasOwn(operationBody, 'root'), false)
  assert.equal(Object.hasOwn(operationBody, 'childId'), false)

  const waitsResponse = await fetch(`${dashboard.url}/owner-workflow/api/waits`)
  assert.equal(waitsResponse.status, 200)
  const waitsBody = await waitsResponse.json()
  assert.equal(waitsBody.contract, 'DSH_RUNTIME_STATUS_V1')
  assert.equal(waitsBody.runner.process, 'offline')
  assert.equal(waitsBody.runner.assignment, 'offline')
  assert.equal(waitsBody.workspaces[0].operations[0].status, 'waiting_approval')
  assert.deepEqual(waitsBody.staleWaits, [])
  assert.deepEqual(waitsBody.waits.map(item => ({
    id: item.id,
    sessionId: item.sessionId,
    state: item.state,
    waitingFor: item.waitingFor,
    goal: item.goal,
    detail: item.detail,
    action: item.action,
    risk: item.risk,
  })), [{
    id: 'operation:op-dashboard-host',
    sessionId: 'main-session',
    state: 'waiting_user_approval',
    waitingFor: '用户授权决定',
    goal: '检查 Android VPN 当前状态',
    detail: '是否允许切换 Wi-Fi？',
    action: '短暂关闭 Wi-Fi',
    risk: '网络会短暂中断',
  }])
  assert.equal(Object.hasOwn(waitsBody.waits[0], 'command'), false)
  assert.equal(Object.hasOwn(waitsBody.waits[0], 'root'), false)
  assert.equal(waitsBody.waits[0].startedAt, operation.approvals['approval-dashboard'].requestedAt)
})

test('等待列表 SSE 立即发送快照并在磁盘状态变化后推送新快照', async t => {
  const root = await workspaceFixture(t)
  const operation = createOperationState({
    root,
    operationId: 'op-waits-stream',
    parentSessionId: 'main-session',
    childId: 'operator-session',
    spec: {
      goal: '等待 SSE 测试授权',
      context: [],
      constraints: ['只用于测试'],
      successCriteria: ['收到推送'],
      capabilities: ['shell'],
    },
  })
  operation.status = 'waiting_approval'
  operation.pending = {
    kind: 'approval', id: 'approval-stream', question: '允许测试吗？',
    action: '运行测试动作', risk: '无', command: 'true',
  }
  operation.approvals['approval-stream'] = {
    id: 'approval-stream', command: 'true', action: '运行测试动作', risk: '无',
    status: 'pending', requestedAt: operation.createdAt,
  }
  await writeOperationState(root, operation)

  const dashboard = await listen(createDashboardHandler(root))
  const controller = new AbortController()
  t.after(async () => {
    controller.abort()
    await dashboard.close()
  })
  const response = await fetch(`${dashboard.url}/owner-workflow/api/waits/events`, { signal: controller.signal })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8')
  const reader = response.body.getReader()
  const initial = await readSseData(reader)
  assert.deepEqual(initial.value.waits.map(item => item.operationId), ['op-waits-stream'])

  operation.status = 'completed'
  operation.pending = null
  operation.updatedAt = new Date(Date.parse(operation.updatedAt) + 1_000).toISOString()
  await writeOperationState(root, operation)
  const changed = await Promise.race([
    readSseData(reader, initial.rest),
    new Promise((_, reject) => setTimeout(() => reject(new Error('等待列表 SSE 未推送状态变化')), 4_000)),
  ])
  assert.deepEqual(changed.value.waits, [])
  controller.abort()
})

test('等待列表把旧版复合授权和已被相同动作取代的 Operation 归入遗留记录', async t => {
  const root = await workspaceFixture(t)
  const parentSessionId = 'main-session'
  const command = 'adb -s device shell input tap 720 596'
  const superseded = createOperationState({
    root,
    operationId: 'op-superseded',
    parentSessionId,
    childId: 'operator-old',
    time: '2026-08-21T10:00:00.000Z',
    spec: {
      goal: '点击连接按钮',
      context: [],
      constraints: ['只执行一次'],
      successCriteria: ['返回连接状态'],
      capabilities: ['shell'],
    },
  })
  superseded.status = 'waiting_approval'
  superseded.pending = {
    kind: 'approval',
    id: 'approval-old',
    question: '是否允许点击连接按钮？',
    action: '点击连接按钮',
    risk: '会改变设备网络状态',
    command,
  }
  superseded.approvals['approval-old'] = {
    id: 'approval-old',
    command,
    action: '点击连接按钮',
    risk: '会改变设备网络状态',
    status: 'pending',
    requestedAt: superseded.updatedAt,
  }
  await writeOperationState(root, superseded)

  const replacement = createOperationState({
    root,
    operationId: 'op-replacement',
    parentSessionId,
    childId: 'operator-new',
    time: '2026-08-21T10:01:00.000Z',
    spec: {
      goal: '重新点击连接按钮',
      context: [],
      constraints: ['只执行一次'],
      successCriteria: ['返回连接状态'],
      capabilities: ['shell'],
    },
  })
  replacement.status = 'completed'
  replacement.approvals['approval-new'] = {
    id: 'approval-new',
    command,
    action: '点击连接按钮',
    risk: '会改变设备网络状态',
    status: 'consumed',
    requestedAt: replacement.createdAt,
    consumedAt: replacement.updatedAt,
  }
  await writeOperationState(root, replacement)

  const legacy = createOperationState({
    root,
    operationId: 'op-legacy-compound',
    parentSessionId,
    childId: 'operator-legacy',
    time: '2026-08-21T09:00:00.000Z',
    spec: {
      goal: '读取多项 Android 状态',
      context: [],
      constraints: ['只读'],
      successCriteria: ['返回诊断结果'],
      capabilities: ['shell'],
    },
  })
  const legacyCommand = 'adb devices -l && adb shell dumpsys vpn'
  legacy.status = 'waiting_approval'
  legacy.pending = {
    kind: 'approval',
    id: 'approval-legacy',
    question: '是否允许读取设备状态？',
    action: '读取设备状态',
    risk: '会访问已连接设备',
    command: legacyCommand,
  }
  legacy.approvals['approval-legacy'] = {
    id: 'approval-legacy',
    command: legacyCommand,
    action: '读取设备状态',
    risk: '会访问已连接设备',
    status: 'pending',
    requestedAt: legacy.updatedAt,
  }
  await writeOperationState(root, legacy)

  const dashboard = await listen(createDashboardHandler(root))
  t.after(() => dashboard.close())
  const body = await (await fetch(`${dashboard.url}/owner-workflow/api/waits`)).json()
  assert.equal(body.contract, 'DSH_RUNTIME_STATUS_V1')
  assert.deepEqual(body.waits, [])
  assert.deepEqual(body.staleWaits.map(item => ({
    operationId: item.operationId,
    staleCode: item.staleCode,
    supersededBy: item.supersededBy,
  })), [{
    operationId: 'op-superseded',
    staleCode: 'superseded',
    supersededBy: 'op-replacement',
  }, {
    operationId: 'op-legacy-compound',
    staleCode: 'legacy_compound_command',
    supersededBy: undefined,
  }])
  assert.ok(body.staleWaits.every(item => Object.hasOwn(item, 'command') === false))
})

test('等待列表投影 Runner 接管、未执行、执行中和依赖任务数量', async t => {
  const root = await workspaceFixture(t)
  const workflowDirectory = join(root, '.dsh-workflow', 'workflows')
  const runnerDirectory = join(root, '.dsh-workflow', 'runner')
  await mkdir(workflowDirectory, { recursive: true })
  await mkdir(runnerDirectory, { recursive: true })
  const workspaceId = createHash('sha256').update(root).digest('hex').slice(0, 20)
  const planTasks = [
    { id: 'T1', role: 'work', ownerId: 'code-owner', title: '任务一', dependsOn: [], write: ['src/a.js'], verify: ['unit'], done: ['完成'] },
    { id: 'T2', role: 'work', ownerId: 'code-owner', title: '任务二', dependsOn: ['T1'], write: ['src/b.js'], verify: ['unit'], done: ['完成'] },
    { id: 'T3', role: 'verify', ownerId: 'code-owner', title: '任务三', dependsOn: ['T2'], write: [], verify: ['unit'], done: ['完成'] },
  ]
  const base = {
    contract: 'DSH_WORKFLOW_STATE_V2',
    root,
    planApprovedBy: 'main-session',
    planApprovedAt: '2026-08-22T01:00:00.000Z',
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T01:00:00.000Z',
    plan: { contract: 'DSH_PLAN_V2', summary: '执行状态测试', tasks: planTasks },
  }
  await writeFile(join(workflowDirectory, 'wf-waiting.json'), `${JSON.stringify({
    ...base,
    id: 'wf-waiting',
    status: 'approved',
    tasks: planTasks.map(task => ({ taskId: task.id, status: 'pending' })),
    ownerRuns: {},
  }, null, 2)}\n`, 'utf8')
  await writeFile(join(workflowDirectory, 'wf-running.json'), `${JSON.stringify({
    ...base,
    id: 'wf-running',
    status: 'running',
    updatedAt: '2026-08-22T01:01:00.000Z',
    tasks: [
      { taskId: 'T1', status: 'running' },
      { taskId: 'T2', status: 'pending' },
      { taskId: 'T3', status: 'pending' },
    ],
    ownerRuns: { 'T1:code-owner': { taskId: 'T1', ownerId: 'code-owner', status: 'running' } },
  }, null, 2)}\n`, 'utf8')
  await writeFile(join(workflowDirectory, 'wf-revision.json'), `${JSON.stringify({
    ...base,
    id: 'wf-revision',
    status: 'running',
    conversationRootSessionId: 'workflow-root-session',
    pendingPlanRevision: {
      number: 2,
      planDigest: 'f'.repeat(64),
      review: { status: 'passed' },
    },
    tasks: planTasks.map(task => ({ taskId: task.id, status: 'pending' })),
    ownerRuns: {},
  }, null, 2)}\n`, 'utf8')
  await writeFile(join(workflowDirectory, 'wf-approval.json'), `${JSON.stringify({
    ...base,
    id: 'wf-approval',
    status: 'running',
    tasks: [
      { taskId: 'T1', status: 'running' },
      { taskId: 'T2', status: 'pending' },
      { taskId: 'T3', status: 'pending' },
    ],
    ownerRuns: {
      'T1:code-owner': {
        taskId: 'T1',
        ownerId: 'code-owner',
        status: 'waiting_approval',
        sessionId: 'owner-approval-session',
        pendingApprovalId: 'oa-dashboard',
      },
    },
  }, null, 2)}\n`, 'utf8')
  await writeFile(join(runnerDirectory, 'daemon.json'), `${JSON.stringify({
    contract: 'DSH_WORKFLOW_RUNNER_DAEMON_V1',
    status: 'running',
    pid: process.pid,
    pollMs: 1000,
    heartbeatAt: new Date().toISOString(),
    activeWorkflows: [{ workspaceId, workflowId: 'wf-running', pid: process.pid }],
  }, null, 2)}\n`, 'utf8')

  const dashboard = await listen(createDashboardHandler(root))
  t.after(() => dashboard.close())
  const body = await (await fetch(`${dashboard.url}/owner-workflow/api/waits`)).json()
  assert.equal(body.contract, 'DSH_RUNTIME_STATUS_V1')
  assert.equal(body.runner.process, 'online')
  assert.equal(body.runner.assignment, 'supervising')
  const workflows = new Map(body.workspaces[0].workflows.map(item => [item.workflowId, item]))
  assert.deepEqual({
    phase: workflows.get('wf-waiting').phase,
    pending: workflows.get('wf-waiting').execution.pendingTasks,
    running: workflows.get('wf-waiting').execution.runningTasks,
  }, { phase: 'runner_queued', pending: 3, running: 0 })
  assert.deepEqual({
    phase: workflows.get('wf-running').phase,
    pending: workflows.get('wf-running').execution.pendingTasks,
    running: workflows.get('wf-running').execution.runningTasks,
    dependencies: workflows.get('wf-running').execution.waitingDependencyTasks,
  }, { phase: 'owner_running', pending: 2, running: 1, dependencies: 2 })
  const waits = new Map(body.waits.map(item => [item.workflowId, item]))
  assert.deepEqual({
    state: waits.get('wf-revision').state,
    sessionId: waits.get('wf-revision').sessionId,
    statusText: waits.get('wf-revision').statusText,
  }, {
    state: 'waiting_workflow_decision',
    sessionId: 'workflow-root-session',
    statusText: 'PlanRevision 2 已通过独立审查，等待用户决定',
  })
  assert.deepEqual({
    state: waits.get('wf-approval').state,
    sessionId: waits.get('wf-approval').sessionId,
    statusText: waits.get('wf-approval').statusText,
  }, {
    state: 'waiting_owner_approval',
    sessionId: 'owner-approval-session',
    statusText: 'Owner 子代理正在等待宿主授权',
  })
  assert.ok(body.waits.every(item => !Object.hasOwn(item, 'root') && !Object.hasOwn(item, 'pid')))
})

test('运行状态投影 Harness 主线程、子代理和未启动 Reviewer 的确定性生命周期', async t => {
  const root = await workspaceFixture(t)
  const workflowDirectory = join(root, '.dsh-workflow', 'workflows')
  const agentDirectory = join(root, '.dsh-workflow', 'runtime', 'agents')
  await mkdir(workflowDirectory, { recursive: true })
  await mkdir(agentDirectory, { recursive: true })
  const task = {
    id: 'T1', role: 'work', ownerId: 'app', title: '实现状态', dependsOn: [],
    write: ['src/**'], verify: ['unit'], done: ['完成'],
  }
  const base = {
    contract: 'DSH_WORKFLOW_STATE_V2',
    root,
    planApproved: false,
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:01:00.000Z',
    plan: { contract: 'DSH_PLAN_V2', summary: '确定性状态测试', tasks: [task] },
    tasks: [{ taskId: 'T1', status: 'pending' }],
    ownerRuns: {},
  }
  await writeFile(join(workflowDirectory, 'wf-reviewing.json'), `${JSON.stringify({
    ...base,
    id: 'wf-reviewing',
    status: 'planned',
    orchestratorSessionId: 'main-live',
    planningAgent: { childId: 'planner-idle', phase: 'reviewing', updatedAt: base.updatedAt },
  }, null, 2)}\n`, 'utf8')
  await writeFile(join(workflowDirectory, 'wf-stalled.json'), `${JSON.stringify({
    ...base,
    id: 'wf-stalled',
    status: 'planned',
    orchestratorSessionId: 'main-stalled',
  }, null, 2)}\n`, 'utf8')
  const writeAgent = async state => writeFile(
    join(agentDirectory, `${createHash('sha256').update(state.sessionId).digest('hex')}.json`),
    `${JSON.stringify({
      contract: 'DSH_AGENT_RUNTIME_STATUS_V1',
      runtimeId: 'runtime-test',
      processId: process.pid,
      parentSessionId: null,
      workflowId: 'wf-reviewing',
      operationId: null,
      taskId: null,
      ownerId: null,
      updatedAt: base.updatedAt,
      ...state,
    }, null, 2)}\n`,
    'utf8',
  )
  await writeAgent({ sessionId: 'main-live', role: 'main', lifecycle: 'idle' })
  await writeAgent({ sessionId: 'planner-idle', parentSessionId: 'main-live', role: 'planner', lifecycle: 'idle' })
  await writeAgent({ sessionId: 'reviewer-running', parentSessionId: 'main-live', role: 'plan-reviewer', lifecycle: 'running' })

  const dashboard = await listen(createDashboardHandler(root))
  t.after(() => dashboard.close())
  const body = await (await fetch(`${dashboard.url}/owner-workflow/api/waits`)).json()
  const workflows = new Map(body.workspaces[0].workflows.map(item => [item.workflowId, item]))
  assert.equal(workflows.get('wf-reviewing').phase, 'plan_reviewing')
  assert.equal(workflows.get('wf-reviewing').mainThread.lifecycle, 'idle')
  assert.deepEqual(workflows.get('wf-reviewing').subagents.map(item => [item.role, item.lifecycle]), [
    ['planner', 'idle'],
    ['plan-reviewer', 'running'],
  ])
  assert.equal(workflows.get('wf-stalled').phase, 'plan_review_not_started')
  assert.equal(workflows.get('wf-stalled').subagents.find(item => item.role === 'plan-reviewer').lifecycle, 'not_started')
  assert.equal(body.waits.find(item => item.workflowId === 'wf-stalled').state, 'workflow_stalled')
  assert.ok(body.workspaces.every(workspace => !Object.hasOwn(workspace, 'root')))
  assert.ok(body.workspaces.flatMap(workspace => workspace.agents).every(agent => !Object.hasOwn(agent, 'processId')))
})

test('内嵌 Dashboard 拒绝写入方法、非法 workflow id 与未知路径', async t => {
  const root = await workspaceFixture(t)
  const dashboard = await listen(createDashboardHandler(root))
  t.after(() => dashboard.close())

  const post = await fetch(`${dashboard.url}/owner-workflow/api/workflows`, { method: 'POST' })
  assert.equal(post.status, 405)
  assert.equal(post.headers.has('access-control-allow-origin'), false)

  const invalid = await fetch(`${dashboard.url}/owner-workflow/api/snapshot?workflow_id=../outside`)
  assert.equal(invalid.status, 404)
  assert.doesNotMatch(await invalid.text(), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  const invalidOperation = await fetch(`${dashboard.url}/owner-workflow/api/operation?operation_id=../outside`)
  assert.equal(invalidOperation.status, 404)
  assert.doesNotMatch(await invalidOperation.text(), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  const unknown = await fetch(`${dashboard.url}/owner-workflow/api/command`)
  assert.equal(unknown.status, 404)
})

test('Dashboard 使用 opaque workspace_id 观察已登记业务工作区，不接受浏览器路径', async t => {
  const catalogRoot = await workspaceFixture(t)
  const businessRoot = await mkdtemp(join(tmpdir(), 'dsh-dashboard-business-'))
  t.after(() => rm(businessRoot, { recursive: true, force: true }))
  const registered = await registerDashboardWorkspace(catalogRoot, businessRoot)
  const operation = createOperationState({
    root: businessRoot,
    operationId: 'op-business-workspace',
    parentSessionId: 'main-session',
    childId: 'operator-session',
    spec: {
      goal: '检查业务工作区设备状态',
      context: [],
      constraints: ['只读'],
      successCriteria: ['返回结果'],
      capabilities: ['shell'],
    },
  })
  operation.status = 'running'
  await writeOperationState(businessRoot, operation)
  const dashboard = await listen(createDashboardHandler(catalogRoot))
  t.after(() => dashboard.close())

  const workspaceResponse = await fetch(`${dashboard.url}/owner-workflow/api/workspaces`)
  const workspaces = (await workspaceResponse.json()).workspaces
  assert.ok(workspaces.some(item => item.workspaceId === registered.workspaceId))
  assert.ok(workspaces.every(item => Object.hasOwn(item, 'root') === false))

  const operations = await fetch(`${dashboard.url}/owner-workflow/api/operations?workspace_id=${registered.workspaceId}`)
  assert.deepEqual((await operations.json()).operations.map(item => item.operationId), ['op-business-workspace'])

  const invalid = await fetch(`${dashboard.url}/owner-workflow/api/operations?workspace_id=../${encodeURIComponent(businessRoot)}`)
  assert.equal(invalid.status, 400)
  assert.doesNotMatch(await invalid.text(), new RegExp(businessRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('Dashboard 宿主路由随 Cordis 插件生命周期注册和释放', () => {
  let route
  let disposed = false
  let cleanup
  const ctx = {
    webServer: {
      register(value) {
        route = value
        return () => { disposed = true }
      },
    },
    effect(factory) {
      cleanup = factory()
    },
  }
  apply(ctx, { root: process.cwd() })
  assert.equal(route.kind, 'prefix')
  assert.equal(route.path, '/owner-workflow')
  assert.equal(disposed, false)
  cleanup()
  assert.equal(disposed, true)
})

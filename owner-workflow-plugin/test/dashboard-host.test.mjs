import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
    requestedAt: operation.updatedAt,
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
  assert.equal(waitsBody.contract, 'DSH_WAIT_LIST_V3')
  assert.equal(waitsBody.runner.status, 'offline')
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
  assert.equal(body.contract, 'DSH_WAIT_LIST_V3')
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
  assert.equal(body.contract, 'DSH_WAIT_LIST_V3')
  assert.equal(body.runner.status, 'online')
  const waits = new Map(body.waits.map(item => [item.workflowId, item]))
  assert.deepEqual({
    state: waits.get('wf-waiting').state,
    pending: waits.get('wf-waiting').pendingTasks,
    running: waits.get('wf-waiting').runningTasks,
  }, { state: 'waiting_runner', pending: 3, running: 0 })
  assert.deepEqual({
    state: waits.get('wf-running').state,
    pending: waits.get('wf-running').pendingTasks,
    running: waits.get('wf-running').runningTasks,
    dependencies: waits.get('wf-running').waitingDependencyTasks,
  }, { state: 'running_owner', pending: 2, running: 1, dependencies: 2 })
  assert.ok(body.waits.every(item => !Object.hasOwn(item, 'root') && !Object.hasOwn(item, 'pid')))
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

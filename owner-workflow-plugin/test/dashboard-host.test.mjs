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
      const event = frame.split('\n')
        .find(line => line.startsWith('event:'))
        ?.slice(6).trimStart()
      const data = frame.split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart())
        .join('\n')
      if (data !== '') return { value: JSON.parse(data), rest, event }
      buffer = rest
      continue
    }
    const next = await reader.read()
    if (next.done) throw new Error('SSE 在收到数据前结束')
    buffer += decoder.decode(next.value, { stream: true })
  }
}

test('等待列表 SSE 同时使用文件事件、周期基线重拉和 heartbeat', async () => {
  const source = await readFile(new URL('../src/dashboard.mjs', import.meta.url), 'utf8')
  const start = source.indexOf('export async function serveDashboardWaitEvents')
  const end = source.indexOf('\nfunction projectionEvents', start)
  assert.ok(start >= 0 && end > start)
  const streamSource = source.slice(start, end)
  assert.match(streamSource, /setInterval\(schedulePublish, DASHBOARD_BASELINE_POLL_MS\)/u)
  assert.match(streamSource, /: heartbeat/u)
})

test('Dashboard 用全局 catalog 读取唯一 Runner，同时默认只登记当前业务工作区', async t => {
  const catalog = await workspaceFixture(t)
  const workspace = await workspaceFixture(t)
  await mkdir(join(catalog, '.dsh-workflow', 'runner'), { recursive: true })
  await writeFile(join(catalog, '.dsh-workflow', 'runner', 'daemon.json'), `${JSON.stringify({
    contract: 'DSH_WORKFLOW_RUNNER_DAEMON_V1',
    status: 'running',
    generation: 7,
    pollMs: 1000,
    heartbeatAt: new Date().toISOString(),
    activeWorkflows: [],
  }, null, 2)}\n`, 'utf8')
  const dashboard = await listen(createDashboardHandler(workspace, { catalogRoot: catalog }))
  t.after(() => dashboard.close())

  const workspaces = await (await fetch(`${dashboard.url}/owner-workflow/api/workspaces`)).json()
  assert.match(await readFile(join(catalog, '.dsh-workflow', '.gitignore'), 'utf8'), /\*\n!\.gitignore\n$/u)
  assert.deepEqual(workspaces.workspaces.map(item => item.workspaceId), [
    createHash('sha256').update(workspace).digest('hex').slice(0, 20),
  ])
  const status = await (await fetch(`${dashboard.url}/owner-workflow/api/waits`)).json()
  assert.equal(status.runner.process, 'online')
  assert.equal(status.runner.generation, 7)
  assert.equal(status.workspaces.length, 1)
  assert.equal(status.workspaces[0].workspaceId, workspaces.workspaces[0].workspaceId)
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
  assert.match(pageText, /min-width:\s*1000px/u)
  assert.match(pageText, /max-width:\s*none/u)
  assert.match(pageText, /new EventSource/u)
  assert.match(pageText, /api\/snapshot\/events/u)
  assert.match(pageText, /stream\.onmessage/u)
  assert.match(pageText, /awaiting_main_discussion:\s*'等待主线程讨论'/u)
  assert.doesNotMatch(pageText, /setInterval\(\(\) => void load\(\), 3000\)/u)
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

test('Dashboard 把可自治的计划审查失败显示为 Runner 恢复，而不是用户动作', async t => {
  const root = await workspaceFixture(t)
  const workflowId = 'wf-review-failed-dashboard'
  const plan = {
    contract: 'DSH_PLAN_V2',
    registryDigest: 'a'.repeat(64),
    summary: '审查未通过的计划',
    owners: [{ id: 'web', name: 'Web', description: 'Web Owner', scope: ['src/**'], exclude: [] }],
    verifications: [{ id: 'unit', run: ['node', '--test'] }],
    tasks: [{
      id: 'T1', role: 'work', ownerId: 'web', title: '实现页面', dependsOn: [],
      write: ['src/**'], verify: ['unit'], done: ['页面完成'],
      priority: 100,
      onFailure: { action: 'repair_owner', maxAttempts: 2 },
      onBlocked: { action: 'notify_main' },
      onTimeout: { action: 'notify_main', afterMs: 180000 },
    }],
  }
  await writeProgressProjection(root, {
    id: workflowId,
    status: 'planned',
    orchestratorSessionId: 'main-session-review-failed',
    plan,
    planDigest: 'plan-digest',
    planReview: {
      contract: 'DSH_PLAN_REVIEW_V1',
      status: 'needs_revision',
      summary: '固定验证仍不完整',
      issues: [{ title: '缺少运行时验收' }, { title: '清理范围不闭合' }],
    },
    planningAgent: { phase: 'review_failed', automaticRevisionExhausted: true },
    tasks: [{ taskId: 'T1', status: 'pending', executorId: null, cursor: null, unchangedPolls: 0 }],
    ownerRuns: {},
  })
  const dashboard = await listen(createDashboardHandler(root))
  t.after(() => dashboard.close())

  const snapshot = await (await fetch(`${dashboard.url}/owner-workflow/api/snapshot?workflow_id=${workflowId}`)).json()
  assert.equal(snapshot.status, 'planned')
  assert.equal(snapshot.phase, 'plan_revision_recovery_queued')
  assert.deepEqual(snapshot.review, {
    status: 'needs_revision',
    summary: '固定验证仍不完整',
    issueCount: 2,
  })
  assert.equal(snapshot.action, undefined)
  const workflows = (await (await fetch(`${dashboard.url}/owner-workflow/api/workflows`)).json()).workflows
  assert.deepEqual(workflows.map(item => ({
    workflowId: item.workflowId,
    status: item.status,
    phase: item.phase,
    actionRequired: item.actionRequired,
  })), [{
    workflowId,
    status: 'planned',
    phase: 'plan_revision_recovery_queued',
    actionRequired: undefined,
  }])
})

test('Dashboard 展示 Owner 会诊、abstract 层级和 Reviewer 指定的拆分阶段', async t => {
  const root = await workspaceFixture(t)
  const workflowId = 'wf-progressive-dag-dashboard'
  const state = {
    id: workflowId,
    status: 'planned',
    orchestratorSessionId: 'main-session-progressive-dag',
    plan: {
      contract: 'DSH_PLAN_V2',
      registryDigest: 'a'.repeat(64),
      summary: '渐进式 DAG',
      owners: [{ id: 'web', name: 'Web', description: 'Web Owner', scope: ['src/**'], exclude: [] }],
      verifications: [],
      tasks: [{
        id: 'T1',
        role: 'work',
        ownerId: 'web',
        title: '待拆分的高层节点',
        dependsOn: [],
        write: [],
        verify: [],
        done: ['形成子图'],
        decomposition: {
          status: 'abstract',
          kind: 'discovery',
          outcome: '生成可执行叶子',
          ownerCandidates: ['web'],
          unknowns: ['现有测试 harness 边界'],
        },
      }],
    },
    planDigest: 'progressive-plan-digest',
    planningAgent: { phase: 'consulting_owners' },
    tasks: [{ taskId: 'T1', status: 'pending', executorId: null, cursor: null, unchangedPolls: 0 }],
    ownerRuns: {},
  }
  await writeProgressProjection(root, state)
  const dashboard = await listen(createDashboardHandler(root))
  t.after(() => dashboard.close())

  let snapshot = await (await fetch(`${dashboard.url}/owner-workflow/api/snapshot?workflow_id=${workflowId}`)).json()
  assert.equal(snapshot.phase, 'planning_owner_consultation')
  assert.equal(snapshot.tasks[0].decomposition.status, 'abstract')
  assert.equal(snapshot.tasks[0].decomposition.kind, 'discovery')
  assert.deepEqual(snapshot.tasks[0].decomposition.unknowns, ['现有测试 harness 边界'])

  state.planningAgent = { phase: 'review_complete' }
  state.planReviewDigest = state.planDigest
  state.planReview = {
    contract: 'DSH_PLAN_REVIEW_V1',
    status: 'needs_split',
    summary: 'T1 需要继续拆分',
    issues: [{ title: '节点过大' }],
    targetTaskIds: ['T1'],
  }
  await writeProgressProjection(root, state)
  snapshot = await (await fetch(`${dashboard.url}/owner-workflow/api/snapshot?workflow_id=${workflowId}`)).json()
  assert.equal(snapshot.phase, 'plan_split_required')
  assert.equal(snapshot.action, undefined)

  state.plan.tasks[0].decomposition.kind = 'decision'
  state.planningAgent = { phase: 'discussion_summary_pending' }
  state.planReview = {
    contract: 'DSH_PLAN_REVIEW_V1',
    status: 'needs_decision',
    summary: '需要用户策略决定',
    issues: [],
    decisionQuestions: ['是否允许连接真实外部服务？'],
  }
  state.planningDiscussion = {
    source: 'plan-review-needs-decision',
    status: 'summary_pending',
  }
  state.pendingDecisionBundle = {
    contract: 'DSH_WORKFLOW_DECISION_BUNDLE_V1',
    status: 'pending',
    questions: ['是否允许连接真实外部服务？', '目标测试环境是什么？'],
  }
  await writeProgressProjection(root, state)
  snapshot = await (await fetch(`${dashboard.url}/owner-workflow/api/snapshot?workflow_id=${workflowId}`)).json()
  assert.equal(snapshot.phase, 'planning_discussion_summarizing')
  assert.equal(snapshot.action, undefined)
  assert.equal(snapshot.decisionBundle.questionCount, 2)

  state.planningAgent = { phase: 'awaiting_main_discussion' }
  state.planningDiscussion.status = 'delivered'
  await writeProgressProjection(root, state)
  snapshot = await (await fetch(`${dashboard.url}/owner-workflow/api/snapshot?workflow_id=${workflowId}`)).json()
  assert.equal(snapshot.phase, 'awaiting_main_discussion')
  assert.equal(snapshot.action.title, '决策问题已返回主线程')
  assert.match(snapshot.action.detail, /自动规划已暂停/u)
})

test('Dashboard 把修订预算耗尽显示为等待用户决定，而不是运行中或 Runtime 故障', async t => {
  const root = await workspaceFixture(t)
  const workflowId = 'wf-revision-extension-dashboard'
  const state = {
    id: workflowId,
    root,
    status: 'planned',
    orchestratorSessionId: 'main-session-revision-extension',
    plan: {
      contract: 'DSH_PLAN_V2',
      registryDigest: 'a'.repeat(64),
      summary: '等待扩展额度的计划',
      owners: [{ id: 'web', name: 'Web', description: 'Web Owner', scope: ['src/**'], exclude: [] }],
      verifications: [{ id: 'unit', run: ['node', '--test'] }],
      tasks: [{
        id: 'T1', role: 'work', ownerId: 'web', title: '实现页面', dependsOn: [],
        write: ['src/**'], verify: ['unit'], done: ['页面完成'],
        priority: 100,
        onFailure: { action: 'repair_owner', maxAttempts: 2 },
        onBlocked: { action: 'notify_main' },
        onTimeout: { action: 'notify_main', afterMs: 180000 },
      }],
    },
    planDigest: 'plan-digest',
    planReviewDigest: 'plan-digest',
    planReview: {
      contract: 'DSH_PLAN_REVIEW_V1',
      status: 'needs_revision',
      summary: '三轮后仍需修订',
      issues: [{ title: '验证仍不完整' }],
    },
    planReviewRevisionCount: 3,
    planRevisionLimit: 3,
    planningAgent: {
      phase: 'awaiting_revision_extension',
      revisionBudgetUsed: 3,
      revisionBudgetLimit: 3,
      revisionBudgetExhausted: true,
    },
    pendingPlanningDecision: {
      decisionId: 'pd-dashboard-revision-extension',
      kind: 'plan_revision_extension',
      status: 'pending',
    },
    mainOutbox: {
      'mo-dashboard-revision-extension': {
        notificationId: 'mo-dashboard-revision-extension',
        decisionId: 'pd-dashboard-revision-extension',
        status: 'delivered',
        presentationStatus: 'active',
      },
    },
    tasks: [{ taskId: 'T1', status: 'pending', executorId: null, cursor: null, unchangedPolls: 0 }],
    ownerRuns: {},
  }
  await writeProgressProjection(root, state)
  await mkdir(join(root, '.dsh-workflow', 'workflows'), { recursive: true })
  await writeFile(
    join(root, '.dsh-workflow', 'workflows', `${workflowId}.json`),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  )
  const dashboard = await listen(createDashboardHandler(root))
  t.after(() => dashboard.close())

  const snapshot = await (await fetch(`${dashboard.url}/owner-workflow/api/snapshot?workflow_id=${workflowId}`)).json()
  assert.equal(snapshot.phase, 'awaiting_revision_extension')
  assert.deepEqual(snapshot.action, {
    required: true,
    kind: 'plan_revision_extension',
    title: '计划修订额度等待决定',
    detail: '计划已达到自动修订上限，原生决定卡片已直接在创建该 Workflow 的主会话打开；当前没有子代理仍在运行。',
    mainSessionId: 'main-session-revision-extension',
  })
  const waits = await (await fetch(`${dashboard.url}/owner-workflow/api/waits`)).json()
  assert.deepEqual(waits.waits.map(item => ({ state: item.state, waitingFor: item.waitingFor, statusText: item.statusText })), [{
    state: 'waiting_workflow_decision',
    waitingFor: 'Workflow 根会话决定是否扩展计划修订额度',
    statusText: '计划修订额度原生决定卡片已打开，等待用户选择',
  }])
})

test('Dashboard 显示自动规划已终止并等待主线程讨论', async t => {
  const root = await workspaceFixture(t)
  const workflowId = 'wf-planning-discussion-dashboard'
  const state = {
    id: workflowId,
    root,
    status: 'planned',
    orchestratorSessionId: 'main-session-planning-discussion',
    plan: {
      contract: 'DSH_PLAN_V2',
      registryDigest: 'a'.repeat(64),
      summary: '已停止自动规划的计划',
      owners: [{ id: 'web', name: 'Web', description: 'Web Owner', scope: ['src/**'], exclude: [] }],
      verifications: [{ id: 'unit', run: ['node', '--test'] }],
      tasks: [{
        id: 'T1', role: 'work', ownerId: 'web', title: '实现页面', dependsOn: [],
        write: ['src/**'], verify: ['unit'], done: ['页面完成'],
        priority: 100,
        onFailure: { action: 'repair_owner', maxAttempts: 2 },
        onBlocked: { action: 'notify_main' },
        onTimeout: { action: 'notify_main', afterMs: 180000 },
      }],
    },
    planDigest: 'discussion-plan-digest',
    planReviewDigest: 'discussion-plan-digest',
    planReview: {
      contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: '多轮仍未收敛', issues: [],
    },
    planningAgent: { phase: 'awaiting_main_discussion', decisionQuestionStatus: 'answered' },
    pendingPlanningDecision: { kind: 'plan_revision_extension', status: 'discussion' },
    planningDiscussion: {
      contract: 'DSH_WORKFLOW_PLANNING_DISCUSSION_V1',
      discussionId: 'pds-dashboard',
      status: 'delivered',
      summary: '总结已经返回主线程。',
    },
    tasks: [{ taskId: 'T1', status: 'pending', executorId: null, cursor: null, unchangedPolls: 0 }],
    ownerRuns: {},
  }
  await writeProgressProjection(root, state)
  await mkdir(join(root, '.dsh-workflow', 'workflows'), { recursive: true })
  await writeFile(join(root, '.dsh-workflow', 'workflows', `${workflowId}.json`), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  const dashboard = await listen(createDashboardHandler(root))
  t.after(() => dashboard.close())

  const snapshot = await (await fetch(`${dashboard.url}/owner-workflow/api/snapshot?workflow_id=${workflowId}`)).json()
  assert.equal(snapshot.phase, 'awaiting_main_discussion')
  assert.deepEqual(snapshot.action, {
    required: true,
    kind: 'planning_discussion_ready',
    title: '规划总结已返回主线程',
    detail: '自动规划已经终止并保留现场。总结已返回 Workflow 根会话，等待主线程与用户讨论下一步。',
    mainSessionId: 'main-session-planning-discussion',
  })
  const waits = await (await fetch(`${dashboard.url}/owner-workflow/api/waits`)).json()
  assert.deepEqual(waits.waits.map(item => ({ state: item.state, waitingFor: item.waitingFor, statusText: item.statusText })), [{
    state: 'waiting_workflow_decision',
    waitingFor: 'Workflow 根会话与用户讨论',
    statusText: '自动规划已终止，现状总结已返回主线程',
  }])
})

test('Dashboard 把仍有预算的 review_failed 显示为等待 Runner 自动恢复', async t => {
  const root = await workspaceFixture(t)
  const workflowId = 'wf-review-recovery-dashboard'
  await writeProgressProjection(root, {
    id: workflowId,
    status: 'planned',
    plan: {
      contract: 'DSH_PLAN_V2',
      registryDigest: 'a'.repeat(64),
      summary: '等待自动恢复的计划',
      owners: [{ id: 'web', name: 'Web', description: 'Web Owner', scope: ['src/**'], exclude: [] }],
      verifications: [{ id: 'unit', run: ['node', '--test'] }],
      tasks: [{
        id: 'T1', role: 'work', ownerId: 'web', title: '实现页面', dependsOn: [],
        write: ['src/**'], verify: ['unit'], done: ['页面完成'],
        priority: 100,
        onFailure: { action: 'repair_owner', maxAttempts: 2 },
        onBlocked: { action: 'notify_main' },
        onTimeout: { action: 'notify_main', afterMs: 180000 },
      }],
    },
    planDigest: 'plan-digest',
    planReview: {
      contract: 'DSH_PLAN_REVIEW_V1',
      status: 'needs_revision',
      summary: '仍需修订',
      issues: [{ title: '补充确定性验证' }],
    },
    planReviewRevisionCount: 1,
    planRevisionLimit: 3,
    planningAgent: { phase: 'review_failed' },
    tasks: [{ taskId: 'T1', status: 'pending', executorId: null, cursor: null, unchangedPolls: 0 }],
    ownerRuns: {},
  })
  const dashboard = await listen(createDashboardHandler(root))
  t.after(() => dashboard.close())

  const snapshot = await (await fetch(`${dashboard.url}/owner-workflow/api/snapshot?workflow_id=${workflowId}`)).json()
  assert.equal(snapshot.phase, 'plan_revision_recovery_queued')
  assert.equal(snapshot.action, undefined)
})

test('Workflow Dashboard 通过 SSE 在投影变化后实时推送', async t => {
  const root = await workspaceFixture(t)
  const workflowId = 'wf-dashboard-realtime'
  await writeProgressProjection(root, {
    workflowId,
    status: 'planned',
    summary: '实时 Dashboard 测试',
    tasks: [],
  })
  const dashboard = await listen(createDashboardHandler(root))
  t.after(() => dashboard.close())
  const controller = new AbortController()
  t.after(() => controller.abort())
  const response = await fetch(`${dashboard.url}/owner-workflow/api/snapshot/events?workflow_id=${workflowId}`, {
    signal: controller.signal,
  })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/u)
  const reader = response.body.getReader()
  let rest = ''
  const initial = await readSseData(reader, rest)
  rest = initial.rest
  assert.equal(initial.event, undefined)
  assert.equal(initial.value.projection.workflowId, workflowId)

  await writeProgressProjection(root, {
    workflowId,
    status: 'running',
    summary: '实时 Dashboard 测试',
    tasks: [],
  })
  let updated
  for (let index = 0; index < 10; index += 1) {
    const next = await readSseData(reader, rest)
    rest = next.rest
    if (next.value.projection?.status === 'running') {
      updated = next.value
      break
    }
  }
  assert.equal(updated?.projection?.status, 'running')
  await reader.cancel()
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
  assert.equal(initial.event, 'waits')
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
    generation: 3,
    pollMs: 1000,
    heartbeatAt: new Date().toISOString(),
    activeWorkflows: [{
      workspaceId,
      workflowId: 'wf-running',
      attemptId: 'attempt-running',
      kind: 'execution',
      phase: 'executing',
      pid: process.pid,
      startedAt: new Date().toISOString(),
    }],
  }, null, 2)}\n`, 'utf8')

  const dashboard = await listen(createDashboardHandler(root))
  t.after(() => dashboard.close())
  const body = await (await fetch(`${dashboard.url}/owner-workflow/api/waits`)).json()
  assert.equal(body.contract, 'DSH_RUNTIME_STATUS_V1')
  assert.equal(body.runner.process, 'online')
  assert.equal(body.runner.assignment, 'supervising')
  assert.equal(body.runner.generation, 3)
  assert.equal(body.runner.activeAttemptCount, 1)
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
    runnerAttempt: workflows.get('wf-running').runnerAttempt,
  }, {
    phase: 'owner_running',
    pending: 2,
    running: 1,
    dependencies: 2,
    runnerAttempt: {
      attemptId: 'attempt-running',
      kind: 'execution',
      phase: 'executing',
      reason: null,
      startedAt: workflows.get('wf-running').runnerAttempt.startedAt,
      deadlineAt: null,
    },
  })
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
  assert.equal(workflows.get('wf-stalled').phase, 'plan_revision_recovery_queued')
  assert.equal(workflows.get('wf-stalled').subagents.some(item => item.lifecycle === 'running'), false)
  assert.equal(body.waits.find(item => item.workflowId === 'wf-stalled').state, 'runner_offline')
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

  await rm(businessRoot, { recursive: true, force: true })
  const afterDelete = await fetch(`${dashboard.url}/owner-workflow/api/workspaces`)
  const remaining = (await afterDelete.json()).workspaces
  assert.equal(remaining.some(item => item.workspaceId === registered.workspaceId), false)
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

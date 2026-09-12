import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ackSupervisorAction,
  createTaskState,
  projectProgress,
  supervisorNext,
} from '../src/supervisor.mjs'
import { expandCompositeTask } from '../src/model.mjs'

const CLOCK = '2026-08-20T08:00:00.000Z'

function owner(id) {
  return { id, name: id, description: `${id} Owner`, scope: [`src/${id}/**`], exclude: [] }
}

function task(id, role, dependsOn = [], ownerId = 'api', resources) {
  return {
    id,
    role,
    ownerId,
    title: `${id} 标题`,
    dependsOn,
    write: role === 'work' ? [`src/${ownerId}/${id}.mjs`] : [],
    verify: ['unit'],
    done: [`${id} 完成`],
    ...(resources === undefined ? {} : { resources }),
  }
}

function plan(tasks) {
  const ownerIds = [...new Set(tasks.map(item => item.ownerId))]
  return {
    contract: 'DSH_PLAN_V2',
    registryDigest: 'a'.repeat(64),
    summary: 'Supervisor 测试计划',
    owners: ownerIds.map(owner),
    verifications: [{ id: 'unit', run: ['node', '--test'] }],
    tasks,
  }
}

function workflowState(tasks, parallel = 2) {
  const value = plan(tasks)
  return {
    id: 'workflow-supervisor-test',
    revision: 0,
    plan: value,
    tasks: createTaskState(value),
    config: { parallel },
  }
}

function acknowledge(state, receipt, observation) {
  return ackSupervisorAction(state, receipt.actionId, observation)
}

test('仅派发依赖完成的任务，Review 未完成时阻塞下游', () => {
  const state = workflowState([
    task('T1', 'work'),
    task('T2', 'review', ['T1']),
    task('T3', 'work', ['T2'], 'web'),
  ])

  const first = supervisorNext(state, CLOCK)
  assert.deepEqual(first.tasks.map(item => item.taskId), ['T1'])
  const created = acknowledge(state, first, { tasks: [{ taskId: 'T1', executorId: 'agent-1', cursor: 'c1' }] })
  const completed = acknowledge(created, supervisorNext(created, CLOCK), {
    tasks: [{ taskId: 'T1', status: 'completed', cursor: 'c2' }],
  })

  const second = supervisorNext(completed, CLOCK)
  assert.equal(second.action, 'create')
  assert.deepEqual(second.tasks.map(item => item.taskId), ['T2'])
  assert.equal(second.tasks.some(item => item.taskId === 'T3'), false)
})

test('不同 Owner 的任务仍可占用不同并行槽位', () => {
  const state = workflowState([
    task('T1', 'work', [], 'api'),
    task('T2', 'work', [], 'web'),
    task('T3', 'work', [], 'worker'),
  ], 2)
  const first = supervisorNext(state, CLOCK)
  assert.deepEqual(first.tasks.map(item => item.taskId), ['T1', 'T2'])

  const active = acknowledge(state, first, {
    tasks: [
      { taskId: 'T1', executorId: 'agent-1', cursor: 'c1' },
      { taskId: 'T2', executorId: 'agent-2', cursor: 'c1' },
    ],
  })
  const wait = supervisorNext(active, CLOCK)
  assert.equal(wait.action, 'wait')
  assert.deepEqual(wait.watches.map(item => item.taskId), ['T1', 'T2'])
})

test('相同执行资源只派发一个 Owner，并继续选择无冲突任务填充槽位', () => {
  const state = workflowState([
    { ...task('T1', 'work', [], 'api', ['tcp:localhost:5432']), priority: 90 },
    { ...task('T2', 'work', [], 'web', ['tcp:localhost:5432']), priority: 80 },
    { ...task('T3', 'work', [], 'worker', ['build-cache:flutter']), priority: 70 },
  ], 3)

  const action = supervisorNext(state, CLOCK)
  assert.equal(action.action, 'create')
  assert.deepEqual(action.tasks.map(item => item.taskId), ['T1', 'T3'])
  assert.deepEqual(action.tasks[0].resources, ['tcp:localhost:5432'])
})

test('运行任务和外部reservation都阻止相同资源的新任务', () => {
  const tasks = [
    task('T1', 'work', [], 'api', ['db:test']),
    task('T2', 'work', [], 'web', ['db:test']),
    task('T3', 'work', [], 'worker', ['build-cache:flutter']),
  ]
  const state = workflowState(tasks, 3)
  state.tasks[0] = { ...state.tasks[0], status: 'running', executorId: 'agent-api', cursor: 'c1' }
  state.externalOccupiedSlots = 1
  state.externalBusyOwnerIds = []
  state.externalBusyResourceIds = ['build-cache:flutter']

  const action = supervisorNext(state, CLOCK)
  assert.equal(action.action, 'wait')
  assert.deepEqual(action.watches.map(item => item.taskId), ['T1'])
})

test('恢复状态中两个运行任务占用相同资源时关闭处理', () => {
  const state = workflowState([
    task('T1', 'work', [], 'api', ['db:test']),
    task('T2', 'work', [], 'web', ['db:test']),
  ], 2)
  state.tasks = state.tasks.map((record, index) => ({
    ...record,
    status: 'running',
    executorId: `agent-${index}`,
    cursor: `c${index}`,
  }))
  assert.throws(() => supervisorNext(state, CLOCK), /重复占用资源：db:test/u)
})

test('公共Owner判断reservation占用Supervisor槽位并阻止同Owner写任务', () => {
  const state = workflowState([
    task('T1', 'work', [], 'api'),
    task('T2', 'work', [], 'web'),
    task('T3', 'work', [], 'worker'),
  ], 2)
  state.externalOccupiedSlots = 1
  state.externalBusyOwnerIds = ['api']
  const receipt = supervisorNext(state, CLOCK)
  assert.equal(receipt.action, 'create')
  assert.deepEqual(receipt.tasks.map(item => item.taskId), ['T2'])

  assert.throws(() => supervisorNext({
    ...state,
    externalOccupiedSlots: 3,
  }, CLOCK), /外部reservation数量不能超过/u)
})

test('Supervisor wait 确认保留 Owner 提交关卡写入的验证证据', () => {
  const state = workflowState([task('T1', 'work')])
  state.tasks[0] = {
    ...state.tasks[0],
    status: 'running',
    executorId: 'owner-1',
    cursor: 'cursor-1',
    verificationResults: {
      unit: { planDigest: 'plan-digest', passed: true, exitCode: 0 },
    },
  }

  const wait = supervisorNext(state, CLOCK)
  const acknowledged = acknowledge(state, wait, {
    tasks: [{ taskId: 'T1', status: 'running', executorId: 'owner-1', cursor: 'cursor-1' }],
  })

  assert.deepEqual(acknowledged.tasks[0].verificationResults, {
    unit: { planDigest: 'plan-digest', passed: true, exitCode: 0 },
  })
})

test('Supervisor ACK 保留自治恢复策略和证据租约', () => {
  const state = workflowState([task('T1', 'work')])
  state.tasks[0] = {
    ...state.tasks[0],
    status: 'running',
    executorId: 'owner-1',
    autonomousRecovery: {
      contract: 'DSH_AUTONOMOUS_RECOVERY_V1',
      failureClass: 'runtime_environment',
      strategy: 'diagnose',
      message: 'tsc command not found',
      evidenceDigest: 'evidence-a',
      usedStrategies: ['repair_runtime', 'diagnose'],
      updatedAt: CLOCK,
    },
  }

  const wait = supervisorNext(state, CLOCK)
  const acknowledged = acknowledge(state, wait, {
    tasks: [{ taskId: 'T1', status: 'running', executorId: 'owner-1' }],
  })

  assert.equal(acknowledged.tasks[0].autonomousRecovery.strategy, 'diagnose')
  assert.deepEqual(acknowledged.tasks[0].autonomousRecovery.usedStrategies, ['repair_runtime', 'diagnose'])
})

test('同一 Owner 的 ready task 每批最多派发一个，其余保持 pending', () => {
  const state = workflowState([
    task('T1', 'work', [], 'api'),
    task('T2', 'work', [], 'api'),
    task('T3', 'work', [], 'web'),
  ], 2)

  const first = supervisorNext(state, CLOCK)
  assert.equal(first.action, 'create')
  assert.deepEqual(first.tasks.map(item => item.taskId), ['T1', 'T3'])
  assert.equal(state.tasks.find(item => item.taskId === 'T2').status, 'pending')

  const active = acknowledge(state, first, {
    tasks: [
      { taskId: 'T1', executorId: 'agent-1', cursor: 'c1' },
      { taskId: 'T3', executorId: 'agent-3', cursor: 'c1' },
    ],
  })
  assert.equal(active.tasks.find(item => item.taskId === 'T2').status, 'pending')
  assert.equal(supervisorNext(active, CLOCK).action, 'wait')

  const settled = acknowledge(active, supervisorNext(active, CLOCK), {
    tasks: [
      { taskId: 'T1', status: 'completed', cursor: 'c2' },
      { taskId: 'T3', status: 'completed', cursor: 'c2' },
    ],
  })
  const next = supervisorNext(settled, CLOCK)
  assert.equal(next.action, 'create')
  assert.deepEqual(next.tasks.map(item => item.taskId), ['T2'])
})

test('就绪任务按计划 priority 降序选择，同时继续遵守 Owner 排他', () => {
  const state = workflowState([
    { ...task('T1', 'work', [], 'api'), priority: 10 },
    { ...task('T2', 'work', [], 'web'), priority: 100 },
    { ...task('T3', 'work', [], 'worker'), priority: 50 },
  ], 2)

  const receipt = supervisorNext(state, CLOCK)
  assert.deepEqual(receipt.tasks.map(item => item.taskId), ['T2', 'T3'])
})

test('已有同 Owner running/reserved task 时不再派发该 Owner', () => {
  const state = workflowState([
    task('T1', 'work', [], 'api'),
    task('T2', 'work', [], 'api'),
    task('T3', 'work', [], 'web'),
  ], 2)
  state.tasks[0] = {
    ...state.tasks[0],
    status: 'running',
    executorId: null,
    cursor: null,
  }

  const receipt = supervisorNext(state, CLOCK)
  assert.equal(receipt.action, 'create')
  assert.deepEqual(receipt.tasks.map(item => item.taskId), ['T3'])
  assert.equal(state.tasks.find(item => item.taskId === 'T2').status, 'pending')
})

test('连续十次 cursor 未变化时派发 inspect，且不会猜测任务完成', () => {
  const state = workflowState([task('T1', 'work')])
  state.tasks[0] = {
    ...state.tasks[0],
    status: 'running',
    executorId: 'agent-1',
    cursor: 'same',
    unchangedPolls: 10,
  }

  const receipt = supervisorNext(state, CLOCK)
  assert.equal(receipt.action, 'inspect')
  assert.deepEqual(receipt.watches.map(item => item.taskId), ['T1'])
  assert.equal(state.tasks[0].status, 'running')
})

test('所有任务终态时停止；停止任务留下的决策阻塞会通知主会话', () => {
  const terminal = workflowState([task('T1', 'work')])
  terminal.tasks[0] = { ...terminal.tasks[0], status: 'completed' }
  assert.equal(supervisorNext(terminal, CLOCK).action, 'stop')

  const blocked = workflowState([task('T1', 'work'), task('T2', 'review', ['T1'])])
  blocked.tasks[0] = {
    ...blocked.tasks[0],
    status: 'stopped',
    reason: 'decision_required',
    action: 'await_user',
  }
  const receipt = supervisorNext(blocked, CLOCK)
  assert.equal(receipt.action, 'notify')
  assert.deepEqual(receipt.notification, { kind: 'main', reason: 'decision_required' })
})

test('动作枚举固定、actionId 不透明且确认必须匹配当前动作', () => {
  const state = workflowState([task('T1', 'work')])
  const receipt = supervisorNext(state, CLOCK)
  assert.equal(['create', 'wait', 'notify', 'inspect', 'stop'].includes(receipt.action), true)
  assert.match(receipt.actionId, /^sa-[0-9a-f]{16}$/u)
  assert.throws(() => ackSupervisorAction(state, 'sa-0000000000000000', {}), /actionId/u)

  const next = acknowledge(state, receipt, { tasks: [{ taskId: 'T1', executorId: 'agent-1', cursor: 'c1' }] })
  assert.equal(next.tasks[0].status, 'running')
  assert.equal(next.tasks[0].executorId, 'agent-1')
  assert.equal(next.tasks[0].unchangedPolls, 0)
})

test('wait 确认依据 cursor 投影进展，并重置或累加无进展轮数', () => {
  const state = workflowState([task('T1', 'work')])
  state.tasks[0] = { ...state.tasks[0], status: 'running', executorId: 'agent-1', cursor: 'c1', unchangedPolls: 3 }
  const unchanged = acknowledge(state, supervisorNext(state, CLOCK), { tasks: [{ taskId: 'T1', cursor: 'c1' }] })
  assert.equal(unchanged.tasks[0].unchangedPolls, 4)

  const changed = acknowledge(unchanged, supervisorNext(unchanged, CLOCK), { tasks: [{ taskId: 'T1', cursor: 'c2' }] })
  assert.equal(changed.tasks[0].unchangedPolls, 0)

  assert.deepEqual(projectProgress(changed), {
    contract: 'DSH_WORKFLOW_PROGRESS_V1',
    summary: 'Supervisor 测试计划',
    tasks: [{
      id: 'T1',
      ownerId: 'api',
      role: 'work',
      title: 'T1 标题',
      dependsOn: [],
      status: 'running',
      executorId: 'agent-1',
      cursor: 'c2',
      unchangedPolls: 0,
      reason: null,
      action: null,
    }],
  })
})

test('actionId 绑定计划身份、工作流 revision 与完整任务投影', () => {
  const state = workflowState([task('T1', 'work'), task('T2', 'work')], 1)
  const receipt = supervisorNext(state, CLOCK)
  const alteredStates = [
    { ...state, id: 'workflow-other' },
    { ...state, revision: 1 },
    { ...state, plan: { ...state.plan, registryDigest: 'b'.repeat(64), summary: '另一份计划' } },
    { ...state, tasks: [state.tasks[0], { ...state.tasks[1], status: 'stopped', reason: 'task_failed', action: 'repair_task' }] },
  ]

  for (const altered of alteredStates) {
    assert.notEqual(supervisorNext(altered, CLOCK).actionId, receipt.actionId)
    assert.throws(
      () => ackSupervisorAction(altered, receipt.actionId, { tasks: [{ taskId: 'T1', status: 'running' }] }),
      /actionId/u,
    )
  }
})

test('旧 action ACK 在状态变化或已经确认后被拒绝', () => {
  const state = workflowState([task('T1', 'work')])
  const create = supervisorNext(state, CLOCK)
  const changed = {
    ...state,
    tasks: [{ ...state.tasks[0], status: 'stopped', reason: 'task_failed', action: 'repair_task' }],
  }
  assert.throws(() => ackSupervisorAction(changed, create.actionId, {}), /actionId/u)

  const acknowledged = acknowledge(state, create, { tasks: [{ taskId: 'T1', status: 'running' }] })
  assert.equal(acknowledged.actionSequence, 1)
  assert.throws(() => ackSupervisorAction(acknowledged, create.actionId, {}), /actionId/u)
})

test('create ACK 只接受 running 状态及其闭合任务字段', () => {
  const state = workflowState([task('T1', 'work')])
  const receipt = supervisorNext(state, CLOCK)

  for (const observation of [
    { tasks: [{ taskId: 'T1', status: 'unknown' }] },
    { tasks: [{ taskId: 'T1', status: 'completed' }] },
    { tasks: [{ taskId: 'T1', status: 'running', reason: 'task_failed' }] },
    { tasks: [{ taskId: 'T1', status: 'running', unexpected: true }] },
  ]) {
    assert.throws(() => acknowledge(state, receipt, observation), /状态|字段/u)
  }

  const acknowledged = acknowledge(state, receipt, {
    tasks: [{ taskId: 'T1', status: 'running', executorId: 'agent-1', cursor: 'c1' }],
  })
  assert.equal(acknowledged.tasks[0].status, 'running')
})

test('wait、notify 与 stop ACK 拒绝不适用的观测字段', () => {
  const running = workflowState([task('T1', 'work')])
  running.tasks[0] = { ...running.tasks[0], status: 'running', executorId: 'agent-1' }
  const wait = supervisorNext(running, CLOCK)
  assert.throws(
    () => acknowledge(running, wait, { tasks: [{ taskId: 'T1', status: 'running', reason: 'task_failed' }] }),
    /reason|action/u,
  )

  const terminal = workflowState([task('T1', 'work')])
  const stop = {
    ...terminal,
    tasks: [{ ...terminal.tasks[0], status: 'stopped', reason: 'task_failed', action: 'repair_task' }],
  }
  assert.equal(supervisorNext(stop, CLOCK).action, 'stop')
  assert.throws(() => acknowledge(stop, supervisorNext(stop, CLOCK), { tasks: [] }), /观测/u)

  const blocked = workflowState([task('T1', 'work'), task('T2', 'review', ['T1'])])
  const notify = {
    ...blocked,
    tasks: [
      { ...blocked.tasks[0], status: 'stopped', reason: 'task_failed', action: 'repair_task' },
      blocked.tasks[1],
    ],
  }
  assert.equal(supervisorNext(notify, CLOCK).action, 'notify')
  assert.throws(() => acknowledge(notify, supervisorNext(notify, CLOCK), { tasks: [] }), /观测/u)
})

test('恢复状态的 active 任务数超过并行上限时关闭处理', () => {
  const state = workflowState([task('T1', 'work'), task('T2', 'work')], 1)
  state.tasks = state.tasks.map((record, index) => ({
    ...record,
    status: 'running',
    executorId: `agent-${index + 1}`,
  }))
  assert.throws(() => supervisorNext(state, CLOCK), /active.*parallel|运行中.*parallel/u)
})

test('恢复状态包含非法任务状态时关闭处理', () => {
  const state = workflowState([task('T1', 'work')])
  state.tasks[0] = { ...state.tasks[0], status: 'unknown' }
  assert.throws(() => supervisorNext(state, CLOCK), /status.*不受支持/u)
})

test('actionSequence 与 unchangedPolls 拒绝非安全整数，并在序列上限关闭处理', () => {
  const state = workflowState([task('T1', 'work')])
  assert.throws(
    () => supervisorNext({ ...state, actionSequence: Number.MAX_SAFE_INTEGER + 1 }, CLOCK),
    /actionSequence.*安全整数/u,
  )
  assert.throws(
    () => supervisorNext({ ...state, actionSequence: Number.MAX_SAFE_INTEGER }, CLOCK),
    /actionSequence.*上限/u,
  )

  const running = workflowState([task('T1', 'work')])
  running.tasks[0] = { ...running.tasks[0], status: 'running', unchangedPolls: Number.MAX_SAFE_INTEGER + 1 }
  assert.throws(() => supervisorNext(running, CLOCK), /unchangedPolls.*安全整数/u)
})

test('Supervisor ready 投影只派发 Composite entry/内部节点，exit 完成后才放行父后继', () => {
  const base = plan([
    task('T1', 'work', [], 'api'),
    task('T2', 'work', ['T1'], 'api'),
    task('T3', 'work', ['T2'], 'web'),
    task('T4', 'work', ['T1'], 'api'),
  ])
  const expanded = expandCompositeTask(base, 'T2', {
    children: [task('T2-1', 'work', [], 'api'), task('T2-2', 'review', ['T2-1'], 'api')],
    entry: ['T2-1'],
    exit: ['T2-2'],
  })
  let state = workflowState(expanded.tasks, 2)

  let receipt = supervisorNext(state, CLOCK)
  assert.deepEqual(receipt.tasks.map(item => item.taskId), ['T1'])
  state = acknowledge(state, receipt, { tasks: [{ taskId: 'T1', executorId: 'agent-1', cursor: 'c1' }] })
  receipt = supervisorNext(state, CLOCK)
  state = acknowledge(state, receipt, { tasks: [{ taskId: 'T1', status: 'completed', cursor: 'c2' }] })

  receipt = supervisorNext(state, CLOCK)
  assert.equal(receipt.tasks.some(item => item.taskId === 'T2'), false)
  assert.equal(receipt.tasks.some(item => item.taskId === 'T3'), false)
  assert.deepEqual(receipt.tasks.map(item => item.taskId), ['T2-1'])
  state = acknowledge(state, receipt, { tasks: [{ taskId: 'T2-1', executorId: 'agent-2', cursor: 'c1' }] })
  receipt = supervisorNext(state, CLOCK)
  state = acknowledge(state, receipt, { tasks: [{ taskId: 'T2-1', status: 'completed', cursor: 'c2' }] })

  receipt = supervisorNext(state, CLOCK)
  assert.deepEqual(receipt.tasks.map(item => item.taskId), ['T2-2'])
  state = acknowledge(state, receipt, { tasks: [{ taskId: 'T2-2', executorId: 'review-agent', cursor: 'c1' }] })
  receipt = supervisorNext(state, CLOCK)
  state = acknowledge(state, receipt, { tasks: [{ taskId: 'T2-2', status: 'completed', cursor: 'c2' }] })

  assert.equal(state.tasks.find(item => item.taskId === 'T2').status, 'completed')
  receipt = supervisorNext(state, CLOCK)
  assert.equal(receipt.tasks.some(item => item.taskId === 'T3'), true)
})

test('递归 Composite 叶子必须等待所有祖先的外部依赖', () => {
  const base = plan([
    task('T1', 'work', [], 'api'),
    task('T2', 'work', ['T1'], 'api'),
    task('T3', 'work', ['T2'], 'web'),
  ])
  const first = expandCompositeTask(base, 'T2', {
    children: [task('T2-1', 'work', [], 'api')],
    entry: ['T2-1'],
    exit: ['T2-1'],
  })
  const second = expandCompositeTask(first, 'T2-1', {
    children: [task('T2-1-1', 'work', [], 'api')],
    entry: ['T2-1-1'],
    exit: ['T2-1-1'],
  })
  const state = {
    id: 'workflow-nested-composite',
    revision: 0,
    plan: second,
    tasks: createTaskState(second),
    config: { parallel: 2 },
  }

  const firstReceipt = supervisorNext(state, CLOCK)
  assert.deepEqual(firstReceipt.tasks.map(item => item.taskId), ['T1'])
  assert.equal(firstReceipt.tasks.some(item => item.taskId === 'T2-1-1'), false)
})

test('Supervisor 拒绝执行 abstract DAG，但进度投影保留拆分信息', () => {
  const abstractPlan = {
    contract: 'DSH_PLAN_V2',
    registryDigest: 'a'.repeat(64),
    summary: '待递归拆分的计划',
    owners: [owner('api')],
    verifications: [],
    tasks: [{
      id: 'T1',
      role: 'work',
      ownerId: 'api',
      title: '调查并拆分边界',
      dependsOn: [],
      write: [],
      verify: [],
      done: ['子图已生成'],
      decomposition: {
        status: 'abstract',
        kind: 'discovery',
        outcome: '生成可执行子图',
        ownerCandidates: ['api'],
        unknowns: ['真实文件边界'],
      },
    }],
  }
  const state = {
    id: 'workflow-abstract',
    revision: 0,
    plan: abstractPlan,
    tasks: createTaskState(abstractPlan),
    config: { parallel: 1 },
  }

  assert.throws(() => supervisorNext(state, CLOCK), /abstract|渐进式 DAG/u)
  const progress = projectProgress(state)
  assert.equal(progress.tasks[0].decomposition.status, 'abstract')
  assert.deepEqual(progress.tasks[0].decomposition.unknowns, ['真实文件边界'])
})

test('Revision 切换阻塞指定任务并在 ACK 后保留待检查元数据', () => {
  const state = workflowState([
    task('C', 'work', [], 'api'),
    task('A', 'work', ['C'], 'web'),
  ], 2)
  state.transitionBlockedTaskIds = ['C']
  state.tasks[1] = {
    ...state.tasks[1],
    status: 'running',
    executorId: 'owner-a',
    planRevision: 2,
    checkState: 'pending_check',
    revisionDisposition: 'pending_check',
    revisionReason: '新增前置任务',
    recheckOnly: false,
    fixedCommitSha: 'abc123',
  }

  const wait = supervisorNext(state, CLOCK)
  assert.equal(wait.action, 'wait')
  const reduced = acknowledge(state, wait, {
    tasks: [{ taskId: 'A', status: 'completed', cursor: 'new-head' }],
  })
  const record = reduced.tasks.find(item => item.taskId === 'A')
  assert.equal(record.planRevision, 2)
  assert.equal(record.checkState, 'pending_check')
  assert.equal(record.revisionDisposition, 'pending_check')
  assert.equal(record.revisionReason, '新增前置任务')
  assert.equal(record.fixedCommitSha, 'abc123')
  assert.deepEqual(supervisorNext(reduced, CLOCK).watches, [])

  reduced.transitionBlockedTaskIds = []
  const create = supervisorNext(reduced, CLOCK)
  assert.equal(create.action, 'create')
  assert.deepEqual(create.tasks.map(item => item.taskId), ['C'])
})

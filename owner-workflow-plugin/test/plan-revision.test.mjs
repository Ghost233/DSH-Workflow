import test from 'node:test'
import assert from 'node:assert/strict'

import { registerConversationSession, workflowOccupiesActiveSlot } from '../src/workflow-conversation.mjs'
import {
  advanceRevisionTransition,
  classifyTaskRevisionChange,
  createPlanRevision,
  freezeCompletedTaskDefinitions,
  migrateTaskStatesForRevision,
  planSnapshotDigest,
} from '../src/plan-revision.mjs'

function task(overrides = {}) {
  return {
    id: 'A',
    ownerId: 'core',
    role: 'work',
    title: '实现 A',
    dependsOn: [],
    write: ['src/a.mjs'],
    verify: ['unit'],
    done: ['测试通过'],
    priority: 0,
    ...overrides,
  }
}

function revisionContext({
  unitRun = ['node', '--test', 'test/unit.test.mjs'],
  unitCwd = 'packages/unit',
  unrelatedRun = ['node', '--test', 'test/unrelated.test.mjs'],
  binding = { tickets: [{ id: 'T-1', revision: 'R1', fragments: ['T-1:implementation'] }], contracts: [{ id: 'C-1', revision: 'v1' }] },
  otherBinding = { tickets: [{ id: 'T-2', revision: 'R1', fragments: ['T-2:implementation'] }], contracts: [{ id: 'C-2', revision: 'v1' }] },
  planningBindings = true,
} = {}) {
  return {
    verifications: [
      { id: 'unit', run: unitRun, cwd: unitCwd },
      { id: 'unrelated', run: unrelatedRun },
    ],
    ...(planningBindings ? {
      planningBindings: {
        contract: 'DSH_PLANNING_BINDINGS_V1',
        snapshotId: 'snapshot-1',
        sourceDigest: 'a'.repeat(64),
        tasks: [
          { taskId: 'A', ...binding },
          { taskId: 'B', ...otherBinding },
        ],
      },
    } : {}),
  }
}

test('PlanRevision 只保存精简的不可变计划快照', () => {
  const plan = { contract: 'DSH_PLAN_V2', tasks: [task()] }
  const revision = createPlanRevision({ number: 2, parent: 1, plan })
  assert.deepEqual(Object.keys(revision), ['contract', 'number', 'parent', 'planDigest', 'plan'])
  assert.equal(revision.planDigest, planSnapshotDigest(plan))
  plan.tasks[0].title = '外部修改'
  assert.equal(revision.plan.tasks[0].title, '实现 A')
})

test('Workflow 只接受单根普通 fork 会话树中的 Intent 来源', () => {
  const state = {
    orchestratorSessionId: 'root-session',
    conversationRootSessionId: 'root-session',
    conversationNodes: [{
      sessionId: 'root-session', parentSessionId: null, seedLength: null, role: 'root', registeredAt: '2026-08-24T00:00:00.000Z',
    }],
  }
  const runtime = { ctx: {} }
  const child = {
    id: 'discussion-child',
    session: { header: { parentSession: 'root-session', seedLength: 12 } },
  }
  const registered = registerConversationSession(runtime, state, child)
  assert.equal(registered.role, 'discussion')
  assert.equal(registered.parentSessionId, 'root-session')
  assert.equal(registered.seedLength, 12)

  assert.throws(() => registerConversationSession(runtime, state, {
    id: 'unrelated-root',
    session: { header: {} },
  }), /不属于当前 Workflow 的单根讨论树/u)
  assert.throws(() => registerConversationSession(runtime, state, {
    id: 'execution-child',
    session: { header: { parentSession: 'root-session', origin: 'subagent' } },
  }), /执行子代理不能加入/u)
})

test('只有 finalize 或完整取消清理才释放项目的唯一 Workflow 槽位', () => {
  for (const status of ['planning', 'planned', 'approved', 'running', 'blocked', 'failed', 'completed']) {
    assert.equal(workflowOccupiesActiveSlot({ status }), true, status)
  }
  assert.equal(workflowOccupiesActiveSlot({ status: 'cancelled' }), true)
  assert.equal(workflowOccupiesActiveSlot({ status: 'cancelled', temporaryArtifactsCleaned: true }), false)
  assert.equal(workflowOccupiesActiveSlot({ status: 'completed', finalized: true }), false)
})

test('Revision 变更只把权限收窄、Owner 变化和删除视为硬中止', () => {
  const previous = task()
  assert.equal(classifyTaskRevisionChange(previous, task()).disposition, 'carry_valid')
  assert.equal(classifyTaskRevisionChange(previous, task({ dependsOn: ['C'] })).disposition, 'pending_check')
  assert.equal(classifyTaskRevisionChange(previous, task({ write: ['src/a.mjs', 'src/helper.mjs'] })).disposition, 'pending_check')
  assert.equal(classifyTaskRevisionChange(task({ write: ['src/module/**'] }), task({ write: ['src/**'] })).disposition, 'pending_check')
  assert.equal(classifyTaskRevisionChange(task({ write: ['src/**'] }), task({ write: ['src/module/**'] })).disposition, 'abort')
  assert.equal(classifyTaskRevisionChange(previous, task({ write: [] })).disposition, 'abort')
  assert.equal(classifyTaskRevisionChange(previous, task({ ownerId: 'other' })).disposition, 'abort')
  assert.equal(classifyTaskRevisionChange(previous, undefined).disposition, 'abort')
})

test('Revision classification compares only each task’s selected verification and frozen planning binding', () => {
  const previousTask = task()
  const previousPlan = revisionContext()
  const samePlan = structuredClone(previousPlan)

  assert.equal(classifyTaskRevisionChange(previousTask, task(), { previousPlan, nextPlan: samePlan }).disposition, 'carry_valid')
  assert.equal(classifyTaskRevisionChange(previousTask, task(), {
    previousPlan,
    nextPlan: revisionContext({ unitRun: ['node', '--test', 'test/unit-next.test.mjs'] }),
  }).disposition, 'pending_check')
  assert.equal(classifyTaskRevisionChange(previousTask, task(), {
    previousPlan,
    nextPlan: revisionContext({ unrelatedRun: ['node', '--test', 'test/unrelated-next.test.mjs'] }),
  }).disposition, 'carry_valid')
  assert.equal(classifyTaskRevisionChange(previousTask, task(), {
    previousPlan,
    nextPlan: revisionContext({ binding: { tickets: [{ id: 'T-1', revision: 'R2', fragments: ['T-1:implementation'] }], contracts: [{ id: 'C-1', revision: 'v1' }] } }),
  }).disposition, 'pending_check')
  assert.equal(classifyTaskRevisionChange(previousTask, task(), {
    previousPlan,
    nextPlan: revisionContext({ otherBinding: { tickets: [{ id: 'T-2', revision: 'R2', fragments: ['T-2:implementation'] }], contracts: [{ id: 'C-2', revision: 'v1' }] } }),
  }).disposition, 'carry_valid')

  const legacy = revisionContext({ planningBindings: false })
  assert.equal(classifyTaskRevisionChange(previousTask, task(), { previousPlan: legacy, nextPlan: structuredClone(legacy) }).disposition, 'carry_valid')
  assert.equal(classifyTaskRevisionChange(previousTask, task(), {
    previousPlan: legacy,
    nextPlan: revisionContext({ planningBindings: false, unitCwd: 'packages/unit-next' }),
  }).disposition, 'pending_check')
  assert.equal(classifyTaskRevisionChange(previousTask, task(), {
    previousPlan: legacy,
    nextPlan: revisionContext(),
  }).disposition, 'pending_check')
})

test('expanded write permissions require a pending check instead of carry-valid reuse', () => {
  const previousPlan = revisionContext({ planningBindings: false })
  const nextPlan = structuredClone(previousPlan)
  const expanded = task({ write: ['src/a.mjs', 'src/new/**'] })
  const classification = classifyTaskRevisionChange(task(), expanded, { previousPlan, nextPlan })
  assert.deepEqual(classification, {
    disposition: 'pending_check',
    reason: '任务 write 范围已扩大，旧 attempt 不得获得新增权限',
  })

  const migrated = migrateTaskStatesForRevision({
    previousPlan: { ...previousPlan, tasks: [task()] },
    nextPlan: { ...nextPlan, tasks: [expanded] },
    currentTaskStates: [{ taskId: 'A', status: 'completed', executorId: 'old', cursor: null, unchangedPolls: 0, reason: null, action: null }],
    initialTaskStates: [{ taskId: 'A', status: 'pending', executorId: null, cursor: null, unchangedPolls: 0, reason: null, action: null }],
    revision: 2,
  })
  assert.equal(migrated.dispositions.A.disposition, 'pending_check')
  assert.deepEqual(migrated.pendingCheckTaskIds, ['A'])
  assert.equal(migrated.taskStates[0].checkState, 'pending_check')
})

test('Revision migration supplies plan context so changed frozen inputs never carry completed work as valid', () => {
  const previousPlan = { ...revisionContext(), tasks: [task()] }
  const nextPlan = {
    ...revisionContext({ binding: { tickets: [{ id: 'T-1', revision: 'R1', fragments: ['T-1:implementation'] }], contracts: [{ id: 'C-1', revision: 'v2' }] } }),
    tasks: [task()],
  }
  const migrated = migrateTaskStatesForRevision({
    previousPlan,
    nextPlan,
    currentTaskStates: [{ taskId: 'A', status: 'completed', executorId: 'old', cursor: null, unchangedPolls: 0, reason: null, action: null }],
    initialTaskStates: [{ taskId: 'A', status: 'pending', executorId: null, cursor: null, unchangedPolls: 0, reason: null, action: null }],
    revision: 2,
  })
  assert.equal(migrated.dispositions.A.disposition, 'pending_check')
  assert.equal(migrated.taskStates[0].checkState, 'pending_check')
})

test('计划修订保留完成结果，只重新检查语义变化的节点', () => {
  const previousPlan = {
    tasks: [
      task({ id: 'A' }),
      task({ id: 'B', title: '实现 B', write: ['src/b.mjs'] }),
      task({ id: 'D', title: '删除节点', write: ['src/d.mjs'] }),
    ],
  }
  const nextPlan = {
    tasks: [
      task({ id: 'A' }),
      task({ id: 'B', title: '实现 B', write: ['src/b.mjs'], done: ['测试和类型检查通过'] }),
      task({ id: 'C', title: '新增修复', write: ['src/c.mjs'] }),
    ],
  }
  const currentTaskStates = [
    { taskId: 'A', status: 'completed', executorId: 'a', cursor: '1', unchangedPolls: 0, reason: null, action: null },
    { taskId: 'B', status: 'completed', executorId: 'b', cursor: '2', unchangedPolls: 0, reason: null, action: null },
    { taskId: 'D', status: 'completed', executorId: 'd', cursor: '3', unchangedPolls: 0, reason: null, action: null },
  ]
  const initialTaskStates = nextPlan.tasks.map(item => ({
    taskId: item.id,
    status: 'pending',
    executorId: null,
    cursor: null,
    unchangedPolls: 0,
    reason: null,
    action: null,
  }))

  const migrated = migrateTaskStatesForRevision({
    previousPlan,
    nextPlan,
    currentTaskStates,
    initialTaskStates,
    revision: 4,
  })

  assert.deepEqual(migrated.taskStates.map(record => [record.taskId, record.status, record.checkState]), [
    ['A', 'completed', 'valid'],
    ['B', 'completed', 'pending_check'],
    ['C', 'pending', null],
  ])
  assert.deepEqual(migrated.pendingCheckTaskIds, ['B'])
  assert.equal(migrated.dispositions.A.disposition, 'carry_valid')
  assert.equal(migrated.dispositions.B.disposition, 'pending_check')
  assert.equal(migrated.dispositions.C.disposition, 'new')
})

test('Planner 改写历史文案时冻结已完成 task，只执行新增 repair 与最终 verify', () => {
  const previousPlan = {
    contract: 'DSH_PLAN_V2',
    verifications: [
      { id: 'build', run: ['npm', 'run', 'build'] },
      { id: 'test', run: ['npm', 'run', 'test'] },
    ],
    tasks: [
      task({ id: 'T8', title: '测试基础设施', done: ['旧的精确完成契约'], verify: ['build'] }),
      task({ id: 'T4', title: '钱包编排', write: ['src/wallet/index.tsx'], done: ['旧的钱包完成契约'], verify: ['build'] }),
    ],
  }
  const candidatePlan = {
    contract: 'DSH_PLAN_V2',
    verifications: [
      { id: 'build', run: ['npm', 'run', 'build:new'] },
      { id: 'test', run: ['npm', 'run', 'test'] },
    ],
    tasks: [
      task({ id: 'T8', title: '测试基础设施', done: ['Planner 改写后的文案'], verify: ['build'] }),
      task({ id: 'T4', title: '钱包编排', write: ['src/wallet/index.tsx'], done: ['Planner 改写后的文案'], verify: ['build'] }),
      task({ id: 'T26', title: '修复 openModal', write: ['src/wallet/index.tsx'], verify: ['build'] }),
      task({ id: 'T25', role: 'verify', title: '最终重验', dependsOn: ['T26'], write: [], verify: ['test'] }),
    ],
  }

  const frozen = freezeCompletedTaskDefinitions({
    previousPlan,
    nextPlan: candidatePlan,
    completedTaskIds: ['T8', 'T4'],
  })
  assert.deepEqual(frozen.frozenTaskIds, ['T8', 'T4'])
  assert.deepEqual(frozen.plan.tasks.map(item => item.id), ['T8', 'T4', 'T26', 'T25'])
  assert.deepEqual(frozen.plan.tasks.find(item => item.id === 'T8').done, ['旧的精确完成契约'])
  assert.deepEqual(frozen.plan.tasks.find(item => item.id === 'T4').done, ['旧的钱包完成契约'])
  assert.deepEqual(frozen.plan.verifications.find(item => item.id === 'build').run, ['npm', 'run', 'build'])

  const currentTaskStates = previousPlan.tasks.map(item => ({
    taskId: item.id,
    status: 'completed',
    executorId: `${item.id}-session`,
    cursor: null,
    unchangedPolls: 0,
    reason: null,
    action: null,
  }))
  const initialTaskStates = frozen.plan.tasks.map(item => ({
    taskId: item.id,
    status: 'pending',
    executorId: null,
    cursor: null,
    unchangedPolls: 0,
    reason: null,
    action: null,
  }))
  const migrated = migrateTaskStatesForRevision({
    previousPlan,
    nextPlan: frozen.plan,
    currentTaskStates,
    initialTaskStates,
    revision: 9,
  })

  assert.deepEqual(migrated.taskStates.map(item => [item.taskId, item.status, item.checkState]), [
    ['T8', 'completed', 'valid'],
    ['T4', 'completed', 'valid'],
    ['T26', 'pending', null],
    ['T25', 'pending', null],
  ])
  assert.deepEqual(migrated.pendingCheckTaskIds, [])
})

test('旧运行自然结束后先执行新增前置，再把旧结果重新排入待检查', () => {
  const state = {
    plan: {
      tasks: [
        task({ id: 'C', title: '新增前置', dependsOn: [] }),
        task({ id: 'A', dependsOn: ['C'] }),
      ],
    },
    tasks: [
      { taskId: 'C', status: 'pending', checkState: null },
      { taskId: 'A', status: 'completed', checkState: 'pending_check', executorId: null, cursor: 'old', unchangedPolls: 0, reason: null, action: null },
    ],
    ownerRuns: { 'A:core': { status: 'completed', result: { commitSha: 'old' } } },
    supervisorOutbox: { 'A:core': { status: 'completed', reservationId: 'old-reservation' } },
    transitionBlockedTaskIds: ['C'],
    revisionTransition: {
      revision: 2,
      drainingTaskIds: ['A'],
      blockedTaskIds: ['C'],
      pendingCheckTaskIds: ['A'],
      phase: 'draining',
    },
  }

  const dependencyPhase = advanceRevisionTransition(state)
  assert.equal(dependencyPhase.changed, true)
  assert.deepEqual(state.transitionBlockedTaskIds, [])
  assert.equal(state.tasks[1].status, 'completed')

  state.tasks[0].status = 'completed'
  state.tasks[0].checkState = 'valid'
  const checkingPhase = advanceRevisionTransition(state)
  assert.deepEqual(checkingPhase.reopenedTaskIds, ['A'])
  assert.equal(state.tasks[1].status, 'pending')
  assert.equal(state.tasks[1].recheckOnly, true)
  assert.equal(state.tasks[1].checkState, 'pending_check')
  assert.equal(state.ownerRuns['A:core'], undefined)
  assert.equal(state.supervisorOutbox['A:core'], undefined)
  assert.equal(state.ownerRunHistory.length, 1)

  state.tasks[1].status = 'completed'
  state.tasks[1].checkState = 'valid'
  advanceRevisionTransition(state)
  assert.equal(state.revisionTransition, undefined)
})

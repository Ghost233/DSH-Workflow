import test from 'node:test'
import assert from 'node:assert/strict'

import { registerConversationSession, workflowOccupiesActiveSlot } from '../src/workflow-conversation.mjs'
import {
  advanceRevisionTransition,
  classifyTaskRevisionChange,
  createPlanRevision,
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

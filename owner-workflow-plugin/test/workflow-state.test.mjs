import test from 'node:test'
import assert from 'node:assert/strict'

import {
  deriveWorkflowControl,
  planReviewNeedsAutonomousWork,
  workflowOccupiesActiveSlot,
  workflowTaskCounts,
} from '../src/workflow-state.mjs'

const NOW = Date.parse('2026-08-30T02:00:00.000Z')

function planned(overrides = {}) {
  return {
    id: 'wf-test',
    status: 'planned',
    plan: { contract: 'DSH_PLAN_V2', tasks: [] },
    planDigest: 'digest',
    tasks: [],
    updatedAt: '2026-08-30T01:00:00.000Z',
    ...overrides,
  }
}

test('mixed needs_decision 的失败 Planning Driver 仍由统一决策器恢复', () => {
  const state = planned({
    planReview: { status: 'needs_decision' },
    planReviewDigest: 'digest',
    planningAgent: { phase: 'failed', updatedAt: '2026-08-30T01:00:00.000Z' },
    planConvergence: {
      contract: 'DSH_WORKFLOW_CONVERGENCE_V1',
      authorityRequired: false,
      nextStrategy: 'owner_council',
    },
  })
  assert.equal(planReviewNeedsAutonomousWork(state), true)
  assert.deepEqual(
    { kind: deriveWorkflowControl(state, { nowMs: NOW }).kind, command: deriveWorkflowControl(state, { nowMs: NOW }).command },
    { kind: 'command', command: 'planning-recover' },
  )
})

test('真正外部授权的 needs_decision 只形成一次显式等待', () => {
  const control = deriveWorkflowControl(planned({
    planReview: { status: 'needs_decision' },
    planConvergence: {
      contract: 'DSH_WORKFLOW_CONVERGENCE_V1',
      authorityRequired: true,
      nextStrategy: 'request_user_authority',
    },
  }), { nowMs: NOW })
  assert.equal(control.kind, 'wait')
  assert.equal(control.phase, 'awaiting_main_discussion')
  assert.equal(control.actionRequired, true)
})

test('Runner 生命周期由同一决策表覆盖执行、审查、修复和最终合并', () => {
  assert.equal(deriveWorkflowControl({ status: 'approved', tasks: [] }).command, 'execute')
  assert.equal(deriveWorkflowControl({ status: 'running', tasks: [] }).command, 'execute')
  assert.equal(deriveWorkflowControl({ status: 'completed', tasks: [] }).command, 'implementation-review')
  assert.equal(deriveWorkflowControl({
    status: 'completed', tasks: [], implementationReview: { status: 'needs_repair' },
  }).command, 'implementation-repair')
  assert.equal(deriveWorkflowControl({
    status: 'completed', tasks: [], implementationReview: { status: 'passed' },
  }).command, 'workflow-finalize')
  assert.equal(deriveWorkflowControl({
    status: 'completed',
    tasks: [],
    pendingPlanRevision: {
      review: { status: 'passed' },
      approvalPolicy: 'autonomous',
    },
    planConvergence: { nextStrategy: 'awaiting_approval' },
  }).command, 'plan-revision-approve')
})

test('新 repair 候选不会继承上一轮 awaiting_approval 而绕过 Reviewer', () => {
  const control = deriveWorkflowControl({
    status: 'completed',
    tasks: [],
    implementationReview: { status: 'needs_repair' },
    pendingPlanRevision: {
      cycleId: 'repair-cycle',
      approvalPolicy: 'autonomous',
      origin: 'implementation-review',
    },
    planConvergence: {
      cycleId: 'previous-cycle',
      nextStrategy: 'awaiting_approval',
    },
  })
  assert.equal(control.command, 'plan-revision-drive')
  assert.equal(control.phase, 'plan_revision_in_progress')
})

test('旧 repair 候选缺少 approvalPolicy 时仍按内部 Intent 自治批准', () => {
  const control = deriveWorkflowControl({
    status: 'completed',
    tasks: [],
    implementationRepair: { intentId: 'repair-intent' },
    pendingPlanRevision: {
      cycleId: 'repair-cycle',
      intentIds: ['repair-intent'],
      review: { status: 'passed' },
    },
    planConvergence: {
      cycleId: 'repair-cycle',
      nextStrategy: 'awaiting_approval',
    },
  })
  assert.equal(control.command, 'plan-revision-approve')
})

test('pending handoff 在 running 状态也优先进入局部重规划', () => {
  const control = deriveWorkflowControl({
    status: 'running',
    plan: { contract: 'DSH_PLAN_V2', tasks: [{ id: 'T1', dependsOn: [] }] },
    tasks: [{ taskId: 'T1', status: 'pending' }],
    handoffQueue: [{ id: 'handoff-1', status: 'pending', sourceTaskId: 'T1' }],
  })
  assert.equal(control.command, 'handoff-replan')
  assert.equal(control.phase, 'handoff_replanning')
})

test('已重规划 handoff 的新 DAG 不受旧 awaiting_main_discussion 阶段阻塞', () => {
  const control = deriveWorkflowControl(planned({
    planApproved: false,
    planReview: undefined,
    planningAgent: { phase: 'awaiting_main_discussion' },
    planningDiscussion: { status: 'delivered' },
    handoffQueue: [{ id: 'handoff-1', status: 'acknowledged' }],
  }), { nowMs: NOW })
  assert.equal(control.command, 'planning-recover')
  assert.equal(control.phase, 'plan_revision_recovery_queued')
})

test('失败与阻塞现场不会从 Runner 视野中静默消失', () => {
  const failed = deriveWorkflowControl({
    status: 'failed',
    plan: { contract: 'DSH_PLAN_V2', tasks: [{ id: 'T1', dependsOn: [] }] },
    tasks: [{ taskId: 'T1', status: 'stopped', reason: 'task_failed' }],
    ownerRuns: { 'T1:owner': { status: 'failed' } },
  })
  assert.equal(failed.command, 'workflow-recover')

  const unknownBlocked = deriveWorkflowControl({ status: 'blocked', tasks: [] })
  assert.equal(unknownBlocked.kind, 'invariant')
  assert.equal(unknownBlocked.command, 'reconcile')
})

test('任务计数与唯一 Workflow 槽位使用同一纯状态语义', () => {
  const counts = workflowTaskCounts({
    plan: { tasks: [{ id: 'T1', dependsOn: [] }, { id: 'T2', dependsOn: ['T1'] }] },
    tasks: [{ taskId: 'T1', status: 'completed' }, { taskId: 'T2', status: 'pending' }],
  })
  assert.equal(counts.completedTasks, 1)
  assert.equal(counts.pendingTasks, 1)
  assert.equal(counts.waitingDependencyTasks, 0)
  assert.equal(workflowOccupiesActiveSlot({ status: 'cancelled' }), true)
  assert.equal(workflowOccupiesActiveSlot({ status: 'cancelled', temporaryArtifactsCleaned: true }), false)
  assert.equal(workflowOccupiesActiveSlot({ status: 'completed', finalized: true }), false)
})

test('代表性非终态都必须给出 command 或显式 wait，禁止静默空洞', () => {
  const states = [
    { status: 'initializing', tasks: [] },
    { status: 'planning', tasks: [], planningAgent: { phase: 'failed' } },
    planned({ planningAgent: { phase: 'failed' } }),
    { status: 'approved', tasks: [] },
    { status: 'running', tasks: [] },
    { status: 'failed', planningFailure: { error: 'boom' }, tasks: [] },
    { status: 'completed', tasks: [] },
  ]
  for (const state of states) {
    const control = deriveWorkflowControl(state, { nowMs: NOW })
    assert.equal(control.terminal || control.command !== null || control.kind === 'wait', true, JSON.stringify(control))
  }
})

test('持久状态交叉空间中的每个组合都收敛为 command、wait、terminal 或 invariant', () => {
  const statuses = ['initializing', 'planning', 'planned', 'registry_pending_plan', 'approved', 'running', 'blocked', 'failed', 'completed', 'stopped', 'cancelled']
  const reviews = [undefined, 'passed', 'needs_revision', 'needs_split', 'needs_decision', 'needs_discovery']
  const phases = [undefined, 'reviewing', 'review_failed', 'revision', 'revision_retry_pending', 'failed', 'awaiting_plan_approval', 'awaiting_main_discussion']
  const allowedKinds = new Set(['command', 'wait', 'terminal', 'invariant'])
  for (const status of statuses) {
    for (const reviewStatus of reviews) {
      for (const phase of phases) {
        const state = {
          id: 'wf-space',
          status,
          plan: status === 'initializing' ? undefined : { contract: 'DSH_PLAN_V2', tasks: [] },
          planDigest: status === 'initializing' ? undefined : 'digest',
          tasks: [],
          planningAgent: phase === undefined ? undefined : { phase },
          planReview: reviewStatus === undefined ? undefined : { status: reviewStatus },
          planReviewDigest: reviewStatus === undefined ? undefined : 'digest',
          planConvergence: reviewStatus === 'needs_decision'
            ? {
                contract: 'DSH_WORKFLOW_CONVERGENCE_V1',
                authorityRequired: true,
                nextStrategy: 'request_user_authority',
              }
            : undefined,
        }
        const control = deriveWorkflowControl(state, { nowMs: NOW })
        assert.equal(allowedKinds.has(control.kind), true)
        assert.equal(control.terminal || control.command !== null || control.kind === 'wait', true)
      }
    }
  }
})

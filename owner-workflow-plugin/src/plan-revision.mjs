import { createHash } from 'node:crypto'
import { scopePatternCoveredBy } from './model.mjs'

export const PLAN_REVISION_CONTRACT = 'DSH_PLAN_REVISION_V1'
export const TASK_CHECK_STATES = Object.freeze(['valid', 'pending_check', 'invalid'])

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function planSnapshotDigest(plan) {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex')
}

export function createPlanRevision({ number, parent, plan, planDigest }) {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('PlanRevision.number 必须是正整数')
  if (parent !== null && (!Number.isSafeInteger(parent) || parent < 1 || parent >= number)) {
    throw new Error('PlanRevision.parent 必须是更早的版本号或 null')
  }
  const digest = planDigest ?? planSnapshotDigest(plan)
  if (digest !== planSnapshotDigest(plan)) throw new Error('PlanRevision.planDigest 与 DSH_PLAN_V2 快照不一致')
  return {
    contract: PLAN_REVISION_CONTRACT,
    number,
    parent,
    planDigest: digest,
    plan: structuredClone(plan),
  }
}

function exactList(value) {
  return Array.isArray(value) ? [...value].sort() : []
}

function same(value, other) {
  return canonical(value) === canonical(other)
}

/**
 * revision 切换只对权限边界做硬中止；需求、依赖、验证或 write 扩大均允许旧运行自然结束，
 * 但结果必须进入“待检查”而不是直接成为最终有效结果。
 */
export function classifyTaskRevisionChange(previousTask, nextTask, options = {}) {
  if (nextTask === undefined) return { disposition: 'abort', reason: '任务已从新 DAG 删除' }
  if (previousTask.ownerId !== nextTask.ownerId) return { disposition: 'abort', reason: '任务 Owner 已变化' }
  if (previousTask.role !== nextTask.role) return { disposition: 'abort', reason: '任务角色已变化' }
  if (options.registryChanged === true) return { disposition: 'abort', reason: 'Owner Registry 已变化' }
  if (!(previousTask.write ?? []).every(path => scopePatternCoveredBy(path, nextTask.write ?? []))) {
    return { disposition: 'abort', reason: '任务 write 范围被收窄或改写' }
  }
  const unchanged = same({
    title: previousTask.title,
    dependsOn: exactList(previousTask.dependsOn),
    write: exactList(previousTask.write),
    verify: exactList(previousTask.verify),
    done: previousTask.done,
    priority: previousTask.priority,
  }, {
    title: nextTask.title,
    dependsOn: exactList(nextTask.dependsOn),
    write: exactList(nextTask.write),
    verify: exactList(nextTask.verify),
    done: nextTask.done,
    priority: nextTask.priority,
  })
  return unchanged
    ? { disposition: 'carry_valid', reason: '任务权限和语义均未变化' }
    : { disposition: 'pending_check', reason: '任务仍可复用，但必须按新 DAG 检查' }
}

function ownerRunKey(taskId, ownerId) {
  return `${taskId}:${ownerId}`
}

function archiveRuntimeAttempt(state, taskId, ownerId, reason, time) {
  const key = ownerRunKey(taskId, ownerId)
  const ownerRun = state.ownerRuns?.[key]
  const reservation = state.supervisorOutbox?.[key]
  if (ownerRun === undefined && reservation === undefined) return
  state.ownerRunHistory ??= []
  state.ownerRunHistory.push({
    taskId,
    ownerId,
    reason,
    archivedAt: time,
    ...(ownerRun === undefined ? {} : { ownerRun: structuredClone(ownerRun) }),
    ...(reservation === undefined ? {} : { reservation: structuredClone(reservation) }),
  })
  state.ownerRunHistory = state.ownerRunHistory.slice(-100)
  if (state.ownerRuns !== undefined) delete state.ownerRuns[key]
  if (state.supervisorOutbox !== undefined) delete state.supervisorOutbox[key]
}

function resetTaskForRevisionCheck(state, taskState, taskPlan, time) {
  archiveRuntimeAttempt(state, taskPlan.id, taskPlan.ownerId, 'PlanRevision 待检查任务重新执行固定验证', time)
  taskState.status = 'pending'
  taskState.executorId = null
  taskState.cursor = null
  taskState.unchangedPolls = 0
  taskState.reason = null
  taskState.action = null
  taskState.recheckOnly = true
  taskState.checkState = 'pending_check'
  delete taskState.verificationResults
}

/**
 * 旧运行先自然结算，新增前置随后执行，最后把受影响的已完成任务重新排入固定验证。
 * 该函数只修改持久化状态，不直接启动子代理。
 */
export function advanceRevisionTransition(state, time = new Date().toISOString()) {
  const transition = state.revisionTransition
  if (transition === undefined) return { changed: false, reopenedTaskIds: [] }
  const tasks = new Map((state.tasks ?? []).map(task => [task.taskId, task]))
  const plans = new Map((state.plan?.tasks ?? []).map(task => [task.id, task]))
  const draining = (transition.drainingTaskIds ?? []).some(taskId => tasks.get(taskId)?.status === 'running')
  if (draining) return { changed: false, reopenedTaskIds: [] }

  let changed = false
  if ((state.transitionBlockedTaskIds ?? []).length > 0) {
    state.transitionBlockedTaskIds = []
    transition.drainingCompletedAt ??= time
    changed = true
  }

  const reopenedTaskIds = []
  for (const taskId of transition.pendingCheckTaskIds ?? []) {
    const taskState = tasks.get(taskId)
    const taskPlan = plans.get(taskId)
    if (taskState === undefined || taskPlan === undefined || taskState.checkState !== 'pending_check') continue
    if (taskState.status !== 'completed') continue
    const dependenciesReady = taskPlan.dependsOn.every(dependencyId => {
      const dependency = tasks.get(dependencyId)
      return dependency?.status === 'completed' && dependency.checkState !== 'invalid'
    })
    if (!dependenciesReady) continue
    const reservation = state.supervisorOutbox?.[ownerRunKey(taskId, taskPlan.ownerId)]
    if (reservation !== undefined && ['reserved', 'launching'].includes(reservation.status)) continue
    resetTaskForRevisionCheck(state, taskState, taskPlan, time)
    reopenedTaskIds.push(taskId)
    changed = true
  }

  const unfinished = (transition.pendingCheckTaskIds ?? []).some(taskId => tasks.get(taskId)?.checkState === 'pending_check')
  if (!unfinished) {
    state.revisionTransition = undefined
    state.transitionBlockedTaskIds = []
    changed = true
  } else {
    transition.phase = reopenedTaskIds.length > 0 ? 'checking' : 'dependencies'
  }
  return { changed, reopenedTaskIds }
}

/** 把权限边界硬中止的旧运行移入历史，保证固定提交不再进入 workflow。 */
export function archiveAbortedRevisionAttempt(state, taskId, ownerId, reason, time = new Date().toISOString()) {
  archiveRuntimeAttempt(state, taskId, ownerId, reason, time)
}

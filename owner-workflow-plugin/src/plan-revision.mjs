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
    ...(plan.publicOwnerChanges === undefined ? {} : {
      publicOwnerChanges: structuredClone(plan.publicOwnerChanges),
    }),
    plan: structuredClone(plan),
  }
}

/**
 * 已结算 task 是不可变的执行历史。Planner 若需要补充或修正其语义，必须新增后继
 * repair/verify 节点，不能通过改写旧节点的 title/done/verification 让它重新执行。
 */
export function freezeCompletedTaskDefinitions({ previousPlan, nextPlan, completedTaskIds = [] }) {
  const frozenIds = new Set(completedTaskIds)
  const previousTasks = new Map((previousPlan?.tasks ?? []).map(task => [task.id, task]))
  const nextTasks = new Map((nextPlan?.tasks ?? []).map(task => [task.id, task]))
  const frozenTaskIds = [...frozenIds].filter(taskId => previousTasks.has(taskId))
  if (frozenTaskIds.length === 0) {
    return { plan: structuredClone(nextPlan), frozenTaskIds: [] }
  }

  const tasks = [
    ...(previousPlan?.tasks ?? []).flatMap(previous => {
      if (frozenIds.has(previous.id)) return [structuredClone(previous)]
      const candidate = nextTasks.get(previous.id)
      return candidate === undefined ? [] : [structuredClone(candidate)]
    }),
    ...(nextPlan?.tasks ?? [])
      .filter(task => !previousTasks.has(task.id))
      .map(task => structuredClone(task)),
  ]

  const frozenVerificationIds = new Set(frozenTaskIds.flatMap(taskId => (
    previousTasks.get(taskId)?.verify ?? []
  )))
  const previousVerifications = new Map((previousPlan?.verifications ?? []).map(item => [item.id, item]))
  const nextVerificationIds = new Set((nextPlan?.verifications ?? []).map(item => item.id))
  const verifications = [
    ...(nextPlan?.verifications ?? []).map(item => (
      frozenVerificationIds.has(item.id) && previousVerifications.has(item.id)
        ? structuredClone(previousVerifications.get(item.id))
        : structuredClone(item)
    )),
    ...[...frozenVerificationIds]
      .filter(id => !nextVerificationIds.has(id) && previousVerifications.has(id))
      .map(id => structuredClone(previousVerifications.get(id))),
  ]

  return {
    plan: {
      ...structuredClone(nextPlan),
      tasks,
      verifications,
    },
    frozenTaskIds,
  }
}

function exactList(value) {
  return Array.isArray(value) ? [...value].sort() : []
}

function same(value, other) {
  return canonical(value) === canonical(other)
}

function selectedVerifications(task, plan) {
  const catalog = new Map((Array.isArray(plan?.verifications) ? plan.verifications : [])
    .filter(item => item !== null && typeof item === 'object' && typeof item.id === 'string')
    .map(item => [item.id, {
      id: item.id,
      run: Array.isArray(item.run) ? [...item.run] : null,
      ...(item.cwd === undefined ? {} : { cwd: item.cwd }),
    }]))
  return (task.verify ?? []).map(id => catalog.get(id) ?? { id, missing: true })
}

function selectedPlanningBinding(task, plan) {
  if (plan?.planningBindings === undefined) return { present: false }
  const bindings = plan.planningBindings
  if (bindings === null || typeof bindings !== 'object' || !Array.isArray(bindings.tasks)) {
    return { present: true, invalid: true }
  }
  const binding = bindings.tasks.find(item => item?.taskId === task.id)
  if (binding === undefined) return { present: true, missing: true }
  if (!Array.isArray(binding.tickets) || !Array.isArray(binding.contracts)) {
    return { present: true, invalid: true }
  }
  return {
    present: true,
    tickets: binding.tickets.map(ticket => ({
      id: ticket?.id,
      revision: ticket?.revision,
      fragments: exactList(ticket?.fragments),
    })).sort((left, right) => canonical(left).localeCompare(canonical(right))),
    contracts: binding.contracts.map(contract => ({
      id: contract?.id,
      revision: contract?.revision,
    })).sort((left, right) => canonical(left).localeCompare(canonical(right))),
  }
}

function selectedPublicOwnerBindings(task, plan) {
  if (plan?.publicOwnerChanges === undefined) return { bindings: [] }
  if (!Array.isArray(plan.publicOwnerChanges)) return { present: true, invalid: true }
  return {
    bindings: plan.publicOwnerChanges.filter(binding => (
      binding?.implementationTaskId === task.id
      || binding?.consumers?.some(consumer => consumer?.taskId === task.id)
    )).sort((left, right) => canonical(left).localeCompare(canonical(right))),
  }
}

function changedReferencedInputs(previousTask, nextTask, { previousPlan, nextPlan }) {
  if (previousPlan === undefined && nextPlan === undefined) return false
  if (!same(selectedVerifications(previousTask, previousPlan), selectedVerifications(nextTask, nextPlan))) {
    return '任务引用的固定验证声明已变化'
  }
  if (!same(selectedPlanningBinding(previousTask, previousPlan), selectedPlanningBinding(nextTask, nextPlan))) {
    return '任务引用的冻结规划绑定已变化'
  }
  if (!same(selectedPublicOwnerBindings(previousTask, previousPlan), selectedPublicOwnerBindings(nextTask, nextPlan))) {
    return '任务引用的公共 Owner 决定绑定已变化'
  }
  return false
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
  if (!(nextTask.write ?? []).every(path => scopePatternCoveredBy(path, previousTask.write ?? []))) {
    return { disposition: 'pending_check', reason: '任务 write 范围已扩大，旧 attempt 不得获得新增权限' }
  }
  const referencedInputsChanged = changedReferencedInputs(previousTask, nextTask, options)
  if (referencedInputsChanged) return { disposition: 'pending_check', reason: referencedInputsChanged }
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

/**
 * Project persisted task state onto a revised DAG without discarding reusable work.
 * The caller supplies freshly initialized records so this module does not duplicate
 * Supervisor defaults. Runtime-only attempts are deliberately handled by the caller.
 */
export function migrateTaskStatesForRevision({
  previousPlan,
  nextPlan,
  currentTaskStates,
  initialTaskStates,
  revision,
  registryChanged = false,
}) {
  const previousTasks = new Map((previousPlan?.tasks ?? []).map(task => [task.id, task]))
  const currentStates = new Map((currentTaskStates ?? []).map(task => [task.taskId, task]))
  const initialStates = new Map((initialTaskStates ?? []).map(task => [task.taskId, task]))
  const pendingCheckTaskIds = []
  const dispositions = {}
  const taskStates = []

  for (const task of nextPlan?.tasks ?? []) {
    const initial = initialStates.get(task.id)
    if (initial === undefined) throw new Error(`PlanRevision 缺少 task ${task.id} 的初始状态`)
    const previous = previousTasks.get(task.id)
    const existing = currentStates.get(task.id)
    if (previous === undefined || existing === undefined) {
      dispositions[task.id] = { disposition: 'new', reason: '任务由当前 PlanRevision 新增' }
      taskStates.push({ ...initial, planRevision: revision, checkState: null })
      continue
    }

    const classification = classifyTaskRevisionChange(previous, task, {
      registryChanged,
      previousPlan,
      nextPlan,
    })
    dispositions[task.id] = classification
    const nextState = {
      ...existing,
      planRevision: revision,
      revisionDisposition: classification.disposition,
      revisionReason: classification.reason,
    }
    if (classification.disposition === 'carry_valid' && existing.status === 'completed') {
      nextState.checkState = 'valid'
    } else if (classification.disposition === 'pending_check') {
      if (['running', 'completed'].includes(existing.status)) {
        nextState.checkState = 'pending_check'
        nextState.recheckOnly = false
        pendingCheckTaskIds.push(task.id)
      } else {
        nextState.checkState = null
        nextState.recheckOnly = false
      }
    } else if (classification.disposition === 'abort' && existing.status !== 'running') {
      Object.assign(nextState, initial, {
        planRevision: revision,
        revisionDisposition: classification.disposition,
        revisionReason: classification.reason,
        checkState: 'invalid',
        recheckOnly: false,
      })
    }
    taskStates.push(nextState)
  }

  return { taskStates, pendingCheckTaskIds, dispositions }
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

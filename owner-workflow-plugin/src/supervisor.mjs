import {
  PLAN_V2_CONTRACT,
  STOP_REASON_ACTIONS,
  TASK_STATUSES,
  normalizePlanV2,
} from './model.mjs'

const SUPERVISOR_ACTIONS = Object.freeze(['create', 'wait', 'notify', 'inspect', 'stop'])
const STALL_INSPECT_THRESHOLD = 10

function fail(message) {
  throw new Error(message)
}

function nonEmptyText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${field} 必须是非空字符串`)
  return value.trim()
}

function optionalText(value, field) {
  if (value === undefined || value === null) return null
  return nonEmptyText(value, field)
}

function optionalNonNegativeSafeInteger(value, field, fallback = 0) {
  if (value === undefined || value === null) return fallback
  if (!Number.isSafeInteger(value) || value < 0) fail(`${field} 必须是非负安全整数`)
  return value
}

function normalizeParallel(value) {
  if (value === undefined || value === null) return 1
  if (!Number.isSafeInteger(value) || value < 1) fail('config.parallel 必须是正安全整数')
  return value
}

function normalizeTaskRecord(raw, task, index) {
  if (raw === null || typeof raw !== 'object') fail(`tasks[${index}] 必须是对象`)
  const taskId = nonEmptyText(raw.taskId ?? raw.id, `tasks[${index}].taskId`)
  if (taskId !== task.id) fail(`tasks[${index}] 与计划任务 ${task.id} 不一致`)
  const status = nonEmptyText(raw.status, `tasks[${index}].status`)
  if (!TASK_STATUSES.includes(status)) fail(`tasks[${index}].status 不受支持：${status}`)
  const executorId = optionalText(raw.executorId, `tasks[${index}].executorId`)
  const cursor = optionalText(raw.cursor, `tasks[${index}].cursor`)
  const unchangedPolls = optionalNonNegativeSafeInteger(raw.unchangedPolls, `tasks[${index}].unchangedPolls`)
  const reason = optionalText(raw.reason, `tasks[${index}].reason`)
  const action = optionalText(raw.action, `tasks[${index}].action`)
  const verificationResults = raw.verificationResults
  if (verificationResults !== undefined && (
    verificationResults === null
    || typeof verificationResults !== 'object'
    || Array.isArray(verificationResults)
  )) {
    fail(`tasks[${index}].verificationResults 必须是对象`)
  }

  if (status === 'stopped') {
    if (reason === null || action === null || STOP_REASON_ACTIONS[reason] !== action) {
      fail(`tasks[${index}] 的停止 reason/action 配对不受支持`)
    }
  } else if (reason !== null || action !== null) {
    fail(`tasks[${index}] 只有停止时才能携带 reason/action`)
  }
  if (status === 'pending' && executorId !== null) fail(`tasks[${index}] 等待中不能绑定 executorId`)
  if (status !== 'running' && unchangedPolls !== 0) fail(`tasks[${index}] 非运行中时 unchangedPolls 必须为 0`)

  return {
    taskId,
    status,
    executorId,
    cursor,
    unchangedPolls,
    reason,
    action,
    // Supervisor 只更新调度字段；提交关卡写入的验证证据必须原样保留。
    ...(verificationResults === undefined ? {} : { verificationResults: structuredClone(verificationResults) }),
  }
}

function taskRecordsById(tasks) {
  return new Map(tasks.map(task => [task.taskId, task]))
}

function effectiveTaskStatus(taskId, planById, records, visiting = new Set()) {
  const task = planById.get(taskId)
  const record = records.get(taskId)
  if (task === undefined || record === undefined) fail(`任务状态缺失：${taskId}`)
  if (task.children === undefined) return record.status
  if (visiting.has(taskId)) fail(`Composite 父子关系存在环：${taskId}`)
  visiting.add(taskId)
  const childStatuses = task.exit.map(childId => effectiveTaskStatus(childId, planById, records, visiting))
  visiting.delete(taskId)
  if (childStatuses.every(status => status === 'completed')) return 'completed'
  if (childStatuses.some(status => status === 'stopped')) return 'stopped'
  return record.status === 'stopped' ? 'stopped' : 'pending'
}

function reconcileCompositeParents(plan, tasks) {
  const next = tasks.map(task => ({ ...task }))
  const records = taskRecordsById(next)
  const planById = new Map(plan.tasks.map(task => [task.id, task]))
  for (const task of plan.tasks) {
    if (task.children === undefined) continue
    const record = records.get(task.id)
    const status = effectiveTaskStatus(task.id, planById, records)
    if (status === 'completed') {
      const index = next.findIndex(item => item.taskId === task.id)
      next[index] = {
        ...record,
        status: 'completed',
        executorId: null,
        cursor: null,
        unchangedPolls: 0,
        reason: null,
        action: null,
      }
    }
  }
  return next
}

function normalizeState(state) {
  if (state === null || typeof state !== 'object') fail('Supervisor 状态必须是对象')
  const workflowId = nonEmptyText(state.workflowId ?? state.id, 'workflowId')
  const revision = optionalNonNegativeSafeInteger(state.revision, 'revision')
  if (state.plan?.contract !== PLAN_V2_CONTRACT) fail('Supervisor 仅支持 DSH_PLAN_V2 计划')
  const plan = normalizePlanV2(state.plan)
  if (!Array.isArray(state.tasks)) fail('Supervisor 状态必须包含任务数组')
  if (state.tasks.length !== plan.tasks.length) fail('Supervisor 任务状态数量与计划不一致')
  const taskById = new Map(state.tasks.map(item => [item?.taskId ?? item?.id, item]))
  if (taskById.size !== plan.tasks.length) fail('Supervisor 任务状态不能重复')
  const tasks = plan.tasks.map((task, index) => {
    const raw = taskById.get(task.id)
    if (raw === undefined) fail(`Supervisor 缺少任务状态：${task.id}`)
    return normalizeTaskRecord(raw, task, index)
  })
  const planById = new Map(plan.tasks.map(task => [task.id, task]))
  const records = taskRecordsById(tasks)
  for (const task of plan.tasks) {
    if (task.children === undefined) continue
    const record = records.get(task.id)
    if (record.status === 'running' || (record.status === 'completed'
      && effectiveTaskStatus(task.id, planById, records) !== 'completed')) {
      fail(`Composite 父任务 ${task.id} 只能在所有 exit 完成后视为 completed`)
    }
  }
  const parallel = normalizeParallel(state.config?.parallel ?? state.parallel)
  const actionSequence = optionalNonNegativeSafeInteger(state.actionSequence, 'actionSequence')
  if (actionSequence >= Number.MAX_SAFE_INTEGER) fail('actionSequence 已达到安全上限，无法继续确认动作')
  if (tasks.filter(task => task.status === 'running').length > parallel) {
    fail('运行中的 active 任务数量不能超过 config.parallel')
  }
  return {
    workflowId,
    revision,
    plan,
    tasks,
    parallel,
    actionSequence,
  }
}

function readyTaskPlans(state) {
  const tasks = taskRecordsById(state.tasks)
  const planById = new Map(state.plan.tasks.map(task => [task.id, task]))
  const status = taskId => effectiveTaskStatus(taskId, planById, tasks)
  return state.plan.tasks.filter(task => {
    const record = tasks.get(task.id)
    if (task.children !== undefined) return false
    if (record.status !== 'pending' || status(task.id) !== 'pending') return false
    const parent = task.parentTaskId === undefined ? undefined : planById.get(task.parentTaskId)
    const parentReady = parent === undefined
      ? true
      : parent.dependsOn.every(id => status(id) === 'completed')
    return parentReady && task.dependsOn.every(id => status(id) === 'completed')
  })
}

function taskPayload(task) {
  return {
    taskId: task.id,
    ownerId: task.ownerId,
    role: task.role,
    title: task.title,
    dependsOn: [...task.dependsOn],
    write: [...task.write],
    verify: [...task.verify],
    done: [...task.done],
    priority: task.priority,
    onFailure: { ...task.onFailure },
    onBlocked: { ...task.onBlocked },
    onTimeout: { ...task.onTimeout },
    ...(task.parentTaskId === undefined ? {} : { parentTaskId: task.parentTaskId }),
  }
}

function watchPayload(task) {
  return { taskId: task.taskId, cursor: task.cursor, executorId: task.executorId, unchangedPolls: task.unchangedPolls }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fingerprint(value) {
  let hash = 0xcbf29ce484222325n
  for (const character of stableStringify(value)) {
    hash ^= BigInt(character.codePointAt(0))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0')
}

function actionId(state, action, payload) {
  return `sa-${fingerprint({
    workflowId: state.workflowId,
    workflowRevision: state.revision,
    planDigest: fingerprint(state.plan),
    taskProjection: state.tasks,
    parallel: state.parallel,
    sequence: state.actionSequence,
    action,
    payload,
  })}`
}

function receipt(state, action, payload = {}) {
  if (!SUPERVISOR_ACTIONS.includes(action)) fail(`Supervisor 动作不受支持：${action}`)
  return { action, actionId: actionId(state, action, payload), ...payload }
}

function nextReceipt(state) {
  const active = state.tasks.filter(task => task.status === 'running')
  const stalled = active.filter(task => task.unchangedPolls >= STALL_INSPECT_THRESHOLD)
  if (stalled.length > 0) {
    const watches = stalled.map(watchPayload)
    return receipt(state, 'inspect', { watches, ...(watches.length === 1 ? { watch: watches[0] } : {}) })
  }

  const slots = Math.max(0, state.parallel - active.length)
  const taskById = new Map(state.plan.tasks.map(task => [task.id, task]))
  const activeOwnerIds = new Set(active.map(task => taskById.get(task.taskId).ownerId))
  const selectedOwnerIds = new Set()
  const ready = readyTaskPlans(state)
    .sort((left, right) => right.priority - left.priority)
    .filter(task => {
    if (activeOwnerIds.has(task.ownerId) || selectedOwnerIds.has(task.ownerId)) return false
    selectedOwnerIds.add(task.ownerId)
    return true
  })
  if (slots > 0 && ready.length > 0) return receipt(state, 'create', { tasks: ready.slice(0, slots).map(taskPayload) })
  if (active.length > 0) return receipt(state, 'wait', { watches: active.map(watchPayload) })
  if (state.tasks.some(task => task.status === 'stopped' && task.reason === 'decision_required')) {
    return receipt(state, 'notify', { notification: { kind: 'main', reason: 'decision_required' } })
  }
  if (state.tasks.every(task => task.status === 'completed' || task.status === 'stopped')) return receipt(state, 'stop')
  return receipt(state, 'notify', { notification: { kind: 'main', reason: 'decision_required' } })
}

function cloneState(state, tasks) {
  return {
    ...state,
    plan: state.plan,
    tasks: reconcileCompositeParents(state.plan, tasks),
    config: { ...(state.config ?? {}), parallel: state.parallel },
    actionSequence: state.actionSequence + 1,
  }
}

function observationItems(observation) {
  if (Array.isArray(observation)) return observation
  if (observation === null || typeof observation !== 'object') fail('动作确认观测必须是对象')
  const keys = Object.keys(observation)
  if (keys.some(key => key !== 'tasks' && key !== 'task')) fail('动作确认观测包含不受支持的字段')
  const hasTasks = Object.hasOwn(observation, 'tasks')
  const hasTask = Object.hasOwn(observation, 'task')
  if (hasTasks && hasTask) fail('动作确认不能同时包含 task 和 tasks')
  if (hasTasks) {
    if (!Array.isArray(observation.tasks)) fail('observation.tasks 必须是数组')
    return observation.tasks
  }
  if (hasTask) return [observation.task]
  return []
}

function assertOnlyFields(value, allowed, field) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(`${field} 包含不受支持的字段`)
}

function observationTaskId(entry, index) {
  const hasTaskId = Object.hasOwn(entry, 'taskId')
  const hasId = Object.hasOwn(entry, 'id')
  if (hasTaskId === hasId) fail(`observation.tasks[${index}] 必须且只能包含 taskId 或 id`)
  return nonEmptyText(hasTaskId ? entry.taskId : entry.id, `observation.tasks[${index}].taskId`)
}

function normalizeAckTaskObservation(entry, index, expectedAction) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) fail(`observation.tasks[${index}] 必须是对象`)
  const field = `observation.tasks[${index}]`
  const allowed = expectedAction === 'create'
    ? ['taskId', 'id', 'status', 'executorId', 'cursor']
    : ['taskId', 'id', 'status', 'executorId', 'cursor', 'reason', 'action']
  assertOnlyFields(entry, allowed, field)
  const taskId = observationTaskId(entry, index)
  const result = { taskId }
  if (Object.hasOwn(entry, 'status')) {
    result.status = nonEmptyText(entry.status, `${field}.status`)
    if (expectedAction === 'create') {
      if (result.status !== 'running') fail(`任务 ${taskId} 的 create 确认状态只能是 running`)
    } else if (!['running', 'completed', 'stopped'].includes(result.status)) {
      fail(`任务 ${taskId} 的观测状态不受支持：${result.status}`)
    }
  }
  for (const key of ['executorId', 'cursor']) {
    if (Object.hasOwn(entry, key)) result[key] = optionalText(entry[key], `任务 ${taskId} 的 ${key}`)
  }
  if (expectedAction !== 'create') {
    const hasReason = Object.hasOwn(entry, 'reason')
    const hasAction = Object.hasOwn(entry, 'action')
    if (result.status === 'stopped') {
      if (!hasReason || !hasAction) fail(`任务 ${taskId} 的停止观测必须包含 reason/action`)
      result.reason = nonEmptyText(entry.reason, `任务 ${taskId} 的 reason`)
      result.action = nonEmptyText(entry.action, `任务 ${taskId} 的 action`)
      if (STOP_REASON_ACTIONS[result.reason] !== result.action) fail(`任务 ${taskId} 的停止 reason/action 配对不受支持`)
    } else if (hasReason || hasAction) {
      fail(`任务 ${taskId} 只有 stopped 观测才能携带 reason/action`)
    }
  }
  return result
}

function observationsByTask(observation, targets, expectedAction) {
  const entries = observationItems(observation)
  const accepted = new Set(targets)
  const byId = new Map()
  for (const [index, entry] of entries.entries()) {
    const normalized = normalizeAckTaskObservation(entry, index, expectedAction)
    const { taskId } = normalized
    if (!accepted.has(taskId)) fail(`确认包含当前动作之外的任务：${taskId}`)
    if (byId.has(taskId)) fail(`确认重复了任务：${taskId}`)
    byId.set(taskId, normalized)
  }
  return byId
}

function applyCreatedTask(task, observation) {
  const executorId = optionalText(observation.executorId, `任务 ${task.taskId} 的 executorId`)
  const cursor = optionalText(observation.cursor, `任务 ${task.taskId} 的 cursor`)
  return { ...task, status: 'running', executorId, cursor, unchangedPolls: 0, reason: null, action: null }
}

function applyObservedTask(task, observation) {
  if (observation === undefined) {
    if (task.unchangedPolls >= Number.MAX_SAFE_INTEGER) fail(`任务 ${task.taskId} 的 unchangedPolls 已达到安全上限`)
    return { ...task, unchangedPolls: task.unchangedPolls + 1 }
  }
  const status = observation.status === undefined ? task.status : observation.status
  const executorId = observation.executorId === undefined ? task.executorId : optionalText(observation.executorId, `任务 ${task.taskId} 的 executorId`)
  const cursor = observation.cursor === undefined ? task.cursor : optionalText(observation.cursor, `任务 ${task.taskId} 的 cursor`)
  if (status === 'stopped') {
    const { reason, action } = observation
    return { ...task, status, executorId, cursor, unchangedPolls: 0, reason, action }
  }
  if (status === 'completed') {
    return { ...task, status, executorId, cursor, unchangedPolls: 0, reason: null, action: null }
  }
  return {
    ...task,
    status: 'running',
    executorId,
    cursor,
    unchangedPolls: cursor === task.cursor
      ? (task.unchangedPolls >= Number.MAX_SAFE_INTEGER
          ? fail(`任务 ${task.taskId} 的 unchangedPolls 已达到安全上限`)
          : task.unchangedPolls + 1)
      : 0,
    reason: null,
    action: null,
  }
}

export function createTaskState(plan) {
  const normalizedPlan = normalizePlanV2(plan)
  return normalizedPlan.tasks.map(task => ({
    taskId: task.id,
    status: 'pending',
    executorId: null,
    cursor: null,
    unchangedPolls: 0,
    reason: null,
    action: null,
  }))
}

export function supervisorNext(state, _now) {
  return nextReceipt(normalizeState(state))
}

export function ackSupervisorAction(state, receivedActionId, observation = {}) {
  const normalized = normalizeState(state)
  const expected = nextReceipt(normalized)
  if (nonEmptyText(receivedActionId, 'actionId') !== expected.actionId) fail('actionId 与当前 Supervisor 动作不匹配')
  if (observation === null || typeof observation !== 'object') fail('动作确认观测必须是对象')

  if (expected.action === 'create') {
    const targets = expected.tasks.map(task => task.taskId)
    const observed = observationsByTask(observation, targets, 'create')
    if (observed.size !== targets.length) fail('create 动作确认必须覆盖全部任务')
    return cloneState(normalized, normalized.tasks.map(task => (
      observed.has(task.taskId) ? applyCreatedTask(task, observed.get(task.taskId)) : task
    )))
  }

  if (expected.action === 'wait' || expected.action === 'inspect') {
    const targets = expected.watches.map(watch => watch.taskId)
    const observed = observationsByTask(observation, targets, expected.action)
    return cloneState(normalized, normalized.tasks.map(task => (
      targets.includes(task.taskId) ? applyObservedTask(task, observed.get(task.taskId)) : task
    )))
  }

  if (expected.action === 'notify' || expected.action === 'stop') {
    if (Array.isArray(observation) || Object.keys(observation).length > 0) fail(`${expected.action} 动作确认不能携带观测内容`)
    return cloneState(normalized, normalized.tasks)
  }
  fail(`Supervisor 动作不受支持：${expected.action}`)
}

export function projectProgress(state) {
  const normalized = normalizeState(state)
  const taskPlans = new Map(normalized.plan.tasks.map(task => [task.id, task]))
  const records = taskRecordsById(normalized.tasks)
  return {
    contract: 'DSH_WORKFLOW_PROGRESS_V1',
    summary: normalized.plan.summary,
    tasks: normalized.tasks.map(record => {
      const task = taskPlans.get(record.taskId)
      return {
        id: task.id,
        ownerId: task.ownerId,
        role: task.role,
        title: task.title,
        dependsOn: [...task.dependsOn],
        status: effectiveTaskStatus(record.taskId, taskPlans, records),
        executorId: record.executorId,
        cursor: record.cursor,
        unchangedPolls: record.unchangedPolls,
        reason: record.reason,
        action: record.action,
        ...(task.parentTaskId === undefined ? {} : { parentTaskId: task.parentTaskId }),
      }
    }),
  }
}

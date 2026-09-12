import { normalizePublicOwnerChangeLog } from './public-owner-change.mjs'

export const PUBLIC_OWNER_PLAN_BINDING_CONTRACT = 'DSH_PUBLIC_OWNER_PLAN_BINDING_V1'

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u
const SHA256 = /^[a-f0-9]{64}$/u
const TECHNICAL_OUTCOMES = new Set(['compatible_extension', 'migration_required'])
const CONSUMER_IMPACTS = new Set(['no_change', 'compatible', 'update_required'])

function fail(reason) {
  throw new Error(`PublicOwnerPlan ${reason}`)
}

function plain(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || Object.getOwnPropertySymbols(value).length !== 0
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(item => (
      !item.enumerable || !Object.hasOwn(item, 'value')
    ))) fail(`${field}_invalid`)
  return value
}

function exact(value, keys, field) {
  const object = plain(value, field)
  const actual = Object.getOwnPropertyNames(object).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${field}_fields_invalid`)
  }
  return object
}

function text(value, field, pattern = STABLE_ID) {
  if (typeof value !== 'string' || !pattern.test(value)) fail(`${field}_invalid`)
  return value
}

function integer(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${field}_invalid`)
  return value
}

function unique(items, field, key = value => value) {
  const seen = new Set()
  for (const item of items) {
    const identity = key(item)
    if (seen.has(identity)) fail(`${field}_duplicate:${identity}`)
    seen.add(identity)
  }
  return items
}

function contractReference(raw, field) {
  exact(raw, ['id', 'revision'], field)
  return {
    id: text(raw.id, `${field}.id`),
    revision: text(raw.revision, `${field}.revision`),
  }
}

function consumerBinding(raw, field) {
  exact(raw, ['consumerId', 'ownerId', 'impact', 'taskId', 'contract'], field)
  const impact = text(raw.impact, `${field}.impact`)
  if (!CONSUMER_IMPACTS.has(impact)) fail(`${field}.impact_invalid`)
  const taskId = raw.taskId === null ? null : text(raw.taskId, `${field}.taskId`)
  if ((impact === 'no_change') !== (taskId === null)) fail(`${field}.task_binding_invalid`)
  return {
    consumerId: text(raw.consumerId, `${field}.consumerId`),
    ownerId: text(raw.ownerId, `${field}.ownerId`),
    impact,
    taskId,
    contract: contractReference(raw.contract, `${field}.contract`),
  }
}

function normalizeBinding(raw, index) {
  const field = `bindings[${index}]`
  exact(raw, [
    'contract', 'requestId', 'requestVersion', 'requestDigest', 'decisionId',
    'decisionDigest', 'targetOwnerId', 'outcome', 'implementationTaskId',
    'consumers', 'migrationOrder',
  ], field)
  if (raw.contract !== PUBLIC_OWNER_PLAN_BINDING_CONTRACT) fail(`${field}.contract_invalid`)
  const outcome = text(raw.outcome, `${field}.outcome`)
  if (!TECHNICAL_OUTCOMES.has(outcome)) fail(`${field}.outcome_not_technical`)
  if (!Array.isArray(raw.consumers) || raw.consumers.length === 0) fail(`${field}.consumers_invalid`)
  if (!Array.isArray(raw.migrationOrder)) fail(`${field}.migrationOrder_invalid`)
  const consumers = unique(
    raw.consumers.map((item, consumerIndex) => consumerBinding(item, `${field}.consumers[${consumerIndex}]`)),
    `${field}.consumers`,
    item => item.consumerId,
  )
  const migrationOrder = unique(
    raw.migrationOrder.map((item, orderIndex) => text(item, `${field}.migrationOrder[${orderIndex}]`)),
    `${field}.migrationOrder`,
  )
  return {
    contract: PUBLIC_OWNER_PLAN_BINDING_CONTRACT,
    requestId: text(raw.requestId, `${field}.requestId`),
    requestVersion: integer(raw.requestVersion, `${field}.requestVersion`),
    requestDigest: text(raw.requestDigest, `${field}.requestDigest`, SHA256),
    decisionId: text(raw.decisionId, `${field}.decisionId`),
    decisionDigest: text(raw.decisionDigest, `${field}.decisionDigest`, SHA256),
    targetOwnerId: text(raw.targetOwnerId, `${field}.targetOwnerId`),
    outcome,
    implementationTaskId: text(raw.implementationTaskId, `${field}.implementationTaskId`),
    consumers,
    migrationOrder,
  }
}

export function normalizePublicOwnerPlanBindings(raw) {
  if (!Array.isArray(raw) || raw.length === 0) fail('bindings_invalid')
  const bindings = raw.map(normalizeBinding)
  unique(bindings, 'bindings.decisionDigest', item => item.decisionDigest)
  unique(bindings, 'bindings.requestVersion', item => `${item.requestId}:${item.requestVersion}`)
  unique(bindings, 'bindings.implementationTaskId', item => item.implementationTaskId)
  return bindings
}

export function publicOwnerDecisionNeedsPlan(outcome) {
  return TECHNICAL_OUTCOMES.has(outcome)
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function taskDependsOn(tasks, taskId, dependencyId) {
  const byId = new Map(tasks.map(task => [task.id, task]))
  const seen = new Set()
  const visit = id => {
    if (id === dependencyId) return true
    if (seen.has(id)) return false
    seen.add(id)
    return (byId.get(id)?.dependsOn ?? []).some(visit)
  }
  return visit(taskId)
}

function taskContractBinding(plan, taskId, contract) {
  if (plan.planningBindings === undefined) return true
  const binding = plan.planningBindings.tasks.find(item => item.taskId === taskId)
  return binding?.contracts?.some(item => item.id === contract.id && item.revision === contract.revision) === true
}

function authoritativeSession(state, binding) {
  const key = `${binding.requestId}:${binding.requestVersion}`
  const record = state.publicOwnerDecisionSessions?.[key]
  if (record?.phase !== 'submission_observed') fail(`authority_session_missing:${key}`)
  if (record.requestId !== binding.requestId || record.requestVersion !== binding.requestVersion
    || record.requestDigest !== binding.requestDigest || record.decisionDigest !== binding.decisionDigest
    || record.receipt?.decisionDigest !== binding.decisionDigest
    || record.ownerId !== binding.targetOwnerId) fail(`authority_binding_mismatch:${key}`)
  const decision = record.decision
  if (decision?.decisionId !== binding.decisionId || decision?.requestDigest !== binding.requestDigest
    || decision?.outcome !== binding.outcome || decision?.targetOwnerId !== binding.targetOwnerId) {
    fail(`authority_decision_mismatch:${key}`)
  }
  if (record.planRevision !== Number(state.activePlanRevision ?? 1)
    || record.planDigest !== state.planDigest
    || decision.baseline?.workflowId !== state.id
    || decision.baseline?.planRevision !== Number(state.activePlanRevision ?? 1)
    || decision.baseline?.planDigest !== state.planDigest) fail(`authority_stale:${key}`)
  const log = normalizePublicOwnerChangeLog(state.publicOwnerChangeLog)
  const versions = log.requests
    .filter(item => item?.request?.requestId === binding.requestId)
    .sort((left, right) => left.request.requestVersion - right.request.requestVersion)
  const latest = versions.at(-1)
  if (latest?.request?.requestVersion !== binding.requestVersion
    || latest?.requestDigest !== binding.requestDigest) fail(`authority_superseded:${key}`)
  const loggedDecision = log.decisions.find(item => item.decisionDigest === binding.decisionDigest)
  if (loggedDecision === undefined || !same(loggedDecision.decision, decision)) {
    fail(`authority_log_mismatch:${key}`)
  }
  return record
}

function assertBindingPlan(plan, binding, record) {
  const tasks = plan.tasks
  const implementation = tasks.find(task => task.id === binding.implementationTaskId)
  const decision = record.decision
  const nextContract = {
    id: decision.baseline.contract.id,
    revision: decision.contractChange?.nextRevision,
  }
  if (typeof nextContract.revision !== 'string') fail(`contract_change_missing:${binding.decisionDigest}`)
  if (implementation?.role !== 'work' || implementation.ownerId !== binding.targetOwnerId) {
    fail(`implementation_owner_invalid:${binding.implementationTaskId}`)
  }
  if (!taskContractBinding(plan, implementation.id, nextContract)) {
    fail(`implementation_contract_invalid:${implementation.id}`)
  }

  const expectedConsumers = decision.affectedConsumers.map(item => ({
    consumerId: item.consumerId,
    ownerId: item.ownerId,
    impact: item.impact,
  })).sort((left, right) => left.consumerId.localeCompare(right.consumerId))
  const actualConsumers = binding.consumers.map(item => ({
    consumerId: item.consumerId,
    ownerId: item.ownerId,
    impact: item.impact,
  })).sort((left, right) => left.consumerId.localeCompare(right.consumerId))
  if (!same(actualConsumers, expectedConsumers)) fail(`consumer_coverage_invalid:${binding.decisionDigest}`)

  for (const consumer of binding.consumers) {
    const requiredRevision = consumer.impact === 'no_change'
      ? new Set([decision.baseline.contract.revision, nextContract.revision])
      : new Set([nextContract.revision])
    if (consumer.contract.id !== nextContract.id || !requiredRevision.has(consumer.contract.revision)) {
      fail(`consumer_contract_invalid:${consumer.consumerId}`)
    }
    if (consumer.taskId === null) continue
    const task = tasks.find(item => item.id === consumer.taskId)
    if (task?.role !== 'work' || task.ownerId !== consumer.ownerId) {
      fail(`consumer_owner_invalid:${consumer.consumerId}`)
    }
    if (!taskDependsOn(tasks, task.id, implementation.id)) {
      fail(`consumer_predecessor_missing:${consumer.consumerId}`)
    }
    if (!taskContractBinding(plan, task.id, consumer.contract)) {
      fail(`consumer_contract_binding_missing:${consumer.consumerId}`)
    }
  }

  const expectedOrder = decision.migrationOrder ?? []
  if (!same(binding.migrationOrder, expectedOrder)) fail(`migration_order_invalid:${binding.decisionDigest}`)
  if (binding.outcome === 'compatible_extension' && binding.migrationOrder.length !== 0) {
    fail(`compatible_migration_order_invalid:${binding.decisionDigest}`)
  }
  if (binding.outcome === 'migration_required') {
    let predecessorTaskId = implementation.id
    for (const consumerId of binding.migrationOrder) {
      const consumer = binding.consumers.find(item => item.consumerId === consumerId)
      if (consumer?.impact !== 'update_required' || consumer.taskId === null) {
        fail(`migration_consumer_invalid:${consumerId}`)
      }
      if (!taskDependsOn(tasks, consumer.taskId, predecessorTaskId)) {
        fail(`migration_predecessor_missing:${consumerId}`)
      }
      predecessorTaskId = consumer.taskId
    }
  }
}

export function assertPublicOwnerPlanAuthority({ state, plan, requiredDecisionDigests = [] }) {
  const bindings = plan.publicOwnerChanges === undefined
    ? []
    : normalizePublicOwnerPlanBindings(plan.publicOwnerChanges)
  const required = new Set(requiredDecisionDigests)
  const activeBindings = new Map((state.plan?.publicOwnerChanges ?? [])
    .map(item => [item?.decisionDigest, item]))
  const candidateDigests = new Set(bindings.map(item => item.decisionDigest))
  for (const decisionDigest of activeBindings.keys()) {
    if (!candidateDigests.has(decisionDigest)) fail(`historical_binding_missing:${decisionDigest}`)
  }
  for (const binding of bindings) {
    const active = activeBindings.get(binding.decisionDigest)
    if (!required.has(binding.decisionDigest) && active !== undefined && same(binding, active)) continue
    const record = authoritativeSession(state, binding)
    assertBindingPlan(plan, binding, record)
    required.delete(binding.decisionDigest)
  }
  if (required.size > 0) fail(`required_decision_missing:${[...required].join(',')}`)
  return bindings
}

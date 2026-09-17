import { createHash } from 'node:crypto'
import { normalizePlanV2 } from './model.mjs'
import { createPublicOwnerChangeLog, normalizePublicOwnerContext, normalizePublicOwnerChangeRequest,
  registerPublicOwnerChangeRequest, registerPublicOwnerChangeDecision } from './public-owner-change.mjs'
import { assertPublicOwnerPlanAuthority, publicOwnerDecisionNeedsPlan } from './public-owner-plan.mjs'
import { reviewObligations, reviewDecisionClassification, verifiedClosure } from './convergence.mjs'
import { attemptDeadlineExpired, boundedDiagnosticTexts, diagnosticArgv, diagnosticText,
  verificationFailureOutput, verificationRecoveryRoute } from './workflow-diagnostics.mjs'
import { isManagedRangeStopped } from './execution-evidence.mjs'
import { ownerResourceObservation } from './owner-feedback.mjs'

export const KERNEL_CONTRACT = 'DSH_OWNER_WORKFLOW_KERNEL_V2'
export const ACTION_KINDS = Object.freeze([
'prepare_workflow', 'plan', 'review_plan', 'consult_owner', 'execute_owner', 'seal_candidate',
  'verify_candidate', 'integrate_candidate', 'verify_workflow', 'deliver_workflow', 'summarize_memory',
  'notify_main', 'request_decision', 'change_registry', 'prepare_revision', 'stop_execution',
])
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled'])
const WORKFLOW_TERMINAL = new Set(['completed', 'failed', 'cancelled'])
const OBSERVE_INTERVAL = 5_000
const MAX_OBSERVE_INTERVAL = 30_000
const ROOT_SESSION_OFFLINE_INTERVAL = 300_000
const DEFAULT_POLICY = Object.freeze({ parallel: 3, totalRecovery: 12, issueRecovery: 8, deadlineMs: 1_800_000, terminationWindowMs: 30_000 })

function recoveryLimit(workflow) { return workflow.recoveryWindow?.limit ?? workflow.policy.totalRecovery }
function issueRecoveryLimit(workflow, issue) { return workflow.recoveryWindow?.issueLimits?.[issue.id] ?? workflow.policy.issueRecovery }
function assertRecoveryAuthoritySafe(state, workflow) {
  // Granting a bounded recovery window changes no task, plan, or execution. Healthy
  // unrelated actions may keep running while the root asks for that permission.
  // A stop or quarantined execution still needs settlement (or an isolated
  // retirement proof) before the window can be granted.
  if (Object.values(state.actions).some(action => {
    if (action.workflowId !== workflow.id || ['notify_main', 'request_decision'].includes(action.kind)) return false
    const attempt = workflow.attempts[action.attemptId]
    if (TERMINAL.has(attempt?.phase) && attempt.sourceAuthorityRetirement) return false
    return action.quarantined || attempt?.quarantined || !TERMINAL.has(action.status)
      && (action.stopRequested || attempt?.phase === 'stopping' || action.kind === 'stop_execution')
  })) throw new Error('Execution must settle before authorizing recovery')
}
function chargeRecovery(workflow, issues, label = 'Recovery') {
  if (workflow.recoveryUsed >= recoveryLimit(workflow) || issues.some(issue => issue.used >= issueRecoveryLimit(workflow, issue))) {
    throw new Error(`${label} budget exhausted`)
  }
  workflow.recoveryUsed++
  for (const issue of issues) issue.used++
}

function required(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a nonempty string`)
  return value
}
function integer(value, field, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) throw new Error(`${field} must be an integer >= ${min}`)
  return value
}
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(item => canonical(item ?? null)).join(',')}]`
  return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}
export function kernelDigest(value) { return createHash('sha256').update(canonical(value)).digest('hex') }
export function retirementStateBinding(state, workflowId, attemptId) {
  const workflow = state.workflows[workflowId]
  // OS action locks fence effects, not the scheduler's observation claims.
  // Bind source/execution facts; observer leases and wake times are not facts
  // about which process can write the project or which candidate was sealed.
  return kernelDigest({ workflowId, root: workflow.root, planVersion: workflow.planVersion,
    cancelRequested: workflow.cancelRequested, pendingActivation: workflow.pendingActivation, pendingRegistry: workflow.pendingRegistry,
    integrationHead: workflow.integrationHead, task: workflow.tasks[workflow.attempts[attemptId].taskId],
    attempt: workflow.attempts[attemptId], actions: Object.values(state.actions).filter(action => action.attemptId === attemptId)
      .map(action => { const { observation, observationCount, nextWakeAt, ...facts } = action; return facts }) })
}
function heldAttemptLocks(workflow, attempt) {
  return attempt.sourceAuthorityRetirement
    ? attempt.locks.filter(lock => !lock.startsWith(`project:${workflow.root}:`)) : attempt.locks
}
export function retiredAttemptActionFenced(state, action) {
  return action.kind !== 'stop_execution' && Boolean(state.workflows[action.workflowId]?.attempts[action.attemptId]?.sourceAuthorityRetirement)
}
export function actionReentryFenced(state, action) {
  const current = state.actions[action.id] ?? action
  return retiredAttemptActionFenced(state, current) || current.kind !== 'stop_execution' && current.stopRequested === true
}
function copy(value) { return JSON.parse(JSON.stringify(value)) }
const NOTICE_MAX_DEPTH = 5
const NOTICE_MAX_ITEMS = 20
const NOTICE_MAX_KEYS = 30
const NOTICE_MAX_TEXT = 2_000
function boundedNoticeValue(value, depth = 0) {
  if (typeof value === 'string') return value.length <= NOTICE_MAX_TEXT ? value : `${value.slice(0, NOTICE_MAX_TEXT)}…`
  if (value === null || typeof value !== 'object') return value
  if (depth >= NOTICE_MAX_DEPTH) return '[bounded]'
  if (Array.isArray(value)) return value.slice(0, NOTICE_MAX_ITEMS).map(item => boundedNoticeValue(item, depth + 1))
  return Object.fromEntries(Object.entries(value).slice(0, NOTICE_MAX_KEYS)
    .map(([key, item]) => [key, boundedNoticeValue(item, depth + 1)]))
}
function safeDiagnosticValue(value, depth = 0) {
  if (typeof value === 'string') return diagnosticText(value, { paths: true })
  if (value === null || value === undefined || typeof value !== 'object') return value ?? null
  if (depth >= NOTICE_MAX_DEPTH) return '[bounded]'
  if (Array.isArray(value)) return value.slice(0, NOTICE_MAX_ITEMS).map(item => safeDiagnosticValue(item, depth + 1))
  return Object.fromEntries(Object.entries(value).slice(0, NOTICE_MAX_KEYS)
    .map(([key, item]) => [key, safeDiagnosticValue(item, depth + 1)]))
}
function recoveryCloseWhenSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.verifications)) return safeDiagnosticValue(value)
  return { ...safeDiagnosticValue({ ...value, verifications: undefined }),
    verifications: value.verifications.slice(0, NOTICE_MAX_ITEMS).map(binding => ({
      id: diagnosticText(binding?.id, { maximum: 200 }),
      run: diagnosticArgv(binding?.run),
      cwd: diagnosticText(binding?.cwd ?? '.', { maximum: 512, paths: true }),
    })) }
}
function safeInteger(value) { return Number.isSafeInteger(value) ? value : null }
function verificationFailureSummary(action, kind = 'candidate_verification', attempt = null, now = 0) {
  if (!action?.result || !Array.isArray(action.result.results)) return null
  const bindings = new Map((action.input?.verifications ?? action.input?.plan?.verifications ?? []).map(item => [item.id, item]))
  const technical = isSettledTechnicalVerification(action.result)
  const recovery = verificationRecoveryRoute({ kind, technical, attempt, now })
  const review = action.result.review
  const resultCommit = action.result.commitSha
  const reviewCommitBound = typeof resultCommit === 'string' && /^[a-f0-9]{40,64}$/u.test(resultCommit)
    && review?.commitSha === resultCommit
    && (kind !== 'candidate_verification' || action.input?.candidate?.commitSha === resultCommit)
  const reviewSummary = review?.passed === false && reviewCommitBound
    && Array.isArray(review.reasons) ? boundedDiagnosticTexts(review.reasons) : null
  return {
    contract: 'DSH_VERIFICATION_FAILURE_SUMMARY_V1',
    kind,
    actionId: action.id,
    classification: technical ? 'technical_execution_failure' : 'candidate_failure',
    retryTool: recovery.retryTool,
    ...(kind === 'candidate_verification' ? {
      deadlineAt: recovery.deadlineAt,
      deadlineExpired: recovery.deadlineExpired,
      resumeCondition: recovery.resumeCondition,
    } : {}),
    executionSettled: action.result.executionSettled === true,
    results: action.result.results.slice(0, NOTICE_MAX_ITEMS).map(result => {
      const binding = bindings.get(result?.verificationId)
      return {
        verificationId: diagnosticText(result?.verificationId, { maximum: 200 }),
        status: diagnosticText(result?.status, { maximum: 100 }) ?? (result?.passed === true ? 'passed' : 'failed'),
        passed: result?.passed === true,
        argv: diagnosticArgv(binding?.run ?? result?.argv),
        cwd: diagnosticText(binding?.cwd ?? result?.cwd ?? '.', { maximum: 512, paths: true }),
        exitCode: safeInteger(result?.exitCode),
        testStatus: diagnosticText(result?.testStatus, { maximum: 100 }),
        timedOut: result?.timedOut === true,
        aborted: result?.aborted === true,
        zeroTests: result?.zeroTests === true,
        testCount: safeInteger(result?.testCount),
        ...verificationFailureOutput(result, NOTICE_MAX_TEXT),
      }
    }),
    ...(reviewSummary?.values.length ? {
      reviewFindings: reviewSummary.values,
      ...(reviewSummary.truncated ? { reviewFindingsTruncated: true } : {}),
    } : {}),
  }
}
function currentFailedVerification(actions, { attemptId = null, kind = 'verify_candidate' } = {}) {
  for (let index = actions.length - 1; index >= 0; index--) {
    const action = actions[index]
    if (action.kind === kind && action.attemptId === attemptId && action.status === 'failed' && !action.resolution && action.result?.passed === false) return action
  }
  return null
}
function terminalNoticeContext(after) {
  const attention = boundedNoticeValue(after.attention)
  const recovery = boundedNoticeValue(after.recovery)
  const primaryFailure = after.status === 'failed' ? after.attention.find(item =>
    ['task_failed', 'action_failed', 'delivery_failed', 'planning_failed', 'termination_unconfirmed'].includes(item.reason))
    ?? after.attention[0] : null
  const failure = primaryFailure ? boundedNoticeValue({
    attentionId: primaryFailure.id,
    reason: primaryFailure.reason,
    detail: primaryFailure.detail ?? null,
    ...(primaryFailure.diagnostic ? { diagnostic: primaryFailure.diagnostic } : {}),
  }) : after.status === 'failed' ? { attentionId: null, reason: 'workflow_failed', detail: null } : null
  const outcome = after.registryResult ? { kind: 'registry', result: boundedNoticeValue(after.registryResult) }
      : after.delivery ? { kind: 'delivery', result: boundedNoticeValue(after.delivery) }
        : after.status === 'cancelled' ? { kind: 'cancellation', result: { settled: true } } : null
  return { attention, recovery, failure, outcome }
}
function has(record, id) { return Object.hasOwn(record, id) }
function safeId(id) {
  required(id, 'id')
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,200}$/.test(id) || ['constructor', 'prototype', '__proto__'].includes(id)) throw new Error('Invalid kernel identity')
  return id
}
function wf(state, id) {
  if (!has(state.workflows, id)) throw new Error(`Unknown workflow: ${id}`)
  return state.workflows[id]
}
function actionOf(state, id) {
  if (!has(state.actions, id)) throw new Error(`Unknown action: ${id}`)
  return state.actions[id]
}
export function reservesProject(state, workflow) {
  return workflow.kind === 'registry' && !workflow.registryResult && !workflow.cancelRequested || (!workflow.kind || workflow.kind === 'workflow') && !workflow.delivery && !workflow.cancelRequested
    || !view(state, workflow.id).terminal || Object.values(workflow.attempts).some(attempt => attempt.quarantined && !attempt.sourceAuthorityRetirement)
    || Object.values(state.actions).some(action => action.workflowId === workflow.id && action.quarantined)
}
// Authoring/compilation head, including a successor awaiting review. Execution
// uses activation.sources (or an attempt's frozen dispatchContract), never this
// moving head. Keep the persisted field name to preserve existing histories.
export function planningSources(workflow) { return workflow.planningSources ?? workflow.activation?.sources ?? null }

function planningCandidateFromAction(workflow, action) {
  const sources = planningSources(workflow)
  if (!action || action.workflowId !== workflow.id || action.kind !== 'review_plan'
    || !TERMINAL.has(action.status) || action.quarantined
    || action.inputDigest !== kernelDigest(action.input)
    || action.input.parentVersion !== workflow.planVersion
    || action.input.snapshotDigest !== sources?.snapshotDigest
    || action.input.planDigest !== kernelDigest(action.input.plan)
    || typeof action.input.packagesRef !== 'string' || !action.input.packagesRef
    || typeof action.input.plannerEvidenceRef !== 'string' || !action.input.plannerEvidenceRef) return null
  return {
    actionId: action.id,
    inputDigest: action.inputDigest,
    parentVersion: action.input.parentVersion,
    snapshotDigest: action.input.snapshotDigest,
    planDigest: action.input.planDigest,
    packagesRef: action.input.packagesRef,
    plannerEvidenceRef: action.input.plannerEvidenceRef,
    plan: copy(action.input.plan),
  }
}

/**
 * Resolve the latest reviewed authoring candidate without treating it as an
 * active execution plan. New states carry a small action reference; legacy
 * states recover only a settled candidate at the exact current source head.
 */
export function planningAuthoringCandidate(state, workflow) {
  const reference = workflow?.planningCandidate
  if (reference) {
    const action = state.actions?.[reference.actionId]
    const candidate = planningCandidateFromAction(workflow, action)
    if (!candidate || reference.inputDigest !== candidate.inputDigest
      || reference.parentVersion !== candidate.parentVersion
      || reference.snapshotDigest !== candidate.snapshotDigest
      || reference.planDigest !== candidate.planDigest) {
      throw new Error('Persisted planning candidate reference does not bind its frozen review action')
    }
    return candidate
  }
  const candidates = Object.values(state.actions ?? {})
    .map(action => planningCandidateFromAction(workflow, action))
    .filter(Boolean)
    .sort((left, right) => {
      const leftAction = state.actions[left.actionId], rightAction = state.actions[right.actionId]
      return (rightAction.completedAt ?? rightAction.createdAt ?? 0) - (leftAction.completedAt ?? leftAction.createdAt ?? 0)
        || right.actionId.localeCompare(left.actionId)
    })
  return candidates[0] ?? null
}

export function planningPackageSourceBinding(workflow) {
  // Execution packages belong to the active plan. planningSources may already
  // point at a pending successor checkpoint while that plan is still under
  // review or Registry governance.
  const sources = workflow.activation?.sources ?? null
  if (sources?.packagesRef === undefined) return null
  if (typeof sources.packagesRef !== 'string' || typeof sources.checkpointId !== 'string' || typeof sources.snapshotDigest !== 'string'
    || typeof workflow.activation?.planDigest !== 'string') throw new Error('Execution task package binding is incomplete')
  return { packagesRef: sources.packagesRef, checkpointId: sources.checkpointId, snapshotDigest: sources.snapshotDigest,
    planVersion: workflow.planVersion, planDigest: workflow.activation.planDigest }
}
export function taskPackageBinding(workflow, task) {
  const source = planningPackageSourceBinding(workflow)
  return source && { ...source, taskId: task.id, ownerId: task.ownerId }
}
export function verificationTaskPackageBinding(state, workflow, action, task) {
  if (action.input.taskPackage !== undefined) return action.input.taskPackage
  const attempt = workflow.attempts[action.attemptId]
  if (attempt) return attemptDispatchContract(state, workflow, attempt).taskPackage
  return taskPackageBinding(workflow, task)
}
function retryInputCurrent(state, workflow, action) {
  switch (action.kind) {
    case 'change_registry': return workflow.registryRequestDigest === kernelDigest(action.input)
      && (workflow.kind === 'registry' && !workflow.registryResult || workflow.pendingRegistry?.actionId === (action.retryRootId ?? action.id))
    case 'prepare_workflow': return !workflow.plan && !workflow.pendingPlanning && !workflow.pendingActivation
      && action.input.baseCommit === workflow.baseCommit
    case 'prepare_revision': return !!workflow.pendingActivation
      && kernelDigest(workflow.pendingActivation) === kernelDigest(action.input.proposal)
      && action.input.previousBase === workflow.baseCommit
    case 'plan': case 'review_plan': return !workflow.pendingActivation && action.input.parentVersion === workflow.planVersion
      && action.input.snapshotDigest === planningSources(workflow)?.snapshotDigest
    case 'verify_candidate': {
      const attempt = workflow.attempts[action.attemptId]
      if (!attempt) return false
      const record = workflow.tasks[attempt.taskId]
      const dispatch = attemptDispatchContract(state, workflow, attempt)
      // A legacy verification action may predate the taskPackage field.  Its
      // missing field inherits this attempt's frozen dispatch binding, never a
      // package compiled from the current global activation.
      const verificationBinding = action.input.taskPackage === undefined ? dispatch.taskPackage : action.input.taskPackage
      return frozenAttemptMatches(record, attempt)
        && action.input.planVersion === dispatch.planVersion
        && action.input.task?.id === dispatch.task.id && kernelDigest(action.input.task) === kernelDigest(dispatch.task)
        && kernelDigest(action.input.verifications) === kernelDigest(dispatch.verifications)
        && kernelDigest(verificationBinding) === kernelDigest(dispatch.taskPackage)
        && kernelDigest(action.input.candidate) === kernelDigest(attempt.candidate)
        && action.input.candidate?.authority === attempt.authority
    }
    case 'verify_workflow': case 'deliver_workflow': return !workflow.pendingPlanning && !workflow.pendingActivation
      && action.input.planVersion === workflow.planVersion && action.input.commitSha === workflow.integrationHead
    default: return false
  }
}
function isSettledTechnicalVerification(result) {
  const results = result?.results
  if (result?.passed !== false || result.executionSettled !== true || !Array.isArray(results)) return false
  const errors = results.filter(item => item?.status === 'execution_error')
  return errors.length > 0
    && results.every(item => item?.passed === true || item?.status === 'execution_error')
    && errors.every(item => !item.commandTermination || item.commandTermination.managedRangeStopped === true)
}
function planningRecoveryIssues(workflow, issue) {
  return [...new Set([issue, ...Object.values(workflow.issues).filter(item => ['execution', 'public_owner', 'action'].includes(item.origin) && item.status === 'open')])]
}
function attemptOf(state, action) {
  const workflow = wf(state, action.workflowId)
  return action.attemptId ? workflow.attempts[action.attemptId] : undefined
}
function inputTasks(plan, task) {
  const ids = new Set(task.dependsOn)
  const ancestors = new Set([task.id])
  for (let parentId = task.parentTaskId; parentId;) {
    if (ancestors.has(parentId)) throw new Error('Composite ancestry cycle')
    ancestors.add(parentId)
    const parent = plan.tasks.find(item => item.id === parentId)
    if (!parent) throw new Error(`Missing composite parent: ${parentId}`)
    for (const id of parent.dependsOn) ids.add(id)
    parentId = parent.parentTaskId
  }
  return [...ids]
}

/** Freeze the downstream compatibility context shown with one dispatched task. */
export function taskDirectConsumers(plan, taskIds) {
  const selected = new Set(Array.isArray(taskIds) ? taskIds : [taskIds])
  const verificationById = new Map(plan.verifications.map(item => [item.id, item]))
  return plan.tasks.filter(task => !selected.has(task.id) && task.dependsOn.some(id => selected.has(id))).map(task => ({
    taskId: task.id,
    title: task.title,
    ownerId: task.ownerId,
    write: copy(task.write),
    done: copy(task.done),
    verification: task.verify.map(id => {
      const definition = verificationById.get(id)
      if (!definition) throw new Error(`Owner task references missing verification: ${id}`)
      return copy(definition)
    }),
  }))
}

function taskExecutionSourceBinding(plan, task) {
  const binding = plan.planningBindings?.tasks.find(item => item.taskId === task.id)
  if (!binding) return null
  return {
    taskId: binding.taskId,
    // Ticket revision identifies the complete source document.  The selected
    // fragment ids identify the part assigned to this task; full source
    // provenance remains in planningBindings and the immutable package.
    tickets: binding.tickets.map(ticket => ({ id: ticket.id, fragments: [...ticket.fragments].sort() }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    contracts: [...binding.contracts].sort((left, right) => left.id.localeCompare(right.id)),
  }
}

/**
 * Identity of one reviewed executable task contract.  This deliberately does
 * not claim byte-level equality of two planning documents.  Current source
 * coverage is established by native package compilation and independent plan
 * review; this digest decides only whether an already-bound execution remains
 * valid across that reviewed source revision.
 */
export function taskExecutionDigest(plan, task, visiting = new Set()) {
  if (visiting.has(task.id)) throw new Error('Task input cycle')
  const path = new Set([...visiting, task.id])
  const inputIds = [...new Set([...inputTasks(plan, task), ...(task.children ?? [])])]
  const verificationById = new Map(plan.verifications.map(item => [item.id, item]))
  return kernelDigest({ task,
    // normalizePlanV2 proves task.write is wholly contained in this Owner's
    // scope and disjoint from its excludes.  Runtime writes enforce both
    // boundaries again, so unrelated Owner metadata/scope expansion cannot
    // enlarge this task's effective permission.
    sourceBinding: taskExecutionSourceBinding(plan, task),
    publicBindings: (plan.publicOwnerChanges ?? []).filter(binding => binding.implementationTaskId === task.id || binding.consumers.some(consumer => consumer.taskId === task.id)),
    // Global definition order has no execution meaning. task.verify is already
    // part of the task identity, so resolve definitions in that declared order.
    verifications: task.verify.map(id => {
      const definition = verificationById.get(id)
      if (!definition) throw new Error(`Owner task references missing verification: ${id}`)
      return definition
    }),
    inputs: inputIds.map(id => {
      const upstream = plan.tasks.find(item => item.id === id)
      if (!upstream) throw new Error(`Missing input task: ${id}`)
      return [id, taskExecutionDigest(plan, upstream, path)]
    }) })
}

function taskExecutionEquivalent(beforePlan, afterPlan, taskId) {
  const before = beforePlan?.tasks.find(item => item.id === taskId)
  const after = afterPlan?.tasks.find(item => item.id === taskId)
  return Boolean(before && after
    && taskExecutionDigest(beforePlan, before) === taskExecutionDigest(afterPlan, after))
}

function frozenAttemptMatches(record, attempt) {
  return Boolean(record && attempt && record.attemptId === attempt.id && record.definitionDigest === attempt.definitionDigest)
}

function dispatchContractForPlan(state, workflow, attempt, plan) {
  const actions = Object.values(state.actions).filter(item => item.workflowId === workflow.id
    && item.attemptId === attempt.id && item.kind === 'execute_owner')
  if (actions.length !== 1) throw new Error(`Cannot safely recover attempt dispatch contract: ${attempt.id}`)
  const action = actions[0]
  const task = plan?.tasks.find(item => item.id === attempt.taskId)
  const owner = plan?.owners.find(item => item.id === attempt.ownerId)
  const verifications = task ? plan.verifications.filter(item => task.verify.includes(item.id)) : null
  const directConsumers = task ? taskDirectConsumers(plan, task.id) : null
  if (!task || !owner || !Array.isArray(verifications) || action.input.definitionDigest !== attempt.definitionDigest
    || action.inputDigest !== kernelDigest(action.input)
    || kernelDigest(action.input.task) !== kernelDigest(task) || kernelDigest(action.input.owner) !== kernelDigest(owner)
    || action.input.directConsumers !== undefined && kernelDigest(action.input.directConsumers) !== kernelDigest(directConsumers)
    || action.input.authority !== attempt.authority
    || action.input.taskPackage && action.input.taskPackage.planVersion !== workflow.planVersion) {
    throw new Error(`Cannot safely recover attempt dispatch contract: ${attempt.id}`)
  }
  return { planVersion: workflow.planVersion, task: copy(task), owner: copy(owner), verifications: copy(verifications),
    directConsumers: copy(directConsumers), taskPackage: copy(action.input.taskPackage ?? null) }
}

/** Return the immutable contract dispatched to an attempt, recovering it only from exact persisted facts. */
export function attemptDispatchContract(state, workflow, attempt) {
  if (!attempt?.dispatchContract) return dispatchContractForPlan(state, workflow, attempt, workflow.plan)
  const contract = attempt.dispatchContract
  if (!Number.isSafeInteger(contract.planVersion) || !Object.hasOwn(contract, 'taskPackage')
    || !contract.task || !contract.owner || !Array.isArray(contract.verifications) || !Array.isArray(contract.directConsumers)
    || contract.task.id !== attempt.taskId || contract.owner.id !== attempt.ownerId
    || contract.verifications.length !== contract.task.verify.length
    || new Set(contract.verifications.map(item => item.id)).size !== contract.verifications.length
    || contract.verifications.some(item => !contract.task.verify.includes(item.id))
    || new Set(contract.directConsumers.map(item => item.taskId)).size !== contract.directConsumers.length
    || contract.directConsumers.some(item => !item?.taskId || item.taskId === contract.task.id
      || !Array.isArray(item.write) || !Array.isArray(item.done) || !Array.isArray(item.verification))
    || contract.taskPackage && contract.taskPackage.planVersion !== contract.planVersion) {
    throw new Error(`Attempt dispatch contract is invalid: ${attempt.id}`)
  }
  const actions = Object.values(state.actions).filter(item => item.workflowId === workflow.id
    && item.attemptId === attempt.id && item.kind === 'execute_owner')
  const action = actions[0]
  if (actions.length !== 1 || action.inputDigest !== kernelDigest(action.input)
    || action.input.definitionDigest !== attempt.definitionDigest || action.input.authority !== attempt.authority
    || kernelDigest(action.input.task) !== kernelDigest(contract.task) || kernelDigest(action.input.owner) !== kernelDigest(contract.owner)
    || action.input.directConsumers !== undefined && kernelDigest(action.input.directConsumers) !== kernelDigest(contract.directConsumers)
    || kernelDigest(action.input.taskPackage ?? null) !== kernelDigest(contract.taskPackage ?? null)) {
    throw new Error(`Attempt dispatch contract changed: ${attempt.id}`)
  }
  return contract
}

export function planningRevisionBoundary(taskIds, verificationIds) {
  const ids = (value, field) => {
    if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !id.trim())
      || new Set(value).size !== value.length) throw new Error(`${field} must be an explicit array of unique ids`)
    return [...value].sort()
  }
  return { taskIds: ids(taskIds, 'affected_task_ids'), verificationIds: ids(verificationIds, 'affected_verification_ids') }
}

function assertPlanningRevisionBoundary(workflow, action, plan) {
  // Old persisted actions and initial compilation retain their original contract.
  // Every new root replan supplies this boundary, including its review repairs.
  const boundary = action.input.revisionBoundary
  if (!boundary) return
  if (action.input.parentVersion !== workflow.planVersion) throw new Error('Planning revision parent changed')
  const previous = action.input.previousPlan ?? workflow.plan
  if (!previous) return
  const outside = (before, after, allowed, digest) => [...new Set([...before, ...after].map(item => item.id))]
    .filter(id => {
      const old = before.find(item => item.id === id), next = after.find(item => item.id === id)
      return (!old || !next || digest(previous, old) !== digest(plan, next)) && !allowed.includes(id)
    }).sort()
  const tasks = outside(previous.tasks, plan.tasks, boundary.taskIds, taskExecutionDigest)
  const newVerificationIsTaskBound = id => {
    const consumers = plan.tasks.filter(task => task.verify.includes(id))
    return consumers.length > 0 && consumers.every(task => {
      const before = previous.tasks.find(item => item.id === task.id)
      return boundary.taskIds.includes(task.id) && (!before || kernelDigest(before) !== kernelDigest(task))
    })
  }
  const verifications = [...new Set([...previous.verifications, ...plan.verifications].map(item => item.id))]
    .filter(id => {
      const old = previous.verifications.find(item => item.id === id), next = plan.verifications.find(item => item.id === id)
      if (old && next && kernelDigest(old) === kernelDigest(next)) return false
      return !boundary.verificationIds.includes(id) && !(next && !old && newVerificationIsTaskBound(id))
    }).sort()
  if (tasks.length || verifications.length) throw new Error(`Planning revision exceeds declared boundary: tasks=[${tasks.join(', ')}]; verifications=[${verifications.join(', ')}]. Preserve unrelated definitions and bindings, or return the newly discovered obligation to the root for an explicit boundary revision.`)
}
function touch(workflow, now) { workflow.revision++; workflow.updatedAt = now }
function ticketIds(plan, taskId) {
  return (plan.planningBindings?.tasks.find(item => item.taskId === taskId)?.tickets ?? []).map(item => item.id).sort()
}
function taskIssues(workflow, plan, task) {
  const tickets = ticketIds(plan, task.id)
  const previous = workflow.tasks[task.id]
  const inherited = new Set([...(previous?.inheritedIssueIds ?? []), workflow.attempts[previous?.attemptId]?.issueId].filter(Boolean))
  for (const issue of Object.values(workflow.issues)) {
    if (issue.origin === 'execution' && issue.status === 'open' && (issue.taskId === task.id
      || issue.ticketIds.some(id => tickets.includes(id)))) inherited.add(issue.id)
  }
  return [...inherited]
}
function executionIssue(workflow, attempt, reason) {
  const task = workflow.plan.tasks.find(task => task.id === attempt.taskId)
  const tickets = ticketIds(workflow.plan, task.id)
  const verifications = workflow.plan.verifications.filter(item => task.verify.includes(item.id))
  const sourceId = kernelDigest({ tickets, verifications, fallbackTaskId: tickets.length ? null : attempt.taskId })
  const inherited = (workflow.tasks[task.id].inheritedIssueIds ?? []).find(id => workflow.issues[id]?.status === 'open')
  const id = inherited ?? `issue-${kernelDigest([workflow.id, sourceId]).slice(0, 40)}`
  const issue = workflow.issues[id] ??= { id, sourceId, origin: 'execution', taskId: task.id, ticketIds: tickets,
    closeWhen: { passingCurrentTaskVerification: task.verify, verifications: copy(verifications) },
    status: 'open', used: 0, blocksActivation: false, attempts: [] }
  issue.status = 'open'
  if (!issue.attempts.includes(attempt.id)) issue.attempts.push(attempt.id)
  issue.lastReason = reason; attempt.issueId = id
  return issue
}
function outcome(task, workflow) {
  if (task.retired) return 'cancelled'
  return task.attemptId ? workflow.attempts[task.attemptId].phase : 'pending'
}
function dependenciesReady(workflow, taskId, visiting = new Set()) {
  if (visiting.has(taskId)) throw new Error('Composite dependency cycle')
  visiting.add(taskId)
  const node = workflow.plan.tasks.find(task => task.id === taskId)
  if (!node) throw new Error(`Missing task definition: ${taskId}`)
  const complete = id => {
    const child = workflow.plan.tasks.find(task => task.id === id)
    if (child?.children) return child.exit.every(exit => complete(exit))
    return outcome(workflow.tasks[id], workflow) === 'succeeded'
  }
  return inputTasks(workflow.plan, node).every(complete)
}
function publicRequestBlock(workflow, task) {
  const log = workflow.publicOwnerChangeLog
  if (!log) return null
  const latest = new Map()
  for (const entry of log.requests) if (!latest.has(entry.request.requestId) || latest.get(entry.request.requestId).request.requestVersion < entry.request.requestVersion) latest.set(entry.request.requestId, entry)
  for (const entry of latest.values()) {
    const affected = new Set([entry.request.requesterOwnerId, entry.request.targetOwnerId, ...entry.context.consumers.map(item => item.ownerId)])
    if (!affected.has(task.ownerId)) continue
    const record = log.decisions.find(item => item.decision.requestDigest === entry.requestDigest)
    if (record?.decision.outcome === 'capability_sufficient') continue
    if (record && workflow.plan?.publicOwnerChanges?.some(binding => binding.decisionDigest === record.decisionDigest)) continue
    return { reason: 'public_owner_decision', responsibleParty: record ? 'root_session' : entry.request.targetOwnerId, requestId: entry.request.requestId,
      requestVersion: entry.request.requestVersion, outcome: record?.decision.outcome ?? 'pending' }
  }
  return null
}
function lockKeys(workflow, ownerId, resources = []) {
  const resourceKey = resource => {
    const network = /^(?:host:)?(?:(?:port:)(\d+)|(tcp|udp):(?:(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\[::\]):)?(\d+))$/i.exec(resource)
    if (network) {
      const port = Number(network[1] ?? network[4])
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid host port resource')
      return `host:port:${port}`
    }
    const remote = /^(?:host:)?(tcp|udp):([^:]+):(\d+)$/i.exec(resource)
    if (remote) {
      const port = Number(remote[3])
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid host port resource')
      return `host:${remote[1].toLowerCase()}:${remote[2].toLowerCase()}:${port}`
    }
    return resource.startsWith('host:') ? resource : `project:${workflow.root}:resource:${resource}`
  }
  return [...new Set([
    ...(ownerId ? [`project:${workflow.root}:owner:${ownerId}`] : []),
    ...resources.map(resourceKey),
  ])].sort()
}
function occupied(state) {
  return new Set(Object.values(state.workflows).flatMap(workflow => Object.values(workflow.attempts)
    .filter(attempt => !TERMINAL.has(attempt.phase) || attempt.quarantined)
    .flatMap(attempt => heldAttemptLocks(workflow, attempt))).concat(Object.values(state.actions)
    .filter(action => action.admitted && (!TERMINAL.has(action.status) || action.quarantined) && !action.attemptId).flatMap(action => action.locks)))
}
function activeSlots(state, workflowId) {
  const attempts = Object.values(state.workflows).filter(workflow => !workflowId || workflow.id === workflowId).flatMap(workflow => Object.values(workflow.attempts))
  return attempts.filter(attempt => !TERMINAL.has(attempt.phase) || attempt.quarantined).length
    + Object.values(state.actions).filter(action => (!workflowId || action.workflowId === workflowId) && !action.attemptId && action.admitted && action.occupiesSlot && (!TERMINAL.has(action.status) || action.quarantined)).length
}
function canAdmitAction(state, action) {
  if (action.attemptId || action.admitted) return true
  const workflow = wf(state, action.workflowId)
  // Retirement releases only project write authority. Private execution and its
  // capacity remain quarantined; they cannot fence a project-only Registry change.
  if (action.kind === 'change_registry' && Object.values(workflow.attempts).some(attempt => !TERMINAL.has(attempt.phase)
    || attempt.quarantined && !attempt.sourceAuthorityRetirement)) return false
  if (action.locks.some(lock => occupied(state).has(lock))) return false
  return !action.occupiesSlot || activeSlots(state) < state.parallel && activeSlots(state, workflow.id) < workflow.policy.parallel
}
function admitAction(state, action, now) {
  if (action.attemptId || action.admitted) return true
  if (!canAdmitAction(state, action)) return false
  action.admitted = true; action.admittedAt = now; action.deadlineAt = now + action.deadlineMs
  return true
}
function enqueue(state, workflow, kind, input, key, now, options = {}) {
  if (!ACTION_KINDS.includes(kind)) throw new Error(`Unsupported action kind: ${kind}`)
  const id = `act-${kernelDigest([workflow.id, kind, key]).slice(0, 40)}`
  const inputDigest = kernelDigest(input)
  if (has(state.actions, id)) {
    if (state.actions[id].inputDigest !== inputDigest) throw new Error('Action identity reused with different input')
    return state.actions[id]
  }
  const action = { id, workflowId: workflow.id, kind, input: copy(input), inputDigest,
    attemptId: options.attemptId ?? null, status: 'pending', createdAt: now, nextWakeAt: now,
    execution: null, observation: null, evidence: null, result: null,
    admitted: false, locks: options.locks ?? [], occupiesSlot: options.occupiesSlot ?? false,
    deadlineMs: options.deadlineMs ?? workflow.policy.deadlineMs, deadlineAt: now + (options.deadlineMs ?? workflow.policy.deadlineMs), observationCount: 0 }
  state.actions[id] = action
  return action
}
function notify(state, workflow, reason, detail, key, now) {
  return enqueue(state, workflow, 'notify_main', { rootSessionId: workflow.rootSessionId, reason, detail }, key, now)
}
function startAttempt(state, workflow, task, now) {
  const record = workflow.tasks[task.id]
  const generation = record.generation + 1
  const id = `try-${kernelDigest([workflow.id, task.id, generation]).slice(0, 40)}`
  const integrationFor = dependency => {
    const definition = workflow.plan.tasks.find(item => item.id === dependency)
    if (definition.children) return { taskId: dependency, outputs: Object.fromEntries(definition.exit.map(id => [id, integrationFor(id)])) }
    const previous = workflow.tasks[dependency]
    return previous.attemptId ? workflow.attempts[previous.attemptId].integration : null
  }
  const inputs = Object.fromEntries(inputTasks(workflow.plan, task).map(id => [id, integrationFor(id)]))
  const taskPackage = taskPackageBinding(workflow, task)
  const owner = workflow.plan.owners.find(owner => owner.id === task.ownerId)
  const verifications = workflow.plan.verifications.filter(item => task.verify.includes(item.id))
  const directConsumers = taskDirectConsumers(workflow.plan, task.id)
  const attempt = { id, taskId: task.id, ownerId: task.ownerId, definitionDigest: record.definitionDigest,
    generation, authority: kernelDigest([workflow.id, id, record.definitionDigest]), inputs,
    phase: 'dispatching', baseCommit: workflow.integrationHead, createdAt: now, updatedAt: now, deadlineAt: now + (task.onTimeout?.afterMs ?? workflow.policy.deadlineMs),
    locks: lockKeys(workflow, task.ownerId, task.resources), quarantined: false,
    candidate: null, verification: null, integration: null, submission: null, failure: null,
    dispatchContract: { planVersion: workflow.planVersion, task: copy(task), owner: copy(owner), verifications: copy(verifications),
      directConsumers: copy(directConsumers), taskPackage: copy(taskPackage) } }
  record.generation = generation
  record.attemptId = id
  workflow.attempts[id] = attempt
  enqueue(state, workflow, 'execute_owner', { task, definitionDigest: record.definitionDigest, inputs,
    owner, directConsumers, authority: attempt.authority,
    root: workflow.root, baseCommit: workflow.integrationHead, rootSessionId: workflow.rootSessionId,
    repair: record.repair ?? null, taskPackage }, id, now, { attemptId: id })
  touch(workflow, now)
  return attempt
}
function checkAttempt(state, action) {
  const workflow = wf(state, action.workflowId)
  const attempt = attemptOf(state, action)
  if (!attempt) return
  const task = workflow.tasks[attempt.taskId]
  // An actual late stop closes only the old range, never the replacement task.
  if (action.kind === 'stop_execution' && attempt.sourceAuthorityRetirement && attempt.quarantined
    && action.input.authority === attempt.authority && action.input.attemptId === attempt.id
    && action.id === `act-${kernelDigest([workflow.id, 'stop_execution', attempt.id]).slice(0, 40)}`) return
  if (!task || task.retired || task.attemptId !== attempt.id || task.definitionDigest !== attempt.definitionDigest
    || (TERMINAL.has(attempt.phase) && !attempt.quarantined)) throw new Error('Stale attempt authority')
}
function expireDecisions(state, workflow, matches, now) {
  for (const decision of Object.values(workflow.decisions).filter(item => item.status === 'pending' && matches(item.binding))) {
    decision.status = 'superseded'; decision.supersededAt = now
    for (const action of Object.values(state.actions).filter(item => item.workflowId === workflow.id && item.kind === 'request_decision'
      && item.input.decisionId === decision.id && !TERMINAL.has(item.status))) {
      action.status = 'cancelled'; action.nextWakeAt = null
    }
  }
}
function stopAttempt(state, workflow, attempt, reason, now) {
  if (TERMINAL.has(attempt.phase) || attempt.phase === 'stopping') return
  expireDecisions(state, workflow, binding => binding.attemptId === attempt.id, now)
  attempt.phase = 'stopping'
  attempt.failure = reason
  if (!['cancelled', 'plan_replaced', 'registry_changed'].includes(reason)) executionIssue(workflow, attempt, reason)
  attempt.stopDeadlineAt = now + workflow.policy.terminationWindowMs
  attempt.updatedAt = now
  for (const action of Object.values(state.actions).filter(action => action.attemptId === attempt.id && !TERMINAL.has(action.status))) {
    if (action.status === 'pending') { action.status = 'cancelled'; action.nextWakeAt = null }
    else { action.stopRequested = true; action.nextWakeAt = now }
  }
  enqueue(state, workflow, 'stop_execution', { attemptId: attempt.id, authority: attempt.authority, reason },
    attempt.id, now, { attemptId: attempt.id, deadlineMs: workflow.policy.terminationWindowMs })
  touch(workflow, now)
}
function settleStop(state, workflow, attempt, evidence, now) {
  required(evidence?.terminationId, 'terminationId')
  if (evidence.authority !== attempt.authority || evidence.executionSettled !== true || evidence.sourceWritesClosed !== true) throw new Error('Termination lacks action settlement or source write closure')
  attempt.phase = workflow.cancelRequested ? 'cancelled' : 'failed'
  attempt.quarantined = false
  attempt.termination = copy(evidence)
  attempt.updatedAt = now
  for (const action of Object.values(state.actions).filter(action => action.attemptId === attempt.id && !TERMINAL.has(action.status))) {
    action.status = 'cancelled'; action.nextWakeAt = null
  }
  touch(workflow, now)
}

function hasSettledAttemptTermination(attempt) {
  const termination = attempt.termination
  return typeof termination?.terminationId === 'string' && termination.terminationId.length > 0
    && termination.authority === attempt.authority && termination.executionSettled === true
    && termination.sourceWritesClosed === true
}
function stopAction(state, action, reason, now) {
  if (action.stopRequested || (TERMINAL.has(action.status) && !action.quarantined)) return
  const workflow = wf(state, action.workflowId)
  expireDecisions(state, workflow, binding => binding.actionId === action.id, now)
  action.stopRequested = true
  action.status = 'uncertain'; action.failure = reason
  action.stopDeadlineAt = now + workflow.policy.terminationWindowMs
  action.nextWakeAt = now
  enqueue(state, workflow, 'stop_execution', { targetActionId: action.id, reason },
    `action:${action.id}`, now, { deadlineMs: workflow.policy.terminationWindowMs })
  touch(workflow, now)
}
function verificationFailed(state, workflow, action, attempt, result, now) {
  if (result.executionSettled !== true) throw new Error('Failed verification lacks execution shutdown evidence')
  action.result = copy(result); action.status = 'failed'; action.nextWakeAt = null
  action.failure = 'verification_failed'; action.completedAt = now
  if (!attempt) workflow.deliveryFailure = { actionId: action.id, reason: 'verification_failed', results: result.results }
  if (attempt) {
    attempt.phase = 'failed'; attempt.verification = copy(result); attempt.failure = 'verification_failed'
    attempt.updatedAt = now
    executionIssue(workflow, attempt, 'verification_failed')
  }
  const diagnostic = verificationFailureSummary(action, attempt ? 'candidate_verification' : 'final_verification', attempt, now)
  notify(state, workflow, 'verification_failed', { actionId: action.id, attemptId: attempt?.id ?? null,
    issueId: attempt?.issueId ?? null, diagnostic }, `verification:${action.id}`, now)
  refreshExecutionObligations(state, workflow, now)
  touch(workflow, now)
}
function assertPublicPlan(workflow, plan) {
  const latest = new Map()
  for (const entry of workflow.publicOwnerChangeLog?.requests ?? []) {
    if (!latest.has(entry.request.requestId) || latest.get(entry.request.requestId) < entry.request.requestVersion) latest.set(entry.request.requestId, entry.request.requestVersion)
  }
  assertPublicOwnerPlanAuthority({ state: { ...workflow, activePlanRevision: workflow.planVersion,
    planDigest: workflow.activation?.planDigest, publicOwnerDecisionSessions: workflow.publicOwnerDecisionSessions ?? {},
    publicOwnerChangeLog: workflow.publicOwnerChangeLog ?? createPublicOwnerChangeLog() }, plan,
    requiredDecisionDigests: Object.values(workflow.publicOwnerDecisionSessions ?? {}).filter(record => record.planRevision === workflow.planVersion
      && latest.get(record.requestId) === record.requestVersion
      && record.phase === 'submission_observed' && publicOwnerDecisionNeedsPlan(record.decision.outcome)).map(record => record.decisionDigest) })
}
/** Historical proof that an issue came from an Owner execution feedback notice. */
export function ownerFeedbackEvidence(state, workflow, issue) {
  const actions = Object.values(state.actions).filter(action => action.workflowId === workflow.id)
  const notice = actions.find(action => action.kind === 'notify_main' && action.input?.reason === 'owner_feedback'
    && action.input?.detail?.issueId === issue.id)
  if (!notice) return null
  const source = actions.find(action => action.kind === 'execute_owner' && action.attemptId
    && `issue-${kernelDigest([action.attemptId, issue.sourceId]).slice(0, 40)}` === issue.id)
  if (!source) return null
  return { issue, notice, source, report: notice.input.detail.report ?? null,
    taskId: source.input?.task?.id ?? null, ownerId: source.input?.owner?.id ?? null, attemptId: source.attemptId }
}
export function ownerFeedbackReportSummary(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return null
  const result = {}
  for (const key of ['kind', 'sourceId', 'taskId', 'issue', 'detail', 'contractId', 'verificationId', 'summary', 'expected', 'actual', 'closeWhen']) {
    const value = diagnosticText(report[key], { maximum: 512, paths: true })
    if (value !== null) result[key] = value
  }
  if (Number.isSafeInteger(report.observedExitCode)) result.observedExitCode = report.observedExitCode
  return Object.keys(result).length ? result : null
}
/** Separate non-blocking Owner feedback facts from unresolved planning obligations without mutating either. */
export function planningIssueContext(state, workflow) {
  const openObligations = []
  const ownerFeedbackFacts = []
  for (const issue of Object.values(workflow.issues).filter(item => item.status === 'open')) {
    const evidence = ownerFeedbackEvidence(state, workflow, issue)
    if (!evidence) { openObligations.push(copy(issue)); continue }
    ownerFeedbackFacts.push({ id: issue.id, origin: 'owner_feedback', status: 'open', blocksActivation: false,
      source: { taskId: evidence.taskId, ownerId: evidence.ownerId, attemptId: evidence.attemptId },
      report: ownerFeedbackReportSummary(evidence.report) })
  }
  return { openObligations, ownerFeedbackFacts }
}
function activationBlockers(state, workflow) {
  return Object.values(workflow.issues).filter(issue => issue.status === 'open' && issue.blocksActivation
    && !ownerFeedbackEvidence(state, workflow, issue))
}
function activatePlan(state, workflow, event, now) {
      if (workflow.cancelRequested) throw new Error('Cancelled workflow cannot activate a plan')
      if (event.parentVersion !== workflow.planVersion) throw new Error('Plan parent version changed')
      const plan = normalizePlanV2(event.plan)
      if (plan.tasks.some(task => task.decomposition?.status === 'abstract')) throw new Error('Abstract tasks must be decomposed before execution activation')
      const planDigest = kernelDigest(plan)
      if (event.review?.planDigest !== planDigest || event.review.status !== 'passed' || !event.review.evidenceRef) throw new Error('Plan requires bound review evidence')
      if (event.authorization?.scope !== 'implementation' || !event.authorization.sourceId || !event.sources?.snapshotDigest) throw new Error('Plan lacks source or implementation authority')
      if (activationBlockers(state, workflow).length) throw new Error('Open obligations prevent activation')
      assertPublicPlan(workflow, plan)
      const next = {}
      const previousPlan = workflow.plan
      const preserved = new Set()
      for (const task of plan.tasks) {
        safeId(task.id)
        const definitionDigest = taskExecutionDigest(plan, task)
        const old = workflow.tasks[task.id]
        const equivalent = Boolean(old && taskExecutionEquivalent(previousPlan, plan, task.id))
        if (old?.attemptId && equivalent) {
          const attempt = workflow.attempts[old.attemptId]
          if (!attempt) throw new Error(`Task attempt is missing: ${task.id}`)
          if (!attempt.dispatchContract) attempt.dispatchContract = dispatchContractForPlan(state, workflow, attempt, previousPlan)
          else attemptDispatchContract(state, workflow, attempt)
        }
        if (old && !equivalent && old.attemptId) {
          const attempt = workflow.attempts[old.attemptId]
          if (!TERMINAL.has(attempt.phase) || attempt.quarantined) throw new Error(`Affected task not settled: ${task.id}`)
        }
        const inheritedIssueIds = taskIssues(workflow, plan, task)
        next[task.id] = equivalent ? { ...old, inheritedIssueIds }
          : { id: task.id, definitionDigest, generation: old?.generation ?? 0, attemptId: null, inheritedIssueIds }
        if (equivalent) preserved.add(task.id)
      }
      for (const task of Object.values(workflow.tasks)) if (!has(next, task.id) && task.attemptId) {
        const attempt = workflow.attempts[task.attemptId]
        if (!TERMINAL.has(attempt.phase) || attempt.quarantined) throw new Error(`Removed task not settled: ${task.id}`)
      }
      workflow.retiredTasks ??= []
      for (const task of Object.values(workflow.tasks)) if (!preserved.has(task.id)) workflow.retiredTasks.push({ ...copy(task), retiredAtVersion: workflow.planVersion + 1 })
      for (const decision of Object.values(workflow.decisions)) {
        if (decision.status !== 'pending') continue
        const attempt = workflow.attempts[decision.binding?.attemptId]
        if (attempt && next[attempt.taskId]?.attemptId === attempt.id) continue
        decision.status = 'superseded'; decision.supersededAt = now
        for (const action of Object.values(state.actions).filter(action => action.kind === 'request_decision' && action.input.decisionId === decision.id && !TERMINAL.has(action.status))) {
          action.status = 'cancelled'; action.nextWakeAt = null
        }
      }
      workflow.plan = plan; workflow.tasks = next; workflow.planVersion++
      workflow.activation = { planDigest, review: copy(event.review), authorization: copy(event.authorization), sources: copy(event.sources) }
      workflow.planningSources = copy(event.sources)
      if (workflow.pendingRegistry) {
        for (const record of Object.values(workflow.tasks)) {
          const attempt = workflow.attempts[record.attemptId]
          if (attempt?.failure === 'registry_changed' && attempt.termination?.executionSettled && !attempt.quarantined) record.attemptId = null
        }
        workflow.pendingRegistry = null
      }
      for (const action of Object.values(state.actions).filter(action => action.workflowId === workflow.id && !action.attemptId
        && action.status === 'failed' && !action.quarantined && ['plan', 'review_plan', 'prepare_workflow', 'prepare_revision', 'verify_workflow', 'deliver_workflow'].includes(action.kind))) {
        action.resolution = { kind: 'plan_superseded', planVersion: workflow.planVersion, evidenceRef: event.review.evidenceRef }
      }
      for (const issue of Object.values(workflow.issues).filter(item => item.origin === 'action' && item.status === 'open'
        && ['prepare_workflow', 'prepare_revision', 'plan', 'review_plan'].includes(item.closeWhen.actionKind))) {
        const sourceAction = state.actions[issue.sourceId]
        if (sourceAction && !sourceAction.quarantined && sourceAction.resolution) {
          issue.status = 'closed'; issue.evidence = { kind: 'reviewed_activation', planVersion: workflow.planVersion, ref: event.review.evidenceRef }
        }
      }
      refreshExecutionObligations(state, workflow, now)
      workflow.delivery = null; workflow.finalVerification = null; workflow.deliveryFailure = null; workflow.planningFailure = null; workflow.pendingActivation = null; workflow.pendingPlanning = null; workflow.planningCandidate = null
      const feedbackIssueCount = Object.values(workflow.issues)
        .filter(issue => issue.status === 'open' && ownerFeedbackEvidence(state, workflow, issue)).length
      if (feedbackIssueCount) notify(state, workflow, 'plan_activated', {
        planVersion: workflow.planVersion, planDigest, unresolvedOwnerFeedback: true,
        feedbackIssueCount, nextTool: 'workflow_status',
      }, `plan-activated:${workflow.planVersion}:${planDigest}`, now)
      touch(workflow, now)
      return workflow.planVersion

}
function activateSettledProposal(state, workflow, proposal, now) {
  const nextBase = proposal.sources.executionBaseline?.commitSha ?? proposal.sources.codeBaseline?.checkpointCommit
  if (nextBase && nextBase !== workflow.baseCommit) {
    const key = `source:${kernelDigest(proposal)}`
    const existing = state.actions[`act-${kernelDigest([workflow.id, 'prepare_revision', key]).slice(0, 40)}`]
    if (existing) return existing.id
    return enqueue(state, workflow, 'prepare_revision', { proposal, expectedBase: workflow.integrationHead,
      previousBase: workflow.baseCommit, checkpointCommit: nextBase }, key, now,
    { locks: [`project:${workflow.root}:integration`] }).id
  }
  return activatePlan(state, workflow, proposal, now)
}
function proposeActivation(state, workflow, event, now) {
  if (workflow.cancelRequested || event.parentVersion !== workflow.planVersion) throw new Error('Plan parent version changed or workflow cancelled')
  const plan = normalizePlanV2(event.plan)
  if (event.review?.status !== 'passed' || event.review.planDigest !== kernelDigest(plan) || !event.review.evidenceRef
    || event.authorization?.scope !== 'implementation' || !event.authorization.sourceId || !event.sources?.snapshotDigest) throw new Error('Plan proposal lacks bound authority')
  if (activationBlockers(state, workflow).length) throw new Error('Open obligations prevent activation')
  assertPublicPlan(workflow, plan)
  const affected = Object.values(workflow.tasks).filter(record => {
    return !taskExecutionEquivalent(workflow.plan, plan, record.id)
  }).map(record => record.id)
  const proposal = { ...copy(event), plan, affected }
  if (workflow.pendingActivation && kernelDigest(workflow.pendingActivation) !== kernelDigest(proposal)) throw new Error('A different plan replacement is already pending')
  workflow.pendingActivation = proposal
  for (const taskId of affected) {
    const attempt = workflow.attempts[workflow.tasks[taskId].attemptId]
    if (attempt) stopAttempt(state, workflow, attempt, 'plan_replaced', now)
  }
  if (affected.every(id => {
    const attempt = workflow.attempts[workflow.tasks[id].attemptId]
    return !attempt || TERMINAL.has(attempt.phase) && !attempt.quarantined
  })) return activateSettledProposal(state, workflow, proposal, now)
  touch(workflow, now)
  return { status: 'pending_activation', affected }
}
function requestDecision(state, workflow, event, now) {
      const id = safeId(event.id)
      const request = { id, kind: event.kind, request: event.request, binding: event.binding, rootSessionId: workflow.rootSessionId }
      if (!['permission', 'product'].includes(event.kind)) throw new Error('Only permission/product questions require user decisions')
      const requestDigest = kernelDigest(request)
      if (workflow.decisions[id]) {
        if (workflow.decisions[id].requestDigest !== requestDigest) throw new Error('Decision identity conflict')
        return id
      }
      workflow.decisions[id] = { ...request, requestDigest, status: 'pending', createdAt: now }
      if (event.binding.attemptId) {
        const attempt = workflow.attempts[event.binding.attemptId]
        if (!attempt || attempt.authority !== event.binding.authority || TERMINAL.has(attempt.phase) || attempt.phase === 'stopping') throw new Error('Decision attempt is stale')
        attempt.waitingDecision = id; attempt.waitStartedAt = now
      }
      if (event.binding.actionId) {
        const action = actionOf(state, event.binding.actionId)
        if (action.workflowId !== workflow.id || action.inputDigest !== event.binding.inputDigest || TERMINAL.has(action.status) || action.stopRequested) throw new Error('Decision action is stale')
        if (action.waitingDecision) throw new Error('Action already has a pending decision')
        action.waitingDecision = id; action.waitStartedAt = now
      }
      enqueue(state, workflow, 'request_decision', { ...request, decisionId: id, requestDigest }, id, now)
      touch(workflow, now); return id

}
function candidateActionTaskRetryBinding(state, workflow, issue) {
  if (issue.origin !== 'action' || issue.closeWhen?.actionKind !== 'verify_candidate') return null
  const sourceAction = state.actions[issue.sourceId]
  if (!sourceAction || sourceAction.workflowId !== workflow.id || sourceAction.kind !== 'verify_candidate'
    || sourceAction.inputDigest !== issue.closeWhen.inputDigest || !sourceAction.attemptId) return null
  const fromAttempt = workflow.attempts[sourceAction.attemptId]
  const executionIssue = workflow.issues[fromAttempt?.issueId]
  if (!fromAttempt || executionIssue?.origin !== 'execution') return null
  const repairs = executionIssue.repairHistory?.filter(item => item.attemptId === fromAttempt.id) ?? []
  if (repairs.length !== 1) return null
  const binding = { kind: 'task_retry', sourceActionId: sourceAction.id, fromAttemptId: fromAttempt.id,
    taskId: fromAttempt.taskId, executionIssueId: executionIssue.id, decisionRef: repairs[0].decisionRef }
  return { binding, sourceAction, fromAttempt, executionIssue }
}

function verifiedReadOnlyReviewRetry(state, workflow, executionIssue, sourceAction = null) {
  const task = workflow.plan?.tasks.find(item => item.id === executionIssue.taskId)
  const record = workflow.tasks[executionIssue.taskId]
  const failureIds = executionIssue.attempts
  let currentDefinitionDigest
  try { currentDefinitionDigest = task ? taskExecutionDigest(workflow.plan, task) : null } catch { return null }
  if (!task || task.children || task.role !== 'review' || task.write?.length !== 0 || task.verify?.length !== 0
    || !Array.isArray(failureIds) || failureIds.length === 0 || new Set(failureIds).size !== failureIds.length
    || !record || record.definitionDigest !== currentDefinitionDigest) return null
  const failures = failureIds.map(id => workflow.attempts[id])
  if (failures.some(attempt => !attempt || attempt.taskId !== task.id || attempt.definitionDigest !== record.definitionDigest
    || attempt.phase !== 'failed' || attempt.failure !== 'verification_failed'
    || attempt.verification?.passed !== false || attempt.verification.executionSettled !== true
    || !Array.isArray(attempt.verification.results) || attempt.verification.results.length !== 0
    || attempt.verification.review?.passed !== false
    || attempt.verification.review.commitSha !== attempt.candidate?.commitSha)) return null
  // This is a Runtime eligibility proof only. It never closes a failed report
  // without a later durable Owner submission, independent review and integration.
  for (const failure of failures) {
    let dispatch
    try { dispatch = attemptDispatchContract(state, workflow, failure) } catch { return null }
    if (kernelDigest(dispatch.task) !== kernelDigest(task) || dispatch.verifications.length !== 0) return null
  }
  const first = sourceAction
    ? workflow.attempts[sourceAction.attemptId]
    : [...failures].sort((left, right) => left.generation - right.generation)[0]
  if (!first || !failureIds.includes(first.id)) return null
  if (sourceAction && (sourceAction.kind !== 'verify_candidate' || sourceAction.inputDigest !== kernelDigest(sourceAction.input)
    || sourceAction.input?.task?.id !== task.id || kernelDigest(sourceAction.input.task) !== kernelDigest(task)
    || !Array.isArray(sourceAction.input.verifications) || sourceAction.input.verifications.length !== 0)) return null

  let prior = first
  const repairs = []
  const traversedFailureIds = []
  for (;;) {
    if (!failureIds.includes(prior.id)) return null
    traversedFailureIds.push(prior.id)
    const matching = executionIssue.repairHistory?.filter(item => item.attemptId === prior.id) ?? []
    if (matching.length !== 1) return null
    repairs.push(matching[0])
    const successors = Object.values(workflow.attempts).filter(attempt => attempt.taskId === prior.taskId
      && attempt.generation === prior.generation + 1 && attempt.definitionDigest === record.definitionDigest)
    if (successors.length !== 1) return null
    const attempt = successors[0]
    if (attempt.phase === 'failed') { prior = attempt; continue }
    if (attempt.phase !== 'succeeded' || !frozenAttemptMatches(record, attempt)
      || !attempt.submission || attempt.submission.id !== `sub-${attempt.id}`
      || !attempt.submission.manifestDigest || !attempt.submission.artifact
      || attempt.writeFrozen !== true || attempt.writerTermination?.authority !== attempt.authority
      || attempt.writerTermination.executionSettled !== true || attempt.writerTermination.sourceWritesClosed !== true
      || !isManagedRangeStopped(attempt.writerTermination) || !attempt.writerTermination.sessionId
      || attempt.writerTermination.sessionId !== attempt.sessionId
      || !attempt.candidate?.commitSha || !attempt.candidate.repositoryRoot || attempt.candidate.authority !== attempt.authority
      || attempt.verification?.passed !== true || attempt.verification.executionSettled !== true
      || attempt.verification.commitSha !== attempt.candidate.commitSha
      || !Array.isArray(attempt.verification.results) || attempt.verification.results.length !== 0
      || attempt.verification.review?.passed !== true
      || attempt.verification.review.commitSha !== attempt.candidate.commitSha
      || attempt.verification.review.executionSettled !== true || !isManagedRangeStopped(attempt.verification.review)
      || !attempt.verification.review.evidenceRef || !attempt.verification.review.sessionId
      || attempt.verification.review.sessionId === attempt.writerTermination.sessionId
      || attempt.integration?.verified !== true || attempt.integration.candidateCommit !== attempt.candidate.commitSha
      || !attempt.integration.commitSha || !attempt.integration.worklogRef) return null
    let dispatch
    try { dispatch = attemptDispatchContract(state, workflow, attempt) } catch { return null }
    if (dispatch.planVersion !== workflow.planVersion || kernelDigest(dispatch.task) !== kernelDigest(task)
      || dispatch.verifications.length !== 0) return null
    if (!sourceAction && (traversedFailureIds.length !== failureIds.length
      || traversedFailureIds.some(id => !failureIds.includes(id)))) return null
    return { attempt, failures, repairs, proofs: [] }
  }
}

function verifiedTaskRetrySuccessor(state, workflow, supersession) {
  const { sourceAction, fromAttempt, executionIssue } = supersession
  const task = sourceAction.input?.task
  const expected = sourceAction.input?.verifications
  if (task?.id !== fromAttempt.taskId || !Array.isArray(expected)
    || !expected.every(definition => task.verify?.includes(definition.id))) return null
  if (!expected.length) return verifiedReadOnlyReviewRetry(state, workflow, executionIssue, sourceAction)
  let prior = fromAttempt
  const repairs = []
  for (;;) {
    const matching = executionIssue.repairHistory?.filter(item => item.attemptId === prior.id) ?? []
    if (matching.length !== 1) return null
    repairs.push(matching[0])
    const successors = Object.values(workflow.attempts).filter(attempt => attempt.taskId === prior.taskId
      && attempt.generation === prior.generation + 1 && attempt.definitionDigest === fromAttempt.definitionDigest)
    if (successors.length !== 1) return null
    const attempt = successors[0]
    if (attempt.phase !== 'succeeded') {
      if (attempt.phase !== 'failed') return null
      prior = attempt
      continue
    }
    if (attempt.integration?.verified !== true || attempt.integration.candidateCommit !== attempt.candidate?.commitSha
      || attempt.verification?.commitSha !== attempt.candidate?.commitSha
      || attempt.verification?.review?.passed !== true
      || attempt.verification.review.commitSha !== attempt.candidate?.commitSha) return null
    const proofs = expected.map(definition => {
      const result = attempt.verification.results?.find(item => item.verificationId === definition.id)
      return result?.passed === true && result.exitCode === 0 && result.zeroTests !== true
        && result.commitSha === attempt.candidate.commitSha ? result : null
    })
    return proofs.some(result => result === null) ? null : { attempt, proofs, repairs }
  }
}
function refreshExecutionObligations(state, workflow, now) {
  const before = kernelDigest(workflow.issues)
  for (const issue of Object.values(workflow.issues)) {
    const feedback = issue.status === 'open' ? ownerFeedbackEvidence(state, workflow, issue) : null
    if (feedback) {
      const attempt = workflow.attempts[feedback.attemptId]
      const task = feedback.source.input?.task
      const verifications = attempt?.dispatchContract?.verifications ?? workflow.plan?.verifications ?? []
      const observation = ownerResourceObservation(feedback.report, task, verifications)
      if (observation) {
        const action = Object.values(state.actions).find(item => item.workflowId === workflow.id
          && item.kind === 'verify_candidate' && item.attemptId === feedback.attemptId && item.result)
        const result = action?.result?.results?.find(item => item.verificationId === observation.verificationId)
        const binding = action?.input?.verifications?.find(item => item.id === observation.verificationId)
        const candidateCommit = action?.input?.candidate?.commitSha
        const executed = result && binding && kernelDigest(binding) === kernelDigest(observation.definition)
          && result.commitSha === candidateCommit && JSON.stringify(result.argv) === JSON.stringify(binding.run)
          && result.status !== 'execution_error' && Number.isSafeInteger(result.exitCode)
          && result.exitCode >= 0 && result.exitCode <= 125
          && result.exitCode !== observation.observedExitCode
          && result.enforcement === 'full' && result.timedOut !== true && result.aborted !== true
          && result.kind !== 'sandbox_unavailable' && result.kind !== 'background'
          && isManagedRangeStopped(result.commandTermination)
        if (executed) {
          issue.status = 'closed'; issue.evidence = { kind: 'runner_resource_available', resolvedAt: now,
            actionId: action.id, attemptId: feedback.attemptId, verificationId: observation.verificationId,
            commitSha: result.commitSha, exitCode: result.exitCode,
            commandTermination: copy(result.commandTermination), ...(observation.migration ? { migration: observation.migration } : {}) }
        }
        continue
      }
    }
    if (issue.origin === 'public_owner') {
      if (issue.status !== 'open') continue
      const record = workflow.publicOwnerDecisionSessions?.[issue.latestRequestKey]
      const binding = workflow.plan?.publicOwnerChanges?.find(item => item.decisionDigest === record?.decisionDigest)
      const required = binding ? [binding.implementationTaskId, ...binding.consumers.map(item => item.taskId).filter(Boolean)] : []
      if (record?.decision.outcome !== 'capability_sufficient' && (!required.length || required.some(id => workflow.attempts[workflow.tasks[id]?.attemptId]?.phase !== 'succeeded'))) continue
      issue.status = 'closed'; issue.evidence = { resolvedAt: now, decisionDigest: record.decisionDigest, ref: record.receipt.evidenceRef,
        integrations: required.map(id => ({ taskId: id, ...workflow.attempts[workflow.tasks[id].attemptId].integration })) }
      const sourceIssue = workflow.issues[issue.requestId]
      if (sourceIssue?.status === 'open' && ownerFeedbackEvidence(state, workflow, sourceIssue)) {
        sourceIssue.status = 'closed'; sourceIssue.evidence = { kind: 'public_owner_resolution', resolvedAt: now,
          decisionDigest: record.decisionDigest, ref: record.receipt.evidenceRef }
      }
      continue
    }
    if (issue.origin === 'execution') {
      if (issue.status !== 'open') continue
      if (Array.isArray(issue.closeWhen?.passingCurrentTaskVerification)
        && issue.closeWhen.passingCurrentTaskVerification.length === 0
        && Array.isArray(issue.closeWhen.verifications) && issue.closeWhen.verifications.length === 0) {
        const success = verifiedReadOnlyReviewRetry(state, workflow, issue)
        if (!success) continue
        issue.status = 'closed'; issue.evidence = { kind: 'review_report_verified_integration', resolvedAt: now,
          planDigest: workflow.activation.planDigest, taskId: issue.taskId,
          failedAttemptIds: success.failures.map(attempt => attempt.id), attemptId: success.attempt.id,
          submissionId: success.attempt.submission.id, ownerSessionId: success.attempt.writerTermination.sessionId,
          reviewerSessionId: success.attempt.verification.review.sessionId,
          reviewEvidenceRef: success.attempt.verification.review.evidenceRef,
          taskCommitSha: success.attempt.candidate.commitSha, commitSha: success.attempt.integration.commitSha,
          ref: success.attempt.integration.worklogRef }
        continue
      }
      const tasks = workflow.plan?.tasks.filter(task => !task.children && taskIssues(workflow, workflow.plan, task).includes(issue.id)) ?? []
      const attempts = tasks.map(task => workflow.attempts[workflow.tasks[task.id]?.attemptId])
      if (!tasks.length || attempts.some(attempt => attempt?.phase !== 'succeeded')) continue
      const required = issue.closeWhen.verifications
      if (!required?.length || !required.every(definition => tasks.some((task, index) => {
        const current = workflow.plan.verifications.find(item => item.id === definition.id)
        const attempt = attempts[index]
        return current && task.verify.includes(definition.id) && kernelDigest(current) === kernelDigest(definition)
          && attempt.verification?.results.some(result => result.verificationId === definition.id && result.passed === true
            && result.exitCode === 0 && result.zeroTests !== true && result.commitSha === attempt.candidate?.commitSha)
      }))) continue
      issue.status = 'closed'; issue.evidence = { resolvedAt: now, planDigest: workflow.activation.planDigest,
        attempts: attempts.map(attempt => ({ attemptId: attempt.id, ref: attempt.integration.worklogRef,
          taskCommitSha: attempt.candidate.commitSha, commitSha: attempt.integration.commitSha })) }
      continue
    }
    if (issue.origin === 'action' && issue.closeWhen?.actionKind === 'verify_candidate') {
      if (issue.status !== 'open') continue
      const supersession = candidateActionTaskRetryBinding(state, workflow, issue)
      if (!supersession) continue
      const success = verifiedTaskRetrySuccessor(state, workflow, supersession)
      if (!success) continue
      const { binding } = supersession
      const { attempt, proofs, repairs } = success
      issue.status = 'closed'; issue.evidence = { kind: 'task_retry_verified_integration', resolvedAt: now,
        ...binding, attemptId: attempt.id, taskCommitSha: attempt.candidate.commitSha,
        commitSha: attempt.integration.commitSha, ref: attempt.integration.worklogRef,
        repairDecisionRefs: repairs.map(item => item.decisionRef),
        verifications: proofs.map(result => ({ verificationId: result.verificationId,
          commitSha: result.commitSha, exitCode: result.exitCode })) }
      continue
    }
    if (issue.origin !== 'plan_review' || issue.closeWhen?.kind !== 'task_verification_result') continue
    const condition = issue.closeWhen
    const task = workflow.plan?.tasks.find(task => task.id === condition.taskId)
    const record = workflow.tasks[condition.taskId]
    const attempt = workflow.attempts[record?.attemptId]
    const proof = task && frozenAttemptMatches(record, attempt) && attempt.phase === 'succeeded'
      && task.verify.includes(condition.verificationId) && attempt.verification?.results.find(result =>
        result.verificationId === condition.verificationId && result.passed === true && result.exitCode === 0
        && result.zeroTests !== true && result.commitSha === attempt.candidate?.commitSha)
    issue.status = proof ? 'closed' : 'open'
    if (proof) issue.evidence = { ...condition, ref: attempt.integration.worklogRef, attemptId: attempt.id,
      commitSha: proof.commitSha, planDigest: workflow.activation.planDigest, resolvedAt: now }
    else delete issue.evidence
  }
  return kernelDigest(workflow.issues) !== before
}
function acceptedRevisionDecision(decision) {
  const accepted = decision.request?.options?.[1]
  const selected = decision.answer?.answers?.find(item => item.id === decision.id)?.selected
  return accepted === '接受建议变更' && Array.isArray(selected)
    && selected.length === 1 && selected[0] === accepted
}
function planningClosureEvidence(state, workflow, plan, planDigest, previousPlanDigest = null) {
  return { planDigest,
    planBindings: plan.tasks.flatMap(task => task.verify.map(verificationId => ({ taskId: task.id, verificationId }))),
    // Review and verify tasks may intentionally produce only their durable
    // Owner report, so empty write/verify arrays remain executable contracts.
    executableTasks: plan.tasks.filter(task => !task.children && task.ownerId
      && Array.isArray(task.write) && Array.isArray(task.verify)).map(task => ({ taskId: task.id })),
    taskVerificationResults: plan.tasks.flatMap(task => {
      const record = workflow.tasks[task.id]; const attempt = workflow.attempts[record?.attemptId]
      if (!frozenAttemptMatches(record, attempt) || !taskExecutionEquivalent(workflow.plan, plan, task.id)) return []
      return (attempt.verification?.results ?? []).map(result => ({ ...result, taskId: task.id, current: attempt.phase === 'succeeded', planDigest }))
    }),
    decisionRecords: Object.values(workflow.decisions).filter(decision => decision.status === 'answered' && decision.binding?.obligationId
      && (decision.binding.planDigest === planDigest
        || (previousPlanDigest && decision.binding.planDigest === previousPlanDigest
          && decision.binding.planVersion === workflow.planVersion && acceptedRevisionDecision(decision))))
      .map(decision => ({ ...decision.binding, decisionId: decision.id, sourcePlanDigest: decision.binding.planDigest,
        planDigest, status: 'recorded', current: true, authority: 'user' })),
  }
}

function closureClaimFor(issue, evidence) {
  const condition = issue.closeWhen
  if (!condition || typeof condition !== 'object') return null
  const claim = { obligationId: issue.id, kind: condition.kind, taskId: condition.taskId, planDigest: evidence.planDigest }
  if (condition.verificationId !== undefined) claim.verificationId = condition.verificationId
  if (condition.kind === 'decision_record') {
    const decision = evidence.decisionRecords.find(item => item.obligationId === issue.id
      && item.taskId === condition.taskId && item.authority === condition.authority
      && item.source?.id === issue.source?.id && item.source?.version === issue.source?.version)
    if (!decision) return null
    claim.decisionId = decision.decisionId
  }
  return claim
}

function unchangedPlanReadyForClosureReview(state, workflow, plan, planDigest, now) {
  const open = activationBlockers(state, workflow).filter(issue => issue.origin === 'plan_review')
  if (open.length === 0) return false
  const evidence = planningClosureEvidence(state, workflow, plan, planDigest)
  const candidate = { planDigest }
  // This only proves that an independent review has facts worth evaluating.
  // The real issues remain open until that Reviewer submits verified closures.
  return open.every(issue => {
    const claim = closureClaimFor(issue, evidence)
    return claim && verifiedClosure(issue, { obligationClosures: [claim] }, candidate, evidence,
      new Date(now).toISOString()).resolution !== undefined
  })
}

function planReviewObligationSetDigest(issues) {
  const identities = (issues ?? []).filter(issue => issue?.status === 'open' && issue.origin === 'plan_review'
    && issue.blocksActivation === true).map(issue => ({
    id: issue.id,
    definition: issue.definition ?? { source: issue.source, targetTaskIds: issue.targetTaskIds, closeWhen: issue.closeWhen },
    targetVerificationIds: [...(issue.targetVerificationIds ?? [])].sort(),
  })).sort((left, right) => left.id.localeCompare(right.id))
  return identities.length ? kernelDigest(identities) : null
}

function repeatedUnchangedClosureReview(state, workflow, action, planDigest) {
  const currentObligations = planReviewObligationSetDigest(Object.values(workflow.issues))
  if (currentObligations === null) return false
  return Object.values(state.actions).some(item => item.workflowId === workflow.id && item.kind === 'review_plan'
    && item.status === 'succeeded' && !item.quarantined
    && item.input?.snapshotDigest === action.input.snapshotDigest
    && item.input?.planDigest === planDigest && item.input?.previousPlanDigest === planDigest
    && planReviewObligationSetDigest(item.input?.openObligations) === currentObligations
    && item.result?.review?.status !== 'passed')
}

function existingReviewDefinition(existing, id) {
  if (!existing) return null
  if (existing.origin !== 'plan_review') {
    throw new Error(`Review obligationId ${id} already belongs to a non-review issue; use a new obligationId`)
  }
  return existing.definition ?? { source: existing.source, targetTaskIds: existing.targetTaskIds,
    closeWhen: existing.closeWhen }
}

function reconcileObligations(state, workflow, action, review, now) {
  for (const obligation of reviewObligations(review)) {
    try { safeId(obligation.id) } catch (cause) {
      throw new Error('Invalid review.issues[].obligationId: use letters, digits, dot, underscore, colon or hyphen, starting with a letter or digit', { cause })
    }
    const definition = { source: obligation.source, targetTaskIds: obligation.targetTaskIds, closeWhen: obligation.closeWhen }
    for (const id of obligation.targetVerificationIds ?? []) {
      if (!action.input.plan.verifications.some(item => item.id === id)) throw new Error(`Review targets unknown verification: ${id}`)
    }
    const existing = workflow.issues[obligation.id]
    const existingDefinition = existingReviewDefinition(existing, obligation.id)
    if (existing && kernelDigest(existingDefinition) !== kernelDigest(definition)) {
      throw new Error(`Review obligation identity changed for ${obligation.id}; existing immutable identity=${JSON.stringify({
        obligationId: existing.id, source: existing.source, targetTaskIds: existing.targetTaskIds, closeWhen: existing.closeWhen,
      })}. Keep the same identity and update only current title/detail/suggestion, use a new obligationId for a different identity, or submit an explicit obligationClosure when the existing closeWhen is satisfied.`)
    }
    if (!existing) workflow.issues[obligation.id] = { ...obligation, definition, sourceId: obligation.source.id,
      used: 0, blocksActivation: obligation.closeWhen.kind !== 'task_verification_result', origin: 'plan_review' }
    const issue = workflow.issues[obligation.id]
    if (existing) Object.assign(issue, { severity: obligation.severity, title: obligation.title,
      detail: obligation.detail, suggestion: obligation.suggestion })
    // Targets bound the reviewed repair surface. Only closeWhen defines the
    // evidence required for closure; a target is not an implicit mutation.
    if (obligation.targetVerificationIds?.length) {
      issue.targetVerificationIds = [...new Set([...(issue.targetVerificationIds ?? []), ...obligation.targetVerificationIds])].sort()
    }
  }
  const evidence = planningClosureEvidence(state, workflow, action.input.plan, action.input.planDigest,
    action.input.previousPlanDigest)
  for (const issue of Object.values(workflow.issues).filter(issue => issue.status === 'open' && issue.origin === 'plan_review')) {
    const closure = verifiedClosure(issue, review, { planDigest: action.input.planDigest }, evidence, new Date(now).toISOString())
    if (closure.resolution) { issue.status = 'closed'; issue.evidence = { ...closure.resolution, ref: action.id } }
  }
  return activationBlockers(state, workflow)
}
function resolveActionRepair(state, workflow, action, result) {
  if (!action.retryIssueId || !workflow.issues[action.retryIssueId]) return
  const issue = workflow.issues[action.retryIssueId]
  issue.status = 'closed'; issue.evidence = { actionId: action.id, ref: result.evidenceRef ?? result.review?.evidenceRef ?? action.id }
  for (const previous of Object.values(state.actions).filter(item => item.workflowId === workflow.id
    && (item.retryRootId === action.retryRootId || item.id === action.retryRootId))) {
    if (previous.id !== action.id) previous.resolution = { kind: 'retry_succeeded', actionId: action.id, evidenceRef: issue.evidence.ref }
  }
}
function planningValidationFailures(action, result) {
  if (result.validationFailures === undefined) return []
  if (!Array.isArray(result.validationFailures)) throw new Error('Planner validation failures must be an array')
  for (const failure of result.validationFailures) {
    if (failure?.contract !== 'DSH_PLANNING_VALIDATION_FAILURE_V1' || failure.actionId !== action.id
      || failure.workflowId !== action.workflowId || failure.inputDigest !== action.inputDigest
      || failure.snapshotDigest !== action.input.snapshotDigest || typeof failure.code !== 'string' || !failure.code
      || typeof failure.evidenceRef !== 'string' || !failure.evidenceRef) {
      throw new Error('Planner validation failure evidence does not bind this Action')
    }
  }
  return copy(result.validationFailures)
}
function registerInitialPlanningObligations(state, workflow, review) {
  for (const obligation of reviewObligations(review)) {
    try { safeId(obligation.id) } catch (cause) {
      throw new Error('Invalid review.issues[].obligationId: use letters, digits, dot, underscore, colon or hyphen, starting with a letter or digit', { cause })
    }
    const definition = { source: obligation.source, targetTaskIds: obligation.targetTaskIds, closeWhen: obligation.closeWhen }
    const existing = workflow.issues[obligation.id]
    const existingDefinition = existingReviewDefinition(existing, obligation.id)
    if (existing && kernelDigest(existingDefinition) !== kernelDigest(definition)) {
      throw new Error(`Review obligation identity changed for ${obligation.id}; keep the same frozen source, targets and closeWhen or use a new obligationId`)
    }
    if (!existing) workflow.issues[obligation.id] = { ...obligation, definition, sourceId: obligation.source.id,
      used: 0, blocksActivation: obligation.closeWhen.kind !== 'task_verification_result', origin: 'plan_review' }
    const issue = workflow.issues[obligation.id]
    if (existing) Object.assign(issue, { severity: obligation.severity, title: obligation.title,
      detail: obligation.detail, suggestion: obligation.suggestion })
    if (obligation.targetVerificationIds?.length) {
      issue.targetVerificationIds = [...new Set([...(issue.targetVerificationIds ?? []), ...obligation.targetVerificationIds])].sort()
    }
  }
  return activationBlockers(state, workflow)
}
function recordPlanningFailure(state, workflow, action, result, review, open, now) {
  const id = workflow.planningIssueId ??= action.input.issueId ?? `issue-${kernelDigest([workflow.id, 'planning']).slice(0, 40)}`
  const issue = workflow.issues[id] ??= { id, sourceId: action.input.sources.snapshotDigest, closeWhen: 'bound plan review passes with source evidence',
    status: 'open', used: 0, blocksActivation: false, reviewHistory: [] }
  issue.reviewHistory.push({ actionId: action.id, evidenceRef: result.evidenceRef, planDigest: result.planDigest })
  const classification = reviewDecisionClassification(review, { obligations: open })
  const boundary = action.input.revisionBoundary
  const outsideBoundary = boundary && (review.issues ?? []).some(item =>
    (item.targetTaskIds ?? []).some(id => !boundary.taskIds.includes(id))
    || item.closeWhen?.taskId && !boundary.taskIds.includes(item.closeWhen.taskId)
    || (item.targetVerificationIds ?? []).some(id => !boundary.verificationIds.includes(id)))
  if (classification.authorityRequired) {
    for (const obligation of open.filter(item => item.closeWhen?.authority === 'user')) requestDecision(state, workflow, {
      id: `decision-${kernelDigest([workflow.id, obligation.id, result.planDigest]).slice(0, 40)}`,
      kind: obligation.classificationBasis?.externalPermissionGap ? 'permission' : 'product',
      request: { question: obligation.title, detail: JSON.stringify(obligation.classificationBasis), options: ['保留现有要求', '接受建议变更'] },
      binding: { planningActionId: action.id, issueId: id, obligationId: obligation.id, taskId: obligation.closeWhen.taskId,
        source: obligation.source, planDigest: result.planDigest, planVersion: workflow.planVersion } }, now)
  } else {
    workflow.planningFailure = outsideBoundary ? 'revision_boundary_required' : 'revision_required'
    const validationFailures = planningValidationFailures(action, result)
    notify(state, workflow, 'planning_failed', { issueId: id, reason: workflow.planningFailure,
      revisionBoundary: boundary, review, nextTool: 'workflow_replan', evidenceRef: result.evidenceRef,
      ...(validationFailures.length ? { validationFailures } : {}) }, `planning:${action.id}`, now)
  }
  return 'accepted'
}
function applyPlanningResult(state, action, result, now) {
  const workflow = wf(state, action.workflowId)
  if (action.kind === 'plan') {
    if (result.blocked === true) {
      const hasPreviousPlan = action.input.previousPlan !== undefined
      if (result.snapshotDigest !== action.input.snapshotDigest || !result.evidenceRef
        || result.review?.status === 'passed' || !(result.review?.issues?.length > 0)) {
        throw new Error('Planner obstruction lacks its bound source, evidence or negative issues')
      }
      planningValidationFailures(action, result)
      if (!hasPreviousPlan) {
        if (workflow.plan !== null || action.input.previousPlanDigest !== undefined && action.input.previousPlanDigest !== null
          || result.planDigest !== null) throw new Error('Initial Planner obstruction cannot claim or replace an admitted plan')
        const open = registerInitialPlanningObligations(state, workflow, result.review)
        return recordPlanningFailure(state, workflow, action, result, result.review, open, now)
      }
      if (action.input.previousPlanDigest !== result.planDigest
        || kernelDigest(action.input.previousPlan) !== result.planDigest) {
        throw new Error('Planner obstruction does not bind its admitted previous plan')
      }
      const previousPlan = normalizePlanV2(action.input.previousPlan)
      const reviewAction = { ...action, input: { ...action.input, plan: previousPlan, planDigest: result.planDigest } }
      const open = reconcileObligations(state, workflow, reviewAction, result.review, now)
      return recordPlanningFailure(state, workflow, reviewAction, result, result.review, open, now)
    }
    const plan = normalizePlanV2(result.plan)
    if (result.snapshotDigest !== action.input.snapshotDigest || plan.registryDigest !== action.input.registryDigest
      || !result.packagesRef || !result.evidenceRef) throw new Error('Planner result lacks bound source/package evidence')
    assertPlanningRevisionBoundary(workflow, action, plan)
    const digest = kernelDigest(plan)
    const unchanged = action.input.previousPlanDigest === digest
    const reviewableClosure = unchanged && unchangedPlanReadyForClosureReview(state, workflow, plan, digest, now)
      && !repeatedUnchangedClosureReview(state, workflow, action, digest)
    if (unchanged && !reviewableClosure) {
      action.failure = 'planning_no_progress'; workflow.planningFailure = action.failure
      action.status = 'failed'; action.result = copy(result); action.nextWakeAt = null; action.completedAt = now
      notify(state, workflow, 'planning_failed', { reason: action.failure, actionId: action.id }, `planning:${action.id}`, now)
      touch(workflow, now); return 'planning_no_progress'
    }
    const reviewAction = enqueue(state, workflow, 'review_plan', { ...action.input, plan, planDigest: digest, packagesRef: result.packagesRef,
      plannerEvidenceRef: result.evidenceRef }, action.id, now, { occupiesSlot: true })
    workflow.planningCandidate = { actionId: reviewAction.id, inputDigest: reviewAction.inputDigest,
      parentVersion: action.input.parentVersion, snapshotDigest: action.input.snapshotDigest, planDigest: digest }
    return 'accepted'
  }
  if (action.kind !== 'review_plan') throw new Error('Planning result requires a plan or review_plan action')
  if (result.planDigest !== action.input.planDigest || !result.evidenceRef || result.snapshotDigest !== action.input.snapshotDigest) throw new Error('Plan review source mismatch')
  const review = result.review
  const open = reconcileObligations(state, workflow, action, review, now)
  const unresolvedReview = open.filter(issue => issue.origin === 'plan_review')
  if (review.status === 'passed' && unresolvedReview.length) {
    throw new Error(`passed review lacks verified obligationClosures for ${unresolvedReview.map(issue => issue.id).join(', ')}. Submit corrected closure claims in this same action after checking each closeWhen, or report needs_revision with the actual remaining gaps. Bound obligations: ${JSON.stringify(unresolvedReview.map(issue => ({ obligationId: issue.id, closeWhen: issue.closeWhen, planDigest: action.input.planDigest })))}`)
  }
  if (review.status === 'passed' && open.length === 0) {
    if (action.input.issueId) {
      const issue = workflow.issues[action.input.issueId]
      if (issue && issue.blocksActivation !== true) { issue.status = 'closed'; issue.evidence = { ref: result.evidenceRef, planDigest: action.input.planDigest } }
    }
    proposeActivation(state, workflow, { parentVersion: action.input.parentVersion, plan: action.input.plan,
      authorization: action.input.authorization, sources: { ...action.input.sources, packagesRef: action.input.packagesRef },
      review: { status: 'passed', evidenceRef: result.evidenceRef, planDigest: action.input.planDigest } }, now)
  } else {
    return recordPlanningFailure(state, workflow, action, result, review, open, now)
  }
  return 'accepted'
}

/** Validate one model planning result against an exact live Action on a throwaway state clone. */
export function preflightPlanningResult(previous, expected, result, now = Date.now()) {
  assertControlState(previous)
  integer(now, 'now')
  const state = copy(previous)
  const action = actionOf(state, required(expected?.actionId, 'expected actionId'))
  if (action.workflowId !== required(expected?.workflowId, 'expected workflowId')
    || action.kind !== required(expected?.kind, 'expected action kind')
    || action.inputDigest !== required(expected?.inputDigest, 'expected inputDigest')) throw new Error('Planning preflight action identity changed')
  if (!['plan', 'review_plan'].includes(action.kind)) throw new Error('Planning preflight requires a plan or review_plan action')
  if (!['running', 'waiting'].includes(action.status) || action.stopRequested) throw new Error('Planning preflight action is no longer publishable')
  const outcome = applyPlanningResult(state, action, result, now)
  if (outcome === 'planning_no_progress') throw new Error('planning_no_progress: submitted plan matches its authoring parent and has no new reviewable closure evidence')
  assertControlState(state)
  return true
}
function finishAction(state, action, result, now) {
  const workflow = wf(state, action.workflowId)
  const attempt = attemptOf(state, action)
  if (attempt && action.kind !== 'stop_execution' && (attempt.phase === 'stopping' || attempt.quarantined)) throw new Error('Stopped attempt cannot publish results')
  switch (action.kind) {
    case 'prepare_workflow':
      if (result.integrationRef !== workflow.integrationRef || result.baseCommit !== workflow.baseCommit || !result.evidenceRef) throw new Error('Workflow ref preparation does not match its reservation')
      if (!workflow.cancelRequested) enqueue(state, workflow, 'plan', action.input.planning, 'initial', now, { occupiesSlot: true })
      break
    case 'prepare_revision': {
      if (!workflow.pendingActivation || kernelDigest(workflow.pendingActivation) !== kernelDigest(action.input.proposal)
        || result.baseCommit !== workflow.integrationHead || result.checkpointCommit !== action.input.checkpointCommit
        || !result.commitSha || !result.evidenceRef || result.executionSettled !== true) throw new Error('Source revision preparation has stale or incomplete evidence')
      workflow.baseCommit = result.checkpointCommit; workflow.integrationHead = result.commitSha
      activatePlan(state, workflow, action.input.proposal, now)
      break
    }
    case 'plan': case 'review_plan':
      if (applyPlanningResult(state, action, result, now) === 'planning_no_progress') return
      break
    case 'execute_owner': {
      // A completed model turn is not a submitted/verified task.
      if (!attempt.submission) throw new Error('Owner ended without a durable submission')
      if (result.executionSettled !== true || result.sourceWritesClosed !== true || !attempt.writeFrozen || result.authority !== attempt.authority) throw new Error('Owner result lacks action settlement or source write closure')
      attempt.phase = 'sealing'
      attempt.writerTermination = copy(result)
      const phaseDeadlineMs = attemptDispatchContract(state, workflow, attempt).task.onTimeout?.afterMs ?? workflow.policy.deadlineMs
      attempt.deadlineAt = now + phaseDeadlineMs
      enqueue(state, workflow, 'seal_candidate', { submission: attempt.submission, authority: attempt.authority },
        attempt.id, now, { attemptId: attempt.id, deadlineMs: phaseDeadlineMs })
      break
    }
    case 'seal_candidate': {
      required(result?.commitSha, 'candidate commitSha')
      if (result.authority !== attempt.authority) throw new Error('Candidate authority mismatch')
      attempt.candidate = copy(result)
      attempt.phase = 'verifying'
      const dispatch = attemptDispatchContract(state, workflow, attempt)
      const phaseDeadlineMs = dispatch.task.onTimeout?.afterMs ?? workflow.policy.deadlineMs
      attempt.deadlineAt = now + phaseDeadlineMs
      enqueue(state, workflow, 'verify_candidate', { candidate: result, task: dispatch.task,
        verifications: dispatch.verifications, planVersion: dispatch.planVersion,
        taskPackage: dispatch.taskPackage },
        attempt.id, now, { attemptId: attempt.id, deadlineMs: phaseDeadlineMs })
      break
    }
    case 'verify_candidate': {
      const task = attemptDispatchContract(state, workflow, attempt).task
      if (result.commitSha === attempt.candidate.commitSha && result.passed === false) {
        verificationFailed(state, workflow, action, attempt, result, now); return
      }
      if (result.commitSha !== attempt.candidate.commitSha || result.passed !== true
        || result.review?.passed !== true || result.review.commitSha !== result.commitSha) throw new Error('Candidate verification/review not valid')
      for (const id of task.verify) {
        const evidence = result.results?.find(item => item.verificationId === id)
        if (!evidence || evidence.passed !== true || evidence.commitSha !== result.commitSha || evidence.zeroTests === true) throw new Error(`Missing passing verification: ${id}`)
      }
      attempt.verification = copy(result)
      attempt.phase = 'integrating'
      refreshExecutionObligations(state, workflow, now)
      const phaseDeadlineMs = task.onTimeout?.afterMs ?? workflow.policy.deadlineMs
      attempt.deadlineAt = now + phaseDeadlineMs
      enqueue(state, workflow, 'integrate_candidate', { candidate: attempt.candidate, verification: result,
        expectedBase: workflow.integrationHead, root: workflow.root, authority: attempt.authority },
        attempt.id, now, { attemptId: attempt.id, deadlineMs: phaseDeadlineMs,
          locks: [`project:${workflow.root}:integration`] })
      break
    }
    case 'integrate_candidate': {
      required(result?.commitSha, 'integration commitSha')
      required(result?.worklogRef, 'sealed worklogRef')
      if (result.candidateCommit !== attempt.candidate.commitSha || result.verified !== true) throw new Error('Integration evidence mismatch')
      // A base change requires an explicit, newly verified integration result.
      if (result.baseCommit !== workflow.integrationHead) throw new Error('Integration base moved; recompose and verify')
      attempt.integration = copy(result)
      attempt.phase = 'succeeded'
      workflow.integrationHead = result.commitSha
      refreshExecutionObligations(state, workflow, now)
      if (result.memoryPending) enqueue(state, workflow, 'summarize_memory', { ownerId: attempt.ownerId, worklogRef: result.worklogRef, commitSha: result.commitSha }, attempt.id, now, { occupiesSlot: true })
      break
    }
    case 'verify_workflow':
      if (result.commitSha === workflow.integrationHead && result.planVersion === workflow.planVersion && result.passed === false) {
        verificationFailed(state, workflow, action, null, result, now); return
      }
      if (result.passed !== true || result.commitSha !== workflow.integrationHead
        || result.planVersion !== workflow.planVersion || result.zeroTests === true) throw new Error('Final verification does not cover current integration')
      workflow.finalVerification = copy(result)
      resolveActionRepair(state, workflow, action, result)
      for (const issue of Object.values(workflow.issues).filter(item => item.origin === 'action' && item.status === 'open'
        && item.closeWhen.actionKind === 'verify_workflow' && item.closeWhen.verifications?.length)) {
        if (issue.closeWhen.verifications.every(expected => workflow.plan.verifications.some(current => kernelDigest(current) === kernelDigest(expected)))) {
          issue.status = 'closed'; issue.evidence = { actionId: action.id, ref: result.evidenceRef ?? action.id, planVersion: workflow.planVersion }
        }
      }
      refreshExecutionObligations(state, workflow, now)
      if (Object.values(workflow.issues).some(issue => issue.status === 'open'
        && !(issue.origin === 'action' && issue.closeWhen.actionKind === 'deliver_workflow'))) {
        workflow.deliveryFailure = { actionId: action.id, reason: 'unresolved_obligations',
          issueIds: Object.values(workflow.issues).filter(issue => issue.status === 'open'
            && !(issue.origin === 'action' && issue.closeWhen.actionKind === 'deliver_workflow')).map(issue => issue.id) }
        notify(state, workflow, 'delivery_blocked', workflow.deliveryFailure, `obligations:${action.id}`, now)
        break
      }
      enqueue(state, workflow, 'deliver_workflow', { root: workflow.root, branch: workflow.baseBranch,
        expectedHead: workflow.registryBaseline?.commitSha ?? planningSources(workflow)?.codeBaseline?.sourceHead ?? workflow.baseCommit,
        sourcePaths: planningSources(workflow)?.codeBaseline?.sourcePaths ?? [],
        commitSha: workflow.integrationHead, planVersion: workflow.planVersion, verification: result }, `deliver:${workflow.planVersion}:${workflow.integrationHead}`, now, { locks: [`project:${workflow.root}:integration`] })
      break
    case 'deliver_workflow':
      if (result.blocked === true && result.executionSettled === true && result.evidenceRef) {
        workflow.deliveryFailure = { actionId: action.id, reason: result.reason, evidenceRef: result.evidenceRef }
        action.status = 'failed'; action.failure = result.reason; action.result = copy(result); action.nextWakeAt = null
        notify(state, workflow, 'delivery_blocked', workflow.deliveryFailure, `delivery:${action.id}`, now)
        touch(workflow, now); return
      }
      if (result.commitSha !== workflow.integrationHead || result.planVersion !== workflow.planVersion || result.userCheckoutUpdated !== true || !result.evidenceRef) throw new Error('Delivery has no current checkout integration evidence')
      workflow.delivery = { ...copy(workflow.finalVerification), ...copy(result) }
      for (const issue of Object.values(workflow.issues).filter(item => item.origin === 'action' && item.status === 'open' && item.closeWhen.actionKind === 'deliver_workflow')) {
        issue.status = 'closed'; issue.evidence = { actionId: action.id, ref: result.evidenceRef, commitSha: result.commitSha }
      }
      notify(state, workflow, 'completed', { commitSha: workflow.integrationHead }, `completed:${workflow.planVersion}`, now)
      break
    case 'stop_execution':
      if (attempt) settleStop(state, workflow, attempt, result, now)
      else {
        const target = actionOf(state, action.input.targetActionId)
        if (result.targetActionId !== target.id || result.executionSettled !== true || !result.terminationId) throw new Error('Action termination evidence mismatch')
        target.status = workflow.cancelRequested ? 'cancelled' : 'failed'
        target.quarantined = false; target.nextWakeAt = null; target.termination = copy(result)
        notify(state, workflow, 'execution_settled', { actionId: target.id, reason: target.failure,
          executionSettled: true, terminationId: result.terminationId,
          ...(result.evidenceRef ? { evidenceRef: result.evidenceRef } : {}) }, `settled:${target.id}`, now)
      }
      break
    case 'notify_main':
      if (result.rootSessionId !== workflow.rootSessionId || result.messageId !== action.id || result.persisted !== true) throw new Error('Notification lacks root-session durable receipt')
      break
    case 'request_decision':
      if (result.decisionId !== action.input.decisionId || result.requestDigest !== action.input.requestDigest || result.persisted !== true) throw new Error('Decision receipt mismatch')
      break
    case 'consult_owner': {
      if (!result.evidenceRef || !result.sessionId || result.executionSettled !== true) throw new Error('Public Owner decision requires independent native session evidence')
      if (action.input.context.planRevision !== workflow.planVersion || action.input.context.planDigest !== workflow.activation?.planDigest) throw new Error('Public Owner decision has stale plan sources')
      const logged = registerPublicOwnerChangeDecision(workflow.publicOwnerChangeLog, result.decision, action.input.context)
      workflow.publicOwnerChangeLog = logged.log
      for (const attempt of Object.values(workflow.attempts)) {
        const task = workflow.plan.tasks.find(task => task.id === attempt.taskId)
        if (task && publicRequestBlock(workflow, task)) stopAttempt(state, workflow, attempt, 'public_owner_review_required', now)
      }
      const decision = logged.decision
      const key = `${decision.requestId}:${decision.requestVersion}`
      workflow.publicOwnerDecisionSessions ??= {}
      workflow.publicOwnerDecisionSessions[key] = { phase: 'submission_observed', requestId: decision.requestId, requestVersion: decision.requestVersion,
        requestDigest: decision.requestDigest, decisionDigest: logged.decisionDigest, ownerId: decision.targetOwnerId,
        planRevision: workflow.planVersion, planDigest: workflow.activation.planDigest, decision,
        receipt: { decisionDigest: logged.decisionDigest, evidenceRef: result.evidenceRef }, sessionId: result.sessionId }
      refreshExecutionObligations(state, workflow, now)
      notify(state, workflow, 'public_owner_decision', { decision, decisionDigest: logged.decisionDigest, evidenceRef: result.evidenceRef }, action.id, now)
      if (decision.businessChange) requestDecision(state, workflow, { id: `decision-${action.id}`, kind: 'product',
        request: { question: decision.summary, detail: JSON.stringify(decision.businessChange), options: ['保留现有承诺', '接受建议变更'] },
        binding: { planVersion: workflow.planVersion, publicOwnerDecisionDigest: logged.decisionDigest } }, now)
      break
    }
    case 'change_registry': {
      if (typeof result.applied !== 'boolean' || result.proposalDigest !== action.input.proposal.digest
        || !result.evidenceRef || result.executionSettled !== true) throw new Error('Registry result does not bind the settled proposal')
      if (result.applied && (!result.commitSha || !result.registryDigest)) throw new Error('Applied Registry requires its commit and digest')
      workflow.registryResult = copy(result)
      if (workflow.kind !== 'registry') {
        workflow.registryHistory ??= []
        workflow.registryHistory.push({ actionId: action.id, result: copy(result) })
        if (result.applied) {
          if (action.input.planningSources) {
            workflow.planningSources = copy(action.input.planningSources)
            workflow.pendingPlanning = null
          }
          workflow.registryBaseline = { snapshotDigest: planningSources(workflow).snapshotDigest, commitSha: result.commitSha,
            registryDigest: result.registryDigest, evidenceRef: result.evidenceRef, branch: workflow.baseBranch }
          workflow.pendingRegistry = { actionId: action.retryRootId ?? action.id, phase: 'replan_required' }
        } else {
          for (const record of Object.values(workflow.tasks)) {
            const old = workflow.attempts[record.attemptId]
            if (old?.failure === 'registry_changed' && old.termination?.executionSettled && !old.quarantined) record.attemptId = null
          }
          workflow.pendingRegistry = null
        }
      }
      notify(state, workflow, result.applied ? 'registry_changed' : 'registry_rejected', result, action.id, now)
      break
    }
    default:
      required(result?.evidenceRef, 'action evidenceRef')
  }
  action.result = copy(result)
  action.status = 'succeeded'
  action.nextWakeAt = null
  resolveActionRepair(state, workflow, action, result)
  action.completedAt = now
  if (attempt) attempt.updatedAt = now
  touch(workflow, now)
}

export function createControlState({ catalogId, parallel = 3 } = {}) {
  required(catalogId, 'catalogId')
  integer(parallel, 'parallel', 1)
  return { contract: KERNEL_CONTRACT, catalogId, revision: 0, parallel, workflows: {}, actions: {} }
}
export function assertControlState(state) {
  if (!state || state.contract !== KERNEL_CONTRACT || !state.workflows || !state.actions) throw new Error('Unsupported or corrupt control state')
  integer(state.revision, 'control revision')
  integer(state.parallel, 'parallel', 1)
  const locks = new Set()
  for (const workflow of Object.values(state.workflows)) {
    if (workflow.id === undefined || !has(state.workflows, workflow.id) || !workflow.attempts || !workflow.tasks) throw new Error('Invalid workflow record')
    for (const task of Object.values(workflow.tasks)) {
      if (task.attemptId && !has(workflow.attempts, task.attemptId)) throw new Error('Task references a missing attempt')
    }
    for (const attempt of Object.values(workflow.attempts)) {
      if (!['dispatching', 'executing', 'sealing', 'verifying', 'integrating', 'stopping', ...TERMINAL].includes(attempt.phase) || !Array.isArray(attempt.locks) || typeof attempt.authority !== 'string') throw new Error('Invalid attempt record')
      if (TERMINAL.has(attempt.phase) && !attempt.quarantined) continue
      if (attempt.sourceAuthorityRetirement && (attempt.sourceAuthorityRetirement.scope !== 'project_write_authority'
        || attempt.sourceAuthorityRetirement.authority !== attempt.authority
        || !attempt.sourceAuthorityRetirement.commands?.length || !attempt.sourceAuthorityRetirement.evidenceRef
        || attempt.sourceAuthorityRetirement.retainedExecutionUnconfirmed !== true)) throw new Error('Invalid source authority retirement')
      for (const lock of heldAttemptLocks(workflow, attempt)) {
        if (locks.has(lock)) throw new Error(`Duplicate active resource: ${lock}`)
        locks.add(lock)
      }
    }
  }
  for (const action of Object.values(state.actions)) {
    // Old operation-only runs are retained as history, never executable by this kernel.
    const legacySettledOperation = action.kind === 'operation'
      && state.workflows[action.workflowId]?.kind === 'operation'
      && state.workflows[action.workflowId].operationResult != null
      && TERMINAL.has(action.status) && !action.quarantined && !action.attemptId
    if (!(ACTION_KINDS.includes(action.kind) || legacySettledOperation) || !has(state.workflows, action.workflowId) || !Array.isArray(action.locks)
      || !['pending', 'running', 'uncertain', 'waiting', ...TERMINAL].includes(action.status) || action.inputDigest !== kernelDigest(action.input)) throw new Error('Invalid action record')
    if (action.attemptId && !has(state.workflows[action.workflowId].attempts, action.attemptId)) throw new Error('Action references a missing attempt')
    if (!action.attemptId && action.admitted && (!TERMINAL.has(action.status) || action.quarantined)) for (const lock of action.locks) {
      if (locks.has(lock)) throw new Error(`Duplicate active resource: ${lock}`)
      locks.add(lock)
    }
  }
  if (activeSlots(state) > state.parallel) throw new Error('Active capacity exceeds catalog limit')
  return state
}

/** The only production decision path. Callers supply observed facts, never a replacement state. */
export function transition(previous, event, now = Date.now()) {
  assertControlState(previous)
  integer(now, 'now')
  now = Math.max(now, previous.lastObservedAt ?? now)
  required(event?.type, 'event.type')
  const state = copy(previous)
  let result = null
  const workflow = event.workflowId ? wf(state, event.workflowId) : undefined
  switch (event.type) {
    case 'registry.request': {
      const id = safeId(event.id), root = required(event.root, 'root'), rootSessionId = required(event.rootSessionId, 'rootSessionId')
      const input = { root, rootSessionId, proposal: event.proposal, beforeExists: event.beforeExists, baseline: event.baseline,
        ...(event.planningSources ? { planningSources: copy(event.planningSources) } : {}) }
      required(event.proposal?.digest, 'Registry proposal digest')
      if (state.workflows[id]) {
        if (state.workflows[id].registryRequestDigest !== kernelDigest(input)) throw new Error('Registry request identity conflict')
        result = id; break
      }
      if (workflow) {
        const replay = state.actions[`act-${kernelDigest([workflow.id, 'change_registry', id]).slice(0, 40)}`]
        if (replay) {
          if (kernelDigest(replay.input) !== kernelDigest(input)) throw new Error('Registry request identity conflict')
          result = workflow.id; break
        }
        if (workflow.root !== root || workflow.rootSessionId !== rootSessionId || !workflow.plan || workflow.delivery
          || workflow.cancelRequested || workflow.pendingActivation || workflow.pendingPlanning && !event.planningSources || workflow.pendingRegistry) throw new Error('Active Registry governance requires the current settled planning version')
        if (Object.values(state.actions).some(action => action.workflowId === workflow.id && !action.attemptId
          && !['notify_main', 'request_decision', 'stop_execution', 'summarize_memory'].includes(action.kind)
          && (!TERMINAL.has(action.status) || action.quarantined))) throw new Error('Settle planning and integration effects before changing Registry')
        if (Object.values(state.workflows).some(item => item.id !== workflow.id && item.root === root && reservesProject(state, item))) throw new Error('Another workflow reserves this project')
        if (event.planningSources) {
          const previous = planningSources(workflow), source = event.planningSources
          required(source.checkpointId, 'Registry checkpointId'); required(source.snapshotDigest, 'Registry snapshotDigest')
          required(source.sourceDigest, 'Registry sourceDigest')
          const expectedHead = previous.codeBaseline?.sourceHead ?? workflow.baseCommit
          if (!source.codeBaseline || event.baseline.head !== source.codeBaseline.checkpointCommit
            || event.baseline.ref !== `refs/heads/${workflow.baseBranch}`
            || source.codeBaseline.branch !== workflow.baseBranch
            || source.snapshotDigest !== previous.snapshotDigest && source.codeBaseline.sourceHead !== expectedHead) throw new Error('Registry pending source must bind the exact checkpoint and source lineage')
        }
        workflow.registryRequestDigest = kernelDigest(input)
        const action = enqueue(state, workflow, 'change_registry', input, id, now, { locks: [`project:${root}:registry`, `project:${root}:integration`] })
        workflow.pendingRegistry = { actionId: action.id, phase: 'settling' }
        for (const attempt of Object.values(workflow.attempts)) stopAttempt(state, workflow, attempt, 'registry_changed', now)
        result = workflow.id; touch(workflow, now); break
      }
      if (Object.values(state.workflows).some(item => item.root === root
        && reservesProject(state, item))) throw new Error('Registry change requires settled project work; revise active work before changing ownership')
      const record = { id, kind: 'registry', root, rootSessionId, request: event.proposal.reason, registryRequestDigest: kernelDigest(input),
        revision: 0, createdAt: now, updatedAt: now, policy: { ...DEFAULT_POLICY }, plan: null, planVersion: 0,
        tasks: {}, attempts: {}, issues: {}, decisions: {}, notices: {}, recoveryUsed: 0, cancelRequested: false, activation: null,
        baseCommit: null, baseBranch: null, integrationHead: null, integrationRef: null, delivery: null }
      state.workflows[id] = record
      enqueue(state, record, 'change_registry', input, 'initial', now, { locks: [`project:${root}:registry`] })
      result = id; break
    }
    case 'workflow.create': {
      const id = safeId(event.id)
      const identity = { root: required(event.root, 'root'), rootSessionId: required(event.rootSessionId, 'rootSessionId'), request: required(event.request, 'request') }
      if (has(state.workflows, id)) {
        const old = state.workflows[id]
        if (canonical(identity) !== canonical({ root: old.root, rootSessionId: old.rootSessionId, request: old.request })) throw new Error('Workflow identity conflict')
        result = id; break
      }
      if (event.exclusiveRoot && Object.values(state.workflows).some(workflow => workflow.root === identity.root
        && reservesProject(state, workflow))) throw new Error('Project already has an active or unresolved workflow')
      const policy = { ...DEFAULT_POLICY, ...event.policy }
      for (const [name, value] of Object.entries(policy)) integer(value, name, 1)
      state.workflows[id] = { id, ...identity, revision: 0, createdAt: now, updatedAt: now, policy,
        integrationRef: event.integrationRef ?? null, baseBranch: event.baseBranch ?? null, baseCommit: event.baseCommit,
        plan: null, planVersion: 0, tasks: {}, attempts: {}, issues: {}, decisions: {}, notices: {},
        recoveryUsed: 0, cancelRequested: false, activation: null, planningSources: event.planning?.sources ? copy(event.planning.sources) : null,
        integrationHead: required(event.baseCommit, 'baseCommit'), delivery: null }
      if (event.planning) {
        if (event.integrationRef) enqueue(state, state.workflows[id], 'prepare_workflow', { integrationRef: event.integrationRef, baseCommit: event.baseCommit, planning: event.planning }, 'initial', now, { locks: [`project:${identity.root}:integration`] })
        else enqueue(state, state.workflows[id], 'plan', event.planning, 'initial', now, { occupiesSlot: true })
      }
      result = id
      break
    }
    case 'plan.activate': {
      result = activatePlan(state, workflow, event, now)
      break
    }
    case 'plan.propose': {
      result = proposeActivation(state, workflow, event, now)
      break
    }
    case 'planning.request': {
      const sources = planningSources(workflow)
      if (workflow.cancelRequested || workflow.delivery || !sources) throw new Error('Workflow cannot be replanned')
      if (event.input.parentVersion !== workflow.planVersion) throw new Error('Replan source or parent version changed')
      const authoringCandidate = planningAuthoringCandidate(state, workflow)
      if (authoringCandidate && (event.input.previousPlanDigest !== authoringCandidate.planDigest
        || kernelDigest(event.input.previousPlan ?? null) !== authoringCandidate.planDigest
        || event.input.previousPlanActionId !== undefined && event.input.previousPlanActionId !== authoringCandidate.actionId)) {
        throw new Error('Replan authoring parent changed')
      }
      if (!authoringCandidate && event.input.previousPlanActionId !== undefined) throw new Error('Replan authoring parent changed')
      if (event.input.snapshotDigest !== sources.snapshotDigest
        && (event.input.previousSnapshotDigest !== sources.snapshotDigest || !event.input.sources.codeBaseline
          || event.input.sources.codeBaseline.sourceHead !== (sources.codeBaseline?.sourceHead ?? workflow.baseCommit))) throw new Error('Replan source or parent version changed')
      if (workflow.pendingRegistry && workflow.pendingRegistry.phase !== 'replan_required') throw new Error('Registry governance is still unsettled')
      if (event.input.sources?.executionBaseline && kernelDigest(event.input.sources.executionBaseline) !== kernelDigest(workflow.registryBaseline)) throw new Error('Unbound Registry execution baseline')
      if (event.input.sources?.registryBaseline && kernelDigest(event.input.sources.registryBaseline) !== kernelDigest(workflow.registryBaseline)) throw new Error('Unbound Registry change evidence')
      required(event.input.revisionReason, 'replan reason')
      const key = `revision-${kernelDigest([workflow.planVersion, event.input])}`
      const prior = state.actions[`act-${kernelDigest([workflow.id, 'plan', key]).slice(0, 40)}`]
      if (prior) { result = prior.id; break }
      const planningActions = Object.values(state.actions).filter(action => action.workflowId === workflow.id
        && ['prepare_workflow', 'plan', 'review_plan', 'prepare_revision'].includes(action.kind))
      if (planningActions.some(action => !TERMINAL.has(action.status) || action.quarantined)) throw new Error('A planning action is still unsettled')
      if (planningActions.some(action => action.kind === 'prepare_workflow' && action.status !== 'succeeded' && !action.resolution)) throw new Error('Initial Workflow preparation must be reconciled before replanning')
      if (workflow.pendingActivation) {
        const preparation = planningActions.filter(action => action.kind === 'prepare_revision' && !action.resolution)
        if (!preparation.length || preparation.some(action => action.status !== 'failed'
          || !(action.termination?.executionSettled || action.result?.executionSettled))) throw new Error('Pending activation must finish stopping and reconcile its preparation before replanning')
        if (event.integrationHead !== workflow.integrationHead) throw new Error('Replanning requires the observed unchanged integration reference')
        workflow.retiredProposals ??= []
        workflow.retiredProposals.push({ proposal: copy(workflow.pendingActivation), reason: event.input.revisionReason,
          replacementSource: event.input.snapshotDigest, retiredAt: now })
        workflow.pendingActivation = null
        for (const action of preparation) action.resolution = { kind: 'source_superseded', snapshotDigest: event.input.snapshotDigest }
      }
      if (Object.values(state.actions).some(action => action.workflowId === workflow.id && ['verify_workflow', 'deliver_workflow'].includes(action.kind)
        && (!TERMINAL.has(action.status) || action.quarantined))) throw new Error('Final verification or delivery must settle before replanning')
      const issueId = workflow.planningIssueId ??= `issue-${kernelDigest([workflow.id, 'planning']).slice(0, 40)}`
      const issue = workflow.issues[issueId] ??= { id: issueId, sourceId: sources.sourceDigest ?? sources.snapshotDigest,
        closeWhen: 'bound plan review passes with source evidence', status: 'open', used: 0, blocksActivation: false, reviewHistory: [] }
      const boundary = event.input.revisionBoundary
      if (boundary) for (const obligation of Object.values(workflow.issues).filter(item => item.status === 'open' && item.origin === 'plan_review')) {
        if ((obligation.targetTaskIds ?? []).some(id => !boundary.taskIds.includes(id))
          || (obligation.targetVerificationIds ?? []).some(id => !boundary.verificationIds.includes(id))) {
          throw new Error('Planning repair requires the complete task and verification revision boundary')
        }
      }
      const chargedIssues = planningRecoveryIssues(workflow, issue)
      chargeRecovery(workflow, chargedIssues, 'Replanning recovery')
      issue.status = 'open'
      workflow.planningFailure = null
      result = enqueue(state, workflow, 'plan', { ...event.input, issueId }, key, now, { occupiesSlot: true }).id
      workflow.pendingPlanning = { actionId: result, inputDigest: kernelDigest(event.input) }
      workflow.planningSources = copy(event.input.sources ?? sources)
      touch(workflow, now)
      break
    }
    case 'public_owner.request': {
      if (workflow.cancelRequested || !workflow.plan || workflow.pendingRegistry) throw new Error('Workflow cannot request a public Owner decision')
      const context = normalizePublicOwnerContext(event.context)
      if (context.workflowId !== workflow.id || context.planRevision !== workflow.planVersion || context.planDigest !== workflow.activation?.planDigest) throw new Error('Public Owner request has stale sources')
      if (kernelDigest([...context.owners].sort()) !== kernelDigest(workflow.plan.owners.map(owner => owner.id).sort())) throw new Error('Public Owner context does not cover the active Owner set')
      const request = normalizePublicOwnerChangeRequest(event.request, context)
      const logged = registerPublicOwnerChangeRequest(workflow.publicOwnerChangeLog ?? createPublicOwnerChangeLog(), request, context)
      const sourceId = kernelDigest({ targetOwnerId: request.targetOwnerId, contractId: request.baseline.contract.id,
        tickets: request.source.tickets.map(item => item.id).sort(), acceptanceCriteria: [...request.source.acceptanceCriteria].sort() })
      const issueId = `issue-${kernelDigest([workflow.id, 'public_owner', sourceId]).slice(0, 40)}`
      const issue = workflow.issues[issueId] ??= { id: issueId, sourceId, origin: 'public_owner', status: 'open', used: 0,
        requestId: request.requestId, requests: [], closeWhen: { kind: 'public_owner_resolution' }, blocksActivation: false }
      if (issue.requestId !== request.requestId) throw new Error('Reuse the original public Owner request identity and its bounded revision history')
      if (logged.outcome !== 'replayed') {
        const evidenceDigest = kernelDigest({ expectedBehavior: request.expectedBehavior, actualGap: request.actualGap, evidenceRefs: request.evidenceRefs,
          suggestion: request.suggestion, consumers: context.consumers, evidenceInventory: context.evidenceRefs, contracts: context.contracts,
          source: request.source })
        if (issue.requests.some(item => item.evidenceDigest === evidenceDigest)) throw new Error('Public Owner request repeats the same facts without progress')
        if (issue.requests.length) {
          chargeRecovery(workflow, [issue], 'Public Owner recovery')
        }
        issue.requests.push({ requestDigest: logged.requestDigest, evidenceDigest }); issue.status = 'open'
        issue.latestRequestKey = `${request.requestId}:${request.requestVersion}`
      }
      workflow.publicOwnerChangeLog = logged.log
      for (const attempt of Object.values(workflow.attempts)) {
        const task = workflow.plan.tasks.find(task => task.id === attempt.taskId)
        if (task && publicRequestBlock(workflow, task)) stopAttempt(state, workflow, attempt, 'public_owner_review_required', now)
      }
      for (const old of Object.values(state.actions).filter(action => action.workflowId === workflow.id && action.kind === 'consult_owner'
        && action.input.request.requestId === request.requestId && action.input.request.requestVersion < request.requestVersion && !TERMINAL.has(action.status))) {
        if (old.status === 'pending') { old.status = 'cancelled'; old.nextWakeAt = null }
        else stopAction(state, old, 'public_request_superseded', now)
      }
      result = enqueue(state, workflow, 'consult_owner', { context, request, requestDigest: logged.requestDigest, root: workflow.root },
        logged.requestDigest, now, { occupiesSlot: true, locks: lockKeys(workflow, request.targetOwnerId) }).id
      break
    }
    case 'action.enqueue': {
      if (!['plan', 'review_plan', 'consult_owner', 'notify_main', 'summarize_memory', 'request_decision'].includes(event.kind)) throw new Error('Pipeline actions must originate in the engine')
      const key = required(event.key, 'action key')
      const existing = state.actions[`act-${kernelDigest([workflow.id, event.kind, key]).slice(0, 40)}`]
      if (existing) {
        if (existing.inputDigest !== kernelDigest(event.input)) throw new Error('Action identity reused with different input')
        result = existing.id; break
      }
      if (workflow.cancelRequested) throw new Error('Cancelled workflow cannot enqueue work')
      if (['plan', 'review_plan'].includes(event.kind) && !planningSources(workflow) && event.input.sources) workflow.planningSources = copy(event.input.sources)
      const locks = lockKeys(workflow, event.ownerId, event.resources)
      const occupiesSlot = ['plan', 'review_plan', 'consult_owner'].includes(event.kind)
      result = enqueue(state, workflow, event.kind, event.input, required(event.key, 'action key'), now, { locks, occupiesSlot }).id
      break
    }
    case 'action.retry': {
      const prior = actionOf(state, event.actionId)
      const candidateVerification = prior.kind === 'verify_candidate'
      if (prior.workflowId !== workflow.id || prior.attemptId && !candidateVerification
        || !['prepare_workflow', 'prepare_revision', 'plan', 'review_plan', 'verify_candidate', 'verify_workflow', 'deliver_workflow', 'change_registry'].includes(prior.kind)) throw new Error('Use task repair or reviewed replanning for this action kind')
      required(event.decisionRef, 'action repair decisionRef'); required(event.reason, 'action repair reason')
      const replay = Object.values(state.actions).find(action => action.workflowId === workflow.id && action.retryDecisionRef === event.decisionRef)
      if (replay) {
        if (replay.retryOf !== prior.id || replay.retryReason !== event.reason) throw new Error('Action repair identity conflict')
        result = replay.id; break
      }
      if (workflow.cancelRequested || workflow.delivery) throw new Error('Workflow cannot retry an action')
      // Older receipts could accept a positive review without its closure claims.
      // Re-review that exact unactivated DAG through the normal bounded retry path.
      const incompleteReview = prior.kind === 'review_plan' && prior.status === 'succeeded'
        && prior.result?.review?.status === 'passed' && Boolean(workflow.planningFailure)
        && activationBlockers(state, workflow).some(issue => issue.origin === 'plan_review')
      if (prior.status !== 'failed' && !incompleteReview || prior.quarantined || !(prior.termination?.executionSettled || prior.result?.executionSettled)) throw new Error('Action has no confirmed termination evidence')
      if (prior.resolution) throw new Error('Action already has a successor or has been superseded; inspect the current action')
      if (!retryInputCurrent(state, workflow, prior)) throw new Error('Action repair source is no longer current')
      const attempt = candidateVerification ? attemptOf(state, prior) : null
      if (candidateVerification && (!attempt || attempt.phase !== 'failed' || attempt.quarantined || !isSettledTechnicalVerification(prior.result))) {
        throw new Error('Candidate verification is not a settled technical execution failure')
      }
      if (candidateVerification && attemptDeadlineExpired(attempt, now)) {
        throw new Error('Candidate verification attempt deadline expired; use workflow_retry_task to preserve its candidate and create a fresh attempt')
      }
      if (['plan', 'review_plan', 'prepare_revision'].includes(prior.kind) && Object.values(state.actions).some(action => action.workflowId === workflow.id
        && ['plan', 'review_plan', 'prepare_revision'].includes(action.kind) && (!TERMINAL.has(action.status) || action.quarantined))) throw new Error('A planning action is still unsettled')
      const rootId = prior.retryRootId ?? prior.id
      const issueId = `issue-${kernelDigest([workflow.id, 'action', rootId]).slice(0, 40)}`
      const issue = workflow.issues[issueId] ??= { id: issueId, origin: 'action', sourceId: rootId, used: 0, status: 'open', blocksActivation: false,
        closeWhen: { actionKind: prior.kind, inputDigest: prior.inputDigest,
          ...(prior.kind === 'verify_workflow' ? { verifications: copy(prior.input.plan.verifications) } : {}) } }
      const chargedIssues = ['plan', 'review_plan', 'prepare_revision'].includes(prior.kind) ? planningRecoveryIssues(workflow, issue) : [issue]
      chargeRecovery(workflow, chargedIssues, 'Action recovery')
      const nextInput = ['plan', 'review_plan'].includes(prior.kind) ? { ...prior.input, repairReason: event.reason }
        : candidateVerification && prior.input.taskPackage === undefined
          ? { ...prior.input, taskPackage: attemptDispatchContract(state, workflow, attempt).taskPackage }
          : prior.input
      const next = enqueue(state, workflow, prior.kind, nextInput, `repair:${rootId}:${issue.used}`, now,
        { attemptId: candidateVerification ? attempt.id : null, locks: prior.locks, occupiesSlot: prior.occupiesSlot, deadlineMs: prior.deadlineMs })
      Object.assign(next, { retryOf: prior.id, retryRootId: rootId, retryIssueId: issueId, retryDecisionRef: event.decisionRef, retryReason: event.reason })
      prior.resolution = { kind: 'retry_requested', actionId: next.id, decisionRef: event.decisionRef }
      if (candidateVerification) {
        attempt.phase = 'verifying'
        attempt.failure = null
        attempt.verification = null
        attempt.updatedAt = now
      }
      if (prior.kind === 'verify_workflow' || prior.kind === 'deliver_workflow') workflow.deliveryFailure = null
      if (prior.kind === 'plan' || prior.kind === 'review_plan') workflow.planningFailure = null
      result = next.id; touch(workflow, now)
      break
    }
    case 'drive': {
      for (const action of Object.values(state.actions).filter(action => action.status === 'pending' && !action.attemptId)) admitAction(state, action, now)
      for (const current of Object.values(state.workflows)) {
        // Re-evaluate evidence-derived closures after restart without rewriting
        // the historical feedback or verification actions that prove them.
        if (refreshExecutionObligations(state, current, now)) touch(current, now)
        for (const attempt of Object.values(current.attempts)) {
          if (!TERMINAL.has(attempt.phase) && attempt.phase !== 'stopping' && !attempt.waitingDecision && now >= attempt.deadlineAt) stopAttempt(state, current, attempt, 'hard_deadline', now)
          if (attempt.phase === 'stopping' && now >= attempt.stopDeadlineAt) {
            attempt.phase = 'failed'; attempt.quarantined = true
            attempt.failure = 'termination_unconfirmed'
            notify(state, current, 'technical_failure', { attemptId: attempt.id, reason: attempt.failure, resourceRetained: true }, `termination:${attempt.id}`, now)
            touch(current, now)
          }
        }
        for (const action of Object.values(state.actions).filter(action => action.workflowId === current.id && !action.attemptId && action.kind !== 'stop_execution')) {
          if (action.admitted && !['request_decision', 'notify_main'].includes(action.kind) && !action.waitingDecision && !TERMINAL.has(action.status) && now >= action.deadlineAt) stopAction(state, action, 'hard_deadline', now)
          if (action.stopRequested && !action.quarantined && !TERMINAL.has(action.status) && now >= action.stopDeadlineAt) {
            action.quarantined = true; action.status = 'failed'; action.nextWakeAt = null
            notify(state, current, 'termination_unconfirmed', { actionId: action.id, resourceRetained: true }, `termination:${action.id}`, now)
            touch(current, now)
          }
        }
        if (current.pendingActivation && !current.cancelRequested) {
          const settled = current.pendingActivation.affected.every(id => {
            const attempt = current.attempts[current.tasks[id]?.attemptId]
            return !attempt || TERMINAL.has(attempt.phase) && !attempt.quarantined
          })
          if (settled) activateSettledProposal(state, current, current.pendingActivation, now)
        }
        if (!current.plan || current.cancelRequested || current.delivery || current.pendingRegistry) continue
        for (const task of current.plan.tasks) {
          if (task.children || current.pendingActivation?.affected.includes(task.id) || current.tasks[task.id].attemptId || !dependenciesReady(current, task.id) || publicRequestBlock(current, task)) continue
          if (activeSlots(state) >= state.parallel || activeSlots(state, current.id) >= current.policy.parallel) break
          if (lockKeys(current, task.ownerId, task.resources).some(lock => occupied(state).has(lock))) continue
          startAttempt(state, current, task, now)
        }
        const leaves = current.plan.tasks.filter(task => !task.children)
        if (!current.pendingActivation && !current.pendingPlanning && leaves.length && leaves.every(task => outcome(current.tasks[task.id], current) === 'succeeded')) {
          enqueue(state, current, 'verify_workflow', { planVersion: current.planVersion, plan: current.plan,
            commitSha: current.integrationHead, sources: current.activation.sources }, `final:${current.planVersion}:${current.integrationHead}`, now, { occupiesSlot: true, locks: [`project:${current.root}:integration`] })
        }
      }
      break
    }
    case 'action.claim': {
      const action = actionOf(state, event.actionId)
      if (retiredAttemptActionFenced(state, action)) throw Object.assign(new Error('Retired attempt action cannot be executed or observed'), { code: 'RETIRED_ATTEMPT_ACTION' })
      if (actionReentryFenced(state, action)) throw Object.assign(new Error('Stopped action cannot be executed or observed; settlement belongs to stop_execution'), { code: 'STOPPED_ACTION' })
      if (attemptOf(state, action)?.sourceAuthorityRetirement && action.kind === 'stop_execution') checkAttempt(state, action)
      const mode = event.mode ?? 'execute'
      required(event.hostId, 'hostId'); required(event.token, 'claim token')
      if (mode === 'execute') {
        if (action.status !== 'pending' || action.nextWakeAt > now) throw new Error('Action is not executable')
        checkAttempt(state, action)
        if (!admitAction(state, action, now)) throw new Error('Action resource is busy')
        if (action.locks.length && Object.values(state.actions).some(other => other.id !== action.id && ['running', 'uncertain', 'waiting'].includes(other.status) && other.locks.some(lock => action.locks.includes(lock)))) throw new Error('Action resource is busy')
        if (['integrate_candidate', 'prepare_revision'].includes(action.kind)) {
          action.input.expectedBase = wf(state, action.workflowId).integrationHead
          action.inputDigest = kernelDigest(action.input)
        }
        action.execution = { hostId: event.hostId, token: event.token, startedAt: now }
        action.status = 'running'
      } else if (mode === 'observe') {
        if (!['running', 'uncertain', 'waiting'].includes(action.status) || action.nextWakeAt > now) throw new Error('Action is not due for observation')
        if (action.observation && action.observation.expiresAt > now) throw new Error('Action is already observed')
        action.observation = { hostId: event.hostId, token: event.token, expiresAt: now + MAX_OBSERVE_INTERVAL }
      } else throw new Error('Invalid claim mode')
      action.nextWakeAt = now + OBSERVE_INTERVAL
      result = copy(action)
      break
    }
    case 'action.deferred': {
      const action = actionOf(state, event.actionId)
      if (action.status !== 'running' || action.execution?.token !== event.token || action.evidence) throw new Error('Dispatched action cannot be deferred')
      if (event.notDispatched !== true) throw new Error('Deferral requires no-dispatch evidence')
      action.status = 'pending'; action.execution = null; action.nextWakeAt = now + (event.reason === 'root_session_offline' ? ROOT_SESSION_OFFLINE_INTERVAL : MAX_OBSERVE_INTERVAL)
      action.waitingReason = required(event.reason, 'deferral reason')
      break
    }
    case 'action.started': {
      const action = actionOf(state, event.actionId)
      if (action.execution?.token !== event.token || action.status !== 'running') throw new Error('Invalid execution claim')
      checkAttempt(state, action)
      required(event.evidence?.handleId, 'external handleId')
      if (action.evidence && kernelDigest(action.evidence) !== kernelDigest(event.evidence)) throw new Error('External execution identity changed')
      action.evidence = copy(event.evidence)
      const attempt = attemptOf(state, action)
      if (attempt && action.kind === 'execute_owner') { attempt.phase = 'executing'; attempt.sessionId = event.evidence.sessionId }
      break
    }
    case 'action.result': {
      const action = actionOf(state, event.actionId)
      if (action.status === 'succeeded') {
        if (kernelDigest(action.result) !== kernelDigest(event.result)) throw new Error('Conflicting duplicate result')
        break
      }
      if (TERMINAL.has(action.status) || action.stopRequested) throw new Error('Stopped action cannot publish results')
      if (action.execution?.token !== event.token && action.observation?.token !== event.token) throw new Error('Result has no current claim')
      checkAttempt(state, action)
      finishAction(state, action, event.result, now)
      break
    }
    case 'action.observe': {
      const action = actionOf(state, event.actionId)
      if (action.observation?.token !== event.token) throw new Error('Observation has no claim')
      action.observation = null
      action.observationCount++
      if (event.fact === 'not_started') {
        if (event.proof?.notDispatched !== true || !(event.proof?.hostStopped === true || event.proof?.executionQuiescent === true)) throw new Error('Missing no-dispatch evidence')
        action.status = 'pending'; action.execution = null; action.nextWakeAt = now
      } else if (event.fact === 'running') {
        action.nextWakeAt = now + Math.min(MAX_OBSERVE_INTERVAL, OBSERVE_INTERVAL * 2 ** Math.min(action.observationCount, 3))
      } else if (event.fact === 'root_session_offline' && action.kind === 'notify_main') {
        action.waitingReason = 'root_session_offline'
        action.nextWakeAt = now + ROOT_SESSION_OFFLINE_INTERVAL
      } else if (event.fact === 'unknown') {
        action.status = 'uncertain'
        action.nextWakeAt = now + MAX_OBSERVE_INTERVAL
        const attempt = attemptOf(state, action)
        if (attempt && action.kind !== 'stop_execution') stopAttempt(state, wf(state, action.workflowId), attempt, 'execution_identity_unconfirmed', now)
        else if (!attempt && action.kind !== 'stop_execution' && !['request_decision', 'notify_main'].includes(action.kind)) stopAction(state, action, 'execution_identity_unconfirmed', now)
        else if (!attempt && action.kind !== 'stop_execution' && now >= action.deadlineAt) {
          action.status = 'failed'; action.nextWakeAt = null; action.failure = 'execution_identity_unconfirmed'
          if (action.kind !== 'notify_main') notify(state, wf(state, action.workflowId), 'technical_failure', { actionId: action.id, reason: action.failure }, `uncertain:${action.id}`, now)
        }
      } else throw new Error('Unsupported observation')
      break
    }
    case 'action.failed': {
      const action = actionOf(state, event.actionId)
      if (action.execution?.token !== event.token && action.observation?.token !== event.token) throw new Error('Failure has no claim')
      if (TERMINAL.has(action.status)) break
      action.failure = required(event.reason, 'failure reason')
      const current = wf(state, action.workflowId)
      const attempt = attemptOf(state, action)
      if (event.termination !== undefined) {
        if (event.termination.failed !== true || event.termination.reason !== action.failure
          || event.termination.executionSettled !== true || !isManagedRangeStopped(event.termination)
          || !event.termination.evidenceRef) throw new Error('Settled action failure lacks bound termination evidence')
        action.status = 'failed'; action.nextWakeAt = null; action.quarantined = false
        action.termination = copy(event.termination); action.completedAt = now
        if (attempt) stopAttempt(state, current, attempt, action.failure, now)
        if (!['notify_main', 'stop_execution'].includes(action.kind)) notify(state, current, 'execution_settled',
          { actionId: action.id, reason: action.failure, executionSettled: true,
            terminationId: event.termination.terminationId, evidenceRef: event.termination.evidenceRef },
          `settled:${action.id}`, now)
        touch(current, now)
        break
      }
      action.status = 'uncertain'; action.nextWakeAt = now + MAX_OBSERVE_INTERVAL
      // Reconcile the effect's durable intent/receipt before invalidating a
      // potentially completed submission, verification or Git integration.
      // The existing execution deadline still bounds this observation.
      if (!['notify_main', 'stop_execution'].includes(action.kind)) notify(state, current, 'execution_failure', { actionId: action.id, reason: action.failure }, `failure:${action.id}`, now)
      touch(current, now)
      break
    }
    case 'owner.submit': {
      const attempt = workflow.attempts[event.attemptId]
      if (!attempt || attempt.authority !== event.authority || workflow.tasks[attempt.taskId]?.attemptId !== attempt.id) throw new Error('Owner submit authority is stale')
      const submission = { id: `sub-${attempt.id}`, report: copy(event.report), manifestDigest: required(event.manifestDigest, 'manifestDigest'), artifact: required(event.artifact, 'submission artifact') }
      if (attempt.submission) {
        if (kernelDigest(attempt.submission) !== kernelDigest(submission)) throw new Error('Conflicting duplicate submission')
      } else {
        if (attempt.phase !== 'executing') throw new Error('Owner cannot submit in current phase')
        attempt.submission = submission
        attempt.writeFrozen = true
        touch(workflow, now)
      }
      result = { contract: 'DSH_OWNER_SUBMISSION_V2', submissionId: submission.id, attemptId: attempt.id, status: 'accepted', accepted: true }
      break
    }
    case 'attempt.stop': {
      const attempt = workflow.attempts[event.attemptId]
      if (!attempt) throw new Error('Unknown attempt')
      stopAttempt(state, workflow, attempt, required(event.reason, 'stop reason'), now)
      break
    }
    case 'issue.register': {
      const id = safeId(event.issue.id)
      const definition = { sourceId: required(event.issue.sourceId, 'issue sourceId'), closeWhen: event.issue.closeWhen, blocksActivation: event.issue.blocksActivation === true }
      if (has(workflow.issues, id)) {
        if (kernelDigest(workflow.issues[id].definition) !== kernelDigest(definition)) throw new Error('Issue identity conflict')
      } else { workflow.issues[id] = { id, definition, ...definition, status: 'open', used: 0 }; touch(workflow, now) }
      break
    }
    case 'issue.close': {
      const issue = workflow.issues[event.issueId]
      if (!issue) throw new Error('Unknown issue')
      required(event.evidence?.ref, 'closure evidence')
      if (event.evidence.sourceId !== issue.sourceId || kernelDigest(event.evidence.closeWhen) !== kernelDigest(issue.closeWhen)) throw new Error('Closure evidence does not match obligation')
      if (issue.status === 'open') { issue.status = 'closed'; issue.evidence = copy(event.evidence); touch(workflow, now) }
      break
    }
    case 'attempt.retire_isolated': {
      const attempt = workflow.attempts[event.attemptId], proof = event.proof
      if (attempt?.sourceAuthorityRetirement) { result = copy(attempt.sourceAuthorityRetirement); break }
      if (workflow.cancelRequested || workflow.pendingActivation || workflow.pendingRegistry
        || !attempt?.quarantined || attempt.phase !== 'failed' || workflow.tasks[attempt.taskId]?.attemptId !== attempt.id
        || !attempt.writeFrozen || !attempt.submission || attempt.integration
        || attempt.writerTermination?.executionSettled !== true || attempt.writerTermination.sourceWritesClosed !== true || !attempt.writerTermination.terminationId
        || attempt.writerTermination.authority !== attempt.authority || !attempt.candidate
        || attempt.candidate.authority !== attempt.authority) throw new Error('Attempt source authority is not safely closed')
      if (proof?.contract !== 'DSH_ISOLATED_ATTEMPT_V1' || proof.scope !== 'project_write_authority'
        || proof.workflowId !== workflow.id || proof.attemptId !== attempt.id || proof.authority !== attempt.authority
        || proof.candidateCommit !== attempt.candidate.commitSha || proof.retainedExecutionUnconfirmed !== true
        || proof.sharedTempEffectsUnconfirmed !== true || !proof.protectedRoots?.includes(workflow.root)
        || !/^[a-f0-9]{64}$/.test(proof.stateBinding ?? '')
        || !Array.isArray(proof.commands) || !proof.commands.length) throw new Error('Isolation proof is incomplete')
      if (proof.stateBinding !== retirementStateBinding(state, workflow.id, attempt.id)) {
        throw Object.assign(new Error('Isolation proof is stale: source or execution facts changed; collect a fresh proof'), { code: 'ISOLATION_PROOF_STALE' })
      }
      const unknown = Object.values(state.actions).filter(action => action.attemptId === attempt.id
        && (!TERMINAL.has(action.status) || action.quarantined))
      if (unknown.some(action => !['verify_candidate', 'stop_execution'].includes(action.kind))
        || !unknown.some(action => action.kind === 'verify_candidate')
        || unknown.some(action => action.kind === 'verify_candidate' && (!action.stopRequested
          || !proof.commands.some(command => command.actionId === action.id)))) throw new Error('Isolation proof omits an unknown effect')
      for (const command of proof.commands) {
        const action = unknown.find(action => action.id === command.actionId)
        if (!action || action.kind !== 'verify_candidate' || command.attemptId !== attempt.id || command.authority !== attempt.authority
          || command.mode !== 'workspace-write' || !command.cwd?.startsWith('/') || !command.commandId
          || !command.intentRef || !/^[a-f0-9]{64}$/.test(command.bindingDigest)) throw new Error('Invalid isolated command binding')
      }
      attempt.sourceAuthorityRetirement = { ...copy(proof), evidenceRef: required(event.evidenceRef, 'isolation evidenceRef'), recordedAt: now }
      result = copy(attempt.sourceAuthorityRetirement)
      touch(workflow, now)
      break
    }
    case 'task.retry': {
      if (workflow.pendingRegistry) throw new Error('Registry change must activate a reviewed plan before task repair')
      if (workflow.cancelRequested) throw new Error('Workflow cannot accept a repair')
      const task = workflow.tasks[event.taskId]
      if (task?.repair?.decisionRef === event.decisionRef) {
        if (task.repair.issueId !== event.issueId || task.repair.instructions !== event.instructions) throw new Error('Repair decision identity conflict')
        result = { repairRequested: true, fromAttemptId: task.repair.fromAttemptId }; break
      }
      const attempt = task?.attemptId ? workflow.attempts[task.attemptId] : undefined
      const issue = workflow.issues[event.issueId]
      if (!attempt || attempt.phase !== 'failed' || attempt.quarantined && !attempt.sourceAuthorityRetirement || !issue || issue.status !== 'open'
        || attempt.issueId !== issue.id) throw new Error('Task is not safely retryable against this issue')
      if (!attempt.sourceAuthorityRetirement && (attempt.failure === 'execution_identity_unconfirmed'
        || attempt.failure === 'termination_unconfirmed' && !hasSettledAttemptTermination(attempt))) {
        throw new Error('Execution identity is unconfirmed; retain the technical pause until scoped stop evidence is available')
      }
      if (isSettledTechnicalVerification(attempt.verification) && !attemptDeadlineExpired(attempt, now)) {
        throw new Error('Settled technical candidate verification failures must retry the bound candidate verification, not dispatch an Owner repair')
      }
      required(event.decisionRef, 'repair decisionRef')
      required(event.instructions, 'repair instructions')
      const chargedIssues = [...new Set([issue.id, ...(task.inheritedIssueIds ?? [])])].map(id => workflow.issues[id]).filter(item => item?.status === 'open')
      chargeRecovery(workflow, chargedIssues)
      const progressKey = kernelDigest([attempt.candidate?.commitSha ?? null,
        attempt.verification?.results?.map(item => [item.verificationId, item.passed, item.exitCode, item.testStatus ?? null]) ?? attempt.failure])
      issue.repairHistory ??= []
      if (issue.repairHistory.some(item => item.progressKey === progressKey)) throw new Error('Repair repeats the same candidate, evidence and instruction without progress')
      issue.repairHistory.push({ attemptId: attempt.id, decisionRef: event.decisionRef, progressKey })
      task.repair = { fromAttemptId: attempt.id, issueId: issue.id, instructions: event.instructions,
        decisionRef: event.decisionRef, candidate: attempt.candidate, verification: attempt.verification }
      task.attemptId = null
      result = { repairRequested: true, fromAttemptId: attempt.id }
      touch(workflow, now)
      break
    }
    case 'recovery.request': {
      const attempts = integer(event.attempts, 'recovery attempts', 1)
      if (attempts > DEFAULT_POLICY.totalRecovery) throw new Error('Recovery request exceeds maximum window')
      required(event.reason, 'recovery reason')
      const recoveryRequest = { attempts, reason: event.reason }
      const prior = workflow.decisions[event.id]
      if (prior) {
        if (kernelDigest(prior.binding.recoveryRequest) !== kernelDigest(recoveryRequest)) throw new Error('Recovery decision identity conflict')
        result = prior.id; break
      }
      if (workflow.cancelRequested || workflow.delivery) throw new Error('Workflow cannot authorize recovery')
      assertRecoveryAuthoritySafe(state, workflow)
      const binding = { recovery: { used: workflow.recoveryUsed, limit: workflow.recoveryUsed + attempts,
        issueLimits: Object.fromEntries(Object.values(workflow.issues).map(issue => [issue.id, issue.used + attempts])) },
        previousRecoveryDecisionId: workflow.recoveryWindow?.decisionId ?? null,
        recoveryRequest,
        planVersion: workflow.planVersion }
      result = requestDecision(state, workflow, { id: event.id, kind: 'permission', binding,
        request: { question: `允许此 Workflow 再恢复最多 ${attempts} 次？`,
          detail: `${event.reason}。已使用 ${workflow.recoveryUsed} 次，历史计数保持；本轮手动恢复共用上限 ${binding.recovery.limit}，审查失败只反馈主线程，不自动重规划。`,
          options: ['允许这轮恢复', '保持暂停'] } }, now)
      break
    }
    case 'decision.request': {
      result = requestDecision(state, workflow, event, now)
      break
    }
    case 'decision.answer': {
      const decision = workflow.decisions[event.id]
      if (!decision || decision.requestDigest !== event.requestDigest || event.rootSessionId !== workflow.rootSessionId) throw new Error('Decision answer is stale or from wrong root')
      required(event.evidenceRef, 'decision evidenceRef')
      if (decision.status === 'superseded' || workflow.cancelRequested || decision.binding.planVersion !== undefined && decision.binding.planVersion !== workflow.planVersion) throw new Error('Decision authority expired')
      if (decision.status !== 'pending') {
        if (kernelDigest(decision.answer) !== kernelDigest(event.answer)) throw new Error('Conflicting decision answer')
        break
      }
      const attempt = decision.binding.attemptId ? workflow.attempts[decision.binding.attemptId] : undefined
      if (decision.binding.actionId) {
        const action = actionOf(state, decision.binding.actionId)
        if (action.waitingDecision !== decision.id || action.inputDigest !== decision.binding.inputDigest || action.stopRequested || TERMINAL.has(action.status)) throw new Error('Decision action authority expired')
        action.deadlineAt += Math.max(0, now - action.waitStartedAt)
        delete action.waitingDecision; delete action.waitStartedAt
      }
      if (attempt) {
        if (attempt.waitingDecision !== decision.id || attempt.authority !== decision.binding.authority || attempt.phase === 'stopping' || TERMINAL.has(attempt.phase)) throw new Error('Decision authority expired')
        attempt.deadlineAt += Math.max(0, now - attempt.waitStartedAt)
        delete attempt.waitingDecision; delete attempt.waitStartedAt
      }
      if (decision.binding.recovery) {
        if (workflow.recoveryUsed !== decision.binding.recovery.used
          || (workflow.recoveryWindow?.decisionId ?? null) !== decision.binding.previousRecoveryDecisionId) throw new Error('Recovery authorization is stale')
        assertRecoveryAuthoritySafe(state, workflow)
        const answers = event.answer?.answers
        if (!event.answer.cancelled && answers?.length === 1 && answers[0].id === decision.id
          && answers[0].selected?.length === 1 && answers[0].selected[0] === '允许这轮恢复' && !answers[0].custom) {
          const authorization = { ...copy(decision.binding.recovery), decisionId: decision.id, evidenceRef: event.evidenceRef, authorizedAt: now }
          workflow.recoveryAuthorizations ??= []
          workflow.recoveryAuthorizations.push(authorization)
          workflow.recoveryWindow = authorization
        }
      }
      decision.status = 'answered'; decision.answer = copy(event.answer); decision.evidenceRef = event.evidenceRef
      notify(state, workflow, 'decision_answered', { decisionId: decision.id, answer: event.answer, binding: decision.binding, evidenceRef: event.evidenceRef }, `answer:${decision.id}`, now)
      touch(workflow, now)
      break
    }
    case 'workflow.cancel':
      workflow.cancelRequested = true
      if (event.evidenceRef) workflow.cancellation = { requestedByRootSessionId: event.requestedByRootSessionId,
        evidenceRef: event.evidenceRef, requestedAt: now }
      for (const decision of Object.values(workflow.decisions).filter(decision => decision.status === 'pending')) { decision.status = 'superseded'; decision.supersededAt = now }
      for (const attempt of Object.values(workflow.attempts)) stopAttempt(state, workflow, attempt, 'cancelled', now)
      for (const action of Object.values(state.actions).filter(action => action.workflowId === workflow.id && !action.attemptId && action.status === 'pending')) {
        action.status = 'cancelled'; action.nextWakeAt = null
      }
      for (const action of Object.values(state.actions).filter(action => action.workflowId === workflow.id && !action.attemptId && action.admitted && !['notify_main', 'request_decision', 'stop_execution'].includes(action.kind) && !TERMINAL.has(action.status))) stopAction(state, action, 'cancelled', now)
      for (const action of Object.values(state.actions).filter(action => action.workflowId === workflow.id && action.kind === 'request_decision' && !TERMINAL.has(action.status))) {
        action.status = 'cancelled'; action.nextWakeAt = null
      }
      touch(workflow, now)
      break
    default: throw new Error(`Unsupported kernel event: ${event.type}`)
  }
  // Notifications are effects too, so derive one canonical notice from each
  // authoritative terminal-status edge rather than asking outcome paths to
  // remember it. A later stop receipt may correct failed to cancelled; that
  // correction names the notice it supersedes. Replays of one status do not.
  for (const current of Object.values(state.workflows)) {
    if (!has(previous.workflows, current.id)) continue
    const before = view(previous, current.id, now)
    const after = view(state, current.id, now)
    if (!WORKFLOW_TERMINAL.has(after.status) || (before.terminal && before.status === after.status)) continue
    const planningRepair = Object.values(state.actions).find(action => action.workflowId === current.id
      && action.kind === 'notify_main' && !has(previous.actions, action.id) && action.input.reason === 'planning_failed')?.input.detail
    for (const action of Object.values(state.actions).filter(action => action.workflowId === current.id
      && action.kind === 'notify_main' && !has(previous.actions, action.id) && !TERMINAL.has(action.status)
      && action.input.reason !== 'execution_settled')) {
      action.status = 'cancelled'; action.nextWakeAt = null
      action.resolution = { kind: 'superseded_by_terminal_notice', status: after.status }
    }
    const priorTerminal = before.terminal ? Object.values(previous.actions).filter(action => action.workflowId === current.id
      && action.kind === 'notify_main' && action.input.reason === 'workflow_terminal'
      && action.input.detail?.status === before.status)
      .sort((left, right) => right.input.detail.revision - left.input.detail.revision)[0] : null
    const correction = before.terminal ? {
      correctionReason: event.type === 'action.result' && previous.actions[event.actionId]?.kind === 'stop_execution'
        ? 'late_stop_receipt'
        : event.type === 'workflow.cancel' ? 'cancellation_requested_after_failure' : 'terminal_status_changed',
      supersedes: { noticeId: priorTerminal?.id ?? null, status: before.status,
        revision: priorTerminal?.input.detail?.revision ?? previous.workflows[current.id].revision },
    } : {}
    notify(state, current, 'workflow_terminal', {
      contract: 'DSH_WORKFLOW_TERMINAL_NOTICE_V1',
      workflowId: current.id,
      status: after.status,
      terminal: true,
      revision: current.revision,
      updatedAt: current.updatedAt,
      planVersion: current.planVersion,
      counts: after.counts,
      ...terminalNoticeContext(after),
      ...(planningRepair ? { planningRepair } : {}),
      ...correction,
    }, `terminal:${current.revision}:${after.status}`, now)
  }
  assertControlState(state)
  const changed = canonical(state) !== canonical(previous)
  if (changed) { state.revision = previous.revision + 1; state.lastObservedAt = now }
  return { state: changed ? state : previous, changed, result }
}

export function dueActions(state, now = Date.now()) {
  assertControlState(state)
  return Object.values(state.actions).filter(action => !actionReentryFenced(state, action) && !TERMINAL.has(action.status) && action.nextWakeAt <= now
    && (action.status !== 'pending' || canAdmitAction(state, action))
    && (!action.observation || action.observation.expiresAt <= now))
    .map(action => ({ actionId: action.id, workflowId: action.workflowId, mode: action.status === 'pending' ? 'execute' : 'observe' }))
}

function earliest(values) { const finite = values.filter(Number.isFinite); return finite.length ? Math.min(...finite) : null }

export function view(state, workflowId, now = state.lastObservedAt ?? 0) {
  assertControlState(state)
  integer(now, 'view now')
  now = Math.max(now, state.lastObservedAt ?? now)
  const workflow = wf(state, workflowId)
  const actions = Object.values(state.actions).filter(action => action.workflowId === workflowId)
  const actionWake = action => actionReentryFenced(state, action) ? null : action.nextWakeAt
  const failedFinalVerification = workflow.deliveryFailure?.reason === 'verification_failed'
    ? currentFailedVerification(actions, { kind: 'verify_workflow' }) : null
  const finalVerificationDiagnostic = failedFinalVerification
    ? verificationFailureSummary(failedFinalVerification, 'final_verification', null, now) : null
  const deliveryFailure = workflow.deliveryFailure?.reason === 'verification_failed'
    ? { actionId: workflow.deliveryFailure.actionId, reason: workflow.deliveryFailure.reason, diagnostic: finalVerificationDiagnostic }
    : workflow.deliveryFailure ? boundedNoticeValue(workflow.deliveryFailure) : null
  const retained = Object.values(state.workflows).flatMap(item => Object.values(item.attempts).filter(attempt => attempt.quarantined))
    .concat(Object.values(state.actions).filter(action => action.quarantined))
  const retainedLocks = new Set(Object.values(state.workflows).flatMap(item => Object.values(item.attempts)
    .filter(attempt => attempt.quarantined).flatMap(attempt => heldAttemptLocks(item, attempt)))
    .concat(Object.values(state.actions).filter(action => action.quarantined).flatMap(action => action.locks)))
  const retainedCapacity = retained.filter(item => item.authority || item.occupiesSlot).length
  const isolated = task => retainedCapacity >= state.parallel || lockKeys(workflow, task.ownerId, task.resources).some(lock => retainedLocks.has(lock))
  const nodes = (workflow.plan?.tasks ?? []).filter(task => !task.children).map(task => {
    const record = workflow.tasks[task.id]
    const attempt = record.attemptId ? workflow.attempts[record.attemptId] : null
    const phase = outcome(record, workflow)
    const failedVerification = attempt ? currentFailedVerification(actions, { attemptId: attempt.id }) : null
    const diagnostic = failedVerification ? verificationFailureSummary(failedVerification, 'candidate_verification', attempt, now) : null
    const deadlineAt = Number.isFinite(attempt?.deadlineAt) ? attempt.deadlineAt : null
    const deadlineExpired = deadlineAt !== null && !['succeeded', 'cancelled'].includes(attempt.phase)
      && attemptDeadlineExpired(attempt, now)
    const waiting = attempt?.waitingDecision ? { reason: 'user_decision', responsibleParty: 'user', decisionId: attempt.waitingDecision, resumeCondition: 'matching_native_answer', nextWakeAt: null }
      : attempt?.quarantined ? { reason: 'termination_unconfirmed', responsibleParty: 'runtime', resumeCondition: 'writers_stopped_evidence', nextWakeAt: earliest(actions.filter(action => action.attemptId === attempt.id && !TERMINAL.has(action.status)).map(actionWake)) }
      : phase === 'pending' ? isolated(task) ? { reason: 'quarantined_resource', responsibleParty: 'runtime', resumeCondition: 'writers_stopped_evidence', nextWakeAt: null }
        : publicRequestBlock(workflow, task) ? { ...publicRequestBlock(workflow, task), resumeCondition: 'bound_public_owner_decision_and_plan', nextWakeAt: null }
          : { reason: dependenciesReady(workflow, task.id) ? 'capacity_or_resource' : 'dependency', responsibleParty: 'runner', resumeCondition: dependenciesReady(workflow, task.id) ? 'capacity_and_resources_available' : 'predecessor_integrated', nextWakeAt: null }
      : null
    return { taskId: task.id, title: task.title, dependsOn: task.dependsOn, ownerId: task.ownerId, phase, attemptId: attempt?.id ?? null,
      deadlineAt, deadlineExpired, waiting,
      failure: attempt?.failure ?? null, diagnostic, integration: attempt?.integration ?? null }
  })
  const counts = { totalTasks: nodes.length, completedTasks: nodes.filter(node => node.phase === 'succeeded').length,
    failedTasks: nodes.filter(node => node.phase === 'failed').length, pendingTasks: nodes.filter(node => node.phase === 'pending').length,
    runningTasks: nodes.filter(node => !TERMINAL.has(node.phase) && node.phase !== 'pending').length }
  const pendingDecision = Object.values(workflow.decisions).find(decision => decision.status === 'pending')
  const essential = actions.filter(action => !['notify_main', 'summarize_memory', 'request_decision', 'stop_execution'].includes(action.kind))
  const genericActive = essential.some(action => !action.attemptId && !TERMINAL.has(action.status))
  const genericFailure = essential.some(action => !action.attemptId && action.status === 'failed' && !action.resolution)
  const quarantined = actions.some(action => action.quarantined) || Object.values(workflow.attempts).some(attempt => attempt.quarantined)
  const independentReady = nodes.some(node => node.phase === 'pending' && dependenciesReady(workflow, node.taskId)
    && !publicRequestBlock(workflow, workflow.plan.tasks.find(task => task.id === node.taskId))
    && !isolated(workflow.plan.tasks.find(task => task.id === node.taskId)))
  const publicBlocked = nodes.filter(node => node.phase === 'pending' && publicRequestBlock(workflow, workflow.plan.tasks.find(task => task.id === node.taskId)))
  const status = workflow.kind === 'registry' && workflow.registryResult ? workflow.registryResult.applied ? 'completed' : 'cancelled'
    : workflow.delivery ? 'completed' : workflow.deliveryFailure ? 'failed' : workflow.planningFailure && !genericActive ? 'failed' : workflow.cancelRequested
    ? quarantined ? 'failed' : genericActive || nodes.some(node => !TERMINAL.has(node.phase) && node.phase !== 'pending') ? 'stopping' : 'cancelled'
    : workflow.pendingRegistry?.phase === 'replan_required' && !genericActive ? 'waiting'
    : (counts.failedTasks > 0 || genericFailure || publicBlocked.length && !pendingDecision) && counts.runningTasks === 0 && !genericActive && !independentReady ? 'failed'
      : pendingDecision ? 'waiting' : workflow.plan ? 'running' : 'planning'
  const wakes = actions.filter(action => !actionReentryFenced(state, action) && !TERMINAL.has(action.status) && Number.isFinite(action.nextWakeAt)).map(action => action.nextWakeAt)
  const attention = []
  const retainedExecutions = Object.values(workflow.attempts).filter(attempt => attempt.sourceAuthorityRetirement && attempt.quarantined)
    .map(attempt => ({ attemptId: attempt.id, taskId: attempt.taskId, scope: 'project_write_authority', retainedCapacity: 1,
      executionSettled: false, sharedTempEffectsUnconfirmed: true, evidenceRef: attempt.sourceAuthorityRetirement.evidenceRef,
      commands: attempt.sourceAuthorityRetirement.commands.slice(0, 20).map(command => ({ commandId: command.commandId, cwd: command.cwd })),
      commandCount: attempt.sourceAuthorityRetirement.commands.length }))
  for (const retained of retainedExecutions) attention.push({ id: `retained:${retained.attemptId}`, reason: 'isolated_execution_unconfirmed',
    responsibleParty: 'runtime', resumeCondition: 'scoped_stop_evidence', nextWakeAt: null,
    detail: 'Project write authority is closed; old private files and execution capacity remain quarantined', evidenceRef: retained.evidenceRef })
  for (const decision of Object.values(workflow.decisions).filter(item => item.status === 'pending')) attention.push({
    id: decision.id, reason: 'user_decision', responsibleParty: 'user', decisionId: decision.id,
    resumeCondition: 'matching_native_answer', nextWakeAt: null, detail: decision.request.question })
  for (const task of nodes) {
    if (task.failure || task.waiting?.reason === 'termination_unconfirmed' || task.waiting?.reason === 'quarantined_resource') attention.push({
      id: `task:${task.taskId}`, taskId: task.taskId, reason: task.waiting?.reason ?? 'task_failed',
      responsibleParty: task.waiting?.responsibleParty ?? 'root_session',
      resumeCondition: task.waiting?.resumeCondition ?? (task.diagnostic?.resumeCondition
        ?? (task.diagnostic?.classification === 'technical_execution_failure'
          ? 'execution_obstruction_resolved_then_bound_verification_retry' : 'bound_task_repair')),
      nextWakeAt: task.waiting?.nextWakeAt ?? null, detail: task.failure, diagnostic: task.diagnostic })
  }
  const publicWaits = new Map(publicBlocked.map(task => [task.waiting.requestId, task.waiting]))
  for (const wait of publicWaits.values()) attention.push({ id: `public-owner:${wait.requestId}`, ...wait,
    detail: wait.outcome === 'facts_missing' ? 'Provide the missing consumer facts and revise the same request'
      : wait.outcome === 'rejected' ? 'Review the recorded alternative or report the contract as infeasible'
        : 'Apply the sourced public Owner decision through the reviewed plan' })
  for (const action of actions.filter(item => !item.attemptId && (item.quarantined || item.status === 'failed' && !item.resolution
    || !TERMINAL.has(item.status) && item.waitingReason === 'root_session_offline'))) attention.push({
    id: action.id, reason: action.quarantined ? 'termination_unconfirmed' : action.waitingReason ?? 'action_failed',
    responsibleParty: action.quarantined ? 'runtime' : 'root_session',
    resumeCondition: action.quarantined ? 'writers_stopped_evidence' : action.waitingReason === 'root_session_offline' ? 'original_root_session_available' : 'bound_action_repair',
    nextWakeAt: actionWake(action), detail: action.failure ?? null })
  if (workflow.pendingRegistry?.phase === 'replan_required') attention.push({ id: 'registry-replan', reason: 'registry_changed', responsibleParty: 'root_session',
    resumeCondition: 'reviewed_plan_for_current_registry', nextWakeAt: null, detail: 'Replan this workflow using the approved Registry baseline; ownership remains fenced until activation' })
  if (workflow.deliveryFailure) attention.push({ id: 'delivery', reason: 'delivery_failed', responsibleParty: 'root_session',
    resumeCondition: finalVerificationDiagnostic?.classification === 'technical_execution_failure'
      ? 'execution_obstruction_resolved_then_bound_verification_retry'
      : finalVerificationDiagnostic ? 'bound_final_verification_retry' : 'verified_delivery_repair',
    nextWakeAt: null, detail: deliveryFailure, diagnostic: finalVerificationDiagnostic })
  if (workflow.planningFailure) attention.push({ id: 'planning', reason: 'planning_failed', responsibleParty: 'root_session', resumeCondition: 'bound_plan_repair', nextWakeAt: null, detail: workflow.planningFailure })
  return { contract: 'DSH_WORKFLOW_VIEW_V1', workflowId, root: workflow.root, rootSessionId: workflow.rootSessionId,
    goal: workflow.request, createdAt: workflow.createdAt, updatedAt: workflow.updatedAt, planVersion: workflow.planVersion, attention, retainedExecutions,
    revision: workflow.revision, status, kind: workflow.kind ?? 'workflow', registryResult: workflow.registryResult ?? null, terminal: ['completed', 'cancelled', 'failed', 'historical'].includes(status),
    actionRequired: Boolean(pendingDecision), decisionId: pendingDecision?.id ?? null, deliveryFailure,
    nextWakeAt: wakes.length ? Math.min(...wakes) : null, counts, tasks: nodes,
    notices: actions.filter(action => action.kind === 'notify_main').map(action => ({ id: action.id, status: action.status, reason: action.input.reason })),
    actions: actions.map(action => ({ id: action.id, kind: action.kind, status: action.status, failure: action.failure ?? null, resolution: action.resolution ?? null, quarantined: action.quarantined === true, nextWakeAt: actionWake(action),
      waiting: TERMINAL.has(action.status) ? null : { reason: action.waitingReason ?? (action.stopRequested ? 'termination' : action.status === 'pending' ? 'capacity_or_resource' : 'effect_result'),
        responsibleParty: action.kind === 'request_decision' ? 'user' : action.waitingReason === 'root_session_offline' ? 'root_session' : 'runner',
        resumeCondition: action.kind === 'request_decision' ? 'matching_native_answer' : action.stopRequested ? 'writers_stopped_evidence' : 'bound_effect_result', nextWakeAt: actionWake(action) } })),
    recovery: { used: workflow.recoveryUsed, limit: recoveryLimit(workflow), baseLimit: workflow.policy.totalRecovery,
      authorization: workflow.recoveryWindow ?? null,
      issues: Object.values(workflow.issues).map(issue => ({ id: issue.id, status: issue.status, used: issue.used ?? 0,
        limit: issueRecoveryLimit(workflow, issue), sourceId: issue.sourceId, closeWhen: recoveryCloseWhenSummary(issue.closeWhen), lastReason: issue.lastReason ?? null })) }, delivery: workflow.delivery }
}

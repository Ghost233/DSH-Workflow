const OBSERVATION_CLOCKS = new Set(['createdAt', 'updatedAt', 'reviewedAt', 'startedAt', 'settledAt', 'finishedAt', 'observedAt', 'lastProbeAt', 'timestamp', 'time', 'at'])
function canonical(value, omitClocks = false) {
  if (Array.isArray(value)) return `[${value.map(item => canonical(item, omitClocks)).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).filter(key => !omitClocks || !OBSERVATION_CLOCKS.has(key)).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key], omitClocks)}`).join(',')}}`
  return JSON.stringify(value)
}
export function isRecoveryCandidate(state) {
  return state?.pendingPlanRevision !== undefined && (state.pendingPlanRevision.origin === 'handoff-recovery'
    || state.pendingPlanRevision.recoveryRequestId !== undefined || state.pendingPlanRevision.recoveryOrigin !== undefined
    || Object.values(state.handoffReplans ?? {}).some(item => item.phase === 'candidate_staged'))
}
export function candidateNeedsUserDecision(state) {
  const origin = state.pendingPlanRevision?.recoveryOrigin
  const task = state.tasks?.find(item => item.taskId === origin?.taskId)
  const owner = state.ownerRuns?.[`${origin?.taskId}:${origin?.ownerId}`]
  return state.planConvergence?.nextStrategy === 'request_user_authority'
    || owner?.autonomousRecovery?.strategy === 'request_user_authority'
    || ['await_user', 'provide_input'].includes(task?.action)
    || (state.tasks ?? []).some(item => {
      const planTask = state.plan?.tasks?.find(candidate => candidate.id === item.taskId)
      const run = state.ownerRuns?.[`${item.taskId}:${planTask?.ownerId}`]
      return item.action === 'await_user' && run?.autonomousRecovery?.strategy === 'request_user_authority'
        && run.candidatePause?.source === state.candidateRecoveryPause?.source
        && run.candidatePause?.activePlanDigest === state.planDigest
        && run.candidatePause?.contract === 'DSH_CANDIDATE_INDEPENDENT_RESERVATION_V1'
    })
}
export function candidateRecoveryIdentity(state) {
  // Bind the whole candidate across the unlocked driver and the pause transaction.
  // Operation/session receipts may advance legitimately during this invocation.
  return canonical({ workflowId: state.id, active: state.planDigest,
    candidate: state.pendingPlanRevision ?? null })
}
export function candidateRecoverySource(state) {
  const candidate = state.pendingPlanRevision
  const origin = candidate?.recoveryOrigin
  const sameOrigin = op => canonical(op.origin) === canonical(origin)
  const planners = Object.values(state.handoffReplans ?? {}).filter(sameOrigin).sort((a, b) => a.operationId.localeCompare(b.operationId))
  const reviews = Object.values(state.candidateReviews ?? {}).filter(sameOrigin).sort((a, b) => a.operationId.localeCompare(b.operationId))
  const consultations = Object.values(state.candidateOwnerConsultations ?? {}).filter(sameOrigin)
    .sort((a, b) => a.operationId.localeCompare(b.operationId))
  const arbitrations = Object.values(state.candidateArbitrations ?? {}).filter(sameOrigin)
    .sort((a, b) => a.operationId.localeCompare(b.operationId))
  const requestIds = new Set([...planners, ...reviews, ...consultations, ...arbitrations].map(op => op.requestId))
  const owner = state.ownerRuns?.[`${origin?.taskId}:${origin?.ownerId}`]
  const task = state.tasks?.find(item => item.taskId === origin?.taskId)
  // Excludes daemon clocks, delivery flags, global revision, unrelated Owners,
  // and the pause itself; actual operation/receipt changes remain observable.
  return canonical({ workflowId: state.id, planDigest: state.planDigest, plan: state.plan,
    config: state.recoveryAdmissionConfig, protocol: state.recoveryProtocol,
    candidate, convergence: state.planConvergence, planners, reviews, consultations, arbitrations,
    sessions: [...requestIds].sort().map(id => [id, state.replanSessions?.[id]]),
    attempts: state.recoveryAdmission?.budget?.attempts.filter(item => requestIds.has(item.requestId)),
    handoffs: state.handoffQueue?.filter(item => candidate?.handoffIds?.includes(item.id)),
    owner: owner === undefined ? null : { status: owner.status, attempt: owner.attempt, sessionId: owner.sessionId,
      planDigest: owner.planDigest, recoverySession: owner.recoverySession, executionDeviation: owner.executionDeviation,
      strategy: owner.autonomousRecovery?.strategy },
    task: task === undefined ? null : { status: task.status, reason: task.reason, action: task.action },
  }, true)
}
export function activeCandidateRecoveryPause(state) {
  const pause = state.candidateRecoveryPause
  return isRecoveryCandidate(state) && !candidateNeedsUserDecision(state)
    && pause?.contract === 'DSH_CANDIDATE_RECOVERY_PAUSE_V1'
    && pause.source === candidateRecoverySource(state) ? pause : undefined
}
export class RecoverySemanticFailure extends Error {
  constructor(message) { super(message); this.name = 'RecoverySemanticFailure' }
}

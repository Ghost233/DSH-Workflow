export const OWNER_ATTEMPT_CONTROL_CONTRACT = 'DSH_OWNER_ATTEMPT_CONTROL_V1'

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive safe integer`)
  return value
}

function nonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer`)
  return value
}

function time(value, name) {
  const parsed = Date.parse(value ?? '')
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be an ISO timestamp`)
  return parsed
}

export function createOwnerAttemptControl({
  executionVersion,
  attempt,
  leaseToken,
  generation,
  deadlineMs,
  observationWindowMs,
  currentTime = Date.now(),
}) {
  positiveInteger(deadlineMs, 'deadlineMs')
  positiveInteger(observationWindowMs, 'observationWindowMs')
  positiveInteger(attempt, 'attempt')
  positiveInteger(generation, 'generation')
  if (typeof executionVersion !== 'string' || executionVersion === '') throw new Error('executionVersion is required')
  if (typeof leaseToken !== 'string' || leaseToken === '') throw new Error('leaseToken is required')
  return {
    contract: OWNER_ATTEMPT_CONTROL_CONTRACT,
    executionVersion,
    attempt,
    leaseToken,
    generation,
    sessionId: null,
    phase: 'active',
    fixedDeadlineAt: new Date(currentTime + deadlineMs).toISOString(),
    remainingCeilingMs: deadlineMs,
    lastObservedAt: new Date(currentTime).toISOString(),
    observationWindowMs,
  }
}

export function bindOwnerAttemptSession(control, sessionId) {
  if (control?.contract !== OWNER_ATTEMPT_CONTROL_CONTRACT || control.phase !== 'active') {
    throw new Error('Owner attempt control is not active')
  }
  if (typeof sessionId !== 'string' || sessionId === '') throw new Error('sessionId is required')
  if (control.sessionId !== null && control.sessionId !== sessionId) throw new Error('Owner attempt session changed')
  return { ...control, sessionId }
}

export function observeOwnerAttemptClock(control, currentTime = Date.now()) {
  if (control?.contract !== OWNER_ATTEMPT_CONTROL_CONTRACT) return { control, expired: false }
  if (control.phase !== 'active') return { control, expired: control.phase === 'stopping' }
  const previous = time(control.lastObservedAt, 'lastObservedAt')
  const deadline = time(control.fixedDeadlineAt, 'fixedDeadlineAt')
  const priorRemaining = nonNegativeInteger(control.remainingCeilingMs, 'remainingCeilingMs')
  if (currentTime < previous) {
    return {
      control: {
        ...control,
        phase: 'technical_pause',
        technicalPauseReason: 'technical_pause_clock_rollback',
        pausedAt: new Date(currentTime).toISOString(),
      },
      expired: false,
      technicalPause: true,
    }
  }
  const elapsed = currentTime - previous
  const remainingCeilingMs = Math.max(0, Math.min(
    priorRemaining,
    Math.max(0, priorRemaining - elapsed),
    Math.max(0, deadline - currentTime),
  ))
  return {
    control: {
      ...control,
      remainingCeilingMs,
      lastObservedAt: new Date(currentTime).toISOString(),
    },
    expired: remainingCeilingMs === 0,
  }
}

export function requestOwnerAttemptStop(control, {
  cause = 'hard_deadline',
  cancelRequestId,
  currentTime = Date.now(),
  cancelState = 'requested',
  cancellationError,
} = {}) {
  if (control?.contract !== OWNER_ATTEMPT_CONTROL_CONTRACT) throw new Error('Owner attempt control is missing')
  if (control.phase !== 'active') return control
  if (control.sessionId === null && cancelState === 'requested') throw new Error('Owner attempt has no persisted session')
  if (typeof cancelRequestId !== 'string' || cancelRequestId === '') throw new Error('cancelRequestId is required')
  const requestedAt = new Date(currentTime).toISOString()
  return {
    ...control,
    phase: cancelState === 'unavailable' ? 'technical_pause' : 'stopping',
    cause,
    cancelRequestId,
    cancelState,
    requestedAt,
    observationDeadlineAt: new Date(currentTime + positiveInteger(control.observationWindowMs, 'observationWindowMs')).toISOString(),
    ...(cancellationError === undefined ? {} : { cancellationError }),
    ...(cancelState === 'unavailable' ? {
      technicalPauseReason: 'technical_pause_cancel_unconfirmed',
      pausedAt: requestedAt,
    } : {}),
  }
}

export function failOwnerAttemptCancellation(control, error, currentTime = Date.now()) {
  if (control?.contract !== OWNER_ATTEMPT_CONTROL_CONTRACT || !['stopping', 'technical_pause'].includes(control.phase)) {
    return control
  }
  const pausedAt = new Date(currentTime).toISOString()
  return {
    ...control,
    phase: 'technical_pause',
    cancelState: 'failed',
    cancellationError: String(error),
    technicalPauseReason: 'technical_pause_cancel_unconfirmed',
    pausedAt,
  }
}

export function settleOwnerAttemptControl(control, {
  terminalRevision,
  terminalReason,
  currentTime = Date.now(),
} = {}) {
  if (control?.contract !== OWNER_ATTEMPT_CONTROL_CONTRACT) throw new Error('Owner attempt control is missing')
  if (control.phase === 'settled') return control
  if (!['stopping', 'technical_pause'].includes(control.phase)) return control
  if (!Number.isSafeInteger(terminalRevision) || terminalRevision < 0) throw new Error('terminalRevision is required')
  const settledAt = new Date(currentTime).toISOString()
  return {
    ...control,
    phase: 'settled',
    cancelState: 'confirmed',
    terminalRevision,
    terminalReason: String(terminalReason ?? 'unknown'),
    terminalObservedAt: settledAt,
    pipelineSettledAt: settledAt,
    settledAt,
  }
}

export function pauseUnknownOwnerTermination(control, currentTime = Date.now()) {
  if (control?.contract !== OWNER_ATTEMPT_CONTROL_CONTRACT || control.phase !== 'stopping') return control
  if (currentTime < time(control.observationDeadlineAt, 'observationDeadlineAt')) return control
  const pausedAt = new Date(currentTime).toISOString()
  return {
    ...control,
    phase: 'technical_pause',
    technicalPauseReason: 'technical_pause_termination_unknown',
    pausedAt,
  }
}

export function ownerAttemptBindingMatches(record, binding) {
  const control = record?.attemptControl
  if (control === undefined) return true
  return control.contract === OWNER_ATTEMPT_CONTROL_CONTRACT
    && record.planDigest === binding.executionVersion
    && record.attempt === binding.attempt
    && record.leaseToken === binding.leaseToken
    && control.executionVersion === binding.executionVersion
    && control.attempt === binding.attempt
    && control.leaseToken === binding.leaseToken
    && control.generation === binding.generation
    && (binding.sessionId === undefined || (record.sessionId === binding.sessionId && control.sessionId === binding.sessionId))
    && control.phase === 'active'
}

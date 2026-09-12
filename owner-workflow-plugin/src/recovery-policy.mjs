export const RECOVERY_RUNTIME_POLICY_CONTRACT = 'DSH_RECOVERY_RUNTIME_POLICY_V1'
export const RECOVERY_RUNTIME_POLICY_VERSION = 1
export const RECOVERY_RUNTIME_POLICY_SOURCE = 'R92-T19-REPRESENTATIVE-V1'

const POLICY = Object.freeze({
  contract: RECOVERY_RUNTIME_POLICY_CONTRACT,
  version: RECOVERY_RUNTIME_POLICY_VERSION,
  source: RECOVERY_RUNTIME_POLICY_SOURCE,
  recoveryProtocol: 'DSH_RECOVERY_ADMISSION_V1',
  totalLimit: 12,
  problemLimit: 8,
  ownerAttemptDeadline: 'approved_task_on_timeout',
  ownerTerminationObservationMs: 30_000,
})

function fail(reason) {
  throw new Error(reason)
}

function exactObject(value, expectedKeys, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.getOwnPropertySymbols(value).length !== 0) fail(`${name}_invalid`)
  const descriptors = Object.values(Object.getOwnPropertyDescriptors(value))
  if (descriptors.some(item => !item.enumerable || !Object.hasOwn(item, 'value'))) fail(`${name}_invalid`)
  const actual = Object.getOwnPropertyNames(value).sort()
  const expected = [...expectedKeys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${name}_invalid`)
  }
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${name}_invalid`)
  return value
}

function exactText(value, expected, name) {
  if (value !== expected) fail(`${name}_invalid`)
  return value
}

/** Return the versioned policy frozen into every newly created Workflow. */
export function createRecoveryRuntimePolicy() {
  return structuredClone(POLICY)
}

/** Strictly import one persisted policy; unknown versions never fall back. */
export function normalizeRecoveryRuntimePolicy(value) {
  exactObject(value, [
    'contract', 'version', 'source', 'recoveryProtocol', 'totalLimit', 'problemLimit',
    'ownerAttemptDeadline', 'ownerTerminationObservationMs',
  ], 'recovery_runtime_policy')
  exactText(value.contract, POLICY.contract, 'recovery_runtime_policy_contract')
  if (value.version !== POLICY.version) fail('recovery_runtime_policy_version_invalid')
  exactText(value.source, POLICY.source, 'recovery_runtime_policy_source')
  exactText(value.recoveryProtocol, POLICY.recoveryProtocol, 'recovery_runtime_policy_protocol')
  const totalLimit = positiveInteger(value.totalLimit, 'recovery_runtime_policy_total_limit')
  const problemLimit = positiveInteger(value.problemLimit, 'recovery_runtime_policy_problem_limit')
  if (totalLimit !== POLICY.totalLimit || problemLimit !== POLICY.problemLimit
    || problemLimit > totalLimit) fail('recovery_runtime_policy_limits_invalid')
  exactText(value.ownerAttemptDeadline, POLICY.ownerAttemptDeadline,
    'recovery_runtime_policy_owner_attempt_deadline')
  const ownerTerminationObservationMs = positiveInteger(
    value.ownerTerminationObservationMs,
    'recovery_runtime_policy_owner_termination_observation_ms',
  )
  if (ownerTerminationObservationMs !== POLICY.ownerTerminationObservationMs) {
    fail('recovery_runtime_policy_owner_termination_observation_ms_invalid')
  }
  return {
    contract: POLICY.contract,
    version: POLICY.version,
    source: POLICY.source,
    recoveryProtocol: POLICY.recoveryProtocol,
    totalLimit,
    problemLimit,
    ownerAttemptDeadline: POLICY.ownerAttemptDeadline,
    ownerTerminationObservationMs,
  }
}

export function recoveryAdmissionConfigFor(policyValue, executionVersion) {
  const policy = normalizeRecoveryRuntimePolicy(policyValue)
  if (typeof executionVersion !== 'string' || executionVersion.trim() === '') {
    fail('recovery_runtime_policy_execution_version_invalid')
  }
  return {
    contract: 'DSH_RECOVERY_ADMISSION_CONFIG_V1',
    executionVersion,
    totalLimit: policy.totalLimit,
    problemLimit: policy.problemLimit,
  }
}

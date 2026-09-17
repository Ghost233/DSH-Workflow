const text = { type: 'string', minLength: 1, maxLength: 8_192 }
const id = { type: 'string', minLength: 1, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,200}$' }

export const OWNER_EXECUTION_FEEDBACK_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    kind: { enum: ['public_contract_gap', 'runner_resource_observation'] },
    sourceId: id,
    issue: text,
    detail: text,
    contractId: id,
    verificationId: id,
    observedExitCode: { type: 'integer' },
  },
  required: ['kind', 'issue', 'detail'],
  allOf: [
    { if: { properties: { kind: { const: 'public_contract_gap' } }, required: ['kind'] }, then: { required: ['contractId'] } },
    { if: { properties: { kind: { const: 'runner_resource_observation' } }, required: ['kind'] }, then: { required: ['verificationId', 'observedExitCode'] } },
  ],
}

function nonempty(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Owner feedback ${field} must be non-empty`)
  return value
}

/** Validate new feedback before it becomes a durable issue or root notice. */
export function normalizeOwnerExecutionFeedback(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Owner feedback report must be an object')
  const allowed = new Set(['kind', 'sourceId', 'issue', 'detail', 'contractId', 'verificationId', 'observedExitCode'])
  if (Object.keys(value).some(key => !allowed.has(key))) throw new Error('Owner feedback report has unsupported fields')
  if (!['public_contract_gap', 'runner_resource_observation'].includes(value.kind)) throw new Error('Owner feedback kind is unsupported')
  const report = { kind: value.kind, issue: nonempty(value.issue, 'issue'), detail: nonempty(value.detail, 'detail') }
  if (value.sourceId !== undefined) report.sourceId = nonempty(value.sourceId, 'sourceId')
  if (value.kind === 'public_contract_gap') report.contractId = nonempty(value.contractId, 'contractId')
  if (value.kind === 'runner_resource_observation') {
    report.verificationId = nonempty(value.verificationId, 'verificationId')
    if (!Number.isSafeInteger(value.observedExitCode)) throw new Error('Owner feedback observedExitCode must be an integer')
    report.observedExitCode = value.observedExitCode
  }
  return report
}

/** Bind resource observations to the immutable verification inventory dispatched to this Owner. */
export function bindOwnerExecutionFeedback(value, task) {
  const report = normalizeOwnerExecutionFeedback(value)
  if (report.kind === 'runner_resource_observation' && !task?.verify?.includes(report.verificationId)) {
    throw new Error(`Runner resource observation must name a verification in the frozen task: ${task?.verify?.join(', ') ?? ''}`)
  }
  return report
}

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
}

function verification(task, verifications, verificationId) {
  if (!task?.verify?.includes(verificationId)) return null
  return verifications?.find(item => item.id === verificationId) ?? null
}

/**
 * Narrow migrations for the pre-contract resource reports observed from
 * the native Owner prompt. Free-form `detail` is retained for display, never
 * used to classify or close the issue.
 */
export function ownerResourceObservation(report, task, verifications) {
  if (report?.kind === 'runner_resource_observation') {
    const definition = verification(task, verifications, report.verificationId)
    return definition && Number.isSafeInteger(report.observedExitCode)
      ? { kind: report.kind, verificationId: report.verificationId,
        observedExitCode: report.observedExitCode, definition, migration: null }
      : null
  }
  const legacyTaskReport = [
    { field: 'kind', value: 'verification_environment', migration: 'legacy_verification_environment_v1' },
    { field: 'issueType', value: 'verification_blocked', migration: 'legacy_verification_blocked_v1' },
  ].find(item => exactKeys(report, ['taskId', item.field, 'detail']) && report[item.field] === item.value)
  if (legacyTaskReport && report.taskId === task?.id && task.verify?.length === 1) {
    const verificationId = task.verify[0]
    const definition = verification(task, verifications, verificationId)
    if (definition && verificationId === 'typecheck'
      && JSON.stringify(definition.run) === JSON.stringify(['npm', 'run', 'typecheck'])) {
      return { kind: 'runner_resource_observation', verificationId, observedExitCode: 127,
        definition, migration: legacyTaskReport.migration }
    }
  }
  if (!exactKeys(report, ['issue', 'detail']) || report.issue !== 'typecheck-unavailable') return null
  const definition = verification(task, verifications, 'typecheck')
  if (!definition || JSON.stringify(definition.run) !== JSON.stringify(['npm', 'run', 'typecheck'])) return null
  return { kind: 'runner_resource_observation', verificationId: 'typecheck', observedExitCode: 127,
    definition, migration: 'legacy_typecheck_unavailable_v1' }
}

/** Explicit reports are public; legacy reports require a current frozen contract binding. */
export function ownerPublicContractGap(report, { taskId, producerContracts = [] } = {}) {
  if (report?.kind === 'public_contract_gap') return typeof report.contractId === 'string' && report.contractId
    ? { kind: report.kind, contractId: report.contractId, migration: null } : null
  const legacy = report && typeof report === 'object' && !Array.isArray(report)
    && typeof report.sourceId === 'string' && typeof report.taskId === 'string' && report.taskId === taskId
    && typeof report.issue === 'string' && typeof report.closeWhen === 'string'
  if (!legacy || !producerContracts.length) return null
  return { kind: 'public_contract_gap', contractId: null, migration: 'legacy_bound_public_contract_v1' }
}

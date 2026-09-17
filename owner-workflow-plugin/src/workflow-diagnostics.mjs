const SENSITIVE_DIAGNOSTIC_KEY = /(["']?)\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\b\1(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s;,}]+)/giu
const SENSITIVE_DIAGNOSTIC_FLAG = /^--?(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)$/iu
const ABSOLUTE_DIAGNOSTIC_PATH = /\/(?:private|Users|home|tmp|var|Volumes)\/[^\s;,)'"\]]+/gu

export function boundedUtf8(value, maximum) {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.byteLength <= maximum) return value
  const suffix = '…'
  let prefix = bytes.subarray(0, Math.max(0, maximum - Buffer.byteLength(suffix))).toString('utf8')
  while (Buffer.byteLength(prefix + suffix, 'utf8') > maximum) prefix = prefix.slice(0, -1)
  return prefix + suffix
}

export function diagnosticText(value, { maximum = 2_000, paths = false } = {}) {
  if (typeof value !== 'string' || value.length === 0) return null
  let text = value
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu, '[REDACTED]')
    .replace(/\bsk-[a-z0-9_-]{16,}/giu, '[REDACTED]')
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/giu, '$1 [REDACTED]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^@\s/]+@/giu, '$1[REDACTED]@')
    .replace(SENSITIVE_DIAGNOSTIC_KEY, '$1$2$1$3[REDACTED]')
  if (paths) text = text.replace(ABSOLUTE_DIAGNOSTIC_PATH, '[REDACTED_PATH]')
  return boundedUtf8(text, maximum)
}

export function diagnosticArgv(value, maximumItems = 20) {
  let redactNext = false
  return (Array.isArray(value) ? value : []).slice(0, maximumItems).map(argument => {
    if (redactNext) { redactNext = false; return '[REDACTED]' }
    const raw = typeof argument === 'string' ? argument : String(argument)
    if (SENSITIVE_DIAGNOSTIC_FLAG.test(raw)) redactNext = true
    return diagnosticText(raw, { maximum: 512 }) ?? ''
  })
}

export function verificationFailureOutput(result, maximum = 2_000) {
  if (result?.passed === true) return { message: null }
  const sources = result?.status === 'execution_error'
    ? [['error', result?.error], ['stderr', result?.stderr], ['stdout', result?.stdout]]
    : [['stderr', result?.stderr], ['error', result?.error], ['stdout', result?.stdout]]
  const selected = sources.find(([, value]) => typeof value === 'string' && value.length > 0)
  if (!selected) return { message: null }
  const [source, raw] = selected
  return {
    message: diagnosticText(raw, { maximum, paths: true }),
    messageSource: source,
    messageTruncated: result?.[`${source}Truncated`] === true || Buffer.byteLength(raw, 'utf8') > maximum,
  }
}

export function boundedDiagnosticTexts(values, { maximumItems = 8, itemBytes = 1_000, totalBytes = 4_000 } = {}) {
  const output = []
  let used = 0
  let truncated = !Array.isArray(values) || values.length > maximumItems
  for (const value of Array.isArray(values) ? values.slice(0, maximumItems) : []) {
    if (typeof value !== 'string' || value.length === 0) { truncated = true; continue }
    const text = diagnosticText(value, { maximum: itemBytes, paths: true })
    if (text === null) { truncated = true; continue }
    const bytes = Buffer.byteLength(text, 'utf8')
    if (Buffer.byteLength(value, 'utf8') > itemBytes) truncated = true
    if (used + bytes > totalBytes) { truncated = true; break }
    output.push(text); used += bytes
  }
  return { values: output, truncated }
}

/** One attempt's wall-clock budget remains authoritative across host restarts. */
export function attemptDeadlineExpired(attempt, now) {
  return Number.isFinite(attempt?.deadlineAt) && now >= attempt.deadlineAt
}

/** Keep the model-visible recovery route identical to the mutation admission rule. */
export function verificationRecoveryRoute({ kind, technical, attempt, now }) {
  if (kind !== 'candidate_verification') return { retryTool: 'workflow_retry_action' }
  const deadlineAt = Number.isFinite(attempt?.deadlineAt) ? attempt.deadlineAt : null
  const deadlineExpired = deadlineAt !== null && attemptDeadlineExpired(attempt, now)
  return {
    retryTool: !technical || deadlineExpired ? 'workflow_retry_task' : 'workflow_retry_action',
    deadlineAt,
    deadlineExpired,
    resumeCondition: technical && !deadlineExpired
      ? 'execution_obstruction_resolved_then_bound_verification_retry'
      : deadlineExpired
        ? 'attempt_deadline_expired_then_bound_task_retry'
        : 'bound_task_repair',
  }
}

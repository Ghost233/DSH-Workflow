import { normalizeVerificationCwd } from './model.mjs'

export const COMMIT_SHA_SCHEMA = Object.freeze({
  type: 'string',
  pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$',
})

export const VERIFICATION_RESULT_SCHEMA = Object.freeze({
  contract: 'DSH_VERIFICATION_RESULT_V1',
  required: Object.freeze([
    'contract',
    'verificationId',
    'argv',
    'cwd',
    'commitSha',
    'exitCode',
    'enforcement',
    'passed',
  ]),
})

const COMMIT_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu
const MAX_EVIDENCE_BYTES = 16 * 1024

function nonEmptyText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} 必须是非空字符串`)
  }
  return value.trim()
}

function optionalBoolean(value, field) {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`${field} 必须是布尔值`)
  return value
}

function boundedEvidence(value, field) {
  if (value === undefined) return { text: undefined, truncated: false }
  if (typeof value !== 'string') throw new Error(`${field} 必须是字符串`)
  const content = Buffer.from(value, 'utf8')
  if (content.byteLength <= MAX_EVIDENCE_BYTES) return { text: value, truncated: false }
  return {
    text: content.subarray(content.byteLength - MAX_EVIDENCE_BYTES).toString('utf8'),
    truncated: true,
  }
}

function verificationEntries(verifications) {
  if (verifications instanceof Map) return [...verifications.values()]
  if (Array.isArray(verifications)) return verifications
  throw new Error('验证目录必须是数组或 Map')
}

export function parseCommitSha(value) {
  const digest = nonEmptyText(value, 'commitSha').toLowerCase()
  if (!COMMIT_SHA.test(digest)) {
    throw new Error('commitSha 必须是完整 Git commit SHA')
  }
  return digest
}

export function parseFixedArgv(value, verificationId = '验证') {
  if (!Array.isArray(value)) throw new Error(`验证 ${verificationId} 的 argv 必须是数组`)
  if (value.length === 0) throw new Error(`验证 ${verificationId} 的 argv 必须非空`)
  return Object.freeze(value.map((argument, index) => nonEmptyText(argument, `验证 ${verificationId} 的 argv[${index}]`)))
}

export function resolveBoundVerification({ task, verifications, verificationId }) {
  const id = nonEmptyText(verificationId, 'verificationId')
  const verification = verificationEntries(verifications).find(item => item?.id === id)
  if (verification === undefined) throw new Error(`未知验证 ID：${id}`)
  if (!Array.isArray(task?.verify) || !task.verify.includes(id)) {
    throw new Error(`验证 ${id} 未绑定当前任务 ${task?.id ?? 'unknown'}`)
  }
  const cwd = verification.cwd === undefined
    ? undefined
    : normalizeVerificationCwd(verification.cwd, `验证 ${id} 的 cwd`)
  return Object.freeze({
    id,
    argv: parseFixedArgv(verification.run, id),
    ...(cwd === undefined ? {} : { cwd }),
  })
}

export function createVerificationResult({
  verificationId,
  argv,
  cwd = '.',
  commitSha,
  exitCode,
  enforcement,
  approvalOutcome,
  ok,
  timedOut,
  aborted,
  kind,
  stdout,
  stderr,
  stdoutTruncated,
  stderrTruncated,
}) {
  const id = nonEmptyText(verificationId, 'verificationId')
  const fixedCwd = normalizeVerificationCwd(cwd, 'cwd')
  if (!Number.isInteger(exitCode)) throw new Error('exitCode 必须是整数')
  const fixedEnforcement = nonEmptyText(enforcement, 'enforcement')
  const hostOk = optionalBoolean(ok, 'ok')
  const hostTimedOut = optionalBoolean(timedOut, 'timedOut')
  const hostAborted = optionalBoolean(aborted, 'aborted')
  const hostKind = kind === undefined ? undefined : nonEmptyText(kind, 'kind')
  const hostStdout = boundedEvidence(stdout, 'stdout')
  const hostStderr = boundedEvidence(stderr, 'stderr')
  const hostStdoutTruncated = optionalBoolean(stdoutTruncated, 'stdoutTruncated')
  const hostStderrTruncated = optionalBoolean(stderrTruncated, 'stderrTruncated')
  const nativeApproval = approvalOutcome === undefined ? undefined : nonEmptyText(approvalOutcome, 'approvalOutcome')
  if (nativeApproval !== undefined && nativeApproval !== 'allowed-once') {
    throw new Error('approvalOutcome 只能是 allowed-once')
  }
  const result = {
    contract: VERIFICATION_RESULT_SCHEMA.contract,
    verificationId: id,
    argv: parseFixedArgv(argv, id),
    cwd: fixedCwd,
    commitSha: parseCommitSha(commitSha),
    exitCode,
    enforcement: fixedEnforcement,
  }
  if (nativeApproval !== undefined) result.approvalOutcome = nativeApproval
  if (hostOk !== undefined) result.ok = hostOk
  if (hostTimedOut !== undefined) result.timedOut = hostTimedOut
  if (hostAborted !== undefined) result.aborted = hostAborted
  if (hostKind !== undefined) result.kind = hostKind
  if (hostStdout.text !== undefined) result.stdout = hostStdout.text
  if (hostStderr.text !== undefined) result.stderr = hostStderr.text
  if (hostStdoutTruncated !== undefined || hostStdout.truncated) {
    result.stdoutTruncated = hostStdoutTruncated === true || hostStdout.truncated
  }
  if (hostStderrTruncated !== undefined || hostStderr.truncated) {
    result.stderrTruncated = hostStderrTruncated === true || hostStderr.truncated
  }
  const authorizedExecution = fixedEnforcement === 'full'
    || (fixedEnforcement === 'approved-host' && nativeApproval === 'allowed-once')
  result.passed = exitCode === 0
    && authorizedExecution
    && hostOk !== false
    && hostTimedOut !== true
    && hostAborted !== true
    && hostKind !== 'background'
  return Object.freeze(result)
}

export function parseVerificationResult(value) {
  if (value === null || typeof value !== 'object') throw new Error('验证结果必须是对象')
  if (value.contract !== VERIFICATION_RESULT_SCHEMA.contract) {
    throw new Error(`验证结果 contract 必须是 ${VERIFICATION_RESULT_SCHEMA.contract}`)
  }
  if (!Object.hasOwn(value, 'cwd')) throw new Error('验证结果必须包含 cwd 证据')
  const result = createVerificationResult(value)
  if (value.passed !== result.passed) throw new Error('验证结果 passed 与 exitCode/enforcement/宿主证据不一致')
  return result
}

export function isVerificationCurrent(result, currentCommitSha) {
  try {
    return parseVerificationResult(result).commitSha === parseCommitSha(currentCommitSha)
  } catch {
    return false
  }
}

export function assertPassingVerification(result, currentCommitSha) {
  let verified
  try {
    verified = parseVerificationResult(result)
  } catch (error) {
    throw new Error(`验证结果证据无效：${error.message}`)
  }
  if (!isVerificationCurrent(verified, currentCommitSha)) {
    throw new Error('验证结果已过期：工作区内容已变化，必须重新运行验证')
  }
  if (verified.enforcement !== 'full'
    && !(verified.enforcement === 'approved-host' && verified.approvalOutcome === 'allowed-once')) {
    throw new Error(`验证缺少 full enforcement 或原生一次性授权证据：${verified.enforcement}`)
  }
  if (verified.exitCode !== 0) {
    throw new Error(`验证 exitCode 不是 0：${verified.exitCode}`)
  }
  if (verified.ok === false) throw new Error('验证包含 ok:false 的失败宿主证据')
  if (verified.timedOut === true) throw new Error('验证包含 timedOut:true 的超时宿主证据')
  if (verified.aborted === true) throw new Error('验证包含 aborted:true 的中止宿主证据')
  if (verified.kind === 'background') throw new Error('验证包含后台宿主证据，不能通过')
  if (verified.passed !== true) throw new Error('验证结果 passed 证据不一致')
  return verified
}

export async function runBoundVerification({ task, verifications, verificationId, snapshotExecutor }) {
  const bound = resolveBoundVerification({ task, verifications, verificationId })
  if (snapshotExecutor === null || typeof snapshotExecutor?.run !== 'function') {
    throw new Error('快照验证执行器必须提供 run({ argv, cwd })')
  }
  const cwd = bound.cwd ?? '.'
  const evidence = await snapshotExecutor.run({ argv: bound.argv, cwd })
  // 部分 Harness Shell 载体对复合命令只返回 ok/kind，不携带 exitCode。
  // 明确 ok:true 等价于 0；其他缺失 exitCode 的结果统一归一化为 1。
  // background、超时和中止仍由 createVerificationResult 的宿主证据判定为失败。
  const exitCode = Number.isInteger(evidence?.exitCode)
    ? evidence.exitCode
    : evidence?.ok === true ? 0 : 1
  return createVerificationResult({
    verificationId: bound.id,
    argv: bound.argv,
    cwd,
    commitSha: evidence?.commitSha,
    exitCode,
    enforcement: evidence?.sandbox?.enforcement,
    approvalOutcome: evidence?.approvalOutcome,
    ok: evidence?.ok,
    timedOut: evidence?.timedOut,
    aborted: evidence?.aborted,
    kind: evidence?.kind,
    stdout: evidence?.stdout?.text,
    stderr: evidence?.stderr?.text,
    stdoutTruncated: evidence?.stdout?.truncated,
    stderrTruncated: evidence?.stderr?.truncated,
  })
}

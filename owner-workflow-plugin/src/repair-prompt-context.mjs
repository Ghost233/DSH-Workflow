import { kernelDigest } from './workflow-engine.mjs'

const EVIDENCE_TEXT_LIMIT = 2_048

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function copyJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function fields(entries) {
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined))
}

function evidenceText(value) {
  return typeof value === 'string' ? value.slice(0, EVIDENCE_TEXT_LIMIT) : undefined
}

function failedVerificationResult(result) {
  if (!plainObject(result) || result.passed === true) return null
  return fields([
    ['verificationId', result.verificationId],
    ['argv', Array.isArray(result.argv) ? copyJson(result.argv) : undefined],
    ['cwd', result.cwd],
    ['commitSha', result.commitSha],
    ['passed', result.passed],
    ['ok', result.ok],
    ['status', result.status],
    ['exitCode', result.exitCode],
    ['timedOut', result.timedOut],
    ['aborted', result.aborted],
    ['testStatus', result.testStatus],
    ['zeroTests', result.zeroTests],
    ['stdout', evidenceText(result.stdout)],
    ['stderr', evidenceText(result.stderr)],
    ['error', evidenceText(result.error)],
    ['evidenceRef', result.evidenceRef],
  ])
}

function verificationProjection(verification) {
  if (!plainObject(verification)) return undefined
  const review = plainObject(verification.review) ? fields([
    ['passed', verification.review.passed],
    ['commitSha', verification.review.commitSha],
    ['reasons', Array.isArray(verification.review.reasons) ? copyJson(verification.review.reasons) : undefined],
    ['evidenceRef', verification.review.evidenceRef],
    ['executionSettled', verification.review.executionSettled],
  ]) : undefined
  return fields([
    ['commitSha', verification.commitSha],
    ['passed', verification.passed],
    ['executionSettled', verification.executionSettled],
    ['results', Array.isArray(verification.results)
      ? verification.results.map(failedVerificationResult).filter(Boolean) : undefined],
    ['review', review],
  ])
}

/**
 * Project a durable Runtime repair into the facts needed by a model turn.
 * Candidate manifests, dependency preparation, and process settlement details
 * remain in Runtime state and are deliberately absent from this value.
 */
export function projectRepairForPrompt(repair) {
  if (!plainObject(repair)) return undefined
  const candidate = plainObject(repair.candidate) ? fields([
    ['repositoryRoot', repair.candidate.repositoryRoot],
    ['submissionArtifact', repair.candidate.submissionArtifact],
    ['commitSha', repair.candidate.commitSha],
    ['treeSha', repair.candidate.treeSha],
    ['baseCommit', repair.candidate.baseCommit],
  ]) : undefined
  return fields([
    ['fromAttemptId', repair.fromAttemptId],
    ['issueId', repair.issueId],
    ['instructions', repair.instructions],
    ['decisionRef', repair.decisionRef],
    ['candidate', candidate],
    ['verification', verificationProjection(repair.verification)],
  ])
}

function exactPersistedAction(state, action, kind) {
  if (!plainObject(state?.actions) || !plainObject(action) || action.kind !== kind) return null
  const persisted = state.actions[action.id]
  if (!persisted || persisted.kind !== kind || persisted.workflowId !== action.workflowId
    || persisted.attemptId !== action.attemptId || persisted.inputDigest !== action.inputDigest
    || typeof persisted.inputDigest !== 'string'
    || kernelDigest(persisted.input) !== persisted.inputDigest
    || kernelDigest(action.input) !== action.inputDigest) return null
  return persisted
}

function reviewerRepair(state, action) {
  const persisted = exactPersistedAction(state, action, 'verify_candidate')
  const workflow = persisted && state.workflows?.[persisted.workflowId]
  const attempt = workflow?.attempts?.[persisted.attemptId]
  const task = attempt && workflow.tasks?.[attempt.taskId]
  const dispatchedTask = attempt?.dispatchContract?.task
  if (!workflow || !attempt || !task || !dispatchedTask
    || task.attemptId !== attempt.id || task.definitionDigest !== attempt.definitionDigest
    || persisted.input?.task?.id !== attempt.taskId
    || kernelDigest(persisted.input.task) !== kernelDigest(dispatchedTask)
    || kernelDigest(persisted.input.candidate) !== kernelDigest(attempt.candidate)) return null

  const sources = Object.values(state.actions).filter(item => item?.kind === 'execute_owner'
    && item.workflowId === workflow.id && item.attemptId === attempt.id)
  if (sources.length !== 1) return null
  const source = sources[0]
  if (typeof source.inputDigest !== 'string' || kernelDigest(source.input) !== source.inputDigest
    || source.input?.task?.id !== attempt.taskId
    || kernelDigest(source.input.task) !== kernelDigest(dispatchedTask)
    || source.input.definitionDigest !== attempt.definitionDigest) return null
  return source.input.repair ?? null
}

/**
 * Return fields safe to spread into either the Owner default prompt or the
 * Reviewer custom prompt. Invalid or absent identity produces no repair field.
 */
export function repairPromptFields({ state, action, role }) {
  let repair = null
  if (role === 'owner') repair = exactPersistedAction(state, action, 'execute_owner')?.input?.repair ?? null
  else if (role === 'reviewer') repair = reviewerRepair(state, action)
  const projected = projectRepairForPrompt(repair)
  return projected ? { repair: projected } : {}
}

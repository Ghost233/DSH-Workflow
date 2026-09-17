import { readArtifact } from './effect-artifacts.mjs'
import { kernelDigest } from './workflow-engine.mjs'

const copy = value => JSON.parse(JSON.stringify(value))

/**
 * Load the exact durable Owner submission reviewed by one candidate action.
 * The full receipt remains a Runtime artifact; this projection excludes its
 * worktree and authority while retaining the report and immutable identities.
 */
export async function candidateSubmissionPromptFields({ state, action }) {
  const persisted = state?.actions?.[action?.id]
  const workflow = persisted && state.workflows?.[persisted.workflowId]
  const attempt = workflow?.attempts?.[persisted?.attemptId]
  const task = attempt && workflow.tasks?.[attempt.taskId]
  const dispatch = attempt?.dispatchContract
  const candidate = persisted?.input?.candidate
  const submission = attempt?.submission
  const mismatch = () => { throw new Error('Candidate submission review binding changed') }
  if (!persisted || persisted.kind !== 'verify_candidate' || action.kind !== 'verify_candidate'
    || persisted.workflowId !== action.workflowId || persisted.attemptId !== action.attemptId
    || typeof persisted.inputDigest !== 'string' || persisted.inputDigest !== action.inputDigest
    || kernelDigest(persisted.input) !== persisted.inputDigest || kernelDigest(action.input) !== action.inputDigest
    || !workflow || !attempt || !task || task.attemptId !== attempt.id
    || task.definitionDigest !== attempt.definitionDigest || !dispatch?.task || !dispatch.owner
    || kernelDigest(candidate) !== kernelDigest(attempt.candidate)
    || kernelDigest(persisted.input.task) !== kernelDigest(dispatch.task)
    || !submission || submission.id !== `sub-${attempt.id}`
    || typeof submission.artifact !== 'string' || candidate?.submissionArtifact !== submission.artifact
    || typeof submission.manifestDigest !== 'string') mismatch()

  const receipt = await readArtifact(submission.artifact)
  if (!receipt || kernelDigest(receipt) !== submission.manifestDigest
    || receipt.contract !== 'DSH_SUBMITTED_CANDIDATE_V1'
    || receipt.attemptId !== attempt.id || receipt.definitionDigest !== attempt.definitionDigest
    || receipt.authority !== attempt.authority || receipt.baseCommit !== candidate.baseCommit
    || kernelDigest(receipt.task) !== kernelDigest(dispatch.task)
    || kernelDigest(receipt.owner) !== kernelDigest(dispatch.owner)
    || kernelDigest(receipt.report) !== kernelDigest(submission.report)
    || !Array.isArray(receipt.paths)) mismatch()

  return { ownerSubmission: {
    submissionId: submission.id,
    artifact: submission.artifact,
    manifestDigest: submission.manifestDigest,
    attemptId: attempt.id,
    definitionDigest: attempt.definitionDigest,
    baseCommit: receipt.baseCommit,
    candidateCommitSha: candidate.commitSha,
    report: copy(receipt.report),
    paths: copy(receipt.paths),
  } }
}

import assert from 'node:assert/strict'
import { plannerSubmitDefinition, planReviewSubmitDefinition, ownerAdviceSubmitDefinition } from '../../index.js'
import { reconcileReviewConvergence } from '../../src/convergence.mjs'
import { createRecoverySessionFixture, readRecoverySessionState, mutateRecoverySessionState } from './recovery-session-fixture.mjs'
import { createRecoveryRuntimePolicy } from '../../src/recovery-policy.mjs'

export const review = { contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: 'Existing verification obligation remains.', issues: [{
  severity: 'medium', title: 'Local verification incomplete', detail: 'The repair must retain its verification.', suggestion: 'Resolve the existing obligation.',
  obligationId: 'r77-local-verification', sourceId: 'r77-prior-observation', sourceVersion: '1', targetTaskIds: ['T1'],
  closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' },
}] }
export const advice = ownerId => ({ contract: 'DSH_OWNER_PLANNING_ADVICE_V1', ownerId, scopeFit: 'full', facts: ['The local repair has a fixed unit obligation.'],
  constraints: ['Retain the approved active plan until candidate activation.'], suggestedNodes: [], dependencies: [], handoffs: [], risks: [], verificationSuggestions: ['Run the existing unit verification.'] })

export async function setup(t, { limit = 5, limits, policy = false, adviceScript, independent = false, reviewPayload = review, noOpenTargets = false, priorStrategies, candidateStrategy } = {}) {
  let payload
  const f = await createRecoverySessionFixture(t, { executable: true, includeIndependentOwner: independent,
    limits: limits ?? { totalLimit: limit, problemLimit: limit }, modelScript: m => [
      () => m.toolCallResponse('r77-planner', 'workflow_plan_submit', { plan: payload }), 'hang-slow',
      m.toolCallResponse('r77-predecessor-review', 'workflow_plan_review_submit', { review: reviewPayload }), 'hang-slow',
      ...(adviceScript?.(m) ?? [m.toolCallResponse('r77-advice', 'workflow_owner_advice_submit', { advice: advice('api') }), 'hang-slow']),
    ] })
  f.ctx.tools.register(plannerSubmitDefinition(f.runtime)); f.ctx.tools.register(planReviewSubmitDefinition(f.runtime)); f.ctx.tools.register(ownerAdviceSubmitDefinition(f.runtime))
  if (policy) await mutateRecoverySessionState(f, state => {
    state.recoveryRuntimePolicy = createRecoveryRuntimePolicy()
    state.recoveryRuntimeRequired = state.recoveryRuntimePolicy.contract
    state.recoveryProtocol = state.recoveryRuntimePolicy.recoveryProtocol
  })
  const state = await readRecoverySessionState(f)
  payload = { ...structuredClone(state.plan), summary: 'R77 recovery candidate', owners: state.plan.owners.map(o => ({ id: o.id })) }
  const stage = state.plan.tasks[0], owner = state.plan.owners.find(o => o.id === stage.ownerId)
  await f.runtime.recordHandoffs(state, stage, { owner, branch: 'fixture-owner' }, { status: 'blocked', handoffs: [{ targetType: 'owner', targetOwnerId: owner.id, files: ['src/api/repair.mjs'], summary: 'Local repair.' }] })
  await f.runtime.replanHandoffs(f.admissionAgent, f.workflowId)
  // Controlled prior finite strategy history is fixture input. The predecessor
  // Review itself is paid and its convergence is never edited after acceptance.
  await mutateRecoverySessionState(f, s => {
    s.planConvergence = reconcileReviewConvergence({ candidate: s.pendingPlanRevision, review: reviewPayload, evidenceDigest: 'r77-prior', time: '2026-09-11T00:00:00Z' })
    s.planConvergence.usedStrategies = priorStrategies ?? ['local_subgraph_rewrite', 'diagnose', 'owner_council']
    if (candidateStrategy) s.pendingPlanRevision.strategy = candidateStrategy
    if (noOpenTargets) s.planConvergence.obligations = []
  })
  await f.runtime.reviewPendingPlanRevision(f.admissionAgent)
  const reviewed = await readRecoverySessionState(f)
  assert.equal(reviewed.planConvergence.nextStrategy, 'arbitrate')
  assert.equal(reviewed.recoveryAdmission.budget.totalUsed, 2)
  assert.equal((await f.runtime.reviewRecoveryCandidate(f.admissionAgent, f.workflowId, undefined, { replayOnly: true })).replayed, true)
  return f
}

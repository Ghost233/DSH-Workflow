import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
// Archived pre-gate script. It was executed against the runtime SHA-256 printed
// in development-pre-gate.log; the current production Runtime may now reject it.
import { plannerSubmitDefinition, planReviewSubmitDefinition } from '../../../../../owner-workflow-plugin/index.js'
import { createRecoverySessionFixture, readRecoverySessionState, mutateRecoverySessionState } from '../../../../../owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs'

const ownerAdvice = {
  contract: 'DSH_OWNER_PLANNING_ADVICE_V1',
  ownerId: 'api',
  scopeFit: 'full',
  facts: ['The active API Owner remains the relevant consultation source.'],
  constraints: ['Do not alter the recovery candidate while only testing arbitration reachability.'],
  suggestedNodes: [],
  dependencies: [],
  handoffs: [],
  risks: [],
  verificationSuggestions: [],
}

async function setupExhaustedRecoveryCandidate(t) {
  let payload
  const f = await createRecoverySessionFixture(t, {
    executable: true,
    limits: { totalLimit: 1, problemLimit: 1 },
    // The first response is the paid recovery Planner.  The following finite
    // responses make direct arbitration's unmetered Owner consult and invalid
    // Reviewer retries observable without a hanging transport.
    modelScript: m => [
      () => m.toolCallResponse('paid-recovery-planner', 'workflow_plan_submit', { plan: payload }),
      'hang-slow',
      m.textResponse(JSON.stringify(ownerAdvice)),
      m.textResponse('{}'),
      m.textResponse('{}'),
    ],
  })
  f.ctx.tools.register(plannerSubmitDefinition(f.runtime))
  f.ctx.tools.register(planReviewSubmitDefinition(f.runtime))
  const state = await readRecoverySessionState(f)
  payload = {
    ...structuredClone(state.plan),
    summary: 'R75 recovery candidate for arbitration bypass proof',
    owners: state.plan.owners.map(owner => ({ id: owner.id })),
  }
  const stage = state.plan.tasks[0]
  const owner = state.plan.owners.find(item => item.id === stage.ownerId)
  await f.runtime.recordHandoffs(state, stage, { owner, branch: 'fixture-owner' }, {
    status: 'blocked',
    handoffs: [{ targetType: 'owner', targetOwnerId: owner.id, files: ['src/api/repair.mjs'], summary: 'Bounded local repair.' }],
  })
  await f.runtime.replanHandoffs(f.admissionAgent, f.workflowId)
  return f
}

function arbitrationConvergence(candidate) {
  return {
    contract: 'DSH_WORKFLOW_CONVERGENCE_V1',
    runtimeVersion: 'r75-pre-gate-proof',
    cycleId: candidate.cycleId ?? `candidate-${candidate.number}`,
    evidenceDigest: 'r75-pre-gate-evidence',
    obligations: [{
      id: 'r75-fixed-verification',
      category: 'plan_verification_binding',
      severity: 'high',
      title: 'Unit verification remains a frozen recovery obligation',
      detail: 'The recovery candidate must preserve the existing required unit verification.',
      suggestion: 'Arbitrate only the already-persisted obligation.',
      source: { id: 'r75-pre-gate', version: '1' },
      targetTaskIds: ['T1'],
      closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
      status: 'open',
    }],
    unsupportedNewObligations: [],
    usedStrategies: ['local_subgraph_rewrite', 'diagnose', 'owner_council'],
    nextStrategy: 'arbitrate',
    history: [],
  }
}

test('R75 pre-gate proof: direct recovery arbitration bypasses an exhausted admission budget and starts real model transports', { timeout: 30_000 }, async t => {
  const f = await setupExhaustedRecoveryCandidate(t)
  const admitted = await readRecoverySessionState(f)
  assert.equal(admitted.recoveryAdmission.budget.totalUsed, 1)
  assert.equal(admitted.recoveryAdmission.budget.totalLimit, 1)
  assert.ok(admitted.pendingPlanRevision?.recoveryOrigin)

  const before = await mutateRecoverySessionState(f, state => {
    state.planConvergence = arbitrationConvergence(state.pendingPlanRevision)
  })
  const modelRequestsBefore = f.adapter.requests.length
  const runtimeSource = await readFile(join(process.cwd(), 'owner-workflow-plugin/src/runtime.mjs'))
  const runtimeSha256 = createHash('sha256').update(runtimeSource).digest('hex')

  await assert.rejects(
    f.runtime.arbitratePendingPlanRevision(f.admissionAgent, undefined, { source: 'r75-pre-gate-direct' }),
    /Planner Reviewer|status|JSON/,
  )

  const after = await readRecoverySessionState(f)
  const modelRequestsAfter = f.adapter.requests.length
  assert.ok(modelRequestsAfter > modelRequestsBefore,
    `expected real model transport beyond exhausted budget (${modelRequestsBefore} -> ${modelRequestsAfter})`)
  assert.equal(after.recoveryAdmission.budget.totalUsed, before.recoveryAdmission.budget.totalUsed)
  assert.deepEqual(after.recoveryAdmission.budget.attempts, before.recoveryAdmission.budget.attempts)
  assert.equal(after.pendingPlanRevision.planDigest, before.pendingPlanRevision.planDigest)
  assert.equal(after.pendingPlanRevision.review, undefined)
  t.diagnostic(JSON.stringify({
    proof: 'R75 pre-gate direct arbitration reachability',
    route: 'direct runtime.arbitratePendingPlanRevision',
    runtimeSha256,
    recoveryCandidate: true,
    totalLimit: after.recoveryAdmission.budget.totalLimit,
    totalUsedBefore: before.recoveryAdmission.budget.totalUsed,
    totalUsedAfter: after.recoveryAdmission.budget.totalUsed,
    modelRequestsBefore,
    modelRequestsAfter,
    newModelRequests: modelRequestsAfter - modelRequestsBefore,
    candidateReviewPersisted: after.pendingPlanRevision.review !== undefined,
  }))
})

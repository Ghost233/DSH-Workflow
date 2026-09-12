import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createRecoveryRuntimePolicy,
  normalizeRecoveryRuntimePolicy,
  recoveryAdmissionConfigFor,
  RECOVERY_RUNTIME_POLICY_CONTRACT,
  RECOVERY_RUNTIME_POLICY_SOURCE,
} from '../src/recovery-policy.mjs'
import { assertRecoveryAdmissionState } from '../src/recovery-admission.mjs'
import { createRecoveryBudget, registerRecoveryProblem, reserveRecoveryAttempt } from '../src/recovery-budget.mjs'

test('T19 new Workflow policy freezes the measured finite V1 values', () => {
  const policy = createRecoveryRuntimePolicy()
  assert.deepEqual(policy, {
    contract: RECOVERY_RUNTIME_POLICY_CONTRACT,
    version: 1,
    source: RECOVERY_RUNTIME_POLICY_SOURCE,
    recoveryProtocol: 'DSH_RECOVERY_ADMISSION_V1',
    totalLimit: 12,
    problemLimit: 8,
    ownerAttemptDeadline: 'approved_task_on_timeout',
    ownerTerminationObservationMs: 30_000,
  })
  const second = createRecoveryRuntimePolicy()
  policy.totalLimit = 1
  assert.equal(second.totalLimit, 12)
  assert.deepEqual(recoveryAdmissionConfigFor(second, 'plan-v1'), {
    contract: 'DSH_RECOVERY_ADMISSION_CONFIG_V1',
    executionVersion: 'plan-v1',
    totalLimit: 12,
    problemLimit: 8,
  })
})

test('T19 policy import rejects missing, unknown, and locally changed configuration', () => {
  const base = createRecoveryRuntimePolicy()
  for (const mutation of [
    policy => { delete policy.source },
    policy => { policy.version = 2 },
    policy => { policy.source = 'unreviewed-local-value' },
    policy => { policy.recoveryProtocol = 'future' },
    policy => { policy.totalLimit = 13 },
    policy => { policy.problemLimit = 9 },
    policy => { policy.ownerAttemptDeadline = 'runtime_global' },
    policy => { policy.ownerTerminationObservationMs = 1 },
    policy => { policy.extra = true },
  ]) {
    const value = structuredClone(base)
    mutation(value)
    assert.throws(() => normalizeRecoveryRuntimePolicy(value), /recovery_runtime_policy/u)
  }
  assert.throws(() => recoveryAdmissionConfigFor(base, ''), /execution_version/u)
})

test('T19 persisted policy and admission limits must remain one immutable binding', () => {
  const policy = createRecoveryRuntimePolicy()
  const state = {
    id: 'wf-t19-policy',
    planDigest: 'plan-v1',
    planApproved: true,
    recoveryRuntimeRequired: RECOVERY_RUNTIME_POLICY_CONTRACT,
    recoveryProtocol: policy.recoveryProtocol,
    recoveryRuntimePolicy: policy,
    recoveryAdmissionConfig: recoveryAdmissionConfigFor(policy, 'plan-v1'),
  }
  assert.doesNotThrow(() => assertRecoveryAdmissionState(state))
  state.recoveryAdmissionConfig.totalLimit += 1
  assert.throws(() => assertRecoveryAdmissionState(state), /recovery_runtime_policy_binding_invalid/u)
  state.recoveryAdmissionConfig.totalLimit -= 1
  delete state.recoveryRuntimePolicy
  assert.throws(() => assertRecoveryAdmissionState(state), /recovery_runtime_policy_missing/u)
})

test('T19 frozen 12/8 limits preserve both problem and Workflow exhaustion', () => {
  const policy = createRecoveryRuntimePolicy()
  let ledger = createRecoveryBudget({ workflowId: 'wf-t19-policy', totalLimit: policy.totalLimit })
  for (const root of ['root-a', 'root-b']) {
    ledger = registerRecoveryProblem(ledger, {
      rootProblemId: root,
      limit: policy.problemLimit,
      source: { id: `${root}-source`, version: 'plan-v1' },
    })
  }
  const reserve = (rootProblemId, ordinal) => reserveRecoveryAttempt(ledger, {
    workflowId: 'wf-t19-policy', rootProblemId,
    requestId: `${rootProblemId}-request-${ordinal}`,
    attemptId: `${rootProblemId}-attempt-${ordinal}`,
    taskId: rootProblemId === 'root-a' ? 'T1' : 'T2',
    ownerId: rootProblemId === 'root-a' ? 'api' : 'worker',
    executionVersion: 'plan-v1',
  })
  for (let ordinal = 1; ordinal <= 8; ordinal += 1) ledger = reserve('root-a', ordinal).ledger
  assert.equal(reserve('root-a', 9).reason, 'problem_exhausted')
  for (let ordinal = 1; ordinal <= 4; ordinal += 1) ledger = reserve('root-b', ordinal).ledger
  assert.equal(reserve('root-b', 5).reason, 'workflow_exhausted')
  assert.equal(ledger.totalUsed, 12)
  assert.deepEqual(ledger.problems.map(problem => problem.used), [8, 4])
})

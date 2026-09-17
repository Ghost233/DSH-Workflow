import test from 'node:test'
import assert from 'node:assert/strict'
import { assertRecoveryAdmissionState } from '../src/recovery-admission.mjs'

// The remaining production consumer is the read-only legacy import guard.
// Active recovery accounting is exercised through workflow-engine/store tests.
function historicalState() {
  return { id: 'historical-workflow', planDigest: 'frozen-plan', recoveryProtocol: 'DSH_RECOVERY_ADMISSION_V1',
    recoveryAdmissionConfig: { contract: 'DSH_RECOVERY_ADMISSION_CONFIG_V1', executionVersion: 'frozen-plan', totalLimit: 12, problemLimit: 8 } }
}

test('legacy admission validation is read-only and accepts a valid unspent bound account', () => {
  const state = historicalState(), before = structuredClone(state)
  assert.doesNotThrow(() => assertRecoveryAdmissionState(state))
  assert.deepEqual(state, before)
})

test('legacy import cannot silently reset malformed budgets or change their plan authority', () => {
  for (const mutate of [
    state => { delete state.recoveryAdmissionConfig },
    state => { state.recoveryProtocol = 'unknown' },
    state => { state.recoveryAdmissionConfig.executionVersion = 'other-plan' },
    state => { state.recoveryAdmissionConfig.totalLimit = 0 },
    state => { state.recoveryAdmissionConfig.problemLimit = -1 },
    state => { state.recoveryAdmission = { budget: { totalUsed: 0 } } },
    state => { state.recoveryRuntimeRequired = 'DSH_RECOVERY_RUNTIME_POLICY_V1' },
  ]) {
    const state = historicalState(); mutate(state)
    const before = structuredClone(state)
    assert.throws(() => assertRecoveryAdmissionState(state), /invalid|missing|mismatch/)
    assert.deepEqual(state, before, 'rejected historical records must remain intact')
  }
})

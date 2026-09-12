import assert from 'node:assert/strict'
import { createRecoverySessionFixture, reserveRecoverySession, readRecoverySessionState } from '../../../../../owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs'
const cleanup = []
const fixture = await createRecoverySessionFixture({ after(fn) { cleanup.push(fn) } })
let held
try {
  const receipt = await reserveRecoverySession(fixture)
  const before = await readRecoverySessionState(fixture)
  held = await fixture.runtime.acquireOwnerLease(fixture.root, 'api', fixture.workflowId, 'T1')
  assert.equal(held.owned, true)
  let observed
  try {
    observed = { kind: 'returned', value: await fixture.runtime.reconcileRecoverySession(fixture.admissionAgent, fixture.workflowId, {
      contract: 'DSH_RECOVERY_SESSION_REQUEST_V1', taskId: 'T1', ownerId: 'api', requestId: receipt.requestId,
      prompt: { id: receipt.executionIdentity.promptId, content: 'recover the failed owner task' },
    }) }
  } catch (error) { observed = { kind: 'threw', message: error.message } }
  const after = await readRecoverySessionState(fixture)
  assert.deepEqual(after, before)
  assert.equal(await fixture.readRaw(receipt.executionIdentity.sessionId), undefined)
  assert.equal(fixture.adapter.requests.length, 0)
  console.log(JSON.stringify({ observed, workflowUnchanged: true, rawArtifactAbsent: true, modelRequests: 0 }, null, 2))
} finally {
  if (held?.owned) await fixture.runtime.releaseOwnerLease(held.lease)
  for (const fn of cleanup.reverse()) await fn()
}

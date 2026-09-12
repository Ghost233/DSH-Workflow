import assert from 'node:assert/strict'
import { reconcileReviewConvergence } from '../../../../../owner-workflow-plugin/src/convergence.mjs'

const baseIssue = {
  obligationId: 'acceptance-t03', sourceId: 'AC-15', sourceVersion: 'R4', targetTaskIds: ['T1'],
  closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' },
  severity: 'high', title: '等待当前验证结果', detail: '必须取得当前结果', suggestion: '执行验证',
}
const file = (taskId, content) => ({ taskId, path: `src/${taskId}.mjs`, kind: 'file', sha256: content.repeat(64) })
let state
const trace = []
function step(label, issue, files, expectedProgress) {
  const planDigest = (trace.length % 2 ? 'b' : 'a').repeat(64)
  state = reconcileReviewConvergence({
    previous: state,
    candidate: { cycleId: 'accept-t03', planDigest, planStructureDigest: 'constant-structure',
      strategy: state?.nextStrategy === 'autonomous_incident' ? undefined : state?.nextStrategy },
    review: { status: 'needs_revision', summary: label, issues: [issue] },
    evidenceDigest: `untrusted-diagnostic-${trace.length}`,
    time: new Date(Date.UTC(2026, 8, 10, 12, 0, trace.length)).toISOString(),
    runtimeEvidence: { planDigest, verifiedFiles: files },
  })
  assert.equal(state.progress, expectedProgress, label)
  assert.ok(state.obligations.some(item => item.id === baseIssue.obligationId && item.status === 'open'))
  trace.push({ label, progress: state.progress, nextStrategy: state.nextStrategy,
    usedStrategies: state.usedStrategies, seenFactCount: state.seenEvidenceFacts.length,
    renewals: state.localStrategyRenewals, unsupported: state.unsupportedNewObligations.map(item => item.id) })
}
step('seed same-target physical fact A', baseIssue, [file('T1', 'a')], 'none')
for (let i = 0; i < 30; i++) {
  step(`same T1/file/hash, new obligation and source ${i}`,
    { ...baseIssue, obligationId: `relabeled-${i}`, sourceId: `source-${i}`, sourceVersion: `revision-${i}` },
    [file('T1', 'a')], 'none')
  assert.equal(state.unsupportedNewObligations.length, 1)
  assert.equal(state.localStrategyRenewals.length, 0)
}
assert.equal(state.nextStrategy, 'autonomous_incident')
step('unrelated T2 content is not T1 progress', baseIssue, [file('T1', 'a'), file('T2', 'c')], 'none')
assert.equal(state.nextStrategy, 'autonomous_incident')
const usedBefore = [...state.usedStrategies]
step('new relevant T1 content B', baseIssue, [file('T1', 'b')], 'new_evidence')
assert.deepEqual(state.usedStrategies, usedBefore)
assert.equal(state.nextStrategy, 'local_subgraph_rewrite')
assert.equal(state.localStrategyRenewals.length, 1)
assert.equal(state.localStrategyRenewals[0].status, 'consumed')
step('repeat relevant B', baseIssue, [file('T1', 'b')], 'none')
assert.equal(state.nextStrategy, 'autonomous_incident')
for (let i = 0; i < 10; i++) {
  step(`recycle A/B ${i}`, baseIssue, [file('T1', i % 2 ? 'b' : 'a')], 'none')
  assert.equal(state.nextStrategy, 'autonomous_incident')
  assert.equal(state.localStrategyRenewals.length, 1)
}
console.log(JSON.stringify({ status: 'passed', checks: ['same-target relabeling (30 rounds)', 'unrelated content', 'one relevant renewal', 'duplicate and recycled content (10 rounds)', 'no implicit closure'], trace }, null, 2))

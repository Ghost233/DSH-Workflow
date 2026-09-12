import { readFile } from 'node:fs/promises'
import { executionFeedbackFixture, executionFeedback } from './fixtures.mjs'
let failures = 0
for (const scenario of [
  { mode: 'permission', error: '连接失败', expected: 'request_user_authority' },
  { mode: 'permission', error: 'token budget exhausted', expected: 'request_user_authority' },
  { mode: 'business', error: 'token budget exhausted', expected: 'request_user_authority' },
  { mode: 'technical', error: 'token budget exhausted', expected: 'local_subgraph_rewrite' },
]) {
  const f = await executionFeedbackFixture()
  try {
    const admitted = await f.runtime.recordOwnerExecutionDeviation(executionFeedback(scenario.mode), f.exec)
    await f.runtime.failSupervisorReservation(f.agent, f.state.id, f.key, new Error(scenario.error))
    const state = JSON.parse(await readFile(f.statePath, 'utf8'))
    const task = state.tasks.find(task => task.taskId === 'T1')
    const actual = task.autonomousRecovery.strategy
    const pass = actual === scenario.expected
    if (!pass) failures += 1
    console.log(JSON.stringify({ scenario, pass, actual, failureClass: task.autonomousRecovery.failureClass,
      taskStatus: task.status, action: task.action, notifications: Object.keys(state.mainOutbox ?? {}).length,
      source: admitted.classificationBasis.source, retainedDeviationId: state.ownerRuns[f.key].executionDeviation.deviationId,
      admittedDeviationId: admitted.deviationId }))
  } finally { await f.cleanup() }
}
console.log(JSON.stringify({ cases: 4, failures }))
process.exitCode = failures === 0 ? 0 : 1

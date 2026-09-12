import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { executionFeedbackFixture, createOwnerWorkflowRuntime, request, normalizePlanV2 } from './fixtures.mjs'

// Bound all experiments. New Runtime objects reload persisted state; this is
// restart simulation, not SIGKILL/power-loss or a real model execution.
const scenarios = ['stable-restart', 'duplicate-before-launch', 'unrelated-file-facts', 'replayed-file-facts', 'policy-one-attempt']
for (const scenario of scenarios) {
  const began = performance.now()
  const f = await executionFeedbackFixture()
  const steps = []
  let launched = 0
  try {
    f.runtime.activeOwners.delete(f.active.sessionId)
    await f.runtime.releaseOwnerLease(f.active.lease)
    await f.runtime.dispose()
    let initial = JSON.parse(await readFile(f.statePath, 'utf8'))
    initial.ownerRuns[f.key].status = 'failed'
    initial.ownerRuns[f.key].error = 'token budget exhausted'
    if (scenario === 'policy-one-attempt') {
      initial.plan.tasks[0].onFailure = { action: 'repair_owner', maxAttempts: 1 }
      initial.plan = normalizePlanV2(initial.plan)
      initial.planDigest = createHash('sha256').update(JSON.stringify(initial.plan)).digest('hex')
      initial.planReviewDigest = initial.planDigest
      initial.ownerRuns[f.key].planDigest = initial.planDigest
    }
    await writeFile(f.statePath, JSON.stringify(initial))
    for (let i = 0; i < 8; i += 1) {
      const rt = createOwnerWorkflowRuntime({}, {})
      const started = performance.now()
      try {
        const before = JSON.parse(await readFile(f.statePath, 'utf8'))
        if (scenario !== 'duplicate-before-launch') {
          before.ownerRuns[f.key].status = 'failed'
          before.ownerRuns[f.key].error = 'token budget exhausted'
        }
        if (scenario === 'unrelated-file-facts' || scenario === 'replayed-file-facts') {
          const content = scenario === 'unrelated-file-facts' ? `T2 independent value ${i}` : `T1 replay value ${i % 2}`
          const path = scenario === 'unrelated-file-facts' ? 't09-independent.txt' : 't09-replay.txt'
          await writeFile(`${f.root}/${path}`, content)
          const sha256 = createHash('sha256').update(await readFile(`${f.root}/${path}`)).digest('hex')
          // Controlled persisted Runtime-fact fixture, backed by real local
          // file bytes; does not test the production fact collector.
          before.planningRuntimeFacts = { verifiedFiles: [{ taskId: scenario === 'unrelated-file-facts' ? 'T2' : 'T1', path, kind: 'file', sha256 }] }
        }
        await writeFile(f.statePath, JSON.stringify(before))
        let persistedAtLaunch
        rt.runExternalOwner = async () => {
          launched += 1
          const state = JSON.parse(await readFile(f.statePath, 'utf8'))
          persistedAtLaunch = { attempt: state.ownerRuns[f.key].attempt, recoveryCount: state.ownerRuns[f.key].recoveryCount,
            usedStrategies: state.ownerRuns[f.key].autonomousRecovery?.usedStrategies }
          throw new Error('T09_PRE_LAUNCH_CRASH')
        }
        let result, error
        try { result = await rt.recoverOwner(f.agent, f.state.id, 'T1', f.active.owner.id) }
        catch (e) { error = e.message; if (error !== 'T09_PRE_LAUNCH_CRASH') throw e }
        const state = JSON.parse(await readFile(f.statePath, 'utf8'))
        const task = state.tasks.find(t => t.taskId === 'T1')
        const recovery = task.autonomousRecovery ?? state.ownerRuns[f.key].autonomousRecovery
        steps.push({ step: i + 1, strategy: recovery?.strategy, used: recovery?.usedStrategies,
          evidenceDigest: recovery?.evidenceDigest, workflowStatus: state.status, taskStatus: task.status,
          t2Status: state.tasks.find(t => t.taskId === 'T2').status, recoveryCount: state.ownerRuns[f.key].recoveryCount,
          attempt: state.ownerRuns[f.key].attempt, persistedAtLaunch, result, error, ms: performance.now() - started })
        if (recovery?.strategy === 'autonomous_incident') {
          const manifest = await rt.ensureControlBridge(f.agent, state)
          steps.at(-1).supervisorNext = await request(manifest, 'supervisor-next')
          rt.queueSupervisorReservations = () => undefined
          try { steps.at(-1).ack = await request(manifest, 'supervisor-ack', { actionId: steps.at(-1).supervisorNext.actionId }) }
          catch (e) { steps.at(-1).ackError = e.message }
          break
        }
      } finally { await rt.dispose() }
    }
    console.log(JSON.stringify({ scenario, launched, boundedAt: 8, elapsedMs: performance.now() - began, steps }))
  } catch (e) {
    console.log(JSON.stringify({ scenario, probeError: e.stack, steps }))
    process.exitCode = 1
  } finally { await f.cleanup() }
}

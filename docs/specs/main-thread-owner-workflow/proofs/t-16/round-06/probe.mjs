import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, basename } from 'node:path'
import { performance } from 'node:perf_hooks'

import {
  reopenRecoverySessionFixture,
  readRecoverySessionState,
} from '../../../../../../owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs'

const ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url))
const TSX = join(ROOT, 'deepseek-harness/node_modules/tsx/dist/esm/index.mjs')
const PRIMARY = fileURLToPath(new URL('./primary.mjs', import.meta.url))
const OWNER_ID = 'api'
const TASK_ID = 'T1'
const LIMIT_MS = 8_000

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

function within(promise, timeoutMs, label) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms`)), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timer))
}

async function settled(promise) {
  return promise.then(
    value => ({ state: 'fulfilled', value }),
    error => ({ state: 'rejected', error: errorText(error) }),
  )
}

function terminals(read) {
  return read.events
    .filter(event => event.type === 'turn/end')
    .map(event => ({ seq: event.seq, reason: event.data.reason.kind }))
}

function startPrimary() {
  const child = spawn(process.execPath, ['--import', TSX, PRIMARY], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  let stderr = ''
  let buffer = ''
  const rows = []
  child.stderr.on('data', chunk => { stderr += chunk })
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      buffer += chunk
      for (;;) {
        const index = buffer.indexOf('\n')
        if (index < 0) break
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        if (!line) continue
        try {
          const row = JSON.parse(line)
          rows.push(row)
          if (row.type === 'ready') resolve(row)
        } catch {
          rows.push({ raw: line })
        }
      }
    })
    child.once('exit', (code, signal) => {
      reject(new Error(`primary exited before ready: ${code}/${signal}; ${stderr}`))
    })
  })
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
  return { child, ready, exited, diagnostics: () => ({ rows, stderr }) }
}

/**
 * Pure reference model only. Runtime does not currently persist this journal.
 * The nonincreasing ceiling is the durable safety fact; wall clock is merely a
 * second upper bound. Monotonic elapsed time is used while bootId is stable.
 */
function observeDeadline(journal, clock) {
  assert.ok(Number.isSafeInteger(clock.wallNowMs))
  assert.ok(Number.isSafeInteger(clock.monoNowMs))
  if (clock.bootId !== journal.bootId && clock.wallNowMs < journal.wallObservedAtMs) {
    return {
      ...journal,
      bootId: clock.bootId,
      wallObservedAtMs: clock.wallNowMs,
      monoObservedAtMs: clock.monoNowMs,
      remainingCeilingMs: 0,
      status: 'technical_pause_clock_rollback',
    }
  }
  const monotonicRemaining = clock.bootId === journal.bootId
    ? Math.max(0, journal.remainingCeilingMs - Math.max(0, clock.monoNowMs - journal.monoObservedAtMs))
    : journal.remainingCeilingMs
  const absoluteRemaining = Math.max(0, journal.deadlineAtEpochMs - clock.wallNowMs)
  const remainingCeilingMs = Math.min(journal.remainingCeilingMs, monotonicRemaining, absoluteRemaining)
  return {
    ...journal,
    bootId: clock.bootId,
    wallObservedAtMs: clock.wallNowMs,
    monoObservedAtMs: clock.monoNowMs,
    remainingCeilingMs,
    status: remainingCeilingMs === 0 ? 'expired' : 'active',
  }
}

function proveDeadlineReference() {
  const started = {
    contract: 'T16_DEADLINE_JOURNAL_REFERENCE_V1',
    bootId: 'boot-A',
    deadlineAtEpochMs: 16_000,
    wallObservedAtMs: 10_000,
    monoObservedAtMs: 500,
    remainingCeilingMs: 6_000,
    status: 'active',
  }
  const advanced = observeDeadline(started, { bootId: 'boot-A', wallNowMs: 12_000, monoNowMs: 2_500 })
  assert.equal(advanced.remainingCeilingMs, 4_000)
  const sameBootRollback = observeDeadline(advanced, { bootId: 'boot-A', wallNowMs: 11_500, monoNowMs: 2_700 })
  assert.equal(sameBootRollback.remainingCeilingMs, 3_800)
  assert.ok(sameBootRollback.remainingCeilingMs <= advanced.remainingCeilingMs)
  const restartForward = observeDeadline(sameBootRollback, { bootId: 'boot-B', wallNowMs: 12_100, monoNowMs: 100 })
  assert.equal(restartForward.remainingCeilingMs, 3_800)
  assert.ok(restartForward.remainingCeilingMs <= sameBootRollback.remainingCeilingMs)
  const restartRollback = observeDeadline(restartForward, { bootId: 'boot-C', wallNowMs: 12_000, monoNowMs: 50 })
  assert.equal(restartRollback.status, 'technical_pause_clock_rollback')
  assert.equal(restartRollback.remainingCeilingMs, 0)
  const expired = observeDeadline(started, { bootId: 'boot-D', wallNowMs: 16_000, monoNowMs: 50 })
  assert.equal(expired.status, 'expired')
  assert.equal(expired.remainingCeilingMs, 0)
  return {
    contract: started.contract,
    advancedRemainingMs: advanced.remainingCeilingMs,
    sameBootRollbackRemainingMs: sameBootRollback.remainingCeilingMs,
    restartForwardRemainingMs: restartForward.remainingCeilingMs,
    restartRollback: restartRollback.status,
    expired: expired.status,
  }
}

async function proveSigkillReconciliation() {
  const primary = startPrimary()
  let root
  let reopened
  try {
    const ready = await within(primary.ready, LIMIT_MS, 'primary cancellation readiness')
    root = ready.root
    assert.notEqual(ready.pid, process.pid)
    assert.ok(basename(root).startsWith('dsh-t22-tests-r16-'))
    assert.equal(ready.cancelReturn, 'undefined')
    assert.deepEqual(ready.terminal, [])

    const leasePath = join(root, '.dsh-workflow', 'leases', 'owner-api.lock', 'lease.json')
    const leaseBeforeKill = JSON.parse(await readFile(leasePath, 'utf8'))
    assert.equal(leaseBeforeKill.pid, ready.pid)
    assert.equal(leaseBeforeKill.token, ready.leaseToken)

    primary.child.kill('SIGKILL')
    const exit = await within(primary.exited, LIMIT_MS, 'primary SIGKILL exit')
    assert.deepEqual(exit, { code: null, signal: 'SIGKILL' })
    const leaseAfterKill = JSON.parse(await readFile(leasePath, 'utf8'))
    assert.equal(leaseAfterKill.pid, ready.pid)
    assert.equal(leaseAfterKill.token, ready.leaseToken)

    reopened = await reopenRecoverySessionFixture({
      root,
      workflowId: ready.workflowId,
      executable: true,
      modelScript: () => [],
    })
    const persisted = await reopened.readFrom(ready.sessionId)
    const raw = await reopened.readRaw(ready.sessionId)
    assert.ok(raw?.content)
    assert.deepEqual(terminals(persisted), [])

    const beforeRecovery = await readRecoverySessionState(reopened)
    const oldRecord = beforeRecovery.ownerRuns['T1:api']
    assert.equal(oldRecord.status, 'running')
    assert.equal(oldRecord.attempt, 1)
    assert.equal(oldRecord.leaseToken, ready.leaseToken)

    // This calls the runtime's actual stale-PID lease path.  It can take a
    // properly recorded dead process lease immediately; it is not a mocked
    // lease result or direct lease-file rewrite.
    const takeover = await reopened.runtime.withOwnerLease(
      root,
      OWNER_ID,
      ready.workflowId,
      TASK_ID,
      undefined,
      async lease => await reopened.runtime.assertOwnerLease(lease),
    )
    assert.equal(takeover.pid, process.pid)
    assert.notEqual(takeover.token, ready.leaseToken)

    // Existing recovery refuses a record whose task is still running. This
    // tests the real recovery entry against the durable crash facts.
    const recovery = await within(settled(reopened.runtime.recoverOwner(
      reopened.admissionAgent,
      ready.workflowId,
      TASK_ID,
      OWNER_ID,
    )), LIMIT_MS, 'recoverOwner after controller SIGKILL')
    assert.equal(recovery.state, 'fulfilled')
    assert.equal(recovery.value.contract, 'DSH_OWNER_AUTONOMOUS_RECOVERY_PAUSED_V1')
    assert.equal(recovery.value.reason, 'owner_failure_task_running')

    const afterRecovery = await readRecoverySessionState(reopened)
    const afterRecord = afterRecovery.ownerRuns['T1:api']
    assert.equal(afterRecord.status, 'running')
    assert.equal(afterRecord.attempt, 1)
    assert.equal(afterRecord.leaseToken, ready.leaseToken)

    return {
      primaryPid: ready.pid,
      probePid: process.pid,
      primaryExit: exit,
      cancelCall: { returned: ready.cancelReturn, threw: false },
      persistedSession: {
        id: ready.sessionId,
        rawArtifactObserved: Boolean(raw?.content),
        eventCount: persisted.events.length,
        terminal: terminals(persisted),
      },
      oldLease: { pid: leaseAfterKill.pid, token: leaseAfterKill.token },
      takeover: { pid: takeover.pid, token: takeover.token },
      ownerRunBefore: {
        status: oldRecord.status,
        attempt: oldRecord.attempt,
        token: oldRecord.leaseToken,
      },
      recoverOwner: recovery.value,
      ownerRunAfter: {
        status: afterRecord.status,
        attempt: afterRecord.attempt,
        token: afterRecord.leaseToken,
      },
    }
  } finally {
    try { await reopened?.dispose() } catch {}
    if (root !== undefined) await rm(root, { recursive: true, force: true })
    if (!primary.child.killed) primary.child.kill('SIGKILL')
  }
}

const began = performance.now()
try {
  const sigkill = await proveSigkillReconciliation()
  const deadlineReference = proveDeadlineReference()
  console.log(JSON.stringify({
    scenario: 'real-cancel-sigkill-jsonl-lease-recovery-and-deadline-reference',
    probeElapsedMs: performance.now() - began,
    sigkill,
    deadlineReference,
  }))
} catch (error) {
  console.log(JSON.stringify({ probeError: errorText(error) }))
  process.exitCode = 1
}

import { mkdir, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import {
  normalizeRecoveryBudget,
  reserveRecoveryAttempt,
} from '../../../../../../owner-workflow-plugin/src/recovery-budget.mjs'

const [scenario, encodedConfig] = process.argv.slice(2)
const config = JSON.parse(encodedConfig ?? '{}')
const { readJson, saveState, statePath } = await import(pathToFileURL(config.adapterPath).href)
const runtime = { config: { runtimeDirectory: config.runtimeDirectory } }
const path = statePath(runtime, config.root, config.workflowId)

function emit(type, data = {}) {
  if (process.send !== undefined) process.send({ type, pid: process.pid, at: new Date().toISOString(), ...data })
}

function waitForParent(command = 'continue') {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      process.off('message', onMessage)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`等待父进程 ${command} 超时`))
    }, Number(config.gateTimeoutMs ?? 8_000))
    const onMessage = message => {
      if (message?.command === command) {
        cleanup()
        resolve()
      }
    }
    process.on('message', onMessage)
  })
}

const binding = Object.freeze({
  workflowId: config.workflowId,
  rootProblemId: 'root-problem-1',
  requestId: config.requestId,
  attemptId: config.attemptId,
  taskId: 'task-1',
  ownerId: 'owner-1',
  executionVersion: 'plan-v1',
})

async function pauseAt(point) {
  if (config.gate !== point) return
  emit('barrier-ready', { point })
  await waitForParent()
}

function isContendedWriteLock(error) {
  return String(error?.message ?? error).includes('状态正在由另一个 Harness 临界区更新')
}

async function reserveFromLatest() {
  await pauseAt('before-read')
  emit('before-latest-read')
  let transition
  let calls = 0
  const retryUntil = Date.now() + Number(config.retryLockMs ?? 0)
  for (;;) {
    calls += 1
    try {
      const saved = await saveState(runtime, {
        root: config.root,
        id: config.workflowId,
        revision: Number(config.expectedRevision ?? 0),
      }, undefined, async current => {
        emit('latest-snapshot', { revision: current?.revision ?? null, hasLedger: current?.recoveryBudget !== undefined })
        await pauseAt('compute-before-reserve')
        if (Number(config.holdInsideMs ?? 0) > 0) {
          await new Promise(resolve => setTimeout(resolve, Number(config.holdInsideMs)))
        }
        const ledger = normalizeRecoveryBudget(current?.recoveryBudget)
        transition = reserveRecoveryAttempt(ledger, binding)
        // The T-13 reducer has already returned a new, decremented ledger here,
        // but saveState has not reached writeJsonAtomic yet.  SIGKILL at this
        // barrier therefore tests the exact no-half-save boundary.
        await pauseAt('reserved-in-memory-before-save')
        if (config.inject === 'replace-state-with-directory') {
          emit('save-failure-injected', { method: 'replace-persisted-json-with-directory' })
          await rm(path, { force: true })
          await mkdir(path)
        }
        return {
          state: {
            ...current,
            recoveryBudget: transition.ledger,
            recoveryProbe: {
              requestId: binding.requestId,
              outcome: transition.outcome,
              persistedByPid: process.pid,
            },
          },
        }
      })
      emit('state-saved', { revision: saved.revision, outcome: transition?.outcome, calls })
      await pauseAt('after-save-before-start')
      if (transition?.outcome === 'reserved') {
        // This is deliberately only an IPC observation, never a session API call.
        emit('simulated-external-start-boundary', { requestId: binding.requestId })
      } else {
        emit('reconciliation-required', {
          reason: 'replayed_reservation_has_no_persisted_external_session_or_start_receipt',
          outcome: transition?.outcome,
        })
      }
      emit('result', { status: 'ok', outcome: transition?.outcome })
      return
    } catch (error) {
      if (isContendedWriteLock(error) && Date.now() < retryUntil) {
        emit('write-lock-contended', { message: String(error.message), calls })
        await new Promise(resolve => setTimeout(resolve, 20))
        continue
      }
      emit('operation-error', { message: String(error?.message ?? error), calls })
      emit('result', { status: 'error' })
      return
    }
  }
}

async function reconcileOnly() {
  try {
    const current = await readJson(path)
    const ledger = normalizeRecoveryBudget(current?.recoveryBudget)
    const transition = reserveRecoveryAttempt(ledger, binding)
    emit('reconciliation-required', {
      reason: 'replayed_reservation_has_no_persisted_external_session_or_start_receipt',
      outcome: transition.outcome,
      revision: current.revision,
    })
    emit('result', { status: 'ok', outcome: transition.outcome })
  } catch (error) {
    emit('operation-error', { message: String(error?.message ?? error) })
    emit('result', { status: 'error' })
  }
}

async function mutateLatest() {
  try {
    const saved = await saveState(runtime, {
      root: config.root,
      id: config.workflowId,
      revision: Number(config.expectedRevision ?? 0),
    }, undefined, current => ({
      state: { ...current, probeMarker: config.marker ?? 'writer-won' },
    }))
    emit('result', { status: 'ok', revision: saved.revision })
  } catch (error) {
    emit('operation-error', { message: String(error?.message ?? error) })
    emit('result', { status: 'error' })
  }
}

async function ordinaryCas() {
  try {
    const stale = await readJson(path)
    emit('stale-snapshot-read', { revision: stale.revision })
    await pauseAt('stale-read')
    stale.probeMarker = 'stale-writer'
    await saveState(runtime, stale)
    emit('ordinary-cas-unexpected-success')
    emit('result', { status: 'unexpected-success' })
  } catch (error) {
    emit('ordinary-cas-rejected', { message: String(error?.message ?? error) })
    emit('result', { status: 'error' })
  }
}

try {
  if (scenario === 'reserve') await reserveFromLatest()
  else if (scenario === 'reconcile') await reconcileOnly()
  else if (scenario === 'mutate') await mutateLatest()
  else if (scenario === 'ordinary-cas') await ordinaryCas()
  else throw new Error(`未知 probe worker 场景：${scenario}`)
} catch (error) {
  emit('fatal', { message: String(error?.stack ?? error) })
  process.exitCode = 1
}

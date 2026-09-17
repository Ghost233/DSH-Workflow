import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { dueActions, actionReentryFenced } from './workflow-engine.mjs'
import { withControlLock } from './workflow-store.mjs'

class PersistedActionStop extends Error {
  constructor() {
    super('Persisted action stopped')
    this.code = 'PERSISTED_ACTION_STOP'
  }
}

function persistedStopOwnsInterrupt(state, claimed, mode, token) {
  const current = state.actions[claimed.id]
  if (!current || current.workflowId !== claimed.workflowId || current.kind !== claimed.kind
    || current.inputDigest !== claimed.inputDigest || current.attemptId !== claimed.attemptId) return false
  const claim = mode === 'execute' ? current.execution : current.observation
  const originalClaim = mode === 'execute' ? claimed.execution : claimed.observation
  if (claim?.token !== token || claim.hostId !== originalClaim?.hostId) return false
  if (current.stopRequested !== true) return false
  const stops = Object.values(state.actions).filter(action => action.workflowId === current.workflowId
    && action.kind === 'stop_execution')
  if (current.attemptId) {
    const attempt = state.workflows[current.workflowId]?.attempts?.[current.attemptId]
    const stop = stops.find(action => action.attemptId === current.attemptId
      && action.input?.attemptId === current.attemptId && action.input?.authority === attempt?.authority
      && action.input?.reason === attempt?.failure)
    if (!stop || !attempt) return false
    return attempt.phase === 'stopping'
      || stop.status === 'succeeded' && current.status === 'cancelled' && ['failed', 'cancelled'].includes(attempt.phase)
  }
  const stop = stops.find(action => action.input?.targetActionId === current.id
    && action.input?.reason === current.failure)
  return !!stop && (current.status === 'uncertain'
    || stop.status === 'succeeded' && ['failed', 'cancelled'].includes(current.status))
}

/** Executes persisted work. Domain choices belong only to workflow-engine. */
export class WorkflowEffects {
  constructor(store, adapters, { hostId = randomUUID(), clock = () => store.clock(), onError = () => {} } = {}) {
    this.store = store; this.adapters = adapters; this.hostId = hostId; this.clock = clock
    this.onError = onError; this.active = new Map(); this.closed = false
  }
  async pump({ signal } = {}) {
    if (this.closed) return
    signal?.throwIfAborted()
    await this.store.transact({ type: 'drive' }, { signal })
    const snapshot = await this.store.read()
    for (const [id, entry] of this.active) {
      const action = snapshot.actions[id]
      if (action?.stopRequested || ['cancelled', 'failed'].includes(action?.status)) entry.controller.abort(new PersistedActionStop())
    }
    const due = dueActions(snapshot, this.clock())
    for (const item of due) {
      if (this.active.has(item.actionId)) continue
      const adapter = this.adapters[(await this.store.read()).actions[item.actionId].kind]
      if (!adapter) throw new Error(`No effect adapter for action ${item.actionId}`)
      const token = randomUUID()
      let claimed
      try {
        claimed = await this.store.transact({ type: 'action.claim', ...item, hostId: this.hostId, token }, { signal })
      } catch (error) {
        // A concurrent pump can win admission. Only known contention is benign.
        if (error.code === 'RETIRED_ATTEMPT_ACTION' || error.code === 'STOPPED_ACTION' || /not executable|not due|already observed|resource is busy/.test(error.message)) continue
        throw error
      }
      const controller = new AbortController()
      const childSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
      const operation = this.run(claimed.result, item.mode, token, adapter, childSignal)
        .catch(error => {
          // The exact cancellation we initiated is a lifecycle event. Its
          // uncertain action remains durable for reconciliation; unrelated
          // failures, including failures while stopping, still reach onError.
          if (!childSignal.aborted || error !== childSignal.reason) this.onError(error, item)
          return { error }
        })
        .finally(() => this.active.delete(item.actionId))
      this.active.set(item.actionId, { operation, controller })
    }
  }
  async run(action, mode, token, adapter, signal) {
    const directory = join(this.store.directory, 'action-locks')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    try {
      return await withControlLock(join(directory, `${action.id}.lock`), async () => {
        // A claim may win just before retirement and reach its OS lock just
        // after the proof commits. Fence again before any adapter preparation.
        if (actionReentryFenced(await this.store.read(), action)) return
        return this.runLocked(action, mode, token, adapter, signal)
      }, { signal, timeoutMs: 0 })
    } catch (error) {
      if (error.code !== 'CONTROL_LOCK_BUSY' || mode !== 'observe') throw error
      return this.store.transact({ type: 'action.observe', actionId: action.id, token, fact: 'running' })
    }
  }
  async runLocked(action, mode, token, adapter, signal) {
    const started = evidence => this.store.transact({ type: 'action.started', actionId: action.id, token, evidence }, { signal })
    let result
    try {
      result = mode === 'execute'
        ? await adapter.execute(action, { signal, started, hostId: this.hostId })
        : await adapter.observe(action, { signal, started, hostId: this.hostId, executionQuiescent: true })
      if (result?.deferred === true && mode === 'execute') return await this.store.transact({ type: 'action.deferred', actionId: action.id, token, notDispatched: true, reason: result.reason })
      if (result?.deferred === true) return await this.store.transact({ type: 'action.observe', actionId: action.id, token,
        fact: result.reason === 'root_session_offline' && action.kind === 'notify_main' ? 'root_session_offline' : 'running' })
      if (result?.failed === true && result?.executionSettled === true) return await this.store.transact({ type: 'action.failed', actionId: action.id, token,
        reason: result.reason, termination: result })
      if (result?.pending !== true) return await this.store.transact({ type: 'action.result', actionId: action.id, token, result })
    } catch (error) {
      // A persisted stop owns this exact abort. The stop_execution action is
      // the durable settlement path, so recording this lifecycle interrupt as
      // action.failed would manufacture an execution failure while cancelling.
      if (signal.aborted && signal.reason instanceof PersistedActionStop && error === signal.reason) return
      // Revocation may become observable before this host's next pump aborts
      // its controller. Re-read the exact claim and require the engine's
      // durable stop lane; that lane alone owns settlement and quarantine.
      if (persistedStopOwnsInterrupt(await this.store.read(), action, mode, token)) return
      // An interrupted/throwing invocation may already have performed effects.
      // Never infer "not started" and never dispatch the same command blindly.
      if (mode === 'observe') {
        await this.store.transact({ type: 'action.observe', actionId: action.id, token, fact: 'unknown' })
      } else {
        await this.store.transact({ type: 'action.failed', actionId: action.id, token, reason: String(error.message ?? error) })
      }
      throw error
    }
    if (result?.pending === true) {
      if (mode === 'observe') return this.store.transact({ type: 'action.observe', actionId: action.id, token,
        fact: result.fact ?? 'running', ...(result.proof ? { proof: result.proof } : {}) })
      return // started evidence and the durable action remain available for observation
    }

  }
  async drain() { return Promise.all([...this.active.values()].map(item => item.operation)) }
  async close() {
    this.closed = true
    for (const item of this.active.values()) item.controller.abort(new Error('Workflow effect host stopped'))
    await this.drain()
  }
}

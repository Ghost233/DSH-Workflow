import { dueActions, actionReentryFenced } from './workflow-engine.mjs'
/** One timer driver for the effects host. It never interprets failure reason strings. */
export class WorkflowRunner {
  constructor(store, effects, { clock = () => store.clock(), schedule = setTimeout, unschedule = clearTimeout,
    maxIntervalMs = 30_000, onError = () => {} } = {}) {
    this.store = store; this.effects = effects; this.clock = clock; this.schedule = schedule; this.unschedule = unschedule
    this.maxIntervalMs = maxIntervalMs; this.onError = onError; this.closed = true; this.timer = null; this.running = null
    this.health = { status: 'stopped', lastCheckAt: null, lastError: null, nextWakeAt: null }
  }
  start() {
    if (!this.closed) return
    this.closed = false
    this.unsubscribe = this.store.subscribe(() => this.wake())
    this.wake()
  }
  wake() {
    if (this.closed) return
    this.needsCheck = true
    if (this.running) return
    if (this.timer !== null) this.unschedule(this.timer)
    this.timer = this.schedule(() => { this.timer = null; void this.tick() }, 0)
  }
  async tick() {
    if (this.closed || this.running) return
    this.needsCheck = false
    this.running = this.check()
    try { await this.running } finally {
      this.running = null
      if (!this.closed) {
        const delay = this.needsCheck ? 25 : Math.max(25, (this.health.nextWakeAt ?? this.clock() + this.maxIntervalMs) - this.clock())
        this.timer = this.schedule(() => { this.timer = null; void this.tick() }, Math.min(delay, this.maxIntervalMs))
      }
    }
  }
  async check() {
    const now = this.clock()
    try {
      await this.effects.pump()
      const state = await this.store.read()
      const deadlines = Object.values(state.workflows).flatMap(workflow => Object.values(workflow.attempts))
        .filter(attempt => !['failed', 'cancelled', 'succeeded'].includes(attempt.phase) && !attempt.waitingDecision)
        .map(attempt => attempt.phase === 'stopping' ? attempt.stopDeadlineAt : attempt.deadlineAt)
      deadlines.push(...Object.values(state.actions)
        .filter(action => !action.attemptId && action.admitted && !action.waitingDecision && !['failed', 'cancelled', 'succeeded'].includes(action.status))
        .map(action => action.stopRequested ? action.stopDeadlineAt : action.deadlineAt))
      const due = new Set(dueActions(state, now).map(item => item.actionId))
      const actions = Object.values(state.actions).filter(action => !actionReentryFenced(state, action) && (action.status !== 'pending' || action.admitted || due.has(action.id)) && !this.effects.active.has(action.id)
        && !['failed', 'cancelled', 'succeeded'].includes(action.status)).map(action => action.nextWakeAt)
      // Expired deadlines have already been presented to the drive above.
      // Keeping one as a timer target would schedule a 25 ms busy loop even
      // when an offline notification has a deliberate later retry time.
      this.health = { status: 'running', lastCheckAt: now, lastError: null,
        nextWakeAt: Math.min(now + this.maxIntervalMs, ...[...deadlines, ...actions].filter(at => Number.isFinite(at) && at > now)) }
    } catch (error) {
      this.health = { status: 'error', lastCheckAt: now, lastError: String(error.message ?? error), nextWakeAt: now + this.maxIntervalMs }
      this.onError(error)
    }
  }
  async close() {
    this.closed = true; this.unsubscribe?.()
    if (this.timer !== null) this.unschedule(this.timer)
    await this.running
    await this.effects.close()
    this.health = { ...this.health, status: 'stopped', nextWakeAt: null }
  }
}

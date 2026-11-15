/**
 * OutboxRunner — Stored work for every outward action (spec「可靠性」+ issue #66).
 *
 * 先存后做: enqueue() INSERTs the row (state 'queued', stable requestId) BEFORE any delivery attempt; the
 * deliverer always observes a stored row. Delivery is strictly ordered per ticket — the confirmation is
 * always sent before the result: a queued head blocks the tail until it is sent, or until it has failed 3
 * consecutive attempts, at which point the runner reports a system problem (outbox row + onSystemProblem)
 * and bypasses it. Retries use a 2s exponential backoff capped at 5 min for injections and 1 min for
 * replies. One transient failure never alarms anyone (一次性网络错误不惊动人）.
 *
 * The runner is a pure domain module: the clock and the deliverer are injected, so ordering, backoff and
 * crash recovery are unit-testable without a DSH runtime. Rows live in the store's outbox table — a fresh
 * runner over the same store resumes unfinished work (spec: 重启恢复）. Legacy 'recorded' rows (pre-#66
 * reply intents) are not delivery work and are left untouched.
 */
import { randomUUID } from 'node:crypto'

/** Backoff caps by row kind (spec: 回复上限 1 分钟、注入上限 5 分钟）. */
const CAP_MS = { inject: 5 * 60_000, reply: 60_000 }
const BASE_MS = 2_000
const MAX_ATTEMPTS = 3

/**
 * THE one writer for outbox rows (双轴审查 P2: enqueue / recordReportFact / owner-tools.escalate /
 * system-problem used to hand-roll four slightly different rows — field drift on requestId/nextRetryAt/
 * createdAt). Every row gets: id, attempts 0, nextRetryAt null, createdAt; callers pass the specifics.
 */
export function insertOutbox(store, row, now = () => Date.now()) {
  const createdAt = new Date(now()).toISOString()
  const full = { attempts: 0, nextRetryAt: null, ...row, id: row.id ?? 'out-' + randomUUID(), createdAt }
  store.db.prepare('INSERT INTO outbox (id, value, at) VALUES (?, ?, ?)').run(full.id, JSON.stringify(full), createdAt)
  return full
}

export class OutboxRunner {
  /**
   * @param {{ store: import('./store.js').Store,
   *           deliver: (row: object) => Promise<void>,
   *           now?: () => number,
   *           onSystemProblem?: (problem: { ticketId: string|null, reason: string, rowId: string }) => void }} deps
   */
  constructor({ store, deliver, now, onSystemProblem }) {
    this.store = store
    this.deliver = deliver
    this.now = now ?? (() => Date.now())
    this.onSystemProblem = onSystemProblem ?? (() => {})
  }

  /** Stores the action first (先存后做） and returns the queued row. */
  enqueue({ ticketId, kind, to, body, sessionId, requestId }) {
    return insertOutbox(this.store, {
      ticketId: ticketId ?? null, kind, to, body, sessionId: sessionId ?? null, requestId, state: 'queued',
    }, this.now)
  }

  #readRow(id) {
    const raw = this.store.db.prepare('SELECT value FROM outbox WHERE id = ?').get(id)
    return raw === undefined ? undefined : JSON.parse(String(raw.value))
  }

  #writeRow(row) {
    this.store.db.prepare('UPDATE outbox SET value = ? WHERE id = ?').run(JSON.stringify(row), row.id)
  }

  /** All queued delivery rows, oldest first, grouped by ticket (null ticket groups under ''). */
  #pendingByTicket() {
    const rows = this.store.db.prepare('SELECT value FROM outbox ORDER BY at').all()
      .map(raw => JSON.parse(String(raw.value)))
      .filter(row => row.state === 'queued')
    const groups = new Map()
    for (const row of rows) {
      const key = row.ticketId ?? ''
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(row)
    }
    return groups
  }

  /** Delivers every due row, strictly ordered within each ticket. */
  async tick() {
    const nowMs = this.now()
    for (const rows of this.#pendingByTicket().values()) {
      for (const row of rows) {
        if (row.nextRetryAt !== null && row.nextRetryAt > nowMs) break // the head is not due; the tail waits (保序)
        const done = await this.#attempt(row)
        if (!done) break // failed attempts keep the head in place until it is sent or declared failed
      }
    }
  }

  /**
   * One delivery attempt. Returns true when the queue may advance past this row (sent, or failed out after
   * MAX_ATTEMPTS and bypassed with a system problem reported).
   */
  async #attempt(row) {
    try {
      // The deliverer may ask to be retried later WITHOUT burning an attempt — e.g. a digest waits for the
      // owner's wake to end (idle session) so one wake coalesces into one outward message (#67).
      const result = await this.deliver(row)
      if (result && typeof result.postponeMs === 'number') {
        this.#writeRow({ ...row, nextRetryAt: this.now() + result.postponeMs })
        return false
      }
      // 不假装送达 (#64): the deliverer may declare the intent RECORDED but undelivered (e.g. a Feishu target
      // whose channel does not exist yet) — a terminal 'recorded' row, kept for a future channel to scan,
      // never a fake 'sent'. Only an actual delivery earns 'sent'.
      if (result && result.recorded === true) {
        this.#writeRow({ ...row, state: 'recorded', recordedAt: new Date(this.now()).toISOString(), nextRetryAt: null })
        return true
      }
      this.#writeRow({ ...row, state: 'sent', sentAt: new Date(this.now()).toISOString(), nextRetryAt: null })
      return true
    } catch (error) {
      // A permanent failure (e.g. the ticket's authorization record is missing — 票面权威) must not be
      // retried: it fails out immediately and is reported as a system problem like any 3rd failure.
      const attempts = error?.permanent === true ? MAX_ATTEMPTS : row.attempts + 1
      if (attempts >= MAX_ATTEMPTS) {
        this.#writeRow({ ...row, attempts, state: 'failed', failedAt: new Date(this.now()).toISOString(), nextRetryAt: null })
        const problem = { ticketId: row.ticketId, reason: 'delivery failed ' + attempts + ' times in a row (' + row.kind + ' → ' + row.to + ')', rowId: row.id }
        insertOutbox(this.store, { ticketId: row.ticketId, kind: 'system-problem', to: 'chief', body: problem.reason, state: 'recorded' }, this.now)
        this.onSystemProblem(problem)
        return true // bypass: the tail may proceed
      }
      const cap = CAP_MS[row.kind] ?? CAP_MS.reply
      const delay = Math.min(BASE_MS * 2 ** (attempts - 1), cap)
      this.#writeRow({ ...row, attempts, nextRetryAt: this.now() + delay })
      return false
    }
  }
}

/**
 * The minimal ticket lifecycle behind the execution loop (spec #65: 进行中 → 等验收 → 完成).
 *
 * TaskBoard owns ticket stage transitions — report (working→review), resume (review→working, 追问恢复),
 * accept (review→done, 用户验收) — plus the escalation flag and worker-Session binding. It is a pure domain
 * module over the Store so the transition guard is unit-testable without a DSH runtime; Router (L1 side) and
 * owner-tools (L2 side) both drive tickets through it, never around it.
 *
 * Tickets are JSON documents (store schema v1); new fields introduced here — report, escalated, workerSession,
 * transitions — live inside the document, so no migration is appended.
 */

/** The three stages of the minimal loop (spec #65). */
export const STAGES = ['working', 'review', 'done']

/**
 * Legal transitions. 等用户验收是挡板: a ticket reaches done only from review, and review is reached only by
 * the owner's report — never directly from working.
 */
const TRANSITIONS = {
  working: ['review'],
  review: ['working', 'done'],
  done: [],
}

/** A lifecycle failure with a machine-readable code for tool/API surfaces. */
export class TaskError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'TaskError'
    this.code = code
  }
}

/** True when candidate equals root or lies inside it (path-segment aware: /a/b does not contain /a/bc). */
export function isWithinCwd(root, candidate) {
  if (typeof root !== 'string' || typeof candidate !== 'string' || !root || !candidate) return false
  const base = root.endsWith('/') ? root.slice(0, -1) : root
  return candidate === base || candidate.startsWith(base + '/')
}

/** True when a stage transition is legal in the minimal lifecycle. */
export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to)
}

export class TaskBoard {
  /**
   * @param {{ store: import('./store.js').Store, now?: () => string }} deps
   */
  constructor({ store, now }) {
    this.store = store
    this.now = now ?? (() => new Date().toISOString())
  }

  /** One Ticket row by id, or undefined. */
  getTicket(id) {
    const raw = this.store.db.prepare('SELECT value FROM ticket WHERE id = ?').get(id)
    return raw === undefined ? undefined : JSON.parse(String(raw.value))
  }

  #updateTicket(row) {
    this.store.db.prepare('UPDATE ticket SET value = ? WHERE id = ?').run(JSON.stringify(row), row.id)
    return row
  }

  #mustGet(ticketId) {
    const ticket = this.getTicket(ticketId)
    if (!ticket) throw new TaskError('unknown-ticket', 'unknown ticket "' + ticketId + '"')
    return ticket
  }

  /** Applies one guarded transition, recording it on the ticket's audit trail. */
  #transition(ticketId, to, by) {
    const ticket = this.#mustGet(ticketId)
    if (!canTransition(ticket.stage, to)) {
      throw new TaskError('illegal-transition', 'ticket ' + ticketId + ': cannot move ' + ticket.stage + ' → ' + to)
    }
    const at = this.now()
    const transitions = [...(ticket.transitions ?? []), { from: ticket.stage, to, by, at }]
    return this.#updateTicket({ ...ticket, stage: to, transitions, updatedAt: at })
  }

  /**
   * The owner reports the execution result onto the task (spec #65: report 归类到任务，L1 可 query_tasks 看到）.
   * working → review; the ticket then waits for user acceptance.
   */
  report({ ticketId, summary, evidence }) {
    if (typeof summary !== 'string' || !summary.trim()) throw new TaskError('summary-required', 'report: summary must be a non-empty string')
    const ticket = this.#transition(ticketId, 'review', 'owner')
    return this.#updateTicket({ ...ticket, report: { summary: summary.trim(), evidence: evidence ?? null, at: this.now() } })
  }

  /** A follow-up on a task waiting for acceptance resumes it (spec #65: 追问恢复旧任务而非新建). */
  resume(ticketId) {
    return this.#transition(ticketId, 'working', 'route')
  }

  /** The user accepts the reported result (spec #65: 等用户验收是挡板). */
  accept(ticketId) {
    return this.#transition(ticketId, 'done', 'user')
  }

  /**
   * The owner escalates instead of executing (spec #65: 越界拒执上报）. Escalation is a flag, not a stage:
   * the ticket keeps its stage so the loop can still close it after the escalation is resolved.
   */
  escalate({ ticketId, reason }) {
    if (typeof reason !== 'string' || !reason.trim()) throw new TaskError('reason-required', 'escalate: reason must be a non-empty string')
    const ticket = this.#mustGet(ticketId)
    if (ticket.stage === 'done') throw new TaskError('illegal-transition', 'ticket ' + ticketId + ': cannot escalate a done ticket')
    return { ...this.#updateTicket({ ...ticket, escalated: { reason: reason.trim(), at: this.now() }, updatedAt: this.now() }), escalated: true }
  }

  /** Binds the execution Session the owner created for this task (spec #65: create_session 落任务记录). */
  bindWorkerSession(ticketId, { sessionId, cwd }) {
    const ticket = this.#mustGet(ticketId)
    return this.#updateTicket({ ...ticket, workerSession: { sessionId, cwd, at: this.now() }, updatedAt: this.now() })
  }
}

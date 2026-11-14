/**
 * The ticket lifecycle: the full 等待状态 model (spec「状态模型」+ issue #66).
 *
 * Every task has exactly ONE stage at any moment, decided by "what is it waiting for" (spec: 状态驱动).
 * The eight waiting stages plus terminal done:
 *
 *   idle            待触发      ticket stored, first injection not yet delivered (先存后做)
 *   queued          排队中      no free execution slot (wired when execution slots land; matrix-ready)
 *   working         进行中      everything else — the task is being executed
 *   person/answer   等您回复    the owner asked the user a question
 *   person/confirm  等您确认    waiting on a route/fork confirmation
 *   person/review   等您验收    work reported, result awaits acceptance (the acceptance gate)
 *   blocked         被卡住      the owner escalated — it cannot continue alone
 *   failed          失败        execution failed (non-transient)
 *   done            完成        terminal
 *
 * State summaries are READINGS of the stage (STAGE_TEXT) plus stored facts — never improvised prose
 * (spec: 状态摘要是状态的朗读). All transitions go through the TRANSITIONS guard with an audit trail;
 * a human message releases blocked/failed tasks back to working (spec: 人的消息直接释放）.
 *
 * Tickets are JSON documents (store schema v1); new fields live inside the document — no migration. Rows
 * written by the minimal loop carry stage 'review', normalized to 'person/review' on read.
 */

/** The stages of the full lifecycle (spec #66). */
export const STAGES = ['idle', 'queued', 'working', 'person/answer', 'person/confirm', 'person/review', 'blocked', 'failed', 'done']

/** The verbatim user-facing reading of each stage (spec: 状态摘要是对状态的朗读）. */
export const STAGE_TEXT = {
  'idle': '待触发',
  'queued': '排队中',
  'working': '进行中',
  'person/answer': '等您回复',
  'person/confirm': '等您确认',
  'person/review': '等您验收',
  'blocked': '被卡住',
  'failed': '失败',
  'done': '完成',
}

/**
 * Legal transitions (spec #66「所有转换规则化」). person/review is the acceptance gate: done is reachable only
 * from person/review (user accepts) or person/confirm (user cancels a pending confirmation). A human message
 * releases person/*, blocked and failed tasks back to working.
 */
export const TRANSITIONS = {
  'idle': ['working', 'failed'],
  'queued': ['working', 'failed'],
  'working': ['person/review', 'person/answer', 'person/confirm', 'blocked', 'failed', 'queued'],
  'person/answer': ['working', 'blocked', 'failed'],
  'person/confirm': ['working', 'done', 'blocked', 'failed'],
  'person/review': ['working', 'done'],
  'blocked': ['working', 'failed'],
  'failed': ['working'],
  'done': [],
}

/** Stages a human message (follow-up) releases back to working. */
const RELEASABLE = ['person/answer', 'person/confirm', 'person/review', 'blocked', 'failed']

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

/** True when a stage transition is legal in the lifecycle. */
export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to)
}

/** Legacy rows from the minimal loop (#65) read as their full-model stage. */
export function normalizeStage(stage) {
  return stage === 'review' ? 'person/review' : stage
}

export class TaskBoard {
  /**
   * @param {{ store: import('./store.js').Store, now?: () => string }} deps
   */
  constructor({ store, now }) {
    this.store = store
    this.now = now ?? (() => new Date().toISOString())
  }

  /** One Ticket row by id (stage normalized), or undefined. */
  getTicket(id) {
    const raw = this.store.db.prepare('SELECT value FROM ticket WHERE id = ?').get(id)
    if (raw === undefined) return undefined
    const ticket = JSON.parse(String(raw.value))
    return { ...ticket, stage: normalizeStage(ticket.stage) }
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

  /** The first stored injection for the ticket reached its owner Session (待触发 → 进行中）. Idempotent. */
  markDelivered(ticketId) {
    const ticket = this.#mustGet(ticketId)
    if (ticket.stage !== 'idle') return ticket
    return this.#transition(ticketId, 'working', 'system')
  }

  /**
   * The owner reports the execution result onto the task (spec: report 是任务状态的唯一写入通道）.
   * working → person/review; the ticket then waits for user acceptance.
   */
  report({ ticketId, summary, evidence }) {
    if (typeof summary !== 'string' || !summary.trim()) throw new TaskError('summary-required', 'report: summary must be a non-empty string')
    const ticket = this.#transition(ticketId, 'person/review', 'owner')
    return this.#updateTicket({ ...ticket, report: { summary: summary.trim(), evidence: evidence ?? null, at: this.now() } })
  }

  /** The owner cannot continue without an answer from the user (working → person/answer 等您回复）. */
  ask({ ticketId, question }) {
    if (typeof question !== 'string' || !question.trim()) throw new TaskError('question-required', 'ask: question must be a non-empty string')
    const ticket = this.#transition(ticketId, 'person/answer', 'owner')
    return this.#updateTicket({ ...ticket, question: { text: question.trim(), at: this.now() } })
  }

  /** A route/fork decision awaits the user's confirmation (working → person/confirm 等您确认）. */
  askConfirm({ ticketId, question }) {
    if (typeof question !== 'string' || !question.trim()) throw new TaskError('question-required', 'askConfirm: question must be a non-empty string')
    const ticket = this.#transition(ticketId, 'person/confirm', 'owner')
    return this.#updateTicket({ ...ticket, pendingConfirm: { text: question.trim(), at: this.now() } })
  }

  /** A follow-up (human message) resumes the task — releasing person/*, blocked and failed stages (spec #66). */
  resume(ticketId, { by } = {}) {
    const ticket = this.#mustGet(ticketId)
    if (!RELEASABLE.includes(ticket.stage)) {
      throw new TaskError('illegal-transition', 'ticket ' + ticketId + ': cannot resume from ' + ticket.stage)
    }
    return this.#transition(ticketId, 'working', by ?? 'route')
  }

  /** The user accepts the reported result (person/review → done; 等用户验收是挡板）. */
  accept(ticketId) {
    return this.#transition(ticketId, 'done', 'user')
  }

  /** The user cancels a pending confirmation (person/confirm → done). */
  cancel(ticketId) {
    return this.#transition(ticketId, 'done', 'user')
  }

  /**
   * The owner escalates instead of executing (越界/缺上下文/无法继续 → 被卡住）. Escalation IS the blocked
   * stage (#66): the ticket waits for a human; a follow-up message releases it back to working.
   */
  escalate({ ticketId, reason }) {
    if (typeof reason !== 'string' || !reason.trim()) throw new TaskError('reason-required', 'escalate: reason must be a non-empty string')
    const ticket = this.#transition(ticketId, 'blocked', 'owner')
    return this.#updateTicket({ ...ticket, escalated: { reason: reason.trim(), at: this.now() } })
  }

  /** Execution failed non-transiently (working/idle/queued → failed 失败）. */
  fail({ ticketId, reason }) {
    if (typeof reason !== 'string' || !reason.trim()) throw new TaskError('reason-required', 'fail: reason must be a non-empty string')
    const ticket = this.#transition(ticketId, 'failed', 'system')
    return this.#updateTicket({ ...ticket, failed: { reason: reason.trim(), at: this.now() } })
  }

  /** Binds the execution Session the owner created for this task; one task accrues many Assignments. */
  bindWorkerSession(ticketId, { sessionId, cwd }) {
    const ticket = this.#mustGet(ticketId)
    const assignment = { state: 'running', startedAt: this.now(), sessionId, cwd }
    return this.#updateTicket({
      ...ticket,
      workerSession: { sessionId, cwd, at: this.now() },
      assignments: [...(ticket.assignments ?? []), assignment],
      updatedAt: this.now(),
    })
  }

  /**
   * Restart recovery (spec: 重启恢复）: tasks that were actively executing (working/idle/queued) have their
   * running assignments ended with "host restarted" and carry recoveryPending so the next injection repeats
   * the recovery note (先检查目录与 git 状态，再重复任何对外动作）. Waiting stages stay as they are.
   */
  markRestart() {
    const rows = this.store.db.prepare('SELECT value FROM ticket').all()
    for (const raw of rows) {
      const ticket = JSON.parse(String(raw.value))
      const stage = normalizeStage(ticket.stage)
      if (!['working', 'idle', 'queued'].includes(stage)) continue
      const assignments = (ticket.assignments ?? []).map(a =>
        a.state === 'running' ? { ...a, state: 'ended', endedAt: this.now(), endReason: 'host restarted' } : a)
      this.#updateTicket({ ...ticket, stage, assignments, recoveryPending: true, updatedAt: this.now() })
    }
  }

  /** Clears recoveryPending once the recovery note has been carried into an injection (exactly once). */
  noteRecoveryCarried(ticketId) {
    const ticket = this.#mustGet(ticketId)
    if (!ticket.recoveryPending) return ticket
    const { recoveryPending, ...rest } = ticket
    return this.#updateTicket({ ...rest, updatedAt: this.now() })
  }

  /**
   * The state summary (spec: 状态摘要 = 状态的朗读 + 必要的上下文）: the verbatim STAGE_TEXT plus facts stored
   * on the ticket (report summary, escalation reason, failure reason, pending question) — never free prose.
   */
  summarize(ticketId) {
    const ticket = this.#mustGet(ticketId)
    const text = STAGE_TEXT[ticket.stage]
    const detail = ticket.stage === 'person/review' ? ticket.report?.summary
      : ticket.stage === 'blocked' ? ticket.escalated?.reason
      : ticket.stage === 'failed' ? ticket.failed?.reason
      : ticket.stage === 'person/answer' ? ticket.question?.text
      : ticket.stage === 'person/confirm' ? ticket.pendingConfirm?.text
      : undefined
    return { stage: ticket.stage, text, detail }
  }
}

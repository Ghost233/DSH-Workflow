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
// 九态模型。person/confirm 的生产者是确认流程（#69：fork_session 等重操作确认），queued 的生产者是执行槽
// 并发（#72：同 owner working 数达上限时新票排队，槽空出 FIFO 提升，人的跟进走专用槽立即提升）——两个
// 阶段均有真实代码路径驱动，转换规则在 TRANSITIONS 就位。
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
  // idle/queued → person/confirm: 危险命令黑名单在注入前挂起 (spec「Policy」安全兜底) — 票未投递先转等确认。
  'idle': ['working', 'failed', 'person/confirm'],
  'queued': ['working', 'failed', 'person/confirm'],
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

/** 确认超时（spec「错误场景」+ #69）: a person/confirm request left unanswered for 24h auto-cancels. */
export const CONFIRM_TIMEOUT_MS = 24 * 60 * 60 * 1000

/** A lifecycle failure with a machine-readable code for tool/API surfaces. */
export class TaskError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'TaskError'
    this.code = code
  }
}

/**
 * THE one TaskError translation (双轴审查 P2: was three sites in two shapes). TaskErrors crossing a surface
 * keep their machine-readable code; `wrap` decides the surface's error shape (RouterError for the API,
 * a plain prefixed Error for tools). Non-TaskErrors pass through untouched.
 */
export function translateTaskError(error, wrap) {
  return error instanceof TaskError ? wrap(error.code, error.message) : error
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
   * 执行槽 (#72): a queued ticket wins an execution slot (queued → working 排队中 → 进行中）. The Router calls
   * this when a slot frees (FIFO by createdAt) or when a human follow-up admits the ticket through the
   * dedicated human slot (人的消息永不被新工作阻塞）.
   */
  promote(ticketId, { by } = {}) {
    return this.#transition(ticketId, 'working', by ?? 'system')
  }

  /**
   * 执行槽 (#72) + 重启恢复自动恢复： a working ticket yields its slot back to the queue (working → queued
   * 进行中 → 排队中）. The Router uses this when a post-restart auto-resume overflows the slot cap — the
   * ticket keeps its stored (held) recovery injection and re-enters when a slot frees (#promoteQueued).
   */
  demote(ticketId, { by } = {}) {
    return this.#transition(ticketId, 'queued', by ?? 'system')
  }

  /**
   * The owner reports the execution result onto the task (spec: report 是任务状态的唯一写入通道）.
   * working → person/review; the ticket then waits for user acceptance.
   */
  report({ ticketId, summary, evidence, sections }) {
    if (typeof summary !== 'string' || !summary.trim()) throw new TaskError('summary-required', 'report: summary must be a non-empty string')
    // 结构化报告（#67）: 结果/变更/验证/风险四段要么全给要么不给 — half a structure is worse than none.
    if (sections !== undefined) {
      const ok = typeof sections === 'object' && sections !== null
        && ['result', 'changes', 'verification', 'risks'].every(k => typeof sections[k] === 'string' && sections[k].trim())
      if (!ok) throw new TaskError('sections-incomplete', 'report: sections must carry all four non-empty segments: result/changes/verification/risks')
    }
    const ticket = this.#transition(ticketId, 'person/review', 'owner')
    const report = { summary: summary.trim(), evidence: evidence ?? null, at: this.now() }
    if (sections !== undefined) report.sections = { result: sections.result.trim(), changes: sections.changes.trim(), verification: sections.verification.trim(), risks: sections.risks.trim() }
    return this.#updateTicket({ ...ticket, report })
  }

  /** The owner cannot continue without an answer from the user (working → person/answer 等您回复）. */
  ask({ ticketId, question }) {
    if (typeof question !== 'string' || !question.trim()) throw new TaskError('question-required', 'ask: question must be a non-empty string')
    const ticket = this.#transition(ticketId, 'person/answer', 'owner')
    return this.#updateTicket({ ...ticket, question: { text: question.trim(), at: this.now() } })
  }

  /**
   * A route/fork decision awaits the user's confirmation (working → person/confirm 等您确认）.
   * #69: a heavy action (fork) rides along as a structured `action` payload — the stored intent the user's
   * confirm later executes （先存后做）; the action survives restarts on the ticket face.
   */
  askConfirm({ ticketId, question, action }) {
    if (typeof question !== 'string' || !question.trim()) throw new TaskError('question-required', 'askConfirm: question must be a non-empty string')
    if (action !== undefined && (typeof action !== 'object' || action === null || Array.isArray(action) || typeof action.type !== 'string' || !action.type.trim())) {
      throw new TaskError('action-invalid', 'askConfirm: action must be an object with a non-empty string type')
    }
    const ticket = this.#transition(ticketId, 'person/confirm', 'owner')
    const pendingConfirm = { text: question.trim(), at: this.now() }
    if (action !== undefined) pendingConfirm.action = action
    return this.#updateTicket({ ...ticket, pendingConfirm })
  }

  /**
   * person/confirm → working (#69): the user approved the pending confirmation. The outcome is recorded on
   * the face (confirmOutcome) and the pending request kept for audit; the caller executes the stored action
   * BEFORE this transition, so a failure leaves the ticket at person/confirm with the intent intact.
   */
  confirm({ ticketId, result, by } = {}) {
    const ticket = this.#mustGet(ticketId)
    if (ticket.stage !== 'person/confirm') throw new TaskError('illegal-transition', 'ticket ' + ticketId + ': confirm requires person/confirm, got ' + ticket.stage)
    if (!ticket.pendingConfirm) throw new TaskError('no-pending-confirm', 'ticket ' + ticketId + ' has no pending confirmation')
    const actor = by ?? 'user'
    const transitioned = this.#transition(ticketId, 'working', actor)
    return this.#updateTicket({ ...transitioned, confirmOutcome: { kind: 'confirmed', result: result ?? null, at: this.now(), by: actor } })
  }

  /**
   * person/confirm → blocked (#69): the user rejected the proposed action. The ticket keeps its original
   * session binding （保持原会话） and waits for the human's next message to release it back to working.
   */
  rejectConfirm({ ticketId, reason, by } = {}) {
    if (typeof reason !== 'string' || !reason.trim()) throw new TaskError('reason-required', 'rejectConfirm: reason must be a non-empty string')
    const ticket = this.#mustGet(ticketId)
    if (ticket.stage !== 'person/confirm') throw new TaskError('illegal-transition', 'ticket ' + ticketId + ': rejectConfirm requires person/confirm, got ' + ticket.stage)
    const actor = by ?? 'user'
    const transitioned = this.#transition(ticketId, 'blocked', actor)
    return this.#updateTicket({ ...transitioned, confirmOutcome: { kind: 'rejected', reason: reason.trim(), at: this.now(), by: actor } })
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

  /**
   * The user cancels a pending confirmation (person/confirm → done). #69: the 24h auto-cancel passes
   * { by: 'system', reason, kind: 'timeout' } so the face records WHY the confirmation ended.
   */
  cancel(ticketId, { by, reason, kind } = {}) {
    const ticket = this.#mustGet(ticketId)
    const actor = by ?? 'user'
    const wasConfirm = ticket.stage === 'person/confirm'
    const transitioned = this.#transition(ticketId, 'done', actor)
    if (!wasConfirm) return transitioned
    return this.#updateTicket({ ...transitioned, confirmOutcome: { kind: kind ?? 'cancelled', reason: reason ?? null, at: this.now(), by: actor } })
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

  /**
   * Binds the execution Session the owner created for this task; one task accrues many Assignments.
   * #69: a fork binding passes mechanism:'fork' so the face records HOW the task executes (spec 数据模型）.
   */
  bindWorkerSession(ticketId, { sessionId, cwd, mechanism }) {
    const ticket = this.#mustGet(ticketId)
    const assignment = { state: 'running', startedAt: this.now(), sessionId, cwd }
    const next = {
      ...ticket,
      workerSession: { sessionId, cwd, at: this.now() },
      assignments: [...(ticket.assignments ?? []), assignment],
      updatedAt: this.now(),
    }
    if (mechanism !== undefined) next.mechanism = mechanism
    return this.#updateTicket(next)
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
    return { stage: ticket.stage, text: STAGE_TEXT[ticket.stage], detail: stageDetail(ticket) }
  }
}

/**
 * THE single stage→face-fact mapping (双轴审查 P1: summarize and reporting.factLine both read this —
 * two readers, one source, no drift). Facts come from the ticket face only, never from session narrative.
 */
export function stageDetail(ticket) {
  return ticket.stage === 'person/review' ? ticket.report?.summary
    : ticket.stage === 'blocked' ? ticket.escalated?.reason
    : ticket.stage === 'failed' ? ticket.failed?.reason
    : ticket.stage === 'person/answer' ? ticket.question?.text
    : ticket.stage === 'person/confirm' ? ticket.pendingConfirm?.text
    : undefined
}

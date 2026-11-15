/**
 * The routing core behind the L1 tools (spec「工具契约」route_to_owner / query_tasks / reply_source).
 *
 * Everything routes through a narrow Sessions port so the policy — lazy owner creation, deleted-Session
 * rebuild, trigger idempotency — is unit-testable without a DSH runtime; src/index.js wires the real
 * sessionController into the same port.
 *
 * 先存后做 (spec「可靠性」+ #66): routeToOwner writes the Trigger, the Ticket (stage idle 待触发） and the
 * Outbox row BEFORE any prompt is admitted; the OutboxRunner then delivers, retrying with backoff and keeping
 * per-ticket order. A crash after any step leaves the store able to say exactly what happened, and a restart
 * resumes unfinished deliveries.
 *
 * 票面权威 (#66): a follow-up never binds a new Trigger and never re-binds authorization — passing
 * authorization on a follow-up is rejected; the Ticket's stored authorization record is the only one the
 * injection carries, whatever the conversation narrative claims. A ticket whose authorization record is
 * missing is failed permanently （缺上下文升级不编造）, never executed on a guess.
 */
import { randomUUID } from 'node:crypto'
import { TaskBoard, TaskError, STAGE_TEXT, normalizeStage } from './tasks.js'
import { OutboxRunner } from './outbox.js'
import { truncateWords } from './discipline.js'
import { buildDigestText, buildAutoSummary } from './reporting.js'

/** A routing failure with a machine-readable code for tool/API surfaces. */
export class RouterError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'RouterError'
    this.code = code
  }
}

/** The recovery note carried exactly once into the first injection after a host restart (spec: 重启恢复）. */
export const RECOVERY_NOTE = '（重启恢复：先检查目录与 git 状态，再重复任何对外动作）'

/** True when a prompt failure means the Session record is gone (deleted), not a transient/provider failure. */
function isMissingSession(error) {
  if (error?.name === 'ApiSessionNotFound') return true
  const message = String(error?.message ?? error)
  // Observed live: the runtime rejects with Error('session "<id>" not found') — quoted id, plain Error name.
  return /session\b[^\n]*\bnot found/i.test(message) || /absent from persistence|unknown session/i.test(message)
}

export class Router {
  /**
   * @param {{ store: import('./store.js').Store, registry: import('./registry.js').OwnerRegistry,
   *   sessions: { create: (request: any) => Promise<any>, prompt: (request: any) => Promise<any>, isRunning?: (sessionId: string) => Promise<boolean> },
   *   tasks?: import('./tasks.js').TaskBoard, runner?: import('./outbox.js').OutboxRunner,
   *   config?: { reporting?: { auto: boolean, intervalMs: number } },
   *   now?: () => string, ids?: { uuid: () => string },
   *   onSystemProblem?: (problem: object) => void }} deps
   */
  #lastAutoReportAt = null
  #lastAutoReportText = null

  constructor({ store, registry, sessions, tasks, runner, config, now, ids, onSystemProblem }) {
    this.store = store
    this.registry = registry
    this.sessions = sessions
    this.config = config ?? { reporting: { auto: false, intervalMs: 60000 } }
    this.now = now ?? (() => new Date().toISOString())
    this.ids = ids ?? { uuid: () => randomUUID() }
    // The lifecycle guard lives in TaskBoard (#66); Router drives tickets through it, never around it.
    this.tasks = tasks ?? new TaskBoard({ store, now: this.now })
    // Stored work lives in the OutboxRunner; its clock derives from this Router's clock so tests stay
    // deterministic. The deliverer is Router-internal: only it knows how to (re)bind owner Sessions.
    this.runner = runner ?? new OutboxRunner({
      store,
      now: () => Date.parse(this.now()),
      deliver: row => this.#deliverRow(row),
      onSystemProblem,
    })
  }

  #insertTrigger(row) {
    this.store.db.prepare('INSERT INTO trigger (id, value, at) VALUES (?, ?, ?)').run(row.id, JSON.stringify(row), row.at)
    return row
  }

  #insertTicket(row) {
    this.store.db.prepare('INSERT INTO ticket (id, value) VALUES (?, ?)').run(row.id, JSON.stringify(row))
    return row
  }

  #updateTicket(row) {
    this.store.db.prepare('UPDATE ticket SET value = ? WHERE id = ?').run(JSON.stringify(row), row.id)
    return row
  }

  /** One Trigger row by id, or undefined. */
  getTrigger(id) {
    const raw = this.store.db.prepare('SELECT value FROM trigger WHERE id = ?').get(id)
    return raw === undefined ? undefined : JSON.parse(String(raw.value))
  }

  /** One Ticket row by id (stage normalized), or undefined. */
  getTicket(id) {
    return this.tasks.getTicket(id)
  }

  /** Drives due outbox deliveries (the dev harness and the plugin timer both call this). */
  async tick() {
    await this.runner.tick()
  }

  /** Restart recovery: end running assignments "host restarted" and arm the recovery note (spec: 重启恢复）. */
  markRestart() {
    this.tasks.markRestart()
  }

  /** The chief's own Session (L1 统一出口): digests and replies are admitted here. */
  async #ensureChiefSession() {
    const chief = this.registry.get('chief')
    if (!chief) throw new RouterError('chief-missing', 'the chief owner row is missing from the registry')
    return this.#ensureSession(chief)
  }

  /** Lazily binds an owner Session: create only when the registry names none. */
  async #ensureSession(owner) {
    if (owner.sessionId) return { owner, sessionId: owner.sessionId, created: false }
    const created = await this.sessions.create({
      cwd: owner.cwd,
      agentPreset: 'hub-bot-owner',
      title: 'hub-bot owner: ' + (owner.workspace ?? owner.cwd),
    })
    const sessionId = created.sessionId ?? created.session?.id
    if (!sessionId) throw new RouterError('session-create-empty', 'owner Session creation returned no sessionId')
    const bound = this.registry.bindSession(owner.id, sessionId)
    return { owner: bound, sessionId, created: true }
  }

  /**
   * Routes one message to an L2 owner (spec: prompt 注入指定 L2 会话，含授权记录）.
   *
   * Idempotency: a triggerRef that already produced a Ticket returns that Ticket without re-injecting — one
   * Trigger accepted twice produces one task (spec「领域模型」). A missing owner Session (deleted by hand) is
   * detected from the prompt failure, rebuilt once, and the registry updated (spec: 被删自动重建）.
   *
   * With `ticketId` the message is a follow-up on an existing task: a ticket waiting on a person (review /
   * answer / confirm) or stopped (blocked / failed) is RELEASED back to working by the human's message
   * (spec: 人的消息直接释放）; a working ticket just takes the injection; a done ticket rejects.
   * `resolution: 'accept'` is the user-acceptance gate (person/review → done); `resolution: 'cancel'`
   * cancels a pending confirmation (person/confirm → done); neither injects anything.
   *
   * @returns deduped receipt { ownerId, sessionId, ticketId, requestId, createdSession, rebuilt, deduped,
   *   stage }, plus resumed/accepted/cancelled on the follow-up paths
   */
  async routeToOwner({ ownerId, message, triggerRef, ticketId, resolution, authorization }) {
    if (typeof message !== 'string' || !message.trim()) throw new RouterError('message-required', 'route_to_owner: message must be a non-empty string')
    const owner = this.registry.get(ownerId)
    if (!owner) throw new RouterError('unknown-owner', 'route_to_owner: unknown owner "' + ownerId + '" — call list_owners first')
    if (owner.role === 'chief') throw new RouterError('cannot-route-to-chief', 'route_to_owner: the chief is the router, not a route target')
    if (ticketId !== undefined) return this.#followUp({ owner, message: message.trim(), ticketId, resolution, authorization })
    if (resolution !== undefined) throw new RouterError('resolution-needs-ticket', 'route_to_owner: resolution requires ticketId')
    if (triggerRef !== undefined) {
      const existing = this.getTrigger(triggerRef)
      if (existing) {
        const ticket = this.#ticketByTrigger(triggerRef)
        return { ownerId, sessionId: owner.sessionId, ticketId: ticket?.id ?? null, requestId: ticket?.requestId ?? null, createdSession: false, rebuilt: false, deduped: true, stage: ticket ? normalizeStage(ticket.stage) : null }
      }
    }
    const at = this.now()
    const auth = authorization ?? { actor: 'user', source: 'dsh', at }
    const trigger = this.#insertTrigger({ id: triggerRef ?? 'trg-' + this.ids.uuid(), kind: 'route', ownerId, message, authorization: auth, at })
    const ensured = await this.#ensureSession(owner)
    const requestId = 'hub-bot-route-' + this.ids.uuid()
    const freshTicketId = 'tsk-' + this.ids.uuid()
    // 先存后做: the ticket waits as 待触发 (idle) until the stored injection is actually delivered.
    this.#insertTicket({
      id: freshTicketId, triggerId: trigger.id, owner: ownerId, stage: 'idle', mechanism: 'inject',
      targetSession: ensured.sessionId, requestId, authorization: auth, createdAt: at, updatedAt: at,
    })
    const text = '[hub-bot 路由 ' + freshTicketId + '] ' + message.trim() + '\n\n授权：' + auth.actor + ' 经 ' + auth.source + ' 于 ' + auth.at + '；任务 ' + freshTicketId
    this.runner.enqueue({ ticketId: freshTicketId, kind: 'inject', to: 'session:' + ensured.sessionId, sessionId: ensured.sessionId, body: text, requestId })
    await this.runner.tick()
    const stored = this.tasks.getTicket(freshTicketId)
    return { ownerId, sessionId: stored.targetSession, ticketId: freshTicketId, requestId, createdSession: ensured.created, rebuilt: stored.lastDelivery?.rebuilt ?? false, deduped: false, stage: stored.stage }
  }

  /** The follow-up/acceptance path: same task, same owner Session, NO new Trigger and NO new authorization. */
  async #followUp({ owner, message, ticketId, resolution, authorization }) {
    const ticket = this.tasks.getTicket(ticketId)
    if (!ticket) throw new RouterError('unknown-ticket', 'route_to_owner: unknown ticket "' + ticketId + '" — call query_tasks first')
    if (ticket.owner !== owner.id) {
      throw new RouterError('ticket-owner-mismatch', 'route_to_owner: ticket ' + ticketId + ' belongs to ' + ticket.owner + ', not ' + owner.id)
    }
    // 票面权威： a follow-up cannot re-bind the trigger or the authorization record.
    if (authorization !== undefined) {
      throw new RouterError('authorization-immutable', 'route_to_owner: a follow-up cannot re-bind authorization — the ticket record is authoritative')
    }
    if (resolution !== undefined) {
      if (resolution === 'accept') {
        try {
          this.tasks.accept(ticketId)
        } catch (error) {
          if (error instanceof TaskError) throw new RouterError(error.code, error.message)
          throw error
        }
        return { ownerId: owner.id, sessionId: owner.sessionId, ticketId, requestId: ticket.requestId, createdSession: false, rebuilt: false, deduped: false, accepted: true, stage: 'done' }
      }
      if (resolution === 'cancel') {
        try {
          this.tasks.cancel(ticketId)
        } catch (error) {
          if (error instanceof TaskError) throw new RouterError(error.code, error.message)
          throw error
        }
        return { ownerId: owner.id, sessionId: owner.sessionId, ticketId, requestId: ticket.requestId, createdSession: false, rebuilt: false, deduped: false, cancelled: true, stage: 'done' }
      }
      throw new RouterError('unknown-resolution', 'route_to_owner: resolution must be "accept" or "cancel" when given')
    }
    let resumed = false
    if (ticket.stage === 'done') {
      throw new RouterError('illegal-transition', 'route_to_owner: ticket ' + ticketId + ' is done — create a new task instead of reviving it')
    }
    if (['person/review', 'person/answer', 'person/confirm', 'blocked', 'failed'].includes(ticket.stage)) {
      // 人的消息直接释放： waiting/stopped tasks resume to working (spec「状态模型」).
      try {
        this.tasks.resume(ticketId, { by: 'route' })
      } catch (error) {
        if (error instanceof TaskError) throw new RouterError(error.code, error.message)
        throw error
      }
      resumed = true
    }
    // 票面权威： the injection carries the ticket's stored authorization, never a narrative claim.
    const auth = ticket.authorization
    if (!auth) {
      try { this.tasks.escalate({ ticketId, reason: '授权记录缺失（票面权威），拒绝凭会话叙事执行' }) } catch { /* stage may not allow it */ }
      throw new RouterError('authorization-missing', 'route_to_owner: ticket ' + ticketId + ' has no authorization record — refusing to act on a guess')
    }
    let text = '[hub-bot 追问 ' + ticketId + '] ' + message + '\n\n授权：' + auth.actor + ' 经 ' + auth.source + ' 于 ' + auth.at + '；任务 ' + ticketId
    text += resumed ? '（票已恢复进行中，改完请再次 report 转入等验收）' : '（同一任务追加指令，完成后 report 转入等验收）'
    // 重启恢复： the first injection after a host restart repeats the recovery note, exactly once.
    if (ticket.recoveryPending) {
      text = RECOVERY_NOTE + '\n\n' + text
      this.tasks.noteRecoveryCarried(ticketId)
    }
    const requestId = 'hub-bot-route-' + this.ids.uuid()
    const ensured = await this.#ensureSession(owner)
    this.runner.enqueue({ ticketId, kind: 'inject', to: 'session:' + ensured.sessionId, sessionId: ensured.sessionId, body: text, requestId })
    await this.runner.tick()
    const stored = this.tasks.getTicket(ticketId)
    return { ownerId: owner.id, sessionId: stored.targetSession, ticketId, requestId, createdSession: ensured.created, rebuilt: stored.lastDelivery?.rebuilt ?? false, deduped: false, resumed, stage: stored.stage }
  }

  /**
   * The runner's deliverer. kind 'inject' prompts the owner Session (rebuilding it once when the registry's
   * pointer dangles) and flips idle → working (待触发 → 进行中）. Reply/escalation rows are recorded durable
   * intents until a real channel deliverer (Feishu) lands — storing them already satisfies 先存后做.
   */
  async #deliverRow(row) {
    if (row.kind === 'digest') return this.#deliverDigest(row)
    if (row.kind === 'reply') return this.#deliverReply(row)
    if (row.kind !== 'inject') return
    const ticket = this.tasks.getTicket(row.ticketId)
    const permanent = (message) => { const error = new Error(message); error.permanent = true; return error }
    if (!ticket) throw permanent('outbox ' + row.id + ': ticket ' + row.ticketId + ' is gone')
    // 缺上下文升级不编造： no authorization record → fail the ticket, never execute on a guess.
    if (!ticket.authorization) {
      try { this.tasks.fail({ ticketId: ticket.id, reason: '授权记录缺失（票面权威），拒绝执行' }) } catch { /* stage may not allow it */ }
      throw permanent('ticket ' + ticket.id + ' has no authorization record')
    }
    const owner = this.registry.get(ticket.owner)
    if (!owner) throw permanent('ticket ' + ticket.id + ': owner ' + ticket.owner + ' is gone from the registry')
    const ensured = await this.#ensureSession(owner)
    const delivered = await this.#promptOwner(owner.id, ensured, ticket, row.requestId, row.body)
    const updated = this.tasks.markDelivered(ticket.id) // 待触发 → 进行中 (no-op for later injections)
    this.#updateTicket({ ...updated, targetSession: delivered.sessionId, lastDelivery: { state: 'sent', rebuilt: delivered.rebuilt, at: this.now() }, updatedAt: this.now() })
  }

  /**
   * Admits one prompt to the owner Session, rebuilding the Session once when the registry's pointer dangles
   * (deleted Session) and retargeting the Ticket at the replacement. Shared by first routing and follow-ups.
   * ticket may be null (chief-bound digest/reply rows carry no ticket — nothing to retarget).
   */
  async #promptOwner(ownerId, ensured, ticket, requestId, text) {
    let sessionId = ensured.sessionId
    try {
      await this.sessions.prompt({ sessionId, requestId, text })
      return { sessionId, rebuilt: false }
    } catch (error) {
      if (!isMissingSession(error)) throw error
      this.registry.markSessionMissing(ownerId)
      const replacement = await this.#ensureSession(this.registry.get(ownerId))
      sessionId = replacement.sessionId
      if (ticket) this.#updateTicket({ ...ticket, targetSession: sessionId, updatedAt: this.now() })
      await this.sessions.prompt({ sessionId, requestId, text })
      return { sessionId, rebuilt: true }
    }
  }

  /**
   * Digest delivery (#67): the wake ends when the owner's Session goes idle — until then the row postpones
   * itself WITHOUT burning attempts, so every report of one wake lands as ONE merged message on the chief
   * (每次唤醒至多一条对外汇报). The text renders stored face facts only (汇报以票面为准).
   */
  async #deliverDigest(row) {
    const owner = this.registry.get(row.ownerId)
    if (!owner) {
      const error = new Error('digest ' + row.id + ': owner ' + row.ownerId + ' is gone from the registry')
      error.permanent = true
      throw error
    }
    const sessionId = owner.sessionId
    if (sessionId && this.sessions.isRunning && await this.sessions.isRunning(sessionId)) {
      return { postponeMs: 2000 } // the wake is still running — keep coalescing
    }
    const ensured = await this.#ensureChiefSession()
    await this.#promptOwner('chief', ensured, null, row.requestId, buildDigestText(row))
  }

  /**
   * Reply delivery (#67 统一出口): session-addressable rows are admitted to that Session (the chief for
   * 'dsh:session:chief'); external targets (feishu:…) remain recorded intents until their channel lands.
   */
  async #deliverReply(row) {
    if (row.to === 'dsh:session:chief') {
      const ensured = await this.#ensureChiefSession()
      await this.#promptOwner('chief', ensured, null, row.requestId, row.body)
      return
    }
    if (typeof row.to === 'string' && row.to.startsWith('session:')) {
      await this.sessions.prompt({ sessionId: row.to.slice('session:'.length), requestId: row.requestId, text: row.body })
    }
    // external targets: stored intent suffices (先存后做) until the channel deliverer lands
  }

  /**
   * Scheduled auto-summary (#67 定时汇总自动汇报, OFF by default): one truncated status summary to the
   * unified outlet, listing only active stages (结果可用或需要行动). The dev API forces a tick for proofs.
   */
  async autoReportTick({ force } = {}) {
    const reporting = this.config?.reporting ?? { auto: false, intervalMs: 60000 }
    if (!reporting.auto) return { skipped: 'disabled' }
    const nowMs = Date.parse(this.now())
    if (!force && this.#lastAutoReportAt !== null && nowMs - this.#lastAutoReportAt < reporting.intervalMs) {
      return { skipped: 'interval' }
    }
    const text = buildAutoSummary(this.queryTasks({}))
    if (!text) return { skipped: 'empty' }
    // 消息纪律: an unchanged status is not news — never repeat the same summary (只在结果可用或需要行动时说话).
    if (text === this.#lastAutoReportText) return { skipped: 'unchanged' }
    const receipt = await this.replySource({ text, to: 'dsh:session:chief' })
    this.#lastAutoReportAt = nowMs
    this.#lastAutoReportText = text
    return { outboxId: receipt.outboxId, truncated: receipt.truncated }
  }

  #ticketByTrigger(triggerId) {
    const rows = this.store.db.prepare('SELECT value FROM ticket').all()
    for (const raw of rows) {
      const ticket = JSON.parse(String(raw.value))
      if (ticket.triggerId === triggerId) return ticket
    }
    return undefined
  }

  /**
   * Task store query (spec: query_tasks) — filter by owner and/or stage; newest first. Each row carries
   * stageText, the VERBATIM reading of the stage (spec: 状态摘要是对状态的朗读，不是 LLM 的即兴总结）.
   */
  queryTasks({ owner, stage } = {}) {
    const rows = this.store.db.prepare('SELECT value FROM ticket').all()
      .map(raw => JSON.parse(String(raw.value)))
      .map(ticket => ({ ...ticket, stage: normalizeStage(ticket.stage) }))
      .filter(ticket => (owner === undefined || ticket.owner === owner) && (stage === undefined || ticket.stage === stage))
      .map(ticket => ({ ...ticket, stageText: STAGE_TEXT[ticket.stage], detail: this.tasks.summarize(ticket.id).detail ?? null }))
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /**
   * Replies to the trigger's Source through the outbox (spec: reply_source 经 Outbox 回复）. The 100-word
   * discipline is enforced BY CODE (spec「消息纪律」); the stored row is the durable intent and is marked
   * sent once admitted — the Feishu channel task will swap in a real deliverer.
   */
  async replySource({ text, to }) {
    if (typeof text !== 'string' || !text.trim()) throw new RouterError('text-required', 'reply_source: text must be a non-empty string')
    const { text: body, truncated } = truncateWords(text.trim())
    const row = this.runner.enqueue({ ticketId: null, kind: 'reply', to: to ?? 'dsh', body, requestId: 'hub-bot-reply-' + this.ids.uuid() })
    await this.runner.tick()
    return { outboxId: row.id, state: this.#outboxRow(row.id).state, truncated }
  }

  #outboxRow(id) {
    const raw = this.store.db.prepare('SELECT value FROM outbox WHERE id = ?').get(id)
    return raw === undefined ? undefined : JSON.parse(String(raw.value))
  }

  /** Outbox rows, oldest first. */
  listOutbox() {
    return this.store.db.prepare('SELECT value FROM outbox ORDER BY at').all().map(raw => JSON.parse(String(raw.value)))
  }
}

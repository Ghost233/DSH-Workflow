/**
 * The routing core behind the L1 tools (spec「工具契约」route_to_owner / query_tasks / reply_source).
 *
 * Everything routes through a narrow Sessions port so the policy — lazy owner creation, deleted-Session rebuild,
 * trigger idempotency, store-before-act — is unit-testable without a DSH runtime; src/index.js wires the real
 * sessionController into the same port.
 *
 * 先存后做 (spec「可靠性」): routeToOwner writes the Trigger, lazily binds the owner Session, and writes the
 * Ticket BEFORE the prompt is admitted. A crash after any step leaves the store able to say exactly what happened.
 */
import { randomUUID } from 'node:crypto'
import { TaskBoard, TaskError } from './tasks.js'

/** A routing failure with a machine-readable code for tool/API surfaces. */
export class RouterError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'RouterError'
    this.code = code
  }
}

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
   *   sessions: { create: (request: any) => Promise<any>, prompt: (request: any) => Promise<any> },
   *   tasks?: import('./tasks.js').TaskBoard, now?: () => string, ids?: { uuid: () => string } }} deps
   */
  constructor({ store, registry, sessions, tasks, now, ids }) {
    this.store = store
    this.registry = registry
    this.sessions = sessions
    this.now = now ?? (() => new Date().toISOString())
    this.ids = ids ?? { uuid: () => randomUUID() }
    // The lifecycle guard lives in TaskBoard (#65); Router drives tickets through it, never around it.
    this.tasks = tasks ?? new TaskBoard({ store, now: this.now })
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

  /** One Ticket row by id, or undefined. */
  getTicket(id) {
    const raw = this.store.db.prepare('SELECT value FROM ticket WHERE id = ?').get(id)
    return raw === undefined ? undefined : JSON.parse(String(raw.value))
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
   * With `ticketId` the message is a follow-up on an existing task (#65 追问恢复): a ticket waiting for
   * acceptance (review) resumes to working instead of a new task being created; a working ticket just takes the
   * injection; a done ticket rejects. `resolution: 'accept'` is the user-acceptance gate (review → done) and
   * injects nothing. The follow-up injection carries the task's immutable authorization record.
   *
   * @returns deduped receipt { ownerId, sessionId, ticketId, requestId, createdSession, rebuilt, deduped },
   *   plus resumed/accepted on the follow-up paths
   */
  async routeToOwner({ ownerId, message, triggerRef, ticketId, resolution, authorization }) {
    if (typeof message !== 'string' || !message.trim()) throw new RouterError('message-required', 'route_to_owner: message must be a non-empty string')
    const owner = this.registry.get(ownerId)
    if (!owner) throw new RouterError('unknown-owner', 'route_to_owner: unknown owner "' + ownerId + '" — call list_owners first')
    if (owner.role === 'chief') throw new RouterError('cannot-route-to-chief', 'route_to_owner: the chief is the router, not a route target')
    if (ticketId !== undefined) return this.#followUp({ owner, message: message.trim(), ticketId, resolution })
    if (resolution !== undefined) throw new RouterError('resolution-needs-ticket', 'route_to_owner: resolution requires ticketId')
    if (triggerRef !== undefined) {
      const existing = this.getTrigger(triggerRef)
      if (existing) {
        const ticket = this.#ticketByTrigger(triggerRef)
        return { ownerId, sessionId: owner.sessionId, ticketId: ticket?.id ?? null, requestId: ticket?.requestId ?? null, createdSession: false, rebuilt: false, deduped: true }
      }
    }
    const at = this.now()
    const auth = authorization ?? { actor: 'user', source: 'dsh', at }
    const trigger = this.#insertTrigger({ id: triggerRef ?? 'trg-' + this.ids.uuid(), kind: 'route', ownerId, message, authorization: auth, at })
    const ensured = await this.#ensureSession(owner)
    const requestId = 'hub-bot-route-' + this.ids.uuid()
    const freshTicketId = 'tsk-' + this.ids.uuid()
    const ticket = this.#insertTicket({
      id: freshTicketId, triggerId: trigger.id, owner: ownerId, stage: 'working', mechanism: 'inject',
      targetSession: ensured.sessionId, requestId, authorization: auth, createdAt: at, updatedAt: at,
    })
    const text = '[hub-bot 路由 ' + freshTicketId + '] ' + message.trim() + '\n\n授权：' + auth.actor + ' 经 ' + auth.source + ' 于 ' + auth.at + '；任务 ' + freshTicketId
    const delivered = await this.#promptOwner(ownerId, ensured, ticket, requestId, text)
    return { ownerId, sessionId: delivered.sessionId, ticketId: freshTicketId, requestId, createdSession: ensured.created, rebuilt: delivered.rebuilt, deduped: false }
  }

  /** The #65 follow-up/acceptance path: same task, same owner Session, no new Trigger or Ticket. */
  async #followUp({ owner, message, ticketId, resolution }) {
    const ticket = this.tasks.getTicket(ticketId)
    if (!ticket) throw new RouterError('unknown-ticket', 'route_to_owner: unknown ticket "' + ticketId + '" — call query_tasks first')
    if (ticket.owner !== owner.id) {
      throw new RouterError('ticket-owner-mismatch', 'route_to_owner: ticket ' + ticketId + ' belongs to ' + ticket.owner + ', not ' + owner.id)
    }
    if (resolution !== undefined) {
      if (resolution !== 'accept') throw new RouterError('unknown-resolution', 'route_to_owner: resolution must be "accept" when given')
      try {
        this.tasks.accept(ticketId)
      } catch (error) {
        if (error instanceof TaskError) throw new RouterError(error.code, error.message)
        throw error
      }
      return { ownerId: owner.id, sessionId: owner.sessionId, ticketId, requestId: ticket.requestId, createdSession: false, rebuilt: false, deduped: false, accepted: true, stage: 'done' }
    }
    let resumed = false
    if (ticket.stage === 'review') {
      try {
        this.tasks.resume(ticketId)
      } catch (error) {
        if (error instanceof TaskError) throw new RouterError(error.code, error.message)
        throw error
      }
      resumed = true
    } else if (ticket.stage === 'done') {
      throw new RouterError('illegal-transition', 'route_to_owner: ticket ' + ticketId + ' is done — create a new task instead of reviving it')
    }
    const auth = ticket.authorization
    const text = '[hub-bot 追问 ' + ticketId + '] ' + message + '\n\n授权：' + auth.actor + ' 经 ' + auth.source + ' 于 ' + auth.at + '；任务 ' + ticketId + '（票已恢复进行中，改完请再次 report 转入等验收）'
    const requestId = 'hub-bot-route-' + this.ids.uuid()
    const ensured = await this.#ensureSession(owner)
    const delivered = await this.#promptOwner(owner.id, ensured, this.tasks.getTicket(ticketId), requestId, text)
    return { ownerId: owner.id, sessionId: delivered.sessionId, ticketId, requestId, createdSession: ensured.created, rebuilt: delivered.rebuilt, deduped: false, resumed }
  }

  /**
   * Admits one prompt to the owner Session, rebuilding the Session once when the registry's pointer dangles
   * (deleted Session) and retargeting the Ticket at the replacement. Shared by first routing and follow-ups.
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
      this.#updateTicket({ ...ticket, targetSession: sessionId, updatedAt: this.now() })
      await this.sessions.prompt({ sessionId, requestId, text })
      return { sessionId, rebuilt: true }
    }
  }

  #ticketByTrigger(triggerId) {
    const rows = this.store.db.prepare('SELECT value FROM ticket').all()
    for (const raw of rows) {
      const ticket = JSON.parse(String(raw.value))
      if (ticket.triggerId === triggerId) return ticket
    }
    return undefined
  }

  /** Task store query (spec: query_tasks) — filter by owner and/or stage; newest first. */
  queryTasks({ owner, stage } = {}) {
    const rows = this.store.db.prepare('SELECT value FROM ticket').all()
      .map(raw => JSON.parse(String(raw.value)))
      .filter(ticket => (owner === undefined || ticket.owner === owner) && (stage === undefined || ticket.stage === stage))
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /**
   * Replies to the trigger's Source through the outbox (spec: reply_source 经 Outbox 回复）. No delivery channel
   * (Feishu) exists yet, so the row is recorded as the durable intent; the channel ticket turns state into sent.
   */
  async replySource({ text, to }) {
    if (typeof text !== 'string' || !text.trim()) throw new RouterError('text-required', 'reply_source: text must be a non-empty string')
    const at = this.now()
    const row = { id: 'out-' + this.ids.uuid(), to: to ?? 'dsh', body: text.trim(), state: 'recorded', attempts: 0, at }
    this.store.db.prepare('INSERT INTO outbox (id, value, at) VALUES (?, ?, ?)').run(row.id, JSON.stringify(row), at)
    return { outboxId: row.id, state: row.state }
  }

  /** Outbox rows, oldest first. */
  listOutbox() {
    return this.store.db.prepare('SELECT value FROM outbox ORDER BY at').all().map(raw => JSON.parse(String(raw.value)))
  }
}

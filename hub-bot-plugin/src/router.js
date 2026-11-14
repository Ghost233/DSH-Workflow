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
   *   now?: () => string, ids?: { uuid: () => string } }} deps
   */
  constructor({ store, registry, sessions, now, ids }) {
    this.store = store
    this.registry = registry
    this.sessions = sessions
    this.now = now ?? (() => new Date().toISOString())
    this.ids = ids ?? { uuid: () => randomUUID() }
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
   * @returns deduped receipt { ownerId, sessionId, ticketId, requestId, createdSession, rebuilt, deduped }
   */
  async routeToOwner({ ownerId, message, triggerRef, authorization }) {
    if (typeof message !== 'string' || !message.trim()) throw new RouterError('message-required', 'route_to_owner: message must be a non-empty string')
    const owner = this.registry.get(ownerId)
    if (!owner) throw new RouterError('unknown-owner', 'route_to_owner: unknown owner "' + ownerId + '" — call list_owners first')
    if (owner.role === 'chief') throw new RouterError('cannot-route-to-chief', 'route_to_owner: the chief is the router, not a route target')
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
    const ticketId = 'tsk-' + this.ids.uuid()
    let ticket = this.#insertTicket({
      id: ticketId, triggerId: trigger.id, owner: ownerId, stage: 'working', mechanism: 'inject',
      targetSession: ensured.sessionId, requestId, authorization: auth, createdAt: at, updatedAt: at,
    })
    const text = '[hub-bot 路由 ' + ticketId + '] ' + message.trim() + '\n\n授权：' + auth.actor + ' 经 ' + auth.source + ' 于 ' + auth.at + '；任务 ' + ticketId
    let rebuilt = false
    let sessionId = ensured.sessionId
    try {
      await this.sessions.prompt({ sessionId, requestId, text })
    } catch (error) {
      if (!isMissingSession(error)) throw error
      // The registry pointed at a deleted Session: forget it, lazily create a replacement, retarget the Ticket,
      // and admit the same prompt once into the new Session.
      this.registry.markSessionMissing(ownerId)
      const replacement = await this.#ensureSession(this.registry.get(ownerId))
      sessionId = replacement.sessionId
      ticket = this.#updateTicket({ ...ticket, targetSession: sessionId, updatedAt: this.now() })
      await this.sessions.prompt({ sessionId, requestId, text })
      rebuilt = true
    }
    return { ownerId, sessionId, ticketId, requestId, createdSession: ensured.created, rebuilt, deduped: false }
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

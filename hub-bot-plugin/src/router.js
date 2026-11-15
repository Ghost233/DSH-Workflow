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
import { TaskBoard, STAGE_TEXT, normalizeStage, translateTaskError, CONFIRM_TIMEOUT_MS } from './tasks.js'
import { OutboxRunner } from './outbox.js'
import { truncateWords } from './discipline.js'
import { buildDigestText, buildAutoSummary } from './reporting.js'
import { confirmTicketFork } from './fork.js'

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
  /** #72 并发安全： per-owner promise chains — see the constructor note. */
  #ownerChains = new Map()

  constructor({ store, registry, sessions, tasks, runner, config, now, ids, onSystemProblem }) {
    this.store = store
    this.registry = registry
    this.sessions = sessions
    this.config = config ?? { reporting: { auto: false, intervalMs: 60000 } }
    this.now = now ?? (() => new Date().toISOString())
    this.ids = ids ?? { uuid: () => randomUUID() }
    // The lifecycle guard lives in TaskBoard (#66); Router drives tickets through it, never around it.
    this.tasks = tasks ?? new TaskBoard({ store, now: this.now })
    // 回收触发段 (#70): optional terminal-ticket callback (Recycler.maybeRecycleForTicket). Assigned by the
    // plugin root after construction; invoked after every router-initiated done/failed transition. Terminal
    // transitions that bypass the Router (owner-tools report-failure, channel 终止) are the Recycler sweep's job.
    this.onTicketTerminal = null
    // #72 并发安全: per-owner promise chains serialize every routeToOwner (all entries — L1 tool, devApi,
    // 飞书, GitHub) and every promotion pass for that owner, so read-check-write sequences (slot counting)
    // never interleave. SQLite writes themselves are synchronous (node:sqlite) — the single-writer
    // discipline holds per statement; the chain guards the multi-statement admission decision.
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

  /**
   * Drives due outbox deliveries (the dev harness and the plugin timer both call this).
   * #69: the same pulse sweeps person/confirm tickets past the 24h confirmation timeout
   * (spec「错误场景」: 待确认路由 24 小时未确认自动取消，回复"已取消").
   */
  async tick() {
    await this.runner.tick()
    await this.#sweepConfirmTimeouts()
    // #72 执行槽： a slot freed since the last pulse promotes the oldest queued ticket (FIFO); the second
    // runner pass delivers the released injection in the same pulse （提升即投递）.
    await this.#promoteQueued()
    await this.runner.tick()
  }

  /**
   * 确认超时清扫： a person/confirm request unanswered for CONFIRM_TIMEOUT_MS auto-cancels (person/confirm →
   * done, by 'system') and the cancellation is announced through the chief （统一出口）. The announce row is
   * stored-then-delivered by the runner like every outward message （先存后做）; a ticket cancelled once leaves
   * person/confirm, so the notice fires exactly once.
   */
  async #sweepConfirmTimeouts() {
    const nowMs = Date.parse(this.now())
    for (const ticket of this.queryTasks({ stage: 'person/confirm' })) {
      const at = ticket.pendingConfirm?.at
      if (!at) continue
      if (nowMs - Date.parse(at) <= CONFIRM_TIMEOUT_MS) continue
      try {
        this.tasks.cancel(ticket.id, { by: 'system', reason: '确认超过 24 小时未回应，自动取消', kind: 'timeout' })
        this.#notifyTerminal(ticket.id)
      } catch { continue } // another path resolved it meanwhile — nothing to announce
      await this.replySource({ text: '已取消：任务 ' + ticket.id + ' 的确认请求超过 24 小时未回应（' + ticket.pendingConfirm.text + '）', to: 'dsh:session:chief' })
    }
  }

  /**
   * resolution:'confirm' (#69): executes the stored fork action (code-driven via the Sessions port), rebinds
   * the task at the forked Session and wakes the owner to inject the continuation there. The wake carries the
   * ticket's stored authorization （票面权威） like every owner-bound injection. A fork failure throws and
   * leaves the ticket at person/confirm — the user may retry, reject or cancel.
   */
  async #confirmPendingFork(owner, ticket, ticketId) {
    let result
    try {
      result = await confirmTicketFork({ tasks: this.tasks, sessions: this.sessions, ticketId })
    } catch (error) {
      throw translateTaskError(error, (code, message) => new RouterError(code, message))
    }
    // 缺上下文升级不编造： the fork executed, but without an authorization record the continuation must not run.
    if (!ticket.authorization) {
      try { this.tasks.escalate({ ticketId, reason: '授权记录缺失（票面权威），fork 已执行但拒绝凭会话叙事续作' }) } catch { /* stage may not allow it */ }
      throw new RouterError('authorization-missing', 'route_to_owner: ticket ' + ticketId + ' has no authorization record — refusing to act on a guess')
    }
    const auth = ticket.authorization
    const ensured = await this.#ensureSession(owner)
    const text = '[hub-bot 确认 ' + ticketId + '] 用户已确认 fork：原会话 ' + result.fromSessionId + ' → 新会话 ' + result.sessionId + '（cwd=' + result.cwd + '）。'
      + '任务已绑到新会话并回到进行中；请用 inject_session（带 ticketId）把续作指令注入新会话继续任务。原会话保留可查，勿再注入。'
      + '\n\n授权：' + auth.actor + ' 经 ' + auth.source + ' 于 ' + auth.at + '；任务 ' + ticketId
    this.runner.enqueue({ ticketId, kind: 'inject', to: 'session:' + ensured.sessionId, sessionId: ensured.sessionId, body: text, requestId: 'hub-bot-route-' + this.ids.uuid() })
    await this.runner.tick()
    return { ownerId: owner.id, sessionId: ensured.sessionId, ticketId, requestId: ticket.requestId, createdSession: ensured.created, rebuilt: false, deduped: false, confirmed: true, fork: { fromSessionId: result.fromSessionId, sessionId: result.sessionId }, stage: 'working' }
  }

  /** Restart recovery: end running assignments "host restarted" and arm the recovery note (spec: 重启恢复）. */
  /**
   * Restart recovery (spec「重启恢复」 + #72 AC1 自动恢复）: assignments running at the crash end "host
   * restarted", then every working ticket gets a FRESH recovery injection automatically — 最旧优先， through
   * the execution-slot gate: the per-owner overflow demotes to queued and its injection is stored HELD
   * (#promoteQueued admits it when a slot frees). The recovery note itself is prepended at delivery time
   * (carried exactly once). Idle/queued tickets already hold their stored rows — the runner redelivers them.
   */
  async markRestart() {
    this.tasks.markRestart()
    const pending = this.store.db.prepare('SELECT value FROM ticket').all()
      .map(raw => JSON.parse(String(raw.value)))
      .filter(ticket => ticket.recoveryPending === true && normalizeStage(ticket.stage) === 'working')
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))) // 最旧优先
    if (pending.length === 0) return { resumed: 0, queued: 0 }
    let resumed = 0
    let queued = 0
    const perOwner = new Map()
    for (const ticket of pending) {
      const owner = this.registry.get(ticket.owner)
      if (!owner || owner.recycled) continue // 负责人已回收：无处可恢复，票面保持原样
      const existing = this.listOutbox().find(row => row.ticketId === ticket.id && row.kind === 'inject'
        && (row.state === 'queued' || row.state === 'held') && row.body.startsWith('[hub-bot 恢复 ' + ticket.id + ']'))
      if (existing) continue // 幂等：恢复注入已存，不重复补投
      const count = perOwner.get(ticket.owner) ?? 0
      const atCapacity = count >= this.#slotsPerOwner() // 执行槽闸门：槽满则 queued 等位
      perOwner.set(ticket.owner, count + 1)
      if (atCapacity) {
        try { this.tasks.demote(ticket.id) } catch { continue } // 期间被别的路径改态 — 交给那条路径
        queued++
      } else {
        resumed++
      }
      const ensured = await this.#ensureSession(owner)
      const trigger = ticket.triggerId ? this.getTrigger(ticket.triggerId) : null
      const auth = ticket.authorization ?? { actor: 'user', source: 'dsh', at: ticket.createdAt }
      const original = typeof trigger?.message === 'string' && trigger.message ? trigger.message : '（原始指令见会话历史）'
      const text = '[hub-bot 恢复 ' + ticket.id + '] 宿主重启，任务自动恢复（最旧优先）。原始任务：' + original
        + '\n\n授权：' + auth.actor + ' 经 ' + auth.source + ' 于 ' + auth.at + '；任务 ' + ticket.id
      this.runner.enqueue({
        ticketId: ticket.id, kind: 'inject', to: 'session:' + ensured.sessionId, sessionId: ensured.sessionId,
        body: text, requestId: 'hub-bot-resume-' + this.ids.uuid(), held: atCapacity,
      })
    }
    await this.runner.tick()
    return { resumed, queued }
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
   * cancels a pending confirmation (person/confirm → done); `resolution: 'confirm'` executes the pending
   * fork and wakes the owner (#69); `resolution: 'reject'` refuses it (person/confirm → blocked, 保持原会话）.
   * accept/cancel/reject inject nothing; confirm injects the owner wake.
   *
   * @returns deduped receipt { ownerId, sessionId, ticketId, requestId, createdSession, rebuilt, deduped,
   *   stage }, plus resumed/accepted/cancelled/confirmed/rejected on the follow-up paths
   */
  async routeToOwner({ ownerId, message, triggerRef, ticketId, resolution, authorization }) {
    if (typeof message !== 'string' || !message.trim()) throw new RouterError('message-required', 'route_to_owner: message must be a non-empty string')
    const owner = this.registry.get(ownerId)
    if (!owner) throw new RouterError('unknown-owner', 'route_to_owner: unknown owner "' + ownerId + '" — call list_owners first')
    if (owner.role === 'chief') throw new RouterError('cannot-route-to-chief', 'route_to_owner: the chief is the router, not a route target')
    // #70: a recycled scratch owner's directory is gone (物理上无法恢复) — follow-ups to its finished task start
    // a NEW task instead (spec「已结束任务的跟进」例外); never route into a recycled row.
    if (owner.recycled) throw new RouterError('owner-recycled', 'route_to_owner: owner ' + ownerId + ' 已回收（临时目录已删）——请新建任务，不要复活旧负责人')
    // #72 并发安全： every entry (L1 tool / devApi / 飞书 / GitHub) serializes per owner through the chain,
    // so the slot ledger below can never be read mid-write by a same-owner sibling.
    return this.#serialized(owner.id, () =>
      this.#routeToOwnerLocked({ owner, message: message.trim(), triggerRef, ticketId, resolution, authorization }))
  }

  /** routeToOwner's body, run under the per-owner chain (see routeToOwner). */
  async #routeToOwnerLocked({ owner, message, triggerRef, ticketId, resolution, authorization }) {
    const ownerId = owner.id
    if (ticketId !== undefined) return this.#followUp({ owner, message, ticketId, resolution, authorization })
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
    // #72 执行槽： with every per-owner slot busy the new task queues （排队中） — trigger, ticket and the
    // HELD injection row are all stored now （先存后做）; the row delivers when a slot frees (#promoteQueued).
    // The ledger counts working tickets only: handing a task back to a person releases the slot at once
    // (spec「并发与人的优先」). count→insert→enqueue run synchronously — no interleaving mid-decision.
    const atCapacity = this.#workingCount(ownerId) >= this.#slotsPerOwner()
    // 先存后做： the ticket waits as 待触发 (idle) — or 排队中 (queued) at capacity — until the stored
    // injection is actually delivered.
    this.#insertTicket({
      id: freshTicketId, triggerId: trigger.id, owner: ownerId, stage: atCapacity ? 'queued' : 'idle', mechanism: 'inject',
      targetSession: ensured.sessionId, requestId, authorization: auth, createdAt: at, updatedAt: at,
    })
    const text = '[hub-bot 路由 ' + freshTicketId + '] ' + message + '\n\n授权：' + auth.actor + ' 经 ' + auth.source + ' 于 ' + auth.at + '；任务 ' + freshTicketId
    this.runner.enqueue({ ticketId: freshTicketId, kind: 'inject', to: 'session:' + ensured.sessionId, sessionId: ensured.sessionId, body: text, requestId, held: atCapacity })
    await this.runner.tick()
    const stored = this.tasks.getTicket(freshTicketId)
    return { ownerId, sessionId: stored.targetSession, ticketId: freshTicketId, requestId, createdSession: ensured.created, rebuilt: stored.lastDelivery?.rebuilt ?? false, deduped: false, stage: stored.stage }
  }

  /** #72: runs `fn` after every prior op on the same owner; a rejected op never breaks the chain. */
  #serialized(ownerId, fn) {
    const prev = this.#ownerChains.get(ownerId) ?? Promise.resolve()
    const run = prev.catch(() => {}).then(fn)
    this.#ownerChains.set(ownerId, run.catch(() => {}))
    return run
  }

  /** #72: the per-owner execution-slot cap (config.concurrency.slotsPerOwner; spec default 3). */
  #slotsPerOwner() {
    const value = this.config?.concurrency?.slotsPerOwner
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : 3
  }

  /** #72: one owner's working-stage ticket count — the slot ledger (person/* stages hold no slot). */
  #workingCount(ownerId) {
    return this.store.db.prepare('SELECT value FROM ticket').all()
      .map(raw => JSON.parse(String(raw.value)))
      .filter(ticket => ticket.owner === ownerId && normalizeStage(ticket.stage) === 'working')
      .length
  }

  /**
   * #72 执行槽提升： per owner, first repair crash-torn promotions (a working ticket whose injection rows
   * are still held — the promotion transition ran but the release did not), then admit the oldest queued
   * tickets while slots are free (FIFO by createdAt). Promotion transitions BEFORE the row release so a
   * crash between them is the repairable case above, never an over-admission. All reads/writes inside the
   * per-owner chain are synchronous — the admission decision is atomic.
   */
  async #promoteQueued() {
    const ownerIds = [...new Set(this.store.db.prepare('SELECT value FROM ticket').all()
      .map(raw => JSON.parse(String(raw.value)).owner))]
    for (const ownerId of ownerIds) {
      await this.#serialized(ownerId, () => {
        const mine = this.store.db.prepare('SELECT value FROM ticket').all()
          .map(raw => JSON.parse(String(raw.value)))
          .map(ticket => ({ ...ticket, stage: normalizeStage(ticket.stage) }))
          .filter(ticket => ticket.owner === ownerId)
        for (const ticket of mine.filter(t => t.stage === 'working')) this.runner.releaseHeld({ ticketId: ticket.id })
        let working = mine.filter(t => t.stage === 'working').length
        const queued = mine
          .filter(t => t.stage === 'queued')
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        for (const ticket of queued) {
          if (working >= this.#slotsPerOwner()) break
          try {
            this.tasks.promote(ticket.id)
          } catch { continue } // the ticket raced to another stage meanwhile — leave it to that path
          this.runner.releaseHeld({ ticketId: ticket.id })
          working++
        }
      })
    }
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
          throw translateTaskError(error, (code, message) => new RouterError(code, message))
        }
        this.#notifyTerminal(ticketId) // #70 验收通过即回收判定
        return { ownerId: owner.id, sessionId: owner.sessionId, ticketId, requestId: ticket.requestId, createdSession: false, rebuilt: false, deduped: false, accepted: true, stage: 'done' }
      }
      if (resolution === 'cancel') {
        try {
          this.tasks.cancel(ticketId)
        } catch (error) {
          throw translateTaskError(error, (code, message) => new RouterError(code, message))
        }
        this.#notifyTerminal(ticketId) // #70 取消即回收判定
        return { ownerId: owner.id, sessionId: owner.sessionId, ticketId, requestId: ticket.requestId, createdSession: false, rebuilt: false, deduped: false, cancelled: true, stage: 'done' }
      }
      // #69: the user approved the pending fork — execute it (code-driven, never model-discretion),
      // rebind the task to the forked Session and wake the owner to continue the task there.
      if (resolution === 'confirm') return this.#confirmPendingFork(owner, ticket, ticketId)
      // #69: the user rejected the proposal — no fork; the ticket keeps its original Session
      // （保持原会话） and waits 被卡住 for the human's next message to release it.
      if (resolution === 'reject') {
        try {
          this.tasks.rejectConfirm({ ticketId, reason: message, by: 'user' })
        } catch (error) {
          throw translateTaskError(error, (code, message) => new RouterError(code, message))
        }
        return { ownerId: owner.id, sessionId: owner.sessionId, ticketId, requestId: ticket.requestId, createdSession: false, rebuilt: false, deduped: false, rejected: true, stage: 'blocked' }
      }
      throw new RouterError('unknown-resolution', 'route_to_owner: resolution must be "accept", "cancel", "confirm" or "reject" when given')
    }
    let resumed = false
    if (ticket.stage === 'done') {
      throw new RouterError('illegal-transition', 'route_to_owner: ticket ' + ticketId + ' is done — create a new task instead of reviving it')
    }
    if (ticket.stage === 'queued') {
      // 人的专用槽 (#72): a human message on a QUEUED task admits it immediately — queued new work never
      // blocks the human from continuing an existing task (spec「并发与人的优先」). The held injections
      // release in per-ticket order (original first, this follow-up enqueued behind it).
      try {
        this.tasks.promote(ticketId, { by: 'route' })
      } catch (error) {
        throw translateTaskError(error, (code, message) => new RouterError(code, message))
      }
      this.runner.releaseHeld({ ticketId })
    }
    if (['person/review', 'person/answer', 'person/confirm', 'blocked', 'failed'].includes(ticket.stage)) {
      // 人的消息直接释放： waiting/stopped tasks resume to working (spec「状态模型」).
      try {
        this.tasks.resume(ticketId, { by: 'route' })
      } catch (error) {
        throw translateTaskError(error, (code, message) => new RouterError(code, message))
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
   * #70 回收触发段: notify the terminal-ticket listener (Recycler) without ever letting recycling block the
   * transition itself — a listener failure is swallowed here and retried by the Recycler's sweep.
   */
  #notifyTerminal(ticketId) {
    try { this.onTicketTerminal?.(ticketId) } catch { /* 回收失败不阻断任务完成 — sweep 兜底 */ }
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
      try {
        this.tasks.fail({ ticketId: ticket.id, reason: '授权记录缺失（票面权威），拒绝执行' })
        this.#notifyTerminal(ticket.id) // #70 回收判定
      } catch { /* stage may not allow it */ }
      throw permanent('ticket ' + ticket.id + ' has no authorization record')
    }
    const owner = this.registry.get(ticket.owner)
    if (!owner) throw permanent('ticket ' + ticket.id + ': owner ' + ticket.owner + ' is gone from the registry')
    const ensured = await this.#ensureSession(owner)
    // 重启恢复 (same discipline as follow-ups): a row stored BEFORE a crash carries no recovery note in its
    // body — prepend it at redelivery time, and clear the flag only after the prompt actually lands (a
    // failed attempt keeps the flag so the next retry still carries the note — 恰好一次 = delivered once).
    const needsNote = ticket.recoveryPending === true
    const body = needsNote ? RECOVERY_NOTE + '\n\n' + row.body : row.body
    const delivered = await this.#promptOwner(owner.id, ensured, ticket, row.requestId, body)
    if (needsNote) this.tasks.noteRecoveryCarried(ticket.id)
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
      return
    }
    // #64 不假装发了飞书: undeliverable targets (default 'dsh' without a channel, feishu:…) are RECORDED
    // persistent intents — a future channel scans state:'recorded' rows; only real delivery earns 'sent'.
    return { recorded: true }
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

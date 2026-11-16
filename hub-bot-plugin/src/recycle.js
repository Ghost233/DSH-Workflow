/**
 * Recycler — c 类临时 bot 的全自动回收 (issue #70, spec「L2 负责人的三类形态」c 类回收).
 *
 * 触发: a ticket under a scratch owner reaching a terminal stage (done = 验收通过, failed = 终止/让位于人)
 * prompts a recycle check (router 回收触发段 calls maybeRecycleForTicket immediately; sweep() on the plugin
 * tick is the backstop for terminal transitions that bypass the router, e.g. owner-tools report-failure and
 * channel-side termination).
 *
 * 回收安全: the owner recycles ONLY when no live ticket (anything not done/failed) remains under it — one
 * finished task never pulls the directory out from under a sibling task still running. dir/repo owners
 * never recycle (b 类常驻, a 类常驻).
 *
 * 回收动作（落审计）: the directory content listing is captured FIRST (capped, with a total count), then the
 * scratch directory is deleted, then the registry row flips to recycled (the row — and its sessionId — is
 * retained: 注册表保留 recycled 记录, 会话历史保留可查), and an audit line goes to the chief (统一出口)
 * through the recorded outbox. 产物由任务负责带出 (persona 纪律); 未带出的随目录删除.
 *
 * 失败纪律: a deletion failure never blocks the task's completion — warn, leave the row un-recycled, and
 * let the next sweep retry.
 */
import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { insertOutbox } from './outbox.js'

/** Cap on listing entries embedded in the audit line (the total count always travels). */
const LISTING_CAP = 50

/** Recursive relative-path listing, capped; always returns { entries, total }. */
function listDir(root, cap = LISTING_CAP) {
  const entries = []
  let total = 0
  const walk = (rel) => {
    let items
    try { items = readdirSync(join(root, rel), { withFileTypes: true }) } catch { return }
    for (const item of items) {
      const childRel = rel === '.' ? item.name : rel + '/' + item.name
      if (item.isDirectory()) walk(childRel)
      else {
        total++
        if (entries.length < cap) entries.push(childRel)
      }
    }
  }
  walk('.')
  return { entries, total }
}

export class Recycler {
  /**
   * @param {{ store: import('./store.js').Store, registry: import('./registry.js').OwnerRegistry,
   *   logger: { info: Function, warn: Function }, now?: () => string, rm?: (path: string) => void }} deps
   */
  constructor({ store, registry, logger, now, rm }) {
    this.store = store
    this.registry = registry
    this.logger = logger
    this.now = now ?? (() => new Date().toISOString())
    this.rm = rm ?? ((path) => rmSync(path, { recursive: true, force: true }))
  }

  #ticket(id) {
    const raw = this.store.db.prepare('SELECT value FROM ticket WHERE id = ?').get(id)
    return raw === undefined ? undefined : JSON.parse(String(raw.value))
  }


  /** The terminal-ticket entry point: stage gate, then the owner-level check. */
  maybeRecycleForTicket(ticketId) {
    const ticket = this.#ticket(ticketId)
    if (!ticket) return { skipped: 'unknown-ticket' }
    if (!['done', 'failed'].includes(ticket.stage)) return { skipped: 'not-terminal' }
    return this.maybeRecycleOwner(ticket.owner)
  }

  /**
   * The recycle decision for one owner. Returns { recycled } | { skipped: reason } | { failed } — never throws
   * (回收失败不阻断任务完成).
   */
  maybeRecycleOwner(ownerId) {
    const owner = this.registry.get(ownerId)
    if (!owner) return { skipped: 'unknown-owner' }
    if (owner.kind !== 'scratch') return { skipped: 'not-scratch' }
    if (owner.recycled) return { skipped: 'already-recycled' }
    // 任务完成即回收 — 必须先有任务完成: a freshly registered owner with zero tickets is NOT eligible
    // (live-实证事故: sweep 在注册与首个任务之间把刚出生 1s 的 owner 回收了)。
    const all = this.store.db.prepare('SELECT value FROM ticket').all()
      .map(raw => JSON.parse(String(raw.value)))
      .filter(t => t.owner === ownerId)
    if (all.length === 0) return { skipped: 'no-tickets-yet' }
    const live = all.filter(t => !['done', 'failed'].includes(t.stage))
    if (live.length > 0) return { skipped: 'live-tickets', count: live.length }
    const listing = listDir(owner.cwd)
    try {
      this.rm(owner.cwd)
    } catch (error) {
      this.logger.warn('hub-bot recycle: deleting %s failed: %s — 任务完成不受影响, 下轮 sweep 重试', owner.cwd, error?.message ?? error)
      return { failed: true, error: String(error?.message ?? error) }
    }
    this.registry.markRecycled(ownerId)
    const preview = listing.entries.slice(0, 8).join('、') + (listing.total > 8 ? ' 等' : '')
    // 双轴审查 P1-1（死信修复）: 寻址 dsh:session:chief + state queued — 走 OutboxRunner 真实投递到 chief
    // 会话（统一出口）；裸 'dsh' 无 state 的行两通行都扫不到，永不投递。
    insertOutbox(this.store, {
      ticketId: null, kind: 'reply', to: 'dsh:session:chief', state: 'queued',
      body: '[hub-bot 回收 ' + ownerId + '] 临时目录 ' + owner.cwd + ' 已删除（共 ' + listing.total + ' 项'
        + (listing.total > 0 ? '：' + preview : '') + '）；注册表保留 recycled 记录；会话 ' + (owner.sessionId ?? '(未建)')
        + ' 历史保留可查。未带出的产物已随目录删除。',
    })
    this.logger.info('hub-bot recycle: %s recycled (dir %s, %d files)', ownerId, owner.cwd, listing.total)
    return { recycled: true, ownerId, removed: owner.cwd, files: listing.total }
  }

  /** Backstop sweep: every un-recycled scratch owner whose tickets are all terminal gets recycled. */
  sweep() {
    const recycled = []
    for (const owner of this.registry.list().filter(o => o.kind === 'scratch' && !o.recycled)) {
      const result = this.maybeRecycleOwner(owner.id)
      if (result.recycled) recycled.push(owner.id)
    }
    return { recycled }
  }
}

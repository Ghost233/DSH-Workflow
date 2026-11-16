/**
 * The reporting chain (issue #67): 执行 report → 负责人归类总结（每次唤醒至多一条对外汇报）→ 总负责人 → 用户.
 *
 * 每次唤醒至多一条: every L2 report appends one fact line to the owner's SINGLE queued digest row — three
 * tasks finishing in one wake produce one outward message, never three. The row is stored BEFORE any
 * delivery attempt (先存后做); the OutboxRunner delivers it to the chief once the owner's session goes idle
 * (the wake has ended), so coalescing is a mechanism, not a prompt suggestion.
 *
 * 汇报以票面为准: digest and summary lines are built from ticket faces only (stageText 朗读 + report facts
 * stored by tools) — never from session narrative.
 */
import { randomUUID } from 'node:crypto'
import { STAGE_TEXT, stageDetail } from './tasks.js'
import { insertOutbox, updateOutboxRow } from './outbox.js'

/** Digest row prefix delivered to the chief (L1 统一出口). */
export const DIGEST_PREFIX = '[hub-bot 汇报 '
/** Scheduled auto-summary prefix (定时汇总, switch-gated, off by default). */
export const AUTO_SUMMARY_PREFIX = '[hub-bot 定时汇总]'
/** Stages an auto-summary speaks about: results available or action needed (spec 消息纪律). */
export const ACTIVE_STAGES = ['queued', 'working', 'person/answer', 'person/confirm', 'person/review', 'blocked']

/** One digest line for one ticket: id + stageText 朗读 + the stored report facts, four segments when present. */
export function factLine(ticket) {
  const head = '- ' + ticket.id + '｜' + (STAGE_TEXT[ticket.stage] ?? ticket.stage)
  const report = ticket.report
  if (report) {
    const sections = report.sections
    const tail = sections
      ? '结果：' + sections.result + '；变更：' + sections.changes + '；验证：' + sections.verification + '；风险：' + sections.risks
      : report.summary
    return head + '｜' + tail
  }
  // 需要行动的阶段同样带上票面事实 — the mapping lives ONCE in tasks.stageDetail (单一映射源).
  const reason = stageDetail(ticket)
  return reason ? head + '｜' + reason : head
}

/** The merged outward message for one owner's wake: header + every fact line. */
export function buildDigestText(row) {
  return DIGEST_PREFIX + row.ownerId + '] 本次唤醒共 ' + row.bodyLines.length + ' 项任务进展：\n' + row.bodyLines.join('\n')
}

function readRow(raw) {
  return JSON.parse(String(raw.value))
}

/**
 * Append one report fact to the owner's wake digest (先存后做): the queued digest row carries every fact of
 * this wake; a fresh row starts after the previous one was delivered (wake ended).
 */
export function recordReportFact(store, ownerId, ticket) {
  const line = factLine(ticket)
  const found = store.db.prepare('SELECT value FROM outbox').all()
    .map(readRow)
    .find(row => row.kind === 'digest' && row.state === 'queued' && row.ownerId === ownerId)
  if (found) {
    const next = { ...found, bodyLines: [...found.bodyLines, line] }
    updateOutboxRow(store, next) // P1-2 收敛：同一个写者
    return next
  }
  return insertOutbox(store, {
    ticketId: null, kind: 'digest', ownerId, to: 'dsh:session:chief',
    bodyLines: [line], state: 'queued', requestId: 'hub-bot-digest-' + randomUUID(),
  })
}

/**
 * The scheduled summary text over queryTasks rows (stageText + face detail — the state reading, never prose).
 * null when nothing is active: 只在结果可用或需要行动时说话.
 */
export function buildAutoSummary(rows) {
  const active = rows.filter(r => ACTIVE_STAGES.includes(r.stage))
  if (active.length === 0) return null
  const lines = active.map(r => '- ' + r.id + '｜' + r.stageText + (r.detail ? '｜' + r.detail : ''))
  return AUTO_SUMMARY_PREFIX + ' ' + active.length + ' 项任务待您关注：\n' + lines.join('\n')
}

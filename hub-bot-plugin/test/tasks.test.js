/**
 * TaskBoard tests (#66): the full 等待状态 lifecycle — eight waiting stages plus terminal done, exactly one
 * stage at a time, every transition rule-bound; state summary is a verbatim reading of the stage (STAGE_TEXT),
 * never LLM improvisation; restart recovery ends running assignments with "host restarted"; legacy 'review'
 * rows normalize to 'person/review' on read. RED first.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store.js'
import { TaskBoard, TaskError, STAGES, STAGE_TEXT, TRANSITIONS } from '../src/tasks.js'
import { isWithinCwd } from '../src/paths.js'

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-tasks-'))
  const store = new Store(dir)
  let clock = 0
  const board = new TaskBoard({ store, now: () => '2026-11-15T00:00:' + String(clock++).padStart(2, '0') + '.000Z' })
  const cleanup = () => { store.close(); rmSync(dir, { recursive: true, force: true }) }
  const seed = (stage = 'working', extra = {}) => {
    const ticket = {
      id: 'tsk-' + Math.random().toString(36).slice(2, 8), triggerId: 'trg-seed', owner: 'repo-W', stage, mechanism: 'inject',
      targetSession: 'session-owner', requestId: 'req-seed',
      authorization: { actor: 'user', source: 'dsh', at: '2026-11-14T00:00:00.000Z' },
      createdAt: '2026-11-14T00:00:00.000Z', updatedAt: '2026-11-14T00:00:00.000Z', ...extra,
    }
    store.db.prepare('INSERT INTO ticket (id, value) VALUES (?, ?)').run(ticket.id, JSON.stringify(ticket))
    return ticket
  }
  return { store, board, seed, cleanup }
}



test('report accepts the four segments 结果/变更/验证/风险 only as a complete set (#67)', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t = seed()
    assert.throws(() => board.report({ ticketId: t.id, summary: 's', sections: { result: 'r' } }),
      (e) => e.code === 'sections-incomplete')
    assert.throws(() => board.report({ ticketId: t.id, summary: 's', sections: { result: 'r', changes: 'c', verification: 'v', risks: '  ' } }),
      (e) => e.code === 'sections-incomplete')
    const done = board.report({ ticketId: t.id, summary: '落地完成', sections: { result: 'r', changes: 'c', verification: 'v', risks: 'k' } })
    assert.deepEqual(done.report.sections, { result: 'r', changes: 'c', verification: 'v', risks: 'k' })
    const plain = seed()
    const withoutSections = board.report({ ticketId: plain.id, summary: 'ok' })
    assert.equal(withoutSections.report.sections, undefined, 'summary-only reports stay valid')
  } finally { cleanup() }
})

test('stage vocabulary: eight waiting stages + done, each with a verbatim user-facing reading', () => {
  assert.deepEqual([...STAGES].sort(), ['blocked', 'done', 'failed', 'idle', 'person/answer', 'person/confirm', 'person/review', 'queued', 'working'])
  assert.equal(STAGE_TEXT['idle'], '待触发')
  assert.equal(STAGE_TEXT['queued'], '排队中')
  assert.equal(STAGE_TEXT['working'], '进行中')
  assert.equal(STAGE_TEXT['person/answer'], '等您回复')
  assert.equal(STAGE_TEXT['person/confirm'], '等您确认')
  assert.equal(STAGE_TEXT['person/review'], '等您验收')
  assert.equal(STAGE_TEXT['blocked'], '被卡住')
  assert.equal(STAGE_TEXT['failed'], '失败')
  assert.equal(STAGE_TEXT['done'], '完成')
  for (const stage of STAGES) assert.ok(STAGE_TEXT[stage], 'every stage has a reading')
})

test('transition matrix is total: every stage pair is either a listed edge or rejected', () => {
  for (const from of STAGES) {
    for (const to of STAGES) {
      assert.equal((TRANSITIONS[from] ?? []).includes(to), boardCan(from, to), from + ' → ' + to)
    }
  }
  function boardCan(from, to) { return (TRANSITIONS[from] ?? []).includes(to) }
  // Spot-check the mandated edges (#66): lifecycle paths the evidence must walk.
  for (const [from, to] of [['idle', 'working'], ['working', 'person/review'], ['person/review', 'done'],
    ['working', 'blocked'], ['blocked', 'working'], ['failed', 'working'], ['person/answer', 'working'],
    ['person/confirm', 'done'], ['working', 'failed'], ['queued', 'working'], ['person/review', 'working']]) {
    assert.ok(TRANSITIONS[from].includes(to), from + ' → ' + to + ' must be legal')
  }
  // And the mandated non-edges: done is terminal; acceptance only from person/review.
  assert.deepEqual(TRANSITIONS['done'], [])
  for (const from of STAGES.filter(s => s !== 'person/review' && s !== 'person/confirm')) {
    assert.ok(!TRANSITIONS[from].includes('done'), from + ' must not reach done directly')
  }
})

test('happy path with verbatim readings: idle→working→person/review→done', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t1 = seed('idle')
    assert.equal(board.markDelivered(t1.id).stage, 'working')
    assert.equal(board.report({ ticketId: t1.id, summary: '做完了' }).stage, 'person/review')
    assert.equal(board.summarize(t1.id).text, '等您验收')
    assert.equal(board.accept(t1.id).stage, 'done')
    assert.equal(board.summarize(t1.id).text, '完成')
    const stored = board.getTicket(t1.id)
    assert.deepEqual(stored.transitions.map(t => t.from + '>' + t.to), ['idle>working', 'working>person/review', 'person/review>done'])
    assert.ok(stored.transitions.every(t => t.by && t.at), 'every transition audited with actor and time')
  } finally { cleanup() }
})

test('follow-up resume works from person/*, blocked and failed — a human message releases the task', () => {
  const { board, seed, cleanup } = fixture()
  try {
    for (const stage of ['person/review', 'person/answer', 'person/confirm', 'blocked', 'failed']) {
      const t = seed(stage)
      assert.equal(board.resume(t.id, { by: 'route' }).stage, 'working', stage + ' resumes to working')
    }
    const tDone = seed('done')
    assert.throws(() => board.resume(tDone.id, { by: 'route' }), (e) => e.code === 'illegal-transition')
    const tIdle = seed('idle')
    assert.throws(() => board.resume(tIdle.id, { by: 'route' }), (e) => e.code === 'illegal-transition')
  } finally { cleanup() }
})

test('ask/askConfirm/escalate/fail reach person/answer, person/confirm, blocked, failed', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t1 = seed('working')
    assert.equal(board.ask({ ticketId: t1.id, question: '要用哪个目录？' }).stage, 'person/answer')
    assert.equal(board.getTicket(t1.id).question.text, '要用哪个目录？')
    assert.equal(board.summarize(t1.id).text, '等您回复')
    const t2 = seed('working')
    assert.equal(board.askConfirm({ ticketId: t2.id, question: 'fork 执行会话？' }).stage, 'person/confirm')
    assert.equal(board.cancel(t2.id).stage, 'done')
    const t3 = seed('working')
    assert.equal(board.escalate({ ticketId: t3.id, reason: '目标超出责任目录' }).stage, 'blocked')
    assert.equal(board.getTicket(t3.id).escalated.reason, '目标超出责任目录')
    assert.equal(board.summarize(t3.id).text, '被卡住')
    const t4 = seed('working')
    assert.equal(board.fail({ ticketId: t4.id, reason: '目标会话已删除' }).stage, 'failed')
    assert.equal(board.summarize(t4.id).text, '失败')
    // done tickets refuse every further move
    const t5 = seed('done')
    for (const fn of [() => board.escalate({ ticketId: t5.id, reason: 'x' }), () => board.fail({ ticketId: t5.id, reason: 'x' }),
      () => board.ask({ ticketId: t5.id, question: 'x' }), () => board.askConfirm({ ticketId: t5.id, question: 'x' })]) {
      assert.throws(fn, (e) => e.code === 'illegal-transition')
    }
  } finally { cleanup() }
})

test('report requires a summary; ask requires a question; escalate/fail require a reason', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t = seed('working')
    assert.throws(() => board.report({ ticketId: t.id }), (e) => e.code === 'summary-required')
    assert.throws(() => board.ask({ ticketId: t.id }), (e) => e.code === 'question-required')
    assert.throws(() => board.askConfirm({ ticketId: t.id }), (e) => e.code === 'question-required')
    assert.throws(() => board.escalate({ ticketId: t.id }), (e) => e.code === 'reason-required')
    assert.throws(() => board.fail({ ticketId: t.id }), (e) => e.code === 'reason-required')
  } finally { cleanup() }
})

test('markDelivered only fires idle→working; a second delivery is a no-op, not an error', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t = seed('idle')
    board.markDelivered(t.id)
    assert.equal(board.markDelivered(t.id).stage, 'working', 'idempotent on an already-working ticket')
    const t2 = seed('blocked')
    assert.equal(board.markDelivered(t2.id).stage, 'blocked', 'does not disturb other stages')
  } finally { cleanup() }
})

test('restart recovery: running assignments end "host restarted"; waiting/blocked/failed tickets untouched', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const tWork = seed('working', { assignments: [{ state: 'running', startedAt: '2026-11-14T01:00:00.000Z', sessionId: 'session-w' }] })
    const tIdle = seed('idle', { assignments: [{ state: 'running', startedAt: '2026-11-14T01:00:00.000Z', sessionId: 'session-i' }] })
    const tReview = seed('person/review', { assignments: [{ state: 'running', startedAt: '2026-11-14T01:00:00.000Z', sessionId: 'session-r' }] })
    const tBlocked = seed('blocked')
    board.markRestart()
    const work = board.getTicket(tWork.id)
    assert.equal(work.assignments[0].state, 'ended')
    assert.equal(work.assignments[0].endReason, 'host restarted')
    assert.equal(work.recoveryPending, true, 'the next injection carries a recovery note')
    assert.equal(work.stage, 'working', 'stage is continuous across the crash')
    assert.equal(board.getTicket(tIdle.id).recoveryPending, true, 'idle tickets awaiting injection also get the note')
    assert.equal(board.getTicket(tReview.id).recoveryPending, undefined, 'person/* keeps as-is (spec: 等待中/等人保持原样)')
    assert.equal(board.getTicket(tReview.id).assignments[0].state, 'running', 'its assignment is not ended')
    assert.equal(board.getTicket(tBlocked.id).recoveryPending, undefined)
  } finally { cleanup() }
})

test('a delivered follow-up clears recoveryPending so the note is carried exactly once', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t = seed('working', { recoveryPending: true })
    const cleared = board.noteRecoveryCarried(t.id)
    assert.equal(cleared.recoveryPending, undefined)
    assert.equal(board.getTicket(t.id).recoveryPending, undefined)
  } finally { cleanup() }
})

test("legacy 'review' rows normalize to person/review on read (no migration)", () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t = seed('review')
    assert.equal(board.getTicket(t.id).stage, 'person/review')
    assert.equal(board.accept(t.id).stage, 'done', 'guards see the normalized stage')
  } finally { cleanup() }
})

test('summarize is a reading plus fixed factual context, never free text', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t = seed('person/review', { report: { summary: 'hello.sh 已写入', at: 'x' } })
    const s = board.summarize(t.id)
    assert.equal(s.text, '等您验收')
    assert.equal(s.detail, 'hello.sh 已写入', 'review readings carry the stored report summary verbatim')
    const t2 = seed('blocked', { escalated: { reason: '越界', at: 'x' } })
    assert.equal(board.summarize(t2.id).detail, '越界')
  } finally { cleanup() }
})

test('cwd containment rule unchanged (path-segment aware)', () => {
  assert.ok(isWithinCwd('/a/b', '/a/b'))
  assert.ok(isWithinCwd('/a/b', '/a/b/c'))
  assert.ok(!isWithinCwd('/a/b', '/a/bc'))
  assert.ok(!isWithinCwd('/a/b', '/a'))
})

test('askConfirm carries a structured action payload on the ticket face (#69 confirm 转换)', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t = seed('working')
    const action = { type: 'fork', sessionId: 'session-a', cwd: '/w', reason: 'r' }
    const asked = board.askConfirm({ ticketId: t.id, question: '确认 fork？', action })
    assert.equal(asked.stage, 'person/confirm')
    assert.deepEqual(board.getTicket(t.id).pendingConfirm.action, action)
    assert.equal(board.summarize(t.id).detail, '确认 fork？', '朗读仍读确认文本')
    // action must be an object with a non-empty string type
    const t2 = seed('working')
    assert.throws(() => board.askConfirm({ ticketId: t2.id, question: 'q', action: 'fork' }), (e) => e.code === 'action-invalid')
    assert.throws(() => board.askConfirm({ ticketId: t2.id, question: 'q', action: {} }), (e) => e.code === 'action-invalid')
    // 不带 action 的旧用法不变
    const plain = board.askConfirm({ ticketId: t2.id, question: '只是确认' })
    assert.equal(plain.pendingConfirm.action, undefined)
  } finally { cleanup() }
})

test('confirm: person/confirm → working with an audited outcome; guards reject wrong stage and missing pending (#69)', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t = seed('working')
    board.askConfirm({ ticketId: t.id, question: '确认？', action: { type: 'fork', sessionId: 's', cwd: '/w', reason: 'r' } })
    const confirmed = board.confirm({ ticketId: t.id, result: { ok: true } })
    assert.equal(confirmed.stage, 'working')
    assert.equal(confirmed.confirmOutcome.kind, 'confirmed')
    assert.equal(confirmed.confirmOutcome.by, 'user')
    assert.deepEqual(confirmed.confirmOutcome.result, { ok: true })
    assert.equal(confirmed.pendingConfirm.text, '确认？', 'pendingConfirm 留票面供审计')
    // wrong stage
    const t2 = seed('working')
    assert.throws(() => board.confirm({ ticketId: t2.id }), (e) => e.code === 'illegal-transition')
    // person/confirm without a pending request
    const t3 = seed('person/confirm')
    assert.throws(() => board.confirm({ ticketId: t3.id }), (e) => e.code === 'no-pending-confirm')
    // done refuses
    const t4 = seed('done')
    assert.throws(() => board.confirm({ ticketId: t4.id }), (e) => e.code === 'illegal-transition')
  } finally { cleanup() }
})

test('rejectConfirm: person/confirm → blocked with the rejection reason, original binding untouched (#69)', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t = seed('working', { workerSession: { sessionId: 'session-orig', cwd: '/w', at: 'x' } })
    board.askConfirm({ ticketId: t.id, question: '确认 fork？', action: { type: 'fork', sessionId: 's', cwd: '/w', reason: 'r' } })
    const rejected = board.rejectConfirm({ ticketId: t.id, reason: '不用 fork' })
    assert.equal(rejected.stage, 'blocked')
    assert.equal(rejected.confirmOutcome.kind, 'rejected')
    assert.equal(rejected.confirmOutcome.reason, '不用 fork')
    assert.equal(rejected.workerSession.sessionId, 'session-orig', '保持原会话')
    const t2 = seed('working')
    assert.throws(() => board.rejectConfirm({ ticketId: t2.id, reason: 'x' }), (e) => e.code === 'illegal-transition')
    const t3 = seed('working')
    board.askConfirm({ ticketId: t3.id, question: 'q' })
    assert.throws(() => board.rejectConfirm({ ticketId: t3.id }), (e) => e.code === 'reason-required')
  } finally { cleanup() }
})

test('cancel accepts an actor/reason/kind for the 24h auto-cancel audit (#69)', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t = seed('working')
    board.askConfirm({ ticketId: t.id, question: '确认 fork？' })
    const cancelled = board.cancel(t.id, { by: 'system', reason: '确认超过 24 小时未回应，自动取消', kind: 'timeout' })
    assert.equal(cancelled.stage, 'done')
    assert.equal(cancelled.confirmOutcome.kind, 'timeout')
    assert.equal(cancelled.confirmOutcome.by, 'system')
    assert.match(cancelled.confirmOutcome.reason, /24 小时/)
    // back-compat: cancel(ticketId) still works and records a user cancel
    const t2 = seed('working')
    board.askConfirm({ ticketId: t2.id, question: 'q' })
    const plain = board.cancel(t2.id)
    assert.equal(plain.confirmOutcome.kind, 'cancelled')
    assert.equal(plain.confirmOutcome.by, 'user')
  } finally { cleanup() }
})

test('bindWorkerSession can mark the mechanism (fork) while accruing the assignment (#69)', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t = seed('working')
    const bound = board.bindWorkerSession(t.id, { sessionId: 'session-new', cwd: '/w', mechanism: 'fork' })
    assert.equal(bound.mechanism, 'fork')
    assert.equal(bound.workerSession.sessionId, 'session-new')
    assert.equal(bound.assignments.at(-1).sessionId, 'session-new')
    // mechanism omitted → unchanged
    const t2 = seed('working', { mechanism: 'inject' })
    const again = board.bindWorkerSession(t2.id, { sessionId: 'session-x', cwd: '/w' })
    assert.equal(again.mechanism, 'inject')
  } finally { cleanup() }
})


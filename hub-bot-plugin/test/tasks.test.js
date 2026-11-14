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
import { TaskBoard, TaskError, isWithinCwd, STAGES, STAGE_TEXT, TRANSITIONS } from '../src/tasks.js'

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

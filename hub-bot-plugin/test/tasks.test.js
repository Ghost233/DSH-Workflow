/**
 * TaskBoard tests (#65): the minimal three-stage ticket lifecycle 进行中(working) / 等验收(review) / 完成(done),
 * the transition guard, follow-up resume, report classification, escalation flag, and the cwd containment rule
 * behind 越界拒执. RED first.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store.js'
import { TaskBoard, TaskError, isWithinCwd, STAGES } from '../src/tasks.js'

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-tasks-'))
  const store = new Store(dir)
  const board = new TaskBoard({ store, now: () => '2026-11-15T00:00:00.000Z' })
  const cleanup = () => { store.close(); rmSync(dir, { recursive: true, force: true }) }
  // Seed a ticket the way Router.routeToOwner writes it.
  const seed = (stage = 'working') => {
    const ticket = {
      id: 'tsk-seed', triggerId: 'trg-seed', owner: 'repo-W', stage, mechanism: 'inject',
      targetSession: 'session-owner', requestId: 'req-seed',
      authorization: { actor: 'user', source: 'dsh', at: '2026-11-14T00:00:00.000Z' },
      createdAt: '2026-11-14T00:00:00.000Z', updatedAt: '2026-11-14T00:00:00.000Z',
    }
    store.db.prepare('INSERT INTO ticket (id, value) VALUES (?, ?)').run(ticket.id, JSON.stringify(ticket))
    return ticket
  }
  return { store, board, seed, cleanup }
}

test('stage vocabulary is exactly 进行中/等验收/完成', () => {
  assert.deepEqual([...STAGES].sort(), ['done', 'review', 'working'])
})

test('legal transitions: working→review (report), review→working (追问恢复), review→done (验收)', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t1 = seed('working')
    assert.equal(board.report({ ticketId: t1.id, summary: '做完了' }).stage, 'review')
    assert.equal(board.resume(t1.id).stage, 'working')
    assert.equal(board.report({ ticketId: t1.id, summary: '改完了' }).stage, 'review')
    assert.equal(board.accept(t1.id).stage, 'done')
    const stored = board.getTicket(t1.id)
    assert.equal(stored.stage, 'done')
    assert.equal(stored.transitions.length, 4)
    assert.deepEqual(stored.transitions.map(t => t.from + '>' + t.to), ['working>review', 'review>working', 'working>review', 'review>done'])
  } finally { cleanup() }
})

test('illegal transitions are rejected: working→done, done→*, double-report, resume of done', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t1 = seed('working')
    assert.throws(() => board.accept(t1.id), (e) => e instanceof TaskError && e.code === 'illegal-transition')
    board.report({ ticketId: t1.id, summary: 'ok' })
    assert.throws(() => board.report({ ticketId: t1.id, summary: 'again' }), (e) => e.code === 'illegal-transition')
    board.accept(t1.id)
    assert.throws(() => board.resume(t1.id), (e) => e.code === 'illegal-transition')
    assert.throws(() => board.report({ ticketId: t1.id, summary: 'late' }), (e) => e.code === 'illegal-transition')
    assert.throws(() => board.accept(t1.id), (e) => e.code === 'illegal-transition')
    // Unknown ticket
    assert.throws(() => board.resume('tsk-nope'), (e) => e.code === 'unknown-ticket')
  } finally { cleanup() }
})

test('report stores the result classification on the ticket for query_tasks visibility', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t1 = seed('working')
    board.report({ ticketId: t1.id, summary: 'hello 脚本已写入 .scratch/hello.js', evidence: 'transcript tail…' })
    const stored = board.getTicket(t1.id)
    assert.equal(stored.report.summary, 'hello 脚本已写入 .scratch/hello.js')
    assert.equal(stored.report.evidence, 'transcript tail…')
    assert.equal(stored.report.at, '2026-11-15T00:00:00.000Z')
    // The immutable authorization record from creation is untouched.
    assert.deepEqual(stored.authorization, { actor: 'user', source: 'dsh', at: '2026-11-14T00:00:00.000Z' })
  } finally { cleanup() }
})

test('report requires a non-empty summary', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t1 = seed('working')
    assert.throws(() => board.report({ ticketId: t1.id, summary: '  ' }), (e) => e.code === 'summary-required')
  } finally { cleanup() }
})

test('escalate flags the ticket without leaving its stage, and records the reason', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t1 = seed('working')
    const out = board.escalate({ ticketId: t1.id, reason: '请求超出本仓库范围' })
    assert.equal(out.escalated, true)
    const stored = board.getTicket(t1.id)
    assert.equal(stored.stage, 'working')
    assert.equal(stored.escalated.reason, '请求超出本仓库范围')
    assert.equal(stored.escalated.at, '2026-11-15T00:00:00.000Z')
  } finally { cleanup() }
})

test('escalate requires a reason; a done ticket cannot be escalated', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t1 = seed('working')
    assert.throws(() => board.escalate({ ticketId: t1.id, reason: '' }), (e) => e.code === 'reason-required')
    board.report({ ticketId: t1.id, summary: 'ok' })
    board.accept(t1.id)
    assert.throws(() => board.escalate({ ticketId: t1.id, reason: 'late' }), (e) => e.code === 'illegal-transition')
  } finally { cleanup() }
})

test('bindWorkerSession records the execution session on the ticket', () => {
  const { board, seed, cleanup } = fixture()
  try {
    const t1 = seed('working')
    board.bindWorkerSession(t1.id, { sessionId: 'session-worker', cwd: '/w' })
    const stored = board.getTicket(t1.id)
    assert.equal(stored.workerSession.sessionId, 'session-worker')
    assert.equal(stored.workerSession.cwd, '/w')
  } finally { cleanup() }
})

test('isWithinCwd: equal and descendant pass, sibling prefix does not', () => {
  assert.equal(isWithinCwd('/a/b', '/a/b'), true)
  assert.equal(isWithinCwd('/a/b', '/a/b/c/d'), true)
  assert.equal(isWithinCwd('/a/b', '/a/bc'), false)
  assert.equal(isWithinCwd('/a/b', '/a'), false)
  assert.equal(isWithinCwd('/a/b/', '/a/b/c'), true)
  assert.equal(isWithinCwd('/Volumes/X/DSH-Workflow', '/Volumes/X/GhostNexus'), false)
})

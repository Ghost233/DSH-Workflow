/**
 * OutboxRunner tests (#66「可靠性 Stored work」): every outward action is STORED before it is attempted;
 * delivery is strictly ordered per ticket (the head blocks the tail until sent or failed 3 times, then it is
 * bypassed and a system problem is reported); failures retry after 2s with exponential backoff (reply cap
 * 1 min, inject cap 5 min); retries reuse the row's stable requestId; rows survive a runner restart. RED first.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store.js'
import { OutboxRunner } from '../src/outbox.js'

function fixture(opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-outbox-'))
  const store = new Store(dir)
  let clock = 1_000_000
  const calls = []
  const plan = opts.plan ?? (() => true) // (row, attempt) => true=ok, false=throw
  const deliver = async (row) => {
    calls.push({ id: row.id, requestId: row.requestId, kind: row.kind, stored: store.db.prepare('SELECT value FROM outbox WHERE id = ?').get(row.id) !== undefined })
    if (!plan(row, calls.filter(c => c.id === row.id).length)) throw new Error('delivery failed (fake)')
  }
  const runner = new OutboxRunner({ store, deliver, now: () => clock })
  const cleanup = () => { store.close(); rmSync(dir, { recursive: true, force: true }) }
  return { store, runner, calls, cleanup, setClock: (ms) => { clock = ms }, getClock: () => clock }
}

test('store-before-act: the row is queued in the store before the deliverer runs', async () => {
  const { runner, calls, cleanup } = fixture()
  try {
    const row = runner.enqueue({ ticketId: 'tsk-1', kind: 'inject', to: 'session-x', body: 'hello', requestId: 'req-1' })
    assert.equal(row.state, 'queued')
    await runner.tick()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].stored, true, 'deliverer observed the stored row')
  } finally { cleanup() }
})



test('a deliverer may postpone a row without burning an attempt (wake coalescing waits for idle)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-outbox-'))
  const store = new Store(dir)
  let clock = 1_000_000
  let mode = 'postpone'
  const calls = []
  const deliver = async (row) => { calls.push(row.id); if (mode === 'postpone') return { postponeMs: 2000 } }
  const runner = new OutboxRunner({ store, deliver, now: () => clock })
  try {
    const row = runner.enqueue({ ticketId: null, kind: 'digest', to: 'dsh:session:chief', body: 'x', requestId: 'r' })
    await runner.tick()
    assert.equal(calls.length, 1)
    let stored = JSON.parse(String(store.db.prepare('SELECT value FROM outbox WHERE id = ?').get(row.id).value))
    assert.equal(stored.state, 'queued')
    assert.equal(stored.attempts, 0, 'postponement is not a failure')
    assert.equal(stored.nextRetryAt, clock + 2000)
    await runner.tick()
    assert.equal(calls.length, 1, 'not due yet')
    clock += 2000
    mode = 'ok'
    await runner.tick()
    assert.equal(calls.length, 2)
    stored = JSON.parse(String(store.db.prepare('SELECT value FROM outbox WHERE id = ?').get(row.id).value))
    assert.equal(stored.state, 'sent')
    assert.equal(stored.attempts, 0)
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('success marks the row sent; retries reuse the stable requestId', async () => {
  const { store, runner, calls, setClock, getClock, cleanup } = fixture({ plan: (row, attempt) => attempt >= 2 })
  try {
    const row = runner.enqueue({ ticketId: 'tsk-1', kind: 'inject', to: 'session-x', body: 'hi', requestId: 'req-stable' })
    await runner.tick()
    assert.equal(calls.length, 1, 'first attempt failed')
    let stored = JSON.parse(String(store.db.prepare('SELECT value FROM outbox WHERE id = ?').get(row.id).value))
    assert.equal(stored.attempts, 1)
    assert.equal(stored.state, 'queued')
    assert.equal(stored.nextRetryAt, getClock() + 2000, '2s first backoff')
    setClock(getClock() + 1999)
    await runner.tick()
    assert.equal(calls.length, 1, 'not due yet')
    setClock(getClock() + 1)
    await runner.tick()
    assert.equal(calls.length, 2)
    assert.equal(calls[1].requestId, 'req-stable', 'retry reuses the stored requestId (幂等键稳定)')
    stored = JSON.parse(String(store.db.prepare('SELECT value FROM outbox WHERE id = ?').get(row.id).value))
    assert.equal(stored.state, 'sent')
    assert.ok(stored.sentAt)
  } finally { cleanup() }
})

test('backoff doubles and caps: inject 5 min, reply 1 min', async () => {
  const { store, runner, setClock, getClock, cleanup } = fixture({ plan: () => false })
  try {
    const injectRow = runner.enqueue({ ticketId: 'tsk-i', kind: 'inject', to: 's', body: 'x', requestId: 'r-i' })
    const replyRow = runner.enqueue({ ticketId: 'tsk-r', kind: 'reply', to: 'dsh', body: 'x', requestId: 'r-r' })
    await runner.tick() // attempt 1 both
    const read = (id) => JSON.parse(String(store.db.prepare('SELECT value FROM outbox WHERE id = ?').get(id).value))
    assert.equal(read(injectRow.id).nextRetryAt - getClock(), 2000)
    assert.equal(read(replyRow.id).nextRetryAt - getClock(), 2000)
    setClock(getClock() + 2000); await runner.tick() // attempt 2
    assert.equal(read(injectRow.id).nextRetryAt - getClock(), 4000)
    assert.equal(read(replyRow.id).nextRetryAt - getClock(), 4000)
    setClock(getClock() + 4000); await runner.tick() // attempt 3 → both fail permanently
    assert.equal(read(injectRow.id).state, 'failed')
    assert.equal(read(replyRow.id).state, 'failed')
    // Caps: a fresh pair failing deep into the schedule caps at 5min / 1min
    const capInject = runner.enqueue({ ticketId: 'tsk-ci', kind: 'inject', to: 's', body: 'x', requestId: 'r-ci' })
    const capReply = runner.enqueue({ ticketId: 'tsk-cr', kind: 'reply', to: 'dsh', body: 'x', requestId: 'r-cr' })
    for (let i = 0; i < 9; i++) { await runner.tick(); setClock(getClock() + 600000) }
    assert.ok(read(capInject.id).nextRetryAt - (getClock() - 600000) <= 300000, 'inject capped at 5 min')
    assert.ok(read(capReply.id).nextRetryAt - (getClock() - 600000) <= 60000, 'reply capped at 1 min')
  } finally { cleanup() }
})

test('three consecutive failures mark the row failed and report a system problem; the queue then bypasses it', async () => {
  let systemProblems = []
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-outbox-'))
  const store = new Store(dir)
  try {
    let clock = 1_000_000
    const runner = new OutboxRunner({
      store, now: () => clock,
      deliver: async (row) => { if (row.requestId === 'req-doomed') throw new Error('down') },
      onSystemProblem: (p) => systemProblems.push(p),
    })
    runner.enqueue({ ticketId: 'tsk-1', kind: 'inject', to: 's', body: 'first', requestId: 'req-doomed' })
    runner.enqueue({ ticketId: 'tsk-1', kind: 'inject', to: 's', body: 'second', requestId: 'req-ok' })
    await runner.tick(); clock += 2000
    await runner.tick(); clock += 4000
    assert.equal(systemProblems.length, 0, 'two failures do not escalate yet (一次性错误不惊动人)')
    await runner.tick() // third failure
    assert.equal(systemProblems.length, 1)
    assert.equal(systemProblems[0].ticketId, 'tsk-1')
    const rows = store.db.prepare('SELECT value FROM outbox').all().map(r => JSON.parse(String(r.value)))
    assert.equal(rows.find(r => r.requestId === 'req-doomed').state, 'failed')
    assert.equal(rows.find(r => r.requestId === 'req-ok').state, 'sent', 'the tail row was bypassed to after the 3rd failure')
    assert.ok(rows.some(r => r.kind === 'system-problem'), 'system problem recorded in the outbox')
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('strict per-ticket ordering: a pending head blocks the tail; other tickets run independently', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-outbox-'))
  const store = new Store(dir)
  try {
    let clock = 1_000_000
    const order = []
    const runner = new OutboxRunner({
      store, now: () => clock,
      deliver: async (row) => { order.push(row.requestId); if (row.requestId === 'a1' && order.filter(x => x === 'a1').length === 1) throw new Error('once') },
    })
    runner.enqueue({ ticketId: 'A', kind: 'inject', to: 's', body: '1', requestId: 'a1' })
    runner.enqueue({ ticketId: 'A', kind: 'inject', to: 's', body: '2', requestId: 'a2' })
    runner.enqueue({ ticketId: 'B', kind: 'inject', to: 's', body: '1', requestId: 'b1' })
    await runner.tick()
    assert.deepEqual(order, ['a1', 'b1'], 'a2 waited behind the failed a1; ticket B unaffected')
    clock += 2000
    await runner.tick()
    assert.deepEqual(order, ['a1', 'b1', 'a1', 'a2'], 'a1 retried first, then a2 (确认永远先于结果)')
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('crash recovery: a fresh runner over the same store resumes queued rows', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-outbox-'))
  const store = new Store(dir)
  try {
    let clock = 1_000_000
    const down = async () => { throw new Error('crash before delivery') }
    const first = new OutboxRunner({ store, deliver: down, now: () => clock })
    const row = first.enqueue({ ticketId: 'tsk-1', kind: 'inject', to: 's', body: 'survive me', requestId: 'req-crash' })
    // process "crashes" before any tick
    const delivered = []
    const second = new OutboxRunner({ store, deliver: async (r) => { delivered.push(r.requestId) }, now: () => clock })
    await second.tick()
    assert.deepEqual(delivered, ['req-crash'], 'the stored row was delivered after the restart')
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('legacy recorded rows (pre-#66) are left untouched by the runner', async () => {
  const { store, runner, calls, cleanup } = fixture()
  try {
    store.db.prepare('INSERT INTO outbox (id, value, at) VALUES (?, ?, ?)').run('out-legacy', JSON.stringify({ id: 'out-legacy', to: 'dsh', body: 'old', state: 'recorded', attempts: 0, at: 'x' }), 'x')
    await runner.tick()
    assert.equal(calls.length, 0)
    assert.equal(JSON.parse(String(store.db.prepare('SELECT value FROM outbox WHERE id = ?').get('out-legacy').value)).state, 'recorded')
  } finally { cleanup() }
})

test('a permanent failure fails out immediately (no retries) and reports a system problem', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-outbox-'))
  const store = new Store(dir)
  try {
    const problems = []
    let calls = 0
    const runner = new OutboxRunner({
      store, now: () => 1_000_000, onSystemProblem: (p) => problems.push(p),
      deliver: async () => { calls++; const e = new Error('authorization missing'); e.permanent = true; throw e },
    })
    const row = runner.enqueue({ ticketId: 'tsk-p', kind: 'inject', to: 's', body: 'x', requestId: 'req-p' })
    await runner.tick()
    assert.equal(calls, 1, 'exactly one attempt — no retries for permanent failures')
    const stored = JSON.parse(String(store.db.prepare('SELECT value FROM outbox WHERE id = ?').get(row.id).value))
    assert.equal(stored.state, 'failed')
    assert.equal(problems.length, 1)
    assert.equal(problems[0].ticketId, 'tsk-p')
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('a deliverer may RECORD an undelivered intent (不假装发了飞书): terminal recorded, never retried, no problem', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-outbox-'))
  const store = new Store(dir)
  try {
    const runner = new OutboxRunner({ store, deliver: async () => ({ recorded: true }) })
    const row = runner.enqueue({ ticketId: null, kind: 'reply', to: 'feishu:om_9', body: 'x', requestId: 'r' })
    await runner.tick()
    const stored = JSON.parse(String(store.db.prepare('SELECT value FROM outbox WHERE id = ?').get(row.id).value))
    assert.equal(stored.state, 'recorded', 'honest: not sent')
    assert.equal(stored.attempts, 0)
    assert.ok(stored.recordedAt)
    await runner.tick()
    const again = JSON.parse(String(store.db.prepare('SELECT value FROM outbox WHERE id = ?').get(row.id).value))
    assert.equal(again.state, 'recorded', 'recorded rows are not delivery work — a future channel scans them')
    const problems = store.db.prepare('SELECT value FROM outbox').all().map(r => JSON.parse(String(r.value))).filter(r => r.kind === 'system-problem')
    assert.equal(problems.length, 0, 'an honest record is not a failure')
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
})

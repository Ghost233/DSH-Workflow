/**
 * 可靠性与并发（issue #72）: 执行槽（同 owner 并发上限，默认 3 可配置，只对 working 计数——交还给人立即
 * 释放）+ queued 排队 FIFO（槽满新票排队，held 注入行不投递；槽空出按 createdAt 提升并投递）+ 人的专用槽
 * （既有票的跟进消息永不排队：queued 票被人跟进立即提升，绕过槽上限）+ 多入口同 owner 串行化（promise 链锁）。
 * RED first（#72 TDD）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store.js'
import { OwnerRegistry } from '../src/registry.js'
import { Router } from '../src/router.js'
import { resolveConfig } from '../src/config.js'

/** A Router over a tmp store with a fake Sessions port; slots configurable. */
function fixture({ slotsPerOwner } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-slots-'))
  const store = new Store(dir)
  const registry = new OwnerRegistry(store, { scratchRoot: join(dir, 'scratch') })
  registry.ensureChief({ cwd: '/Volumes/home', workspace: 'Ghost233HomeRepo' })
  registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
  registry.create({ kind: 'repo', workspace: 'X', cwd: '/x' })
  let nowMs = Date.parse('2026-11-15T00:00:00.000Z')
  const calls = { prompt: [], create: [] }
  const sessions = {
    create: async request => { calls.create.push(request); return { sessionId: 'session-fake-' + calls.create.length } },
    prompt: async request => { calls.prompt.push(request); return { accepted: true } },
  }
  const config = { concurrency: { slotsPerOwner: slotsPerOwner ?? 3 } }
  const router = new Router({ store, registry, sessions, config, now: () => new Date(nowMs).toISOString() })
  const advance = ms => { nowMs += ms }
  return { router, registry, store, calls, advance, dir, cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }) } }
}

const outboxRows = store => store.db.prepare('SELECT value FROM outbox ORDER BY at').all().map(r => JSON.parse(String(r.value)))

/** Routes `count` tasks to owner W in sequence. */
async function routeMany(router, count, prefix = '任务') {
  const receipts = []
  for (let i = 0; i < count; i++) receipts.push(await router.routeToOwner({ ownerId: 'repo-W', message: prefix + ' ' + i }))
  return receipts
}

test('config: concurrency section defaults to 3 slots per owner and validates', () => {
  const def = resolveConfig({ stateDir: '/tmp/a', homeRepo: '/tmp/b' })
  assert.equal(def.concurrency.slotsPerOwner, 3, 'spec 默认 3')
  const one = resolveConfig({ stateDir: '/tmp/a', homeRepo: '/tmp/b', concurrency: { slotsPerOwner: 1 } })
  assert.equal(one.concurrency.slotsPerOwner, 1)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/a', homeRepo: '/tmp/b', concurrency: { slotsPerOwner: 0 } }), /slotsPerOwner/)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/a', homeRepo: '/tmp/b', concurrency: { slotsPerOwner: -2 } }), /slotsPerOwner/)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/a', homeRepo: '/tmp/b', concurrency: { slotsPerOwner: 1.5 } }), /slotsPerOwner/)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/a', homeRepo: '/tmp/b', concurrency: { slotsPerOwner: '3' } }), /slotsPerOwner/)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/a', homeRepo: '/tmp/b', concurrency: 'x' }), /concurrency/)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/a', homeRepo: '/tmp/b', concurrency: { slots: 3 } }), /does not know/)
})

test('slot admission: the 4th task on a full owner queues (stage 排队中) and is NOT delivered', async () => {
  const { router, calls, store, cleanup } = fixture()
  try {
    const receipts = await routeMany(router, 4)
    assert.deepEqual(receipts.map(r => r.stage), ['working', 'working', 'working', 'queued'])
    assert.equal(calls.prompt.length, 3, 'queued 票的注入行 held，不投递')
    const t4 = router.getTicket(receipts[3].ticketId)
    assert.equal(t4.stage, 'queued')
    assert.equal(t4.stageText ?? '排队中', '排队中')
    const held = outboxRows(store).filter(r => r.state === 'held')
    assert.equal(held.length, 1)
    assert.equal(held[0].ticketId, receipts[3].ticketId)
    assert.match(held[0].body, /任务 3/, 'held 行带完整注入文本（先存后做）')
  } finally { cleanup() }
})

test('FIFO promotion: freeing one slot promotes the OLDEST queued ticket and delivers it', async () => {
  const { router, calls, cleanup } = fixture()
  try {
    const receipts = await routeMany(router, 5)
    assert.deepEqual(receipts.map(r => r.stage), ['working', 'working', 'working', 'queued', 'queued'])
    // First task completes: working → person/review releases its slot (交还给人立即释放).
    router.tasks.report({ ticketId: receipts[0].ticketId, summary: '做完', sections: { result: 'r', changes: 'c', verification: 'v', risks: 'n' } })
    await router.tick()
    assert.equal(router.getTicket(receipts[3].ticketId).stage, 'working', '最旧 queued 提升')
    assert.equal(router.getTicket(receipts[4].ticketId).stage, 'queued', '其余继续排队')
    const bodies = calls.prompt.map(p => p.text)
    assert.ok(bodies.some(b => b.includes('任务 3')), '提升后原注入文本送达')
    // Free another slot → the fifth promotes.
    router.tasks.report({ ticketId: receipts[1].ticketId, summary: '做完', sections: { result: 'r', changes: 'c', verification: 'v', risks: 'n' } })
    await router.tick()
    assert.equal(router.getTicket(receipts[4].ticketId).stage, 'working')
    assert.ok(calls.prompt.some(p => p.text.includes('任务 4')))
  } finally { cleanup() }
})

test('slots free on every exit from working: blocked and done both trigger promotion', async () => {
  const { router, cleanup } = fixture({ slotsPerOwner: 1 })
  try {
    const [r1, r2, r3] = await routeMany(router, 3)
    assert.deepEqual([r1.stage, r2.stage, r3.stage], ['working', 'queued', 'queued'])
    router.tasks.escalate({ ticketId: r1.ticketId, reason: '越界' })
    await router.tick()
    assert.equal(router.getTicket(r2.ticketId).stage, 'working', 'blocked 释放槽')
    router.tasks.report({ ticketId: r2.ticketId, summary: 's', sections: { result: 'r', changes: 'c', verification: 'v', risks: 'n' } })
    await router.tick()
    router.tasks.accept(r2.ticketId)
    await router.tick()
    assert.equal(router.getTicket(r3.ticketId).stage, 'working', 'done 释放槽')
  } finally { cleanup() }
})

test('人的专用槽: a human follow-up on a queued ticket promotes it past the cap, held rows deliver in order', async () => {
  const { router, calls, cleanup } = fixture({ slotsPerOwner: 1 })
  try {
    const [r1, r2] = await routeMany(router, 2)
    assert.equal(r2.stage, 'queued')
    // Human follows up on the QUEUED ticket — the dedicated human slot admits it immediately.
    const follow = await router.routeToOwner({ ownerId: 'repo-W', ticketId: r2.ticketId, message: '补充：先做这个' })
    assert.equal(follow.stage, 'working', '跟进立即提升，绕过槽上限')
    assert.equal(router.getTicket(r2.ticketId).stage, 'working')
    assert.equal(router.getTicket(r1.ticketId).stage, 'working', '原 working 不受影响')
    const texts = calls.prompt.map(p => p.text)
    const iFirst = texts.findIndex(t => t.includes('任务 1'))
    const iFollow = texts.findIndex(t => t.includes('补充：先做这个'))
    assert.ok(iFirst !== -1 && iFollow !== -1 && iFirst < iFollow, '原注入先投递，跟随后到（保序）')
  } finally { cleanup() }
})

test('slots are per-owner: owner W full does not block owner X', async () => {
  const { router, cleanup } = fixture({ slotsPerOwner: 1 })
  try {
    const [w1, w2] = await routeMany(router, 2)
    assert.equal(w2.stage, 'queued')
    const x1 = await router.routeToOwner({ ownerId: 'repo-X', message: '别的仓库的活' })
    assert.equal(x1.stage, 'working', 'owner 之间互不占槽')
  } finally { cleanup() }
})

test('crash-repair: a working ticket whose inject row is still held gets released on the next tick', async () => {
  const { router, store, calls, cleanup } = fixture({ slotsPerOwner: 1 })
  try {
    const [r1, r2] = await routeMany(router, 2)
    assert.equal(r2.stage, 'queued')
    // Simulate a crash between the promotion transition and the row release: ticket working, row held.
    router.tasks.report({ ticketId: r1.ticketId, summary: 's', sections: { result: 'r', changes: 'c', verification: 'v', risks: 'n' } })
    store.db.prepare('UPDATE ticket SET value = ? WHERE id = ?').run(
      JSON.stringify({ ...router.getTicket(r2.ticketId), stage: 'working', updatedAt: new Date().toISOString() }), r2.ticketId)
    assert.equal(outboxRows(store).filter(r => r.ticketId === r2.ticketId && r.state === 'held').length, 1)
    await router.tick()
    assert.equal(outboxRows(store).filter(r => r.ticketId === r2.ticketId && r.state === 'held').length, 0, 'held 行被释放')
    assert.ok(calls.prompt.some(p => p.text.includes('任务 1')), '注入最终送达')
  } finally { cleanup() }
})

test('same-owner serialization: concurrent routeToOwner calls never over-admit past the cap', async () => {
  const f = fixture({ slotsPerOwner: 1 })
  try {
    // Make prompt delivery slow so the two routes truly overlap in time.
    const slow = { ...f.router.sessions }
    const prompts = []
    f.router.sessions = {
      create: f.router.sessions.create,
      prompt: async request => { prompts.push(request); await new Promise(r => setTimeout(r, 25)); return { accepted: true } },
    }
    const [a, b] = await Promise.all([
      f.router.routeToOwner({ ownerId: 'repo-W', message: '并发 A' }),
      f.router.routeToOwner({ ownerId: 'repo-W', message: '并发 B' }),
    ])
    const stages = [a.stage, b.stage].sort()
    assert.deepEqual(stages, ['queued', 'working'], '同刻同 owner 恰好一票进槽')
    assert.equal(prompts.length, 1)
  } finally { f.cleanup() }
})

test('queued tickets survive a Router rebuild: a fresh Router over the same store still promotes (先存后做)', async () => {
  const f = fixture({ slotsPerOwner: 1 })
  try {
    const [r1, r2] = await routeMany(f.router, 2)
    assert.equal(r2.stage, 'queued')
    f.router.tasks.report({ ticketId: r1.ticketId, summary: 's', sections: { result: 'r', changes: 'c', verification: 'v', risks: 'n' } })
    // Rebuild the Router over the SAME store (host restart) — promotion must not depend on memory.
    const calls2 = []
    const router2 = new Router({
      store: f.store, registry: f.registry, config: { concurrency: { slotsPerOwner: 1 } },
      sessions: { create: async () => ({ sessionId: 'session-x' }), prompt: async req => { calls2.push(req); return { accepted: true } } },
    })
    await router2.tick()
    assert.equal(router2.getTicket(r2.ticketId).stage, 'working')
    assert.ok(calls2.some(p => p.text.includes('任务 1')))
  } finally { f.cleanup() }
})

test('queued 阶段的状态朗读（状态摘要是状态的朗读）', async () => {
  const { router, cleanup } = fixture({ slotsPerOwner: 1 })
  try {
    const [r1, r2] = await routeMany(router, 2)
    const summary = router.tasks.summarize(r2.ticketId)
    assert.equal(summary.stage, 'queued')
    assert.equal(summary.text, '排队中')
    assert.equal(router.getTicket(r1.ticketId).stage, 'working')
  } finally { cleanup() }
})

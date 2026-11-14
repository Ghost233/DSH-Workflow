/**
 * Router: the L1→L2 routing core (spec「工具契约」route_to_owner / query_tasks / reply_source) with the #66
 * reliability model: tickets are stored as 待触发 (idle) BEFORE any prompt is admitted, the OutboxRunner
 * delivers with retry/order, a human message releases blocked/failed tasks, follow-ups never re-bind
 * trigger/authorization (票面权威), and outward replies are truncated by code at 100 words.
 * Tested against a fake Sessions port and a deterministic clock.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store.js'
import { OwnerRegistry } from '../src/registry.js'
import { Router, RouterError, RECOVERY_NOTE } from '../src/router.js'

/** A registry+router with a scriptable fake Sessions port and a deterministic clock. */
function fixture({ failSessions = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-router-'))
  const store = new Store(dir)
  const registry = new OwnerRegistry(store, { scratchRoot: join(dir, 'scratch') })
  registry.ensureChief({ cwd: '/Volumes/home', workspace: 'Ghost233HomeRepo' })
  let nowMs = Date.parse('2026-11-15T00:00:00.000Z')
  const calls = { create: [], prompt: [] }
  const sessions = {
    create: async request => {
      calls.create.push(request)
      return { sessionId: 'session-fake-' + calls.create.length }
    },
    prompt: async request => {
      calls.prompt.push(request)
      if (failSessions.includes(request.sessionId)) {
        const error = new Error('session ' + request.sessionId + ' is absent from persistence')
        error.name = 'ApiSessionNotFound'
        throw error
      }
      return { accepted: true }
    },
  }
  const router = new Router({ store, registry, sessions, now: () => new Date(nowMs).toISOString() })
  const advance = (ms) => { nowMs += ms }
  return { router, registry, store, calls, advance, cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }) } }
}

test('route stores the ticket as 待触发 first, then the runner delivers it into 进行中', async () => {
  const { router, registry, calls, cleanup } = fixture()
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'DSH-Workflow', cwd: '/repos/DSH-Workflow' })
    const receipt = await router.routeToOwner({ ownerId: owner.id, message: '继续工单 66' })
    assert.equal(receipt.createdSession, true)
    assert.equal(receipt.rebuilt, false)
    assert.equal(receipt.stage, 'working', 'delivered in the same tick: 待触发 → 进行中')
    assert.equal(calls.create.length, 1)
    assert.equal(calls.create[0].cwd, '/repos/DSH-Workflow')
    const ticket = router.getTicket(receipt.ticketId)
    assert.equal(ticket.stage, 'working')
    assert.equal(ticket.mechanism, 'inject')
    assert.equal(ticket.targetSession, receipt.sessionId)
    assert.deepEqual(ticket.transitions.map(t => t.from + '>' + t.to), ['idle>working'])
    // 先存后做: the stored outbox row carried the exact injected text.
    const row = router.listOutbox().find(r => r.ticketId === receipt.ticketId)
    assert.equal(row.kind, 'inject')
    assert.equal(row.state, 'sent')
    assert.match(row.body, /继续工单 66/)
    assert.match(row.body, /授权/)
    const trigger = router.getTrigger(ticket.triggerId)
    assert.equal(trigger.message, '继续工单 66')
    assert.equal(calls.prompt.length, 1)
    assert.match(calls.prompt[0].text, /授权/)
    // Second route reuses the live Session — no new creation.
    const again = await router.routeToOwner({ ownerId: owner.id, message: '补一句' })
    assert.equal(again.createdSession, false)
    assert.equal(calls.create.length, 1)
    assert.equal(calls.prompt.length, 2)
  } finally { cleanup() }
})

test('route refuses unknown owners and the chief itself', async () => {
  const { router, cleanup } = fixture()
  try {
    await assert.rejects(() => router.routeToOwner({ ownerId: 'nope', message: 'x' }), RouterError)
    await assert.rejects(() => router.routeToOwner({ ownerId: 'chief', message: 'x' }), RouterError)
    await assert.rejects(() => router.routeToOwner({ ownerId: 'chief' }), RouterError)
  } finally { cleanup() }
})

test('one trigger accepted twice produces one task: triggerRef dedupes the whole route', async () => {
  const { router, registry, calls, cleanup } = fixture()
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
    const first = await router.routeToOwner({ ownerId: owner.id, message: 'm', triggerRef: 'feishu:om_1' })
    const second = await router.routeToOwner({ ownerId: owner.id, message: 'm', triggerRef: 'feishu:om_1' })
    assert.equal(second.deduped, true)
    assert.equal(second.ticketId, first.ticketId)
    assert.equal(second.stage, 'working')
    assert.equal(calls.prompt.length, 1)
    assert.equal(router.queryTasks({}).length, 1)
    await router.routeToOwner({ ownerId: owner.id, message: 'm', triggerRef: 'feishu:om_2' })
    assert.equal(router.queryTasks({}).length, 2)
  } finally { cleanup() }
})

test('a transient delivery failure leaves the ticket 待触发; the 2s retry delivers it (先存后做)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-router-'))
  const store = new Store(dir)
  const registry = new OwnerRegistry(store, { scratchRoot: join(dir, 'scratch') })
  registry.ensureChief({ cwd: '/Volumes/home', workspace: 'Ghost233HomeRepo' })
  const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
  registry.bindSession(owner.id, 'session-live')
  let nowMs = Date.parse('2026-11-15T00:00:00.000Z')
  let prompts = 0
  const router = new Router({ store, registry, now: () => new Date(nowMs).toISOString(), sessions: {
    create: async () => { throw new Error('must not be called') },
    prompt: async () => { prompts++; if (prompts === 1) { const e = new Error('provider overloaded'); e.name = 'RemoteError'; throw e } return { accepted: true } },
  } })
  try {
    // 先存后做: a transient failure does NOT reject the route — the work is stored and retried.
    const receipt = await router.routeToOwner({ ownerId: owner.id, message: 'x' })
    assert.equal(receipt.stage, 'idle', 'ticket waits as 待触发 while the first attempt backs off')
    assert.equal(router.getTicket(receipt.ticketId).stage, 'idle')
    assert.equal(registry.get(owner.id).sessionId, 'session-live', 'no rebuild for transient failures')
    const row = router.listOutbox().find(r => r.ticketId === receipt.ticketId)
    assert.equal(row.state, 'queued')
    assert.equal(row.attempts, 1)
    assert.equal(row.nextRetryAt, nowMs + 2000, '2s first retry')
    // Before the backoff elapses the retry does not fire.
    await router.tick()
    assert.equal(prompts, 1)
    // At the 2s mark the stored row delivers and the ticket enters 进行中.
    nowMs += 2000
    await router.tick()
    assert.equal(prompts, 2)
    assert.equal(router.getTicket(receipt.ticketId).stage, 'working')
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('a deleted owner Session rebuilds on delivery and the registry is updated', async () => {
  const dead = []
  const { router, registry, calls, cleanup } = fixture({ failSessions: dead })
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
    const first = await router.routeToOwner({ ownerId: owner.id, message: 'first' })
    dead.push(first.sessionId)
    const rebuilt = await router.routeToOwner({ ownerId: owner.id, message: 'after delete' })
    assert.equal(rebuilt.rebuilt, true)
    assert.notEqual(rebuilt.sessionId, first.sessionId)
    assert.equal(registry.get(owner.id).sessionId, rebuilt.sessionId)
    assert.equal(registry.get(owner.id).status, 'created')
    assert.equal(router.getTicket(rebuilt.ticketId).targetSession, rebuilt.sessionId)
    assert.equal(calls.create.length, 2)
    assert.equal(calls.prompt.length, 3) // first + failed attempt + retried after rebuild
  } finally { cleanup() }
})

test('three consecutive delivery failures report a system problem (一次性错误不惊动人)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-router-'))
  const store = new Store(dir)
  const registry = new OwnerRegistry(store, { scratchRoot: join(dir, 'scratch') })
  registry.ensureChief({ cwd: '/Volumes/home', workspace: 'Ghost233HomeRepo' })
  const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
  registry.bindSession(owner.id, 'session-down')
  let nowMs = Date.parse('2026-11-15T00:00:00.000Z')
  const problems = []
  const router = new Router({ store, registry, now: () => new Date(nowMs).toISOString(), onSystemProblem: p => problems.push(p), sessions: {
    create: async () => { throw new Error('must not be called') },
    prompt: async () => { const e = new Error('provider overloaded'); e.name = 'RemoteError'; throw e },
  } })
  try {
    const receipt = await router.routeToOwner({ ownerId: owner.id, message: 'x' })
    assert.equal(problems.length, 0)
    nowMs += 2000; await router.tick()
    assert.equal(problems.length, 0, 'two failures do not escalate')
    nowMs += 4000; await router.tick()
    assert.equal(problems.length, 1, 'the third consecutive failure reports a system problem')
    assert.equal(problems[0].ticketId, receipt.ticketId)
    assert.ok(router.listOutbox().some(r => r.kind === 'system-problem'))
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('follow-up resume: a review ticket resumes to working and injects into the same owner session', async () => {
  const { router, registry, calls, cleanup } = fixture()
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
    const first = await router.routeToOwner({ ownerId: owner.id, message: '写 hello 脚本' })
    router.tasks.report({ ticketId: first.ticketId, summary: 'done, see .scratch/hello.js' })
    assert.equal(router.getTicket(first.ticketId).stage, 'person/review')
    const resumed = await router.routeToOwner({ ownerId: owner.id, message: '顺带输出一行时间戳', ticketId: first.ticketId })
    assert.equal(resumed.resumed, true)
    assert.equal(resumed.ticketId, first.ticketId)
    assert.equal(resumed.stage, 'working')
    assert.equal(router.getTicket(first.ticketId).stage, 'working')
    assert.equal(calls.prompt.length, 2)
    assert.match(calls.prompt[1].text, /顺带输出一行时间戳/)
    assert.match(calls.prompt[1].text, /授权/)
    assert.match(calls.prompt[1].text, /再次 report/)
    assert.equal(router.queryTasks({}).length, 1)
    // 追问不绑定新触发 (spec #66): the trigger table holds exactly the original route's trigger.
    assert.equal(store3(router), 1)
  } finally { cleanup() }
  function store3(router) {
    return router.store.db.prepare('SELECT COUNT(*) AS n FROM trigger').get().n
  }
})

test('a human message releases blocked and failed tasks back to working (人的消息直接释放)', async () => {
  const { router, registry, cleanup } = fixture()
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
    const t1 = await router.routeToOwner({ ownerId: owner.id, message: 'one' })
    router.tasks.escalate({ ticketId: t1.ticketId, reason: '越界' })
    assert.equal(router.getTicket(t1.ticketId).stage, 'blocked')
    const r1 = await router.routeToOwner({ ownerId: owner.id, message: '已授权，继续', ticketId: t1.ticketId })
    assert.equal(r1.resumed, true)
    assert.equal(router.getTicket(t1.ticketId).stage, 'working')
    const t2 = await router.routeToOwner({ ownerId: owner.id, message: 'two' })
    router.tasks.fail({ ticketId: t2.ticketId, reason: '目标会话已删除' })
    assert.equal(router.getTicket(t2.ticketId).stage, 'failed')
    const r2 = await router.routeToOwner({ ownerId: owner.id, message: '重试', ticketId: t2.ticketId })
    assert.equal(r2.resumed, true)
    assert.equal(router.getTicket(t2.ticketId).stage, 'working')
  } finally { cleanup() }
})

test('follow-up rejects done tickets and any attempt to re-bind authorization (票面权威)', async () => {
  const { router, registry, cleanup } = fixture()
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
    const first = await router.routeToOwner({ ownerId: owner.id, message: 'x' })
    await assert.rejects(
      () => router.routeToOwner({ ownerId: owner.id, message: '换个授权', ticketId: first.ticketId, authorization: { actor: 'user', source: 'feishu', at: 'now' } }),
      (e) => e instanceof RouterError && e.code === 'authorization-immutable')
    router.tasks.report({ ticketId: first.ticketId, summary: 'done' })
    await router.routeToOwner({ ownerId: owner.id, message: '验收', ticketId: first.ticketId, resolution: 'accept' })
    await assert.rejects(() => router.routeToOwner({ ownerId: owner.id, message: 'again', ticketId: first.ticketId }),
      (e) => e.code === 'illegal-transition')
  } finally { cleanup() }
})

test("resolution 'accept' gates person/review → done; 'cancel' closes a person/confirm ticket", async () => {
  const { router, registry, cleanup } = fixture()
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
    const t1 = await router.routeToOwner({ ownerId: owner.id, message: 'one' })
    // accept is rejected while the task is still working
    await assert.rejects(() => router.routeToOwner({ ownerId: owner.id, message: '验收', ticketId: t1.ticketId, resolution: 'accept' }),
      (e) => e.code === 'illegal-transition')
    router.tasks.report({ ticketId: t1.ticketId, summary: 'ok' })
    const accepted = await router.routeToOwner({ ownerId: owner.id, message: '验收', ticketId: t1.ticketId, resolution: 'accept' })
    assert.equal(accepted.accepted, true)
    assert.equal(accepted.stage, 'done')
    const t2 = await router.routeToOwner({ ownerId: owner.id, message: 'two' })
    router.tasks.askConfirm({ ticketId: t2.ticketId, question: 'fork 执行会话？' })
    const cancelled = await router.routeToOwner({ ownerId: owner.id, message: '取消', ticketId: t2.ticketId, resolution: 'cancel' })
    assert.equal(cancelled.cancelled, true)
    assert.equal(cancelled.stage, 'done')
  } finally { cleanup() }
})

test('a ticket without an authorization record is failed, never executed on a guess (缺上下文升级不编造)', async () => {
  const { router, registry, store, cleanup } = fixture()
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
    const first = await router.routeToOwner({ ownerId: owner.id, message: 'x' })
    // Corrupt the record: strip its authorization (e.g. a hand-edited row).
    const ticket = router.getTicket(first.ticketId)
    const { authorization, ...stripped } = ticket
    store.db.prepare('UPDATE ticket SET value = ? WHERE id = ?').run(JSON.stringify(stripped), ticket.id)
    await assert.rejects(
      () => router.routeToOwner({ ownerId: owner.id, message: '继续', ticketId: first.ticketId }),
      (e) => e.code === 'authorization-missing')
    assert.equal(router.getTicket(first.ticketId).stage, 'blocked', 'escalated instead of fabricated')
    // And the stored-work path also refuses: an inject row for an authorization-less ticket fails permanently.
    const bare = { id: 'tsk-bare', triggerId: 'trg-bare', owner: owner.id, stage: 'idle', mechanism: 'inject', targetSession: 's', requestId: 'r', createdAt: 'x', updatedAt: 'x' }
    store.db.prepare('INSERT INTO ticket (id, value) VALUES (?, ?)').run(bare.id, JSON.stringify(bare))
    router.runner.enqueue({ ticketId: bare.id, kind: 'inject', to: 'session:s', body: 'x', requestId: 'r2' })
    await router.tick()
    assert.equal(router.getTicket(bare.id).stage, 'failed')
    assert.ok(router.listOutbox().some(r => r.kind === 'system-problem'))
  } finally { cleanup() }
})

test('restart recovery: the first injection after markRestart carries the recovery note exactly once', async () => {
  const { router, registry, calls, cleanup } = fixture()
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
    const first = await router.routeToOwner({ ownerId: owner.id, message: 'x' })
    router.markRestart()
    await router.routeToOwner({ ownerId: owner.id, message: '继续干', ticketId: first.ticketId })
    const carried = calls.prompt[1].text
    assert.ok(carried.startsWith(RECOVERY_NOTE), 'the recovery note heads the first post-restart injection')
    assert.equal(router.getTicket(first.ticketId).recoveryPending, undefined, 'carried exactly once')
    await router.routeToOwner({ ownerId: owner.id, message: '再来', ticketId: first.ticketId })
    assert.ok(!calls.prompt[2].text.includes(RECOVERY_NOTE), 'the note is not repeated')
  } finally { cleanup() }
})

test('replySource stores a 100-word-capped reply through the runner and announces truncation', async () => {
  const { router, registry, cleanup } = fixture()
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
    await router.routeToOwner({ ownerId: owner.id, message: 'x' })
    const short = await router.replySource({ text: '工单 66 已收尾', to: 'dsh:session:chief' })
    assert.equal(short.truncated, false)
    assert.equal(short.state, 'sent')
    const longText = '完成了。' + '细节细节细节细节细节 '.repeat(60)
    const long = await router.replySource({ text: longText, to: 'dsh:session:chief' })
    assert.equal(long.truncated, true)
    const stored = router.listOutbox().find(r => r.id === long.outboxId)
    assert.match(stored.body, /（超过 100 词已截断）$/)
  } finally { cleanup() }
})

test('queryTasks filters by owner/stage and every row carries the verbatim stageText reading', async () => {
  const { router, registry, cleanup } = fixture()
  try {
    const a = registry.create({ kind: 'repo', workspace: 'A', cwd: '/a' })
    const b = registry.create({ kind: 'repo', workspace: 'B', cwd: '/b' })
    await router.routeToOwner({ ownerId: a.id, message: 'one' })
    await router.routeToOwner({ ownerId: b.id, message: 'two' })
    assert.equal(router.queryTasks({}).length, 2)
    assert.equal(router.queryTasks({ owner: a.id }).length, 1)
    assert.equal(router.queryTasks({ stage: 'working' }).length, 2)
    assert.equal(router.queryTasks({ stage: 'done' }).length, 0)
    for (const row of router.queryTasks({})) assert.equal(row.stageText, '进行中', '状态摘要是状态的朗读')
    router.tasks.report({ ticketId: router.queryTasks({ owner: a.id })[0].id, summary: 'ok' })
    assert.equal(router.queryTasks({ stage: 'person/review' })[0].stageText, '等您验收')
  } finally { cleanup() }
})

test("legacy 'review' tickets surface as person/review in queryTasks", async () => {
  const { router, registry, store, cleanup } = fixture()
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
    const legacy = { id: 'tsk-legacy', triggerId: 'trg-l', owner: owner.id, stage: 'review', mechanism: 'inject', targetSession: 's', requestId: 'r', authorization: { actor: 'user', source: 'dsh', at: 'x' }, createdAt: '2026-11-14T00:00:00.000Z', updatedAt: 'x' }
    store.db.prepare('INSERT INTO ticket (id, value) VALUES (?, ?)').run(legacy.id, JSON.stringify(legacy))
    const rows = router.queryTasks({})
    assert.equal(rows[0].stage, 'person/review')
    assert.equal(rows[0].stageText, '等您验收')
  } finally { cleanup() }
})

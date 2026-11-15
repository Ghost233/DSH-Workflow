/**
 * Recycler (issue #70 scratch 回收): terminal tickets (done=验收通过 / failed=终止) under a scratch owner
 * trigger the recycle check; the owner recycles ONLY when no live ticket remains under it (回收安全).
 * Recycling lists the directory contents into an audit row FIRST, deletes the scratch dir, flips the
 * registry row to recycled (会话历史保留: sessionId retained), and notifies the chief. dir/repo owners
 * never recycle. A failed deletion never blocks the task's completion (warn + retry next sweep).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store.js'
import { OwnerRegistry } from '../src/registry.js'
import { Router } from '../src/router.js'
import { Recycler } from '../src/recycle.js'

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-rc-'))
  const store = new Store(dir)
  const registry = new OwnerRegistry(store, { scratchRoot: join(dir, 'scratch') })
  registry.ensureChief({ cwd: '/Volumes/home', workspace: 'Ghost233HomeRepo' })
  registry.create({ kind: 'repo', workspace: 'DSH-Workflow', cwd: '/Volumes/home/DSH-Workflow' })
  registry.create({ kind: 'dir', cwd: join(dir, 'docs-dir') })
  mkdirSync(join(dir, 'docs-dir'), { recursive: true })
  let nowMs = Date.parse('2026-11-15T03:00:00.000Z')
  const calls = { create: [], prompt: [] }
  const sessions = {
    create: async request => { calls.create.push(request); return { sessionId: 'session-' + calls.create.length } },
    prompt: async request => { calls.prompt.push(request); return { accepted: true } },
  }
  const router = new Router({ store, registry, sessions, now: () => new Date(nowMs).toISOString() })
  const warnings = []
  const recycler = new Recycler({ store, registry, logger: { info() {}, warn: (...a) => warnings.push(a.join(' ')) }, now: () => new Date(nowMs).toISOString() })
  return {
    store, registry, router, recycler, calls, warnings, dir,
    tickets: () => store.db.prepare('SELECT value FROM ticket').all().map(r => JSON.parse(String(r.value))),
    outbox: () => store.db.prepare('SELECT value FROM outbox ORDER BY rowid').all().map(r => JSON.parse(String(r.value))),
    cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }) },
  }
}

/** Route a fresh task to an owner and drive it to the given terminal stage. */
async function terminalTicket(f, ownerId, stage) {
  const receipt = await f.router.routeToOwner({ ownerId, message: '任务' })
  const id = receipt.ticketId
  if (stage === 'done') {
    f.router.tasks.report({ ticketId: id, summary: '干完了', sections: { result: 'r', changes: 'c', verification: 'v', risks: 'k' } })
    await f.router.routeToOwner({ ownerId, ticketId: id, message: '验收通过', resolution: 'accept' })
  } else if (stage === 'failed') {
    f.router.tasks.fail({ ticketId: id, reason: '终止' })
  }
  return id
}

test('scratch 全链: done 验收通过 → 目录删除 + 注册表 recycled + 审计行(含清单) + 会话保留', async () => {
  const f = fixture()
  try {
    const owner = f.registry.create({ kind: 'scratch' })
    writeFileSync(join(owner.cwd, 'result.md'), '产出')
    mkdirSync(join(owner.cwd, 'sub'))
    writeFileSync(join(owner.cwd, 'sub', 'data.json'), '{}')
    const ticketId = await terminalTicket(f, owner.id, 'done')
    const result = f.recycler.maybeRecycleForTicket(ticketId)
    assert.equal(result.recycled, true)
    assert.equal(existsSync(owner.cwd), false, 'scratch 目录已删')
    const row = f.registry.get(owner.id)
    assert.equal(row.recycled, true, '注册表转 recycled')
    assert.ok(row.recycledAt)
    assert.equal(row.sessionId, owner.sessionId ?? row.sessionId, '行保留')
    assert.ok(row.sessionId, '会话历史保留可查: sessionId 不抹除')
    const audit = f.outbox().find(r => r.body?.includes('[hub-bot 回收 ' + owner.id + ']'))
    assert.ok(audit, '回收动作落审计')
    assert.equal(audit.to, 'dsh:session:chief', '可投递寻址——裸 dsh 是死信（双轴审查 P1-1）')
    assert.equal(audit.state, 'queued', '进 OutboxRunner 投递扫描')
    assert.ok(audit.body.includes('result.md') && audit.body.includes('sub/data.json'), '审计含目录内容清单')
    assert.ok(audit.body.includes('会话'), '审计指出会话历史可查')
  } finally { f.cleanup() }
})

test('回收安全: 同一 scratch owner 名下还有进行中票时, done 一票不回收', async () => {
  const f = fixture()
  try {
    const owner = f.registry.create({ kind: 'scratch' })
    const doneId = await terminalTicket(f, owner.id, 'done')
    const live = await f.router.routeToOwner({ ownerId: owner.id, message: '第二个任务' })
    const result = f.recycler.maybeRecycleForTicket(doneId)
    assert.equal(result.skipped, 'live-tickets')
    assert.equal(existsSync(owner.cwd), true, '目录保留')
    assert.equal(f.registry.get(owner.id).recycled, false)
    // the live ticket terminates → now the owner recycles
    f.router.tasks.fail({ ticketId: live.ticketId, reason: '终止' })
    const second = f.recycler.maybeRecycleForTicket(live.ticketId)
    assert.equal(second.recycled, true)
    assert.equal(existsSync(owner.cwd), false)
  } finally { f.cleanup() }
})

test('failed(终止) 的 scratch 票同样触发回收', async () => {
  const f = fixture()
  try {
    const owner = f.registry.create({ kind: 'scratch' })
    writeFileSync(join(owner.cwd, 'x.txt'), 'x')
    const ticketId = await terminalTicket(f, owner.id, 'failed')
    const result = f.recycler.maybeRecycleForTicket(ticketId)
    assert.equal(result.recycled, true)
    assert.equal(existsSync(owner.cwd), false)
  } finally { f.cleanup() }
})

test('dir 与 repo 负责人永不回收', async () => {
  const f = fixture()
  try {
    const dirOwner = f.registry.list().find(o => o.kind === 'dir')
    const repoOwner = f.registry.get('repo-DSH-Workflow')
    const dirTicket = await terminalTicket(f, dirOwner.id, 'done')
    const repoTicket = await terminalTicket(f, repoOwner.id, 'done')
    assert.equal(f.recycler.maybeRecycleForTicket(dirTicket).skipped, 'not-scratch')
    assert.equal(f.recycler.maybeRecycleForTicket(repoTicket).skipped, 'not-scratch')
    assert.equal(existsSync(dirOwner.cwd), true, 'dir 目录原样')
    assert.equal(f.registry.get(dirOwner.id).recycled, false)
    assert.equal(f.registry.get(repoOwner.id).recycled, false)
  } finally { f.cleanup() }
})

test('已回收幂等 + 非终态票不触发', async () => {
  const f = fixture()
  try {
    const owner = f.registry.create({ kind: 'scratch' })
    const receipt = await f.router.routeToOwner({ ownerId: owner.id, message: '任务' })
    assert.equal(f.recycler.maybeRecycleForTicket(receipt.ticketId).skipped, 'not-terminal')
    f.router.tasks.fail({ ticketId: receipt.ticketId, reason: '终止' })
    assert.equal(f.recycler.maybeRecycleForTicket(receipt.ticketId).recycled, true)
    assert.equal(f.recycler.maybeRecycleForTicket(receipt.ticketId).skipped, 'already-recycled')
  } finally { f.cleanup() }
})

test('回收失败不阻断: 删除抛错 → warn + 注册表保持未回收 + 返回 failed', async () => {
  const f = fixture()
  try {
    const owner = f.registry.create({ kind: 'scratch' })
    const ticketId = await terminalTicket(f, owner.id, 'done')
    const failing = new Recycler({
      store: f.store, registry: f.registry, logger: { info() {}, warn: (...a) => f.warnings.push(a.join(' ')) },
      rm: () => { throw new Error('EPERM') },
    })
    const result = failing.maybeRecycleForTicket(ticketId)
    assert.equal(result.failed, true)
    assert.equal(f.registry.get(owner.id).recycled, false, '未回收不标 recycled')
    assert.ok(f.warnings.some(w => w.includes('EPERM')), 'warn 记录')
  } finally { f.cleanup() }
})

test('清单有上限: 大量文件时审计行截断并给总数', async () => {
  const f = fixture()
  try {
    const owner = f.registry.create({ kind: 'scratch' })
    for (let i = 0; i < 60; i++) writeFileSync(join(owner.cwd, 'f' + String(i).padStart(3, '0') + '.txt'), 'x')
    const ticketId = await terminalTicket(f, owner.id, 'done')
    const result = f.recycler.maybeRecycleForTicket(ticketId)
    assert.equal(result.recycled, true)
    const audit = f.outbox().find(r => r.body?.includes('[hub-bot 回收 ' + owner.id + ']'))
    assert.ok(audit.body.includes('60'), '总数入审计')
    assert.ok(audit.body.length < 2000, '审计行有界')
  } finally { f.cleanup() }
})

test('sweep: 只回收满足条件的 scratch owner(终态票触发外的兜底)', async () => {
  const f = fixture()
  try {
    const a = f.registry.create({ kind: 'scratch' })
    const b = f.registry.create({ kind: 'scratch' })
    await terminalTicket(f, a.id, 'done')
    await terminalTicket(f, b.id, 'done')
    const live = await f.router.routeToOwner({ ownerId: b.id, message: '还在跑' })
    const result = f.recycler.sweep()
    assert.deepEqual(result.recycled, [a.id])
    assert.equal(existsSync(a.cwd), false)
    assert.equal(existsSync(b.cwd), true, 'b 还有进行中票, 不回收')
  } finally { f.cleanup() }
})

test('router 回收触发段: accept/cancel/fail 终态转移即时触发 onTicketTerminal', async () => {
  const f = fixture()
  const fired = []
  f.router.onTicketTerminal = id => fired.push(id)
  try {
    const owner = f.registry.create({ kind: 'scratch' })
    const doneId = await terminalTicket(f, owner.id, 'done')
    assert.ok(fired.includes(doneId), 'accept → done 触发')
    // cancel 路径: person/confirm 票 resolution:'cancel' → done 同样触发
    const r2 = await f.router.routeToOwner({ ownerId: owner.id, message: '第二个' })
    f.router.tasks.askConfirm({ ticketId: r2.ticketId, question: '确认吗', action: { type: 'fork', reason: 'r' } })
    await f.router.routeToOwner({ ownerId: owner.id, ticketId: r2.ticketId, message: '取消', resolution: 'cancel' })
    assert.ok(fired.includes(r2.ticketId), 'cancel → done 触发')
    // 直调 tasks.fail 不经 Router(设计如此: owner-tools/github 的终止由 sweep 兜底)
    const r3 = await f.router.routeToOwner({ ownerId: owner.id, message: '第三个' })
    f.router.tasks.fail({ ticketId: r3.ticketId, reason: 'x' })
    assert.ok(!fired.includes(r3.ticketId), 'bypass 路径不触发(由 sweep 兜底)')
  } finally { f.cleanup() }
})

test('端到端: router accept 触发即真回收(接线验证)', async () => {
  const f = fixture()
  f.router.onTicketTerminal = id => f.recycler.maybeRecycleForTicket(id)
  try {
    const owner = f.registry.create({ kind: 'scratch' })
    writeFileSync(join(owner.cwd, 'out.txt'), 'o')
    await terminalTicket(f, owner.id, 'done')
    assert.equal(existsSync(owner.cwd), false, 'accept 即时回收, 不等 sweep')
    assert.equal(f.registry.get(owner.id).recycled, true)
  } finally { f.cleanup() }
})

test('零票 scratch owner 不被 sweep 早产回收; 已回收 owner 拒绝再路由(开新任务)', async () => {
  const f = fixture()
  try {
    const fresh = f.registry.create({ kind: 'scratch' })
    assert.equal(f.recycler.sweep().recycled.length, 0, '没有票的 scratch owner 不回收')
    assert.equal(existsSync(fresh.cwd), true)
    // 完整生命周期后: 回收生效, 再路由被拒
    const ticketId = await terminalTicket(f, fresh.id, 'done')
    assert.equal(f.recycler.maybeRecycleForTicket(ticketId).recycled, true)
    await assert.rejects(
      f.router.routeToOwner({ ownerId: fresh.id, message: '复活?' }),
      /owner-recycled|已回收/
    )
  } finally { f.cleanup() }
})

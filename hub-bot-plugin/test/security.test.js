/**
 * 危险命令黑名单 (#73 补足 / spec「Policy」L260): 注入会话无审批的安全兜底 —— 命中黑名单的注入不直接执行,
 * 票转 person/confirm (先存后做, 意图落票面), 用户确认后才注入 (复用 #69 确认链); GitHub/飞书自动入口
 * 同护 (它们都汇于 routeToOwner)。面板设置页可编辑清单 (security.dangerousPatterns 进 SETTABLE)。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store.js'
import { OwnerRegistry } from '../src/registry.js'
import { Router } from '../src/router.js'
import { GitHubSource } from '../src/github.js'
import { resolveConfig } from '../src/config.js'
import { applySettingsPatch, SettingsError } from '../src/panel.js'
import {
  DEFAULT_DANGEROUS_PATTERNS, DANGEROUS_INJECT_ACTION, findDangerousPattern, dangerousConfirmText,
} from '../src/security.js'
import * as ownerTools from '../src/owner-tools.js'

/** registry+router with a recording fake Sessions port. */
function fixture({ now = '2026-11-15T00:00:00.000Z' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-sec-'))
  const store = new Store(dir)
  const registry = new OwnerRegistry(store, { scratchRoot: join(dir, 'scratch') })
  registry.ensureChief({ cwd: '/Volumes/home', workspace: 'Ghost233HomeRepo' })
  const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/Volumes/home/W' })
  let nowMs = Date.parse(now)
  const calls = { prompt: [] }
  const sessions = {
    create: async () => ({ sessionId: 'session-o1' }),
    prompt: async request => { calls.prompt.push(request); return { accepted: true } },
  }
  const router = new Router({ store, registry, sessions, now: () => new Date(nowMs += 1000).toISOString() })
  return {
    router, registry, store, owner, calls,
    tickets: () => store.db.prepare('SELECT value FROM ticket').all().map(r => JSON.parse(String(r.value))),
    outbox: () => store.db.prepare('SELECT value FROM outbox ORDER BY rowid').all().map(r => JSON.parse(String(r.value))),
    cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }) },
  }
}

test('findDangerousPattern: 命中矩阵 — 默认清单覆盖 spec 点名的级别, 大小写不敏感, 子串匹配', () => {
  for (const text of [
    '请执行 rm -rf /tmp/build 清理',
    'sudo systemctl restart x',
    'git push --force origin main',
    'git push -f',
    'mkfs.ext4 /dev/sda1',
    'dd of=/dev/sda if=/dev/zero',
    'chmod -R 777 /var',
    'RM -RF 大写同样命中',
  ]) {
    assert.ok(findDangerousPattern(text), 'hit: ' + text)
  }
  for (const text of ['修复登录页样式', 'rm 普通提及无 -rf 组合', 'git push origin main', '读一下 README']) {
    assert.equal(findDangerousPattern(text), null, 'miss: ' + text)
  }
  assert.equal(findDangerousPattern('rm -rf x', []), null, '空清单 = 放行 (用户显式选择)')
  assert.equal(findDangerousPattern('自定义模式XYZ 出现', ['自定义模式XYZ']), '自定义模式XYZ', '配置可扩展')
  assert.equal(findDangerousPattern('rm -rf x', null), null, 'null 清单容错')
})

test('config: security 节默认清单 + 自定义 + 校验 (字符串数组, 未知键拒绝)', () => {
  const def = resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y' })
  assert.ok(def.security.dangerousPatterns.includes('rm -rf'), '默认含 rm -rf')
  assert.ok(def.security.dangerousPatterns.length >= 6, '默认清单非空')
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y', security: { nope: 1 } }), /does not know config\.security key/)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y', security: { dangerousPatterns: 'rm' } }), /dangerousPatterns must be an array/)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y', security: { dangerousPatterns: ['ok', ''] } }), /non-empty strings/)
  const custom = resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y', security: { dangerousPatterns: ['DROP TABLE'] } })
  assert.deepEqual(custom.security.dangerousPatterns, ['DROP TABLE'])
})

test('路由新票命中黑名单: 票转 person/confirm 不注入, 意图(action)落票面, 先存后做', async () => {
  const f = fixture()
  try {
    const receipt = await f.router.routeToOwner({ ownerId: f.owner.id, message: '帮我 rm -rf /tmp/build 清理一下' })
    assert.equal(receipt.stage, 'person/confirm')
    const ticket = f.tickets()[0]
    assert.equal(ticket.stage, 'person/confirm')
    assert.ok(ticket.pendingConfirm.text.includes('rm -rf'), '确认文本指明命中模式')
    assert.equal(ticket.pendingConfirm.action.type, DANGEROUS_INJECT_ACTION)
    assert.equal(ticket.pendingConfirm.action.message, '帮我 rm -rf /tmp/build 清理一下', '原文存票面')
    assert.ok(ticket.authorization, '授权记录仍在票面')
    assert.equal(f.calls.prompt.length, 0, '未注入任何会话')
    assert.equal(f.outbox().filter(r => r.kind === 'inject').length, 0, '无注入行入队')
    assert.ok(f.tickets()[0].triggerId, 'trigger 仍先存 (可追溯)')
  } finally { f.cleanup() }
})

test('确认后放行: 面板 confirm → 原消息注入 owner 会话, 票转 working, confirmOutcome 落票面', async () => {
  const f = fixture()
  try {
    const r = await f.router.routeToOwner({ ownerId: f.owner.id, message: 'rm -rf /tmp/build' })
    const c = await f.router.routeToOwner({ ownerId: f.owner.id, ticketId: r.ticketId, resolution: 'confirm', message: '确认' })
    assert.equal(c.confirmed, true)
    assert.equal(c.stage, 'working')
    const ticket = f.tickets()[0]
    assert.equal(ticket.stage, 'working')
    assert.equal(ticket.confirmOutcome.kind, 'confirmed')
    assert.equal(ticket.confirmOutcome.by, 'user')
    const injects = f.outbox().filter(row => row.kind === 'inject')
    assert.equal(injects.length, 1, '确认后恰好一条注入')
    assert.ok(injects[0].body.includes('rm -rf /tmp/build'), '注入携带原消息')
    assert.ok(injects[0].body.includes('授权：'), '注入携授权记录 (票面权威)')
  } finally { f.cleanup() }
})

test('拒绝: 票转 blocked 且永不注入', async () => {
  const f = fixture()
  try {
    const r = await f.router.routeToOwner({ ownerId: f.owner.id, message: 'sudo dd of=/dev/sda' })
    const rej = await f.router.routeToOwner({ ownerId: f.owner.id, ticketId: r.ticketId, resolution: 'reject', message: '太危险' })
    assert.equal(rej.rejected, true)
    assert.equal(rej.stage, 'blocked')
    assert.equal(f.calls.prompt.length, 0, '从未注入')
    assert.equal(f.outbox().filter(row => row.kind === 'inject').length, 0)
  } finally { f.cleanup() }
})

test('未命中直投 (对照): 干净消息不绕行确认', async () => {
  const f = fixture()
  try {
    const r = await f.router.routeToOwner({ ownerId: f.owner.id, message: '修复登录页样式' })
    assert.equal(r.stage, 'working')
    assert.equal(f.calls.prompt.length, 1)
    assert.equal(f.tickets()[0].pendingConfirm, undefined)
  } finally { f.cleanup() }
})

test('追问命中同护: follow-up 消息转 person/confirm, 确认后才注入', async () => {
  const f = fixture()
  try {
    const r = await f.router.routeToOwner({ ownerId: f.owner.id, message: '调查磁盘占用' })
    assert.equal(r.stage, 'working')
    const fu = await f.router.routeToOwner({ ownerId: f.owner.id, ticketId: r.ticketId, message: '直接 rm -rf /tmp/data 吧' })
    assert.equal(fu.stage, 'person/confirm')
    assert.equal(f.calls.prompt.length, 1, '追问未注入 (仍只有第一条)')
    const ticket = f.tickets()[0]
    assert.equal(ticket.pendingConfirm.action.type, DANGEROUS_INJECT_ACTION)
    const c = await f.router.routeToOwner({ ownerId: f.owner.id, ticketId: r.ticketId, resolution: 'confirm', message: '确认' })
    assert.equal(c.confirmed, true)
    assert.equal(f.calls.prompt.length, 2, '确认后追问注入')
    // route/follow-up 注入经 #promptOwner: 扁平 { sessionId, requestId, text } 形状
    assert.ok(String(f.calls.prompt[1].text).includes('rm -rf /tmp/data'))
    assert.ok(String(f.calls.prompt[1].text).includes('授权：'), '注入携授权记录')
    assert.ok(String(f.calls.prompt[1].text).includes('命中危险命令黑名单'), '放行注入注明已经确认')
  } finally { f.cleanup() }
})

test('GitHub 自动入口同护: 含 sudo 的 mention 评论 → 票转 person/confirm, 不注入', async () => {
  const f = fixture()
  try {
    const gh = { async get() { return [] }, async post() { return {} } }
    const config = { enabled: true, intervalMs: 300000, loginAllowlist: ['Ghost233'], mentionHandle: '@hub-bot', repos: [] }
    const source = new GitHubSource({ store: f.store, registry: f.registry, router: f.router, sessions: f.router.sessions ?? {}, config, logger: { info() {}, warn() {} }, gh, now: () => new Date().toISOString() })
    const result = await source.handleCommentEvent({
      id: 9001, body: '@hub-bot 请 sudo rm -rf /var/tmp 清理', user: { login: 'Ghost233' },
      html_url: 'https://github.com/o/r/issues/5#issuecomment-9001', issue_url: 'https://api.github.com/repos/o/r/issues/5', created_at: '2026-11-15T01:00:00Z',
    }, { repo: 'o/r', workspace: 'W', cwd: '/Volumes/home/W', enabled: true })
    assert.equal(result.routed, true)
    const ticket = f.tickets().find(t => t.triggerId && t.stage === 'person/confirm')
    assert.ok(ticket, '票转等确认')
    assert.ok(ticket.pendingConfirm.text.includes('sudo'), '确认文本说明命中模式')
    assert.equal(f.calls.prompt.length, 0, '自动入口命中同样不注入')
  } finally { f.cleanup() }
})

/** owner-tools harness: register the plugin against a fake ctx and invoke inject_session directly. */
async function ownerToolsHarness(f) {
  const tools = new Map()
  const prompts = []
  const api = {
    registry: f.registry,
    tasks: f.router.tasks,
    config: { security: { dangerousPatterns: [...DEFAULT_DANGEROUS_PATTERNS] } },
  }
  const ctx = {
    reflect: { get: () => api },
    systemPrompt: { section() {} },
    tools: { register: def => tools.set(def.name, def) },
    workingDirectory: { ensure: async () => f.owner.cwd },
    sessionController: {
      list: async () => ({ items: [{ sessionId: 'session-w1', cwd: join(f.owner.cwd, 'worker') }] }),
      prompt: async request => { prompts.push(request); return { accepted: true } },
      search: async () => ({ items: [] }),
      page: async () => ({ records: [] }),
      create: async () => ({ sessionId: 'session-w2' }),
    },
  }
  ownerTools.apply(ctx)
  return { tools, prompts, exec: { agent: {}, signal: AbortSignal.timeout(5000) } }
}

test('inject_session 命中黑名单 (带 ticketId): 抛错不注入, 票转 person/confirm, 用户确认后注入执行', async () => {
  const f = fixture()
  try {
    const r = await f.router.routeToOwner({ ownerId: f.owner.id, message: '正常任务' })
    const h = await ownerToolsHarness(f)
    await assert.rejects(
      () => h.tools.get('inject_session').execute({ sessionId: 'session-w1', text: 'rm -rf /tmp/x', ticketId: r.ticketId }, h.exec),
      /命中危险命令黑名单/,
    )
    assert.equal(h.prompts.length, 0, '未注入')
    const ticket = f.tickets()[0]
    assert.equal(ticket.stage, 'person/confirm')
    assert.equal(ticket.pendingConfirm.action.type, DANGEROUS_INJECT_ACTION)
    assert.equal(ticket.pendingConfirm.action.entry, 'owner-inject')
    // 用户经路由确认 → 存储的注入按票面原文投递到执行会话 (经 router 的 Sessions 口)
    const c = await f.router.routeToOwner({ ownerId: f.owner.id, ticketId: r.ticketId, resolution: 'confirm', message: '确认' })
    assert.equal(c.confirmed, true)
    assert.equal(h.prompts.length, 0, 'owner-inject 确认不经过 L2 的 controller — 由路由直接投递')
    assert.equal(f.calls.prompt.length, 2, '路由注入 + 确认放行各一')
    const released = f.calls.prompt[1]
    assert.equal(released.sessionId, 'session-w1', '投递到票面存储的执行会话')
    assert.ok(String(released.content[0].text).includes('rm -rf /tmp/x'))
    assert.ok(String(released.content[0].text).includes('授权：'), '注入携授权记录 (L2 构建时已拼装)')
    const ticket2 = f.tickets()[0]
    assert.equal(ticket2.stage, 'working')
    assert.equal(ticket2.confirmOutcome.kind, 'confirmed')
  } finally { f.cleanup() }
})

test('inject_session 无 ticketId 命中: 直接拒绝 (无票可挂确认); 干净文本照常注入', async () => {
  const f = fixture()
  try {
    const h = await ownerToolsHarness(f)
    await assert.rejects(
      () => h.tools.get('inject_session').execute({ sessionId: 'session-w1', text: 'sudo mkfs /dev/sda' }, h.exec),
      /命中危险命令黑名单/,
    )
    assert.equal(h.prompts.length, 0)
    const ok = await h.tools.get('inject_session').execute({ sessionId: 'session-w1', text: '继续实现' }, h.exec)
    assert.equal(ok.accepted, true)
    assert.equal(h.prompts.length, 1)
  } finally { f.cleanup() }
})

test('面板 SETTABLE: security.dangerousPatterns 可编辑, 非法值拒绝', () => {
  const config = resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y' })
  const overlay = applySettingsPatch(config, { security: { dangerousPatterns: ['rm -rf', '自定义'] } })
  assert.deepEqual(config.security.dangerousPatterns, ['rm -rf', '自定义'], '活 config 即时生效')
  assert.deepEqual(overlay, { security: { dangerousPatterns: ['rm -rf', '自定义'] } })
  assert.throws(() => applySettingsPatch(config, { security: { dangerousPatterns: [1] } }), SettingsError)
  assert.throws(() => applySettingsPatch(config, { security: { nope: [] } }), /does not know settings key "security.nope"/)
  assert.deepEqual(config.security.dangerousPatterns, ['rm -rf', '自定义'], '拒绝的补丁不落地')
})

test('确认文本指明对象与风险 (不编造)', () => {
  const text = dangerousConfirmText('rm -rf', '帮我 rm -rf /tmp/build 清理一下')
  assert.ok(text.includes('rm -rf'))
  assert.ok(text.includes('危险命令黑名单'))
})

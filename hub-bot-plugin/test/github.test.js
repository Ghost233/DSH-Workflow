/**
 * GitHubSource (issue #71 GitHub 自动处理闭环): polling with watermarks (首次只记水位线，存量不触发),
 * login 白名单 + bot:ignore policy, ack 代发带 dsh-badge, 路由进 L2 仓库负责人（与飞书同一 Trigger → Policy
 * → 任务路径）, 评论「停」与源头关闭即终止（让位于人）, recorded 回复经 gh 实投。Fake gh — 无网络。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store.js'
import { OwnerRegistry } from '../src/registry.js'
import { Router } from '../src/router.js'
import { GitHubSource, watermarkPath, DSH_BADGE } from '../src/github.js'
import { resolveConfig } from '../src/config.js'

const REPO = 'Ghost233/DSH-Workflow'
const REPO_CFG = { repo: REPO, workspace: 'DSH-Workflow', cwd: '/Volumes/home/DSH-Workflow', enabled: true }

/** Fake gh runner: longest-key-first match against an in-place mutable script; POSTs land in posts. */
function fakeGh(script) {
  const posts = []
  const gh = async (args) => {
    const key = args.join(' ')
    if (args.includes('POST') || args.includes('-X')) { posts.push(args); return '{"id": 9001}' }
    const entries = Object.entries(script).sort((a, b) => b[0].length - a[0].length)
    for (const [match, response] of entries) {
      if (key.includes(match)) return typeof response === 'string' ? response : JSON.stringify(response)
    }
    return '[]'
  }
  return { gh, posts }
}

function issue({ number = 42, title = '修一下登录重试', body = '正文', login = 'Ghost233', labels = [], pr = false, state = 'open' } = {}) {
  const item = {
    number, title, body, state,
    user: { login },
    labels: labels.map(name => ({ name })),
    html_url: 'https://github.com/' + REPO + '/issues/' + number,
    created_at: '2026-11-15T01:00:00Z',
  }
  if (pr) item.pull_request = { url: 'x' }
  return item
}
function comment({ id = 5001, body = '继续', login = 'Ghost233', issueNumber = 42 } = {}) {
  return { id, body, user: { login }, html_url: 'https://github.com/' + REPO + '/issues/' + issueNumber + '#issuecomment-' + id, issue_url: 'https://api.github.com/repos/' + REPO + '/issues/' + issueNumber, created_at: '2026-11-15T01:05:00Z' }
}

/** registry+router+source with fake sessions and a scripted fake gh. */
function fixture({ allowlist = ['Ghost233'], script = {}, repos = [REPO_CFG] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-gh-'))
  const store = new Store(dir)
  const registry = new OwnerRegistry(store, { scratchRoot: join(dir, 'scratch') })
  registry.ensureChief({ cwd: '/Volumes/home', workspace: 'Ghost233HomeRepo' })
  registry.create({ kind: 'repo', workspace: 'DSH-Workflow', cwd: '/Volumes/home/DSH-Workflow' })
  let nowMs = Date.parse('2026-11-15T00:00:00.000Z')
  const calls = { create: [], prompt: [] }
  const sessions = {
    create: async request => { calls.create.push(request); return { sessionId: 'session-' + calls.create.length } },
    prompt: async request => { calls.prompt.push(request); return { accepted: true } },
  }
  const router = new Router({ store, registry, sessions, now: () => new Date(nowMs).toISOString() })
  const { gh, posts } = fakeGh(script)
  const config = { enabled: true, intervalMs: 300000, loginAllowlist: allowlist, mentionHandle: '@hub-bot', repos }
  const source = new GitHubSource({ store, registry, router, sessions, config, logger: { info() {}, warn() {} }, gh, now: () => new Date(nowMs).toISOString() })
  return {
    source, registry, router, store, calls, posts, script, gh,
    triggers: () => store.db.prepare('SELECT value FROM trigger').all().map(r => JSON.parse(String(r.value))),
    tickets: () => store.db.prepare('SELECT value FROM ticket').all().map(r => JSON.parse(String(r.value))),
    outbox: () => store.db.prepare('SELECT value FROM outbox ORDER BY rowid').all().map(r => JSON.parse(String(r.value))),
    cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }) },
  }
}

test('config: the github section validates and defaults disabled with 5min polling', () => {
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y', github: 'x' }), /config\.github must be an object/)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y', github: { nope: 1 } }), /does not know config\.github key/)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y', github: { intervalMs: 1000 } }), /intervalMs/)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y', github: { repos: [{ repo: 'no-slash', workspace: 'w', cwd: '/tmp/w' }] } }), /owner\/name/)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y', github: { repos: [{ repo: 'a/b', workspace: 'w', cwd: 'relative' }] } }), /cwd/)
  assert.deepEqual(resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y' }).github, { enabled: false, intervalMs: 300000, loginAllowlist: [], repos: [] })
  const on = resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y', github: { enabled: true, repos: [{ repo: 'a/b', workspace: 'b', cwd: '/tmp/b' }] } })
  assert.equal(on.github.repos[0].enabled, true, '逐仓库监听开关默认全开')
})

test('the first poll of a repo records ONLY the watermark — 存量不触发', async () => {
  const f = fixture({ script: { ['repos/' + REPO + '/issues']: [issue({ number: 40 }), issue({ number: 41 })] } })
  try {
    const result = await f.source.pollAll()
    assert.equal(result.triggered, 0, 'existing backlog never triggers')
    assert.equal(f.calls.prompt.length, 0)
    const wm = JSON.parse(readFileSync(watermarkPath(f.store.stateDir), 'utf8'))
    assert.equal(wm.repos[REPO].maxNumber, 41)
    assert.equal(wm.repos[REPO].initialized, true)
  } finally { f.cleanup() }
})

test('a new issue above the watermark: ack recorded with the badge, routed to the repo owner with the source mark; re-poll dedups', async () => {
  const f = fixture({ script: { ['repos/' + REPO + '/issues']: [issue({ number: 41 })] } })
  try {
    await f.source.pollAll() // watermark at 41
    assert.equal(f.calls.prompt.length, 0)
    f.script['repos/' + REPO + '/issues'] = [issue({ number: 41 }), issue({ number: 42 })]
    const result = await f.source.pollAll()
    assert.equal(result.triggered, 1)
    assert.equal(f.calls.prompt.length, 1)
    const injected = f.calls.prompt[0].text
    assert.ok(injected.includes('[hub-bot github ' + REPO + '#42]'), 'source mark (同飞书机制)')
    assert.ok(injected.includes('修一下登录重试'))
    assert.ok(injected.includes("reply_source to='github:" + REPO + ":42'"), 'the reply channel address travels with the message')
    assert.ok(injected.includes('永不直推主分支'), '永不直推主分支 travels with the task')
    assert.ok(injected.includes('powered_by-dsh'), 'the badge requirement travels with the task')
    const trigger = f.triggers().find(t => t.id === 'github:' + REPO + ':issue:42')
    assert.ok(trigger, 'router trigger row carries the triggerRef')
    assert.equal(trigger.authorization.source, 'github')
    assert.equal(trigger.authorization.actor, 'Ghost233')
    const ticket = f.tickets().find(t => t.triggerId === 'github:' + REPO + ':issue:42')
    assert.ok(ticket, 'ticket 落库（先存后做）')
    assert.equal(ticket.owner, 'repo-DSH-Workflow')
    const ack = f.outbox().find(r => r.kind === 'reply' && r.to === 'github:' + REPO + ':42')
    assert.ok(ack && ack.state === 'recorded', 'ack 先存后做 (recorded intent)')
    assert.ok(ack.body.includes('已受理'), 'ack 一句话回 Issue')
    assert.ok(ack.body.includes(DSH_BADGE), 'ack carries the dsh-badge')
    const second = await f.source.pollAll()
    assert.equal(second.triggered, 0, '重放/再轮询去重 (triggerRef 幂等)')
    assert.equal(f.calls.prompt.length, 1)
  } finally { f.cleanup() }
})

test('non-allowlisted authors are recorded but never processed (login 白名单)', async () => {
  const f = fixture()
  try {
    const result = await f.source.handleIssueEvent(issue({ number: 42, login: 'stranger' }), REPO_CFG)
    assert.equal(result.dropped, 'not-allowlisted')
    assert.equal(f.calls.prompt.length, 0)
    const rec = f.triggers().find(t => t.kind === 'github-dropped' && t.number === 42)
    assert.ok(rec && rec.dropped === 'not-allowlisted', '只记录不处理')
    assert.ok(!f.outbox().some(r => r.to === 'github:' + REPO + ':42'), 'no ack for strangers')
  } finally { f.cleanup() }
})

test('bot:ignore-labeled issues are recorded but never processed (随手记想法)', async () => {
  const f = fixture()
  try {
    const result = await f.source.handleIssueEvent(issue({ number: 42, labels: ['bug', 'bot:ignore'] }), REPO_CFG)
    assert.equal(result.dropped, 'bot-ignore')
    assert.equal(f.calls.prompt.length, 0)
    assert.ok(f.triggers().some(t => t.kind === 'github-dropped' && t.dropped === 'bot-ignore'))
  } finally { f.cleanup() }
})

test('a new PR routes with the initial-review instruction (摘要+风险点)', async () => {
  const f = fixture()
  try {
    const result = await f.source.handleIssueEvent(issue({ number: 77, title: '登录重试修复', pr: true }), REPO_CFG)
    assert.equal(result.routed, true)
    assert.equal(f.calls.prompt.length, 1)
    const injected = f.calls.prompt[0].text
    assert.ok(injected.includes('[hub-bot github ' + REPO + '#77] 新 PR'), 'PR kind in the mark')
    assert.ok(injected.includes('摘要'), '初审指令: 摘要')
    assert.ok(injected.includes('风险'), '初审指令: 风险点')
    assert.ok(f.triggers().some(t => t.id === 'github:' + REPO + ':pr:77'))
  } finally { f.cleanup() }
})

test('a comment 停 from an allowlisted author terminates the task (让位于人) and notifies the chief', async () => {
  const f = fixture()
  try {
    const routed = await f.source.handleIssueEvent(issue({ number: 42 }), REPO_CFG)
    const ticketId = routed.ticketId
    const result = await f.source.handleCommentEvent(comment({ body: '停', issueNumber: 42 }), REPO_CFG)
    assert.equal(result.terminated, ticketId)
    const ticket = f.router.tasks.getTicket(ticketId)
    assert.equal(ticket.stage, 'failed', '任务终止（terminal，人可再用消息释放）')
    assert.ok(String(ticket.failed.reason).includes('停'), '终止原因落票面')
    const notice = f.outbox().find(r => r.kind === 'reply' && r.to === 'dsh' && r.body.includes('已终止'))
    assert.ok(notice, 'chief 得到终止通知（汇报链统一出口）')
  } finally { f.cleanup() }
})

test('a non-allowlisted comment is recorded-only; a normal comment on a tracked issue follows up the same task', async () => {
  const f = fixture()
  try {
    const routed = await f.source.handleIssueEvent(issue({ number: 42 }), REPO_CFG)
    const before = f.calls.prompt.length
    const stranger = await f.source.handleCommentEvent(comment({ id: 6001, body: '停', login: 'stranger', issueNumber: 42 }), REPO_CFG)
    assert.equal(stranger.dropped, 'not-allowlisted', '非白名单评论无权喊停')
    assert.equal(f.calls.prompt.length, before)
    const follow = await f.source.handleCommentEvent(comment({ id: 6002, body: '补充：重试间隔要指数退避', issueNumber: 42 }), REPO_CFG)
    assert.equal(follow.followedUp, routed.ticketId, '归入已有任务')
    assert.equal(f.calls.prompt.length, before + 1)
    assert.ok(f.calls.prompt[before].text.includes('指数退避'))
    assert.ok(!f.triggers().some(t => t.id === 'github:' + REPO + ':issue:42' && t.kind === 'route' && t.at !== undefined && f.triggers().filter(x => x.id === t.id).length > 1), 'follow-up 不产生新 Trigger')
  } finally { f.cleanup() }
})

test('an @-mention comment on an untracked issue becomes a new trigger (mention 寻址)', async () => {
  const f = fixture()
  try {
    const result = await f.source.handleCommentEvent(comment({ body: '@hub-bot 看一下这个', issueNumber: 55 }), REPO_CFG)
    assert.equal(result.routed, true)
    const injected = f.calls.prompt[0].text
    assert.ok(injected.includes('[hub-bot github ' + REPO + '#55]'), 'source mark')
    const trigger = f.triggers().find(t => t.kind === 'route')
    assert.equal(trigger.authorization.addressing, 'mention')
  } finally { f.cleanup() }
})

test('source closed / PR merged → the task is terminated and the chief notified (源头关闭即终止)', async () => {
  const f = fixture()
  try {
    const issueRouted = await f.source.handleIssueEvent(issue({ number: 42 }), REPO_CFG)
    const prRouted = await f.source.handleIssueEvent(issue({ number: 77, pr: true }), REPO_CFG)
    f.script['repos/' + REPO + '/issues/42'] = { state: 'closed' }
    f.script['repos/' + REPO + '/issues/77'] = { state: 'closed', pull_request: { url: 'x' } }
    f.script['repos/' + REPO + '/pulls/77'] = { merged_at: '2026-11-15T02:00:00Z' }
    const result = await f.source.checkClosures(REPO_CFG)
    assert.deepEqual(result.terminated.sort(), [issueRouted.ticketId, prRouted.ticketId].sort())
    assert.equal(f.router.tasks.getTicket(issueRouted.ticketId).stage, 'failed')
    assert.ok(String(f.router.tasks.getTicket(prRouted.ticketId).failed.reason).includes('合并'), 'PR 合并原因落票面')
    const notices = f.outbox().filter(r => r.kind === 'reply' && r.to === 'dsh' && r.body.includes('已终止'))
    assert.equal(notices.length, 2, '两条终止通知')
  } finally { f.cleanup() }
})

test('deliverReplies posts recorded github replies as real comments with the badge; failures follow the 5-strike discipline', async () => {
  const f = fixture()
  try {
    const { insertOutbox } = await import('../src/outbox.js')
    insertOutbox(f.store, { ticketId: null, kind: 'reply', to: 'github:' + REPO + ':42', body: '进展：已定位到重试逻辑', state: 'recorded', requestId: 'r-gh-1' })
    const first = await f.source.deliverReplies()
    assert.equal(first.delivered, 1)
    assert.equal(f.posts.length, 1)
    const posted = f.posts[0].join(' ')
    assert.ok(posted.includes('repos/' + REPO + '/issues/42/comments'), 'POST 到该 issue 的评论端点')
    assert.ok(posted.includes('进展：已定位到重试逻辑'))
    assert.ok(posted.includes('powered_by-dsh'), '缺 badge 的 body 由代码补上')
    const row = f.outbox().find(r => r.requestId === 'r-gh-1')
    assert.equal(row.state, 'sent', '真实送达才标 sent')
    assert.ok(row.sentAt)
  } finally { f.cleanup() }
})

test('deliverReplies failures: recorded stays recorded with feishuAttempts-style counter; five failures fail the row + system problem', async () => {
  const f = fixture()
  f.source.gh = async () => { throw new Error('HTTP 403') }
  try {
    const { insertOutbox } = await import('../src/outbox.js')
    const row = insertOutbox(f.store, { ticketId: null, kind: 'reply', to: 'github:' + REPO + ':42', body: 'x', state: 'recorded', requestId: 'r-gh-2' })
    for (let i = 0; i < 4; i++) await f.source.deliverReplies()
    let stored = f.outbox().find(r => r.id === row.id)
    assert.equal(stored.state, 'recorded')
    assert.equal(stored.githubAttempts, 4)
    await f.source.deliverReplies()
    stored = f.outbox().find(r => r.id === row.id)
    assert.equal(stored.state, 'failed')
    assert.equal(f.outbox().filter(r => r.kind === 'system-problem').length, 1)
  } finally { f.cleanup() }
})

test('watermarks persist across source instances — 重启不重放', async () => {
  const script = { ['repos/' + REPO + '/issues']: [issue({ number: 41 })] }
  const f1 = fixture({ script })
  let dir
  try {
    await f1.source.pollAll()
    dir = f1.store.stateDir
    script['repos/' + REPO + '/issues'] = [issue({ number: 41 }), issue({ number: 42 })]
    const registry2 = new OwnerRegistry(f1.store, { scratchRoot: join(dir, 'scratch') })
    const sessions2 = { create: async () => ({ sessionId: 'session-r2' }), prompt: async () => ({ accepted: true }) }
    const router2 = new Router({ store: f1.store, registry: registry2, sessions: sessions2, now: () => new Date().toISOString() })
    const restarted = new GitHubSource({ store: f1.store, registry: registry2, router: router2, sessions: sessions2, config: f1.source.config, logger: { info() {}, warn() {} }, gh: f1.gh })
    assert.equal(restarted.status().repos[REPO].maxNumber, 41, '水位线从落盘恢复')
    const result = await restarted.pollAll()
    assert.equal(result.triggered, 1, '只触发水位线之后的新事件（#42，#41 不重放）')
    assert.ok(!f1.triggers().some(t => t.id === 'github:' + REPO + ':issue:41'), '#41 never triggered')
  } finally { f1.cleanup() }
})

test('status() reports per-repo watermark, enabled flags, and the polling interval', async () => {
  const f = fixture({ script: { ['repos/' + REPO + '/issues']: [issue({ number: 41 })] } })
  try {
    await f.source.pollAll()
    const status = f.source.status()
    assert.equal(status.enabled, true)
    assert.equal(status.intervalMs, 300000)
    assert.equal(status.loginAllowlist[0], 'Ghost233')
    assert.equal(status.repos[REPO].enabled, true)
    assert.equal(status.repos[REPO].maxNumber, 41)
  } finally { f.cleanup() }
})

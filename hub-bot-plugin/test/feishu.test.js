/**
 * FeishuSource (issue #68 飞书入口): normalization of im.message.receive_v1 events, plugin-owned source marks,
 * the allowlist / mention policy, the recorded-outbox reply channel (P1-2 honest intents actually sent), and
 * credential persistence (0600). Tested with an injected fake lark SDK — no network.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store.js'
import { OwnerRegistry } from '../src/registry.js'
import { Router } from '../src/router.js'
import { FeishuSource, credentialPath } from '../src/feishu.js'
import { insertOutbox } from '../src/outbox.js'
import { resolveConfig } from '../src/config.js'

/** A registry+router+source with fake sessions and a fake lark SDK; sent messages land in sent. */
function fixture({ allowlist = ['ou_me'], botOpenId = 'ou_bot', larkOverrides = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-feishu-'))
  const store = new Store(dir)
  const registry = new OwnerRegistry(store, { scratchRoot: join(dir, 'scratch') })
  registry.ensureChief({ cwd: '/Volumes/home', workspace: 'Ghost233HomeRepo' })
  let nowMs = Date.parse('2026-11-15T00:00:00.000Z')
  const calls = { create: [], prompt: [] }
  const sessions = {
    create: async request => { calls.create.push(request); return { sessionId: 'session-chief-' + calls.create.length } },
    prompt: async request => { calls.prompt.push(request); return { accepted: true } },
  }
  const router = new Router({ store, registry, sessions, now: () => new Date(nowMs).toISOString() })
  const sent = []
  const fakeLark = {
    client: {
      im: { message: { create: async req => { sent.push(req); return { code: 0 } } } },
      request: async req => ({ code: 0, data: {} }),
    },
    registerApp: async () => ({ client_id: 'cli_new', client_secret: 'secret_new' }),
    ...larkOverrides,
  }
  const source = new FeishuSource({
    store, registry, sessions,
    config: { openIdAllowlist: allowlist, botOpenId },
    logger: { info() {}, warn() {} },
    lark: fakeLark,
    now: () => new Date(nowMs).toISOString(),
  })
  return {
    source, registry, store, calls, sent, fakeLark,
    advance: ms => { nowMs += ms },
    cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }) },
  }
}

/** One im.message.receive_v1 event. */
function event({ messageId = 'om_1', chatId = 'oc_1', openId = 'ou_me', chatType = 'p2p', msgType = 'text', text = '继续 DSH-Workflow 的工单', mentions = [], senderType = 'user' } = {}) {
  return {
    sender: { sender_id: { open_id: openId }, sender_type: senderType },
    message: {
      message_id: messageId, chat_id: chatId, chat_type: chatType, message_type: msgType,
      content: msgType === 'text' ? JSON.stringify({ text }) : JSON.stringify({}),
      mentions,
    },
  }
}

test('config: the feishu section is validated (keys, allowlist shape) and defaults disabled', () => {
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y', feishu: 'x' }), /config\.feishu must be an object/)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y', feishu: { nope: 1 } }), /does not know config\.feishu key/)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y', feishu: { openIdAllowlist: 'ou_me' } }), /openIdAllowlist/)
  const resolved = resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y' })
  assert.deepEqual(resolved.feishu, { enabled: false, openIdAllowlist: [] })
  const on = resolveConfig({ stateDir: '/tmp/x', homeRepo: '/tmp/y', feishu: { enabled: true, openIdAllowlist: ['ou_me'] } })
  assert.equal(on.feishu.enabled, true)
  assert.deepEqual(on.feishu.openIdAllowlist, ['ou_me'])
})

test('a p2p text message is normalized, recorded as a Trigger, and injected into L1 with a plugin-owned source mark', async () => {
  const { source, registry, calls, cleanup } = fixture()
  try {
    await source.handleEvent(event())
    assert.equal(calls.prompt.length, 1)
    const injected = calls.prompt[0]
    assert.ok(injected.text.startsWith('[hub-bot 飞书 oc_1/om_1]'), 'source mark heads the injection (task-1 遗留: distinguishable from hand-typed input)')
    assert.ok(injected.text.includes('继续 DSH-Workflow 的工单'))
    assert.ok(injected.text.includes("reply_source to='feishu:chat:oc_1'"), 'the reply channel address travels with the message')
    const chief = registry.get('chief')
    assert.equal(injected.sessionId, chief.sessionId, 'injected into the chief (L1) session')
    const trigger = JSON.parse(String(source.store.db.prepare('SELECT value FROM trigger WHERE id = ?').get('feishu-om_1').value))
    assert.equal(trigger.kind, 'feishu')
    assert.equal(trigger.source.kind, 'feishu')
    assert.equal(trigger.source.addressing, 'direct')
    assert.deepEqual(trigger.authorization, { actor: 'ou_me', source: 'feishu', addressing: 'direct', messageId: 'om_1', at: trigger.authorization.at })
  } finally { cleanup() }
})

test('bot-own messages are dropped (spec: 丢弃 bot 自己的消息)', async () => {
  const { source, calls, cleanup } = fixture()
  try {
    await source.handleEvent(event({ senderType: 'app' }))
    assert.equal(calls.prompt.length, 0)
  } finally { cleanup() }
})

test('non-allowlisted senders are recorded but never processed (spec: 白名单)', async () => {
  const { source, calls, cleanup } = fixture()
  try {
    await source.handleEvent(event({ openId: 'ou_stranger', messageId: 'om_2' }))
    assert.equal(calls.prompt.length, 0, 'never reaches a session')
    const row = source.store.db.prepare('SELECT value FROM trigger WHERE id = ?').get('feishu-om_2')
    const trigger = JSON.parse(String(row.value))
    assert.equal(trigger.dropped, 'not-allowlisted')
  } finally { cleanup() }
})

test('group chat: only messages mentioning the bot become requests (spec: 群聊 @bot)', async () => {
  const { source, calls, cleanup } = fixture()
  try {
    await source.handleEvent(event({ messageId: 'om_3', chatType: 'group', text: '随便聊聊' }))
    assert.equal(calls.prompt.length, 0)
    const droppedRow = source.store.db.prepare('SELECT value FROM trigger WHERE id = ?').get('feishu-om_3')
    assert.equal(JSON.parse(String(droppedRow.value)).dropped, 'no-mention')
    await source.handleEvent(event({
      messageId: 'om_4', chatType: 'group', text: '@_user_1 查一下工单',
      mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' }, name: 'hub-bot' }],
    }))
    assert.equal(calls.prompt.length, 1)
    assert.ok(calls.prompt[0].text.includes('查一下工单'), 'the mention placeholder is stripped')
    assert.ok(calls.prompt[0].text.includes('群聊 @bot'), 'addressing surfaces as mention in the source mark')
    const mentionTrigger = JSON.parse(String(source.store.db.prepare('SELECT value FROM trigger WHERE id = ?').get('feishu-om_4').value))
    assert.equal(mentionTrigger.source.addressing, 'mention')
  } finally { cleanup() }
})

test('non-text messages get the recorded-reply 暂不支持该消息类型', async () => {
  const { source, calls, store, cleanup } = fixture()
  try {
    await source.handleEvent(event({ messageId: 'om_5', msgType: 'image' }))
    assert.equal(calls.prompt.length, 0, 'nothing injected into a session')
    const rows = store.db.prepare('SELECT value FROM outbox').all().map(r => JSON.parse(String(r.value)))
    const reply = rows.find(r => r.kind === 'reply' && r.to === 'feishu:chat:oc_1')
    assert.ok(reply, 'a reply intent was stored first (先存后做)')
    assert.equal(reply.state, 'recorded')
    assert.equal(reply.body, '暂不支持该消息类型')
  } finally { cleanup() }
})

test('a replayed message id is deduped by its Trigger id (重启不重放事件)', async () => {
  const { source, calls, cleanup } = fixture()
  try {
    await source.handleEvent(event())
    await source.handleEvent(event())
    assert.equal(calls.prompt.length, 1)
  } finally { cleanup() }
})

test('deliverReplies sends recorded feishu intents and marks them sent only on real delivery', async () => {
  const { source, store, sent, cleanup } = fixture()
  try {
    insertOutbox(store, { ticketId: null, kind: 'reply', to: 'feishu:chat:oc_9', body: '工单已验收', state: 'recorded', requestId: 'hub-bot-reply-x' })
    await source.deliverReplies()
    assert.equal(sent.length, 1)
    assert.equal(sent[0].params.receive_id_type, 'chat_id')
    assert.equal(sent[0].data.receive_id, 'oc_9')
    assert.equal(sent[0].data.msg_type, 'text')
    assert.deepEqual(JSON.parse(sent[0].data.content), { text: '工单已验收' })
    const stored = store.db.prepare('SELECT value FROM outbox').all().map(r => JSON.parse(String(r.value)))[0]
    assert.equal(stored.state, 'sent')
    assert.ok(stored.sentAt)
  } finally { cleanup() }
})

test('deliverReplies leaves failures recorded with an attempt counter; five failures fail the row and report a system problem', async () => {
  const { source, store, cleanup } = fixture({
    larkOverrides: { client: { im: { message: { create: async () => { throw new Error('HTTP 429') } } }, request: async () => ({ code: 0 }) } },
  })
  try {
    const row = insertOutbox(store, { ticketId: null, kind: 'reply', to: 'feishu:chat:oc_9', body: 'x', state: 'recorded', requestId: 'r1' })
    for (let i = 0; i < 4; i++) await source.deliverReplies()
    let stored = store.db.prepare('SELECT value FROM outbox WHERE id = ?').all(row.id).map(r => JSON.parse(String(r.value)))[0]
    assert.equal(stored.state, 'recorded')
    assert.equal(stored.feishuAttempts, 4)
    await source.deliverReplies()
    stored = store.db.prepare('SELECT value FROM outbox WHERE id = ?').all(row.id).map(r => JSON.parse(String(r.value)))[0]
    assert.equal(stored.state, 'failed')
    const problems = store.db.prepare('SELECT value FROM outbox').all().map(r => JSON.parse(String(r.value))).filter(r => r.kind === 'system-problem')
    assert.equal(problems.length, 1)
  } finally { cleanup() }
})

test('credentials persist with mode 0600 and reload; status reports missing/ok', async () => {
  const { source, store, cleanup } = fixture()
  try {
    assert.equal(source.status().credentialState, 'missing')
    source.saveCredentials({ appId: 'cli_1', appSecret: 's_1' })
    const file = credentialPath(store.stateDir)
    assert.equal(statSync(file).mode & 0o777, 0o600, 'credential file is owner-only')
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { appId: 'cli_1', appSecret: 's_1' })
    assert.equal(source.status().credentialState, 'ok')
  } finally { cleanup() }
})

test('register() runs the device flow: QR surfaced, credentials saved 0600, event-mode patch attempted (未验证)', async () => {
  const calls = { patch: [] }
  const { source, store, cleanup } = fixture({
    larkOverrides: {
      registerApp: async options => {
        options.onQRCodeReady({ url: 'https://accounts.feishu.cn/scan?x=1', expireIn: 300 })
        return { client_id: 'cli_new', client_secret: 'secret_new' }
      },
      client: {
        im: { message: { create: async () => ({ code: 0 }) } },
        request: async req => { calls.patch.push(req); return { code: 0, data: {} } },
      },
      WSClient: class { async start() {} close() {} },
      EventDispatcher: class { register() { return this } },
    },
  })
  try {
    const flow = source.register()
    const result = await flow
    assert.equal(result.appId, 'cli_new')
    assert.equal(source.lastQr.url, 'https://accounts.feishu.cn/scan?x=1')
    assert.equal(statSync(credentialPath(store.stateDir)).mode & 0o777, 0o600)
    assert.equal(calls.patch.length, 1, 'event-subscription mode auto-config attempted once')
    assert.ok(String(calls.patch[0].url).includes('application'), 'application-config patch')
  } finally { cleanup() }
})

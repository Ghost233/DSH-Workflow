/**
 * FeishuSource — the Feishu entry (issue #68, spec「飞书接入」).
 *
 * 扫码一键建应用: register() drives @larksuiteoapi/node-sdk's lark.registerApp() (OAuth 2.0 Device
 * Authorization Grant, RFC 8628): the QR url surfaces via status()/devApi for the panel; once the user
 * confirms on the phone, client_id/client_secret persist to <stateDir>/feishu-credentials.json (mode 0600)
 * and the WSClient long connection starts. The event-subscription MODE (long-connection vs webhook) is a
 * sensitive setting addons cannot carry, so after credentials land the plugin calls the application-config
 * patch OpenAPI once — 未对真实 API 验证: on failure the plugin logs a manual-fallback warning and continues
 * (the WSClient simply receives nothing until the mode is set by hand).
 *
 * 消息通道: WSClient im.message.receive_v1 events normalize into Triggers (id feishu-<messageId>, dedup on
 * replay — 重启不重放) and inject the L1 chief Session with a plugin-owned source mark
 * ([hub-bot 飞书 <chatId>/<messageId>]) so channel input is distinguishable from hand-typed input (task-1
 * 遗留). Policy in code: the bot's own messages are dropped; senders outside config.feishu.openIdAllowlist
 * are recorded-and-dropped; group messages count only when they @ the bot; non-text gets the recorded reply
 * 暂不支持该消息类型.
 *
 * 回复回投: L1's reply_source to 'feishu:chat:<chatId>' rows sit recorded in the outbox (阶段 2 P1-2 的
 * 诚实意图); deliverReplies() — driven by the plugin's 1s tick — actually sends them via im.message.create
 * and only then marks them sent. Failures keep the row recorded with feishuAttempts++; five consecutive
 * failures fail the row and report a system problem (same discipline as the OutboxRunner).
 */
import { writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { insertOutbox, deliverRecordedReplies } from './outbox.js'

/** The reply never pretends: this exact sentence answers every non-text message (spec「非文本」). */
export const UNSUPPORTED_MESSAGE_TYPE = '暂不支持该消息类型'

/** The injection source mark prefix (plugin-owned — channel input vs hand-typed input are distinguishable). */
export const FEISHU_SOURCE_MARK = '[hub-bot 飞书 '

/** Where the registerApp device flow persists the app credentials (owner-read-only). */
export function credentialPath(stateDir) {
  return join(stateDir, 'feishu-credentials.json')
}

/** Consecutive feishu send failures before a recorded intent fails out and reports a system problem. */
const MAX_FEISHU_ATTEMPTS = 5

export class FeishuSource {
  /**
   * @param {{ store: import('./store.js').Store, registry: import('./registry.js').OwnerRegistry,
   *   sessions: { create: Function, prompt: Function }, config: object, logger: { info: Function, warn: Function },
   *   lark?: object, now?: () => string }} deps - lark is the SDK surface ({ registerApp, Client, WSClient,
   *   EventDispatcher }) or a test fake; when absent, connect()/register() load the real SDK lazily.
   */
  constructor({ store, registry, sessions, config, logger, lark, now }) {
    this.store = store
    this.registry = registry
    this.sessions = sessions
    this.config = config ?? {}
    this.logger = logger
    this.lark = lark ?? null
    this.now = now ?? (() => new Date().toISOString())
    this.lastQr = null
    this.credentialState = 'missing'
    this.wsState = 'off'
    this.client = null
    this.ws = null
    this.#reloadCredentials()
  }

  /** Lazily loads the real SDK so the plugin starts (and unit-tests) without the dependency installed. */
  async #sdk() {
    if (this.lark) return this.lark
    this.lark = await import('@larksuiteoapi/node-sdk')
    return this.lark
  }

  #reloadCredentials() {
    const file = credentialPath(this.store.stateDir)
    if (existsSync(file)) {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8'))
        if (parsed && typeof parsed.appId === 'string' && typeof parsed.appSecret === 'string') {
          this.credentials = parsed
          this.credentialState = 'ok'
          return
        }
      } catch { /* fall through to invalid */ }
      this.credentials = null
      this.credentialState = 'invalid'
      return
    }
    // Manual fallback: config-provided credentials (凭据失效人工降级 — the file written by registerApp wins).
    if (typeof this.config.appId === 'string' && typeof this.config.appSecret === 'string') {
      this.credentials = { appId: this.config.appId, appSecret: this.config.appSecret }
      this.credentialState = 'ok'
      return
    }
    this.credentials = null
    this.credentialState = 'missing'
  }

  /** Persists credentials owner-read-only (0600) and refreshes the in-memory state. */
  saveCredentials({ appId, appSecret }) {
    const file = credentialPath(this.store.stateDir)
    writeFileSync(file, JSON.stringify({ appId, appSecret }, null, 2) + '\n', { mode: 0o600 })
    chmodSync(file, 0o600) // an existing file keeps its wider mode on rewrite without this
    this.#reloadCredentials()
  }

  /** The panel-facing health view (spec「系统健康吗」): credentialState invalid = 提示重新扫码. */
  status() {
    return {
      enabled: this.config.enabled === true,
      credentialState: this.credentialState,
      wsState: this.wsState,
      registration: this.registering ? 'pending' : undefined,
      qr: this.lastQr ?? undefined,
      botOpenId: this.config.botOpenId ?? undefined,
      allowlist: this.config.openIdAllowlist ?? [],
    }
  }

  /**
   * The scan-to-create flow (spec: registerApp 一键创建). Resolves once the user confirms; the QR link is
   * visible via status().qr while pending. Permission addon principle: 一次性全部申请 (im:message:send_as_bot,
   * im:message, im:chat:readonly + im.message.receive_v1).
   */
  async register() {
    const lark = await this.#sdk()
    this.registering = true
    this.lastQr = null
    try {
      const result = await lark.registerApp({
        createOnly: true, // 只允许创建新应用，避免误覆盖已有应用
        appPreset: { name: 'DSH 中枢 Bot', desc: 'DSH 会话远程触发与状态查询' },
        addons: {
          preset: true,
          scopes: { tenant: ['im:message:send_as_bot', 'im:message', 'im:chat:readonly'] },
          events: { items: { tenant: ['im.message.receive_v1'] } },
        },
        onQRCodeReady: info => { this.lastQr = { url: info.url, expireIn: info.expireIn } },
      })
      this.saveCredentials({ appId: result.client_id, appSecret: result.client_secret })
      await this.#configureEventMode()
      await this.connect()
      return { appId: result.client_id }
    } finally {
      this.registering = false
    }
  }

  /**
   * Event-subscription mode auto-config (spec: 创建后调 application-config patch 设为长连接).
   * 未对真实 API 验证 — the endpoint/payload follow the application-v7 patch doc; on failure the plugin logs
   * a manual-fallback warning and continues (手工降级: set 长连接 in the developer console once).
   */
  async #configureEventMode() {
    const client = await this.#client()
    try {
      await client.request({
        method: 'PATCH',
        url: 'https://open.feishu.cn/open-apis/application/v7/application-config',
        data: { event_subscription: { mode: 'long_connection' } },
      })
      this.logger.info('hub-bot feishu: event-subscription mode set to long_connection (未对真实 API 验证)')
    } catch (error) {
      this.logger.warn('hub-bot feishu: event-mode auto-config failed (%s) — 手工降级: set 长连接 in the developer console once', error?.message ?? error)
    }
  }

  /** The authenticated REST client (created once credentials exist). */
  async #client() {
    if (this.client) return this.client
    const lark = await this.#sdk()
    // A pre-built client wins (tests, or a caller that already constructed one) — no credentials needed then.
    const prebuilt = this.config.client ?? lark.client ?? null
    if (prebuilt) { this.client = prebuilt; return this.client }
    if (!this.credentials) throw new Error('hub-bot feishu: no credentials — run register() first')
    this.client = new lark.Client({ appId: this.credentials.appId, appSecret: this.credentials.appSecret })
    return this.client
  }

  /** Starts the WSClient long connection (主动连接，无需公网回调). Idempotent. */
  async connect() {
    if (this.ws) return { started: false, reason: 'already-connected' }
    const lark = await this.#sdk()
    if (!this.credentials) throw new Error('hub-bot feishu: no credentials — run register() first')
    const client = await this.#client()
    const WSClient = lark.WSClient
    const EventDispatcher = lark.EventDispatcher
    if (typeof WSClient !== 'function' || typeof EventDispatcher !== 'function') {
      this.logger.warn('hub-bot feishu: SDK without WSClient/EventDispatcher — long connection skipped (手工降级)')
      return { started: false, reason: 'sdk-incomplete' }
    }
    this.ws = new WSClient({ appId: this.credentials.appId, appSecret: this.credentials.appSecret })
    const dispatcher = new EventDispatcher({}).register({
      'im.message.receive_v1': async data => {
        try { await this.handleEvent(data) } catch (error) { this.logger.warn('hub-bot feishu: event handling failed: %s', error?.message ?? error) }
      },
    })
    try {
      await this.ws.start({ eventDispatcher: dispatcher })
      this.wsState = 'connected'
    } catch (error) {
      this.ws = null
      this.wsState = 'error'
      // 凭据失效: surface it for the panel (系统健康吗) — the user re-scans.
      if (/401|99991663|99991664|invalid.*credential|app.*ticket/i.test(String(error?.message ?? error))) {
        this.credentialState = 'invalid'
      }
      throw error
    }
    return { started: true }
  }

  /** Stops the long connection (dispose path). */
  async disconnect() {
    if (this.ws) { try { this.ws.close?.() } catch { /* best effort */ } this.ws = null }
    this.wsState = 'off'
  }

  /**
   * One normalized inbound message: { messageId, chatId, chatType, openId, msgType, text, addressing, mentions }.
   * addressing: 'direct' (p2p) | 'mention' (group @bot) | null (not addressed to us).
   */
  normalize(raw) {
    const message = raw?.message ?? {}
    const sender = raw?.sender ?? {}
    const openId = sender.sender_id?.open_id
    const chatType = message.chat_type === 'group' ? 'group' : 'p2p'
    const mentions = Array.isArray(message.mentions) ? message.mentions : []
    let text = null
    if (message.message_type === 'text') {
      try {
        const parsed = JSON.parse(message.content ?? '{}')
        text = typeof parsed.text === 'string' ? parsed.text : ''
        // Mention placeholders (@_user_1) are stripped — the reading is the plain instruction text.
        for (const m of mentions) if (m?.key) text = text.split(m.key).join('')
        text = text.trim()
      } catch { text = null }
    }
    const botOpenId = this.config.botOpenId
    const mentioned = botOpenId ? mentions.some(m => m?.id?.open_id === botOpenId) : mentions.length > 0
    const addressing = chatType === 'p2p' ? 'direct' : (mentioned ? 'mention' : null)
    return {
      messageId: message.message_id, chatId: message.chat_id, chatType,
      openId, senderType: sender.sender_type, msgType: message.message_type, text, addressing,
    }
  }

  /** The Trigger row id doubles as the dedup key: feishu-<messageId>. */
  #triggerId(messageId) {
    return 'feishu-' + messageId
  }

  #insertTrigger(row) {
    this.store.db.prepare('INSERT INTO trigger (id, value, at) VALUES (?, ?, ?)').run(row.id, JSON.stringify(row), row.at)
    return row
  }

  /**
   * The im.message.receive_v1 handler: normalize → Policy in code (bot-self drop, allowlist, group-mention,
   * non-text reply) → Trigger 落库 → inject the L1 chief Session with the plugin-owned source mark.
   */
  async handleEvent(raw) {
    const msg = this.normalize(raw)
    if (!msg.messageId || !msg.chatId) return { dropped: 'malformed' }
    if (msg.senderType !== 'user') return { dropped: 'bot-self' } // 丢弃 bot 自己的消息
    const at = this.now()
    const triggerId = this.#triggerId(msg.messageId)
    const existing = this.store.db.prepare('SELECT value FROM trigger WHERE id = ?').get(triggerId)
    if (existing) return { deduped: true } // 重启不重放事件
    // 只记录不处理: everything dropped still lands as a Trigger so the record can say exactly what happened.
    const record = (extra) => this.#insertTrigger({
      id: triggerId, kind: 'feishu', message: msg.text ?? '(non-text ' + msg.msgType + ')',
      source: { kind: 'feishu', chatId: msg.chatId, messageId: msg.messageId, openId: msg.openId, addressing: msg.addressing ?? 'none' },
      at, ...extra,
    })
    if (!(this.config.openIdAllowlist ?? []).includes(msg.openId)) {
      record({ dropped: 'not-allowlisted' })
      return { dropped: 'not-allowlisted' }
    }
    if (msg.addressing === null) {
      record({ dropped: 'no-mention' }) // 群聊中未 @bot 的消息不成为任务
      return { dropped: 'no-mention' }
    }
    if (msg.msgType !== 'text' || !msg.text) {
      record({ dropped: 'unsupported-type', msgType: msg.msgType })
      // 先存后做: the 暂不支持 reply is itself a recorded intent on the feishu channel.
      insertOutbox(this.store, {
        ticketId: null, kind: 'reply', to: 'feishu:chat:' + msg.chatId,
        body: UNSUPPORTED_MESSAGE_TYPE, state: 'recorded', requestId: 'hub-bot-feishu-unsupported-' + msg.messageId,
      })
      return { dropped: 'unsupported-type' }
    }
    const authorization = { actor: msg.openId, source: 'feishu', addressing: msg.addressing, messageId: msg.messageId, at }
    record({ authorization })
    // 注入 L1 总负责人会话 (spec: 飞书只是入口，L1 路由): the text carries the plugin-owned source mark and
    // the reply channel address so L1 can answer with reply_source to='feishu:chat:<chatId>'.
    const text = FEISHU_SOURCE_MARK + msg.chatId + '/' + msg.messageId + '] ' + msg.text
      + '\n\n来源：feishu 用户 ' + msg.openId + '（' + (msg.addressing === 'direct' ? '私聊' : '群聊 @bot') + '）于 ' + at
      + '；回复本消息用 reply_source to=\'feishu:chat:' + msg.chatId + '\''
    const sessionId = await this.#ensureChiefSession()
    const requestId = 'hub-bot-feishu-' + msg.messageId
    await this.sessions.prompt({ sessionId, requestId, text })
    return { injected: true, triggerId, sessionId, requestId }
  }

  /** Lazily binds the chief (L1) Session — mirrors the router's lazy owner-session creation. */
  async #ensureChiefSession() {
    const chief = this.registry.get('chief')
    if (!chief) throw new Error('hub-bot feishu: the chief owner row is missing from the registry')
    if (chief.sessionId) return chief.sessionId
    const created = await this.sessions.create({ cwd: chief.cwd, agentPreset: 'hub-bot-router' })
    this.registry.bindSession(chief.id, created.sessionId)
    return created.sessionId
  }

  /**
   * The recorded-reply channel (阶段 2 P1-2 留的通道): scans outbox rows with state 'recorded' addressed at
   * 'feishu:…' and actually sends them; only a real delivery earns state 'sent'. Five consecutive failures
   * fail the row and report a system problem (OutboxRunner discipline).
   */
  async deliverReplies() {
    // 双轴审查 P1-2: 通道无关驱动在 outbox.js（顺序扫描/统一 attempts/失败阶梯一处维护）；这里只留通道差异。
    return deliverRecordedReplies({
      store: this.store, logger: this.logger, now: this.now,
      channel: 'feishu', prefix: 'feishu:', maxAttempts: MAX_FEISHU_ATTEMPTS,
      parseTarget: to => to.startsWith('feishu:chat:') ? to.slice('feishu:chat:'.length) : to.slice('feishu:'.length),
      send: async (chatId, body) => {
        const client = await this.#client()
        const resp = await client.im.message.create({
          params: { receive_id_type: 'chat_id' },
          data: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text: body }) },
        })
        if (resp && typeof resp.code === 'number' && resp.code !== 0) throw new Error('feishu api code ' + resp.code + ': ' + (resp.msg ?? ''))
      },
    })
  }
}

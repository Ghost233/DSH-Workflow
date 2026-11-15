/**
 * hub-bot plugin entry: opens the versioned state store, bootstraps the chief owner row (lazy — registered
 * 'pending', its Session is created on first use), installs the process-wide hub singleton for the preset-subtree
 * tool plugins (src/router-tools.js), and — only when config.devApi explicitly enables it with a token — serves
 * the loopback development management API.
 *
 * The management API (/hub-bot/api/, loopback + x-hub-bot-token):
 *   GET  state                                   store + schema health
 *   GET  owners                                  owner registry rows (spec「数据模型」)
 *   POST sessions    {cwd?, agentPreset?}        create a Session; with {owner} also binds the registry row
 *   POST route       {ownerId, message, triggerRef?}  route one message (same core as the L1 tool)
 *   POST owners/invalidate-session {ownerId}     point a row at a dangling Session id (deleted-Session proof aid)
 *   POST inject      {sessionId, text, mode?, requestId?}  queue/steer a message (sessionController.prompt)
 *   POST decorate    {sessionId}                 register the hub_bot_ping tool on the Session's Agent
 *   POST wait        {sessionId, timeoutMs?}     wait for the Session to go idle (sessionController.wait)
 *   GET  transcript  ?sessionId=&maxMessages=    durable transcript records (sessionController.page)
 *   POST deliver                              drive one outbox delivery pass (deterministic retry proof aid)
 *
 * Reliability (#66): at startup the plugin ends every running assignment "host restarted" (markRestart — the
 * next injection carries the recovery note) and resumes queued outbox deliveries; a 1s timer keeps driving
 * the runner so backed-off retries fire without any new traffic (spec「可靠性」重启恢复).
 */
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { resolveConfig } from './config.js'
import { Store, SCHEMA_VERSION } from './store.js'
import { Hub, setHub } from './hub.js'
import { FeishuSource } from './feishu.js'

export const name = 'hub-bot'
export const inject = ['sessionController', 'sessionPersistence', 'webServer']

/** The decoration-probe tool registered on a Session by the /decorate route. */
export const PING_TOOL = {
  name: 'hub_bot_ping',
  description: 'Reply with a pong. hub-bot registers this tool to verify Session tool decoration works.',
  parameters: {
    type: 'object',
    properties: { text: { type: 'string', description: 'Optional text to echo back after "pong".' } },
    additionalProperties: false,
  },
  output: {
    schema: { type: 'object', properties: { pong: { type: 'string' } }, required: ['pong'], additionalProperties: false },
    render: (_args, value) => [{ type: 'text', text: String(value.pong) }],
  },
  execute: async args => ({ pong: args?.text ? 'pong: ' + args.text : 'pong' }),
}

/** One JSON HTTP response. */
function json(res, status, value) {
  const body = JSON.stringify(value, null, 2)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(body)
}

/** Reads a JSON request body, rejecting payloads over maxBytes. */
async function readBody(req, maxBytes = 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) throw new HttpError(413, 'Request body too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) return {}
  try { return JSON.parse(text) } catch { throw new HttpError(400, 'Request body must be JSON') }
}

/** An HTTP-visible failure with a status code. */
class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** A required non-empty string field of a request body. */
function requireString(body, key) {
  const value = body?.[key]
  if (typeof value !== 'string' || !value) throw new HttpError(400, key + ' must be a non-empty string')
  return value
}

/** An optional non-empty string field of a request body: undefined stays absent, anything else must be a string. */
function optionalString(body, key) {
  return body?.[key] === undefined ? undefined : requireString(body, key)
}

/** One AbortSignal that fires after ms. */
const deadline = ms => AbortSignal.timeout(ms)

/** Constant-time token comparison; both sides are hashed first so length never leaks. */
function tokenMatches(presented, expected) {
  const hash = value => createHash('sha256').update(String(value)).digest()
  return timingSafeEqual(hash(presented ?? ''), hash(expected))
}

/** The preset one owner role runs. */
const presetForRole = role => role === 'chief' ? 'hub-bot-router' : 'hub-bot-owner'

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - cordis context with the injected DSH services.
 * @param {unknown} rawConfig - plugin configuration; stateDir and homeRepo are required absolute paths.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const store = new Store(config.stateDir)

  // The Sessions port of src/router.js over the real sessionController. prompt uses queue mode: an owner Session
  // is event-driven — an injected message wakes it exactly like a person typing (spec「核心原则」2).
  const sessions = {
    create: async request => {
      const value = await ctx.sessionController.create(request, deadline(30_000))
      return { sessionId: value.sessionId ?? value.session?.id }
    },
    prompt: async ({ sessionId, requestId, text }) => {
      const value = await ctx.sessionController.prompt({
        requestId, sessionId, mode: 'queue', content: [{ type: 'text', text }],
      }, deadline(30_000))
      await ctx.sessionPersistence.flush()
      return value
    },
    // Wake coalescing (#67): digests flush once the owner Session goes idle, so one wake = one outward message.
    isRunning: async sessionId => {
      const listed = await ctx.sessionController.list({}, deadline(10_000))
      const item = (listed.items ?? []).find(s => s.sessionId === sessionId)
      return Boolean(item?.running)
    },
  }
  const hub = new Hub({ store, config, sessions, onSystemProblem: p => ctx.logger.warn('hub-bot system problem: %s (ticket %s, row %s)', p.reason, p.ticketId, p.rowId) })
  const chief = hub.registry.ensureChief({ cwd: config.homeRepo, workspace: basename(config.homeRepo) })
  setHub(hub)
  // 飞书入口 (#68): OFF unless config.feishu.enabled. With credentials present the WSClient long connection
  // starts at boot; the same source scans recorded feishu reply intents on the 1s tick (阶段 2 留的通道).
  const feishu = new FeishuSource({ store, registry: hub.registry, sessions, config: config.feishu, logger: ctx.logger })
  if (config.feishu.enabled && feishu.credentialState === 'ok') {
    void feishu.connect().catch(error => ctx.logger.warn('hub-bot feishu connect failed: %s (凭据可能失效 — 面板提示重新扫码)', error?.message ?? error))
  }
  // 重启恢复（#66）: end running assignments "host restarted", then resume any queued stored work — and keep
  // driving the runner every second so backoff retries fire even when no new traffic arrives.
  hub.router.markRestart()
  void hub.router.tick().catch(error => ctx.logger.warn('hub-bot delivery resume failed: %s', error?.message ?? error))
  const deliveryTimer = setInterval(() => {
    void hub.router.tick().catch(error => ctx.logger.warn('hub-bot delivery tick failed: %s', error?.message ?? error))
    void hub.router.autoReportTick().catch(error => ctx.logger.warn('hub-bot auto-report tick failed: %s', error?.message ?? error))
    if (config.feishu.enabled && feishu.credentialState === 'ok') {
      void feishu.deliverReplies().catch(error => ctx.logger.warn('hub-bot feishu reply tick failed: %s', error?.message ?? error))
    }
  }, 1000)
  deliveryTimer.unref?.()
  ctx.on('dispose', () => clearInterval(deliveryTimer))
  // The preset-subtree tool plugins (router-tools) run in a separate module realm: neither a module-level singleton
  // nor even globalThis reaches them (observed live). A service provided at this scope is the channel that crosses —
  // the same way the subtree sees Host services like 'tools'. The fiber's unload unregisters it (reflect.provide).
  const unprovide = ctx.root.reflect.provide('hubBot', hub)
  ctx.on('dispose', () => { void feishu.disconnect(); unprovide(); setHub(null); store.close() })
  ctx.logger.info('hub-bot ready: state %s (schema %s); chief owner %s (%s)%s',
    store.stateDir, store.schemaVersion, chief.owner.cwd, chief.created ? 'registered pending' : 'already registered',
    config.devApi ? '' : '; management API disabled (no config.devApi)')

  if (!config.devApi) return
  const token = config.devApi.token
  if (ctx.webServer.host !== '127.0.0.1' && ctx.webServer.host !== 'localhost' && ctx.webServer.host !== '::1') {
    throw new Error('hub-bot management requires a loopback Web server')
  }

  /** Management calls are loopback-only and must carry the configured token. */
  const admitted = req => {
    const host = req.headers.host ?? ''
    const loopback = host === '127.0.0.1:' + ctx.webServer.port || host === 'localhost:' + ctx.webServer.port || host === '[::1]:' + ctx.webServer.port
    return loopback && tokenMatches(req.headers['x-hub-bot-token'], token)
  }

  /**
   * Creates one Session. With { owner: <id> } the registry row supplies cwd and the role's preset, and the new
   * Session is bound into the registry — the management-side of lazy creation (L1 bootstrap in dev profiles).
   */
  const createSession = async body => {
    const ownerId = optionalString(body, 'owner')
    if (ownerId !== undefined) {
      const owner = hub.registry.get(ownerId)
      if (!owner) throw new HttpError(404, 'unknown owner "' + ownerId + '"')
      const value = await sessions.create({ cwd: owner.cwd, agentPreset: presetForRole(owner.role) })
      hub.registry.bindSession(owner.id, value.sessionId)
      return { ...value, ownerId: owner.id }
    }
    const request = {}
    const cwd = optionalString(body, 'cwd')
    if (cwd !== undefined) request.cwd = cwd
    const agentPreset = optionalString(body, 'agentPreset')
    if (agentPreset !== undefined) request.agentPreset = agentPreset
    return await sessions.create(request)
  }

  /** Injects one user message into an existing Session; an explicit requestId makes redelivery idempotent. */
  const injectPrompt = async body => {
    const sessionId = requireString(body, 'sessionId')
    const text = requireString(body, 'text')
    const mode = body.mode ?? 'queue'
    if (mode !== 'queue' && mode !== 'steer') throw new HttpError(400, 'mode must be "queue" or "steer"')
    const requestId = optionalString(body, 'requestId') ?? 'hub-bot-' + randomUUID()
    const value = await ctx.sessionController.prompt({
      requestId, sessionId, mode, content: [{ type: 'text', text }],
    }, deadline(30_000))
    await ctx.sessionPersistence.flush()
    return { ...value, requestId }
  }

  /** Tool registrations made by /decorate, keyed by Session so they release when the Session's Agent is disposed. */
  const decorations = new Map()
  // { global: true }: without it this listener only hears events emitted down this plugin's own ctx branch, and the
  // agent-lifecycle event arrives from the Session's branch — every agent/disposed listener in the runtime passes it.
  // The map keys are SessionIds while the event carries the Agent: dsh-agent-loop keeps agent.id === session.id for
  // ordinary Sessions, so the lookup holds.
  ctx.on('agent/disposed', ({ agent }) => {
    const dispose = decorations.get(agent.id)
    if (dispose) { decorations.delete(agent.id); dispose() }
  }, { global: true })

  /** Registers the ping tool on one live Session's Agent. */
  const decorate = async body => {
    const sessionId = requireString(body, 'sessionId')
    // resolveAgent resolves/resumes the Session and reports failures as a value, not a throw.
    const found = await ctx.sessionController.resolveAgent(sessionId)
    const agent = found && typeof found === 'object' && 'error' in found ? null : (found?.agent ?? found)
    if (!agent?.ctx) throw new HttpError(404, 'Session ' + sessionId + ' could not be resolved to a live Agent')
    decorations.get(sessionId)?.()
    const dispose = agent.ctx.tools.register(PING_TOOL)
    decorations.set(sessionId, dispose)
    ctx.on('dispose', dispose)
    return { decorated: true, tool: PING_TOOL.name, sessionId }
  }

  /** Waits for one Session to go idle and returns its latest assistant output. */
  const waitIdle = async body => {
    const sessionId = requireString(body, 'sessionId')
    const timeoutMs = typeof body.timeoutMs === 'number' && body.timeoutMs > 0 ? Math.min(body.timeoutMs, 600_000) : 120_000
    return await ctx.sessionController.wait({ sessionId, timeoutMs }, deadline(timeoutMs + 10_000))
  }

  /** Reads the durable transcript of one Session (what the DSH Web transcript view renders). */
  const transcript = async query => {
    const sessionId = requireString(query, 'sessionId')
    const maxMessages = Number.isInteger(Number(query.maxMessages)) && Number(query.maxMessages) > 0 ? Number(query.maxMessages) : 200
    return await ctx.sessionController.page({ address: { kind: 'session', sessionId }, maxMessages }, deadline(30_000))
  }

  const unregister = ctx.webServer.register({
    kind: 'prefix',
    path: '/hub-bot',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (!url.pathname.startsWith('/hub-bot/api/')) { res.writeHead(404); res.end(); return }
      if (!admitted(req)) { json(res, 401, { error: 'Missing or wrong x-hub-bot-token' }); return }
      try {
        const route = url.pathname.slice('/hub-bot/api/'.length)
        const method = req.method ?? 'GET'
        if (route === 'state' && method === 'GET') {
          json(res, 200, { ok: true, name, stateDir: store.stateDir, database: store.path, schemaVersion: store.schemaVersion, declaredSchemaVersion: SCHEMA_VERSION })
        } else if (route === 'owners' && method === 'GET') {
          json(res, 200, { owners: hub.registry.list() })
        } else if (route === 'sessions' && method === 'POST') {
          json(res, 200, await createSession(await readBody(req)))
        } else if (route === 'route' && method === 'POST') {
          const body = await readBody(req)
          json(res, 200, await hub.router.routeToOwner({
            ownerId: requireString(body, 'ownerId'),
            message: requireString(body, 'message'),
            triggerRef: optionalString(body, 'triggerRef'),
            ticketId: optionalString(body, 'ticketId'),
            resolution: optionalString(body, 'resolution'),
          }))
        } else if (route === 'owners/invalidate-session' && method === 'POST') {
          const body = await readBody(req)
          const ownerId = requireString(body, 'ownerId')
          json(res, 200, hub.registry.invalidateSessionForTest(ownerId, 'session-dangling-' + randomUUID()))
        } else if (route === 'inject' && method === 'POST') {
          json(res, 200, await injectPrompt(await readBody(req)))
        } else if (route === 'decorate' && method === 'POST') {
          json(res, 200, await decorate(await readBody(req)))
        } else if (route === 'wait' && method === 'POST') {
          json(res, 200, await waitIdle(await readBody(req)))
        } else if (route === 'deliver' && method === 'POST') {
          await hub.router.tick()
          const autoReport = await hub.router.autoReportTick({ force: true })
          json(res, 200, { delivered: true, autoReport })
        } else if (route === 'transcript' && method === 'GET') {
          json(res, 200, await transcript(Object.fromEntries(url.searchParams)))
        } else if (route === 'feishu/status' && method === 'GET') {
          // 面板健康视图: credentialState 'invalid'/'missing' = 提示重新扫码.
          json(res, 200, feishu.status())
        } else if (route === 'feishu/register' && method === 'POST') {
          // 扫码建应用: starts the device flow in the background; poll feishu/status for the QR url, then
          // for credentialState 'ok' once the user confirmed on the phone.
          if (feishu.registering) { json(res, 200, { started: false, registration: 'pending', qr: feishu.lastQr ?? null }); return }
          void feishu.register().catch(error => ctx.logger.warn('hub-bot feishu register failed: %s', error?.message ?? error))
          json(res, 202, { started: true })
        } else if (route === 'feishu/simulate' && method === 'POST') {
          // Dev proof aid: inject one mock im.message.receive_v1 event through the real normalization/policy path.
          const body = await readBody(req)
          json(res, 200, await feishu.handleEvent(body.event ?? body))
        } else {
          throw new HttpError(404, 'Unknown operation: ' + method + ' ' + route)
        }
      } catch (error) {
        if (error instanceof HttpError) { json(res, error.status, { error: error.message }); return }
        const message = error instanceof Error ? error.message : String(error)
        if (error?.name === 'ApiSessionNotFound') { json(res, 404, { error: message }); return }
        if (error?.name === 'RouterError') { json(res, 400, { error: message, code: error.code }); return }
        ctx.logger.warn('hub-bot management call failed: %s', message)
        json(res, 500, { error: message })
      }
    },
  })
  ctx.on('dispose', unregister)
}

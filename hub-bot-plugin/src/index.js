/**
 * hub-bot plugin entry: opens the versioned state store, serves the loopback management API, and wires the session
 * injection/decoration primitives every later ticket builds on.
 *
 * The HTTP API is the plugin's own trigger surface (Sources in later tickets call the same methods in-process):
 *   GET  /hub-bot/api/state                      store + schema health
 *   POST /hub-bot/api/sessions    {cwd, agentPreset?}   create a Session (sessionController.create)
 *   POST /hub-bot/api/inject      {sessionId, text, mode?}  queue/steer a message (sessionController.prompt)
 *   POST /hub-bot/api/decorate    {sessionId}     register the hub_bot_ping tool on the Session's Agent
 *   POST /hub-bot/api/wait        {sessionId, timeoutMs?}   wait for the Session to go idle (sessionController.wait)
 *   GET  /hub-bot/api/transcript  ?sessionId=&maxMessages=  durable transcript records (sessionController.page)
 * Every POST requires the x-hub-bot-request header: management calls are loopback-only and never credentialed.
 */
import { resolveConfig } from './config.js'
import { Store, SCHEMA_VERSION } from './store.js'

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
  execute: async args => ({ pong: args?.text ? `pong: ${args.text}` : 'pong' }),
}

/** One JSON HTTP response. */
function json(res, status, value) {
  const body = JSON.stringify(value, null, 2)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(body)
}

/** Reads a JSON request body, rejecting payloads over `maxBytes`. */
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

/** One AbortSignal that fires after `ms`. */
const deadline = ms => AbortSignal.timeout(ms)

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - cordis context with the injected DSH services.
 * @param {unknown} rawConfig - plugin configuration from the profile patch layer; stateDir is required.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const store = new Store(config.stateDir)
  ctx.on('dispose', () => { store.close() })

  if (ctx.webServer.host !== '127.0.0.1' && ctx.webServer.host !== 'localhost' && ctx.webServer.host !== '::1') {
    throw new Error('hub-bot management requires a loopback Web server')
  }

  /** Management calls arrive with x-hub-bot-request from the loopback UI or an operator script; anything else is 403. */
  const admitted = req => {
    const host = req.headers.host ?? ''
    const loopback = host === `127.0.0.1:${ctx.webServer.port}` || host === `localhost:${ctx.webServer.port}` || host === `[::1]:${ctx.webServer.port}`
    return loopback && req.headers['x-hub-bot-request'] === '1'
  }

  /** Creates one Session, optionally under one of the hub-bot owner presets. */
  const createSession = async body => {
    const request = { }
    if (body.cwd !== undefined) {
      if (typeof body.cwd !== 'string' || !body.cwd) throw new HttpError(400, 'cwd must be a non-empty string')
      request.cwd = body.cwd
    }
    if (body.agentPreset !== undefined) {
      if (typeof body.agentPreset !== 'string' || !body.agentPreset) throw new HttpError(400, 'agentPreset must be a non-empty string')
      request.agentPreset = body.agentPreset
    }
    return await ctx.sessionController.create(request, deadline(30_000))
  }

  /** Injects one user message into an existing Session; the Session executes and replies exactly as if a person typed it. */
  const injectPrompt = async body => {
    if (typeof body.sessionId !== 'string' || !body.sessionId) throw new HttpError(400, 'sessionId is required')
    if (typeof body.text !== 'string' || !body.text) throw new HttpError(400, 'text is required')
    const mode = body.mode ?? 'queue'
    if (mode !== 'queue' && mode !== 'steer') throw new HttpError(400, 'mode must be "queue" or "steer"')
    const requestId = `hub-bot-${crypto.randomUUID()}`
    const value = await ctx.sessionController.prompt({
      requestId,
      sessionId: body.sessionId,
      mode,
      content: [{ type: 'text', text: body.text }],
    }, deadline(30_000))
    await ctx.sessionPersistence.flush()
    return { ...value, requestId }
  }

  /** Registers the ping tool on one live Session's Agent; returns the names of the tools registered for that Agent. */
  const decorate = async body => {
    if (typeof body.sessionId !== 'string' || !body.sessionId) throw new HttpError(400, 'sessionId is required')
    const resolved = await ctx.sessionController.resolveAgent(body.sessionId)
    if ('error' in resolved) throw new HttpError(404, `Session not found: ${body.sessionId}`)
    const dispose = resolved.agent.ctx.tools.register(PING_TOOL)
    ctx.on('dispose', dispose)
    return { decorated: true, tool: PING_TOOL.name, sessionId: body.sessionId }
  }

  /** Waits for one Session to go idle and returns its latest assistant output. */
  const waitIdle = async body => {
    if (typeof body.sessionId !== 'string' || !body.sessionId) throw new HttpError(400, 'sessionId is required')
    const timeoutMs = typeof body.timeoutMs === 'number' && body.timeoutMs > 0 ? Math.min(body.timeoutMs, 600_000) : 120_000
    return await ctx.sessionController.wait({ sessionId: body.sessionId, timeoutMs }, deadline(timeoutMs + 10_000))
  }

  /** Reads the durable transcript of one Session (what the DSH Web transcript view renders). */
  const transcript = async query => {
    const sessionId = query.sessionId
    if (typeof sessionId !== 'string' || !sessionId) throw new HttpError(400, 'sessionId is required')
    const maxMessages = Number.isInteger(Number(query.maxMessages)) && Number(query.maxMessages) > 0 ? Number(query.maxMessages) : 200
    return await ctx.sessionController.page({ address: { kind: 'session', sessionId }, maxMessages }, deadline(30_000))
  }

  const unregister = ctx.webServer.register({
    kind: 'prefix',
    path: '/hub-bot',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (!url.pathname.startsWith('/hub-bot/api/')) { res.writeHead(404); res.end(); return }
      if (!admitted(req)) { json(res, 403, { error: 'Loopback management request with x-hub-bot-request header required' }); return }
      try {
        const route = url.pathname.slice('/hub-bot/api/'.length)
        const method = req.method ?? 'GET'
        if (route === 'state' && method === 'GET') {
          json(res, 200, { ok: true, name, stateDir: store.stateDir, database: store.path, schemaVersion: store.schemaVersion, declaredSchemaVersion: SCHEMA_VERSION })
        } else if (route === 'sessions' && method === 'POST') {
          json(res, 200, await createSession(await readBody(req)))
        } else if (route === 'inject' && method === 'POST') {
          json(res, 200, await injectPrompt(await readBody(req)))
        } else if (route === 'decorate' && method === 'POST') {
          json(res, 200, await decorate(await readBody(req)))
        } else if (route === 'wait' && method === 'POST') {
          json(res, 200, await waitIdle(await readBody(req)))
        } else if (route === 'transcript' && method === 'GET') {
          json(res, 200, await transcript(Object.fromEntries(url.searchParams)))
        } else {
          throw new HttpError(404, `Unknown operation: ${method} ${route}`)
        }
      } catch (error) {
        if (error instanceof HttpError) { json(res, error.status, { error: error.message }); return }
        const message = error instanceof Error ? error.message : String(error)
        if (error && typeof error === 'object' && error.name === 'ApiSessionNotFound') { json(res, 404, { error: message }); return }
        ctx.logger.warn('hub-bot management call failed: %s', message)
        json(res, 500, { error: message })
      }
    },
  })
  ctx.on('dispose', unregister)

  ctx.logger.info('hub-bot ready: state directory %s (schema %s)', store.stateDir, store.schemaVersion)
}

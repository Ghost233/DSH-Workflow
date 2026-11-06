import { randomBytes } from 'node:crypto'
import { createCodexAccounts } from './model-codex-accounts.mjs'

export const name = 'station-model-authorization'
export const inject = ['authorization', 'credentials', 'connection', 'webServer']
const key = 'llm-pi-ai/openai-codex'
const safeErrors = new Set(['Codex 认证格式无效。', 'Codex 认证列表无法读取。', 'Codex 认证切换状态无法恢复。',
  '认证不存在。', '当前认证不是 OAuth，无法安全切换。', '认证正在更新，请稍后重试。', '请填写认证名称。', '请先切换到其他认证。'])

/** Keep one authorization attempt in the same Host that owns the credentials. */
export function createCodexAuthorizationBridge(ctx, { loadOAuth = async () =>
  (await import('@earendil-works/pi-ai/providers/openai-codex')).openaiCodexProvider().auth.oauth } = {}) {
  let attempt, starting = false
  const accounts = createCodexAccounts(ctx.credentials)
  const status = async () => {
    const flow = ctx.authorization.describe(key)
    const profiles = await accounts.list()
    const record = await ctx.credentials.describeRecord(key)
    return { available: flow?.methods.some(method => method.id === 'oauth') === true,
      configured: record.configured === true && record.kind === 'grant', inFlight: flow?.inFlight === true || !!attempt && !attempt.done,
      ...profiles }
  }
  const cancel = current => {
    current.controller.abort()
    if (current.pending) {
      const pending = current.pending
      current.pending = undefined
      pending.signal?.removeEventListener('abort', pending.abort)
      pending.reject(new Error('Authorization cancelled'))
    }
  }
  const check = id => {
    if (!attempt || typeof id !== 'string' || id !== attempt.id) throw new Error('Unknown authorization attempt')
    attempt.seen = Date.now()
    return attempt
  }
  const push = (current, event) => {
    if (current.events.length >= 32) { cancel(current); return }
    current.events.push(event)
  }
  const begin = async ({ method = 'browser', name = 'Codex 账号' } = {}) => {
    if (!['browser', 'device'].includes(method) || typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
      throw new Error('Invalid authorization request')
    }
    const currentStatus = await status()
    if (currentStatus.inFlight) throw new Error('Authorization already running')
    if (!currentStatus.available) throw new Error('Codex authorization unavailable')
    if (attempt?.timer) clearInterval(attempt.timer)
    const current = { id: randomBytes(24).toString('hex'), controller: new AbortController(),
      events: [], seen: Date.now(), done: false, pending: undefined, timer: undefined }
    attempt = current
    current.timer = setInterval(() => {
      if (Date.now() - current.seen > 15_000) {
        cancel(current)
        if (current.done && attempt === current) { clearInterval(current.timer); attempt = undefined }
      }
    }, 3000)
    current.timer.unref()
    void Promise.resolve().then(async () => {
      const oauth = await loadOAuth()
      const credential = await oauth.login({
        signal: current.controller.signal,
        notify(notice) {
          if (notice.type === 'device_code') {
            const url = new URL(notice.verificationUri)
            if (url.protocol !== 'https:' || url.hostname !== 'auth.openai.com' || url.port || url.pathname !== '/codex/device'
              || url.username || url.password || typeof notice.userCode !== 'string' || !/^[A-Z0-9-]{4,32}$/.test(notice.userCode)) {
              throw new Error('Unexpected device authorization')
            }
            push(current, { type: 'device', url: url.href, code: notice.userCode })
            return
          }
          if (notice.type !== 'auth_url') return
          const url = new URL(notice.url)
          if (url.protocol !== 'https:' || url.hostname !== 'auth.openai.com' || url.port || url.pathname !== '/oauth/authorize'
            || url.username || url.password || url.searchParams.get('redirect_uri') !== 'http://localhost:1455/auth/callback') {
            throw new Error('Unexpected authorization address')
          }
          push(current, { type: 'open', url: url.href })
        },
        prompt(prompt) {
          if (prompt.type === 'select') {
            const selected = method === 'device' ? 'device_code' : 'browser'
            if (!prompt.options.some(option => option.id === selected)) throw new Error('Login method unavailable')
            return Promise.resolve(selected)
          }
          if (!['text', 'manual_code'].includes(prompt.type) || current.pending) return Promise.reject(new Error('Unsupported authorization prompt'))
          return new Promise((resolve, reject) => {
            const abort = () => {
              if (!current.pending) return
              current.pending = undefined
              push(current, { type: 'prompt-withdrawn' })
              reject(new Error('Prompt withdrawn'))
            }
            current.pending = { resolve, reject, signal: prompt.signal, abort }
            prompt.signal?.addEventListener('abort', abort, { once: true })
            if (prompt.signal?.aborted) abort()
            else push(current, { type: 'prompt' })
          })
        },
      })
      if (current.controller.signal.aborted) throw new Error('Authorization cancelled')
      await accounts.add({ kind: 'grant', payload: credential }, name, method)
      push(current, { type: 'authorized' })
    }).catch(error => {
      push(current, current.controller.signal.aborted ? { type: 'cancelled' }
        : method === 'device' && error instanceof Error && error.message.includes('device code login is not enabled')
          ? { type: 'error', reason: 'device-unavailable' }
        : { type: 'error', message: 'Codex 登录失败，请检查网络和授权后重试。' })
    }).finally(() => {
      current.done = true
      if (current.pending) {
        const pending = current.pending; current.pending = undefined
        pending.signal?.removeEventListener('abort', pending.abort)
        pending.reject(new Error('Authorization ended'))
      }
    })
    return { id: current.id }
  }
  const start = async args => {
    if (starting || attempt && !attempt.done) throw new Error('Authorization already running')
    starting = true
    try { return await begin(args) } finally { starting = false }
  }
  const poll = id => {
    const current = check(id), events = current.events.splice(0), done = current.done
    if (done) { clearInterval(current.timer); if (attempt === current) attempt = undefined }
    return { events, done }
  }
  const answer = (id, value) => {
    const current = check(id), pending = current.pending
    if (!pending || typeof value !== 'string' || value.length > 8192) throw new Error('No pending authorization prompt')
    const url = new URL(value)
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '1455'
      || url.pathname !== '/auth/callback' || !url.searchParams.get('code') || !url.searchParams.get('state')) {
      throw new Error('Invalid callback address')
    }
    current.pending = undefined
    pending.signal?.removeEventListener('abort', pending.abort)
    pending.resolve(value)
    return { accepted: true }
  }
  return { status, start, poll, answer, add: accounts.add, select: accounts.select, remove: accounts.remove,
    cancel(id) { cancel(check(id)); return { cancelled: true } },
    dispose() { if (attempt) { clearInterval(attempt.timer); cancel(attempt); attempt = undefined } } }
}

async function requestBody(request) {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    throw new Error('Expected JSON authorization request')
  }
  const chunks = []
  let size = 0
  for await (const chunk of request.body ?? []) {
    size += chunk.byteLength
    if (size > 131_072) throw new Error('Authorization request too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

/** Mount owner-only routes through the existing authenticated DSH Connection. */
export function apply(ctx) {
  const bridge = createCodexAuthorizationBridge(ctx)
  for (const endpoint of ['status', 'start', 'poll', 'answer', 'cancel', 'import', 'select', 'remove']) {
    ctx.connection.fetch.register({ path: `/api/station-codex-auth/${endpoint}`, methods: ['POST'], requestBody: 'streaming',
      fetch: async request => {
        try {
          const args = await requestBody(request)
          const value = endpoint === 'status' ? await bridge.status()
            : endpoint === 'start' ? await bridge.start(args)
              : endpoint === 'poll' ? bridge.poll(args.id)
                : endpoint === 'answer' ? bridge.answer(args.id, args.value)
                  : endpoint === 'import' ? await bridge.add(args.record, args.name, 'import')
                    : endpoint === 'select' ? await bridge.select(args.id)
                      : endpoint === 'remove' ? await bridge.remove(args.id)
                        : bridge.cancel(args.id)
          return Response.json({ ok: true, value }, { headers: { 'cache-control': 'no-store' } })
        } catch (error) {
          const message = error instanceof Error && safeErrors.has(error.message) ? error.message : 'Codex 授权操作失败。'
          return Response.json({ ok: false, error: message }, { status: 400, headers: { 'cache-control': 'no-store' } })
        }
      } })
  }
  ctx.effect(() => () => bridge.dispose(), 'station: stop Codex authorization')
}

export default { name, inject, apply }

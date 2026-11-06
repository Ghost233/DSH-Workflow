import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { createCodexAuthorizationBridge, apply } from './model-authorization-bridge.mjs'
import { runCodexAuthorization } from './model-authorization.mjs'

function fixtureContext() {
  const records = new Map()
  return { credentials: {
    async describeRecord(key) { const row = records.get(key); return { configured: !!row, kind: row?.kind } },
    async modifyRecord(key, mutate) { const current = records.get(key), next = await mutate(current); if (next !== undefined) records.set(key, structuredClone(next)); return next ?? current },
    async deleteRecord(key) { records.delete(key) },
  }, authorization: { describe: () => ({ methods: [{ id: 'oauth' }], inFlight: false }) } }
}
const fixtureGrant = { type: 'oauth', access: 'fixture-access', refresh: 'fixture-refresh', expires: 4_000_000_000_000, accountId: 'fixture-account' }

test('the Host flow stores the grant and reports no secret in status or events', async () => {
  const ctx = fixtureContext()
  const bridge = createCodexAuthorizationBridge(ctx, { loadOAuth: async () => ({
    async login(interaction) {
      assert.equal(await interaction.prompt({ type: 'select', options: [{ id: 'browser' }] }), 'browser')
      interaction.notify({ type: 'auth_url', url: 'https://auth.openai.com/oauth/authorize?state=fixture&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback' })
      const answer = await interaction.prompt({ type: 'manual_code' })
      assert.match(answer, /code=fixture-secret/)
      return fixtureGrant
    },
  }) })
  try {
    assert.deepEqual(await bridge.status(), { available: true, configured: false, inFlight: false, accounts: [] })
    const { id } = await bridge.start()
    await delay(0)
    const initial = bridge.poll(id)
    assert.deepEqual(initial.events.map(event => event.type), ['open', 'prompt'])
    assert.throws(() => bridge.answer(id, 'https://unexpected.example/?code=x&state=y'), /Invalid callback/)
    bridge.answer(id, 'http://localhost:1455/auth/callback?code=fixture-secret&state=fixture')
    await delay(0)
    const finished = bridge.poll(id)
    assert.deepEqual(finished, { events: [{ type: 'authorized' }], done: true })
    assert.equal(JSON.stringify(finished).includes('fixture-secret'), false)
    const status = await bridge.status()
    assert.equal(status.configured, true)
    assert.equal(status.accounts.length, 1)
    assert.equal(JSON.stringify(status).includes('fixture-refresh'), false)
  } finally { bridge.dispose() }
})

test('device code login uses the provider device flow and stores another profile', async () => {
  const ctx = fixtureContext()
  const bridge = createCodexAuthorizationBridge(ctx, { loadOAuth: async () => ({ async login(interaction) {
    assert.equal(await interaction.prompt({ type: 'select', options: [{ id: 'browser' }, { id: 'device_code' }] }), 'device_code')
    interaction.notify({ type: 'device_code', verificationUri: 'https://auth.openai.com/codex/device', userCode: 'ABCD-1234' })
    return fixtureGrant
  } }) })
  try {
    const { id } = await bridge.start({ method: 'device', name: '设备账号' })
    await delay(0)
    const result = bridge.poll(id)
    assert.deepEqual(result.events.map(event => event.type), ['device', 'authorized'])
    assert.equal((await bridge.status()).accounts[0].name, '设备账号')
  } finally { bridge.dispose() }
})

test('unavailable device login produces an actionable error without provider details', async () => {
  const bridge = createCodexAuthorizationBridge(fixtureContext(), { loadOAuth: async () => ({
    async login() { throw new Error('OpenAI Codex device code login is not enabled for this server. private-details') },
  }) })
  try {
    const { id } = await bridge.start({ method: 'device', name: '设备账号' })
    await delay(0)
    assert.deepEqual(bridge.poll(id).events, [{ type: 'error', reason: 'device-unavailable' }])
  } finally { bridge.dispose() }
})

test('authorization routes are registered through DSH Connection', async () => {
  const routes = []
  let dispose
  const ctx = { credentials: {}, authorization: {}, connection: { fetch: { register(route) {
    routes.push(route)
  } } }, effect: factory => { dispose = factory() } }
  apply(ctx)
  try {
    assert.deepEqual(routes.map(route => route.path), ['status', 'start', 'poll', 'answer', 'cancel', 'import', 'select', 'remove']
      .map(name => `/api/station-codex-auth/${name}`))
    assert.ok(routes.every(route => route.requestBody === 'streaming' && route.methods[0] === 'POST'))
    const status = routes.find(route => route.path.endsWith('/status'))
    assert.equal((await status.fetch(new Request('http://localhost/status', { method: 'POST', body: '{}' }))).status, 400)
    assert.equal((await status.fetch(new Request('http://localhost/status', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: 'x'.repeat(131_073) }))).status, 400)
  } finally { dispose() }
})

test('simultaneous login requests admit only one authorization attempt', async () => {
  const gate = Promise.withResolvers()
  let begins = 0
  const ctx = fixtureContext()
  ctx.credentials.describeRecord = () => gate.promise
  const bridge = createCodexAuthorizationBridge(ctx, { loadOAuth: async () => ({ async login() { begins++; throw new Error('cancel') } }) })
  try {
    const first = bridge.start(), second = bridge.start()
    const early = await Promise.race([second.then(() => 'accepted', () => 'refused'), delay(50).then(() => 'waiting')])
    gate.resolve({ configured: false })
    await Promise.allSettled([first, second])
    assert.equal(early, 'refused')
    assert.equal(begins, 1)
  } finally { bridge.dispose() }
})

test('a provider failure is reported without forwarding its private diagnostic', async () => {
  const ctx = fixtureContext()
  const bridge = createCodexAuthorizationBridge(ctx, { loadOAuth: async () => ({ async login() { throw new Error('fixture-secret-from-provider') } }) })
  try {
    const { id } = await bridge.start()
    await delay(0)
    const result = bridge.poll(id)
    assert.equal(result.done, true)
    assert.equal(result.events[0].type, 'error')
    assert.equal(JSON.stringify(result).includes('fixture-secret-from-provider'), false)
    assert.equal((await bridge.status()).configured, false)
  } finally { bridge.dispose() }
})

test('the Station relay forwards an answer privately and reports completion', async () => {
  const input = new EventEmitter(), events = [], calls = []
  let step = 0
  const callback = 'http://localhost:1455/auth/callback?code=fixture-secret&state=fixture'
  const call = async (method, args) => {
    calls.push({ method, args })
    if (method === 'start') return { id: 'attempt' }
    if (method === 'answer') return { accepted: true }
    if (method === 'poll' && step++ === 0) return { events: [{ type: 'prompt' }], done: false }
    if (method === 'poll') return { events: [{ type: 'authorized' }], done: true }
    throw new Error('unexpected call')
  }
  await runCodexAuthorization(call, { input, send(event) {
    events.push(event)
    if (event.type === 'prompt') input.emit('line', JSON.stringify({ type: 'answer', value: callback }))
  } })
  assert.deepEqual(events.map(event => event.type), ['prompt', 'authorized'])
  assert.equal(JSON.stringify(events).includes('fixture-secret'), false)
  assert.equal(calls.find(call => call.method === 'answer').args.value, callback)
})

test('closing the Station interaction cancels the Host attempt', async () => {
  const input = new EventEmitter(), calls = [], events = []
  const call = async (method) => {
    calls.push(method)
    if (method === 'start') { queueMicrotask(() => input.emit('close')); return { id: 'attempt' } }
    if (method === 'cancel') return { cancelled: true }
    if (method === 'poll') return { events: [{ type: 'cancelled' }], done: true }
    throw new Error('unexpected call')
  }
  await runCodexAuthorization(call, { input, send: event => events.push(event) })
  assert.deepEqual(calls, ['start', 'cancel', 'poll'])
  assert.deepEqual(events, [{ type: 'cancelled' }])
})

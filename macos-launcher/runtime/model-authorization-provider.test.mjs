import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { createCodexAuthorizationBridge } from './model-authorization-bridge.mjs'

test('the bundled pi-ai device login completes with a simulated OpenAI server', async t => {
  const artifact = process.env.DSH_SERVICE_TEST_RESOURCES
  if (!artifact) throw new Error('DSH_SERVICE_TEST_RESOURCES must identify the packaged Web runtime')
  const path = join(artifact, 'node_modules/@earendil-works/pi-ai/dist/providers/openai-codex.js')
  const { openaiCodexProvider } = await import(pathToFileURL(path).href)
  const accessPayload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64')
  const originalFetch = globalThis.fetch, calls = []
  globalThis.fetch = async url => {
    const path = new URL(url).pathname
    calls.push(path)
    if (path === '/api/accounts/deviceauth/usercode') return Response.json({ device_auth_id: 'fixture', user_code: 'ABCD-1234', interval: 0 })
    if (path === '/api/accounts/deviceauth/token') return Response.json({ authorization_code: 'fixture-code', code_verifier: 'fixture-verifier' })
    if (path === '/oauth/token') return Response.json({ access_token: `header.${accessPayload}.signature`, refresh_token: 'fixture-refresh', expires_in: 3600 })
    throw new Error('Unexpected network request')
  }
  t.after(() => { globalThis.fetch = originalFetch })
  const records = new Map(), ctx = { authorization: { describe: () => ({ methods: [{ id: 'oauth' }] }) }, credentials: {
    async describeRecord(key) { const row = records.get(key); return { configured: !!row, kind: row?.kind } },
    async modifyRecord(key, fn) { const current = records.get(key), next = await fn(current); if (next !== undefined) records.set(key, structuredClone(next)); return next ?? current },
    async deleteRecord(key) { records.delete(key) },
  } }
  const bridge = createCodexAuthorizationBridge(ctx, { loadOAuth: async () => openaiCodexProvider().auth.oauth })
  t.after(() => bridge.dispose())
  const { id } = await bridge.start({ method: 'device', name: '设备账号' })
  const events = [], deadline = Date.now() + 5000
  let done = false
  while (!done && Date.now() < deadline) {
    const result = bridge.poll(id); events.push(...result.events); done = result.done
    if (!done) await delay(10)
  }
  assert.equal(done, true)
  assert.deepEqual(events.map(event => event.type), ['device', 'authorized'])
  assert.deepEqual(calls, ['/api/accounts/deviceauth/usercode', '/api/accounts/deviceauth/token', '/oauth/token'])
  assert.equal((await bridge.status()).accounts[0].active, true)
  assert.equal(JSON.stringify(events).includes('fixture-refresh'), false)
})

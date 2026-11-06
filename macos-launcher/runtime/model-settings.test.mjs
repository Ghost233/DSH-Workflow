import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executeModelSettings } from './model-settings.mjs'

function fixture() {
  const calls = []
  const namespaces = [
    { ns: 'llm-pi-ai', revision: 4, value: { providers: { existing: { displayName: 'Existing', api: 'openai-completions', baseURL: 'https://example.invalid/v1', apiKeyEnv: 'EXISTING_API_KEY', models: [{ id: 'm1', name: 'Original', contextWindow: 42 }], headers: { Authorization: 'must-not-leak' } } } }, user: { providers: { existing: {} } } },
    { ns: 'llm-deepseek', revision: 2, value: { apiKeyEnv: 'DEEPSEEK_API_KEY' }, user: {} },
    { ns: 'agent-default-model', revision: 1, value: { provider: 'existing', model: 'm1' }, user: {} },
  ]
  const rpc = async (method, args) => {
    calls.push({ method, args })
    if (method === 'settings/describe') return { writable: true, namespaces }
    if (method === 'llm/listConfigurableProviders') return [
      { provider: 'existing', displayName: 'Existing', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'existing'] },
      { provider: 'known', displayName: 'Known', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'known'] },
    ]
    if (method === 'session/modelCatalog') return { default: { provider: 'existing', model: 'm1' }, groups: [{ id: 'existing', models: [{ id: 'm1', name: 'Original' }] }] }
    if (method === 'credentials/describe') return { EXISTING_API_KEY: { configured: true }, DEEPSEEK_API_KEY: { configured: false } }
    if (method === 'settings/mutate') return { revision: args.expectedRevision + 1 }
    if (method === 'credentials/set') return null
    if (method === 'llm/discoverModels') return [{ id: 'm1', name: 'Model One', privateData: 'ignored' }]
    throw new Error(`unexpected test RPC ${method}`)
  }
  return { rpc, calls, namespaces }
}

test('model overview omits secret provider fields and reports existing credentials', async () => {
  const { rpc } = fixture()
  const result = await executeModelSettings({ type: 'list' }, rpc)
  const existing = result.providers.find(row => row.id === 'existing')
  assert.equal(existing.configured, true)
  assert.equal(existing.credentialConfigured, true)
  assert.deepEqual(existing.models, ['m1'])
  assert.equal(JSON.stringify(result).includes('must-not-leak'), false)
})

test('Codex provider reports native OAuth status rather than an API key', async () => {
  const { rpc, namespaces } = fixture()
  namespaces[0].value.providers['openai-codex'] = { models: [{ id: 'gpt-6.1-terra' }] }
  const result = await executeModelSettings({ type: 'list' }, rpc, {
    codexStatus: async () => ({ available: true, configured: false }),
  })
  const codex = result.providers.find(row => row.id === 'openai-codex')
  assert.deepEqual(codex.oauth, { available: true, configured: false })
})

test('model settings remain usable if the Host authorization bridge is unavailable', async () => {
  const { rpc, namespaces } = fixture()
  namespaces[0].value.providers['openai-codex'] = { models: [{ id: 'gpt-6.1-terra' }] }
  const result = await executeModelSettings({ type: 'list' }, rpc, {
    codexStatus: async () => { throw new Error('private diagnostics') },
  })
  assert.deepEqual(result.providers.find(row => row.id === 'openai-codex').oauth, { available: false, configured: null })
  assert.equal(JSON.stringify(result).includes('private diagnostics'), false)
  const interrupted = await executeModelSettings({ type: 'list' }, rpc, {
    codexStatus: async () => { throw new Error('Codex 认证切换状态无法恢复。') },
  })
  assert.equal(interrupted.providers.find(row => row.id === 'openai-codex').oauth.error, 'Codex 认证切换状态无法恢复。')
})

test('Codex CLI import reads only the selected file and does not return its tokens', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'station-codex-import-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const path = join(directory, 'auth.json')
  const claims = Buffer.from(JSON.stringify({ exp: 2_000_000_000 })).toString('base64url')
  await writeFile(path, JSON.stringify({ auth_mode: 'chatgpt', tokens: {
    access_token: `head.${claims}.signature`, refresh_token: 'fixture-secret', account_id: 'fixture-account',
  } }))
  const { rpc } = fixture()
  let sent
  rpc.codex = async (method, args) => { sent = { method, args }; return { id: 'p-fixture' } }
  const result = await executeModelSettings({ type: 'codex-import', path, name: 'CLI' }, rpc)
  assert.deepEqual(result, { id: 'p-fixture' })
  assert.equal(sent.method, 'import')
  assert.equal(sent.args.record.payload.refresh, 'fixture-secret')
  assert.equal(JSON.stringify(result).includes('fixture-secret'), false)
  await assert.rejects(executeModelSettings({ type: 'codex-import', path: directory, name: 'CLI' }, rpc), /无法读取/)
})

test('model discovery forwards the draft key only to the host and returns model metadata', async () => {
  const { rpc, calls } = fixture()
  const result = await executeModelSettings({ type: 'discover', id: 'custom',
    api: 'openai-completions', baseURL: 'https://example.invalid/v1', key: 'fixture-key' }, rpc)
  assert.deepEqual(result, { models: [{ id: 'm1', name: 'Model One' }] })
  const request = calls.find(row => row.method === 'llm/discoverModels').args.request
  assert.equal(request.apiKey, 'fixture-key')
  assert.equal(JSON.stringify(result).includes('fixture-key'), false)
})

test('editing a provider changes only requested fields, retaining existing model metadata', async () => {
  const { rpc, calls } = fixture()
  await executeModelSettings({ type: 'save', id: 'existing', revision: 4, displayName: 'Updated',
    api: 'openai-completions', baseURL: 'https://example.invalid/v1', models: ['m1', 'm2'], key: 'fixture-key', isNew: false }, rpc)
  const write = calls.find(row => row.method === 'settings/mutate')
  assert.equal(write.args.expectedRevision, 4)
  assert.deepEqual(write.args.ops.find(op => op.path.at(-1) === 'models').value,
    [{ id: 'm1', name: 'Original', contextWindow: 42 }, { id: 'm2', name: 'm2' }])
  assert.equal(write.args.ops.some(op => op.path.includes('headers')), false)
  assert.deepEqual(calls.find(row => row.method === 'credentials/set').args, { ref: 'EXISTING_API_KEY', value: 'fixture-key' })
})

test('stale revisions and invalid endpoints fail before changing settings or credentials', async () => {
  for (const input of [
    { type: 'save', id: 'existing', revision: 1, displayName: 'x', api: '', baseURL: 'https://example.invalid', models: [], key: 'fixture-key', isNew: false },
    { type: 'save', id: 'new', revision: 4, displayName: 'x', api: 'openai-completions', baseURL: 'file:///tmp/config', models: ['m'], key: 'fixture-key', isNew: true },
  ]) {
    const { rpc, calls } = fixture()
    await assert.rejects(executeModelSettings(input, rpc))
    assert.equal(calls.some(row => ['settings/mutate', 'credentials/set'].includes(row.method)), false)
  }
})

test('a catalog provider can use its built-in endpoint and model list', async () => {
  const { rpc, calls } = fixture()
  await executeModelSettings({ type: 'save', id: 'known', revision: 4, displayName: '',
    api: '', baseURL: '', models: [], key: '', isNew: true }, rpc)
  assert.deepEqual(calls.find(row => row.method === 'settings/mutate').args.ops,
    [{ op: 'set', path: ['providers', 'known'], value: {} }])
})

test('credential write failures report partial success without disclosing the key', async () => {
  const { rpc } = fixture()
  const failing = async (method, args) => {
    if (method === 'credentials/set') throw new Error('fixture-secret')
    return rpc(method, args)
  }
  await assert.rejects(executeModelSettings({ type: 'save', id: 'existing', revision: 4, displayName: 'Updated',
    api: 'openai-completions', baseURL: 'https://example.invalid/v1', models: ['m1'], key: 'fixture-secret', isNew: false }, failing),
  error => /模型设置已保存，但凭据保存失败/.test(error.message) && !error.message.includes('fixture-secret'))
})

test('default selection and provider removal use revision-checked host settings', async () => {
  const { rpc, calls } = fixture()
  await executeModelSettings({ type: 'default', provider: 'existing', model: 'm1', revision: 1 }, rpc)
  await executeModelSettings({ type: 'remove', id: 'existing', revision: 4 }, rpc)
  const writes = calls.filter(row => row.method === 'settings/mutate')
  assert.equal(writes[0].args.ns, 'agent-default-model')
  assert.equal(writes[0].args.expectedRevision, 1)
  assert.deepEqual(writes[1].args.ops, [{ op: 'unset', path: ['providers', 'existing'] }])
  assert.equal(calls.some(row => row.method === 'credentials/unset'), false)
})

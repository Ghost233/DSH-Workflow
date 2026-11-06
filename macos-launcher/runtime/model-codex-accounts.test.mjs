import test from 'node:test'
import assert from 'node:assert/strict'
import { createCodexAccounts, importCodexFile } from './model-codex-accounts.mjs'

const active = 'llm-pi-ai/openai-codex'
const grant = value => ({ kind: 'grant', payload: { type: 'oauth', access: `access-${value}`,
  refresh: `refresh-${value}`, expires: 4_000_000_000_000, accountId: value } })
function store(initial = {}) {
  const records = new Map(Object.entries(initial))
  return { records, async readRecord(key) { return structuredClone(records.get(key)) },
    async modifyRecord(key, fn) {
      const current = structuredClone(records.get(key))
      const next = await fn(current)
      if (next !== undefined) records.set(key, structuredClone(next))
      return structuredClone(next ?? current)
    }, async deleteRecord(key) { records.delete(key) } }
}

test('multiple credentials survive switching and preserve the latest active refresh', async () => {
  const credentials = store({ [active]: grant('original') })
  const accounts = createCodexAccounts(credentials)
  const before = await accounts.list()
  assert.deepEqual(before.accounts.map(row => [row.name, row.active]), [['现有授权', true]])
  const added = await accounts.add(grant('second'), '第二个账号', 'device')
  assert.deepEqual(credentials.records.get(active), grant('original'))
  credentials.records.set(active, grant('refreshed'))
  await accounts.select(added.id)
  assert.equal(credentials.records.get(active).payload.accountId, 'second')
  await accounts.select('existing')
  assert.equal(credentials.records.get(active).payload.accountId, 'refreshed')
  assert.equal(JSON.stringify(await accounts.list()).includes('refresh-'), false)
  await assert.rejects(accounts.remove('existing'), /切换/)
  await accounts.remove(added.id)
  assert.equal((await accounts.list()).accounts.length, 1)
})

test('a concurrent refresh during selection is archived before switching', async () => {
  const credentials = store({ [active]: grant('original') })
  const accounts = createCodexAccounts(credentials)
  const added = await accounts.add(grant('second'), '第二个', 'browser')
  const modify = credentials.modifyRecord.bind(credentials)
  let changed = false, activeCalls = 0
  credentials.modifyRecord = async (key, fn) => {
    if (key === active && ++activeCalls === 2) {
      changed = true
      credentials.records.set(active, grant('concurrent-refresh'))
    }
    return modify(key, fn)
  }
  await accounts.select(added.id)
  assert.equal(changed, true)
  await accounts.select('existing')
  assert.equal(credentials.records.get(active).payload.accountId, 'concurrent-refresh')
})

test('failed addition and selection do not replace an existing authorization', async () => {
  const credentials = store({ [active]: grant('original') })
  const accounts = createCodexAccounts(credentials)
  await assert.rejects(accounts.add({ kind: 'grant', payload: {} }, 'bad', 'browser'), /认证/)
  await assert.rejects(accounts.select('missing'), /不存在/)
  assert.deepEqual(credentials.records.get(active), grant('original'))
})

test('an interrupted switch recovers the committed active profile without losing the previous one', async () => {
  const credentials = store({ [active]: grant('original') })
  const accounts = createCodexAccounts(credentials)
  const added = await accounts.add(grant('second'), '第二个', 'browser')
  const modify = credentials.modifyRecord.bind(credentials)
  let failed = false
  credentials.modifyRecord = async (key, fn) => modify(key, async current => {
    const next = await fn(current)
    if (key === 'station-codex/index' && next?.payload?.active === added.id && !next.payload.pending && !failed) {
      failed = true
      throw new Error('fixture interrupted write')
    }
    return next
  })
  await assert.rejects(accounts.select(added.id), /interrupted/)
  const restored = createCodexAccounts(credentials)
  assert.equal((await restored.list()).accounts.find(row => row.id === added.id).active, true)
  await restored.select('existing')
  assert.equal(credentials.records.get(active).payload.accountId, 'original')
})

test('a refreshed new credential remains identifiable after an interrupted switch', async () => {
  const credentials = store({ [active]: grant('original') })
  const accounts = createCodexAccounts(credentials)
  const added = await accounts.add(grant('second'), '第二个', 'browser')
  const modify = credentials.modifyRecord.bind(credentials)
  let failed = false
  credentials.modifyRecord = async (key, fn) => modify(key, async current => {
    const next = await fn(current)
    if (key === 'station-codex/index' && next?.payload?.active === added.id && !next.payload.pending && !failed) {
      failed = true
      const rotated = grant('second')
      rotated.payload.refresh = 'rotated-refresh'
      credentials.records.set(active, rotated)
      throw new Error('fixture interrupted write')
    }
    return next
  })
  await assert.rejects(accounts.select(added.id), /interrupted/)
  const restored = createCodexAccounts(credentials)
  assert.equal((await restored.list()).accounts.find(row => row.id === added.id).active, true)
  assert.equal(credentials.records.get(active).payload.refresh, 'rotated-refresh')
})

test('Codex CLI file parsing accepts refreshable OAuth credentials without exposing them', () => {
  const payload = Buffer.from(JSON.stringify({ exp: 2_000_000_000, 'https://api.openai.com/auth': { chatgpt_account_id: 'acct' } })).toString('base64url')
  const record = importCodexFile(JSON.stringify({ auth_mode: 'chatgpt', tokens: {
    access_token: `header.${payload}.signature`, refresh_token: 'fixture-secret', account_id: 'acct',
  } }))
  assert.equal(record.payload.accountId, 'acct')
  assert.equal(record.payload.expires, 2_000_000_000_000)
  assert.throws(() => importCodexFile(JSON.stringify({ OPENAI_API_KEY: 'key' })), /Codex/)
  assert.throws(() => importCodexFile('{broken'), /Codex/)
})

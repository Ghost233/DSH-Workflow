import { createHash, randomBytes } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

const activeKey = 'llm-pi-ai/openai-codex'
const indexKey = 'station-codex/index'
const profileKey = id => `station-codex/${id}`
const fingerprint = record => createHash('sha256').update(JSON.stringify(record ?? null)).digest('hex')
const validId = id => id === 'existing' || typeof id === 'string' && /^p-[a-f0-9]{32}$/.test(id)

function validatedGrant(record) {
  const payload = record?.kind === 'grant' ? record.payload : undefined
  if (!payload || payload.type !== 'oauth' || typeof payload.access !== 'string' || !payload.access
    || typeof payload.refresh !== 'string' || !payload.refresh || !Number.isFinite(payload.expires)
    || typeof payload.accountId !== 'string' || !payload.accountId) throw new Error('Codex 认证格式无效。')
  const copy = structuredClone(payload)
  delete copy._stationProfile
  return { kind: 'grant', payload: copy }
}

/** Parse a user-selected Codex CLI auth.json without returning its contents to the UI. */
export function importCodexFile(text) {
  try {
    const file = JSON.parse(text), tokens = file.tokens
    if (!tokens || file.auth_mode && file.auth_mode !== 'chatgpt') throw new Error()
    const access = tokens.access_token, refresh = tokens.refresh_token
    if (typeof access !== 'string' || access.length > 32_000 || typeof refresh !== 'string' || refresh.length > 32_000) throw new Error()
    const parts = access.split('.')
    if (parts.length !== 3) throw new Error()
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    const accountId = tokens.account_id || claims['https://api.openai.com/auth']?.chatgpt_account_id
    return validatedGrant({ kind: 'grant', payload: { type: 'oauth', access, refresh, expires: claims.exp * 1000, accountId } })
  } catch { throw new Error('无法读取 Codex CLI 认证文件。') }
}

/** Store profiles in DSH's credential provider; its fixed Codex record remains the active one. */
export function createCodexAccounts(credentials) {
  let queue = Promise.resolve()
  const exclusive = fn => { const result = queue.then(fn); queue = result.then(() => {}, () => {}); return result }
  // A no-op mutation reconciles the provider's cross-process file snapshot under its own lock.
  const fresh = key => credentials.modifyRecord(key, async () => undefined)
  const put = (key, value) => credentials.modifyRecord(key, async () => value)
  const writeIndex = index => put(indexKey, { kind: 'grant', payload: index })

  async function index() {
    const active = await fresh(activeKey), stored = await fresh(indexKey)
    if (!stored) return active?.kind === 'grant'
      ? { version: 1, active: 'existing', accounts: [{ id: 'existing', name: '现有授权', source: 'existing' }] }
      : { version: 1, active: null, accounts: [] }
    const value = stored.kind === 'grant' ? structuredClone(stored.payload) : undefined
    if (!value || value.version !== 1 || !Array.isArray(value.accounts)
      || value.accounts.some(row => !validId(row.id) || typeof row.name !== 'string')
      || value.active !== null && !value.accounts.some(row => row.id === value.active)) {
      throw new Error('Codex 认证列表无法读取。')
    }
    if (value.pending) {
      const p = value.pending
      if (!value.accounts.some(row => row.id === p.to) || p.from !== null && !value.accounts.some(row => row.id === p.from)) {
        throw new Error('Codex 认证切换状态无法恢复。')
      }
      const hash = fingerprint(active)
      if (hash === p.after || active?.payload?._stationProfile === p.to) value.active = p.to
      else if (hash === p.before) value.active = p.from
      else if (typeof p.toAccountId === 'string' && p.fromAccountId !== p.toAccountId && active?.payload?.accountId === p.toAccountId) value.active = p.to
      else if (typeof p.fromAccountId === 'string' && p.fromAccountId !== p.toAccountId && active?.payload?.accountId === p.fromAccountId) value.active = p.from
      else throw new Error('Codex 认证切换状态无法恢复。')
      delete value.pending
      await writeIndex(value)
    }
    return value
  }

  async function selectUnlocked(id, state) {
    if (!validId(id) || !state.accounts.some(row => row.id === id)) throw new Error('认证不存在。')
    if (state.active === id) return
    const target = validatedGrant(await fresh(profileKey(id)))
    target.payload._stationProfile = id
    for (let retry = 0; retry < 8; retry++) {
      const before = await fresh(activeKey)
      if (before && before.kind !== 'grant') throw new Error('当前认证不是 OAuth，无法安全切换。')
      if (before && state.active) await put(profileKey(state.active), validatedGrant(before))
      state.pending = { from: state.active, to: id, before: fingerprint(before), after: fingerprint(target),
        fromAccountId: before?.payload?.accountId ?? null, toAccountId: target.payload.accountId }
      await writeIndex(state)
      let replaced = false
      await credentials.modifyRecord(activeKey, async current => {
        if (!isDeepStrictEqual(current, before)) return undefined
        replaced = true
        return target
      })
      if (!replaced) continue
      state.active = id
      delete state.pending
      await writeIndex(state)
      return
    }
    delete state.pending
    await writeIndex(state)
    throw new Error('认证正在更新，请稍后重试。')
  }

  return {
    list: () => exclusive(async () => {
      const state = await index()
      return { accounts: state.accounts.map(row => ({ id: row.id, name: row.name, source: row.source, active: row.id === state.active })) }
    }),
    add: (record, name, source) => exclusive(async () => {
      const clean = validatedGrant(record), label = typeof name === 'string' ? name.trim() : ''
      if (!label || label.length > 80 || !['browser', 'device', 'import'].includes(source)) throw new Error('请填写认证名称。')
      const state = await index(), id = `p-${randomBytes(16).toString('hex')}`
      await put(profileKey(id), clean)
      state.accounts.push({ id, name: label, source })
      await writeIndex(state)
      if (state.active === null) await selectUnlocked(id, state)
      return { id }
    }),
    select: id => exclusive(async () => { await selectUnlocked(id, await index()); return { selected: true } }),
    remove: id => exclusive(async () => {
      const state = await index()
      if (!validId(id) || !state.accounts.some(row => row.id === id)) throw new Error('认证不存在。')
      if (id === state.active) throw new Error('请先切换到其他认证。')
      state.accounts = state.accounts.filter(row => row.id !== id)
      await writeIndex(state)
      await credentials.deleteRecord(profileKey(id))
      return { removed: true }
    }),
  }
}

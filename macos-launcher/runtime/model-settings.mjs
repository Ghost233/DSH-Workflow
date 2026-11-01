import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serviceRequest, serviceSocket } from './service-control.mjs'

const protocols = new Set(['openai-completions', 'openai-responses', 'anthropic-messages'])
const routePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const refFor = id => `${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
const validKey = key => /^[\x21-\x7e]+$/.test(key) && !/^[A-Z][A-Z0-9_]*=[^=]/.test(key)
  && !((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")))
const safeErrors = new Set([
  'DSH 模型设置暂不可用。', '无效的模型配置操作。', '无效的模型发现请求。', '请填写有效的模型服务地址。',
  '不支持所选 API 协议。', 'API 密钥格式无效。', '请选择有效的默认模型。', '所选模型当前不可用，请刷新后重试。',
  '无效的提供商。', '模型设置已在别处更改，请刷新后重试。', '此提供商不能从这里移除。', '模型配置格式无效。',
  '模型 ID 不能重复。', '自定义提供商需要地址、协议和至少一个模型。', '提供商已变化，请刷新后重试。',
  '模型设置已保存，但凭据保存失败；请刷新后重试。', 'DSH 本机模型配置连接无效。', '无法连接 DSH 模型配置。',
  'DSH 模型配置连接失败。', 'DSH 拒绝了模型设置，请检查提供商配置。', '缺少 DSH 服务路径。', '模型配置内容过长。',
])
const namespace = (description, id) => {
  const found = description.namespaces?.filter(row => row.ns === id) ?? []
  if (found.length !== 1) throw new Error('DSH 模型设置暂不可用。')
  return found[0]
}
const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const text = value => typeof value === 'string' ? value : ''

function validatedInput(input) {
  if (!input || typeof input !== 'object' || typeof input.type !== 'string') throw new Error('无效的模型配置操作。')
  return input
}

/** Only disclose model settings needed by Station, never provider headers or credentials. */
export async function executeModelSettings(input, rpc) {
  validatedInput(input)
  if (input.type === 'discover') {
    if (typeof input.id !== 'string' || typeof input.baseURL !== 'string' || typeof input.api !== 'string' || typeof input.key !== 'string') {
      throw new Error('无效的模型发现请求。')
    }
    const baseURL = input.baseURL.trim(), key = input.key.trim()
    if (baseURL) {
      let parsed
      try { parsed = new URL(baseURL) } catch { throw new Error('请填写有效的模型服务地址。') }
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('请填写有效的模型服务地址。')
    }
    if (input.api && !protocols.has(input.api)) throw new Error('不支持所选 API 协议。')
    if (key && !validKey(key)) throw new Error('API 密钥格式无效。')
    const directory = await rpc('llm/listConfigurableProviders', {})
    const known = directory.some(row => row.provider === input.id)
    const request = { ...(known ? { provider: input.id } : {}), ...(baseURL ? { baseURL } : {}),
      ...(input.api ? { api: input.api } : {}), ...(key ? { apiKey: key } : {}) }
    const rows = await rpc('llm/discoverModels', { settingsNs: input.id === 'deepseek-official' ? 'llm-deepseek' : 'llm-pi-ai', request })
    return { models: (Array.isArray(rows) ? rows : []).filter(row => typeof row.id === 'string')
      .map(row => ({ id: row.id, name: text(row.name) || row.id })) }
  }
  if (input.type === 'list') {
    const [description, directory, catalog] = await Promise.all([
      rpc('settings/describe', {}), rpc('llm/listConfigurableProviders', {}), rpc('session/modelCatalog', {}),
    ])
    const pi = namespace(description, 'llm-pi-ai'), deepseek = namespace(description, 'llm-deepseek')
    const defaults = namespace(description, 'agent-default-model')
    const routes = obj(obj(pi.value).providers), userRoutes = obj(obj(pi.user).providers)
    const metadata = new Map((Array.isArray(directory) ? directory : []).map(row => [row.provider, row]))
    const makeRow = (id, profile, ns, revision, removable) => {
      const value = obj(profile), info = obj(metadata.get(id))
      return { id, displayName: text(value.displayName) || text(info.displayName) || id, configuredDisplayName: text(value.displayName), namespace: ns, revision, removable,
        configured: true, api: text(value.api), baseURL: text(value.baseURL), keyRef: text(value.apiKeyEnv) || (id === 'deepseek-official' ? 'DEEPSEEK_API_KEY' : ''),
        models: Array.isArray(value.models) ? value.models.map(row => text(row.id)).filter(Boolean) : [],
        customModels: Array.isArray(value.models),
      }
    }
    const providers = [makeRow('deepseek-official', deepseek.value, 'llm-deepseek', deepseek.revision, false),
      ...Object.entries(routes).map(([id, value]) => makeRow(id, value, 'llm-pi-ai', pi.revision, Object.hasOwn(userRoutes, id)))]
    const refs = [...new Set(providers.map(row => row.keyRef || refFor(row.id)).filter(Boolean))]
    const credentials = {}
    for (let index = 0; index < refs.length; index += 64) Object.assign(credentials, await rpc('credentials/describe', { refs: refs.slice(index, index + 64) }))
    for (const row of providers) row.credentialConfigured = obj(credentials[row.keyRef || refFor(row.id)]).configured === true
    const account = catalog.groups?.find(group => group.id === 'deepseek-account')
    if (account) providers.unshift({ id: 'deepseek-account', displayName: 'DeepSeek 账号', account: true,
      models: (account.models ?? []).map(model => model.id), removable: false })
    return { writable: description.writable === true, providers,
      availableProviders: (Array.isArray(directory) ? directory : []).filter(row => row.settingsNs === 'llm-pi-ai')
        .map(row => ({ id: row.provider, displayName: row.displayName })),
      groups: Array.isArray(catalog.groups) ? catalog.groups.map(group => ({ id: group.id, name: group.name,
        models: (group.models ?? []).map(model => ({ id: model.id, name: model.name })) })) : [],
      defaultModel: catalog.default ?? defaults.value, defaultRevision: defaults.revision, piRevision: pi.revision,
    }
  }

  if (input.type === 'default') {
    if (typeof input.provider !== 'string' || typeof input.model !== 'string' || !Number.isSafeInteger(input.revision)) throw new Error('请选择有效的默认模型。')
    const catalog = await rpc('session/modelCatalog', {})
    if (!catalog.groups?.some(group => group.id === input.provider && group.models?.some(model => model.id === input.model))) {
      throw new Error('所选模型当前不可用，请刷新后重试。')
    }
    await rpc('settings/mutate', { ns: 'agent-default-model', expectedRevision: input.revision, ops: [
      { op: 'set', path: ['provider'], value: input.provider }, { op: 'set', path: ['model'], value: input.model },
      { op: 'unset', path: ['reasoningEffort'] },
    ] })
    return { saved: true }
  }

  if (input.type === 'remove') {
    if (!routePattern.test(input.id ?? '') || !Number.isSafeInteger(input.revision)) throw new Error('无效的提供商。')
    const description = await rpc('settings/describe', {}), pi = namespace(description, 'llm-pi-ai')
    if (pi.revision !== input.revision) throw new Error('模型设置已在别处更改，请刷新后重试。')
    if (!Object.hasOwn(obj(obj(pi.user).providers), input.id)) throw new Error('此提供商不能从这里移除。')
    await rpc('settings/mutate', { ns: 'llm-pi-ai', expectedRevision: input.revision,
      ops: [{ op: 'unset', path: ['providers', input.id] }] })
    return { saved: true }
  }

  if (input.type !== 'save') throw new Error('无效的模型配置操作。')
  const id = input.id
  if (typeof id !== 'string' || !routePattern.test(id) || !Number.isSafeInteger(input.revision)
    || typeof input.displayName !== 'string' || typeof input.baseURL !== 'string' || typeof input.api !== 'string'
    || typeof input.key !== 'string' || !Array.isArray(input.models) || input.models.some(model => typeof model !== 'string')) {
    throw new Error('模型配置格式无效。')
  }
  const name = input.displayName.trim(), baseURL = input.baseURL.trim(), key = input.key.trim()
  if (baseURL) {
    let url
    try { url = new URL(baseURL) } catch { throw new Error('请填写有效的模型服务地址。') }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请填写有效的模型服务地址。')
  }
  if (key && !validKey(key)) throw new Error('API 密钥格式无效。')
  const models = input.models.map(model => model.trim()).filter(Boolean)
  if (new Set(models).size !== models.length) throw new Error('模型 ID 不能重复。')
  const description = await rpc('settings/describe', {}), ns = id === 'deepseek-official' ? 'llm-deepseek' : 'llm-pi-ai'
  const view = namespace(description, ns)
  if (view.revision !== input.revision) throw new Error('模型设置已在别处更改，请刷新后重试。')
  const route = ns === 'llm-pi-ai' ? obj(obj(view.value).providers)[id] : view.value
  if (input.isNew ? route !== undefined : route === undefined) throw new Error('提供商已变化，请刷新后重试。')
  if (input.isNew) {
    const directory = await rpc('llm/listConfigurableProviders', {})
    const known = directory.some(row => row.provider === id && row.settingsNs === 'llm-pi-ai')
    if (!known && (!baseURL || !input.api || models.length === 0)) throw new Error('自定义提供商需要地址、协议和至少一个模型。')
  }
  const previous = obj(route), base = ns === 'llm-pi-ai' ? ['providers', id] : []
  if (input.api && !protocols.has(input.api) && input.api !== previous.api) throw new Error('不支持所选 API 协议。')
  const keyRef = text(previous.apiKeyEnv) || (id === 'deepseek-official' ? 'DEEPSEEK_API_KEY' : refFor(id))
  const priorModels = Array.isArray(previous.models) ? previous.models : []
  const mappedModels = models.map(model => priorModels.find(row => row.id === model) ?? { id: model, name: model })
  const ops = []
  const change = (field, next) => {
    if (JSON.stringify(previous[field]) === JSON.stringify(next)) return
    ops.push(next === undefined ? { op: 'unset', path: [...base, field] } : { op: 'set', path: [...base, field], value: next })
  }
  if (input.isNew) {
    const config = { ...(name ? { displayName: name } : {}), ...(input.api ? { api: input.api } : {}),
      ...(baseURL ? { baseURL } : {}), ...(models.length ? { models: mappedModels } : {}), ...(key ? { apiKeyEnv: keyRef } : {}) }
    ops.push({ op: 'set', path: base, value: config })
  } else {
    if (ns === 'llm-pi-ai') { change('displayName', name || undefined); change('api', input.api || undefined) }
    change('baseURL', baseURL || undefined)
    if (JSON.stringify(models) !== JSON.stringify(priorModels.map(row => row.id))) change('models', models.length ? mappedModels : undefined)
    if (key && !previous.apiKeyEnv) change('apiKeyEnv', keyRef)
  }
  if (ops.length) await rpc('settings/mutate', { ns, ops, expectedRevision: input.revision })
  if (key) {
    try { await rpc('credentials/set', { ref: keyRef, value: key }) }
    catch { throw new Error('模型设置已保存，但凭据保存失败；请刷新后重试。') }
  }
  return { saved: true }
}

async function connectRpc(dataRoot, resources) {
  const { version } = JSON.parse(await readFile(join(resources, 'workflow/dsh-runtime.json'), 'utf8'))
  const connection = (await serviceRequest(serviceSocket(dataRoot), { type: 'connect-web', runtimeVersion: version })).connection
  const url = new URL(connection.url)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password
    || url.pathname !== '/' || url.hash || url.searchParams.getAll('token').length !== 1 || !url.searchParams.get('token')) {
    throw new Error('DSH 本机模型配置连接无效。')
  }
  const login = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
  const cookie = login.headers.getSetCookie().map(row => row.split(';', 1)[0]).join('; ')
  if (![200, 303].includes(login.status) || !cookie) throw new Error('无法连接 DSH 模型配置。')
  let sequence = 0
  return async (method, args) => {
    let response, body
    try {
      response = await fetch(new URL(`/api/${method}`, url), { method: 'POST',
        headers: { cookie, 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ type: 'client-request', rpcId: `station-model-${++sequence}`, method, payload: { args } }) })
      body = await response.json()
    } catch { throw new Error('DSH 模型配置连接失败。') }
    if (!response.ok || body.result?.ok !== true) {
      if (body.result?.error?.code === 'settings/conflict') throw new Error('模型设置已在别处更改，请刷新后重试。')
      throw new Error('DSH 拒绝了模型设置，请检查提供商配置。')
    }
    return body.result.value
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [dataRoot, resources] = process.argv.slice(2)
    if (!dataRoot || !resources) throw new Error('缺少 DSH 服务路径。')
    let input = ''
    for await (const chunk of process.stdin) { input += chunk; if (input.length > 256 * 1024) throw new Error('模型配置内容过长。') }
    const result = await executeModelSettings(JSON.parse(input), await connectRpc(dataRoot, resources))
    process.stdout.write(JSON.stringify({ ok: true, value: result }) + '\n')
  } catch (error) {
    const known = error instanceof Error && safeErrors.has(error.message) ? error.message : '模型配置操作失败，请检查 DSH 服务。'
    process.stdout.write(JSON.stringify({ ok: false, error: known }) + '\n'); process.exitCode = 1
  }
}

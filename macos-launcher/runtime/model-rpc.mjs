import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serviceRequest, serviceSocket } from './service-control.mjs'

/** Connect only to the Station-managed local DSH Host. */
export async function connectModelRpc(dataRoot, resources) {
  const { version } = JSON.parse(await readFile(join(resources, 'workflow/dsh-runtime.json'), 'utf8'))
  const connection = (await serviceRequest(serviceSocket(dataRoot), { type: 'connect-web', runtimeVersion: version })).connection
  const url = new URL(connection.url)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password
    || url.pathname !== '/' || url.hash || url.searchParams.getAll('token').length !== 1 || !url.searchParams.get('token')) {
    throw new Error('DSH 本机模型配置连接无效。')
  }
  const login = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
  const cookie = login.headers.getSetCookie().map(row => row.split(';', 1)[0]).join('; ')
  await login.arrayBuffer()
  if (![200, 303].includes(login.status) || !cookie) throw new Error('无法连接 DSH 模型配置。')
  let sequence = 0
  const rpc = async (method, args) => {
    let response, body
    const rpcId = `station-model-${++sequence}`
    try {
      response = await fetch(new URL(`/api/${method}`, url), { method: 'POST',
        headers: { cookie, 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args } }) })
      body = await response.json()
    } catch { throw new Error('DSH 模型配置连接失败。') }
    if (!response.ok || body.rpcId !== rpcId || body.result?.ok !== true) {
      if (body.result?.error?.code === 'settings/conflict') throw new Error('模型设置已在别处更改，请刷新后重试。')
      throw new Error('DSH 拒绝了模型设置，请检查提供商配置。')
    }
    return body.result.value
  }
  rpc.codex = async (method, args) => {
    if (!['status', 'start', 'poll', 'answer', 'cancel', 'import', 'select', 'remove'].includes(method)) throw new Error('无效的授权操作。')
    let response, body
    try {
      response = await fetch(new URL(`/api/station-codex-auth/${method}`, url), { method: 'POST',
        headers: { cookie, 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000),
        body: JSON.stringify(args) })
      body = await response.json()
    } catch { throw new Error('DSH 模型配置连接失败。') }
    if (!response.ok || body.ok !== true) {
      const safe = new Set(['Codex 认证格式无效。', 'Codex 认证列表无法读取。', 'Codex 认证切换状态无法恢复。',
        '认证不存在。', '当前认证不是 OAuth，无法安全切换。', '认证正在更新，请稍后重试。', '请填写认证名称。', '请先切换到其他认证。'])
      throw new Error(safe.has(body.error) ? body.error : 'DSH 拒绝了 Codex 授权操作。')
    }
    return body.value
  }
  return rpc
}

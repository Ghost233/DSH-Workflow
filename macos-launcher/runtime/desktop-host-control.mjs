import { createHash } from 'node:crypto'
import { authenticatedHostUrl } from './station-bridge.mjs'

export async function desktopPlatformSession(ctx) {
  return await ctx.get('deepseekAccount')?.getPlatformSession() ?? null
}

export async function desktopConnection(ctx) {
  const entry = new URL(authenticatedHostUrl(ctx))
  const login = await fetch(entry, { redirect: 'manual', signal: AbortSignal.timeout(4000) })
  const cookie = login.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
  await login.body?.cancel()
  if (!cookie) throw new Error('DSH 未签发桌面会话凭据')
  const admission = ctx.connection.authentication.authenticate({ headers: { host: entry.host, cookie } })
  if ('rejection' in admission) throw new Error('DSH 桌面会话认证失败')
  return {
    url: new URL('/', entry).href,
    authenticationCookie: cookie,
    injections: ctx.webServer.collectIndexInjections(admission.peer),
    platformSession: await desktopPlatformSession(ctx),
  }
}

// Match the Desktop file drag's local identity and actual Host read checks.
export async function desktopDrag(ctx, parseFileAddress, address) {
  const resource = parseFileAddress(address)
  if (resource?.scope !== 'session') throw new Error('拖拽需要会话文件地址')
  const fs = ctx.get('fs'), workspaceFiles = ctx.get('workspaceFiles')
  if (!fs || !workspaceFiles) throw new Error('DSH 文件服务不可用')
  const signal = AbortSignal.timeout(10_000)
  const scope = await workspaceFiles.scopeOf(resource.sessionId, signal)
  if (!scope) return null
  const cwd = scope.workspaceRoot
  if ((await fs.lstat(resource.path, { cwd }, signal))?.type !== 'file') return null
  const target = await fs.resolve(resource.path, { cwd, signal })
  const path = fs.processPath(target)
  const mapped = fs.processPathFromHostPath(path)
  if (!mapped || (await fs.resolve(mapped, { signal })).targetKey !== target.targetKey) return null
  const info = await fs.stat(target, signal)
  if (info?.type !== 'file' || info.size === undefined) return null
  const hash = createHash('sha256')
  let size = 0
  while (size < info.size) {
    const bytes = await fs.readByteRange(target, { offset: size, length: Math.min(65536, info.size - size) }, signal)
    if (!bytes.length) return null
    hash.update(bytes)
    size += bytes.length
  }
  if (!size) await fs.readByteRange(target, { offset: 0, length: 1 }, signal)
  const after = await fs.stat(target, signal)
  signal.throwIfAborted()
  if (after?.version !== info.version || after.size !== size) return null
  return { path, size, sha256: hash.digest('hex') }
}

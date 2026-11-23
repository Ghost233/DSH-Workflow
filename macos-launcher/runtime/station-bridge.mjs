import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { apply as applyStopInspection, inject as stopInspectionServices } from './stop-inspection.mjs'
import { apply as applyModelAuthorization, inject as modelAuthorizationServices } from './model-authorization-bridge.mjs'

export const name = 'dsh-station-bridge'
export const inject = ['connection', 'webServer', 'appReady']

/** Resolve the browser login URL from the Host's authentication provider. */
export function authenticatedHostUrl(ctx) {
  const origin = `http://127.0.0.1:${ctx.webServer.port}`
  let url
  if (typeof ctx.connection.authenticatedUrl === 'function') {
    url = ctx.connection.authenticatedUrl(origin)
  } else {
    const entries = []
    ctx.emit(ctx.webServer, 'webserver/entry-url', origin, entries)
    url = entries.find(entry => entry.open)?.url
  }
  const parsed = url && URL.parse(url)
  if (!parsed || parsed.origin !== origin || parsed.pathname !== '/' || parsed.username || parsed.password
    || !parsed.searchParams.get('token')) {
    throw new Error('Desktop Host did not provide an authenticated loopback address')
  }
  return parsed.href
}

/** Publish Station's private Host identity and install its control handlers. */
export function apply(ctx, { directory, runtimeVersion }) {
  const lease = randomUUID()
  ctx.provide('workflowHostInstance', { instanceId: lease })
  ctx.inject(stopInspectionServices, applyStopInspection)
  ctx.inject(modelAuthorizationServices, applyModelAuthorization)
  const path = join(directory, 'desktop-host.json')
  let closed = false
  let published = Promise.resolve()
  const release = ctx.appReady.onReady(() => {
    published = (async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 })
      if (closed) return
      const url = authenticatedHostUrl(ctx)
      let permissionMode = 'unknown'
      try {
        const actual = ctx.get?.('sandboxPolicy')?.resolve().mode
        if (['read-only', 'workspace-write', 'danger-full-access'].includes(actual)) permissionMode = actual
      } catch { /* A missing policy observation must not prevent Host readiness. */ }
      const temporary = join(directory, `.desktop-host-${lease}.tmp`)
      await writeFile(temporary, JSON.stringify({ schema: 1, lease, pid: process.pid, url, runtimeVersion, permissionMode }) + '\n',
        { mode: 0o600, flag: 'wx' })
      await rename(temporary, path)
    })()
    void published.catch(error => ctx.logger.error(error))
  })
  ctx.effect(() => async () => {
    closed = true
    release()
    await published.catch(() => {})
    try {
      const current = JSON.parse(await readFile(path, 'utf8'))
      if (current.lease === lease) await unlink(path)
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  })
}

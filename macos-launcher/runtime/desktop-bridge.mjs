import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const name = 'dsh-workflow-desktop-bridge'
export const inject = ['connection', 'webServer', 'appReady']

/** Publish private readiness facts; Electron remains the sole owner of its Host. */
export function apply(ctx, { directory, runtimeVersion }) {
  const lease = randomUUID()
  ctx.provide('workflowHostInstance', { instanceId: lease })
  const path = join(directory, 'desktop-host.json')
  let closed = false
  let published = Promise.resolve()
  const release = ctx.appReady.onReady(() => {
    published = (async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 })
      if (closed) return
      const url = ctx.connection.authenticatedUrl(`http://127.0.0.1:${ctx.webServer.port}`)
      const parsed = new URL(url)
      if (parsed.hostname !== '127.0.0.1' || parsed.protocol !== 'http:' || !parsed.searchParams.get('token')) {
        throw new Error('Desktop Host did not provide an authenticated loopback address')
      }
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

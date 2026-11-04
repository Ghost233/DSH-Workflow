import { createRequire } from 'node:module'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { readDesktopHost } from './desktop-launch.mjs'

/** Start the official Web profile using the packaged runtime and Station's existing profile. */
export async function startWebHost({ resources, profile }) {
  const anchor = join(resources, 'node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor)
  const boot = require('@deepseek-ai/dsh-app-boot')
  const { runProfile } = require('@deepseek-ai/dsh/profile-boot')
  const loaded = boot.loadProfileDirectory('dsh', profile, anchor)
  boot.reportSkippedBundles('dsh', loaded)
  return runProfile({
    environment: boot.loadLayeredEnv('dsh'), profile: 'web',
    resolvedProfile: { profile: loaded, installAnchor: anchor }, patchFiles: [],
    args: ['--no-open', '--host', '127.0.0.1', '--port', '0'],
  })
}

/** Own the Web Host and the stop-admission handshake without a Desktop process. */
export async function serveWebHost({ resources, profile, receiptDirectory }) {
  const application = startWebHost({ resources, profile })
  let closing, locked = false, generation = 0
  const pending = new Set()
  const send = message => new Promise((accept, reject) => {
    if (!process.connected || !process.send) return accept()
    process.send(message, error => error ? reject(error) : accept())
  })
  const stop = () => closing ??= (async () => {
    const app = await application.catch(() => undefined)
    if (!app) return
    await app.shutdown.shutdown(0)
    await send({ type: 'shutdown-complete' })
    if (process.connected) process.disconnect()
  })()
  const onMessage = message => {
    if (message?.type === 'shutdown') { void stop().catch(error => { console.error(error); process.exitCode = 1 }); return }
    if (message?.type !== 'update-tasks' || !Number.isSafeInteger(message.requestId)
      || !['lock', 'unlock'].includes(message.action)) return
    void (async () => {
      try {
        await application
        if (closing) throw new Error('Web Host is stopping')
        if (message.action === 'unlock') { locked = false; generation++ }
        else {
          locked = true
          const current = ++generation
          await Promise.all([...pending])
          if (closing || current !== generation) throw new Error('Web Host admission lock was superseded')
        }
        // Station's separate stop inspection owns task inventory; this response only confirms admission state.
        await send({ type: 'update-tasks', requestId: message.requestId, active: null })
      } catch (error) {
        await send({ type: 'update-tasks', requestId: message.requestId, error: error.message }).catch(() => {})
      }
    })()
  }
  process.on('message', onMessage)
  process.once('disconnect', () => { void stop().catch(error => { console.error(error); process.exitCode = 1 }) })
  const { ctx } = await application
  ctx.on('connection/request', async (_request, response, next) => {
    if (locked) { response.writeHead(503); response.end(); return }
    const done = Promise.withResolvers()
    pending.add(done.promise)
    try { await next() } finally { pending.delete(done.promise); done.resolve() }
  })
  let receipt
  for (let attempt = 0; attempt < 100 && !receipt; attempt++) {
    try { receipt = await readDesktopHost(receiptDirectory) }
    catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
      await delay(50)
    }
  }
  if (!receipt || receipt.pid !== process.pid) throw new Error('Station Web Host receipt is missing or belongs to another process')
  await send({ type: 'ready', url: receipt.url, injections: [] })
  return { stop }
}

if (import.meta.main) {
  const [resources, profile, receiptDirectory] = process.argv.slice(2)
  if (!resources || !profile || !receiptDirectory) throw new Error('Missing Web Host paths')
  serveWebHost({ resources, profile, receiptDirectory }).catch(error => {
    const message = String(error?.message ?? error).replace(/token=[^&\s"<>]+/g, '[credential redacted]')
    if (process.connected) process.send?.({ type: 'fatal', message }, () => process.disconnect())
    console.error(message)
    process.exitCode = 1
  })
}

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { readDesktopHost } from './desktop-launch.mjs'

/** Start the official Web profile using the packaged runtime and Station's existing profile. */
export async function startWebHost({ resources, profile, overlay }) {
  const anchor = join(resources, 'node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor)
  const boot = require('@deepseek-ai/dsh-app-boot')
  const { runProfile } = require('@deepseek-ai/dsh/profile-boot')
  const loaded = boot.loadProfileDirectory('dsh', profile, anchor)
  boot.reportSkippedBundles('dsh', loaded)
  return runProfile({
    environment: boot.loadLayeredEnv('dsh'), profile: 'web',
    resolvedProfile: { profile: loaded, installAnchor: anchor }, patchFiles: overlay ? [overlay] : [],
    args: ['--no-open', '--host', '127.0.0.1', '--port', '0'],
  })
}

/** Own the Web Host without a Desktop process. */
export async function serveWebHost({ resources, profile, receiptDirectory, overlay, exit = () => {} }) {
  const application = startWebHost({ resources, profile, overlay })
  let closing
  const send = message => new Promise((accept, reject) => {
    if (!process.connected || !process.send) return accept()
    process.send(message, error => error ? reject(error) : accept())
  })
  const stop = () => closing ??= (async () => {
    const app = await application.catch(() => undefined)
    if (!app) return
    await app.shutdown.shutdown(0)
    try { await send({ type: 'shutdown-complete' }) }
    finally {
      if (process.connected) process.disconnect()
      // The CLI owns this process; leftover referenced handles must not keep it alive after disposal.
      exit(0)
    }
  })()
  const onMessage = message => {
    if (message?.type === 'shutdown') void stop().catch(error => { console.error(error); process.exitCode = 1 })
  }
  process.on('message', onMessage)
  process.once('disconnect', () => { void stop().catch(error => { console.error(error); process.exitCode = 1 }) })
  const { ctx } = await application
  ctx.on('connection/request', (_request, response, next) => {
    if (closing) { response.writeHead(503); response.end(); return }
    return next()
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
  const [resources, profile, receiptDirectory, overlay] = process.argv.slice(2)
  if (!resources || !profile || !receiptDirectory) throw new Error('Missing Web Host paths')
  serveWebHost({ resources, profile, receiptDirectory, overlay, exit: process.exit }).catch(error => {
    const message = String(error?.message ?? error).replace(/token=[^&\s"<>]+/g, '[credential redacted]')
    if (process.connected) process.send?.({ type: 'fatal', message }, () => process.disconnect())
    console.error(message)
    process.exitCode = 1
  })
}

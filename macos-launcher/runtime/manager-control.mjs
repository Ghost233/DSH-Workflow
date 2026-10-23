import { constants, watch } from 'node:fs'
import { open, lstat, readFile, rename, unlink, rmdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { privateDirectory, serviceRequest, SERVICE_PROTOCOL, redact } from './service-control.mjs'

// Darwin O_EXLOCK is released by the kernel when the descriptor's process exits.
// Keep the lock file: unlinking it would let another starter lock a different inode.
const O_EXLOCK = 0x20
const missing = async path => lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
const privateFile = info => info.isFile() && info.uid === process.getuid() && info.nlink === 1 && !(info.mode & 0o077)

export async function listenManagerControl(server, { directory, socketPath }) {
  if (process.platform !== 'darwin') throw new Error('DSH managers require macOS')
  await privateDirectory(directory)
  await privateDirectory(dirname(socketPath))
  let lock
  try { lock = await open(join(directory, 'manager.lock'), constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK | O_EXLOCK, 0o600) }
  catch (error) { if (error.code === 'EAGAIN') return null; throw error }
  const statePath = join(directory, 'manager.json'), backups = []
  let owned = false, bound = false, retained = false, failure
  let watcher, closing = false, recovery = Promise.resolve()
  const listen = async () => {
    await new Promise((accept, reject) => {
      server.once('error', reject)
      const mask = process.umask(0o177)
      try { server.listen(socketPath, () => { server.removeListener('error', reject); bound = true; accept() }) }
      finally { process.umask(mask) }
    })
    if (!closing) {
      const now = new Date()
      await lock.utimes(now, now)
    }
  }
  const watchSocket = () => {
    watcher?.close()
    watcher = watch(dirname(socketPath), () => {
      recovery = recovery.then(async () => {
        if (closing || !bound || await missing(socketPath)) return
        await privateDirectory(dirname(socketPath))
        if (closing) return
        watcher.close()
        // Rebind the listening handle without ending established control channels.
        server.close()
        await listen()
        if (!closing) watchSocket()
      }).catch(error => console.error(`DSH control recovery failed: ${redact(error.message)}`))
    })
    watcher.on('error', error => console.error(`DSH control watch failed: ${redact(error.message)}`))
  }
  const release = async () => {
    closing = true
    watcher?.close()
    try {
      await recovery
      // net.Server.close removes its Unix socket; never unlink a later listener's path.
      if (bound && server.listening) await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()))
      if (owned) {
        await unlink(statePath)
        const now = new Date()
        await lock.utimes(now, now)
      }
      if (bound) await rmdir(dirname(socketPath)).catch(error => { if (error.code !== 'ENOENT') throw error })
    } finally { await lock.close() }
  }
  try {
    if (!privateFile(await lock.stat())) throw new Error('Unsafe DSH manager lock')
    const stateInfo = await missing(statePath)
    let state
    if (stateInfo) {
      if (!privateFile(stateInfo)) throw new Error('Unsafe DSH manager record')
      try { state = JSON.parse(await readFile(statePath, 'utf8')) }
      catch { throw new Error('DSH 管理记录损坏，已保留原文件，请检查管理日志。') }
      if (state.protocol !== SERVICE_PROTOCOL || !Number.isSafeInteger(state.pid) || state.pid < 2) throw new Error('Invalid DSH manager record')
      try { process.kill(state.pid, 0); return null }
      catch (error) { if (error.code !== 'ESRCH') throw error }
    }
    // Legacy managers do not hold manager.lock; a live listener still takes precedence.
    try { await serviceRequest(socketPath, { type: 'status' }, 1000); return null }
    catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error }
    const socketInfo = await missing(socketPath)
    if (socketInfo && !state) throw new Error('遗留 DSH 控制 socket 缺少可核验的管理记录，已保留原文件。')
    const stamp = randomUUID()
    if (state) {
      const backup = statePath + '.stale-' + stamp
      await rename(statePath, backup); backups.push(backup)
    }
    if (socketInfo) {
      const backup = dirname(socketPath) + '.stale-' + stamp
      await rename(dirname(socketPath), backup); backups.push(backup)
      await privateDirectory(dirname(socketPath))
    }
    watchSocket()
    await new Promise(setImmediate)
    // Publish a complete ownership record before accepting any management request.
    const record = await open(statePath, 'wx', 0o600)
    owned = true
    try { await record.writeFile(JSON.stringify({ pid: process.pid, protocol: SERVICE_PROTOCOL }) + '\n') }
    finally { await record.close() }
    try {
      await listen()
    } catch (error) { if (error.code === 'EADDRINUSE') return null; throw error }
    retained = true
    return { backups, close: release }
  } catch (error) { failure = error; throw error }
  finally {
    if (!retained) {
      try { await release() }
      catch (error) { if (!failure) throw error; console.error(`DSH control cleanup failed: ${error.message}`) }
    }
  }
}

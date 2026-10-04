import { readFile, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { startLanGateway } from './lan-gateway.mjs'

/** A receipt comes only from the local Desktop Host, never from a browser request. */
export async function readDesktopHost(directory) {
  const path = join(directory, 'desktop-host.json')
  const info = await lstat(path)
  if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o077) !== 0
    || process.getuid && info.uid !== process.getuid()) throw new Error('Unsafe Desktop Host receipt')
  const value = JSON.parse(await readFile(path, 'utf8'))
  const url = new URL(value.url)
  if (value.schema !== 1 || typeof value.lease !== 'string' || !Number.isSafeInteger(value.pid) || value.pid < 2
    || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || !url.searchParams.get('token')
    || url.username || url.password) throw new Error('Invalid Desktop Host receipt')
  process.kill(value.pid, 0)
  return { ...value, port: Number(url.port) }
}

/** Attach the remote gate to Electron's existing Host; this function never starts a DSH process. */
export async function launchDesktopWeb({ globalRoot, gatewayHost, gatewayPort, gatewaySessions, password,
  signal, allowLanSettings = false, onGateway = () => {}, onReady = () => {} }) {
  const directory = join(globalRoot, '.dsh-workflow', 'desktop')
  let host
  while (!host) {
    signal?.throwIfAborted()
    try { host = await readDesktopHost(directory) }
    catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
      await delay(250, undefined, { signal })
    }
  }
  const gate = await startLanGateway({ host: gatewayHost, port: gatewayPort, upstreamPort: host.port,
    password, sessions: gatewaySessions, allowLanSettings, authenticatedUrl: () => host.url })
  try {
    onGateway(gate)
    onReady({ port: host.port, desktopPid: host.pid, runtimeVersion: host.runtimeVersion },
      gate.lanUrls[0] ?? gate.localUrl)
    while (!signal?.aborted) {
      await delay(500, undefined, { signal })
      const current = await readDesktopHost(directory)
      if (current.lease !== host.lease) throw new Error('Desktop Host changed; reconnect the Web entry')
    }
  } catch (error) {
    if (!signal?.aborted) throw error
  } finally { await gate.close() }
}

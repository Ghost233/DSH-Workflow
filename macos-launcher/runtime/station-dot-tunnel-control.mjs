// Station's local desired state is independent from Web/DSH Host readiness.
// This scope conveys neither credentials nor account/session information.
import { constants } from 'node:fs'
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'

const reportState = new Map([
  ['mcp_startup_retry','checking_mcp'],
  ['mcp_unavailable','mcp_unavailable'],
  ['child_started','client_running'],
  ['child_exited','client_exited'],
  ['unavailable','start_failed'],
  ['stopped','off'],
])

export async function readTunnelPreference(path) {
  let handle
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw Error('tunnel_preference_unavailable')
  }
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.uid !== process.getuid() || info.nlink !== 1 ||
        (info.mode & 0o777) !== 0o600 || info.size < 2 || info.size > 128)
      throw Error('tunnel_preference_invalid')
    const buffer = Buffer.alloc(129)
    const {bytesRead} = await handle.read(buffer, 0, buffer.length, 0)
    if (bytesRead !== info.size) throw Error('tunnel_preference_invalid')
    const value = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'))
    if (typeof value?.enabled !== 'boolean' || Object.keys(value).join(',') !== 'enabled')
      throw Error('tunnel_preference_invalid')
    return value.enabled
  } finally {
    await handle.close()
  }
}

export async function writeTunnelPreference(path, enabled) {
  if (typeof enabled !== 'boolean') throw Error('tunnel_preference_invalid')
  await mkdir(dirname(path), {recursive:true, mode:0o700})
  const temporary = path + '.' + randomUUID()
  try {
    await writeFile(temporary, JSON.stringify({enabled}) + '\n', {flag:'wx',mode:0o600})
    await rename(temporary, path)
  } finally {
    await rm(temporary, {force:true})
  }
}

/** Owns only the tunnel lifecycle, not the parent Web or Desktop sessions. */
export function createStationDotTunnelControl({
  getConfig, createTunnel, readEnabled, writeEnabled, onStatus = () => {},
}) {
  let enabled = false, active, disposed = false, serial = Promise.resolve()
  let state = 'off'
  const status = () => Object.freeze({
    enabled, state,
    // A live local child does not prove the remote registration can answer.
    connected: null,
  })
  function publish(next) {
    state = next
    try { onStatus(status()) } catch {}
  }
  function queue(action) {
    const result = serial.then(action)
    serial = result.catch(() => {})
    return result
  }
  async function stopActive() {
    const owned = active
    if (owned) {
      try { await owned.stop() }
      catch { publish('stop_failed'); throw Error('tunnel_stop_unconfirmed') }
      if (active === owned) active = null
    }
  }
  async function reconcile() {
    if (!enabled) {
      await stopActive()
      publish('off')
      return status()
    }
    if (active && ['checking_mcp','client_running'].includes(state)) return status()
    await stopActive()
    let config
    try { config = await getConfig() }
    catch { publish('invalid_config'); return status() }
    if (!config) { publish('missing_config'); return status() }
    const events = event => {
      if (active !== tunnel || !enabled || disposed) return
      const next = reportState.get(event)
      if (next) publish(next)
    }
    let tunnel
    try { tunnel = createTunnel(config, events) }
    catch { publish('start_failed'); return status() }
    if (!tunnel) { publish('start_failed'); return status() }
    active = tunnel
    publish('checking_mcp')
    try { await tunnel.start() }
    catch { if (active === tunnel) publish('start_failed') }
    return status()
  }
  return Object.freeze({
    status,
    start: () => queue(async () => {
      if (disposed) return status()
      try {
        const saved = await readEnabled()
        // Preserve previously configured auto-start on upgrade, but a new
        // installation without the dedicated config has no implicit opt-in.
        enabled = saved ?? Boolean(await getConfig())
      } catch { publish('invalid_config'); return status() }
      return reconcile()
    }),
    setEnabled: next => queue(async () => {
      if (disposed || typeof next !== 'boolean') throw Error('tunnel_control_unavailable')
      await writeEnabled(next)
      enabled = next
      return reconcile()
    }),
    dispose: () => queue(async () => {
      disposed = true
      await stopActive()
      publish('off')
    }),
  })
}

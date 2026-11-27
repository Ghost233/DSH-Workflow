import { randomBytes, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, rename, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { validateObservationConfig } from './session-observation-mcp.mjs'
import { validateStationDotTunnelConfig } from './station-dot-host-config.mjs'
import { validateStationDotClientFiles } from './dsh-dot-tunnel-composition.mjs'

const name = 'station-dot-pairing.json'
const limit = 16 * 1024
const bad = () => new Error('station_dot_pairing_invalid')

function parse(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'observation,transport') throw bad()
  return {
    observation: validateObservationConfig(value.observation),
    transport: validateStationDotTunnelConfig(value.transport),
  }
}

export async function readStationDotPairing(directory) {
  let fd
  try { fd = await open(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK) }
  catch (error) { if (error.code === 'ENOENT') return null; throw bad() }
  try {
    const metadata = await fd.stat()
    if (!metadata.isFile() || metadata.uid !== process.getuid() || metadata.nlink !== 1 ||
        (metadata.mode & 0o777) !== 0o600 || metadata.size < 2 || metadata.size > limit) throw bad()
    const bytes = Buffer.alloc(limit + 1)
    const {bytesRead} = await fd.read(bytes, 0, bytes.length, 0)
    if (bytesRead !== metadata.size) throw bad()
    return parse(JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')))
  } finally { await fd.close() }
}

function localPort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address()
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

export async function saveStationDotPairing(directory, input) {
  if (!input || !['clientSha256,directory,sessions,tunnelId','clientSha256,directory,globalActiveList,sessions,tunnelId'].includes(Object.keys(input).sort().join(','))) throw bad()
  if (Object.hasOwn(input,'globalActiveList') && input.globalActiveList !== true) throw bad()
  const {directory: clientDirectory, tunnelId, clientSha256, sessions} = input
  const transport = {directory:clientDirectory, tunnelId, clientSha256}
  validateStationDotTunnelConfig(transport)
  const observation = validateObservationConfig({
    port: await localPort(),
    bearer: randomBytes(32).toString('base64url'),
    sessions,
    ...(input.globalActiveList === true ? {globalActiveList:true} : {activeSessionIds:sessions?.map?.(row => row.id)}),
  })
  const privateDir = await lstat(directory)
  if (!privateDir.isDirectory() || privateDir.uid !== process.getuid() || (privateDir.mode & 0o777) !== 0o700)
    throw bad()
  validateStationDotClientFiles(transport)
  const temp = join(directory, name + '.' + randomUUID())
  try {
    await writeFile(temp, JSON.stringify({observation, transport}) + '\n', {flag:'wx',mode:0o600})
    await rename(temp, join(directory, name))
  } finally { await rm(temp, {force:true}) }
}

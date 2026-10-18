import { createConnection } from 'node:net'
import { createHash } from 'node:crypto'
import { lstat, mkdir } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const SERVICE_PROTOCOL = 1
export const serviceDirectory = dataRoot => join(resolve(dataRoot), 'global/.dsh-workflow/service')
export const serviceSocket = dataRoot => join('/private/tmp', `dsh-wf-${process.getuid()}-${createHash('sha256').update(realpathSync(resolve(dataRoot))).digest('hex').slice(0, 16)}`, 'control.sock')
export const redact = value => String(value).replace(/token=[^&\s"<>]+/g, '[credential redacted]')

export async function privateDirectory(directory, { create = true } = {}) {
  if (create) await mkdir(directory, { recursive: true, mode: 0o700 })
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077)) {
    throw new Error('Unsafe DSH service directory')
  }
}

/** Filesystem identity and 0700/0600 permissions restrict this socket to its local owner. */
export async function serviceRequest(socketPath, request, timeout = 45_000) {
  await privateDirectory(dirname(socketPath), { create: false })
  const info = await lstat(socketPath)
  if (!info.isSocket() || info.uid !== process.getuid() || (info.mode & 0o077)) throw new Error('Unsafe DSH service socket')
  return new Promise((accept, reject) => {
    const socket = createConnection(socketPath)
    let buffer = '', answered = false
    const fail = error => { socket.destroy(); reject(error) }
    socket.setTimeout(timeout, () => fail(new Error('DSH service control timed out')))
    socket.setEncoding('utf8')
    socket.once('error', fail)
    socket.once('connect', () => socket.write(JSON.stringify({ ...request, protocol: SERVICE_PROTOCOL }) + '\n'))
    socket.on('data', chunk => {
      buffer += chunk
      if (buffer.length > 4 * 1024 * 1024) { fail(new Error('DSH service response exceeded its limit')); return }
      if (!buffer.includes('\n') || answered) return
      answered = true
      try {
        const reply = JSON.parse(buffer.slice(0, buffer.indexOf('\n')))
        socket.end()
        if (reply.ok !== true) reject(Object.assign(new Error(reply.error || 'DSH service request failed'), { code: reply.code }))
        else if (reply.value?.protocol !== SERVICE_PROTOCOL) reject(new Error('DSH 服务协议不兼容，请使用配套应用。'))
        else accept(reply.value)
      } catch (error) { fail(error) }
    })
    socket.once('end', () => { if (!answered) fail(new Error('DSH service control disconnected')) })
  })
}

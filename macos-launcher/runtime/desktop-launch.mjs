import { readFile, lstat } from 'node:fs/promises'
import { join } from 'node:path'

/** Read the legacy-named receipt shared by the managed DSH Host and Station. */
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

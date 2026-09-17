import { randomUUID } from 'node:crypto'
import { mkdir, readFile, open, link, unlink, lstat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { kernelDigest } from './workflow-engine.mjs'

export function artifactPath(root, id, name = 'result.json') {
  for (const value of [id, name]) if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,200}$/.test(value) || value === '..') throw new Error('Invalid artifact identity')
  return join(root, id, name)
}
export async function readArtifact(path) {
  try {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Artifact is not a regular file')
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) { if (error.code === 'ENOENT') return null; throw error }
}
/** First publisher wins atomically. Same identity may only repeat identical bytes. */
export async function publishArtifact(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  const handle = await open(temporary, 'wx', 0o600)
  try { await handle.writeFile(`${JSON.stringify(value)}\n`); await handle.sync() } finally { await handle.close() }
  try {
    try { await link(temporary, path) } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (kernelDigest(await readArtifact(path)) !== kernelDigest(value)) throw new Error('Artifact identity conflict')
    }
  } finally { await unlink(temporary) }
  const directory = await open(dirname(path), 'r')
  try { await directory.sync() } finally { await directory.close() }
  return value
}

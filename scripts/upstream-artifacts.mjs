import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve, dirname, basename, relative, isAbsolute, join } from 'node:path'

const exec = promisify(execFile)
const json = async path => JSON.parse(await readFile(path, 'utf8'))

/** Read a complete, immutable upstream product set without executing its package hooks. */
export async function readArtifactSet(projectRoot, item) {
  if (!item.artifactSet || isAbsolute(item.artifactSet) || !/^[a-f0-9]{40}$/.test(item.commit ?? '')) throw new Error('Invalid pinned artifact source')
  const root = resolve(projectRoot), path = resolve(root, item.artifactSet)
  if (relative(root, path).startsWith('..')) throw new Error('Artifact set escapes the project')
  const directory = dirname(path), manifest = await json(path), plan = await json(join(directory, 'release-plan.json'))
  if (plan.sourceSha !== item.commit || plan.sourceDirty !== false || manifest.productVersion !== item.version
    || !Array.isArray(manifest.artifacts) || !manifest.artifacts.length) throw new Error('Artifact source/version does not match the pin')
  const entries = [], names = new Set()
  for (const artifact of [...manifest.artifacts, ...(manifest.platformArtifacts ?? [])]) {
    if (names.has(artifact.name) || basename(artifact.filename) !== artifact.filename || !artifact.filename.endsWith('.tgz')) throw new Error('Invalid artifact member')
    names.add(artifact.name)
    const archive = join(directory, artifact.filename), bytes = await readFile(archive)
    if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== artifact.integrity) throw new Error(`Artifact integrity mismatch: ${artifact.name}`)
    const { stdout } = await exec('tar', ['-xOf', archive, 'package/package.json'], { maxBuffer: 1024 * 1024 })
    const pkg = JSON.parse(stdout)
    if (pkg.name !== artifact.name || pkg.version !== artifact.version) throw new Error('Artifact package identity mismatch')
    entries.push({ ...artifact, path: archive, manifest: pkg, platform: Boolean(pkg.os?.length),
      archiveSha256: createHash('sha256').update(bytes).digest('hex') })
  }
  const product = entries.find(row => row.name === item.package)
  if (!product || product.version !== item.version) throw new Error('Artifact set does not contain the selected product')
  return { directory, manifest, entries, product,
    manifestSha256: createHash('sha256').update(await readFile(path)).digest('hex') }
}

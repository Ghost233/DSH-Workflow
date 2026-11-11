import { readFile, writeFile, rename } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readArtifactSet } from './upstream-artifacts.mjs'

const root = fileURLToPath(new URL('../', import.meta.url)), output = process.argv[2] && resolve(process.argv[2])
if (!output) throw new Error('Provide an output path; generate in the project registry container')
const bytes = await readFile(join(root, 'project-plugins.json')), manifest = JSON.parse(bytes)
const runtime = JSON.parse(await readFile(join(root, 'dsh-runtime.json'), 'utf8'))
const exec = promisify(execFile), plugins = []
for (const item of manifest.plugins) {
  let pkg, artifactSetSha256
  if (item.source === 'artifact') {
    const set = await readArtifactSet(root, item)
    if (set.manifest.dsh !== runtime.version) throw new Error('Source product targets another DSH version')
    pkg = set.product.manifest
    artifactSetSha256 = set.manifestSha256
  } else if (item.source === 'git') {
    if (!/^[a-f0-9]{40}$/.test(item.commit)) throw new Error('Git packages require a fixed commit')
    const response = await fetch(`https://raw.githubusercontent.com/${item.repository.split('github.com/')[1]}/${item.commit}/package.json`)
    if (!response.ok) throw new Error(`Pinned Git metadata failed: ${item.package}: ${response.status}`)
    pkg = await response.json()
  } else {
    const { stdout } = await exec('npm', ['view', `${item.package}@${item.version}`, '--json', '--registry', manifest.registry],
      { maxBuffer: 16 * 1024 * 1024, timeout: 60000 })
    pkg = JSON.parse(stdout)
  }
  if (pkg.name !== item.package || pkg.version !== item.version) throw new Error(`Exact metadata mismatch: ${item.package}`)
  const metadata = { name: pkg.name, version: pkg.version, dsh: pkg.dsh,
    peerDependencies: pkg.peerDependencies ?? {}, peerDependenciesMeta: pkg.peerDependenciesMeta ?? {} }
  plugins.push({ package: item.package, version: item.version, ...(item.commit ? { commit: item.commit } : {}),
    ...(artifactSetSha256 ? { artifactSetSha256 } : {}), metadata })
  console.log(`Verified ${item.package}@${item.version}: ${item.source ?? 'npm'}`)
}
const lock = { schema: 1, harnessVersion: runtime.version, registry: manifest.registry,
  manifestSha256: createHash('sha256').update(bytes).digest('hex'), plugins }
if (!bytes.equals(await readFile(join(root, 'project-plugins.json')))) throw new Error('Plugin manifest changed during metadata resolution')
await writeFile(`${output}.tmp`, JSON.stringify(lock, null, 2) + '\n')
await rename(`${output}.tmp`, output)

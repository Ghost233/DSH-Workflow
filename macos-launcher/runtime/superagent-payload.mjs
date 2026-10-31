import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')

async function members(root) {
  const result = {}
  async function visit(relative = '') {
    for (const name of (await readdir(join(root, relative))).sort()) {
      const item = relative ? `${relative}/${name}` : name
      const absolute = join(root, item), info = await lstat(absolute)
      if (info.isDirectory()) await visit(item)
      else if (info.isFile()) result[item] = { sha256: digest(await readFile(absolute)), mode: info.mode & 0o777 }
      else throw new Error(`Superagent payload contains an unsealed link or special file: ${item}`)
    }
  }
  await visit()
  return result
}

async function inputs(resourcesRoot) {
  const bytes = await readFile(join(resourcesRoot, 'workflow/vendor/dsh-superagent.upstream.json'))
  const source = JSON.parse(bytes)
  if (source.repository !== 'https://github.com/deepseek-ai/dsh-superagent-prototype'
    || !/^[a-f0-9]{40}$/.test(source.commit) || source.package !== 'dsh-superagent'
    || !/^\d+\.\d+\.\d+$/.test(source.version)) throw new Error('Invalid Superagent source pin')
  return { source, sourceSha256: digest(bytes) }
}

export async function sealSuperagentPayload(resourcesRoot) {
  resourcesRoot = resolve(resourcesRoot)
  const input = await inputs(resourcesRoot)
  const seal = { schema: 1, ...input, members: await members(join(resourcesRoot, 'superagent')) }
  await writeFile(join(resourcesRoot, 'superagent-payload.json'), JSON.stringify(seal, null, 2) + '\n', { flag: 'wx' })
  return verifySuperagentPayload(resourcesRoot)
}

/** Check the complete build-time payload without installing or importing it. */
export async function verifySuperagentPayload(resourcesRoot, projectRoot) {
  resourcesRoot = resolve(resourcesRoot)
  const bytes = await readFile(join(resourcesRoot, 'superagent-payload.json'))
  const seal = JSON.parse(bytes)
  const input = await inputs(resourcesRoot)
  if (seal.schema !== 1 || JSON.stringify(seal.source) !== JSON.stringify(input.source)
    || seal.sourceSha256 !== input.sourceSha256
    || projectRoot && digest(await readFile(join(projectRoot, 'vendor/dsh-superagent.upstream.json'))) !== input.sourceSha256
    || JSON.stringify(seal.members) !== JSON.stringify(await members(join(resourcesRoot, 'superagent')))) {
    throw new Error('Superagent delivery payload differs from its fixed source or sealed contents')
  }
  const root = join(resourcesRoot, 'superagent/node_modules/dsh-superagent')
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  if (pkg.name !== input.source.package || pkg.version !== input.source.version
    || pkg.dsh?.bundle?.patch !== './cordis.patch.yml') throw new Error('Superagent package identity mismatch')
  for (const name of ['cordis.patch.yml', 'lib/index.js', 'lib/client.js', 'lib/github-watch.js']) await readFile(join(root, name))
  return { source: input.source, packageRoot: root, sha256: digest(bytes) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'verify' || !process.argv[3]) throw new Error('Usage: superagent-payload.mjs verify RESOURCES [PROJECT_ROOT]')
  const { source, sha256 } = await verifySuperagentPayload(process.argv[3], process.argv[4])
  console.log(JSON.stringify({ ...source, sha256 }))
}

import { createRequire } from 'node:module'
import { readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Set the project-owned build override without changing the upstream checkout. */
export async function configureDesktopZod(workspace, version, semver) {
  if (typeof version !== 'string' || semver.valid(version) !== version) throw new Error('Desktop zod version must be exact')
  const text = await readFile(workspace, 'utf8')
  const marker = 'overrides:\n'
  if (text.split(marker).length !== 2 || /^\s{2}(?:"zod"|zod):/m.test(text)) {
    throw new Error('Desktop workspace overrides changed; cannot safely pin zod')
  }
  await writeFile(workspace, text.replace(marker, `${marker}  "zod": ${JSON.stringify(version)}\n`))
}

/** Reject incompatible declared ranges and verify Node resolves the shared physical package. */
export async function verifyDesktopZod(modules, version, semver) {
  const rootManifest = await realpath(join(modules, 'zod/package.json'))
  if (JSON.parse(await readFile(rootManifest, 'utf8')).version !== version) throw new Error('Desktop root zod version mismatch')
  let checked = 0
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const path = join(directory, entry.name)
      if (entry.name.startsWith('@')) { await visit(path); continue }
      const file = join(path, 'package.json')
      const manifest = await readFile(file, 'utf8').then(JSON.parse).catch(error => {
        if (error.code === 'ENOENT') return undefined
        throw error
      })
      if (!manifest) continue
      const ranges = ['dependencies', 'peerDependencies', 'optionalDependencies'].map(key => manifest[key]?.zod).filter(value => typeof value === 'string')
      if (ranges.length) {
        for (const range of ranges) if (!semver.satisfies(version, range, { includePrerelease: true })) {
          throw new Error(`Desktop package ${manifest.name} requires incompatible zod ${range}`)
        }
        if (await realpath(createRequire(file).resolve('zod/package.json')) !== rootManifest) {
          throw new Error(`Desktop package ${manifest.name} does not resolve the shared zod`)
        }
        checked++
      }
      await visit(join(path, 'node_modules'))
    }
  }
  await visit(modules)
  if (checked < 2) throw new Error('Desktop zod consumers were not found')
  return checked
}

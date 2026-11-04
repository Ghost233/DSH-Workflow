import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const zodVersions = new Set(['4.4.3', '4.6.6', '4.6.7'])
const auditedTestTrees = new Map([
  ['@mixmark-io/domino', '2.2.0'],
  ['@lezer/rust', '1.0.3'],
  ['khroma', '2.1.0'],
  ['fast-uri', '3.1.9'],
])

/** Remove only audited test/benchmark trees from known production dependencies. */
export async function pruneKnownDevelopmentFiles(modules, { platform = process.platform, arch = process.arch } = {}) {
  let removed = 0
  async function pruneZodSource(directory) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const path = join(directory, entry.name)
      if (entry.name === 'tests' || entry.name === 'benchmarks') {
        await rm(path, { recursive: true }); removed++
      } else await pruneZodSource(path)
    }
  }
  async function inspectPackage(directory, expected) {
    if (expected === 'zod' || auditedTestTrees.has(expected) || expected === 'node-pty') {
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      if (manifest.name !== expected) throw new Error(`Production package identity mismatch: ${expected}`)
      if (expected === 'zod' && zodVersions.has(manifest.version)) await pruneZodSource(join(directory, 'src'))
      if (auditedTestTrees.get(expected) === manifest.version) {
        const test = join(directory, 'test')
        try { await rm(test, { recursive: true }); removed++ } catch (error) { if (error.code !== 'ENOENT') throw error }
      }
      if (expected === 'node-pty' && manifest.version === '1.2.0-beta.15' && platform === 'darwin' && arch === 'arm64') {
        const windowsSource = join(directory, 'third_party/conpty')
        try { await rm(windowsSource, { recursive: true }); removed++ } catch (error) { if (error.code !== 'ENOENT') throw error }
      }
    }
    await visitModules(join(directory, 'node_modules'))
  }
  async function visitModules(directory) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const path = join(directory, entry.name)
      if (entry.name.startsWith('@')) {
        for (const child of await readdir(path, { withFileTypes: true })) {
          if (child.isDirectory()) await inspectPackage(join(path, child.name), `${entry.name}/${child.name}`)
        }
      } else await inspectPackage(path, entry.name)
    }
  }
  await visitModules(modules)
  return removed
}

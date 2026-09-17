// Test-only resolver: exercise the sibling Harness's built package exports without installing peers.
import { registerHooks } from 'node:module'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../deepseek-harness/', import.meta.url))
const packages = new Map()
function scan(directory, depth) {
  const manifest = join(directory, 'package.json')
  if (existsSync(manifest)) {
    const json = JSON.parse(readFileSync(manifest, 'utf8'))
    if (json.name) packages.set(json.name, { directory, json })
  }
  if (depth > 0) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && !['node_modules', 'lib', 'src', 'test', 'tests', '.git'].includes(entry.name)) {
        scan(join(directory, entry.name), depth - 1)
      }
    }
  }
}
scan(join(root, 'packages'), 2)
scan(join(root, 'vendor'), 1)
function exportedTarget(value) {
  if (typeof value === 'string') return value
  return value && exportedTarget(value.import ?? value.node ?? value.default)
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    const parts = specifier.split('/')
    const name = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
    const pkg = packages.get(name)
    if (!pkg) return nextResolve(specifier, context)
    const subpath = specifier.slice(name.length)
    const key = subpath ? `.${subpath}` : '.'
    const target = exportedTarget(pkg.json.exports?.[key]) ?? (!subpath ? pkg.json.module ?? pkg.json.main : undefined)
    if (!target) return nextResolve(specifier, context)
    const path = join(pkg.directory, target)
    if (!existsSync(path)) throw new Error(`Harness artifact missing: ${path}. Build the pinned Harness before integration tests.`)
    // A resolved URL is already authoritative. Passing it back through the
    // CJS require resolver (or tsx's require hook) treats file: as a package.
    return { url: pathToFileURL(path).href, shortCircuit: true }
  },
})

import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { realpathSync } from 'node:fs'

/** Process-local resolution: no links or manifests in the user's profile are changed. */
export function installProjectResolver({ packages, hostPackages, directory }) {
  const local = new Map(Object.entries(packages).map(([name, root]) => [name, createRequire(join(root, 'package.json'))]))
  const host = new Map(Object.entries(hostPackages).map(([name, root]) => [name, createRequire(join(root, 'package.json'))]))
  const prefix = pathToFileURL(realpathSync(directory) + '/').href
  let resolving = false
  return registerHooks({ resolve(specifier, context, nextResolve) {
    if (resolving || specifier.startsWith('.') || specifier.startsWith('/') || specifier.includes(':')) {
      return nextResolve(specifier, context)
    }
    const parts = specifier.split('/')
    const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
    const resolver = local.get(name) ?? (context.parentURL?.startsWith(prefix) ? host.get(name) : undefined)
    if (!resolver) return nextResolve(specifier, context)
    let target
    resolving = true
    try { target = resolver.resolve(specifier) } finally { resolving = false }
    return nextResolve(pathToFileURL(target).href, context)
  } })
}

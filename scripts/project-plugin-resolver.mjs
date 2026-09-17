import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, realpathSync } from 'node:fs'

function hostRoot(anchor) {
  // In the source checkout, the package anchor is apps/cli/package.json while
  // the host also loads sibling vendor and workspace modules.  Keep those
  // imports on their own dependency graph instead of remapping them through a
  // plugin's host peer map.  A packed npm DSH has no checkout marker, so its
  // package directory is the correct boundary.
  let current = dirname(anchor)
  while (dirname(current) !== current) {
    if (existsSync(join(current, '.git')) && existsSync(join(current, 'apps', 'cli', 'package.json'))) {
      return realpathSync(current)
    }
    current = dirname(current)
  }
  return realpathSync(dirname(anchor))
}

/** Process-local resolution: no links or manifests in the user's profile are changed. */
export function installProjectResolver({ packages, hostPackages, directory, anchor }) {
  const local = new Map(Object.entries(packages).map(([name, root]) => [name, createRequire(join(root, 'package.json'))]))
  const host = new Map(Object.entries(hostPackages).map(([name, root]) => [name, createRequire(join(root, 'package.json'))]))
  const prefixes = [directory, ...Object.values(packages)].map(root => pathToFileURL(realpathSync(root) + '/').href)
  const hostPrefix = pathToFileURL(hostRoot(anchor ?? directory) + '/').href
  let resolving = false
  return registerHooks({ resolve(specifier, context, nextResolve) {
    if (resolving || specifier.startsWith('.') || specifier.startsWith('/') || specifier.includes(':')) {
      return nextResolve(specifier, context)
    }
    const parts = specifier.split('/')
    const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
    const callerIsProjectPlugin = !context.parentURL?.startsWith(hostPrefix)
      && prefixes.some(prefix => context.parentURL?.startsWith(prefix))
    const resolver = local.get(name) ?? (callerIsProjectPlugin ? host.get(name) : undefined)
    if (!resolver) return nextResolve(specifier, context)
    let target
    resolving = true
    try { target = resolver.resolve(specifier) } finally { resolving = false }
    // `nextResolve(file:)` feeds the URL string back into CommonJS's
    // Module._resolveFilename on Node 24, where it is treated as a bare
    // package request.  Returning the already-resolved URL directly is the
    // documented short-circuit boundary and works for both import and require.
    return { url: pathToFileURL(target).href, shortCircuit: true }
  } })
}

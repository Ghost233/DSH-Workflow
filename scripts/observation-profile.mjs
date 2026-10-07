import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

export const observationEntries = catalogRoot => [
  { id: 'workflow-jev-center', name: 'dsh-owner-workflow/jev-center', config: {} },
  { id: 'workflow-agent-monitor', name: 'dsh-owner-workflow/agent-monitor',
    config: { directory: join(catalogRoot, '.dsh-workflow/agent-monitor') } },
]

/** Register configurable entries before profile overrides, so native Settings owns their values. */
export async function ensureObservationProfile({ profile, anchor, catalogRoot }) {
  const require = createRequire(anchor)
  const boot = require('@deepseek-ai/dsh-app-boot')
  const { withFileLock, writeFileAtomic } = require('@deepseek-ai/dsh-atomic-write')
  const base = boot.resolveBundleDir('dsh', '@deepseek-ai/dsh-base', anchor, profile.dir)
  const baseRequire = createRequire(join(base, 'package.json'))
  const yaml = createRequire(baseRequire.resolve('@deepseek-ai/dsh-config-editor/package.json'))('yaml')
  const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])
  return withFileLock(join(profile.dir, 'package.json'), async () => {
    const loaded = boot.loadProfileDirectory('dsh', profile.dir, anchor)
    const entries = flatten(boot.composeEntries([...loaded.layers.map(layer => layer.patches), loaded.patches]))
    const missing = observationEntries(catalogRoot).filter(definition => {
      const matches = entries.filter(row => row.id === definition.id)
      if (matches.length > 1 || matches.some(row => row.name !== definition.name || row.group)) {
        throw new Error(`Observation plugin entry conflicts with profile: ${definition.id}`)
      }
      return matches.length === 0
    })
    if (!missing.length) return false
    const before = await readFile(profile.patchPath, 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error
      return '[]\n'
    })
    const document = yaml.parseDocument(before, {
      customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }],
    })
    if (document.errors[0]) throw document.errors[0]
    if (!yaml.isSeq(document.contents)) throw new Error('Profile patch must be a YAML sequence')
    document.contents.flow = false
    document.contents.items.unshift(document.createNode({ insert: missing }))
    await writeFileAtomic(profile.patchPath, String(document), { mode: 0o600 })
    return true
  })
}

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const observationEntries = catalogRoot => [
  { id: 'workflow-jev-center', name: 'dsh-workflow/jev-center', config: {} },
  { id: 'workflow-agent-monitor', name: 'dsh-workflow/agent-monitor',
    config: { directory: join(catalogRoot, '.dsh-workflow/agent-monitor') } },
]

export function observationProfilePatches(entries, catalogRoot) {
  const missing = [], patches = []
  for (const definition of observationEntries(catalogRoot)) {
    const matches = entries.filter(row => row.id === definition.id)
    if (matches.length > 1 || matches.some(row => row.group)) throw new Error(`Observation entry conflicts with profile: ${definition.id}`)
    const existing = matches[0]
    if (!existing) missing.push(definition)
    else if (existing.name !== definition.name) throw new Error(`Persist the observation entry name before composition: ${definition.id}`)
  }
  if (missing.length) patches.push({insert:missing})
  return patches
}

export const missingObservationEntries = (entries, catalogRoot) => observationProfilePatches(entries,catalogRoot).flatMap(row => row.insert ?? [])

/** Migrate owned declarations and their name guards; `name` is not a rename patch. */
export async function migrateProjectEntryNames({ profile, anchor, projectRoot = fileURLToPath(new URL('../', import.meta.url)), previousProjectRoot }) {
  const require = createRequire(anchor), boot = require('@deepseek-ai/dsh-app-boot')
  const { withFileLock, writeFileAtomic } = require('@deepseek-ai/dsh-atomic-write')
  const base = boot.resolveBundleDir('dsh', '@deepseek-ai/dsh-base', anchor, profile.dir)
  const yaml = createRequire(createRequire(join(base, 'package.json')).resolve('@deepseek-ai/dsh-config-editor/package.json'))('yaml')
  const names = new Map([
    ['workflow-jev-center', 'dsh-workflow/jev-center'],
    ['workflow-agent-monitor', 'dsh-workflow/agent-monitor'],
    ['matt-skills-board', pathToFileURL(join(projectRoot, 'matt-skills-panel-plugin/package/lib/index.js')).href],
    ['matt-panel-tools', 'dsh-workflow-matt-panel/tools'],
    ['mattpocock-skills-zh', '@deepseek-ai/dsh-skill-filesystem'],
  ])
  return withFileLock(join(profile.dir, 'package.json'), async () => {
    let changed = false
    for (const path of [join(profile.dir, 'cordis.yml'), profile.patchPath]) {
      const before = await readFile(path, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error })
      if (before === undefined) continue
      const document = yaml.parseDocument(before, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] })
      if (document.errors[0]) throw document.errors[0]
      if (!yaml.isSeq(document.contents)) throw new Error('Profile entries and patches must be YAML sequences')
      let edited = false
      const visit = sequence => {
        if (!yaml.isSeq(sequence)) return
        for (const row of sequence.items) {
          if (!yaml.isMap(row)) continue
          const name = names.get(row.get('id'))
          if (name && row.has('name') && row.get('name') !== name) {
            if (row.get('group') === true) throw new Error(`Project entry conflicts with group: ${row.get('id')}`)
            row.set('name', name); edited = true
          }
          if (row.get('id') === 'mattpocock-skills-zh' && previousProjectRoot && previousProjectRoot !== projectRoot) {
            const config = row.get('config', true)
            const directories = yaml.isMap(config) && config.get('customSkillDirs', true)
            if (yaml.isSeq(directories)) directories.items.forEach((item, index) => {
              if (yaml.isScalar(item) && item.value === join(previousProjectRoot, 'vendor/mattpocock-skills-zh/skills')) {
                directories.set(index, join(projectRoot, 'vendor/mattpocock-skills-zh/skills')); edited = true
              }
            })
          }
          visit(row.get('insert', true))
          if (row.get('group') === true) visit(row.get('config', true))
        }
      }
      visit(document.contents)
      if (edited) { await writeFileAtomic(path, String(document), { mode: 0o600 }); changed = true }
    }
    return changed
  })
}

/** Register configurable entries before profile overrides, so native Settings owns their values. */
export async function ensureObservationProfile({ profile, anchor, catalogRoot, projectRoot }) {
  const migrated = await migrateProjectEntryNames({ profile, anchor, projectRoot })
  const require = createRequire(anchor)
  const boot = require('@deepseek-ai/dsh-app-boot')
  const { withFileLock, writeFileAtomic } = require('@deepseek-ai/dsh-atomic-write')
  const base = boot.resolveBundleDir('dsh', '@deepseek-ai/dsh-base', anchor, profile.dir)
  const baseRequire = createRequire(join(base, 'package.json'))
  const yaml = createRequire(baseRequire.resolve('@deepseek-ai/dsh-config-editor/package.json'))('yaml')
  const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])
  return withFileLock(join(profile.dir, 'package.json'), async () => {
    const loaded = boot.loadProfileDirectory('dsh', profile.dir, anchor)
    const rootEntries = boot.loadOptionalPatches('dsh', join(profile.dir, 'cordis.yml')) ?? []
    const entries = flatten(boot.composeEntries([{ insert: rootEntries }, ...loaded.layers.map(layer => layer.patches), loaded.patches]))
    const updates = observationProfilePatches(entries, catalogRoot)
    if (!updates.length) return migrated
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
    document.contents.items.unshift(...updates.map(update => document.createNode(update)))
    await writeFileAtomic(profile.patchPath, String(document), { mode: 0o600 })
    return true
  })
}

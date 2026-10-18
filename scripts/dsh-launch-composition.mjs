import { resolve, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { observationProfilePatches } from './observation-profile.mjs'
import { packageMutationModules } from './dsh-delivery-policy.mjs'

const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])

/** Project launch overlay; saved user settings are never changed here. */
export function composeDshLaunch(entries, { projectRoot, catalogRoot }) {
  const root = resolve(projectRoot), all = flatten(entries)
  const patches = observationProfilePatches(all, resolve(catalogRoot))
  const addressable = row => {
    if (typeof row.id !== 'string' || !row.id || all.filter(item => item.id === row.id).length !== 1) {
      throw new Error('Managed readonly package policy requires an unambiguous entry id')
    }
  }
  for (const row of all.filter(row => packageMutationModules.includes(row.name))) {
    addressable(row)
    patches.push({ id: row.id, disabled: true })
  }
  const readonlyPreset = rows => {
    let changed = false
    const result = rows.map(row => {
      if (packageMutationModules.includes(row?.name) && row.disabled !== true) {
        changed = true
        return { ...row, disabled: true }
      }
      if (row?.group && Array.isArray(row.config)) {
        const nested = readonlyPreset(row.config)
        if (nested.changed) { changed = true; return { ...row, config: nested.rows } }
      }
      return row
    })
    return { changed, rows: result }
  }
  for (const row of all.filter(row => row.name === '@deepseek-ai/dsh-agent-preset')) {
    if (!Array.isArray(row.config?.plugins)) throw new Error('Managed readonly package policy cannot read the agent preset composition')
    const preset = readonlyPreset(row.config.plugins)
    if (preset.changed) {
      addressable(row)
      patches.push({ id: row.id, config: { ...row.config, plugins: preset.rows } })
    }
  }
  // The supervisor receives the official authenticated URL through its private
  // host log, even when the saved profile suppresses interactive URL printing.
  for (const row of all.filter(row => row.name === '@deepseek-ai/dsh-web-app' && row.disabled !== true)) {
    patches.push({ id: row.id, config: { ...structuredClone(row.config ?? {}), printUrl: true } })
  }
  const replacements = [
    { id: 'matt-skills-board', name: join(root, 'matt-skills-panel-plugin/package/lib/index.js'), names: ['dsh-mattpocock-skills-deck', 'dsh-workflow-matt-panel'] },
    { id: 'matt-panel-tools', name: 'dsh-workflow-matt-panel/tools', names: ['dsh-mattpocock-skills-deck/tools', 'dsh-workflow-matt-panel/tools'] },
  ]
  const mcpEntries = JSON.parse(readFileSync(join(root, 'project-mcp.json'), 'utf8'))
  const definitions = [
    { id: 'workflow-delivery-inventory', name: 'dsh-workflow/delivery-inventory', config: { projectRoot: root } },
    { id: 'mattpocock-skills-zh', name: '@deepseek-ai/dsh-skill-filesystem', config: { providerName: 'mattpocock-skills-zh', includeDefaultRoots: false, customSkillDirs: [join(root, 'vendor/mattpocock-skills-zh/skills')] } },
    { id: 'dsh-workflow-gh-account', name: '@deepseek-ai/dsh-skill-filesystem', config: { providerName: 'dsh-workflow-gh-account', includeDefaultRoots: false, customSkillDirs: [join(root, 'skills')] } },
    ...mcpEntries.filter(row => !all.some(item => item.name === row.name && item.config?.serverName === row.config.serverName)),
  ]
  for (const replacement of replacements) {
    const matches = all.filter(row => replacement.names.includes(row.name) && row.id !== replacement.id)
    if (matches.some(row => !row.id)) throw new Error('DSH launch cannot replace an unnamed project plugin')
    const active = matches.filter(row => row.disabled !== true)
    if (active.length > 1) throw new Error(`Resolve duplicate active project plugins before DSH composition: ${replacement.id}`)
    patches.push(...matches.map(row => ({ id: row.id, disabled: true })))
    definitions.push({ id: replacement.id, name: replacement.name, config: structuredClone(active[0]?.config ?? {}) })
  }
  const missing = []
  for (const row of definitions) {
    const matches = all.filter(item => item.id === row.id)
    if (matches.length > 1 || matches.some(item => item.group)) throw new Error(`Project entry conflicts: ${row.id}`)
    if (!matches.length) missing.push(row)
    else if (matches[0].name !== (row.name.startsWith('/') ? pathToFileURL(row.name).href : row.name) && matches[0].name !== row.name) throw new Error(`Persist the project entry name before composition: ${row.id}`)
    else if (row.id === 'workflow-delivery-inventory') patches.push({ id: row.id, config: row.config, disabled: false })
  }
  if (missing.length) patches.push({ insert: missing })
  return patches
}

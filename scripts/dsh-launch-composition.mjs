import { resolve, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { blocksPackageMutation, isUnavailablePluginModule } from './dsh-delivery-policy.mjs'

const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])

/** Project launch overlay; saved user settings are never changed here. */
export function composeDshLaunch(entries, { projectRoot, billionContextDelivered = false, profilePlugins = false }) {
  const root = resolve(projectRoot), all = flatten(entries)
  const patches = []
  const retiredIds = new Set(['workflow-jev-center', 'workflow-agent-monitor', 'workflow-project-coordination',
    'preset-deepseekbot', 'matt-skills-board', 'matt-panel-tools', 'workflow-delivery-inventory',
    'workflow-desktop-bridge', 'workflow-browser-harness'])
  const retired = row => retiredIds.has(row.id) || /^(?:@botharness\/|(?:deepseekbot|dsh-workflow(?:-matt-panel|-browser-harness)?)(?:\/|$))/.test(row.name ?? '')
  const disabledModule = name => blocksPackageMutation(name, profilePlugins)
    || isUnavailablePluginModule(name, { billionContextDelivered })
  const addressable = row => {
    if (typeof row.id !== 'string' || !row.id || all.filter(item => item.id === row.id).length !== 1) {
      throw new Error('Managed readonly package policy requires an unambiguous entry id')
    }
  }
  for (const row of all.filter(row => disabledModule(row.name) || retired(row))) {
    addressable(row)
    patches.push({ id: row.id, disabled: true })
  }
  if (profilePlugins) {
    for (const row of all.filter(row => row.name === 'dshmarket' && row.disabled !== true)) {
      addressable(row)
      // Station serves the desktop profile through Web. The market must use the Host manager for that profile.
      patches.push({ id: row.id, config: { ...structuredClone(row.config ?? {}), profile: 'desktop' } })
    }
  }
  const readonlyPreset = rows => {
    let changed = false
    const result = rows.map(row => {
      if ((disabledModule(row?.name) || row && retired(row)) && row.disabled !== true) {
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
  const mcpEntries = JSON.parse(readFileSync(join(root, 'project-mcp.json'), 'utf8'))
  const definitions = [
    { id: 'workflow-browser-harness-skills', name: '@deepseek-ai/dsh-skill-filesystem', config: {
      providerName: 'workflow-browser-harness', includeDefaultRoots: false, customSkillDirs: [join(root, 'browser-harness-plugin/skills')],
    } },
    { id: 'mattpocock-skills-zh', name: '@deepseek-ai/dsh-skill-filesystem', config: { providerName: 'mattpocock-skills-zh', includeDefaultRoots: false, customSkillDirs: [join(root, 'vendor/mattpocock-skills-zh/skills')] } },
    { id: 'dsh-workflow-gh-account', name: '@deepseek-ai/dsh-skill-filesystem', config: { providerName: 'dsh-workflow-gh-account', includeDefaultRoots: false, customSkillDirs: [join(root, 'skills')] } },
    { id: 'dsh-workflow-skills', name: '@deepseek-ai/dsh-skill-filesystem', config: { providerName: 'dsh-workflow-skills', includeDefaultRoots: false, customSkillDirs: [join(root, 'vendor/dsh-skills/skills')] } },
    ...mcpEntries.filter(row => !all.some(item => item.name === row.name && item.config?.serverName === row.config.serverName)),
  ]
  const missing = []
  for (const row of definitions) {
    const matches = all.filter(item => item.id === row.id)
    if (matches.length > 1 || matches.some(item => item.group)) throw new Error(`Project entry conflicts: ${row.id}`)
    if (!matches.length) missing.push(row)
    else if (matches[0].name !== (row.name.startsWith('/') ? pathToFileURL(row.name).href : row.name) && matches[0].name !== row.name) throw new Error(`Persist the project entry name before composition: ${row.id}`)
  }
  if (missing.length) patches.push({ insert: missing })
  return patches
}

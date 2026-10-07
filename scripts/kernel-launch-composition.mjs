import { resolve, join } from 'node:path'
import { observationEntries } from './observation-profile.mjs'

const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])

/** Project-only overlay for the single UKR host. Input is DSH's resolved profile;
 * the caller writes the result to its own launch directory, never a user profile.
 */
export function composeKernelLaunch(entries, { projectRoot, catalogRoot, presetPlugins }) {
  const root = resolve(projectRoot), catalog = resolve(catalogRoot)
  const all = flatten(entries)
  const registries = all.filter(row => row.name === '@deepseek-ai/dsh-agent-preset-registry' && row.disabled !== true)
  if (registries.length !== 1 || !registries[0].id) throw new Error('Kernel launch requires one active named native agent-preset-registry entry')
  if (!Array.isArray(presetPlugins) || presetPlugins[0]?.id !== 'owner-workflow' || presetPlugins[0]?.name !== './plugin.mjs'
    || presetPlugins.some(row => !row?.id || !row?.name)) {
    throw new Error('Kernel launch requires the Owner preset plugin rows')
  }
  const plugins = structuredClone(presetPlugins)
  plugins[0].name = join(root, 'owner-workflow-plugin/kernel-presets/owner-workflow/plugin.mjs')
  plugins[0].config = { ...plugins[0].config, catalogRoot: catalog }
  const patches = []
  const creator = all.find(row => row.name === '@deepseek-ai/dsh-agent-preset' && row.disabled !== true && row.config?.id === 'cordis')
  if (creator) {
    const creatorPlugins = structuredClone(creator.config.plugins)
    creatorPlugins.push({ id: 'workflow-creator-jev-guidance', name: join(root, 'owner-workflow-plugin/src/creator-jev-guidance.mjs') })
    patches.push({ id: creator.id, name: creator.name, config: { ...structuredClone(creator.config), plugins: creatorPlugins } })
  }
  const identities = new Map([
    ['dsh-owner-workflow', 'owner'], ['dsh-owner-workflow/dashboard', 'dashboard'],
    [join(root, 'owner-workflow-plugin/index.js'), 'owner'], [join(root, 'owner-workflow-plugin/dashboard-host.mjs'), 'dashboard'],
    [join(root, 'owner-workflow-plugin/src/kernel-entry.mjs'), 'owner'], [join(root, 'owner-workflow-plugin/src/kernel-dashboard-host.mjs'), 'dashboard'],
    ['dsh-sol-efficiency', 'sol'], [join(root, 'sol-efficiency-plugin/index.js'), 'sol'],
    ['dsh-mattpocock-skills-deck', 'matt-deck'], ['dsh-workflow-matt-panel', 'matt-deck'],
    ['dsh-mattpocock-skills-deck/tools', 'matt-tools'], ['dsh-workflow-matt-panel/tools', 'matt-tools'],
    // Retired entries are disabled in the project overlay without editing user profiles.
    ['dsh-synapse-workflow', 'synapse'], [join(root, 'synapse-workflow-plugin/index.js'), 'synapse'],
  ])
  for (const row of all) {
    if (typeof row.name === 'string' && row.name.endsWith('/sol-efficiency-plugin/index.js')) identities.set(row.name, 'sol')
  }
  const existing = all.filter(row => identities.has(row.name))
  if (existing.some(row => !row.id)) throw new Error('Kernel launch cannot replace an unnamed project plugin')
  const previous = kind => {
    const matches = existing.filter(row => identities.get(row.name) === kind && row.disabled !== true)
    if (matches.length > 1) throw new Error(`Resolve duplicate active ${kind} project plugins before kernel composition`)
    return structuredClone(matches[0]?.config ?? {})
  }
  const mattDeckConfig = previous('matt-deck')
  const mattZhSkills = join(root, 'vendor/mattpocock-skills-zh/skills')
  const owned = [
    ...observationEntries(catalog).filter(definition => {
      const matches = all.filter(row => row.id === definition.id)
      if (matches.length > 1 || matches.some(row => row.name !== definition.name || row.group)) {
        throw new Error(`Observation plugin entry conflicts with profile: ${definition.id}`)
      }
      return matches.length === 0
    }),
    { id: 'preset-owner-workflow', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'owner-workflow', order: 0, plugins } },
    { id: 'kernel-owner-surface', name: join(root, 'owner-workflow-plugin/src/kernel-entry.mjs'), config: { surfaceOnly: true } },
    { id: 'kernel-owner-dashboard', name: 'dsh-owner-workflow/kernel-dashboard', config: { catalogRoot: catalog } },
    { id: 'mattpocock-skills-zh', name: '@deepseek-ai/dsh-skill-filesystem', config: {
      providerName: 'mattpocock-skills-zh', includeDefaultRoots: false, customSkillDirs: [mattZhSkills],
    } },
    { id: 'matt-skills-board', name: join(root, 'matt-skills-panel-plugin/package/lib/index.js'), config: mattDeckConfig },
    { id: 'matt-panel-tools', name: 'dsh-workflow-matt-panel/tools', config: previous('matt-tools') },
  ]
  for (const row of owned) {
    const collision = all.find(item => item.id === row.id)
    if (collision) throw new Error(`Kernel launch identity already exists: ${row.id}`)
  }
  for (const row of existing) {
    patches.push({ id: row.id, disabled: true })
  }
  patches.push({ insert: owned })
  return patches
}

import { resolve, join } from 'node:path'

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
  const patches = [{ id: registries[0].id, config: { ...structuredClone(registries[0].config ?? {}), default: 'owner-workflow' } }]
  const identities = new Map([
    ['dsh-owner-workflow', 'owner'], ['dsh-owner-workflow/dashboard', 'dashboard'],
    [join(root, 'owner-workflow-plugin/index.js'), 'owner'], [join(root, 'owner-workflow-plugin/dashboard-host.mjs'), 'dashboard'],
    [join(root, 'owner-workflow-plugin/src/kernel-entry.mjs'), 'owner'], [join(root, 'owner-workflow-plugin/src/kernel-dashboard-host.mjs'), 'dashboard'],
    ['dsh-sol-efficiency', 'sol'], [join(root, 'sol-efficiency-plugin/index.js'), 'sol'],
    // Retired entries are disabled in the project overlay without editing user profiles.
    ['dsh-synapse-workflow', 'synapse'], [join(root, 'synapse-workflow-plugin/index.js'), 'synapse'],
  ])
  const existing = all.filter(row => identities.has(row.name))
  if (existing.some(row => !row.id)) throw new Error('Kernel launch cannot replace an unnamed project plugin')
  const previous = kind => {
    const matches = existing.filter(row => identities.get(row.name) === kind && row.disabled !== true)
    if (matches.length > 1) throw new Error(`Resolve duplicate active ${kind} project plugins before kernel composition`)
    return structuredClone(matches[0]?.config ?? {})
  }
  const solConfig = previous('sol')
  const owned = [
    { id: 'preset-owner-workflow', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'owner-workflow', order: 0, plugins } },
    { id: 'kernel-owner-surface', name: join(root, 'owner-workflow-plugin/src/kernel-entry.mjs'), config: { surfaceOnly: true } },
    { id: 'kernel-owner-dashboard', name: join(root, 'owner-workflow-plugin/src/kernel-dashboard-host.mjs'), config: { catalogRoot: catalog } },
    ...(existing.some(row => identities.get(row.name) === 'sol' && row.disabled !== true)
      ? [] : [{ id: 'kernel-sol', name: 'dsh-sol-efficiency', config: solConfig }]),
  ]
  for (const row of owned) {
    const collision = all.find(item => item.id === row.id)
    if (collision) throw new Error(`Kernel launch identity already exists: ${row.id}`)
  }
  for (const row of existing) {
    if (identities.get(row.name) === 'sol' && row.disabled !== true) continue
    patches.push({ id: row.id, disabled: true })
  }
  patches.push({ insert: owned })
  return patches
}

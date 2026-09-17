import { resolve, join } from 'node:path'

const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])

/** Project-only overlay for the single UKR host. Input is DSH's resolved profile;
 * the caller writes the result to its own launch directory, never a user profile.
 * Approval composition remains owned by composeApprovalPatches. */
export function composeKernelLaunch(entries, { projectRoot, catalogRoot }) {
  const root = resolve(projectRoot), catalog = resolve(catalogRoot)
  const all = flatten(entries)
  const presets = all.filter(row => row.name === '@deepseek-ai/dsh-agent-presets' && row.disabled !== true)
  if (presets.length !== 1 || !presets[0].id) throw new Error('Kernel launch requires one active named native agent-presets entry')
  const preset = presets[0]
  const config = preset.config ?? {}
  if ('__jsExpr' in config || config.roots !== undefined && !Array.isArray(config.roots)) throw new Error('Resolve computed preset roots before kernel composition')
  const legacyRoot = join(root, 'owner-workflow-plugin/agent-presets')
  const presetRoot = join(root, 'owner-workflow-plugin/kernel-presets')
  const roots = (config.roots ?? []).filter(item => resolve(typeof item === 'string' ? item : item.path) !== legacyRoot
    && resolve(typeof item === 'string' ? item : item.path) !== presetRoot)
  const patches = [{ id: preset.id, config: { ...structuredClone(config), default: 'owner-workflow',
    roots: [{ path: presetRoot, trust: 'system' }, ...structuredClone(roots)] } }]
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
  const owned = [
    { id: 'kernel-owner-surface', name: join(root, 'owner-workflow-plugin/src/kernel-entry.mjs'), config: { surfaceOnly: true } },
    { id: 'kernel-owner-dashboard', name: join(root, 'owner-workflow-plugin/src/kernel-dashboard-host.mjs'), config: { catalogRoot: catalog } },
    { id: 'kernel-sol', name: 'dsh-sol-efficiency', config: previous('sol') },
  ]
  for (const row of owned) {
    const collision = all.find(item => item.id === row.id)
    if (collision) throw new Error(`Kernel launch identity already exists: ${row.id}`)
  }
  for (const row of existing) patches.push({ id: row.id, disabled: true })
  patches.push({ insert: owned })
  return patches
}

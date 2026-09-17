const flatten = rows => rows.flatMap(row => [row,
  ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && !('__jsExpr' in value)
const packageName = 'dsh-approve-for-me-workflow'

/** Compose over resolved profile entries before boot. Never mutate host services
 * or overwrite a customized preset table with the standard bundle defaults. */
export function composeApprovalPatches(entries) {
  const all = flatten(entries)
  const permissions = all.filter(row => row.name === '@deepseek-ai/dsh-permission-presets' && row.disabled !== true)
  if (permissions.length !== 1 || !permissions[0].id) throw new Error('Approval adapter requires one named native permission entry')
  const permission = permissions[0]
  if (!record(permission.config) || !record(permission.config.presets)) {
    throw new Error('Approval adapter requires an explicit permission preset table; resolve computed config before composing')
  }
  const existingPreset = permission.config.presets['approve-for-me']
  if (existingPreset && (existingPreset.sandbox !== 'workspace-write' || existingPreset.approval !== 'ask')) {
    throw new Error('Existing approve-for-me preset has a different policy; review the profile instead of replacing it')
  }
  const hosts = all.filter(row => ['dsh-approve-for-me', packageName].includes(row.name))
  if (hosts.some(row => !row.id) || hosts.length > 1) throw new Error('Resolve duplicate or unnamed approval plugins before composing')
  const patches = [{ id: permission.id, config: {
    ...permission.config, presets: { ...permission.config.presets, 'approve-for-me': existingPreset ?? {
      sandbox: 'workspace-write', approval: 'ask', name: 'Approve for me',
      description: 'Review shell escalation with fixed rules and an optional reviewer, with native human fallback.',
    } },
  } }]
  for (const host of hosts) patches.push({ id: host.id, disabled: true })
  if (all.some(row => row.id === 'project-approve-for-me' && row.name !== packageName)) {
    throw new Error('Profile entry project-approve-for-me is already used by another plugin')
  }
  // Reuse the existing row for an already adapted profile. Otherwise disable
  // the legacy row and install a new uniquely named native bundle entry.
  const host = hosts[0]
  const entry = { id: host?.name === packageName ? host.id : 'project-approve-for-me', name: packageName,
    ...host?.config ? { config: structuredClone(host.config) } : {},
    ...host?.disabled === true ? { disabled: true } : {} }
  if (host?.name === packageName) patches.pop()
  if (host?.name !== packageName) patches.push({ insert: [entry] })
  return structuredClone(patches)
}

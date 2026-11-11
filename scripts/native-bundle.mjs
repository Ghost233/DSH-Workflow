/** Compose official multi-entry patches while preserving existing user configuration and disables. */
export function nativeBundlePatches(boot, directory, manifest, entries) {
  const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])
  const existing = flatten(entries)
  const patches = boot.bundlePatchPaths(directory, manifest.dsh.bundle).flatMap(path => boot.loadOverlayPatches('dsh', path))
  return patches.flatMap(patch => {
    if (!Array.isArray(patch.insert)) throw new Error('Native bundle changed its insertion contract; review its upstream patch')
    const insert = patch.insert.filter(row => {
      const matches = existing.filter(item => item.id === row.id)
      if (matches.length > 1 || matches.some(item => item.name !== row.name)) throw new Error(`Native bundle entry conflict: ${row.id}`)
      if (existing.some(item => item.name === row.name && item.id !== row.id
        && (row.name !== '@deepseek-ai/dsh-agent-preset' || item.config?.id === row.config?.id))) throw new Error(`Native bundle module already has another identity: ${row.name}`)
      return !matches.length
    })
    return insert.length ? [{ ...patch, insert }] : []
  })
}

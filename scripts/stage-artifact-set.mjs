import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readArtifactSet } from './upstream-artifacts.mjs'

/** Pin every internal package to the same verified official product set. */
export async function stageArtifactSet(root, item, directory) {
  const set = await readArtifactSet(root, item)
  const lock = JSON.parse(await readFile(join(root, 'project-plugins.lock.json'), 'utf8'))
  if (lock.plugins.find(row => row.package === item.package)?.artifactSetSha256 !== set.manifestSha256) throw new Error('Artifact set differs from the generated project lock')
  for (const component of [...item.components, ...(item.runtimePackages ?? [])]) {
    if (!set.entries.some(row => row.name === component.package && row.version === component.version)) throw new Error(`Missing pinned component: ${component.package}`)
  }
  await mkdir(join(directory, 'tarballs'), { recursive: true })
  const dependencies = {}, optionalDependencies = {}, overrides = {}
  for (const entry of set.entries) {
    await copyFile(entry.path, join(directory, 'tarballs', entry.filename))
    const target = entry.platform ? optionalDependencies : dependencies
    target[entry.name] = `file:tarballs/${entry.filename}`
    overrides[entry.name] = `$${entry.name}`
  }
  return { dependencies, optionalDependencies, overrides, product: set.product,
    artifactSetSha256: set.manifestSha256 }
}

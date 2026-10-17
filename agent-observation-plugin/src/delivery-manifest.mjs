import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const readJson = async path => {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}

/** The packaged repository manifest and generated lock are the runtime version authority. */
export async function readDeliveryManifest(workflow) {
  const manifest = await readJson(join(workflow, 'project-plugins.json'))
  if (!manifest) return undefined
  const bytes = await readFile(join(workflow, 'project-plugins.json'))
  const lock = await readJson(join(workflow, 'project-plugins.lock.json'))
  const runtime = await readJson(join(workflow, 'dsh-runtime.json'))
  if (!Array.isArray(manifest.plugins) || lock?.schema !== 1 || lock.harnessVersion !== runtime?.version || lock.registry !== manifest.registry
    || lock.manifestSha256 !== createHash('sha256').update(bytes).digest('hex')
    || lock.plugins?.length !== manifest.plugins.length
    || manifest.plugins.some(item => {
      const pin = lock.plugins.find(row => row.package === item.package)
      return !pin || pin.version !== item.version || pin.metadata?.name !== item.package || pin.metadata?.version !== item.version
    })) throw new Error('Project plugin lock does not match the packaged manifest')
  const config = manifest
  const names = new Set()
  if (!Array.isArray(config.plugins) || new URL(config.registry).protocol !== 'https:') throw new Error('Invalid project plugin configuration')
  for (const item of config.plugins) {
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(item.package)
      || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(item.version)
      || names.has(item.package) || item.source && item.source !== 'npm') throw new Error('Invalid or duplicate project plugin configuration')
    names.add(item.package)
  }
  return config
}

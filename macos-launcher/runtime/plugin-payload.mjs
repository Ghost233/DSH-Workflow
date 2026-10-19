import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { readFile, writeFile, readdir, lstat, readlink, mkdir, rename, symlink, unlink } from 'node:fs/promises'
import { join, dirname, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readDeliveryManifest, pluginDependencySpec } from '../../agent-observation-plugin/src/delivery-manifest.mjs'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const sealPath = resources => join(resources, 'plugin-payload.json')
const selected = config => config.plugins.filter(item => item.startup === true)
const optional = promise => promise.catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })

async function members(root) {
  const files = []
  async function visit(path = '') {
    const entries = (await readdir(join(root, path), { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    for (const entry of entries) {
      const relative = path ? `${path}/${entry.name}` : entry.name
      if (entry.isDirectory()) await visit(relative)
      else if (entry.isFile()) files.push(relative)
      else throw new Error(`Plugin payload contains an unsealed link or special file: ${relative}`)
    }
  }
  await visit()
  const result = new Array(files.length)
  let cursor = 0, failure
  await Promise.all(Array.from({ length: Math.min(8, files.length) }, async () => {
    while (!failure && cursor < files.length) {
      const index = cursor++, path = files[index], absolute = join(root, path)
      try {
        const info = await lstat(absolute)
        if (!info.isFile()) throw new Error(`Plugin payload contains an unsealed link or special file: ${path}`)
        result[index] = [path, { sha256: digest(await readFile(absolute)), mode: info.mode & 0o777 }]
      } catch (error) { failure ??= error }
    }
  }))
  if (failure) throw failure
  return Object.fromEntries(result)
}

function assertSources(config, plugins) {
  const expected = selected(config)
  if (!Array.isArray(plugins) || plugins.length !== expected.length
    || new Set(plugins.map(row => row.package)).size !== expected.length) throw new Error('Plugin payload must contain every startup plugin exactly once')
  for (const item of expected) {
    const actual = plugins.find(row => row.package === item.package)
    if (!actual || actual.version !== item.version || actual.commit !== item.commit
      || actual.repository !== item.repository || (actual.source ?? 'npm') !== (item.source ?? 'npm')
      || !/^[a-f0-9]{64}$/.test(actual.archiveSha256 ?? '')) throw new Error(`Plugin payload source mismatch: ${item.package}`)
  }
}

async function assertEntries(resources, config) {
  for (const item of selected(config)) {
    const root = join(resources, 'plugins/node_modules', item.package)
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    if (manifest.name !== item.package || manifest.version !== item.version) throw new Error(`Plugin payload version mismatch: ${item.package}`)
    const require = createRequire(join(root, 'package.json'))
    for (const entry of [item.package, `${item.package}/client`]) {
      try { await readFile(require.resolve(entry)) }
      catch (error) { throw new Error(`Plugin payload entry missing: ${entry}`, { cause: error }) }
    }
    const patch = manifest.dsh?.bundle?.patch
    if (!patch || !manifest.dsh?.client) throw new Error(`Plugin payload bundle/client missing: ${item.package}`)
    for (const path of Array.isArray(patch) ? patch : [patch]) await readFile(join(root, path))
  }
}

/** Seal the installed production graph, including transitive dependencies, against the repository pins. */
export async function sealPluginPayload(resourcesRoot, plugins) {
  resourcesRoot = resolve(resourcesRoot)
  const config = await readDeliveryManifest(join(resourcesRoot, 'workflow'))
  if (!config) throw new Error('Missing plugin delivery manifest')
  assertSources(config, plugins)
  await assertEntries(resourcesRoot, config)
  const seal = { schema: 1,
    manifestSha256: digest(await readFile(join(resourcesRoot, 'workflow/project-plugins.json'))),
    lockSha256: digest(await readFile(join(resourcesRoot, 'workflow/project-plugins.lock.json'))),
    plugins, members: await members(join(resourcesRoot, 'plugins')) }
  await writeFile(sealPath(resourcesRoot), JSON.stringify(seal, null, 2) + '\n', { flag: 'wx' })
  return seal
}

/** Static release gate and runtime integrity check; never installs or imports plugin code. */
export async function verifyPluginPayload(resourcesRoot, projectRoot) {
  resourcesRoot = resolve(resourcesRoot)
  const bytes = await readFile(sealPath(resourcesRoot))
  const seal = JSON.parse(bytes)
  const config = await readDeliveryManifest(join(resourcesRoot, 'workflow'))
  if (!config || seal.schema !== 1) throw new Error('Invalid plugin delivery payload')
  for (const [name, field] of [['project-plugins.json', 'manifestSha256'], ['project-plugins.lock.json', 'lockSha256']]) {
    if (digest(await readFile(join(resourcesRoot, 'workflow', name))) !== seal[field]
      || projectRoot && digest(await readFile(join(projectRoot, name))) !== seal[field]) throw new Error(`Plugin delivery input mismatch: ${name}`)
  }
  assertSources(config, seal.plugins)
  if (JSON.stringify(await members(join(resourcesRoot, 'plugins'))) !== JSON.stringify(seal.members)) {
    throw new Error('Plugin payload content mismatch: missing, changed or unexpected files')
  }
  await assertEntries(resourcesRoot, config)
  return { ...seal, sha256: digest(bytes) }
}

/** Deploy only sealed DMG payloads; profile settings and explicit disabled entries remain user-owned. */
export async function deployPluginPayload({ resourcesRoot, profile }) {
  if (!existsSync(sealPath(resourcesRoot)) && !existsSync(join(resourcesRoot, 'project-layer.json'))) return undefined
  const seal = await verifyPluginPayload(resourcesRoot)
  const manifestPath = join(profile, 'package.json')
  const before = await readFile(manifestPath, 'utf8'), manifest = JSON.parse(before)
  manifest.dependencies ??= {}
  const config = await readDeliveryManifest(join(resourcesRoot, 'workflow'))
  const changes = []
  for (const item of selected(config)) {
    const link = join(profile, 'node_modules', item.package), target = join(resolve(resourcesRoot), 'plugins/node_modules', item.package)
    const info = await optional(lstat(link))
    const previousLink = info?.isSymbolicLink() ? await readlink(link) : undefined
    const same = previousLink !== undefined && resolve(dirname(link), previousLink) === target
    if (!same) changes.push({ link, target, existed: Boolean(info), package: item.package, previousLink })
    manifest.dependencies[item.package] = pluginDependencySpec(item)
  }
  const changedManifest = JSON.stringify(manifest) !== JSON.stringify(JSON.parse(before))
  if (!changes.length && !changedManifest) return { changed: false, sha256: seal.sha256 }
  const backup = join(profile, '.dsh-workflow/plugin-backups', randomUUID())
  await mkdir(backup, { recursive: true, mode: 0o700 })
  await writeFile(join(backup, 'package.json'), before, { mode: 0o600 })
  await writeFile(join(backup, 'deployment.json'), JSON.stringify({ payloadSha256: seal.sha256, changes }, null, 2) + '\n', { mode: 0o600 })
  const completed = [], temporaryManifest = `${manifestPath}.${randomUUID()}.tmp`
  try {
    for (const change of changes) {
      const saved = join(backup, 'node_modules', change.package), temporary = `${change.link}.${randomUUID()}.tmp`
      await mkdir(dirname(change.link), { recursive: true })
      await symlink(change.target, temporary)
      try {
        if (change.existed) { await mkdir(dirname(saved), { recursive: true }); await rename(change.link, saved) }
        completed.push({ ...change, saved, installed: false })
        if (change.previousLink !== undefined && !isAbsolute(change.previousLink)) {
          const backupLink = `${saved}.${randomUUID()}.tmp`
          try {
            await symlink(resolve(dirname(change.link), change.previousLink), backupLink)
            await rename(backupLink, saved)
          } finally { await optional(unlink(backupLink)) }
        }
        await rename(temporary, change.link)
        completed.at(-1).installed = true
      } finally { await optional(unlink(temporary)) }
    }
    await writeFile(temporaryManifest, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
    await rename(temporaryManifest, manifestPath)
  } catch (error) {
    const failures = [error]
    for (const change of completed.reverse()) {
      try {
        if (change.installed) await unlink(change.link)
        if (change.existed) {
          if (change.previousLink !== undefined && !isAbsolute(change.previousLink)) {
            await symlink(change.previousLink, change.link)
            await unlink(change.saved)
          } else await rename(change.saved, change.link)
        }
      } catch (rollbackError) { failures.push(rollbackError) }
    }
    if (failures.length > 1) throw new AggregateError(failures, `Plugin deployment failed; restore preserved backup: ${backup}`, { cause: error })
    throw error
  } finally { await optional(unlink(temporaryManifest)) }
  return { changed: true, backup, sha256: seal.sha256 }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'verify' || !process.argv[3]) throw new Error('Usage: plugin-payload.mjs verify RESOURCES [PROJECT_ROOT]')
  const seal = await verifyPluginPayload(process.argv[3], process.argv[4])
  console.log(JSON.stringify({ sha256: seal.sha256, plugins: seal.plugins.map(({ package: name, version, commit }) => ({ package: name, version, ...(commit ? { commit } : {}) })) }))
}

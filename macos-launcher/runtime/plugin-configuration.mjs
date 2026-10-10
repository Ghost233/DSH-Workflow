import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'

export const configurationPath = home => join(home, 'workflow', 'project-plugins.json')
const readJson = async path => {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}

/** The packaged manifest seeds one writable configuration shared by both profiles. */
export async function readPluginConfiguration(resources, home) {
  const saved = await readJson(configurationPath(home))
  let config = saved
  if (!config) {
    const workflow = join(resources, 'workflow')
    const manifest = await readJson(join(workflow, 'project-plugins.json'))
    if (!manifest) return undefined
    const bytes = await readFile(join(workflow, 'project-plugins.json'))
    const lock = await readJson(join(workflow, 'project-plugins.lock.json'))
    const runtime = await readJson(join(workflow, 'dsh-runtime.json'))
    if (lock?.schema !== 1 || lock.harnessVersion !== runtime?.version || lock.registry !== manifest.registry
      || lock.manifestSha256 !== createHash('sha256').update(bytes).digest('hex')
      || lock.plugins?.length !== manifest.plugins?.length
      || manifest.plugins.some(item => {
        const pin = lock.plugins.find(row => row.package === item.package)
        return !pin || pin.version !== item.version || pin.metadata?.name !== item.package || pin.metadata?.version !== item.version
      })) throw new Error('Project plugin lock does not match the packaged manifest')
    config = manifest
  }
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

export async function savePluginConfiguration(home, config) {
  const path = configurationPath(home)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
    await rename(temporary, path)
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
}

/** Refuse package-manager reconciliation when it would silently replace an installed plugin. */
export async function assertProfilePluginVersions(profile, config, expected = new Map()) {
  const manifest = await readJson(join(profile, 'package.json'))
  for (const item of config?.plugins ?? []) {
    const declaration = manifest?.dependencies?.[item.package]
    const installed = await readJson(join(profile, 'node_modules', item.package, 'package.json'))
    if (declaration === undefined && !installed && !expected.has(item.package)) continue
    const target = expected.get(item.package) ?? item.version
    if (declaration !== target || installed?.name !== item.package || installed.version !== target) {
      throw new Error(`插件版本偏差：${item.package}，配置 ${target}，依赖声明 ${declaration ?? '缺失'}，实际安装 ${installed?.version ?? '缺失'}。请先统一配置与安装状态，已停止依赖操作。`)
    }
  }
}

/** Guard project CLI add/remove operations, including removal of unrelated test drivers. */
export async function manageProfilePluginOperation({ resources, home, profileName, args, synchronize = false, run }) {
  const config = await readPluginConfiguration(resources, home)
  const profile = join(home, 'profiles', profileName)
  const selected = new Set(args.slice(1).filter(value => !value.startsWith('--')).map(value => value.slice(0, value.lastIndexOf('@'))))
  await assertProfilePluginVersions(profile, synchronize ? { ...config, plugins: config?.plugins.filter(item => !selected.has(item.package)) ?? [] } : config)
  const manifest = await readJson(join(profile, 'package.json'))
  const expected = new Map((config?.plugins ?? []).filter(item => manifest?.dependencies?.[item.package] !== undefined).map(item => [item.package, item.version]))
  for (const item of config?.plugins ?? []) {
    if (args[0] === 'remove' && args.includes(item.package)) {
      throw new Error(`请先从统一插件配置移除 ${item.package}，再卸载插件。`)
    }
    if (args[0] === 'add') {
      const spec = args.find(value => value.startsWith(`${item.package}@`))
      if (spec) {
        const version = spec.slice(item.package.length + 1)
        if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('插件更新必须指定精确版本')
        if (synchronize && version !== item.version) throw new Error('同步只能安装统一配置中的版本')
        expected.set(item.package, version)
      }
    }
  }
  await run()
  await assertProfilePluginVersions(profile, config, expected)
  if (config) {
    for (const item of config.plugins) item.version = expected.get(item.package) ?? item.version
    await savePluginConfiguration(home, config)
  }
}

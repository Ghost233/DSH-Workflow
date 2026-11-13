import { readDeliveryManifest, pluginDependencySpec, isProfilePlugin } from '../../agent-observation-plugin/src/delivery-manifest.mjs'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir, unlink, link } from 'node:fs/promises'
import { join, dirname } from 'node:path'

export const startupChecklistPath = dataRoot => join(dataRoot, 'startup-plugins.json')
const readJson = async path => {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}

/** Packaged repository pins; historical home files are not a version authority. */
export const readPluginConfiguration = resources => readDeliveryManifest(join(resources, 'workflow'))

const legacyChecklist = config =>
  (config?.plugins ?? []).filter(item => item.startup === true && isProfilePlugin(config, item))
    .map(item => item.package)

const validChecklist = names => Array.isArray(names) && names.every(name => typeof name === 'string'
  && /^(?:@[a-z0-9_][a-z0-9._-]*\/)?[a-z0-9_][a-z0-9._-]*$/i.test(name))
  && new Set(names).size === names.length

export async function readStartupChecklist(dataRoot, config, resources) {
  if (config?.npmStartup !== 'profile') return []
  const path = dataRoot && startupChecklistPath(dataRoot)
  const load = async () => {
    let names
    try { names = JSON.parse(await readFile(path, 'utf8')) }
    catch (error) {
      if (error.code === 'ENOENT') return undefined
      throw new Error(`无法读取启动检查名单 ${path}：${error.message}`, { cause: error })
    }
    if (!validChecklist(names)) {
      throw new Error(`启动检查名单须为不重复的包名数组：${path}`)
    }
    return names
  }
  const existing = path && await load()
  if (existing) return existing
  const defaultsPath = resources && join(resources, 'workflow/default-startup-plugins.json')
  const packaged = defaultsPath ? await readJson(defaultsPath) : undefined
  const defaults = packaged === undefined ? legacyChecklist(config) : packaged
  if (!validChecklist(defaults)) throw new Error(`无效的包内启动检查名单：${defaultsPath}`)
  if (!path) return defaults
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(defaults, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    // Initializing from defaults must never replace a local checklist.
    try { await link(temporary, path) }
    catch (error) { if (error.code !== 'EEXIST') throw error }
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
  return await load() ?? defaults
}

/** Refuse package-manager reconciliation when it would silently replace an installed plugin. */
export async function assertProfilePluginVersions(profile, config, expected = new Map()) {
  const manifest = await readJson(join(profile, 'package.json'))
  for (const item of config?.plugins ?? []) {
    if (isProfilePlugin(config, item)) continue
    const declaration = manifest?.dependencies?.[item.package]
    const installed = await readJson(join(profile, 'node_modules', item.package, 'package.json'))
    if (declaration === undefined && !installed && !expected.has(item.package)) continue
    const target = expected.get(item.package) ?? item.version
    const dependency = item.source === 'git' ? pluginDependencySpec(item) : target
    const bundledLink = config.npmStartup === 'profile' && typeof declaration === 'string' && declaration.startsWith('link:')
    if ((declaration !== dependency && !bundledLink) || installed?.name !== item.package || installed.version !== target) {
      throw new Error(`插件版本偏差：${item.package}，配置 ${target}，依赖声明 ${declaration ?? '缺失'}，实际安装 ${installed?.version ?? '缺失'}。请先统一配置与安装状态，已停止依赖操作。`)
    }
  }
}

/** Check the shared DSH profile before writing any Station integration. */
export async function assertRequiredProfilePlugins(profile, required, resources, dataRoot) {
  const missing = []
  for (const name of required) {
    try {
      const installed = await readJson(join(profile, 'node_modules', name, 'package.json'))
      if (installed?.name !== name) missing.push(name)
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      missing.push(name)
    }
  }
  if (missing.length) {
    const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
    const install = resources ? '\n安装命令：' + [join(resources, 'node'),
      join(resources, 'workflow/macos-launcher/runtime/profile-plugin-install.mjs'), ...missing].map(quote).join(' ') : ''
    const checklist = dataRoot ? `\n可在 Station「插件」页编辑启动检查名单，或直接编辑 ${startupChecklistPath(dataRoot)}` : ''
    throw new Error(`DSH 未启动。请先在 DSH 全局 desktop profile 安装必需插件，再重新启动：\n${missing.join('\n')}${install}${checklist}`)
  }
}

if (import.meta.main) {
  try {
    const [resources, dataRoot] = process.argv.slice(2)
    if (!resources || !dataRoot) throw new Error('Usage: plugin-configuration.mjs RESOURCES DATA_ROOT')
    const config = await readPluginConfiguration(resources)
    if (config?.npmStartup !== 'profile') throw new Error('当前应用没有本地启动检查名单')
    const names = await readStartupChecklist(dataRoot, config, resources)
    process.stdout.write(JSON.stringify({ names }) + '\n')
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}

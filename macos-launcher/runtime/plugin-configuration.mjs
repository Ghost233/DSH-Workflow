import { readDeliveryManifest, pluginDependencySpec, isProfilePlugin } from '../../agent-observation-plugin/src/delivery-manifest.mjs'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'

export const configurationPath = home => join(home, 'workflow', 'project-plugins.json')
export function assertPackageMaintenanceResource(resources) {
  if (['project-layer.json', 'maclauncher.json', 'desktop'].some(name => existsSync(join(resources, name)))) {
    throw new Error('运行端插件随本仓库正式 DMG 统一更新，打包应用不执行插件包维护。')
  }
}
const readJson = async path => {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}

/** Packaged repository pins; historical home files are not a version authority. */
export const readPluginConfiguration = resources => readDeliveryManifest(join(resources, 'workflow'))

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
export async function assertRequiredProfilePlugins(profile, config, resources) {
  const missing = []
  for (const item of config?.plugins ?? []) {
    if (item.startup !== true || !isProfilePlugin(config, item)) continue
    const installed = await readJson(join(profile, 'node_modules', item.package, 'package.json'))
    if (installed?.name !== item.package || typeof installed.version !== 'string' || !installed.version) missing.push(item.package)
  }
  if (missing.length) {
    const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
    const install = resources ? '\n安装命令：' + [join(resources, 'node'),
      join(resources, 'workflow/macos-launcher/runtime/profile-plugin-install.mjs'), ...missing].map(quote).join(' ') : ''
    throw new Error(`DSH 未启动。请先在 DSH 全局 desktop profile 安装必需插件，再重新启动：\n${missing.join('\n')}${install}`)
  }
}

/** Maintenance may add only exact packaged pins; runtime replacement and removal stay closed. */
export async function manageProfilePluginOperation({ resources, home, profileName, args, run }) {
  assertPackageMaintenanceResource(resources)
  const config = await readPluginConfiguration(resources)
  const profile = join(home, 'profiles', profileName)
  await assertProfilePluginVersions(profile, config)
  const refused = () => { throw new Error('运行端插件随本仓库正式 DMG 统一更新；维护入口只允许添加清单中精确锁定的版本。') }
  if (!config || args[0] !== 'add') refused()
  const selected = new Map()
  for (let index = 1; index < args.length; index++) {
    const value = args[index]
    if (value === '--save-exact') continue
    if (value === '--registry') {
      if (args[++index] !== config.registry) refused()
      continue
    }
    const item = config.plugins.find(item => item.source !== 'git' && `${item.package}@${item.version}` === value)
    if (!item) refused()
    selected.set(item.package, item.version)
  }
  if (!selected.size) refused()
  await run()
  await assertProfilePluginVersions(profile, config, selected)
}

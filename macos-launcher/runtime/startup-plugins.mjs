import { readFile, realpath } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { readPluginConfiguration } from './plugin-configuration.mjs'
import { nativeBundlePatches } from '../../scripts/native-bundle.mjs'
import { pluginDependencySpec, isProfilePlugin } from './delivery-manifest.mjs'

/** Compose fixed deliveries. DSH owns the lifecycle of packages in the profile checklist. */
export async function prepareStartupPlugins({ profile, entries, config, boot }) {
  const patches = [], skipped = []
  const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])
  const existing = flatten(entries)
  for (const item of config?.plugins.filter(row => row.startup === true) ?? []) {
    if (isProfilePlugin(config, item)) continue
    const matches = existing.filter(row => row.name === item.package || row.name?.startsWith(item.package + '/')
      || item.components?.some(component => row.name === component.package))
    // Git pins must also validate existing entries before allowing the normal Host loader to try them.
    if (matches.length && !['git', 'artifact'].includes(item.source)) continue
    let installedVersion, installedSource
    try {
      installedSource = await realpath(join(profile, 'node_modules', item.package))
      const manifestPath = join(installedSource, 'package.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      installedVersion = manifest.version
      if (manifest.name !== item.package || manifest.version !== item.version) {
        throw new Error(`已安装版本 ${manifest.version ?? '未知'} 偏离包内固定值 ${item.version}，未替换运行包。`)
      }
      for (const component of [...(item.components ?? []), ...(item.runtimePackages ?? [])]) {
        const metadata = JSON.parse(await readFile(join(profile, 'node_modules', component.package, 'package.json'), 'utf8'))
        if (metadata.name !== component.package || metadata.version !== component.version) throw new Error(`组件版本偏离固定值：${component.package}`)
      }
      if (item.source === 'git') {
        const profileManifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'))
        const declaration = profileManifest.dependencies?.[item.package], dependency = pluginDependencySpec(item)
        const linkedPath = config.npmStartup === 'profile' && declaration?.startsWith('link:') ? declaration.slice(5) : ''
        const linkedSource = isAbsolute(linkedPath) ? await realpath(linkedPath).catch(error => {
          if (error.code !== 'ENOENT') throw error
        }) : undefined
        if (declaration !== dependency && linkedSource !== installedSource) {
          throw new Error(`依赖来源声明 ${declaration ?? '缺失'} 偏离包内固定值 ${dependency}，未替换运行包。`)
        }
      }
      // Keep existing conditions, configuration and user-disabled state after source validation.
      if (matches.length && item.bundle !== 'native') continue
      // The actual Host owns module resolution and execution, including its public peer mappings.
      const candidate = item.bundle === 'native' ? nativeBundlePatches(boot, installedSource, manifest, entries) : manifest.dsh?.bundle
        ? boot.bundlePatchPaths(installedSource, manifest.dsh.bundle).flatMap(path => boot.loadOverlayPatches('dsh', path))
        : [{ insert: [{ id: `project-startup-${item.entryId ?? item.package}`, name: item.package }] }]
      // Compose a cloned full tree, then use the same traversal as profile preparation before accepting this package.
      flatten(boot.composeEntries([[{ insert: entries }], patches, candidate]))
      patches.push(...candidate)
    } catch (error) {
      patches.push(...matches.filter(row => row.disabled !== true).map(row => ({ id: row.id, disabled: true })))
      const reason = error.code === 'ENOENT' || error.code === 'MODULE_NOT_FOUND'
        ? '固定插件未部署或入口依赖不可用；打包运行端不在线安装或换包。'
        : `启动插件尝试失败：${String(error.message).slice(0, 300)}`
      skipped.push({ package: item.package, installedVersion: installedVersion ?? null,
        installedSource: installedSource ?? null, reason })
    }
  }
  return { patches, skipped }
}

/** Match Station's startup checklist against the official Host inventory. */
export async function startupPluginResults({ resourcesRoot, profile, entries, preparation = [], checklist }) {
  const config = await readPluginConfiguration(resourcesRoot)
  if (!config) throw new Error('Missing packaged startup plugin configuration')
  const items = config.plugins.filter(item => item.startup === true && (checklist === undefined || !isProfilePlugin(config, item)))
  const profileNames = new Set(checklist)
  const included = new Set(items.map(item => item.package))
  items.push(...[...profileNames].filter(name => !included.has(name)).map(name => ({ package: name })))
  const isActive = row => row.enabled === true && row.fiberPhase === 'active'
  const observe = async (name, expected) => {
    const matches = entries.filter(row => row.moduleName === name || row.moduleName?.startsWith(name + '/'))
    let installedVersion, installedSource
    try {
      const source = await realpath(join(profile, 'node_modules', name))
      const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
      if (pkg.name === name && typeof pkg.version === 'string') {
        installedVersion = pkg.version
        installedSource = source
      }
    } catch { /* Unverified metadata cannot establish an installed version. */ }
    const loaded = matches.some(isActive) && Boolean(installedVersion) && (!expected || installedVersion === expected)
    return { matches, loaded, installedVersion, installedSource }
  }
  return Promise.all(items.map(async item => {
    const attempted = preparation.find(row => row.package === item.package)
    if (item.bundle === 'native') {
      const components = await Promise.all(item.components.map(async component => {
        const observed = await observe(component.package, component.version)
        return { ...component, loaded: observed.loaded, installedSource: observed.installedSource ?? null }
      }))
      const requiredEntries = (item.requiredEntries ?? []).map(id => {
        const matches = entries.filter(row => row.entryId?.split(':').at(-1) === id)
        return { id, loaded: matches.length === 1 && isActive(matches[0]) }
      })
      const loaded = !attempted && components.every(component => component.loaded) && requiredEntries.every(row => row.loaded)
      return { package: item.package, version: item.version, versionSource: 'packaged-lock',
        state: loaded ? 'loaded' : 'skipped', components, requiredEntries, reason: attempted?.reason
          ?? (loaded ? '当前 Host 已加载全部固定组件。' : '部分组件未加载；请查看组件状态与 Host 日志。') }
    }
    const profileManaged = (item.version === undefined && profileNames.has(item.package)) || isProfilePlugin(config, item)
    const expected = profileManaged ? undefined : item.version
    const { matches, loaded, installedVersion, installedSource } = await observe(item.package, expected)
    let reason
    if (attempted) reason = attempted.reason
    else if (loaded) reason = 'DSH 官方清单确认插件入口已加载。'
    else if (!matches.length) reason = '当前 Host 未装配该插件。'
    else if (matches.every(row => row.enabled === false)) reason = '当前 profile 已停用该插件，保留用户选择。'
    else if (matches.some(row => row.fiberPhase === 'failed')) reason = '当前 Host 插件加载失败；请检查该插件日志。'
    else if (matches.some(row => row.enabled === true && row.fiberPhase === null)) reason = '当前 Host 插件导入失败；请检查 Host 日志。'
    else if (expected && installedVersion && installedVersion !== expected) reason = '插件安装版本偏离包内固定版本。'
    else reason = '插件加载状态或安装版本未知。'
    return { package: item.package, version: expected ?? installedVersion ?? attempted?.installedVersion ?? null,
      versionSource: profileManaged ? 'dsh-profile' : 'packaged-lock',
      installedVersion: installedVersion ?? attempted?.installedVersion ?? null,
      installedSource: installedSource ?? attempted?.installedSource ?? null,
      state: loaded && !attempted ? 'loaded' : 'skipped', reason }
  }))
}

import { randomUUID } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { readPluginConfiguration } from './plugin-configuration.mjs'
import { pluginDependencySpec } from '../../agent-observation-plugin/src/delivery-manifest.mjs'

/** Only try already-present exact packages; no download, installation or profile dependency rewrite. */
export async function prepareStartupPlugins({ profile, entries, config, boot }) {
  const patches = [], skipped = []
  const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])
  const existing = flatten(entries)
  for (const item of config?.plugins.filter(row => row.startup === true) ?? []) {
    const matches = existing.filter(row => row.name === item.package || row.name?.startsWith(item.package + '/'))
    // Git pins must also validate existing entries before allowing the normal Host loader to try them.
    if (matches.length && item.source !== 'git') continue
    let installedVersion, installedSource
    try {
      installedSource = await realpath(join(profile, 'node_modules', item.package))
      const manifestPath = join(installedSource, 'package.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      installedVersion = manifest.version
      if (manifest.name !== item.package || manifest.version !== item.version) {
        throw new Error(`已安装版本 ${manifest.version ?? '未知'} 偏离包内固定值 ${item.version}，未替换运行包。`)
      }
      if (item.source === 'git') {
        const profileManifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'))
        const declaration = profileManifest.dependencies?.[item.package], dependency = pluginDependencySpec(item)
        if (declaration !== dependency) {
          throw new Error(`依赖来源声明 ${declaration ?? '缺失'} 偏离包内固定值 ${dependency}，未替换运行包。`)
        }
      }
      // Keep existing conditions, configuration and user-disabled state after source validation.
      if (matches.length) continue
      // The actual Host owns module resolution and execution, including its public peer mappings.
      const candidate = manifest.dsh?.bundle
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

/** Report actual Host outcomes; a repository pin never proves that a plugin loaded. */
export async function startupPluginResults({ resourcesRoot, url, preparation = [] }) {
  const config = await readPluginConfiguration(resourcesRoot)
  if (!config) throw new Error('Missing packaged startup plugin configuration')
  let rows, unknown
  try {
    const signal = AbortSignal.timeout(2000)
    const login = await fetch(url, { redirect: 'manual', signal })
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    await login.text()
    if (!cookie) throw new Error('Host authentication issued no cookie')
    const rpcId = randomUUID()
    const response = await fetch(new URL('/api/workflowDelivery/list', url), {
      method: 'POST', signal, headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'client-request', rpcId, method: 'workflowDelivery/list', payload: { args: {} } }),
    })
    const envelope = await response.json()
    const inventory = envelope.result?.value
    if (!response.ok || envelope.type !== 'server-response' || envelope.rpcId !== rpcId || envelope.result?.ok !== true
      || inventory?.actualScope !== 'runtime-resolution' || !Array.isArray(inventory.rows)) throw new Error('Host startup plugin inventory is unknown')
    rows = inventory.rows.filter(row => row.scope === 'Host')
  } catch (error) { unknown = String(error.message).slice(0, 300) }
  return config.plugins.filter(item => item.startup === true).map(item => {
    const matches = rows?.filter(row => row.package === item.package || row.moduleName === item.package) ?? []
    const active = matches.find(row => row.enabled === true && row.fiberPhase === 'active'
      && row.package === item.package && row.current === item.version && row.status === 'fixed'
      && typeof row.source === 'string' && isAbsolute(row.source) && !row.error)
    const actual = active ?? matches[0]
    const attempted = preparation.find(row => row.package === item.package)
    let reason
    if (attempted) reason = attempted.reason
    else if (unknown) reason = `实际启动状态未知：${unknown}`
    else if (active) reason = '当前 Host 已加载包内固定版本。'
    else if (!matches.length) reason = attempted?.reason ?? '当前 Host 未装配该插件；打包运行端不在线安装或换包。'
    else if (matches.every(row => row.enabled === false)) reason = '当前 profile 已停用该插件，保留用户选择。'
    else if (matches.some(row => row.fiberPhase === 'failed')) reason = '当前 Host 插件加载失败；请检查该插件日志。'
    else if (matches.some(row => row.enabled === true && row.fiberPhase === null
      && row.package === item.package && row.current === item.version
      && typeof row.source === 'string' && isAbsolute(row.source) && !row.error)) {
      reason = '当前 Host 插件导入失败：Host 已就绪，但该启用入口没有运行 fiber；请检查插件日志。'
    }
    else if (actual.current && actual.current !== item.version) reason = `实际版本 ${actual.current} 偏离包内固定值 ${item.version}，未替换运行包。`
    else reason = '实际加载状态或版本来源未知，未把声明当作加载成功。'
    return { package: item.package, version: item.version, versionSource: 'packaged-lock',
      actualVersion: actual?.current ?? null, source: actual?.source ?? null,
      ...(attempted ? { installedVersion: attempted.installedVersion, installedSource: attempted.installedSource } : {}),
      state: active && !unknown && !attempted ? 'loaded' : 'skipped', reason }
  })
}

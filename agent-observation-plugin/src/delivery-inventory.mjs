import { readFile, realpath } from 'node:fs/promises'
import { dirname, join, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bindTypertRemote } from '@deepseek-ai/dsh-typert-protocol'
import { readDeliveryManifest, isProfilePlugin } from './delivery-manifest.mjs'
import createDeliveryRemoteDescriptor from './delivery-remote.cjs'

export const name = 'dsh-workflow-delivery-inventory'
export const inject = ['loader', 'pluginPackages', 'pluginInventory']
const json = async path => JSON.parse(await readFile(path, 'utf8'))

async function filePackage(moduleName) {
  if (!moduleName.startsWith('file:') && !isAbsolute(moduleName)) return
  let directory = dirname(moduleName.startsWith('file:') ? fileURLToPath(moduleName) : moduleName)
  for (;;) {
    try {
      const manifest = await json(join(directory, 'package.json'))
      return { ...manifest, dir: directory }
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    const parent = dirname(directory)
    if (parent === directory) return
    directory = parent
  }
}

export function apply(ctx, { projectRoot }) {
  const service = { list: async () => {
    const config = await readDeliveryManifest(projectRoot)
    if (!config) throw new Error('包内仓库清单缺失，无法核验固定版本')
    const profilePackages = new Set(config.plugins.filter(item => isProfilePlugin(config, item)).map(item => item.package))
    const pins = new Map(config.plugins.filter(item => !profilePackages.has(item.package)).map(item => [item.package, item.version]))
    for (const item of config.plugins) for (const component of [...(item.components ?? []), ...(item.runtimePackages ?? [])]) pins.set(component.package, component.version)
    for (const path of ['package.json', 'matt-skills-panel-plugin/package/package.json', 'browser-harness-plugin/package.json']) {
      let manifest
      try { manifest = await json(join(projectRoot, path)) }
      catch (error) { if (error.code === 'ENOENT' && path !== 'package.json') continue; throw error }
      pins.set(manifest.name, manifest.version)
    }
    const runtime = await json(join(projectRoot, 'dsh-runtime.json'))
    let sdkLock
    try { sdkLock = await json(join(projectRoot, '../package-lock.json')) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      try { sdkLock = await json(join(projectRoot, 'macos-launcher/package-lock.json')) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    if (sdkLock) {
      if (sdkLock.lockfileVersion !== 3 || sdkLock.packages?.['']?.dependencies?.[runtime.package] !== runtime.version) {
        throw new Error('包内 SDK 锁与固定 DSH 版本不一致')
      }
      for (const [path, value] of Object.entries(sdkLock.packages)) {
        const packageName = path.startsWith('node_modules/') ? path.slice(13) : ''
        if (/^(?:@[^/]+\/)?[^/]+$/.test(packageName) && typeof value.version === 'string' && !pins.has(packageName)) pins.set(packageName, value.version)
      }
    }
    pins.set(runtime.package, runtime.version)
    const inventory = await ctx.pluginInventory.list()
    const entries = [...ctx.loader.entries()].filter(entry => !entry.options.group)
    const resolvedRows = inventory.entries.map(row => ({ ...row, scope: 'Host',
      base: entries.find(entry => entry.id === row.entryId)?.parent.tree.ctx.baseUrl }))
    for (const preset of inventory.agentPresets ?? []) {
      resolvedRows.push(...preset.rows.map((row, index) => ({ ...row,
        entryId: `preset:${preset.id}:${index}`, scope: `Agent 预设 ${preset.id}`, base: ctx.baseUrl })))
    }
    const rows = await Promise.all(resolvedRows.map(async ({ base, ...row }) => {
      let pkg, error
      try {
        if (!base) throw new Error(`Loader 解析基址未知：${row.entryId}`)
        const resolved = base && ctx.pluginPackages.packageOf(row.moduleName, base)
        pkg = resolved && { ...resolved.manifest, dir: resolved.dir }
        pkg ??= await filePackage(row.moduleName)
      } catch (cause) { error = cause.message }
      const profileManaged = profilePackages.has(pkg?.name)
      const expected = profileManaged ? null : pins.get(pkg?.name) ?? null
      return { ...row, package: pkg?.name ?? null, current: pkg?.version ?? null, expected,
        source: pkg?.dir ? await realpath(pkg.dir) : '运行解析来源未知', updatable: false,
        status: !pkg?.version ? 'unknown' : profileManaged ? 'installed' : !expected ? 'untracked' : pkg.version === expected ? 'fixed' : 'drift',
        ...(error ? { error } : {}) }
    }))
    return { actualScope: 'runtime-resolution', policy: config.npmStartup === 'profile'
      ? 'npm 插件由 DSH profile 管理。源码组件随 Station 交付，运行版本来自当前 Host。'
      : '组件随本仓库正式 DMG 统一交付；实际值来自当前 Host 解析，固定值来自包内仓库清单。未启用条目仅表示解析结果。', rows }
  } }
  service.typertRemote = bindTypertRemote(service, 'workflowDelivery')
  ctx.provide('workflowDelivery', service)
  ctx.inject(['typert'], child => {
    child.effect(() => child.typert.register({ package: 'dsh-workflow', face: 'host', schemas: [],
      model: { services: [], events: [], objects: [] }, invocations: [createDeliveryRemoteDescriptor()] }))
  })
}

export default { name, inject, apply }

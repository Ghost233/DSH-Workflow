import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, writeFile, lstat, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { composeDshLaunch } from '../../scripts/dsh-launch-composition.mjs'
import { migrateProjectEntryNames } from '../../scripts/observation-profile.mjs'
import { readPluginConfiguration, readStartupChecklist, assertProfilePluginVersions, assertRequiredProfilePlugins } from './plugin-configuration.mjs'
import { prepareStartupPlugins } from './startup-plugins.mjs'
import { deployPluginPayload } from './plugin-payload.mjs'
import { webProfileBundles } from './profile-templates.mjs'

const BUNDLE = 'dsh-workflow-desktop'
const TEAM = '@deepseek-ai/dsh-experimental-agent-team-profile'
const TEAM_SERVICE = '@deepseek-ai/dsh-agent-team'

/** Prepare the project-owned layer without changing Electron or DSH source. */
export async function prepareDesktopProfile({ resourcesRoot, desktopRuntimeRoot, globalRoot, home, permissionMode }) {
  const workflow = join(resourcesRoot, 'workflow')
  const anchor = join(desktopRuntimeRoot, 'node_modules/@deepseek-ai/dsh/package.json')
  const require = createRequire(anchor)
  const boot = require('@deepseek-ai/dsh-app-boot')
  const runtime = JSON.parse(await readFile(anchor, 'utf8'))
  const profile = join(home, 'profiles/desktop')
  const directory = join(globalRoot, '.dsh-workflow/desktop-bundle')
  const stampPath = join(directory, 'integration.json')
  const pluginConfig = await readPluginConfiguration(resourcesRoot)
  const profilePlugins = pluginConfig?.npmStartup === 'profile'
  const dataRoot = dirname(globalRoot)
  const startupChecklist = await readStartupChecklist(dataRoot, pluginConfig, resourcesRoot)
  await mkdir(profile, { recursive: true })
  const manifestPath = join(profile, 'package.json')
  if (!existsSync(manifestPath)) {
    const web = join(home, 'profiles/web')
    if (existsSync(join(web, 'package.json'))) {
      for (const name of ['package.json', 'cordis.patch.yml', 'cordis.yml', 'pnpm-workspace.yaml']) {
        if (existsSync(join(web, name))) await cp(join(web, name), join(profile, name))
      }
      if (existsSync(join(web, 'node_modules')) && !existsSync(join(profile, 'node_modules'))) {
        await cp(join(web, 'node_modules'), join(profile, 'node_modules'), { recursive: true, dereference: false })
      }
    } else boot.initProfile(profile, webProfileBundles(require, boot))
  }
  await assertRequiredProfilePlugins(profile, startupChecklist, resourcesRoot, dataRoot)
  await retireStationLinks(profile, require)
  const previousIntegration = await readFile(stampPath, 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error
    return '{}'
  })
  await migrateProjectEntryNames({ profile: { dir: profile, patchPath: join(profile, 'cordis.patch.yml') },
    anchor, projectRoot: workflow, previousProjectRoot: JSON.parse(previousIntegration).workflow, stationMatt: true })
  const deployment = await deployPluginPayload({ resourcesRoot, profile })
  if (deployment?.changed) process.stderr.write(`[project-plugins] 已从应用交付目录部署固定插件，原配置与包链接备份：${deployment.backup}\n`)
  if (pluginConfig) {
    try { await assertProfilePluginVersions(profile, pluginConfig) }
    catch (error) { process.stderr.write(`[project-plugins] ${error.message}\n`) }
  }
  const resolved = boot.loadProfileDirectory('dsh', profile, anchor)
  const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])
  const base = resolved.layers.filter(layer => layer.packageName !== BUNDLE)
  const builtInTeam = flatten(boot.composeEntries(base.filter(layer => layer.packageName !== TEAM).map(layer => layer.patches)))
    .some(row => row.name === TEAM_SERVICE)
  const layers = base.filter(layer => !builtInTeam || layer.packageName !== TEAM).map(layer => layer.patches)
  if (!builtInTeam && !base.some(layer => layer.packageName === TEAM)) {
    const teamDirectory = boot.resolveBundleDir('dsh', TEAM, anchor, profile)
    const teamManifest = JSON.parse(await readFile(join(teamDirectory, 'package.json'), 'utf8'))
    layers.push(boot.bundlePatchPaths(teamDirectory, teamManifest.dsh.bundle)
      .flatMap(path => boot.loadOverlayPatches('dsh', path)))
  }
  let entries = boot.composeEntries([...layers, resolved.patches])
  const startup = await prepareStartupPlugins({ profile, entries, config: pluginConfig, boot })
  // User patches for fixed entries first inserted by the Station overlay
  // have no target in the base profile. Apply them once those entries exist.
  const fixedEntries = new Set(flatten(boot.composeEntries([startup.patches])).map(row => row.id))
  const fixedUserPatches = resolved.patches.filter(row => row.id && fixedEntries.has(row.id))
  const startupPatches = [...startup.patches, ...fixedUserPatches]
  entries = boot.composeEntries([...layers, resolved.patches, startupPatches])
  const billionContextDelivered = profilePlugins || Boolean(deployment
    && pluginConfig?.plugins.some(row => row.package === 'billion-context' && row.startup === true)
    && !startup.skipped.some(row => row.package === 'billion-context'))
  const launch = composeDshLaunch(entries, { projectRoot: workflow, catalogRoot: globalRoot,
    billionContextDelivered, profilePlugins, stationInternal: true })
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const bundles = manifest.dsh.profile.bundles.filter(name => name !== BUNDLE && (!builtInTeam || name !== TEAM))
  if (!builtInTeam && !bundles.includes(TEAM)) bundles.push(TEAM)
  if (JSON.stringify(bundles) !== JSON.stringify(manifest.dsh.profile.bundles)) {
    manifest.dsh.profile.bundles = bundles
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
  }
  // Compose from the existing profile before adding our own rows, so preparation is idempotent.
  const patches = [...startupPatches, ...launch]
  for (const row of flatten(entries)) {
    if (permissionMode && row.name === '@deepseek-ai/dsh-sandbox-policy' && row.disabled !== true) {
      patches.push({ id: row.id, config: { ...structuredClone(row.config ?? {}), mode: permissionMode } })
    }
  }
  patches.push({ insert: [{ id: 'workflow-desktop-bridge', name: join(workflow, 'macos-launcher/runtime/desktop-bridge.mjs'),
    config: { directory: join(globalRoot, '.dsh-workflow/desktop'), runtimeVersion: runtime.version } }] })
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const overlay = join(directory, 'cordis.patch.yml')
  await writeFile(overlay, JSON.stringify(patches, null, 2) + '\n', { mode: 0o600 })
  await writeFile(stampPath, JSON.stringify({ integrationVersion: 6, workflow, globalRoot, runtimeVersion: runtime.version,
    profilePlugins }) + '\n', { mode: 0o600 })
  return { profile, bundle: directory, overlay, version: runtime.version, startup: startup.skipped, startupChecklist, profilePlugins }
}

async function retireStationLinks(profile, require) {
  const names = ['dsh-workflow', 'dsh-workflow-matt-panel', BUNDLE, '@botharness/tobs', '@botharness/core',
    '@botharness/ui', '@botharness/browser', '@botharness/computer', '@botharness/im-provider', 'deepseekbot',
    'ghost-agent-sentinel']
  const { withFileLock, writeFileAtomic } = require('@deepseek-ai/dsh-atomic-write')
  const manifestPath = join(profile, 'package.json')
  await withFileLock(manifestPath, async () => {
    const manifestBytes = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(manifestBytes)
    const links = names.filter(name => /^(?:link|file):/.test(manifest.dependencies?.[name] ?? ''))
    if (!links.length) return
    const lockPath = join(profile, 'pnpm-lock.yaml')
    const lockBytes = await readFile(lockPath, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error })
    const backup = join(profile, '.dsh-workflow/plugin-backups', `retired-${randomUUID()}`)
    await mkdir(backup, { recursive: true, mode: 0o700 })
    await writeFile(join(backup, 'package.json'), manifestBytes, { mode: 0o600 })
    let lock
    if (lockBytes !== undefined) {
      const yaml = createRequire(require.resolve('@deepseek-ai/dsh-config-editor/package.json'))('yaml')
      lock = yaml.parseDocument(lockBytes)
      if (lock.errors[0]) throw lock.errors[0]
      await writeFile(join(backup, 'pnpm-lock.yaml'), lockBytes, { mode: 0o600 })
    }
    const moved = []
    try {
      for (const name of links) {
        const link = join(profile, 'node_modules', name)
        const saved = join(backup, 'node_modules', name)
        const exists = await lstat(link).catch(error => { if (error.code !== 'ENOENT') throw error })
        if (exists) {
          if (!exists.isSymbolicLink()) throw new Error(`Cannot retire ${name}: expected a local package link`)
          await mkdir(dirname(saved), { recursive: true })
          await rename(link, saved)
          moved.push({ link, saved })
        }
        delete manifest.dependencies[name]
        for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
          lock?.getIn(['importers', '.', section], true)?.delete?.(name)
        }
      }
      manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(name => !links.includes(name))
      if (lock) await writeFileAtomic(lockPath, String(lock), { mode: 0o600 })
      await writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
    } catch (error) {
      if (lockBytes !== undefined) await writeFileAtomic(lockPath, lockBytes, { mode: 0o600 })
      for (const { link, saved } of moved.reverse()) await rename(saved, link)
      throw error
    }
    process.stderr.write(`[project-plugins] 已移除 Station 旧插件链接，备份：${backup}\n`)
  }, { waitMs: 120000 })
}

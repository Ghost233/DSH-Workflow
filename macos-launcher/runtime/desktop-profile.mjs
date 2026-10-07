import { createRequire } from 'node:module'
import { cp, mkdir, readFile, writeFile, symlink, lstat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { composeKernelLaunch } from '../../scripts/kernel-launch-composition.mjs'

const BUNDLE = 'dsh-workflow-desktop'
const TEAM = '@deepseek-ai/dsh-experimental-agent-team-profile'

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
  const identity = { workflow, globalRoot, runtimeVersion: runtime.version, permissionMode, teamProfile: TEAM, mattPanel: 'dsh-workflow-matt-panel', components: ['owner'], hostInstance: 'desktop-bridge', creatorJevGuidance: true, agentMonitor: 2, jevCenter: 1 }
  await mkdir(profile, { recursive: true })
  const manifestPath = join(profile, 'package.json')
  if (existsSync(manifestPath) && existsSync(stampPath)) {
    const current = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (current.dependencies?.[BUNDLE] === `file:${directory}`
      && JSON.stringify(JSON.parse(await readFile(stampPath, 'utf8'))) === JSON.stringify(identity)) {
      return { profile, bundle: directory, version: runtime.version }
    }
  }
  if (!existsSync(manifestPath)) {
    const web = join(home, 'profiles/web')
    if (existsSync(join(web, 'package.json'))) {
      for (const name of ['package.json', 'cordis.patch.yml', 'cordis.yml', 'pnpm-workspace.yaml']) {
        if (existsSync(join(web, name))) await cp(join(web, name), join(profile, name))
      }
      if (existsSync(join(web, 'node_modules')) && !existsSync(join(profile, 'node_modules'))) {
        await cp(join(web, 'node_modules'), join(profile, 'node_modules'), { recursive: true, dereference: false })
      }
    } else boot.initProfile(profile, boot.PROFILE_TEMPLATES.web.bundles)
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.private = true
  manifest.name = 'dsh-profile-desktop'
  manifest.dsh ??= {}
  manifest.dsh.profile ??= { bundles: [...boot.PROFILE_TEMPLATES.web.bundles] }
  const bundles = manifest.dsh.profile.bundles.filter(name => name !== BUNDLE)
  if (!bundles.includes(TEAM)) bundles.push(TEAM)
  // Compose from the existing profile before adding our own rows, so preparation is idempotent.
  const resolved = boot.loadProfileDirectory('dsh', profile, anchor)
  const layers = resolved.layers.filter(layer => layer.packageName !== BUNDLE).map(layer => layer.patches)
  if (!resolved.layers.some(layer => layer.packageName === TEAM)) {
    const teamDirectory = boot.resolveBundleDir('dsh', TEAM, anchor, profile)
    const teamManifest = JSON.parse(await readFile(join(teamDirectory, 'package.json'), 'utf8'))
    layers.push(boot.bundlePatchPaths(teamDirectory, teamManifest.dsh.bundle)
      .flatMap(path => boot.loadOverlayPatches('dsh', path)))
  }
  const entries = boot.composeEntries([...layers, resolved.patches])
  const patches = composeKernelLaunch(entries, { projectRoot: workflow, catalogRoot: globalRoot,
    presetPlugins: boot.loadOverlayPatches('dsh', join(workflow, 'owner-workflow-plugin/kernel-presets/owner-workflow/agent.cordis.yml')) })
  const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])
  for (const row of flatten(entries)) {
    if (permissionMode && row.name === '@deepseek-ai/dsh-sandbox-policy' && row.disabled !== true) {
      patches.push({ id: row.id, config: { mode: permissionMode } })
    }
  }
  patches.push({ insert: [{ id: 'workflow-desktop-bridge', name: join(workflow, 'macos-launcher/runtime/desktop-bridge.mjs'),
    config: { directory: join(globalRoot, '.dsh-workflow/desktop'), runtimeVersion: runtime.version } }] })
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: BUNDLE, version: '0.1.0', type: 'module',
    dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 2) + '\n')
  await writeFile(join(directory, 'cordis.patch.yml'), JSON.stringify(patches, null, 2) + '\n', { mode: 0o600 })
  const installedBundle = join(profile, 'node_modules', BUNDLE)
  await mkdir(join(profile, 'node_modules'), { recursive: true })
  const installed = await lstat(installedBundle).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (!installed) await symlink(directory, installedBundle, 'dir')
  else if (!installed.isSymbolicLink()) throw new Error('Desktop integration bundle is already owned by another installation')
  manifest.dependencies = { ...manifest.dependencies, [BUNDLE]: `file:${directory}` }
  manifest.dsh.profile.bundles = [...bundles, BUNDLE]
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
  await writeFile(stampPath, JSON.stringify(identity) + '\n', { mode: 0o600 })
  return { profile, bundle: directory, version: runtime.version }
}

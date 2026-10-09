import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, writeFile, symlink, lstat, readlink, rename, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { composeDshLaunch } from '../../scripts/dsh-launch-composition.mjs'
import { migrateProjectEntryNames } from '../../scripts/observation-profile.mjs'

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
  const localPackages = { 'dsh-workflow': workflow,
    'dsh-workflow-matt-panel': join(workflow, 'matt-skills-panel-plugin/package') }
  const identity = { integrationVersion: 3, workflow, globalRoot, runtimeVersion: runtime.version, permissionMode, teamProfile: TEAM, mattPanel: 'dsh-workflow-matt-panel', hostInstance: 'desktop-bridge', agentMonitor: 2, jevCenter: 1, localPackages }
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
    } else boot.initProfile(profile, boot.PROFILE_TEMPLATES.web.bundles)
  }
  const previous = existsSync(stampPath) ? JSON.parse(await readFile(stampPath, 'utf8')) : undefined
  const current = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : undefined
  const pendingLinks = []
  for (const [name, target] of Object.entries(localPackages)) {
    const link = join(profile, 'node_modules', name)
    const existing = await lstat(link).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (!existing) { pendingLinks.push({ link, target }); continue }
    const oldTarget = existing.isSymbolicLink() ? resolve(dirname(link), await readlink(link)) : undefined
    if (oldTarget === resolve(target)) continue
    const stamped = previous?.localPackages?.[name]
    const expected = name === 'dsh-workflow' ? previous?.workflow
      : previous?.workflow && join(previous.workflow, 'matt-skills-panel-plugin/package')
    if (!existing.isSymbolicLink() || typeof stamped !== 'string' || stamped !== expected
      || previous.globalRoot !== globalRoot || current?.dependencies?.[BUNDLE] !== `file:${directory}`
      || current?.dependencies?.[name] !== `file:${stamped}` || oldTarget !== resolve(stamped)) {
      throw new Error(`Desktop package ${name} is already owned by another installation`)
    }
    pendingLinks.push({ link, target, oldTarget })
  }
  const installedBundle = join(profile, 'node_modules', BUNDLE)
  const installed = await lstat(installedBundle).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (installed && (!installed.isSymbolicLink() || resolve(dirname(installedBundle), await readlink(installedBundle)) !== resolve(directory))) {
    throw new Error('Desktop integration bundle is already owned by another installation')
  }
  if (current?.dependencies?.[BUNDLE] === `file:${directory}`
    && pendingLinks.length === 0
    && Object.entries(localPackages).every(([name, target]) => current.dependencies[name] === `file:${target}`)
    && JSON.stringify(previous) === JSON.stringify(identity)
    && !await migrateProjectEntryNames({ profile: { dir: profile, patchPath: join(profile, 'cordis.patch.yml') }, anchor, projectRoot: workflow, previousProjectRoot: previous?.workflow })) {
    return { profile, bundle: directory, version: runtime.version }
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.private = true
  manifest.name = 'dsh-profile-desktop'
  manifest.dsh ??= {}
  manifest.dsh.profile ??= { bundles: [...boot.PROFILE_TEMPLATES.web.bundles] }
  const bundles = manifest.dsh.profile.bundles.filter(name => name !== BUNDLE)
  if (!bundles.includes(TEAM)) bundles.push(TEAM)
  await migrateProjectEntryNames({ profile: { dir: profile, patchPath: join(profile, 'cordis.patch.yml') }, anchor, projectRoot: workflow, previousProjectRoot: previous?.workflow })
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
  const patches = composeDshLaunch(entries, { projectRoot: workflow, catalogRoot: globalRoot })
  const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])
  for (const row of flatten(entries)) {
    if (permissionMode && row.name === '@deepseek-ai/dsh-sandbox-policy' && row.disabled !== true) {
      patches.push({ id: row.id, config: { ...structuredClone(row.config ?? {}), mode: permissionMode } })
    }
  }
  patches.push({ insert: [{ id: 'workflow-desktop-bridge', name: join(workflow, 'macos-launcher/runtime/desktop-bridge.mjs'),
    config: { directory: join(globalRoot, '.dsh-workflow/desktop'), runtimeVersion: runtime.version } }] })
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: BUNDLE, version: '0.1.0', type: 'module',
    dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 2) + '\n')
  await writeFile(join(directory, 'cordis.patch.yml'), JSON.stringify(patches, null, 2) + '\n', { mode: 0o600 })
  await mkdir(join(profile, 'node_modules'), { recursive: true })
  if (!installed) await symlink(directory, installedBundle, 'dir')
  // Only links proven by the previous project stamp and matching dependency are moved.
  for (const { link, target, oldTarget } of pendingLinks) {
    if (oldTarget === undefined) { await symlink(target, link, 'dir'); continue }
    const fresh = await lstat(link)
    if (!fresh.isSymbolicLink() || resolve(dirname(link), await readlink(link)) !== oldTarget) {
      throw new Error('Desktop package link changed during preparation')
    }
    const staged = join(dirname(link), `.dsh-workflow-link-${randomUUID()}`)
    try { await symlink(target, staged, 'dir'); await rename(staged, link) }
    finally { await unlink(staged).catch(error => { if (error.code !== 'ENOENT') throw error }) }
  }
  manifest.dependencies = { ...manifest.dependencies,
    ...Object.fromEntries(Object.entries(localPackages).map(([name, path]) => [name, `file:${path}`])), [BUNDLE]: `file:${directory}` }
  manifest.dsh.profile.bundles = [...bundles, BUNDLE]
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
  await writeFile(stampPath, JSON.stringify(identity) + '\n', { mode: 0o600 })
  return { profile, bundle: directory, version: runtime.version }
}

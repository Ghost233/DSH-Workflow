import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, open, unlink, rename, realpath, access } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, delimiter } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { installProjectResolver } from './project-plugin-resolver.mjs'
import { target as harnessTarget } from './harness-runtime.mjs'
import { composeApprovalPatches } from '../approve-for-me-workflow-plugin/compose-patch.mjs'

const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const exec = promisify(execFile)
const say = message => process.stderr.write(`[project-plugins] ${message}\n`)
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export const pluginDirectory = root => join(root, '.dsh-workflow', 'plugins')

/**
 * Project-owned modules are resolved inside this process, never projected into
 * a user's DSH profile.  Their exact directories are part of this repository's
 * integration surface rather than package-manager state.
 */
const projectPackages = root => [
  { package: 'dsh-owner-workflow', directory: '.' },
  { package: 'dsh-sol-efficiency', directory: 'sol-efficiency-plugin' },
]

/** Resolve the requested repository, never a potentially unrelated same-name npm package. */
export async function resolvePlugin(item, registry) {
  if (item.source !== 'git') {
    const { stdout } = await exec('pnpm', ['view', `${item.package}@${item.version}`, 'version', '--json', '--registry', registry], { timeout: 30000 })
    return { version: JSON.parse(stdout) }
  }
  const { stdout } = await exec('git', ['ls-remote', '--exit-code', `${item.repository}.git`, `refs/heads/${item.ref}`], { timeout: 30000 })
  const commit = stdout.trim().split(/\s+/)[0]
  return { commit }
}

/** Read metadata for an already fixed revision; never run a package hook. */
export async function readPluginMetadata(item, resolution, registry) {
  const url = resolution.commit
    ? `https://raw.githubusercontent.com/${item.repository.split('github.com/')[1]}/${resolution.commit}/package.json`
    : `${registry}${encodeURIComponent(item.package)}/${resolution.version}`
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Cannot read pinned metadata for ${item.package}: HTTP ${response.status}`)
  const manifest = await response.json()
  if (manifest.name !== item.package) throw new Error(`Pinned package identity mismatch: ${item.package}`)
  return { name: manifest.name, version: manifest.version, dsh: manifest.dsh,
    peerDependencies: manifest.peerDependencies ?? {}, peerDependenciesMeta: manifest.peerDependenciesMeta ?? {} }
}

function assertClientDependencies(items, hostPackages, configuredNames) {
  const missing = []
  for (const item of items) {
    for (const name of item.metadata?.dsh?.client?.inject ?? []) {
      if (!hostPackages[name] && !configuredNames.has(name)) missing.push(`${item.package}: ${name}`)
    }
  }
  if (missing.length) throw new Error(`固定插件依赖当前宿主未提供的客户端模块；安装前已停止，请先适配相关插件：\n${missing.join('\n')}`)
}

export async function command(executable, args, options = {}) {
  await new Promise((done, reject) => {
    const child = spawn(executable, args, { stdio: 'inherit', ...options })
    const stop = () => child.kill('SIGTERM')
    process.once('SIGTERM', stop)
    process.once('SIGINT', stop)
    child.once('error', reject)
    child.once('close', (code, signal) => {
      process.removeListener('SIGTERM', stop)
      process.removeListener('SIGINT', stop)
      code === 0 ? done() : reject(new Error(`${executable} failed (${signal ?? code})`))
    })
  })
}

/** Discover exactly the Harness selected by the wrapper, including npx's temporary installation. */
export async function harnessAnchor(value) {
  if (value !== 'auto') return resolve(value)
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(dir, process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
    if (!existsSync(candidate)) continue
    let current = dirname(await realpath(candidate))
    while (dirname(current) !== current) {
      const manifest = join(current, 'package.json')
      if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === '@deepseek-ai/dsh') return manifest
      current = dirname(current)
    }
  }
  throw new Error('Cannot resolve the selected npm Harness; no dsh executable in the npx environment')
}

/** Same dependency closure as DSH's fallback, but kept in memory instead of writing global symlinks. */
export function hostPackageMap(anchor) {
  const manifest = JSON.parse(readFileSync(anchor, 'utf8'))
  const packages = { [manifest.name]: dirname(anchor) }
  const queue = [anchor]
  for (let index = 0; index < queue.length; index++) {
    const file = queue[index]
    const pkg = JSON.parse(readFileSync(file, 'utf8'))
    const req = createRequire(file)
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
      if (packages[name]) continue
      for (const search of req.resolve.paths(name) ?? []) {
        const target = join(search, name, 'package.json')
        if (!existsSync(target)) continue
        packages[name] = dirname(target)
        queue.push(target)
        break
      }
    }
  }
  return packages
}

export async function acquireLock(directory, pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid startup owner PID')
  await mkdir(directory, { recursive: true })
  const path = join(directory, 'startup.lock')
  try {
    const file = await open(path, 'wx', 0o600)
    try { await file.writeFile(JSON.stringify({ owner: 'dsh-workflow-project-plugins', pid })) } finally { await file.close() }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const lock = await readJson(path)
    if (lock.owner !== 'dsh-workflow-project-plugins' || !Number.isSafeInteger(lock.pid) || lock.pid < 1) throw new Error(`Unknown lock: ${path}`)
    try { process.kill(lock.pid, 0) } catch (cause) {
      if (cause.code !== 'ESRCH') throw cause
      await unlink(path)
      return acquireLock(directory, pid)
    }
    throw new Error(`插件目录正在被启动进程 ${lock.pid} 使用；请先退出该项目的 DSH，避免更新运行中的插件。`)
  }
}

export async function releaseLock(directory, pid) {
  const path = join(directory, 'startup.lock')
  const lock = await readJson(path).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (lock?.owner === 'dsh-workflow-project-plugins' && lock.pid === pid) await unlink(path)
}

export async function prepare(root, anchor, pid, { run = command, resolvePackage = resolvePlugin, readMetadata = readPluginMetadata, update = false, scope = 'all', home = process.env.DSH_HOME || join(process.env.HOME, '.dsh') } = {}) {
  if (!['owned', 'all'].includes(scope)) throw new Error('Plugin scope must be owned or all')
  if (scope === 'owned' && update) throw new Error('Third-party updates require scope=all')
  const directory = pluginDirectory(root)
  const listBytes = await readFile(join(root, 'project-plugins.json'))
  const list = JSON.parse(listBytes)
  const host = await readJson(anchor)
  if (host.name !== harnessTarget.package || host.version !== harnessTarget.version) {
    throw new Error(`Unsupported Harness ${host.name}@${host.version}; this plugin set requires ${harnessTarget.package}@${harnessTarget.version}`)
  }
  if (!Array.isArray(list.plugins)) throw new Error('Invalid project-plugins.json')
  const names = new Set(), ids = new Set()
  for (const item of list.plugins) {
    // The daily owned-only launch needs package names solely to suppress
    // external profile rows; release/registry validation belongs to scope=all.
    if (scope === 'owned') {
      if (typeof item?.package !== 'string' || !item.package) throw new Error('Cannot exclude an unnamed third-party plugin')
      names.add(item.package)
      continue
    }
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(item.package) || !/^[a-z0-9._-]+$/i.test(item.version)
      || !/^[a-z0-9-]+$/.test(item.entryId) || names.has(item.package) || ids.has(item.entryId)) throw new Error('Invalid or duplicate plugin list entry')
    if (item.source && !['npm', 'git'].includes(item.source)) throw new Error(`Unknown plugin source: ${item.source}`)
    if (item.source === 'git' && (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_-]+$/.test(item.repository)
      || !/^[A-Za-z0-9_-]+$/.test(item.ref) || item.version !== 'latest')) throw new Error(`Invalid Git source: ${item.package}`)
    if (item.bundle && item.bundle !== 'entry') throw new Error(`Unknown bundle adapter: ${item.package}`)
    if (item.requires && (!Array.isArray(item.requires) || item.requires.some(name => !names.has(name)))) throw new Error(`Required plugin must precede ${item.package}`)
    names.add(item.package); ids.add(item.entryId)
  }
  if (scope === 'all' && new URL(list.registry).protocol !== 'https:') throw new Error('Invalid project-plugins.json')
  const lockPath = join(root, 'project-plugins.lock.json')
  const locked = scope === 'all' && !update ? await readJson(lockPath) : undefined
  if (scope === 'all' && locked && (locked.schema !== 1 || locked.harnessVersion !== host.version || locked.registry !== list.registry
    || locked.manifestSha256 !== digest(listBytes) || !Array.isArray(locked.plugins)
    || locked.plugins.length !== list.plugins.length
    || locked.plugins.some((item, index) => item.package !== list.plugins[index].package))) {
    throw new Error('Project plugin lock does not match the manifest/host; use the explicit update command before launching')
  }
  const excludedPackages = scope === 'owned' ? new Set(names) : new Set()
  if (scope === 'owned') { list.plugins = []; names.clear(); say('仅准备自研插件，第三方插件不安装、不检查兼容性。') }
  const hostPackages = hostPackageMap(anchor)
  const resolutions = []
  for (const [index, item] of list.plugins.entries()) {
    const revision = update ? await resolvePackage(item, list.registry) : locked.plugins[index]
    if (item.source === 'git' ? !/^[a-f0-9]{40}$/.test(revision.commit) : !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(revision.version)) {
      throw new Error(`Invalid plugin revision: ${item.package}`)
    }
    const metadata = update ? await readMetadata(item, revision, list.registry) : revision.metadata
    resolutions.push({ ...revision, package: item.package, metadata })
  }
  // All known client dependency gaps are resolved before any package manager
  // invocation, including during an explicit update.
  assertClientDependencies(resolutions, hostPackages, names)
  await acquireLock(directory, pid)
  try {
    // A failed refresh must not leave the previous launch usable with partially updated packages.
    await unlink(join(directory, 'launch.json')).catch(error => { if (error.code !== 'ENOENT') throw error })
    const manifestPath = join(directory, 'package.json')
    if (scope === 'all') {
      if (!existsSync(manifestPath)) await writeFile(manifestPath, JSON.stringify({ name: 'dsh-workflow-project-plugins', private: true, dependencies: {} }, null, 2) + '\n')
      const manifest = await readJson(manifestPath)
      if (manifest.name !== 'dsh-workflow-project-plugins' || manifest.private !== true) throw new Error('Refusing to use an unowned plugin directory')
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
      // This package-manager workspace exists only for an explicit third-party install/update.
      const workspacePath = join(directory, 'pnpm-workspace.yaml')
      if (!existsSync(workspacePath)) await writeFile(workspacePath, 'packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\nstrictPeerDependencies: false\nallowBuilds:\n  node-pty: true\n')
    }
    const packages = {}, manifests = new Map(), installed = [], metadata = new Map()
    for (const [index, item] of list.plugins.entries()) {
      say(`${index + 1}/${list.plugins.length} ${update ? '显式更新' : '检查固定版本'} ${item.package}`)
      const { version, commit, metadata: meta } = resolutions[index]
      if (meta) {
        metadata.set(item.package, meta)
        assertClientDependencies([{ package: item.package, metadata: meta }], hostPackages, names)
      }
      const spec = commit ? `${item.package}@git+${item.repository}.git#${commit}` : `${item.package}@${version}`
      const pkgRoot = join(directory, 'node_modules', item.package)
      const priorPackage = await readJson(join(pkgRoot, 'package.json')).catch(error => { if (error.code !== 'ENOENT') throw error })
      const currentManifest = await readJson(manifestPath)
      const dependencySpec = commit ? `git+${item.repository}.git#${commit}` : version
      const reusable = !update && priorPackage?.name === item.package && (!version || priorPackage.version === version)
        && currentManifest.dependencies?.[item.package] === dependencySpec
      // Ordinary startup never resolves latest or moving Git refs. First use
      // installs the pinned target; later starts verify the existing artifacts.
      if (!reusable) await run('pnpm', ['add', spec, '--save-exact', '--registry', list.registry,
        '--store-dir', join(directory, '.pnpm-store')], { cwd: directory })
      const pkg = await readJson(join(pkgRoot, 'package.json'))
      manifests.set(item.package, pkg)
      if (pkg.name !== item.package || (version && pkg.version !== version)) throw new Error(`Installed version mismatch: ${item.package}`)
      assertClientDependencies([{ package: item.package, metadata: pkg }], hostPackages, names)
      const req = createRequire(join(pkgRoot, 'package.json'))
      await access(req.resolve(item.package))
      await access(req.resolve(`${item.package}/client`))
      if ((!pkg.dsh?.bundle?.patch && item.bundle !== 'entry') || !pkg.dsh?.client) throw new Error(`Missing DSH bundle/client: ${item.package}`)
      packages[item.package] = pkgRoot
      installed.push({ ...item, version: pkg.version, ...(commit ? { commit } : {}) })
      say(`${item.package}@${pkg.version}${commit ? `#${commit}` : ''} 安装产物完整`)
    }
    for (const definition of projectPackages(root)) {
      const directory = resolve(root, definition.directory)
      const manifestPath = join(directory, 'package.json')
      if (!existsSync(manifestPath)) {
        throw new Error(`缺少项目自研插件 package.json：${definition.directory}`)
      }
      const pkg = await readJson(manifestPath)
      if (pkg.name !== definition.package) {
        throw new Error(`项目自研插件身份不匹配：${definition.directory} 应为 ${definition.package}`)
      }
      const req = createRequire(manifestPath)
      await access(req.resolve(pkg.name))
      await access(req.resolve(`${pkg.name}/client`))
      packages[pkg.name] = directory
      manifests.set(pkg.name, pkg)
      installed.push({ package: pkg.name, version: pkg.version, source: 'project', directory: definition.directory })
    }
    const approvalRoot = join(root, 'approve-for-me-workflow-plugin')
    if (existsSync(join(approvalRoot, 'package.json'))) {
      const pkg = await readJson(join(approvalRoot, 'package.json'))
      if (pkg.name !== 'dsh-approve-for-me-workflow') throw new Error('Unexpected project approval adapter identity')
      const req = createRequire(join(approvalRoot, 'package.json'))
      await access(req.resolve(pkg.name))
      await access(req.resolve(`${pkg.name}/client`))
      packages[pkg.name] = approvalRoot
      manifests.set(pkg.name, pkg)
      installed.push({ package: pkg.name, version: pkg.version, source: 'project', directory: 'approve-for-me-workflow-plugin' })
    }
    const state = { directory, anchor, packages, hostPackages, installed }
    // Validate host peers without downloading another Cordis/DSH runtime into the plugin store.
    const hostReq = createRequire(anchor)
    const semver = scope === 'all' ? createRequire(manifestPath)('semver') : null
    const satisfiesOwnedPeer = (version, range) => {
      const parse = value => /^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/.exec(value)?.slice(1)
      if (version === range) return true
      if (!range.startsWith('^')) return false
      const actual = parse(version), minimum = parse(range.slice(1))
      if (!actual || !minimum || actual[3] || minimum[3]) return false
      const [major, minor, patch] = actual.map(Number)
      const [minMajor, minMinor, minPatch] = minimum.map(Number)
      return major === minMajor && (minor > minMinor || minor === minMinor && patch >= minPatch)
    }
    const failures = []
    for (const item of installed) {
      const pkg = manifests.get(item.package)
      for (const [peer, range] of Object.entries(pkg.peerDependencies ?? {})) {
        if (pkg.peerDependenciesMeta?.[peer]?.optional) continue
        const peerRoot = state.hostPackages[peer]
        const version = peerRoot && (await readJson(join(peerRoot, 'package.json'))).version
        if (!version || !(semver ? semver.satisfies(version, range, { includePrerelease: true }) : satisfiesOwnedPeer(version, range))) {
          failures.push(`${item.package}: ${peer} 需要 ${range}，当前 ${version ?? '未提供'}`)
        }
      }
    }
    if (failures.length) throw new Error(`插件已安装，但当前 Harness 不兼容，已停止启动。请先适配或更新相关插件：\n${failures.join('\n')}`)
    // Import through the real host peers and use DSH's own YAML codec (including !!js).
    const hooks = installProjectResolver(state)
    try {
      const boot = await import(pathToFileURL(hostReq.resolve('@deepseek-ai/dsh-app-boot')))
      const profileName = process.env.DSH_PROFILE || 'web'
      const profile = boot.loadProfile('dsh', profileName, anchor, home)
      const homePatch = join(home, 'cordis.patch.yml')
      const extra = existsSync(homePatch) ? boot.loadOverlayPatches('dsh', homePatch) : []
      const entries = boot.composeEntries([...profile.layers.map(layer => layer.patches), profile.patches, extra])
      const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])
      const existing = flatten(entries)
      const patches = []
      for (const row of existing.filter(row => excludedPackages.has(row.name))) {
        if (!row.id) throw new Error('Cannot exclude an unnamed third-party profile entry')
        patches.push({ id: row.id, disabled: true })
      }
      for (const item of installed) {
        if (item.source === 'project') continue
        const pkg = manifests.get(item.package)
        // Legacy packages register a plain loader row in install.sh; do not run that global installer.
        const bundle = pkg.dsh.bundle?.patch
          ? boot.loadOverlayPatches('dsh', join(packages[item.package], pkg.dsh.bundle.patch))
          : [{ insert: [{ id: item.entryId, name: item.package }] }]
        // Carry forward current upstream bundle semantics; fail loudly on a new layout requiring review.
        if (bundle.length !== 1 || bundle[0].insert?.length !== 1 || bundle[0].insert[0].id !== item.entryId || bundle[0].insert[0].name !== item.package) throw new Error(`Unsupported bundle layout: ${item.package}`)
        const original = existing.filter(row => row.name === item.package)
        if (original.some(row => !row.id)) throw new Error(`Cannot deduplicate unnamed entry: ${item.package}`)
        for (const row of original) patches.push({ id: row.id, disabled: true })
        const row = { ...bundle[0].insert[0], ...original[0]?.config ? { config: original[0].config } : {}, id: `project-${item.entryId}` }
        if (original.some(entry => entry.disabled === true)) row.disabled = true
        patches.push({ insert: [row] })
      }
      if (packages['dsh-approve-for-me-workflow']) patches.push(...composeApprovalPatches(entries))
      // JSON is valid YAML. All referenced modules keep their real names for browser discovery.
      const patch = join(directory, 'launch.patch.yml')
      await writeFile(patch + '.tmp', JSON.stringify(patches, null, 2) + '\n')
      await rename(patch + '.tmp', patch)
      state.patch = patch
      for (const item of installed) await import(pathToFileURL(createRequire(join(packages[item.package], 'package.json')).resolve(item.package)))
    } finally { hooks.deregister() }
    if (update) {
      const nextLock = { schema: 1, harnessVersion: host.version, registry: list.registry, manifestSha256: digest(listBytes),
        plugins: installed.filter(item => item.source !== 'project').map(item => ({ package: item.package,
          ...item.commit ? { commit: item.commit } : { version: item.version }, metadata: metadata.get(item.package) })) }
      await writeFile(`${lockPath}.tmp`, JSON.stringify(nextLock, null, 2) + '\n')
      await rename(`${lockPath}.tmp`, lockPath)
    }
    // Publish the launch receipt last, after the optional lock update succeeds.
    await writeFile(join(directory, 'launch.json.tmp'), JSON.stringify({ anchor, installed }, null, 2) + '\n')
    await rename(join(directory, 'launch.json.tmp'), join(directory, 'launch.json'))
    say('全部插件准备成功，可以启动 DSH。')
    return state
  } catch (error) { await releaseLock(directory, pid); throw error }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, root, value, pidText] = process.argv.slice(2)
  try {
    if (action === 'prepare' || action === 'update') await prepare(resolve(root), await harnessAnchor(value), Number(pidText), {
      update: action === 'update',
      scope: action === 'update' ? 'all' : 'owned',
    })
    else if (action === 'release') await releaseLock(pluginDirectory(resolve(root)), Number(value))
    else if (action === 'run') {
      const state = await readJson(join(pluginDirectory(resolve(root)), 'launch.json'))
      state.directory = pluginDirectory(resolve(root))
      state.patch = join(state.directory, 'launch.patch.yml')
      state.packages = Object.fromEntries(state.installed.map(item => [item.package, item.source === 'project'
        ? resolve(root, item.directory) : join(state.directory, 'node_modules', item.package)]))
      state.hostPackages = hostPackageMap(state.anchor)
      installProjectResolver(state)
      const entry = join(dirname(state.anchor), 'lib', 'bin.js')
      const cliArgs = process.argv.slice(4)
      cliArgs.splice(cliArgs[0] === 'web' ? 1 : 2, 0, '--patch', state.patch)
      process.argv = [process.execPath, entry, ...cliArgs]
      const { runCli } = await import(pathToFileURL(entry))
      if (typeof runCli !== 'function') throw new Error('Harness CLI does not expose runCli')
      await runCli()
    } else throw new Error(`Unknown action: ${action}`)
  } catch (error) { say(error.stack ?? String(error)); process.exitCode = 1 }
}

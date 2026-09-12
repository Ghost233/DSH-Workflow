import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, open, unlink, rename, realpath, access } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, delimiter } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { installProjectResolver } from './project-plugin-resolver.mjs'

const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const exec = promisify(execFile)
const say = message => process.stderr.write(`[project-plugins] ${message}\n`)
export const pluginDirectory = root => join(root, '.dsh-workflow', 'plugins')

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

export async function prepare(root, anchor, pid, { run = command, resolvePackage = resolvePlugin, home = process.env.DSH_HOME || join(process.env.HOME, '.dsh') } = {}) {
  const directory = pluginDirectory(root)
  const list = await readJson(join(root, 'project-plugins.json'))
  if (!Array.isArray(list.plugins) || new URL(list.registry).protocol !== 'https:') throw new Error('Invalid project-plugins.json')
  const names = new Set(), ids = new Set()
  for (const item of list.plugins) {
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(item.package) || !/^[a-z0-9._-]+$/i.test(item.version)
      || !/^[a-z0-9-]+$/.test(item.entryId) || names.has(item.package) || ids.has(item.entryId)) throw new Error('Invalid or duplicate plugin list entry')
    if (item.source && !['npm', 'git'].includes(item.source)) throw new Error(`Unknown plugin source: ${item.source}`)
    if (item.source === 'git' && (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_-]+$/.test(item.repository)
      || !/^[A-Za-z0-9_-]+$/.test(item.ref) || item.version !== 'latest')) throw new Error(`Invalid Git source: ${item.package}`)
    if (item.bundle && item.bundle !== 'entry') throw new Error(`Unknown bundle adapter: ${item.package}`)
    if (item.requires && (!Array.isArray(item.requires) || item.requires.some(name => !names.has(name)))) throw new Error(`Required plugin must precede ${item.package}`)
    names.add(item.package); ids.add(item.entryId)
  }
  await acquireLock(directory, pid)
  try {
    // A failed refresh must not leave the previous launch usable with partially updated packages.
    await unlink(join(directory, 'launch.json')).catch(error => { if (error.code !== 'ENOENT') throw error })
    const manifestPath = join(directory, 'package.json')
    if (!existsSync(manifestPath)) await writeFile(manifestPath, JSON.stringify({ name: 'dsh-workflow-project-plugins', private: true, dependencies: {} }, null, 2) + '\n')
    const manifest = await readJson(manifestPath)
    if (manifest.name !== 'dsh-workflow-project-plugins' || manifest.private !== true) throw new Error('Refusing to use an unowned plugin directory')
    manifest.dependencies = { ...manifest.dependencies, semver: '^7.7.2' }
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    // Keep explicit user build approvals across starts. Never auto-approve Git prepare scripts.
    const workspacePath = join(directory, 'pnpm-workspace.yaml')
    if (!existsSync(workspacePath)) await writeFile(workspacePath, 'packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\nstrictPeerDependencies: false\nallowBuilds:\n  node-pty: true\n')
    const packages = {}, manifests = new Map(), installed = []
    for (const [index, item] of list.plugins.entries()) {
      say(`${index + 1}/${list.plugins.length} 检查并更新 ${item.package}@${item.version}`)
      const { version, commit } = await resolvePackage(item, list.registry)
      if (item.source === 'git' ? !/^[a-f0-9]{40}$/.test(commit) : !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Invalid plugin revision: ${item.package}`)
      const spec = commit ? `${item.package}@git+${item.repository}.git#${commit}` : `${item.package}@${version}`
      // Resolve latest freshly, then install that exact version; a stale mirror cannot pick another tag.
      await run('pnpm', ['add', spec, '--save-exact', '--registry', list.registry,
        '--store-dir', join(directory, '.pnpm-store')], { cwd: directory })
      const pkgRoot = join(directory, 'node_modules', item.package)
      const pkg = await readJson(join(pkgRoot, 'package.json'))
      manifests.set(item.package, pkg)
      if (pkg.name !== item.package || (version && pkg.version !== version)) throw new Error(`Installed version mismatch: ${item.package}`)
      const req = createRequire(join(pkgRoot, 'package.json'))
      await access(req.resolve(item.package))
      await access(req.resolve(`${item.package}/client`))
      if ((!pkg.dsh?.bundle?.patch && item.bundle !== 'entry') || !pkg.dsh?.client) throw new Error(`Missing DSH bundle/client: ${item.package}`)
      packages[item.package] = pkgRoot
      installed.push({ ...item, version: pkg.version, ...(commit ? { commit } : {}) })
      say(`${item.package}@${pkg.version}${commit ? `#${commit}` : ''} 安装产物完整`)
    }
    const state = { directory, anchor, packages, hostPackages: hostPackageMap(anchor), installed }
    // Validate host peers without downloading another Cordis/DSH runtime into the plugin store.
    const hostReq = createRequire(anchor)
    const semver = createRequire(manifestPath)('semver')
    const failures = []
    for (const item of installed) {
      const pkg = manifests.get(item.package)
      for (const [peer, range] of Object.entries(pkg.peerDependencies ?? {})) {
        if (pkg.peerDependenciesMeta?.[peer]?.optional) continue
        const peerRoot = state.hostPackages[peer]
        const version = peerRoot && (await readJson(join(peerRoot, 'package.json'))).version
        if (!version || !semver.satisfies(version, range, { includePrerelease: true })) failures.push(`${item.package}: ${peer} 需要 ${range}，当前 ${version ?? '未提供'}`)
      }
    }
    if (failures.length) throw new Error(`插件已安装，但当前 Harness 不兼容，已停止启动。请先更新 DSH：\n${failures.join('\n')}`)
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
      for (const item of installed) {
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
        if (item.package === 'dsh-better-sidebar') delete row.disabled // existing duplicates are disabled above
        if (item.package === 'dshmarket') row.config = { ...row.config, allowRestart: false }
        if (original.some(entry => entry.disabled === true)) row.disabled = true
        patches.push({ insert: [row] })
      }
      // JSON is valid YAML. All referenced modules keep their real names for browser discovery.
      const patch = join(directory, 'launch.patch.yml')
      await writeFile(patch + '.tmp', JSON.stringify(patches, null, 2) + '\n')
      await rename(patch + '.tmp', patch)
      state.patch = patch
      for (const item of installed) await import(pathToFileURL(createRequire(join(packages[item.package], 'package.json')).resolve(item.package)))
    } finally { hooks.deregister() }
    // Persist only facts, not derived paths or a snapshot of the host dependency graph.
    await writeFile(join(directory, 'launch.json.tmp'), JSON.stringify({ anchor, installed }, null, 2) + '\n')
    await rename(join(directory, 'launch.json.tmp'), join(directory, 'launch.json'))
    say('全部插件准备成功，可以启动 DSH。')
    return state
  } catch (error) { await releaseLock(directory, pid); throw error }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, root, value, pidText] = process.argv.slice(2)
  try {
    if (action === 'prepare') await prepare(resolve(root), await harnessAnchor(value), Number(pidText))
    else if (action === 'release') await releaseLock(pluginDirectory(resolve(root)), Number(value))
    else if (action === 'run') {
      const state = await readJson(join(pluginDirectory(resolve(root)), 'launch.json'))
      state.directory = pluginDirectory(resolve(root))
      state.patch = join(state.directory, 'launch.patch.yml')
      state.packages = Object.fromEntries(state.installed.map(item => [item.package, join(state.directory, 'node_modules', item.package)]))
      state.hostPackages = hostPackageMap(state.anchor)
      const profile = createRequire(join(process.env.DSH_HOME || join(process.env.HOME, '.dsh'), 'profiles', process.env.DSH_PROFILE || 'web', 'package.json'))
      for (const [name, path] of Object.entries(state.packages)) {
        if (await realpath(profile.resolve(`${name}/package.json`)) !== await realpath(join(path, 'package.json'))) {
          throw new Error(`${name} 在用户 profile 中另有安装，会遮蔽项目版本；请先移除该重复安装。`)
        }
      }
      installProjectResolver(state)
      const entry = join(dirname(state.anchor), 'lib', 'bin.js')
      const cliArgs = process.argv.slice(4)
      cliArgs.splice(cliArgs[0] === 'web' ? 1 : 2, 0, '--patch', state.patch)
      process.argv = [process.execPath, entry, ...cliArgs]
      await import(pathToFileURL(entry))
    } else throw new Error(`Unknown action: ${action}`)
  } catch (error) { say(error.stack ?? String(error)); process.exitCode = 1 }
}

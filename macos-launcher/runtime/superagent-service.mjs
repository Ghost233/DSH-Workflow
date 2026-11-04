import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { open, readFile, writeFile, mkdir, lstat, readlink, realpath, rename, symlink, unlink } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { listenManagerControl } from './manager-control.mjs'
import { attachManagerWebSocket } from './manager-websocket.mjs'
import { statusNotifications } from './status-notifications.mjs'
import { privateDirectory, redact, SERVICE_PROTOCOL, serviceRequest } from './service-control.mjs'
import { verifySuperagentPayload } from './superagent-payload.mjs'
import { readSharedSuperagentPatches, sharedModelEnvironment, watchSharedModelConfig } from './shared-model-config.mjs'
import { createSuperagentProject, extraWritableRootsForProject, getCommonWritableRoots, getSuperagentProject, listSuperagentGithubAccounts, listSuperagentProjects, projectDirectory, saveCommonWritableRoots, updateSuperagentProject } from './superagent-projects.mjs'
import { prepareSuperagentAccounts } from './superagent-accounts.mjs'
import { syncSuperagentPackages } from './superagent-shared-packages.mjs'
import { feishuEventPaths, protectedProjectPaths, superagentSandboxArguments } from './superagent-sandbox.mjs'
import { applySuperagentProjectSettings } from './superagent-runtime-settings.mjs'
import { pauseSuperagentBeforeStartup } from './superagent-bootstrap.mjs'
import { checkSuperagentBinding, saveSuperagentBinding } from './superagent-binding.mjs'
import { webProfileBundles } from './profile-templates.mjs'
import { recordSuperagentHost, releaseSuperagentHost, requireSuperagentHostStopped } from './superagent-host-lease.mjs'

const port = 3082
const absent = promise => promise.catch(error => { if (error.code !== 'ENOENT') throw error })
export const superagentDirectory = (dataRoot, projectId = 'legacy') => projectDirectory(dataRoot, projectId)
export const superagentSocket = (dataRoot, projectId = 'legacy') => {
  projectDirectory(dataRoot, projectId)
  const identity = realpathSync(resolve(dataRoot)) + (projectId === 'legacy' ? '' : `\0${projectId}`)
  return join('/private/tmp', `dsh-superagent-${process.getuid()}-${createHash('sha256')
    .update(identity).digest('hex').slice(0, 16)}`, 'control.sock')
}

/** Create a private profile once; keep its user settings across starts and app moves. */
export async function prepareSuperagentProfile({ dataRoot, resources, projectId = 'legacy', port: webPort = port }) {
  const { source, packageRoot } = await verifySuperagentPayload(resources)
  const directory = superagentDirectory(dataRoot, projectId), home = join(directory, 'home')
  const profile = join(home, 'profiles/superagent'), link = join(directory, 'package')
  const marker = join(directory, 'package-link.json')
  await privateDirectory(directory)
  const existingLink = await absent(lstat(link))
  const previous = await absent(readFile(marker, 'utf8'))
  if (!existingLink && previous || existingLink && (!existingLink.isSymbolicLink() || !previous)) {
    throw new Error('Superagent 包链接归属未知，已保留现有文件。')
  }
  if (!existingLink) {
    await symlink(packageRoot, link)
    await writeFile(marker, JSON.stringify({ target: packageRoot, commit: source.commit }) + '\n', { flag: 'wx', mode: 0o600 })
  } else {
    const old = JSON.parse(previous), target = resolve(dirname(link), await readlink(link))
    if (target !== old.target || typeof old.commit !== 'string') throw new Error('Superagent 包链接已被修改，已保留现有配置。')
    if (target !== packageRoot || old.commit !== source.commit) {
      const backup = join(directory, 'package-backups', randomUUID())
      const temporary = `${link}.${randomUUID()}.tmp`, temporaryMarker = `${marker}.${randomUUID()}.tmp`
      await mkdir(backup, { recursive: true, mode: 0o700 })
      await symlink(packageRoot, temporary)
      try {
        await writeFile(join(backup, 'package-link.json'), previous, { flag: 'wx', mode: 0o600 })
        await writeFile(temporaryMarker, JSON.stringify({ target: packageRoot, commit: source.commit }) + '\n', { flag: 'wx', mode: 0o600 })
        await rename(link, join(backup, 'package'))
        try { await rename(temporary, link); await rename(temporaryMarker, marker) }
        catch (error) {
          await absent(unlink(link))
          await rename(join(backup, 'package'), link)
          throw error
        }
      } finally { await absent(unlink(temporary)); await absent(unlink(temporaryMarker)) }
    }
  }
  await mkdir(join(home, 'profiles'), { recursive: true, mode: 0o700 })
  const info = await absent(lstat(profile))
  if (!info) {
    await mkdir(profile, { mode: 0o700 })
    const require = createRequire(join(resources, 'node_modules/@deepseek-ai/dsh/package.json'))
    const boot = require('@deepseek-ai/dsh-app-boot')
    boot.initProfile(profile, webProfileBundles(require, boot))
    const manifestPath = join(profile, 'package.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.dependencies['dsh-superagent'] = `link:${link}`
    manifest.dsh.profile.bundles.push('dsh-superagent')
    await mkdir(join(profile, 'node_modules'))
    await symlink(link, join(profile, 'node_modules/dsh-superagent'))
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
    await writeFile(join(profile, 'cordis.patch.yml'), JSON.stringify([
      { id: 'webserver', config: { host: '127.0.0.1', port: webPort } },
      { id: 'dsh-superagent', config: { stateDir: join(directory, 'state') } },
    ], null, 2) + '\n', { mode: 0o600 })
    await writeFile(join(directory, 'profile-owner.json'), JSON.stringify({ profile, link }) + '\n', { flag: 'wx', mode: 0o600 })
  } else {
    const owner = JSON.parse(await readFile(join(directory, 'profile-owner.json'), 'utf8'))
    const manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'))
    const profileLink = join(profile, 'node_modules/dsh-superagent')
    const linkInfo = await lstat(profileLink)
    if (!info.isDirectory() || info.isSymbolicLink() || owner.profile !== profile || owner.link !== link
      || manifest.dependencies?.['dsh-superagent'] !== `link:${link}`
      || !manifest.dsh?.profile?.bundles?.includes('dsh-superagent')
      || !linkInfo.isSymbolicLink() || resolve(dirname(profileLink), await readlink(profileLink)) !== link) {
      throw new Error('Superagent profile 归属未知或包链接已更改，已保留现有配置。')
    }
  }
  return { home, profile, directory }
}

async function health(webPort) {
  try {
    const response = await fetch(`http://127.0.0.1:${webPort}/orchestrator/api/state`, {
      headers: { 'x-orchestrator-request': '1' }, signal: AbortSignal.timeout(1000),
    })
    return response.ok ? await response.json() : undefined
  } catch { return undefined }
}

export async function serveSuperagent({ dataRoot, resources, home = join(homedir(), '.dsh'), projectId = 'legacy' }) {
  const directory = superagentDirectory(dataRoot, projectId), socketPath = superagentSocket(dataRoot, projectId)
  const server = createServer(), logs = []
  let child, childSandboxed = false, childSandboxRoots = [], url, state = 'stopped', message = '', starting, stopping, writes = Promise.resolve(), revision = 0
  let closeModelSharing, modelSharing = { state: 'stopped' }, webPort = port, sharingWarnings = []
  const snapshot = () => ({ protocol: SERVICE_PROTOCOL, superagentVersion: 4, sandboxPolicy: child && childSandboxed ? 1 : null,
    sandboxRoots: child && childSandboxed ? childSandboxRoots : [], projectId, revision: ++revision, service: {
    state, ready: state === 'running', pid: child?.pid ?? null, message: message || null, observedAt: new Date().toISOString(),
  }, modelSharing, sharingWarnings, logs: [...logs] })
  const updates = statusNotifications(snapshot)
  const log = value => {
    const entry = { text: redact(value).replace(/https?:\/\/[^\s"<>]+/g, '[本地地址已隐藏]').slice(-4096), observedAt: new Date().toISOString() }
    logs.push(entry); if (logs.length > 200) logs.shift()
    writes = writes.then(async () => { const file = await open(join(directory, 'service.log'), 'a', 0o600); try { await file.writeFile(JSON.stringify(entry) + '\n') } finally { await file.close() } })
    void writes.catch(() => {})
    updates.publish()
  }
  const start = () => starting ??= (async () => {
    if (stopping) throw new Error('Superagent 正在停止。')
    if (child && state === 'running') return
    if (child) throw new Error('Superagent 尚未停止，请先停止该实例后重新启动。')
    state = 'starting'; message = ''; updates.publish()
    if (!child) await requireSuperagentHostStopped(directory)
    const legacySettings = projectId === 'legacy' ? await absent(lstat(join(directory, 'station-project.json'))) : undefined
    if (projectId === 'legacy' && !legacySettings) throw new Error('请先编辑原有 Superagent，选择本地项目和独立执行目录以启用保护。')
    const project = await getSuperagentProject(dataRoot, projectId)
    let accounts, binding, protectedPaths = [], extraWritableRoots = []
    if (project) {
      if (!project.repository || !project.localProjectDir || !project.executionRoot) throw new Error('请先填写仓库、本地项目和独立执行目录。')
      extraWritableRoots = await extraWritableRootsForProject(dataRoot, project)
      accounts = await prepareSuperagentAccounts({ directory, project, resources })
      for (const other of await listSuperagentProjects(dataRoot)) {
        if (other.error) throw new Error('其他 Superagent 项目配置不可读取，无法确认目录保护。')
        if (other.localProjectDir && other.deploymentMode !== 'dedicated') protectedPaths.push(...await protectedProjectPaths(other.localProjectDir, project.executionRoot))
      }
      protectedPaths = [...new Set(protectedPaths)]
      if (!child && projectId !== 'legacy') webPort = await new Promise((accept, reject) => {
        const probe = createServer()
        probe.once('error', reject)
        probe.listen(0, '127.0.0.1', () => { const selected = probe.address().port; probe.close(() => accept(selected)) })
      })
    }
    const prepared = await prepareSuperagentProfile({ dataRoot, resources, projectId, port: webPort })
    if (!child) {
      // A pre-existing listener must never be mistaken for the child we launch.
      await new Promise((accept, reject) => {
        const probe = createServer()
        probe.once('error', () => reject(new Error(`本机端口 ${webPort} 已被占用，未启动 Superagent。`)))
        probe.listen(webPort, '127.0.0.1', () => probe.close(accept))
      })
      state = 'starting'; message = ''; url = undefined; updates.publish()
      let modelEnvironment, credentialPath, sharedPatches
      try {
        const daily = join(home, 'profiles/desktop')
        const manifest = JSON.parse(await readFile(join(daily, 'package.json'), 'utf8'))
        const initialPackages = Object.keys(manifest.dependencies ?? {})
        const packageResult = await syncSuperagentPackages({ daily, profile: prepared.profile, packages: initialPackages })
        sharingWarnings = packageResult.skipped.map(row => `${row.package}：${row.reason}`)
        const readPatches = async options => {
          const skipped = []
          const current = JSON.parse(await readFile(join(daily, 'package.json'), 'utf8'))
          const added = Object.keys(current.dependencies ?? {}).filter(name => !initialPackages.includes(name)
            && !['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'].includes(name))
          const unavailablePackages = [...packageResult.skipped.map(row => row.package), ...added]
          const patches = await readSharedSuperagentPatches({ ...options, unavailablePackages, onSkipped: row => skipped.push(row) })
          sharingWarnings = [...packageResult.skipped.map(row => `${row.package}：${row.reason}`),
            ...skipped.filter(row => !packageResult.skipped.some(item => item.package === row.name)).map(row => `${row.name}：${row.reason}`), ...added.map(name => `${name}：重启此 Superagent 后生效`)]
          return patches
        }
        closeModelSharing = await watchSharedModelConfig({ resources, home, target: join(prepared.home, 'cordis.patch.yml'),
          readPatches,
          onError: reason => { modelSharing = { state: 'error', message: reason }; log(reason) },
          onUpdated: () => { modelSharing = { state: 'ready' }; updates.publish() },
        })
        sharedPatches = await readPatches({ resources, home })
        modelEnvironment = await sharedModelEnvironment(home, sharedPatches, process.env)
        const credential = sharedPatches.find(row => row.id === 'credentials')?.config?.path
        if (typeof credential !== 'string') throw new Error('DSH 凭据路径必须是绝对路径。')
        credentialPath = await realpath(credential).catch(async error => {
          if (error.code !== 'ENOENT') throw error
          return join(await realpath(dirname(credential)), basename(credential))
        })
      } catch (error) {
        await closeModelSharing?.(); closeModelSharing = undefined
        const known = [
          '已有 Superagent 主目录配置，无法自动启用共享模型。',
          '共享模型配置已被外部修改，已保留原文件。',
          '请先启动 DSH 服务并在模型配置中完成设置。',
          'DSH 凭据路径必须是绝对路径。',
        ]
        modelSharing = { state: 'error', message: known.includes(error.message) ? error.message
          : '共享模型配置不可用，请检查 DSH 模型设置和 Superagent 配置。' }
        state = 'failed'; message = modelSharing.message; updates.publish()
        throw new Error(modelSharing.message)
      }
      let launchPatch
      try {
        const environment = { ...process.env, ...modelEnvironment, DSH_HOME: prepared.home,
          WORKFLOW_PROJECT_DIR: project.localProjectDir, DSH_WORKFLOW_MANAGED_SUPERAGENT: '1',
          GH_CONFIG_DIR: project.ghConfigDir, GH_HOST: 'github.com' }
        if (project.larkExecutable === '@bundled') environment.PATH = `${join(resources, 'bin')}${delimiter}${environment.PATH ?? ''}`
        delete environment.DSH_LAUNCH_PASSWORD
        delete environment.DSH_WORKFLOW_DATA_ROOT
        for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']) delete environment[key]
        const args = [join(resources, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'superagent']
        if (project) {
          launchPatch = join(directory, `station-launch-${randomUUID()}.json`)
          await writeFile(launchPatch, JSON.stringify([{ id: 'webserver', config: { host: '127.0.0.1', port: webPort } },
            { id: 'dsh-superagent-feishu', disabled: !accounts.feishu }]) + '\n', { flag: 'wx', mode: 0o600 })
          args.push('--patch', launchPatch)
        }
        args.push('--no-open')
        const executable = project ? '/usr/bin/sandbox-exec' : join(resources, 'node')
        const temporary = `${dirname(socketPath)}-tmp`
        await privateDirectory(temporary)
        environment.TMPDIR = temporary
        const projectFile = join(directory, projectId === 'legacy' ? 'station-project.json' : 'project.json')
        const stationPaths = [...await Promise.all([projectFile, join(directory, 'station-accounts')].map(path => realpath(path))),
          join(await realpath(directory), 'station-binding.json'), join(await realpath(directory), 'station-host.json')]
        const writable = await Promise.all([directory, project.executionRoot, temporary, ...extraWritableRoots,
          ...(project.deploymentMode === 'dedicated' ? [project.localProjectDir] : [])].map(path => realpath(path)))
        const feishuEvents = await feishuEventPaths(project.feishuConfigDir, accounts.feishuAppId)
        const launchArgs = project ? [...superagentSandboxArguments([...protectedPaths, ...stationPaths], writable, { credential: credentialPath, feishuEvents }),
          '--', join(resources, 'node'), ...args] : args
        const { hasTickets } = await pauseSuperagentBeforeStartup({ directory, node: await realpath(join(resources, 'node')),
          cli: join(resources, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), webPort, environment,
          protectedPaths: [...protectedPaths, ...stationPaths], writableRoots: writable, credential: credentialPath, patches: sharedPatches })
        binding = await checkSuperagentBinding({ directory, project, accounts, hasTickets })
        const owned = spawn(executable, launchArgs, { cwd: prepared.directory, env: environment, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
        child = owned
        childSandboxed = Boolean(project)
        childSandboxRoots = [...writable, ...feishuEvents ? [feishuEvents.events, feishuEvents.bot] : []]
        for (const stream of [owned.stdout, owned.stderr]) createInterface({ input: stream }).on('line', line => {
          const match = /^dsh web:\s*(https?:\/\/\S+)/.exec(line)
          if (match) {
            try { const parsed = new URL(match[1]); if (parsed.hostname === '127.0.0.1' && parsed.port === String(webPort)) url = parsed.href } catch {}
          }
          log(line)
        })
        owned.once('error', error => { message = redact(error.message); state = 'failed'; log(message) })
        owned.once('close', (code, signal) => {
          if (child !== owned) return
          child = undefined; childSandboxed = false; childSandboxRoots = []; url = undefined
          try { process.kill(-owned.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') log('Superagent 子进程未能全部停止。') }
          void releaseSuperagentHost(directory, owned.pid).catch(() => log('Superagent 进程记录未能清理。'))
          if (launchPatch) void absent(unlink(launchPatch)).catch(error => log(`临时启动配置未能清理：${error.message}`))
          void closeModelSharing?.().catch(() => log('共享模型配置监听未能正常关闭。'))
          closeModelSharing = undefined; modelSharing = { state: 'stopped' }
          if (state === 'stopping') { state = 'stopped'; message = '' }
          else { state = 'failed'; message = `Superagent 已退出（${signal ?? code}）。` }
          log(message || 'Superagent 已停止。')
        })
        try { recordSuperagentHost(directory, owned.pid, launchPatch) } catch (error) { owned.kill('SIGINT'); throw error }
      } catch (error) {
        if (launchPatch) await absent(unlink(launchPatch)).catch(() => {})
        await closeModelSharing?.().catch(() => {}); closeModelSharing = undefined
        modelSharing = { state: 'stopped' }; state = 'failed'; message = redact(error.message); updates.publish()
        throw error
      }
    }
    const owned = child
    for (let attempt = 0; attempt < 120 && child === owned; attempt++) {
      const value = await health(webPort)
      if (url && ['ready', 'paused'].includes(value?.health?.runtime?.state)) {
        try { if (project) await applySuperagentProjectSettings({ url, project, accounts,
          beforeResume: () => saveSuperagentBinding(directory, binding) }) }
        catch (error) { state = 'failed'; message = redact(error.message); updates.publish(); throw error }
        const current = project ? await health(webPort) : value
        state = 'running'; message = current?.setup?.problem?.detail ?? ''; updates.publish(); return
      }
      await delay(500)
    }
    if (child === owned) { state = 'failed'; message = 'Superagent 启动未就绪，请检查日志；进程仍保留。'; updates.publish() }
    throw new Error(message || 'Superagent 在启动期间退出。')
  })().catch(error => {
    if (state === 'starting') { state = 'failed'; message = redact(error.message); updates.publish() }
    throw error
  }).finally(() => { starting = undefined })
  const stop = () => stopping ??= (async () => {
    await starting?.catch(() => {})
    const owned = child
    if (!owned) { state = 'stopped'; message = ''; updates.publish(); return }
    state = 'stopping'; updates.publish()
    const exited = new Promise(accept => owned.once('close', accept))
    owned.kill('SIGINT')
    let timer
    const timeout = new Promise(accept => { timer = setTimeout(() => accept(false), 300_000); timer.unref() })
    const finished = await Promise.race([exited.then(() => true), timeout]).finally(() => clearTimeout(timer))
    if (!finished) throw new Error('Superagent 正在等待任务结束，尚未强制终止。')
  })().finally(() => { stopping = undefined })
  const command = async input => {
    if (input.type === 'start') await start()
    else if (input.type === 'stop') await stop()
    else if (input.type === 'open') {
      if (state !== 'running' || !url) throw new Error('请先启动 Superagent。')
      return { ...snapshot(), url }
    } else if (input.type !== 'status') throw new Error('Unknown Superagent command')
    if (state === 'running') {
      const value = await health(webPort)
      message = value?.setup?.problem?.detail ?? (value ? '' : 'Superagent 状态暂不可用。')
    }
    return snapshot()
  }
  const closeChannels = attachManagerWebSocket(server, command, updates)
  const control = await listenManagerControl(server, { directory, socketPath })
  if (!control) { updates.close(); closeChannels(); return null }
  return { async close() { await stop(); updates.close(); closeChannels(); await control.close(); await writes } }
}

async function ensureManager(dataRoot, resources, home, projectId) {
  if (projectId !== 'legacy') await getSuperagentProject(dataRoot, projectId)
  const socket = superagentSocket(dataRoot, projectId)
  try {
    const existing = await serviceRequest(socket, { type: 'status' })
    if (existing.superagentVersion === 4 && existing.projectId === projectId) return socket
    if (projectId !== 'legacy') throw new Error('Superagent 管理器版本不匹配，请退出 Station 并重新打开后再启动。')
    if (existing.service?.state !== 'stopped' || existing.service?.pid) throw new Error('旧版 Superagent 仍在运行，请先停止该实例。')
    throw new Error('旧版 Superagent 后台管理器仍在运行。为避免中断并发任务，请重启电脑后再接管原有实例。')
  }
  catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error }
  const directory = superagentDirectory(dataRoot, projectId)
  await privateDirectory(directory)
  const log = await open(join(directory, 'manager.log'), 'a', 0o600)
  try {
    const manager = spawn(process.execPath, [fileURLToPath(import.meta.url), 'manager', dataRoot, resources, home, projectId], {
      detached: true, stdio: ['ignore', log.fd, log.fd], cwd: resources, env: process.env,
    })
    await new Promise((accept, reject) => { manager.once('spawn', accept); manager.once('error', reject) })
    manager.unref()
  } finally { await log.close() }
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const ready = await serviceRequest(socket, { type: 'status' })
      if (ready.superagentVersion !== 4 || ready.projectId !== projectId) throw new Error('Superagent 管理器版本不匹配，请退出 Station 并重新打开后再启动。')
      return socket
    }
    catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error; await delay(50) }
  }
  throw new Error('Superagent 管理进程未就绪，请检查 manager.log。')
}

async function withRegistryLock(dataRoot, run) {
  const directory = join(resolve(dataRoot), 'superagent-projects')
  await privateDirectory(directory)
  const lock = await open(join(directory, 'registry.lock'), constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | 0x20, 0o600)
  try {
    const info = await lock.stat()
    if (!info.isFile() || info.uid !== process.getuid() || info.nlink !== 1 || (info.mode & 0o077)) throw new Error('Superagent 项目锁不安全。')
    return await run()
  } finally { await lock.close() }
}

async function requireProjectsStopped(dataRoot) {
  for (const project of await listSuperagentProjects(dataRoot)) {
    try {
      const value = await serviceRequest(superagentSocket(dataRoot, project.id), { type: 'status' }, 1000)
      if (value.service?.state !== 'stopped' || value.service?.pid) throw new Error('请先停止所有 Superagent，再更改项目配置，以更新项目目录保护。')
    } catch (error) {
      if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error
    }
    await requireSuperagentHostStopped(superagentDirectory(dataRoot, project.id))
  }
}

// A running sandbox has a fixed allow-list. A new dedicated workspace is safe
// only when neither it nor the registry is inside any existing writable root.
async function runningWritableRoots(dataRoot) {
  const roots = []
  for (const project of await listSuperagentProjects(dataRoot)) {
    if (project.error) throw new Error('其他 Superagent 项目配置不可读取，无法确认目录保护。')
    let status
    try { status = await serviceRequest(superagentSocket(dataRoot, project.id), { type: 'status' }, 1000) }
    catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error }
    if (!status || status.service?.state === 'stopped' && !status.service?.pid) {
      await requireSuperagentHostStopped(superagentDirectory(dataRoot, project.id))
      continue
    }
    if (project.deploymentMode !== 'dedicated' || !project.localProjectDir || !project.executionRoot) {
      throw new Error('运行中的旧项目无法确认目录隔离，请先停止该 Superagent。')
    }
    if (status.projectId !== project.id || status.sandboxPolicy !== 1 || !status.service?.pid || !Array.isArray(status.sandboxRoots)
      || !status.sandboxRoots.length || status.sandboxRoots.some(path => typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))) {
      throw new Error('运行中的 Superagent 未确认目录隔离；请先退出 Station 并停止服务，再用新版重新打开。')
    }
    roots.push(...status.sandboxRoots)
    const temporary = `${dirname(superagentSocket(dataRoot, project.id))}-tmp`
    for (const path of [superagentDirectory(dataRoot, project.id), project.localProjectDir, project.executionRoot, project.feishuConfigDir, temporary].filter(Boolean)) {
      roots.push(await realpath(path).catch(error => { if (error.code === 'ENOENT' && path === temporary) return resolve(path); throw error }))
    }
  }
  return roots
}

function protectNewWorkspace(dataRoot, roots, work) {
  const contains = (parent, child) => {
    const path = relative(parent, child)
    return path === '' || path !== '..' && !path.startsWith('../') && !isAbsolute(path)
  }
  const registry = realpathSync(join(resolve(dataRoot), 'superagent-projects'))
  if (contains(registry, work) || contains(work, registry)
    || roots.some(root => contains(root, registry) || contains(root, work) || contains(work, root))) {
    throw new Error('新项目目录与运行中的 Superagent 可写目录或项目配置目录重叠，请选择其他存放目录。')
  }
}

if (import.meta.main) {
  const [action, dataRoot, resources, home = join(homedir(), '.dsh'), projectId = 'legacy'] = process.argv.slice(2)
  if (action === 'manager') {
    const manager = await serveSuperagent({ dataRoot, resources, home, projectId })
    if (manager) for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void manager.close().then(() => process.exit(0), error => { console.error(redact(error.message)); process.exitCode = 1 }))
  } else {
    try {
      if (!dataRoot || !resources) throw new Error('Invalid Superagent request')
      if (action === 'projects') {
        process.stdout.write(JSON.stringify({ ok: true, value: { projects: await listSuperagentProjects(dataRoot), commonWritableRoots: await getCommonWritableRoots(dataRoot) } }) + '\n')
      } else if (action === 'accounts') {
        process.stdout.write(JSON.stringify({ ok: true, value: { accounts: await listSuperagentGithubAccounts() } }) + '\n')
      } else if (action === 'create-project' || action === 'update-project' || action === 'save-common-writable-roots') {
        let text = ''
        for await (const chunk of process.stdin) { text += chunk; if (text.length > 64 * 1024) throw new Error('项目配置过大。') }
        const input = JSON.parse(text)
        if (action === 'save-common-writable-roots') {
          const commonWritableRoots = await withRegistryLock(dataRoot, async () => {
            await requireProjectsStopped(dataRoot)
            return saveCommonWritableRoots(dataRoot, input)
          })
          process.stdout.write(JSON.stringify({ ok: true, value: { commonWritableRoots } }) + '\n')
        } else {
        const project = await withRegistryLock(dataRoot, async () => {
          if (action === 'create-project' && input.guided === true && input.dedicated === true) {
            const roots = await runningWritableRoots(dataRoot)
            return createSuperagentProject(dataRoot, input, { beforeGuidedCreate: work => protectNewWorkspace(dataRoot, roots, work) })
          }
          await requireProjectsStopped(dataRoot)
          return action === 'create-project' ? createSuperagentProject(dataRoot, input) : updateSuperagentProject(dataRoot, projectId, input)
        })
        process.stdout.write(JSON.stringify({ ok: true, value: { project } }) + '\n')
        }
      } else {
      if (!['start', 'stop', 'status', 'open'].includes(action)) throw new Error('Invalid Superagent request')
      let value
      try {
        const run = async () => {
          const socket = action === 'start' ? await ensureManager(dataRoot, resources, home, projectId) : superagentSocket(dataRoot, projectId)
          try { return await serviceRequest(socket, { type: action }, action === 'stop' ? 310_000 : 70_000) }
          catch (error) {
            if (action !== 'start' || !['DSH service control timed out', 'DSH service control disconnected'].includes(error.message)) throw error
            const current = await serviceRequest(socket, { type: 'status' })
            if (current.service?.state === 'starting') current.service.message = 'Superagent 仍在启动，请稍后刷新状态。'
            return current
          }
        }
        value = action === 'start' ? await withRegistryLock(dataRoot, run) : await run()
      }
      catch (error) {
        if (['status', 'stop'].includes(action) && ['ENOENT', 'ECONNREFUSED'].includes(error.code)) {
          await requireSuperagentHostStopped(superagentDirectory(dataRoot, projectId))
          value = { protocol: SERVICE_PROTOCOL, service: { state: 'stopped', ready: false }, modelSharing: { state: 'stopped' }, logs: [] }
        } else throw error
      }
      process.stdout.write(JSON.stringify({ ok: true, value }) + '\n')
      }
    } catch (error) { process.stdout.write(JSON.stringify({ ok: false, error: redact(error.message) }) + '\n'); process.exitCode = 1 }
  }
}

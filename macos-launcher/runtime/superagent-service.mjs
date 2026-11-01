import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { open, readFile, writeFile, mkdir, lstat, readlink, rename, symlink, unlink } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { listenManagerControl } from './manager-control.mjs'
import { attachManagerWebSocket } from './manager-websocket.mjs'
import { statusNotifications } from './status-notifications.mjs'
import { privateDirectory, redact, SERVICE_PROTOCOL, serviceRequest } from './service-control.mjs'
import { verifySuperagentPayload } from './superagent-payload.mjs'
import { readSharedModelPatches, sharedModelEnvironment, watchSharedModelConfig } from './shared-model-config.mjs'

const port = 3082
const absent = promise => promise.catch(error => { if (error.code !== 'ENOENT') throw error })
export const superagentDirectory = dataRoot => join(resolve(dataRoot), 'superagent')
export const superagentSocket = dataRoot => join('/private/tmp', `dsh-superagent-${process.getuid()}-${createHash('sha256')
  .update(realpathSync(resolve(dataRoot))).digest('hex').slice(0, 16)}`, 'control.sock')

/** Create a private profile once; keep its user settings across starts and app moves. */
export async function prepareSuperagentProfile({ dataRoot, resources }) {
  const { source, packageRoot } = await verifySuperagentPayload(resources)
  const directory = superagentDirectory(dataRoot), home = join(directory, 'home')
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
    boot.initProfile(profile, boot.PROFILE_TEMPLATES.web.bundles)
    const manifestPath = join(profile, 'package.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.dependencies['dsh-superagent'] = `link:${link}`
    manifest.dsh.profile.bundles.push('dsh-superagent')
    await mkdir(join(profile, 'node_modules'))
    await symlink(link, join(profile, 'node_modules/dsh-superagent'))
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
    await writeFile(join(profile, 'cordis.patch.yml'), JSON.stringify([
      { id: 'webserver', config: { host: '127.0.0.1', port } },
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

async function health() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/orchestrator/api/state`, {
      headers: { 'x-orchestrator-request': '1' }, signal: AbortSignal.timeout(1000),
    })
    return response.ok ? await response.json() : undefined
  } catch { return undefined }
}

export async function serveSuperagent({ dataRoot, resources, home = join(homedir(), '.dsh') }) {
  const directory = superagentDirectory(dataRoot), socketPath = superagentSocket(dataRoot)
  const server = createServer(), logs = []
  let child, url, state = 'stopped', message = '', starting, stopping, writes = Promise.resolve(), revision = 0
  let closeModelSharing, modelSharing = { state: 'stopped' }
  const snapshot = () => ({ protocol: SERVICE_PROTOCOL, revision: ++revision, service: {
    state, ready: state === 'running', pid: child?.pid ?? null, message: message || null, observedAt: new Date().toISOString(),
  }, modelSharing, logs: [...logs] })
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
    const prepared = await prepareSuperagentProfile({ dataRoot, resources })
    if (!child) {
      // A pre-existing listener must never be mistaken for the child we launch.
      await new Promise((accept, reject) => {
        const probe = createServer()
        probe.once('error', () => reject(new Error(`本机端口 ${port} 已被占用，未启动 Superagent。`)))
        probe.listen(port, '127.0.0.1', () => probe.close(accept))
      })
      state = 'starting'; message = ''; url = undefined; updates.publish()
      let modelEnvironment
      try {
        closeModelSharing = await watchSharedModelConfig({ resources, home, target: join(prepared.home, 'cordis.patch.yml'),
          onError: reason => { modelSharing = { state: 'error', message: reason }; log(reason) },
          onUpdated: () => { modelSharing = { state: 'ready' }; updates.publish() },
        })
        modelEnvironment = await sharedModelEnvironment(home, await readSharedModelPatches({ resources, home }), process.env)
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
      const environment = { ...process.env, ...modelEnvironment, DSH_HOME: prepared.home }
      delete environment.DSH_LAUNCH_PASSWORD
      delete environment.DSH_WORKFLOW_DATA_ROOT
      const owned = spawn(join(resources, 'node'), [join(resources, 'node_modules/@deepseek-ai/dsh/lib/bin.js'),
        '--profile', 'superagent', '--no-open'], { cwd: prepared.directory, env: environment, stdio: ['ignore', 'pipe', 'pipe'] })
      child = owned
      for (const stream of [owned.stdout, owned.stderr]) createInterface({ input: stream }).on('line', line => {
        const match = /^dsh web:\s*(https?:\/\/\S+)/.exec(line)
        if (match) {
          try { const parsed = new URL(match[1]); if (parsed.hostname === '127.0.0.1' && parsed.port === String(port)) url = parsed.href } catch {}
        }
        log(line)
      })
      owned.once('error', error => { message = redact(error.message); state = 'failed'; log(message) })
      owned.once('close', (code, signal) => {
        if (child !== owned) return
        child = undefined; url = undefined
        void closeModelSharing?.().catch(() => log('共享模型配置监听未能正常关闭。'))
        closeModelSharing = undefined; modelSharing = { state: 'stopped' }
        if (state === 'stopping') { state = 'stopped'; message = '' }
        else { state = 'failed'; message = `Superagent 已退出（${signal ?? code}）。` }
        log(message || 'Superagent 已停止。')
      })
    }
    const owned = child
    for (let attempt = 0; attempt < 120 && child === owned; attempt++) {
      const value = await health()
      if (url && ['ready', 'paused'].includes(value?.health?.runtime?.state)) {
        state = 'running'; message = value.setup?.problem?.detail ?? ''; updates.publish(); return
      }
      await delay(500)
    }
    if (child === owned) { state = 'failed'; message = 'Superagent 启动未就绪，请检查日志；进程仍保留。'; updates.publish() }
    throw new Error(message || 'Superagent 在启动期间退出。')
  })().finally(() => { starting = undefined })
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
      const value = await health()
      message = value?.setup?.problem?.detail ?? (value ? '' : 'Superagent 状态暂不可用。')
    }
    return snapshot()
  }
  const closeChannels = attachManagerWebSocket(server, command, updates)
  const control = await listenManagerControl(server, { directory, socketPath })
  if (!control) { updates.close(); closeChannels(); return null }
  return { async close() { await stop(); updates.close(); closeChannels(); await control.close(); await writes } }
}

async function ensureManager(dataRoot, resources, home) {
  const socket = superagentSocket(dataRoot)
  try {
    const existing = await serviceRequest(socket, { type: 'status' })
    if (!existing.modelSharing) throw new Error('旧版 Superagent 后台管理器尚未退出，请结束旧管理器或重启电脑后再启动。')
    return socket
  }
  catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error }
  const directory = superagentDirectory(dataRoot)
  await privateDirectory(directory)
  const log = await open(join(directory, 'manager.log'), 'a', 0o600)
  try {
    const manager = spawn(process.execPath, [fileURLToPath(import.meta.url), 'manager', dataRoot, resources, home], {
      detached: true, stdio: ['ignore', log.fd, log.fd], cwd: resources, env: process.env,
    })
    await new Promise((accept, reject) => { manager.once('spawn', accept); manager.once('error', reject) })
    manager.unref()
  } finally { await log.close() }
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await serviceRequest(socket, { type: 'status' }); return socket }
    catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error; await delay(50) }
  }
  throw new Error('Superagent 管理进程未就绪，请检查 manager.log。')
}

if (import.meta.main) {
  const [action, dataRoot, resources, home = join(homedir(), '.dsh')] = process.argv.slice(2)
  if (action === 'manager') {
    const manager = await serveSuperagent({ dataRoot, resources, home })
    if (manager) for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void manager.close().then(() => process.exit(0), error => { console.error(redact(error.message)); process.exitCode = 1 }))
  } else {
    try {
      if (!['start', 'stop', 'status', 'open'].includes(action) || !dataRoot || !resources) throw new Error('Invalid Superagent request')
      const socket = action === 'start' ? await ensureManager(dataRoot, resources, home) : superagentSocket(dataRoot)
      let value
      try { value = await serviceRequest(socket, { type: action }, action === 'stop' ? 310_000 : 70_000) }
      catch (error) {
        if (['status', 'stop'].includes(action) && ['ENOENT', 'ECONNREFUSED'].includes(error.code)) {
          value = { protocol: SERVICE_PROTOCOL, service: { state: 'stopped', ready: false }, modelSharing: { state: 'stopped' }, logs: [] }
        } else throw error
      }
      process.stdout.write(JSON.stringify({ ok: true, value }) + '\n')
    } catch (error) { process.stdout.write(JSON.stringify({ ok: false, error: redact(error.message) }) + '\n'); process.exitCode = 1 }
  }
}

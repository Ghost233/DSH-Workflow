#!/usr/bin/env node

import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { isAbsolute, resolve, join, dirname } from 'node:path'
import { startDashboard } from './dashboard.mjs'

const CONTROL_CONTRACT = 'DSH_WORKFLOW_CONTROL_V1'
const DEFAULT_PARALLEL = 4
const MAX_PARALLEL = 8
const DEFAULT_TIMEOUT_MS = 4 * 60 * 60 * 1000
const DEFAULT_EVENT_WAIT_MS = 30_000
const DEFAULT_DAEMON_POLL_MS = 1000
const MIN_DAEMON_POLL_MS = 200
const MAX_DAEMON_POLL_MS = 10_000
const RUNNER_DAEMON_CONTRACT = 'DSH_WORKFLOW_RUNNER_DAEMON_V1'
const WORKSPACE_CATALOG_CONTRACT = 'DSH_DASHBOARD_WORKSPACES_V1'
const SUPERVISOR_CONTROL_ACTIONS = new Set([
  'supervisor-start',
  'supervisor-next',
  'supervisor-ack',
  'supervisor-inspect',
  'supervisor-stop',
  'supervisor-execute',
  'supervisor-recover',
  'supervisor-await-event',
  'supervisor-outbox-next',
  'supervisor-outbox-ack',
])
const PRESET_ID = 'owner-workflow'
const PRESET_SOURCE = fileURLToPath(new URL('../agent-presets/owner-workflow/', import.meta.url))
const PLUGIN_ENTRY = fileURLToPath(new URL('../index.js', import.meta.url))

function printHelp() {
  process.stdout.write([
    '用法：',
    '  run-owner-workflow --workflow-id <workflow-id>',
    '  run-owner-workflow --daemon --catalog-root <path>',
    '  run-owner-workflow --dashboard --workflow-id <workflow-id> [--port <port>]',
    '  run-owner-workflow --install-preset [--force]',
    '  run-owner-workflow --self-check',
    '',
    '说明：',
    '  这个脚本必须在已经启动 Owner 工作流插件的 Harness 进程之外执行。',
    '  它只执行控制桥返回的 Supervisor 动作，不读取计划或自行选择任务。',
    '  daemon 只发现已批准或可恢复的 Workflow，并为其启动上述确定性 runner；它不调用模型。',
    '',
    '选项：',
    '  --workflow-id <id>  要执行的工作流编号，必填。',
    '  --root <path>       项目根目录，默认使用当前目录。',
    '  --daemon            监视已登记工作区，自动接管已批准或运行中的 Workflow。',
    '  --catalog-root <path> daemon 使用的工作区目录表根目录。',
    '  --poll-ms <ms>      daemon 扫描与心跳间隔，默认 1000 毫秒。',
    '  --dashboard          只启动本机只读 Dashboard，不读取或解释计划。',
    '  --port <number>      Dashboard 监听端口，默认 57357；0 表示随机端口。',
    '  --parallel <number> 同一阶段最大并行 Owner 数，默认 4。',
    '  --timeout-ms <ms>   单次控制请求超时时间，默认 4 小时。',
    '  --event-wait-ms <ms> 单次事件等待时长，默认 30 秒，最大 60 秒。',
    '  --install-preset    将 owner-workflow preset 安装到 Harness user root。',
    '  --force              明确允许替换已有的同名 user preset。',
    '  --self-check         只检查 runner 与随附 preset，不启动工作流。',
    '  --help              显示帮助。',
  ].join('\n') + '\n')
}

function validateWorkflowId(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('必须提供 --workflow-id')
  }
  const workflowId = value.trim()
  if (
    workflowId === '.'
    || workflowId === '..'
    || workflowId.startsWith('-')
    || /[\\/\0]/u.test(workflowId)
    || /\s/u.test(workflowId)
  ) {
    throw new Error('--workflow-id 不是安全的 workflow-id')
  }
  return workflowId
}

function parseArgs(argv) {
  const result = {
    command: 'run',
    root: process.cwd(),
    workflowId: undefined,
    dashboard: false,
    port: 57357,
    parallel: DEFAULT_PARALLEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    eventWaitMs: DEFAULT_EVENT_WAIT_MS,
    daemon: false,
    catalogRoot: undefined,
    pollMs: DEFAULT_DAEMON_POLL_MS,
    force: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') {
      printHelp()
      process.exit(0)
    }
    if (argument === '--install-preset') {
      if (result.command !== 'run' || result.dashboard || result.daemon) throw new Error('安装 preset、自检、daemon 和工作流执行不能同时指定')
      result.command = 'install-preset'
      continue
    }
    if (argument === '--self-check') {
      if (result.command !== 'run' || result.dashboard || result.daemon) throw new Error('安装 preset、自检、daemon 和工作流执行不能同时指定')
      result.command = 'self-check'
      continue
    }
    if (argument === '--dashboard') {
      if (result.command !== 'run') throw new Error('Dashboard 不能与安装 preset 或自检同时指定')
      result.dashboard = true
      continue
    }
    if (argument === '--daemon') {
      if (result.command !== 'run' || result.dashboard) throw new Error('Runner daemon 不能与 Dashboard、安装 preset 或自检同时指定')
      result.daemon = true
      continue
    }
    if (argument === '--force') {
      result.force = true
      continue
    }
    if (argument === '--root') {
      result.root = resolve(argv[++index] ?? '')
      continue
    }
    if (argument === '--catalog-root') {
      result.catalogRoot = resolve(argv[++index] ?? '')
      continue
    }
    if (argument === '--poll-ms') {
      result.pollMs = Number.parseInt(argv[++index] ?? '', 10)
      continue
    }
    if (argument === '--workflow-id') {
      result.workflowId = argv[++index]
      continue
    }
    if (argument === '--port') {
      result.port = Number.parseInt(argv[++index] ?? '', 10)
      continue
    }
    if (argument === '--parallel') {
      result.parallel = Number.parseInt(argv[++index] ?? '', 10)
      continue
    }
    if (argument === '--timeout-ms') {
      result.timeoutMs = Number.parseInt(argv[++index] ?? '', 10)
      continue
    }
    if (argument === '--event-wait-ms') {
      result.eventWaitMs = Number.parseInt(argv[++index] ?? '', 10)
      continue
    }
    throw new Error(`未知参数：${argument}`)
  }
  if (result.command !== 'run') {
    if (result.command === 'self-check' && result.force) {
      throw new Error('--force 只能与 --install-preset 一起使用')
    }
    return result
  }
  if (result.force) throw new Error('--force 只能与 --install-preset 一起使用')
  if (result.daemon) {
    if (result.workflowId !== undefined || result.dashboard) throw new Error('Runner daemon 不能指定 workflow-id 或 Dashboard')
    result.catalogRoot = resolve(result.catalogRoot ?? result.root)
    if (!Number.isSafeInteger(result.pollMs) || result.pollMs < MIN_DAEMON_POLL_MS || result.pollMs > MAX_DAEMON_POLL_MS) {
      throw new Error(`--poll-ms 必须是 ${MIN_DAEMON_POLL_MS}-${MAX_DAEMON_POLL_MS} 的整数`)
    }
    if (!Number.isSafeInteger(result.parallel) || result.parallel <= 0 || result.parallel > MAX_PARALLEL) {
      throw new Error(`--parallel 必须是 1-${MAX_PARALLEL} 的整数`)
    }
    if (!Number.isSafeInteger(result.timeoutMs) || result.timeoutMs <= 0) {
      throw new Error('--timeout-ms 必须是正整数')
    }
    if (!Number.isSafeInteger(result.eventWaitMs) || result.eventWaitMs < 1 || result.eventWaitMs > 60_000) {
      throw new Error('--event-wait-ms 必须是 1-60000 的整数')
    }
    return result
  }
  if (result.catalogRoot !== undefined || result.pollMs !== DEFAULT_DAEMON_POLL_MS) {
    throw new Error('--catalog-root 和 --poll-ms 只能与 --daemon 一起使用')
  }
  result.workflowId = validateWorkflowId(result.workflowId)
  if (!Number.isSafeInteger(result.port) || result.port < 0 || result.port > 65_535) {
    throw new Error('--port 必须是 0-65535 的整数')
  }
  if (result.dashboard) return result
  if (!Number.isSafeInteger(result.parallel) || result.parallel <= 0 || result.parallel > MAX_PARALLEL) {
    throw new Error(`--parallel 必须是 1-${MAX_PARALLEL} 的整数`)
  }
  if (!Number.isSafeInteger(result.timeoutMs) || result.timeoutMs <= 0) {
    throw new Error('--timeout-ms 必须是正整数')
  }
  if (!Number.isSafeInteger(result.eventWaitMs) || result.eventWaitMs < 1 || result.eventWaitMs > 60_000) {
    throw new Error('--event-wait-ms 必须是 1-60000 的整数')
  }
  return result
}

function dshHomeDirectory() {
  const configured = process.env.DSH_HOME?.trim()
  if (configured !== undefined && configured !== '') return resolve(configured)
  const home = process.env.HOME?.trim()
  if (home === undefined || home === '') throw new Error('无法确定 Harness home，请设置 DSH_HOME 或 HOME')
  return join(resolve(home), '.dsh')
}

async function readRequiredFile(path, label) {
  try {
    const content = await readFile(path, 'utf8')
    if (content.trim() === '') throw new Error(`${label}为空`)
    return content
  } catch (error) {
    throw new Error(`${label}读取失败：${describeError(error)}`)
  }
}

async function verifyPresetSource(directory) {
  const composition = await readRequiredFile(join(directory, 'agent.cordis.yml'), 'preset 组合文件')
  const metadata = await readRequiredFile(join(directory, 'preset.yml'), 'preset 元数据文件')
  const pluginProxy = await readRequiredFile(join(directory, 'plugin.mjs'), 'preset 插件代理')
if (!composition.includes("name: './plugin.mjs'") || !composition.includes('owner_submit')) {
  throw new Error('preset 组合文件缺少静态插件代理或 owner_submit 提交关卡')
}
  if (!metadata.includes('name:') || !metadata.includes('description:')) {
    throw new Error('preset 元数据文件缺少 name 或 description')
  }
  if (!pluginProxy.includes('export') || !pluginProxy.includes('index.js')) throw new Error('preset 插件代理没有导出插件入口')
  return { composition, metadata, pluginProxy }
}

function installedPluginProxy() {
  return [
    '// 由 dsh-owner-workflow --install-preset 生成，固定指向本次安装的插件入口。',
    `export { name, inject, apply, default } from ${JSON.stringify(pathToFileURL(PLUGIN_ENTRY).href)}`,
    '',
  ].join('\n')
}

async function installPreset(force) {
  const source = await verifyPresetSource(PRESET_SOURCE)
  const target = join(dshHomeDirectory(), '.agent-presets', PRESET_ID)
  await mkdir(dirname(target), { recursive: true })

  let existing
  try {
    existing = await verifyPresetSource(target)
  } catch (error) {
    if (error?.code !== 'ENOENT') existing = undefined
  }
  if (existing !== undefined) {
    const expectedProxy = installedPluginProxy()
    if (existing.composition === source.composition && existing.metadata === source.metadata && existing.pluginProxy === expectedProxy) {
      return { presetId: PRESET_ID, target, changed: false, verified: true }
    }
    if (!force) {
      throw new Error(`user preset ${PRESET_ID} 已存在且内容不同；如确认替换，请显式使用 --force`)
    }
  } else {
    try {
      await stat(target)
      if (!force) throw new Error(`user preset ${PRESET_ID} 已存在但不可验证；如确认替换，请显式使用 --force`)
      await rm(target, { recursive: true, force: true })
    } catch (error) {
      if (error?.code !== 'ENOENT' && !String(error?.message ?? '').includes('已存在')) throw error
      if (String(error?.message ?? '').includes('已存在')) throw error
    }
  }

  if (force) await rm(target, { recursive: true, force: true })
  await cp(PRESET_SOURCE, target, { recursive: true, force: true })
  await writeFile(join(target, 'plugin.mjs'), installedPluginProxy(), 'utf8')
  await verifyPresetSource(target)
  return { presetId: PRESET_ID, target, changed: true, verified: true }
}

async function selfCheck() {
  await verifyPresetSource(PRESET_SOURCE)
  return {
    runner: 'dsh-owner-workflow',
    presetId: PRESET_ID,
    presetSource: PRESET_SOURCE,
    pluginEntry: PLUGIN_ENTRY,
    callerDirectory: process.cwd(),
    verified: true,
  }
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`${label}读取失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

function describeError(error) {
  return error instanceof Error ? error.message : String(error)
}

function sendControlRequest(manifest, workflowId, action, payload, timeoutMs) {
  if (!SUPERVISOR_CONTROL_ACTIONS.has(action)) throw new Error(`runner 控制动作不受支持：${action}`)
  const id = randomUUID()
  return new Promise((resolveResponse, rejectResponse) => {
    const socket = createConnection(manifest.socketPath)
    let buffer = ''
    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      socket.destroy()
      callback(value)
    }
    const timeout = setTimeout(() => {
      finish(rejectResponse, new Error(`控制请求 ${action} 超时；主 Harness 可能仍在执行，请先查询 status`))
    }, timeoutMs)
    const clear = () => clearTimeout(timeout)
    socket.setEncoding('utf8')
    socket.on('connect', () => {
      socket.write(`${JSON.stringify({
        contract: CONTROL_CONTRACT,
        id,
        token: manifest.token,
        workflowId,
        action,
        ...payload,
      })}\n`)
    })
    socket.on('data', chunk => {
      buffer += chunk
      while (true) {
        const lineEnd = buffer.indexOf('\n')
        if (lineEnd < 0) return
        const line = buffer.slice(0, lineEnd).trim()
        buffer = buffer.slice(lineEnd + 1)
        if (line === '') continue
        let response
        try {
          response = JSON.parse(line)
        } catch (error) {
          clear()
          finish(rejectResponse, new Error(`控制桥返回了非法 JSON：${describeError(error)}`))
          return
        }
        if (response.id !== id) continue
        clear()
        if (response.ok !== true) {
          finish(rejectResponse, new Error(response.error ?? `控制动作 ${action} 失败`))
          return
        }
        finish(resolveResponse, response.result)
      }
    })
    socket.on('error', error => {
      clear()
      finish(rejectResponse, new Error(`无法连接 Owner 工作流控制桥：${describeError(error)}`))
    })
    socket.on('close', () => {
      if (!settled) {
        clear()
        finish(rejectResponse, new Error(`Owner 工作流控制桥提前关闭，动作：${action}`))
      }
    })
  })
}

function actionIdOf(receipt) {
  if (receipt === null || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error('Supervisor 动作收据必须是对象')
  }
  if (typeof receipt.actionId !== 'string' || receipt.actionId.trim() === '') {
    throw new Error('Supervisor 动作收据缺少 actionId')
  }
  return receipt.actionId
}

function runnerDaemonDirectory(catalogRoot) {
  return join(resolve(catalogRoot), '.dsh-workflow', 'runner')
}

function runnerDaemonStatePath(catalogRoot) {
  return join(runnerDaemonDirectory(catalogRoot), 'daemon.json')
}

function runnerDaemonLockDirectory(catalogRoot) {
  return join(runnerDaemonDirectory(catalogRoot), 'daemon.lock')
}

function workspaceCatalogPath(catalogRoot) {
  return join(resolve(catalogRoot), '.dsh-workflow', 'dashboard', 'workspaces.json')
}

function workspaceId(root) {
  return createHash('sha256').update(resolve(root)).digest('hex').slice(0, 20)
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${randomUUID()}`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}

async function readDaemonWorkspaces(catalogRoot) {
  const catalog = resolve(catalogRoot)
  let records = []
  try {
    const raw = await readJson(workspaceCatalogPath(catalog), 'Runner 工作区目录表')
    if (raw?.contract === WORKSPACE_CATALOG_CONTRACT && Array.isArray(raw.workspaces)) {
      records = raw.workspaces.filter(record => (
        typeof record?.root === 'string'
        && typeof record?.id === 'string'
        && record.id === workspaceId(record.root)
      ))
    }
  } catch (error) {
    if (!String(error?.message ?? '').includes('ENOENT')) throw error
  }
  const roots = [catalog, ...records.map(record => resolve(record.root))]
  return [...new Set(roots)]
}

async function discoverRunnableWorkflows(catalogRoot) {
  const discovered = []
  for (const root of await readDaemonWorkspaces(catalogRoot)) {
    const directory = join(root, '.dsh-workflow', 'workflows')
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw error
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const workflowId = entry.name.slice(0, -'.json'.length)
      try {
        validateWorkflowId(workflowId)
        const state = await readJson(join(directory, entry.name), `Workflow ${workflowId}`)
        if (state?.id !== workflowId || resolve(state?.root ?? '') !== root) continue
        if (!['approved', 'running'].includes(state.status)) continue
        discovered.push({ root, workflowId, status: state.status })
      } catch {
        // 单个损坏或不属于该工作区的状态不能阻断其他 Workflow。
      }
    }
  }
  return discovered
}

async function acquireDaemonLease(catalogRoot, pollMs) {
  const directory = runnerDaemonLockDirectory(catalogRoot)
  const leasePath = join(directory, 'lease.json')
  await mkdir(dirname(directory), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await mkdir(directory)
      const lease = {
        contract: RUNNER_DAEMON_CONTRACT,
        token: randomUUID(),
        pid: process.pid,
        startedAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
      }
      await writeJsonAtomic(leasePath, lease)
      return { owned: true, directory, leasePath, lease }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      const current = await readJson(leasePath, 'Runner daemon lease').catch(() => undefined)
      const heartbeat = Date.parse(current?.heartbeatAt ?? '')
      const fresh = Number.isFinite(heartbeat) && Date.now() - heartbeat <= Math.max(10_000, pollMs * 5)
      if (fresh && processIsAlive(current?.pid)) return { owned: false, current }
      await rm(directory, { recursive: true, force: true })
    }
  }
  throw new Error('无法取得 Runner daemon lease')
}

async function releaseDaemonLease(lease) {
  if (lease?.owned !== true) return
  const current = await readJson(lease.leasePath, 'Runner daemon lease').catch(() => undefined)
  if (current?.token === lease.lease.token) await rm(lease.directory, { recursive: true, force: true })
}

function delayMs(ms, signal) {
  return new Promise(resolveDelay => {
    if (signal?.aborted) {
      resolveDelay()
      return
    }
    const timer = setTimeout(resolveDelay, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      resolveDelay()
    }, { once: true })
  })
}

async function runDaemon(options) {
  const catalogRoot = resolve(options.catalogRoot)
  const lease = await acquireDaemonLease(catalogRoot, options.pollMs)
  if (!lease.owned) {
    process.stdout.write(`Runner daemon 已由存活进程接管：pid=${lease.current?.pid ?? 'unknown'}\n`)
    return { alreadyRunning: true, pid: lease.current?.pid }
  }

  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  const active = new Map()
  const retryAfter = new Map()
  const outcomes = new Map()
  const statePath = runnerDaemonStatePath(catalogRoot)
  const publish = async status => {
    const timestamp = new Date().toISOString()
    lease.lease.heartbeatAt = timestamp
    await writeJsonAtomic(lease.leasePath, lease.lease)
    await writeJsonAtomic(statePath, {
      contract: RUNNER_DAEMON_CONTRACT,
      status,
      pid: process.pid,
      startedAt: lease.lease.startedAt,
      heartbeatAt: timestamp,
      pollMs: options.pollMs,
      activeWorkflows: [...active.values()].map(item => ({
        workspaceId: workspaceId(item.root),
        workflowId: item.workflowId,
        pid: item.child.pid,
        startedAt: item.startedAt,
      })),
      recentOutcomes: [...outcomes.values()].slice(-50),
    })
  }

  try {
    process.stdout.write(`Runner daemon 已启动：catalog=${catalogRoot}\n`)
    while (!controller.signal.aborted) {
      const workflows = await discoverRunnableWorkflows(catalogRoot)
      const now = Date.now()
      for (const workflow of workflows) {
        const key = `${workflow.root}\0${workflow.workflowId}`
        if (active.has(key) || Number(retryAfter.get(key) ?? 0) > now) continue
        const child = spawn(process.execPath, [
          fileURLToPath(import.meta.url),
          '--root', workflow.root,
          '--workflow-id', workflow.workflowId,
          '--parallel', String(options.parallel),
          '--timeout-ms', String(options.timeoutMs),
          '--event-wait-ms', String(options.eventWaitMs),
        ], {
          cwd: workflow.root,
          env: process.env,
          stdio: 'inherit',
        })
        const record = {
          root: workflow.root,
          workflowId: workflow.workflowId,
          startedAt: new Date().toISOString(),
          child,
        }
        active.set(key, record)
        child.once('exit', (code, signal) => {
          active.delete(key)
          retryAfter.set(key, Date.now() + Math.max(2000, options.pollMs * 2))
          outcomes.set(key, {
            workspaceId: workspaceId(workflow.root),
            workflowId: workflow.workflowId,
            status: code === 0 ? 'stopped' : 'failed',
            exitCode: code,
            signal: signal ?? null,
            finishedAt: new Date().toISOString(),
          })
        })
        child.once('error', error => {
          outcomes.set(key, {
            workspaceId: workspaceId(workflow.root),
            workflowId: workflow.workflowId,
            status: 'failed',
            error: describeError(error),
            finishedAt: new Date().toISOString(),
          })
        })
      }
      await publish('running')
      await delayMs(options.pollMs, controller.signal)
    }
  } finally {
    for (const item of active.values()) item.child.kill('SIGTERM')
    await Promise.allSettled([...active.values()].map(item => new Promise(resolveExit => {
      if (item.child.exitCode !== null || item.child.signalCode !== null) resolveExit()
      else item.child.once('exit', resolveExit)
    })))
    await publish('stopped').catch(() => undefined)
    await releaseDaemonLease(lease).catch(() => undefined)
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
  return { alreadyRunning: false, stopped: true }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.command === 'self-check') {
    process.stdout.write(`${JSON.stringify(await selfCheck(), null, 2)}\n`)
    return
  }
  if (options.command === 'install-preset') {
    process.stdout.write(`${JSON.stringify(await installPreset(options.force), null, 2)}\n`)
    return
  }
  if (options.daemon) {
    await runDaemon(options)
    return
  }
  const root = resolve(options.root)
  if (options.dashboard) {
    const dashboard = await startDashboard(root, {
      workflowId: options.workflowId,
      port: options.port,
    })
    process.stdout.write(`Dashboard 已启动：${dashboard.url}（workflow=${options.workflowId}）\n`)
    await new Promise(resolveShutdown => {
      let shuttingDown = false
      const shutdown = () => {
        if (shuttingDown) return
        shuttingDown = true
        void dashboard.close().finally(resolveShutdown)
      }
      process.once('SIGINT', shutdown)
      process.once('SIGTERM', shutdown)
    })
    return
  }
  const manifestPath = join(root, '.dsh-workflow', 'control', `${options.workflowId}.json`)
  const manifest = await readJson(manifestPath, `工作流 ${options.workflowId} 控制清单`)
  if (manifest.contract !== CONTROL_CONTRACT) throw new Error(`控制清单契约不受支持：${manifest.contract ?? '未提供'}`)
  if (manifest.workflowId !== options.workflowId) throw new Error('控制清单与 workflow id 不一致')
  if (!isAbsolute(manifest.socketPath)) throw new Error('控制清单中的 socket 路径必须是绝对路径')

  const started = await sendControlRequest(
    manifest,
    options.workflowId,
    'supervisor-start',
    { parallel: options.parallel },
    options.timeoutMs,
  )
  process.stdout.write(`开始 Supervisor 工作流 ${options.workflowId}，状态：${started?.status ?? 'running'}\n`)

  let eventCursor = Number.isSafeInteger(started?.eventCursor) ? started.eventCursor : 0
  const executeReservations = async reservations => {
    if (!Array.isArray(reservations) || reservations.length === 0) return
    const results = await Promise.all(reservations.map(reservation => sendControlRequest(
      manifest,
      options.workflowId,
      'supervisor-execute',
      { reservationId: reservation.reservationId },
      options.timeoutMs,
    )))
    for (const result of results) {
      if (Number.isSafeInteger(result?.eventCursor)) eventCursor = Math.max(eventCursor, result.eventCursor)
    }
  }
  const awaitEvent = async () => {
    const result = await sendControlRequest(
      manifest,
      options.workflowId,
      'supervisor-await-event',
      { cursor: eventCursor, waitMs: options.eventWaitMs },
      options.timeoutMs,
    )
    if (Number.isSafeInteger(result?.cursor)) eventCursor = Math.max(eventCursor, result.cursor)
    return result
  }
  const deliverPendingNotification = async () => {
    const outbox = await sendControlRequest(
      manifest,
      options.workflowId,
      'supervisor-outbox-next',
      {},
      options.timeoutMs,
    )
    const notification = outbox?.notification
    if (notification === null || notification === undefined) return false
    if (typeof notification.notificationId !== 'string' || notification.notificationId === '') {
      throw new Error('主会话 outbox 返回了无效 notificationId')
    }
    process.stdout.write(`Supervisor 主会话通知（请在 Owner 工作流主会话处理）：${JSON.stringify(notification)}\n`)
    const delivered = await sendControlRequest(
      manifest,
      options.workflowId,
      'supervisor-outbox-ack',
      { notificationId: notification.notificationId },
      options.timeoutMs,
    )
    if (Number.isSafeInteger(delivered?.eventCursor)) eventCursor = Math.max(eventCursor, delivered.eventCursor)
    return true
  }

  const recovery = await sendControlRequest(
    manifest,
    options.workflowId,
    'supervisor-recover',
    {},
    options.timeoutMs,
  )
  if (Number.isSafeInteger(recovery?.eventCursor)) eventCursor = Math.max(eventCursor, recovery.eventCursor)
  await executeReservations(recovery?.reservations)

  for (;;) {
    const receipt = await sendControlRequest(
      manifest,
      options.workflowId,
      'supervisor-next',
      {},
      options.timeoutMs,
    )
    const actionId = actionIdOf(receipt)
    if (Number.isSafeInteger(receipt.eventCursor)) eventCursor = Math.max(eventCursor, receipt.eventCursor)
    if (receipt.action === 'create') {
      const acknowledged = await sendControlRequest(
        manifest,
        options.workflowId,
        'supervisor-ack',
        { actionId, observation: {} },
        options.timeoutMs,
      )
      if (Number.isSafeInteger(acknowledged?.eventCursor)) eventCursor = Math.max(eventCursor, acknowledged.eventCursor)
      await executeReservations(acknowledged?.reservations)
      await awaitEvent()
      continue
    }
    if (receipt.action === 'wait') {
      await awaitEvent()
      continue
    }
    if (receipt.action === 'inspect') {
      const observation = await sendControlRequest(
        manifest,
        options.workflowId,
        'supervisor-inspect',
        { actionId },
        options.timeoutMs,
      )
      const acknowledged = await sendControlRequest(
        manifest,
        options.workflowId,
        'supervisor-ack',
        { actionId, observation },
        options.timeoutMs,
      )
      if (Number.isSafeInteger(acknowledged?.eventCursor)) eventCursor = Math.max(eventCursor, acknowledged.eventCursor)
      await awaitEvent()
      continue
    }
    if (receipt.action === 'notify') {
      const acknowledged = await sendControlRequest(
        manifest,
        options.workflowId,
        'supervisor-ack',
        { actionId, observation: {} },
        options.timeoutMs,
      )
      if (Number.isSafeInteger(acknowledged?.eventCursor)) eventCursor = Math.max(eventCursor, acknowledged.eventCursor)
      if (!await deliverPendingNotification()) {
        throw new Error('Supervisor notify 已确认，但没有可投递的主会话 outbox 项')
      }
      return
    }
    if (receipt.action === 'stop') {
      const stopped = await sendControlRequest(
        manifest,
        options.workflowId,
        'supervisor-stop',
        { actionId },
        options.timeoutMs,
      )
      process.stdout.write(`工作流 ${options.workflowId} 停止，状态：${stopped?.status ?? 'stopped'}\n`)
      return
    }
    throw new Error(`未知 Supervisor 动作：${String(receipt.action)}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`Owner 工作流外置 runner 失败：${describeError(error)}\n`)
    process.exitCode = 1
  })
}

export { discoverRunnableWorkflows, parseArgs, runDaemon, runnerDaemonStatePath }

import { createHash, randomUUID } from 'node:crypto'
import { watch } from 'node:fs'
import { link, open, readFile, realpath, rename, lstat, unlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join } from 'node:path'
import { parseEnv } from 'node:util'

const managed = '# DSH Workflow shared model configuration v1 sha256='
const entries = new Map([
  ['agent-default-model', '@deepseek-ai/dsh-agent-default-model'],
  ['credentials', '@deepseek-ai/dsh-credentials-local'],
  ['llm-pi-ai', '@deepseek-ai/dsh-llm-pi-ai'],
  ['llm-deepseek', '@deepseek-ai/dsh-llm-deepseek-api-key'],
  ['llm-deepseek-account', '@deepseek-ai/dsh-llm-deepseek-account'],
])
const digest = value => createHash('sha256').update(value).digest('hex')
const flatten = rows => rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])
const containsExpression = value => value !== null && typeof value === 'object'
  && (Object.hasOwn(value, '__jsExpr') || Object.values(value).some(containsExpression))

/** Project complete model configurations, while keeping both Hosts' other settings independent. */
export function projectSharedModelPatches(source, home) {
  if (!isAbsolute(home)) throw new Error('DSH 配置目录必须是绝对路径。')
  const rows = flatten(source)
  return [...entries].map(([id, name]) => {
    const found = rows.filter(row => row.id === id)
    if (found.length !== 1 || found[0].name !== name || found[0].group) throw new Error(`DSH 模型配置条目不兼容：${id}`)
    const row = found[0]
    if (row.disabled !== undefined && typeof row.disabled !== 'boolean' || containsExpression(row.config)) {
      throw new Error(`DSH 模型配置包含暂不支持的表达式：${id}`)
    }
    const config = structuredClone(row.config ?? {})
    if (id === 'credentials') {
      const credentialHome = config.dshHome ?? home
      const path = config.path ?? (typeof credentialHome === 'string' ? join(credentialHome, '.credentials.yaml') : '')
      if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('DSH 凭据路径必须是绝对路径。')
      config.path = path
      config.watch = true
    }
    return { id, name, disabled: row.disabled === true, config }
  })
}

/** Carry only model credential references from the primary DSH home fallback. */
export async function sharedModelEnvironment(home, patches, inherited) {
  let values
  try { values = parseEnv(await readFile(join(home, '.env'), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('无法读取 DSH 模型环境配置。') }
  const deepseek = patches.find(row => row.id === 'llm-deepseek')?.config ?? {}
  const providers = patches.find(row => row.id === 'llm-pi-ai')?.config?.providers ?? {}
  const refs = new Set([deepseek.apiKeyEnv ?? 'DEEPSEEK_API_KEY', ...Object.entries(providers).map(([id, value]) =>
    value.apiKeyEnv ?? `${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`)])
  const selected = {}
  for (const ref of refs) {
    if (typeof ref === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(ref) && inherited[ref] === undefined && values[ref] !== undefined) selected[ref] = values[ref]
  }
  return selected
}

/** Only replace an overlay that we created and that has not been edited externally. */
export async function writeSharedModelOverlay(path, patches) {
  const body = JSON.stringify(patches, null, 2) + '\n'
  const text = managed + digest(body) + '\n' + body
  let before
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077)) throw new Error('已有模型配置文件无法安全接管。')
    before = await readFile(path, 'utf8')
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (before !== undefined) {
    if (!before.startsWith(managed)) throw new Error('已有 Superagent 主目录配置，无法自动启用共享模型。')
    const end = before.indexOf('\n'), hash = before.slice(managed.length, end)
    if (end < 0 || !/^[a-f0-9]{64}$/.test(hash) || digest(before.slice(end + 1)) !== hash) {
      throw new Error('共享模型配置已被外部修改，已保留原文件。')
    }
    if (before === text) return false
  }
  const temporary = `${path}.${randomUUID()}.tmp`
  const file = await open(temporary, 'wx', 0o600)
  try { await file.writeFile(text); await file.sync() } finally { await file.close() }
  try {
    if (before === undefined) {
      await link(temporary, path)
    } else {
      if (await readFile(path, 'utf8') !== before) throw new Error('共享模型配置已被外部修改，已保留原文件。')
      await rename(temporary, path)
    }
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
  return true
}

/** Read the effective desktop model entries through the same profile composer as DSH. */
export async function readSharedModelPatches({ resources, home }) {
  const directory = join(home, 'profiles/desktop')
  try { await lstat(join(directory, 'package.json')) }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error('请先启动 DSH 服务并在模型配置中完成设置。')
    throw error
  }
  const anchor = join(resources, 'node_modules/@deepseek-ai/dsh/package.json')
  const boot = createRequire(anchor)('@deepseek-ai/dsh-app-boot')
  const profile = boot.loadProfileDirectory('dsh', directory, anchor)
  const sharedHome = boot.loadOptionalPatches('dsh', join(home, 'cordis.patch.yml')) ?? []
  return projectSharedModelPatches(boot.composeEntries([
    ...profile.layers.map(layer => layer.patches), profile.patches, sharedHome,
  ]), home)
}

/** Keep a running Superagent's managed model layer current without restarting either Host. */
export async function watchSharedModelConfig({ resources, home, target, onError = () => {}, onUpdated = () => {}, readPatches = readSharedModelPatches }) {
  if (await realpath(home) === await realpath(dirname(target))) throw new Error('共享模型源目录不能与 Superagent 目录相同。')
  let closed = false, watchFailure = false, scheduled, running = Promise.resolve()
  const refresh = () => {
    running = running.catch(() => {}).then(async () => {
      if (closed) return
      const patches = await readPatches({ resources, home })
      if (!closed) { await writeSharedModelOverlay(target, patches); if (!watchFailure) onUpdated() }
    })
    return running
  }
  const queue = () => {
    clearTimeout(scheduled)
    scheduled = setTimeout(() => { void refresh().catch(() => onError('共享模型配置更新失败，请检查 DSH 模型配置及目录权限。')) }, 150)
  }
  const watchers = []
  try {
    for (const directory of [home, join(home, 'profiles/desktop')]) {
      const watcher = watch(directory, (_event, name) => {
        if (name == null || ['cordis.patch.yml', 'package.json'].includes(String(name))) queue()
      })
      watcher.on('error', () => { watchFailure = true; onError('共享模型配置监听失败，请重新启动 Superagent。') })
      watchers.push(watcher)
    }
    await refresh()
  } catch (error) {
    for (const watcher of watchers) watcher.close()
    throw error
  }
  return async () => {
    closed = true
    clearTimeout(scheduled)
    for (const watcher of watchers) watcher.close()
    await running.catch(() => {})
  }
}

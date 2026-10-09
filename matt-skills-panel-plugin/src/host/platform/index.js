/**
 * macOS 平台层。公共工厂与包装保留 getHome/path/resolveExecutable/fs/env
 * 和可见打开接口；路径委托 node:path.posix，主目录缓存由本层拥有。
 * DSH_GH_PATH 兜底在公共包装中校验，文件服务仍透传 DSH 沙箱。
 */

import nodePath from 'node:path'
import darwin from './darwin/index.js'

export const OS_KINDS = Object.freeze({ DARWIN: 'darwin' })

/**
 * 平台抽象接口（#129 契约形状；本层对 macOS 适配器做通用包装后返回）。
 * @typedef {Object} Platform
 * @property {string} os  当前平台 kind（`OS_KINDS`），仅 `'darwin'`。
 * @property {() => Promise<string|null>} getHome  macOS 单点；结果缓存在实现内部（无强制刷新口）。
 * @property {Object} path  同步对象（委托 node:path）+ 唯一异步成员 `joinHome(...segs)`。
 * @property {(name: string) => Promise<string|null>} resolveExecutable  包装 DSH subprocess（throw→null）。
 * @property {Object} fs  DSH 沙箱 fs 透传（lstat/readText/writeText/resolve/listDir/stat；无 mkdir）。
 * @property {{get(k: string): string|undefined, has(k: string): boolean}} env  只读视图。
 * @property {(dir: string, cwd?: string) => Promise<{ok: boolean, opener?: string, error?: string}>} openFolder  本机可见打开目录（#497 调起单点，配方归底座）。
 * @property {(file: string, cwd?: string) => Promise<{ok: boolean, opener?: string, error?: string}>} openFile  本机可见打开文件（#497 调起单点，配方归底座）。
 */

/** 测缓存：getHome 结果缓存（进程内主目录不变 → 默认终身缓存）。 */
function memoize(fn) {
  let cached
  return async () => {
    if (cached === undefined) cached = await fn()
    return cached
  }
}

/** 通用包装：path（委托 macOS POSIX 路径）+ 异步 joinHome。 */
function buildPath(pathImpl, getHome) {
  return Object.freeze({
    join: pathImpl.join.bind(pathImpl),
    sep: pathImpl.sep,
    dirname: pathImpl.dirname.bind(pathImpl),
    basename: pathImpl.basename.bind(pathImpl),
    resolve: pathImpl.resolve.bind(pathImpl),
    normalize: pathImpl.normalize.bind(pathImpl),
    isAbsolute: pathImpl.isAbsolute.bind(pathImpl),
    relative: pathImpl.relative.bind(pathImpl),
    async joinHome(...segs) {
      return pathImpl.join(await getHome(), ...segs)
    },
  })
}

/** 通用包装：env 只读视图（process.env 只读包装，只读不改、不外发）。 */
function buildEnv(envSource) {
  return Object.freeze({
    get(k) {
      return envSource[k]
    },
    has(k) {
      return k in envSource
    },
  })
}

/**
 * 组装：用给定 OS 适配器做通用包装，返回 #129 契约形状的 `Platform`。
 * 导出供公共平台接缝验证（`createPlatform` 依赖 `process.platform`，只能跑到当前 OS）。
 * opts 支持可测性注入（#113/#131）：{ homedir?: () => string, env?: object } 透传给适配器；
 * env 同时作为平台 env 视图源（默认 process.env）。
 * @param {Object} ctx
 * @param {string} osName   `OS_KINDS` 值。
 * @param {(ctx: Object, opts?: object) => {os: string, pathImpl: Object, getHome: () => Promise<string|null>, resolveExecutable: (name: string) => Promise<string|null>}} adapter
 * @param {object} [opts]
 * @returns {Promise<Platform>}
 */
export async function composePlatform(ctx, osName, adapter, opts) {
  if (osName !== OS_KINDS.DARWIN) throw new Error('platform unsupported: ' + osName)
  const spec = adapter(ctx, opts)
  const getHome = memoize(() => spec.getHome())
  const path = buildPath(spec.pathImpl, getHome)
  const fs = ctx.get('fs') // DSH 沙箱 fs（读穿透、写有栅栏）——透传，不叠白名单。
  const envSource = (opts && opts.env) || process.env
  // PATH 解析失败时，仅在文件服务确认 DSH_GH_PATH 存在后采用兜底。
  const resolveExecutable = async (name) => {
    let direct = null
    try {
      direct = await spec.resolveExecutable(name)
    } catch {
      direct = null
    }
    if (direct) return direct
    if (name === 'gh') {
      const fb = envSource && typeof envSource.get === 'function' ? envSource.get('DSH_GH_PATH') : (envSource ? envSource['DSH_GH_PATH'] : '')
      if (fb && fs && typeof fs.lstat === 'function') {
        try {
          const info = await fs.lstat(fb)
          if (info) return fb
        } catch { /* 兜底失败 → null，交由调用方诚实报告 */ }
      }
    }
    return null
  }
  // macOS 可见打开通过既有 open 配方完成，调用方只说目录或文件意图。
  // 调起一律 fire-and-forget（不等退出，同步抛错才算失败）；数组直传，引号由调起层按需加，不手写。
  const spawnOpen = function (argv, cwd) {
    let subprocess = null
    try { subprocess = ctx.get('subprocess') } catch { subprocess = null }
    if (!subprocess || typeof subprocess.spawn !== 'function') return { ok: false, error: '当前环境不支持调起' }
    try {
      const handle = subprocess.spawn({ argv: argv, cwd: cwd, stdio: { stdin: 'ignore', stdout: { maxBytes: 64 * 1024 }, stderr: { maxBytes: 64 * 1024 } }, graceMs: 2000 })
      if (handle && handle.done) handle.done.catch(function () {})
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) }
    }
  }
  const openTarget = async function (kind, raw, cwd) {
    try {
      const recipe = spec.shellOpen || null
      if (!recipe || typeof recipe.normalize !== 'function') return { ok: false, error: '当前平台不支持打开' }
      const target = recipe.normalize(String(raw || ''))
      if (!target) return { ok: false, error: '路径为空' }
      if (typeof recipe.allowOpen === 'function' && !recipe.allowOpen(target)) return { ok: false, error: '路径含不可调起字符' }
      const exe = await resolveExecutable(recipe.opener)
      if (!exe) return { ok: false, error: '找不到打开器：' + recipe.opener }
      const home = cwd || target
      if (kind === 'file' && typeof recipe.fileArgs === 'function') {
        const fileArgv = recipe.fileArgs(target)
        const started = spawnOpen([exe].concat(fileArgv), home)
        if (!started.ok) return started
        return { ok: true, opener: exe }
      }
      const folderArgv = typeof recipe.folderArgs === 'function' ? recipe.folderArgs(target) : [target]
      const started = spawnOpen([exe].concat(folderArgv), home)
      if (!started.ok) return started
      return { ok: true, opener: exe }
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) }
    }
  }
  const openFolder = function (dir, cwd) { return openTarget('folder', dir, cwd) }
  const openFile = function (file, cwd) { return openTarget('file', file, cwd) }
  return Object.freeze({
    os: osName,
    getHome,
    path,
    resolveExecutable,
    fs,
    env: buildEnv(envSource),
    openFolder,
    openFile,
  })
}

/**
 * 按 `process.platform` 选取对应 OS 实现并返回（平台层入口；宿主构建 BackendContext 时调用一次、全局复用）。
 * 第二参保留平台覆盖接口；非 darwin 显式拒绝。
 * @param {Object} ctx
 * @param {string|object} [osNameOrOpts]  字符串则为 os 覆盖；对象则视为 opts（兼容老调用）。
 * @param {object} [maybeOpts]
 * @returns {Promise<Platform>}
 */
export async function createPlatform(ctx, osNameOrOpts, maybeOpts) {
  let osName
  let opts
  if (typeof osNameOrOpts === 'string') {
    osName = osNameOrOpts
    opts = maybeOpts
  } else if (osNameOrOpts && typeof osNameOrOpts === 'object') {
    osName = (typeof process !== 'undefined' && process.platform) || ''
    opts = osNameOrOpts
  } else {
    osName = (typeof process !== 'undefined' && process.platform) || ''
    opts = undefined
  }
  if (osName !== OS_KINDS.DARWIN) throw new Error('platform unsupported: ' + osName)
  return composePlatform(ctx, osName, darwin, opts)
}

export default createPlatform

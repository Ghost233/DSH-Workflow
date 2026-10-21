/**
 * macOS 平台层：公共工厂与包装保留 getHome/path/resolveExecutable/fs/env
 * 和可见打开接口。路径委托 node:path.posix，主目录缓存由本层拥有；
 * DSH_GH_PATH 兜底只在本层读取并校验，非 darwin 平台明确拒绝。
 */

// 本域 tsconfig 有意不加载任何类型包（types 为空），node:path 的类型声明随 @types/node
// 一起被挡在门外；运行时一定是 Node，这个模块必然存在。所以只忽略导入这一行的类型错误
// （纯类型层面，不影响 esbuild 的运行时转译）——与 src/host/platform/darwin/index.ts 同一写法。
// @ts-expect-error
import nodePath from 'node:path'
import darwin from './darwin/index.js'
// 超时住中央 YAML，调时间改 config/timeouts.yaml。
import { PROC_GRACE_MS } from '../../shared/time-config/values.js'

/** 宿主上下文（动态缝）：取哪个服务都可能缺席，取回值按 any 收，调用点用 typeof 与 try/catch 守。 */
interface HostCtx {
  get(name: string): any
  set?(name: string, value: unknown): unknown
}

/** 路径数学的外形：同步方法全委托 node:path，另含唯一异步成员 joinHome。 */
interface PathImpl {
  join(...parts: string[]): string
  sep: string
  dirname(p: string): string
  basename(p: string): string
  resolve(...parts: string[]): string
  normalize(p: string): string
  isAbsolute(p: string): boolean
  relative(from: string, to: string): string
}

/** 单个系统适配器的产出形状（三底座各自实现，通用层只按这形取用，多一条都不读）。 */
interface AdapterSpec {
  pathImpl: PathImpl
  getHome: () => Promise<string | null>
  resolveExecutable: (name: string) => string | null | Promise<string | null>
  shellOpen?: ShellOpenRecipe | null
}

/** 本机可见打开的配方（归各系统底座出，通用层只按这形调起，不分支系统名）。 */
interface ShellOpenRecipe {
  opener: string
  normalize: (target: string) => string
  allowOpen?: (target: string) => boolean
  folderArgs?: (target: string) => string[]
  fileArgs?: (target: string) => string[]
}

/** 环境变量来源：注入的对象或宿主进程环境；get 存在时优先走它，否则按普通对象取值。 */
type EnvSource = Record<string, string | undefined> & { get?: (key: string) => string | undefined }

/** 适配器可选项：测试夹具用它注入主目录与环境实现；生产走宿主上下文与宿主进程环境。 */
interface PlatformOpts {
  homedir?: () => string
  env?: EnvSource
}

/** 单个系统适配器函数（三底座的默认导出都是这形）。 */
type AdapterFn = (ctx: HostCtx, opts?: PlatformOpts) => AdapterSpec

/** 平台对外形状（#129 契约；detectChain.ts 按导入路径取用 Platform 类型，改字段先改那一处）。 */
export interface Platform {
  os: string
  getHome: () => Promise<string | null>
  path: PlatformPath
  resolveExecutable: (name: string) => Promise<string | null>
  fs: unknown
  env: PlatformEnv
  openFolder: (dir: string, cwd?: string) => Promise<OpenResult>
  openFile: (file: string, cwd?: string) => Promise<OpenResult>
}

/** 路径工具（node:path 的适配面；joinHome 是平台层补的那一件）。 */
export interface PlatformPath extends PathImpl {
  joinHome(...segs: string[]): Promise<string>
}

/** 环境只读视图：只读不改、不外发。 */
export interface PlatformEnv {
  get(k: string): string | undefined
  has(k: string): boolean
}

/** 本机可见打开一次调起的结论：成没成、用的哪个打开器、为什么没成。 */
export interface OpenResult {
  ok: boolean
  opener?: string
  error?: string
}

// 运行时的 process 声明：本文件只读 env 与 platform 两个成员；本域 types 为空是既有口径，
// Node 运行时保证它存在，所以按存在声明（与 darwin 适配器同形），不产生运行时代码。
declare const process: { env: Record<string, string | undefined>; platform: string }

export const OS_KINDS = Object.freeze({ DARWIN: 'darwin' })

/** macOS 适配器静态引入，构建时即可追踪。 */


/**
 * 平台抽象接口（#129 契约形状；本层对每个系统适配器做通用包装后返回）。
 * @typedef {Object} Platform
 * @property {string} os  当前平台 kind（`OS_KINDS`），固定为 `'darwin'`。
 * @property {() => Promise<string|null>} getHome  跨系统单点；结果缓存在实现内部（无强制刷新口）。
 * @property {Object} path  同步对象（委托 node:path）+ 唯一异步成员 `joinHome(...segs)`。
 * @property {(name: string) => Promise<string|null>} resolveExecutable  包装 DSH 子进程服务（抛错→空）。
 * @property {Object} fs  DSH 沙箱文件服务透传（lstat/readText/writeText/resolve/listDir/stat；无新建目录方法）。
 * @property {{get(k: string): string|undefined, has(k: string): boolean}} env  只读视图。
 * @property {(dir: string, cwd?: string) => Promise<{ok: boolean, opener?: string, error?: string}>} openFolder  本机可见打开目录（#497 调起单点，配方归底座）。
 * @property {(file: string, cwd?: string) => Promise<{ok: boolean, opener?: string, error?: string}>} openFile  本机可见打开文件（#497 调起单点，配方归底座）。
 */

/** 测缓存：getHome 结果缓存（进程内主目录不变 → 默认终身缓存）。 */
function memoize<T>(fn: () => Promise<T>): () => Promise<T> {
  let cached: T | undefined
  return async () => {
    if (cached === undefined) cached = await fn()
    return cached
  }
}

/** 通用包装：path（委托 node:path.posix）+ 异步 joinHome。 */
function buildPath(pathImpl: PathImpl, getHome: () => Promise<string | null>): PlatformPath {
  return Object.freeze({
    join: pathImpl.join.bind(pathImpl),
    sep: pathImpl.sep,
    dirname: pathImpl.dirname.bind(pathImpl),
    basename: pathImpl.basename.bind(pathImpl),
    resolve: pathImpl.resolve.bind(pathImpl),
    normalize: pathImpl.normalize.bind(pathImpl),
    isAbsolute: pathImpl.isAbsolute.bind(pathImpl),
    relative: pathImpl.relative.bind(pathImpl),
    async joinHome(...segs: string[]) {
      // 为空的断言只过类型检查：原来就是原样透传，空时由 node:path 自行抛错，行为与原来一字不差。
      return pathImpl.join((await getHome()) as string, ...segs)
    },
  })
}

/** 通用包装：env 只读视图（宿主进程环境只读包装，只读不改、不外发）。 */
function buildEnv(envSource: EnvSource): PlatformEnv {
  return Object.freeze({
    get(k: string) {
      return envSource[k]
    },
    has(k: string) {
      return k in envSource
    },
  })
}

/**
 * 组装：用给定系统适配器做通用包装，返回 #129 契约形状的 `Platform`。
 * 导出以便直接验证 macOS 包装（`createPlatform` 依赖 `process.platform`，只能跑到当前系统）。
 * opts 支持可测性注入（#113/#131）：{ homedir?: () => string, env?: object } 透传给适配器；
 * env 同时作为平台 env 视图源（默认宿主进程环境）。
 * @param {Object} ctx
 * @param {string} osName   `OS_KINDS` 值。
 * @param {(ctx: Object, opts?: object) => {os: string, pathImpl: Object, getHome: () => Promise<string|null>, resolveExecutable: (name: string) => Promise<string|null>}} adapter
 * @param {object} [opts]
 * @returns {Promise<Platform>}
 */
export async function composePlatform(ctx: HostCtx, osName: string, adapter: AdapterFn, opts?: PlatformOpts): Promise<Platform> {
  if (osName !== OS_KINDS.DARWIN) throw new Error('platform unsupported: ' + osName)
  const spec = adapter(ctx, opts)
  const getHome = memoize(() => spec.getHome())
  const path = buildPath(spec.pathImpl, getHome)
  const fs = ctx.get('fs') // DSH 沙箱文件服务（读穿透、写有栅栏）——透传，不叠白名单。
  const envSource: EnvSource = (opts && opts.env) || process.env
  // 2026-08-29 统一（research 实锤「三底座 DSH_GH_PATH 不一致」）：gh 的 DSH_GH_PATH 兜底【单点下沉到通用层】——
  //   PATH 解析失败（返回空 / 抛错）时，读取环境变量 DSH_GH_PATH + 文件存在性校验，存在才返回；三个系统底座行为由此一致。
  //   macOS 底座不重复实现；host 找 gh 与 gh 客户端均经本包装获益。
  const resolveExecutable = async (name: string): Promise<string | null> => {
    let direct: string | null = null
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
        } catch { /* 兜底失败 → 空，交由调用方诚实报告 */ }
      }
    }
    return null
  }
  // 本机可见打开（#497，通用层单点拥有调起，配方归各系统底座）。
  // 调用方只说目录或文件意图，macOS 通过既有 open 配方完成调起。
  // 调起一律即发即忘（不等退出，同步抛错才算失败）；数组直传，引号由调起层按需加，不手写。
  const spawnOpen = function (argv: string[], cwd?: string): OpenResult {
    let subprocess: any = null
    try { subprocess = ctx.get('subprocess') } catch { subprocess = null }
    if (!subprocess || typeof subprocess.spawn !== 'function') return { ok: false, error: '当前环境不支持调起' }
    try {
      const handle = subprocess.spawn({ argv: argv, cwd: cwd, stdio: { stdin: 'ignore', stdout: { maxBytes: 64 * 1024 }, stderr: { maxBytes: 64 * 1024 } }, graceMs: PROC_GRACE_MS })
      if (handle && handle.done) handle.done.catch(function () {})
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String((e && (e as { message?: unknown }).message) || e) }
    }
  }
  const openTarget = async function (kind: string, raw: string, cwd?: string): Promise<OpenResult> {
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
      return { ok: false, error: String((e && (e as { message?: unknown }).message) || e) }
    }
  }
  const openFolder = function (dir: string, cwd?: string): Promise<OpenResult> { return openTarget('folder', dir, cwd) }
  const openFile = function (file: string, cwd?: string): Promise<OpenResult> { return openTarget('file', file, cwd) }
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
 * 按 `process.platform` 选取对应系统实现并返回（平台层入口；宿主构建后端上下文时调用一次、全局复用）。
 * 第二参保留平台覆盖接口；非 darwin 明确拒绝。
 * @param {Object} ctx
 * @param {string|object} [osNameOrOpts]  字符串则为系统覆盖；对象则视为 opts（兼容老调用）。
 * @param {object} [maybeOpts]
 * @returns {Promise<Platform>}
 */
export async function createPlatform(ctx: HostCtx, osNameOrOpts?: string | PlatformOpts, maybeOpts?: PlatformOpts): Promise<Platform> {
  let osName: string
  let opts: PlatformOpts | undefined
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

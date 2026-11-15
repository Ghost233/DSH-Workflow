/**
 * Plugin configuration: the state directory every persistent artifact lives under, plus the optional development
 * management API.
 *
 * hub-bot refuses to start without an explicit absolute stateDir — silently defaulting into a profile directory would
 * scatter Tasks, Triggers and the owner registry across reinstalls.
 *
 * The loopback management API (src/index.js) can inject prompts into any Session of the profile it runs in, so it is
 * OFF unless the configuration explicitly enables it with a token: `devApi: { token: "..." }`. Requests must carry
 * that token. Without `devApi` the plugin loads normally and registers no HTTP routes at all.
 */
import { isAbsolute } from 'node:path'
import { DEFAULT_DANGEROUS_PATTERNS, validateDangerousPatterns } from './security.js'

/** The configuration keys this plugin understands. Anything else is rejected so typos cannot pass silently. */
const KNOWN_KEYS = new Set(['stateDir', 'homeRepo', 'devApi', 'reporting', 'feishu', 'github', 'concurrency', 'security'])

/** The keys the scheduled auto-summary understands (#67 定时汇总自动汇报 — OFF by default). */
const KNOWN_REPORTING_KEYS = new Set(['auto', 'intervalMs'])

/** The keys the optional development management API understands. */
const KNOWN_DEV_API_KEYS = new Set(['token'])

/** The keys the Feishu entry (#68) understands. OFF unless enabled; the allowlist names authorized open_ids. */
const KNOWN_FEISHU_KEYS = new Set(['enabled', 'appId', 'appSecret', 'botOpenId'])

/** The keys the GitHub loop (#71) understands. Per-repo entries carry the owner identity (workspace + cwd). */
const KNOWN_GITHUB_KEYS = new Set(['enabled', 'intervalMs', 'loginAllowlist', 'mentionHandle', 'repos'])
const KNOWN_GITHUB_REPO_KEYS = new Set(['repo', 'workspace', 'cwd', 'enabled'])
const DEFAULT_GITHUB_INTERVAL_MS = 5 * 60 * 1000
const MIN_GITHUB_INTERVAL_MS = 30 * 1000

/** The keys the concurrency section (#72 执行槽) understands. Slots count working tickets per owner. */
const KNOWN_CONCURRENCY_KEYS = new Set(['slotsPerOwner'])
const DEFAULT_SLOTS_PER_OWNER = 3

/** The keys the security section (spec「Policy」危险命令黑名单) understands. */
const KNOWN_SECURITY_KEYS = new Set(['dangerousPatterns'])

/** An invalid plugin configuration; the message names the offending key and the rule it broke. */
export class ConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigError'
  }
}

/**
 * Validates the raw cordis configuration object and returns the resolved configuration.
 * @param {unknown} config - raw configuration from the profile patch layer.
 * @returns {{ stateDir: string, homeRepo: string, devApi?: { token: string }, concurrency: { slotsPerOwner: number } }}
 *   resolved config; devApi absent = API disabled; concurrency always present (#72 执行槽, 默认 3).
 * @throws {ConfigError} when stateDir/homeRepo is missing or not absolute, unknown keys are present, or devApi lacks a token.
 */
export function resolveConfig(config) {
  const raw = config ?? {}
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new ConfigError('hub-bot configuration must be an object')
  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) throw new ConfigError(`hub-bot does not know configuration key "${key}"`)
  }
  const { stateDir } = raw
  if (stateDir === undefined || stateDir === null || stateDir === '') {
    throw new ConfigError('hub-bot requires config.stateDir: an absolute path to its state directory')
  }
  if (typeof stateDir !== 'string') throw new ConfigError('hub-bot config.stateDir must be a string')
  if (!isAbsolute(stateDir)) throw new ConfigError(`hub-bot config.stateDir must be absolute, got "${stateDir}"`)
  // The chief owner (L1) is anchored at the Home Repo — the hub has no meaning without it (spec「L1 总负责人的落点」).
  const { homeRepo } = raw
  if (homeRepo === undefined || homeRepo === null || homeRepo === '') {
    throw new ConfigError('hub-bot requires config.homeRepo: an absolute path to the Home Repo (the chief owner cwd)')
  }
  if (typeof homeRepo !== 'string') throw new ConfigError('hub-bot config.homeRepo must be a string')
  if (!isAbsolute(homeRepo)) throw new ConfigError(`hub-bot config.homeRepo must be absolute, got "${homeRepo}"`)
  const resolved = { stateDir, homeRepo }
  if (raw.devApi !== undefined) {
    const devApi = raw.devApi
    if (typeof devApi !== 'object' || devApi === null || Array.isArray(devApi)) {
      throw new ConfigError('hub-bot config.devApi must be an object with a token')
    }
    for (const key of Object.keys(devApi)) {
      if (!KNOWN_DEV_API_KEYS.has(key)) throw new ConfigError(`hub-bot does not know config.devApi key "${key}"`)
    }
    // Enabling the management API without a token would let any local process inject into any Session — refuse.
    if (typeof devApi.token !== 'string' || !devApi.token) {
      throw new ConfigError('hub-bot config.devApi.token is required when devApi is configured: the management API can inject into any Session and must not run unauthenticated')
    }
    resolved.devApi = { token: devApi.token }
  }
  // 定时汇总自动汇报 (#67): OFF unless explicitly enabled; intervalMs only paces the tick.
  const reporting = { auto: false, intervalMs: 60000 }
  if (raw.reporting !== undefined) {
    const rawReporting = raw.reporting
    if (typeof rawReporting !== 'object' || rawReporting === null || Array.isArray(rawReporting)) {
      throw new ConfigError('hub-bot config.reporting must be an object { auto?: boolean, intervalMs?: number }')
    }
    for (const key of Object.keys(rawReporting)) {
      if (!KNOWN_REPORTING_KEYS.has(key)) throw new ConfigError("hub-bot does not know config.reporting key [\"" + key + "\"]")
    }
    if (rawReporting.auto !== undefined) {
      if (typeof rawReporting.auto !== 'boolean') throw new ConfigError('hub-bot config.reporting.auto must be a boolean')
      reporting.auto = rawReporting.auto
    }
    if (rawReporting.intervalMs !== undefined) {
      if (typeof rawReporting.intervalMs !== 'number' || !Number.isFinite(rawReporting.intervalMs) || rawReporting.intervalMs <= 0) {
        throw new ConfigError('hub-bot config.reporting.intervalMs must be a positive number')
      }
      reporting.intervalMs = rawReporting.intervalMs
    }
  }
  resolved.reporting = reporting
  // 飞书入口 (#68): OFF unless explicitly enabled; the allowlist is the ONLY authorization boundary (spec「安全」).
  const feishu = { enabled: false }
  if (raw.feishu !== undefined) {
    const rawFeishu = raw.feishu
    if (typeof rawFeishu !== 'object' || rawFeishu === null || Array.isArray(rawFeishu)) {
      throw new ConfigError('hub-bot config.feishu must be an object { enabled?, appId?, appSecret?, botOpenId? }')
    }
    for (const key of Object.keys(rawFeishu)) {
      if (!KNOWN_FEISHU_KEYS.has(key)) throw new ConfigError('hub-bot does not know config.feishu key ["' + key + '"]')
    }
    if (rawFeishu.enabled !== undefined) {
      if (typeof rawFeishu.enabled !== 'boolean') throw new ConfigError('hub-bot config.feishu.enabled must be a boolean')
      feishu.enabled = rawFeishu.enabled
    }
    // appId/appSecret here are a manual fallback (凭据失效人工降级); the registerApp flow writes stateDir instead.
    for (const key of ['appId', 'appSecret', 'botOpenId']) {
      if (rawFeishu[key] !== undefined) {
        if (typeof rawFeishu[key] !== 'string' || !rawFeishu[key]) throw new ConfigError('hub-bot config.feishu.' + key + ' must be a non-empty string')
        feishu[key] = rawFeishu[key]
      }
    }
  }
  resolved.feishu = feishu
  // GitHub 自动处理闭环 (#71): OFF unless explicitly enabled; loginAllowlist 是唯一授权边界（默认空 = 启动时
  // 经 gh api user 解析为本人；解析失败则全部只记录）。repos 逐仓库开关默认全开（spec「逐仓库开关」）。
  const github = { enabled: false, intervalMs: DEFAULT_GITHUB_INTERVAL_MS, loginAllowlist: [], repos: [] }
  if (raw.github !== undefined) {
    const rawGithub = raw.github
    if (typeof rawGithub !== 'object' || rawGithub === null || Array.isArray(rawGithub)) {
      throw new ConfigError('hub-bot config.github must be an object { enabled?, intervalMs?, loginAllowlist?, mentionHandle?, repos? }')
    }
    for (const key of Object.keys(rawGithub)) {
      if (!KNOWN_GITHUB_KEYS.has(key)) throw new ConfigError('hub-bot does not know config.github key ["' + key + '"]')
    }
    if (rawGithub.enabled !== undefined) {
      if (typeof rawGithub.enabled !== 'boolean') throw new ConfigError('hub-bot config.github.enabled must be a boolean')
      github.enabled = rawGithub.enabled
    }
    if (rawGithub.intervalMs !== undefined) {
      if (typeof rawGithub.intervalMs !== 'number' || !Number.isInteger(rawGithub.intervalMs) || rawGithub.intervalMs < MIN_GITHUB_INTERVAL_MS) {
        throw new ConfigError('hub-bot config.github.intervalMs must be an integer >= ' + MIN_GITHUB_INTERVAL_MS + ' (30s) — 认证限额 5000 次/小时')
      }
      github.intervalMs = rawGithub.intervalMs
    }
    if (rawGithub.loginAllowlist !== undefined) {
      if (!Array.isArray(rawGithub.loginAllowlist) || !rawGithub.loginAllowlist.every(v => typeof v === 'string' && v)) {
        throw new ConfigError('hub-bot config.github.loginAllowlist must be an array of non-empty login strings')
      }
      github.loginAllowlist = [...rawGithub.loginAllowlist]
    }
    if (rawGithub.mentionHandle !== undefined) {
      if (typeof rawGithub.mentionHandle !== 'string' || !rawGithub.mentionHandle.startsWith('@')) {
        throw new ConfigError('hub-bot config.github.mentionHandle must be an @handle string')
      }
      github.mentionHandle = rawGithub.mentionHandle
    }
    if (rawGithub.repos !== undefined) {
      if (!Array.isArray(rawGithub.repos)) throw new ConfigError('hub-bot config.github.repos must be an array of { repo, workspace, cwd, enabled? }')
      github.repos = rawGithub.repos.map((entry, i) => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new ConfigError('hub-bot config.github.repos[' + i + '] must be an object')
        for (const key of Object.keys(entry)) {
          if (!KNOWN_GITHUB_REPO_KEYS.has(key)) throw new ConfigError('hub-bot does not know config.github.repos[' + i + '] key ["' + key + '"]')
        }
        if (typeof entry.repo !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(entry.repo)) throw new ConfigError('hub-bot config.github.repos[' + i + '].repo must be owner/name')
        if (typeof entry.workspace !== 'string' || !entry.workspace) throw new ConfigError('hub-bot config.github.repos[' + i + '].workspace must be a non-empty string (the L2 owner identity)')
        if (typeof entry.cwd !== 'string' || !entry.cwd.startsWith('/')) throw new ConfigError('hub-bot config.github.repos[' + i + '].cwd must be an absolute path (the repo checkout)')
        if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') throw new ConfigError('hub-bot config.github.repos[' + i + '].enabled must be a boolean')
        return { repo: entry.repo, workspace: entry.workspace, cwd: entry.cwd, enabled: entry.enabled !== false }
      })
    }
  }
  resolved.github = github
  // 执行槽 (#72 并发语义): 同 owner 并发 working 任务上限（默认 3，规格「并发与人的优先」）；槽满新票进
  // queued 排队，人的跟进消息走专用槽不受新工作排队阻塞。执行槽只对 working 计数——交还给人（person/*）
  // 立即释放。
  const concurrency = { slotsPerOwner: DEFAULT_SLOTS_PER_OWNER }
  if (raw.concurrency !== undefined) {
    const rawConcurrency = raw.concurrency
    if (typeof rawConcurrency !== 'object' || rawConcurrency === null || Array.isArray(rawConcurrency)) {
      throw new ConfigError('hub-bot config.concurrency must be an object { slotsPerOwner?: number }')
    }
    for (const key of Object.keys(rawConcurrency)) {
      if (!KNOWN_CONCURRENCY_KEYS.has(key)) throw new ConfigError('hub-bot does not know config.concurrency key ["' + key + '"]')
    }
    if (rawConcurrency.slotsPerOwner !== undefined) {
      if (typeof rawConcurrency.slotsPerOwner !== 'number' || !Number.isSafeInteger(rawConcurrency.slotsPerOwner) || rawConcurrency.slotsPerOwner < 1) {
        throw new ConfigError('hub-bot config.concurrency.slotsPerOwner must be a positive integer (>= 1)')
      }
      concurrency.slotsPerOwner = rawConcurrency.slotsPerOwner
    }
  }
  resolved.concurrency = concurrency

  // 危险命令黑名单 (spec「Policy」L260 + #73 设置页): 默认清单在 src/security.js; 显式配置整表替换。
  const security = { dangerousPatterns: [...DEFAULT_DANGEROUS_PATTERNS] }
  if (raw.security !== undefined) {
    const rawSecurity = raw.security
    if (typeof rawSecurity !== 'object' || rawSecurity === null || Array.isArray(rawSecurity)) {
      throw new ConfigError('hub-bot config.security must be an object { dangerousPatterns?: string[] }')
    }
    for (const key of Object.keys(rawSecurity)) {
      if (!KNOWN_SECURITY_KEYS.has(key)) throw new ConfigError('hub-bot does not know config.security key ["' + key + '"]')
    }
    if (rawSecurity.dangerousPatterns !== undefined) {
      security.dangerousPatterns = validateDangerousPatterns(rawSecurity.dangerousPatterns, 'hub-bot config.security', ConfigError)
    }
  }
  resolved.security = security
  return resolved
}

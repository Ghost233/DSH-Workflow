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

/** The configuration keys this plugin understands. Anything else is rejected so typos cannot pass silently. */
const KNOWN_KEYS = new Set(['stateDir', 'homeRepo', 'devApi', 'reporting', 'feishu'])

/** The keys the scheduled auto-summary understands (#67 定时汇总自动汇报 — OFF by default). */
const KNOWN_REPORTING_KEYS = new Set(['auto', 'intervalMs'])

/** The keys the optional development management API understands. */
const KNOWN_DEV_API_KEYS = new Set(['token'])

/** The keys the Feishu entry (#68) understands. OFF unless enabled; the allowlist names authorized open_ids. */
const KNOWN_FEISHU_KEYS = new Set(['enabled', 'openIdAllowlist', 'appId', 'appSecret', 'botOpenId'])

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
 * @returns {{ stateDir: string, homeRepo: string, devApi?: { token: string } }} resolved config; devApi absent = API disabled.
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
  const feishu = { enabled: false, openIdAllowlist: [] }
  if (raw.feishu !== undefined) {
    const rawFeishu = raw.feishu
    if (typeof rawFeishu !== 'object' || rawFeishu === null || Array.isArray(rawFeishu)) {
      throw new ConfigError('hub-bot config.feishu must be an object { enabled?, openIdAllowlist?, appId?, appSecret?, botOpenId? }')
    }
    for (const key of Object.keys(rawFeishu)) {
      if (!KNOWN_FEISHU_KEYS.has(key)) throw new ConfigError('hub-bot does not know config.feishu key ["' + key + '"]')
    }
    if (rawFeishu.enabled !== undefined) {
      if (typeof rawFeishu.enabled !== 'boolean') throw new ConfigError('hub-bot config.feishu.enabled must be a boolean')
      feishu.enabled = rawFeishu.enabled
    }
    if (rawFeishu.openIdAllowlist !== undefined) {
      if (!Array.isArray(rawFeishu.openIdAllowlist) || !rawFeishu.openIdAllowlist.every(v => typeof v === 'string' && v)) {
        throw new ConfigError('hub-bot config.feishu.openIdAllowlist must be an array of non-empty open_id strings')
      }
      feishu.openIdAllowlist = [...rawFeishu.openIdAllowlist]
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
  return resolved
}

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
const KNOWN_KEYS = new Set(['stateDir', 'devApi'])

/** The keys the optional development management API understands. */
const KNOWN_DEV_API_KEYS = new Set(['token'])

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
 * @returns {{ stateDir: string, devApi?: { token: string } }} the resolved configuration; devApi absent = API disabled.
 * @throws {ConfigError} when stateDir is missing/not absolute, unknown keys are present, or devApi lacks a token.
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
  const resolved = { stateDir }
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
  return resolved
}

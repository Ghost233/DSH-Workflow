/**
 * Plugin configuration: the state directory every persistent artifact lives under.
 * hub-bot refuses to start without an explicit absolute stateDir — silently defaulting into a profile directory would
 * scatter Tasks, Triggers and the owner registry across reinstalls.
 */
import { isAbsolute } from 'node:path'

/** The configuration keys this plugin understands. Anything else is rejected so typos cannot pass silently. */
const KNOWN_KEYS = new Set(['stateDir'])

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
 * @returns {{ stateDir: string }} the resolved configuration with an absolute stateDir.
 * @throws {ConfigError} when stateDir is missing, not a string, empty, relative, or when unknown keys are present.
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
  return { stateDir }
}

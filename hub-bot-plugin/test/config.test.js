/** Configuration validation: absolute stateDir + homeRepo required; devApi off unless explicitly token-guarded. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveConfig, ConfigError } from '../src/config.js'

/** The minimal valid configuration; tests override one key at a time. */
const valid = () => ({ stateDir: '/tmp/hub-bot-state', homeRepo: '/Volumes/home' })

test('accepts an absolute stateDir and homeRepo', () => {
  assert.deepEqual(resolveConfig(valid()), { stateDir: '/tmp/hub-bot-state', homeRepo: '/Volumes/home', reporting: { auto: false, intervalMs: 60000 } })
})

test('reporting defaults to OFF (无自动汇报) and parses explicit overrides', () => {
  assert.deepEqual(resolveConfig(valid()).reporting, { auto: false, intervalMs: 60000 })
  assert.deepEqual(resolveConfig({ ...valid(), reporting: { auto: true } }).reporting, { auto: true, intervalMs: 60000 })
  assert.deepEqual(resolveConfig({ ...valid(), reporting: { auto: true, intervalMs: 5000 } }).reporting, { auto: true, intervalMs: 5000 })
  assert.throws(() => resolveConfig({ ...valid(), reporting: { auto: 'yes' } }), ConfigError)
  assert.throws(() => resolveConfig({ ...valid(), reporting: { intervalMs: 0 } }), ConfigError)
  assert.throws(() => resolveConfig({ ...valid(), reporting: { nope: true } }), ConfigError)
})


test('rejects a missing stateDir', () => {
  const { stateDir, ...rest } = valid()
  void stateDir
  assert.throws(() => resolveConfig(rest), /requires config.stateDir/)
})

test('rejects undefined config entirely', () => {
  assert.throws(() => resolveConfig(undefined), ConfigError)
  assert.throws(() => resolveConfig(null), ConfigError)
})

test('rejects an empty or non-string stateDir', () => {
  assert.throws(() => resolveConfig({ ...valid(), stateDir: '' }), ConfigError)
  assert.throws(() => resolveConfig({ ...valid(), stateDir: 42 }), ConfigError)
})

test('rejects a relative stateDir', () => {
  assert.throws(() => resolveConfig({ ...valid(), stateDir: 'state/hub-bot' }), /must be absolute/)
})

// The chief owner is anchored at the Home Repo; without it the startup bootstrap has nothing to register.

test('rejects a missing, empty, non-string, or relative homeRepo', () => {
  const { homeRepo, ...rest } = valid()
  void homeRepo
  assert.throws(() => resolveConfig(rest), /requires config.homeRepo/)
  assert.throws(() => resolveConfig({ ...valid(), homeRepo: '' }), ConfigError)
  assert.throws(() => resolveConfig({ ...valid(), homeRepo: 42 }), ConfigError)
  assert.throws(() => resolveConfig({ ...valid(), homeRepo: 'relative/home' }), /homeRepo must be absolute/)
})

test('rejects unknown keys so configuration typos cannot pass silently', () => {
  assert.throws(() => resolveConfig({ ...valid(), statedir: '/tmp/x' }), /unknown|does not know/i)
  assert.throws(() => resolveConfig({ ...valid(), verbose: true }), ConfigError)
})

// The management API can inject into any Session, so it stays off unless devApi is configured with a token.

test('no devApi means the management API stays disabled', () => {
  const config = resolveConfig(valid())
  assert.equal(config.devApi, undefined)
})

test('accepts devApi with a token', () => {
  const config = resolveConfig({ ...valid(), devApi: { token: 's3cret' } })
  assert.deepEqual(config.devApi, { token: 's3cret' })
})

test('rejects devApi without a usable token', () => {
  assert.throws(() => resolveConfig({ ...valid(), devApi: {} }), /devApi.token is required/)
  assert.throws(() => resolveConfig({ ...valid(), devApi: { token: '' } }), ConfigError)
  assert.throws(() => resolveConfig({ ...valid(), devApi: { token: 42 } }), ConfigError)
  assert.throws(() => resolveConfig({ ...valid(), devApi: true }), ConfigError)
  assert.throws(() => resolveConfig({ ...valid(), devApi: null }), ConfigError)
})

test('rejects unknown keys inside devApi', () => {
  assert.throws(() => resolveConfig({ ...valid(), devApi: { token: 'x', port: 3199 } }), /does not know config.devApi key/)
})

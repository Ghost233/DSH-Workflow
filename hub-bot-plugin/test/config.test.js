/** stateDir validation: the plugin refuses to start without an explicit absolute state directory. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveConfig, ConfigError } from '../src/config.js'

test('accepts an absolute stateDir', () => {
  assert.deepEqual(resolveConfig({ stateDir: '/tmp/hub-bot-state' }), { stateDir: '/tmp/hub-bot-state' })
})

test('rejects a missing stateDir', () => {
  assert.throws(() => resolveConfig({}), ConfigError)
  assert.throws(() => resolveConfig({}), /requires config.stateDir/)
})

test('rejects undefined config entirely', () => {
  assert.throws(() => resolveConfig(undefined), ConfigError)
  assert.throws(() => resolveConfig(null), ConfigError)
})

test('rejects an empty or non-string stateDir', () => {
  assert.throws(() => resolveConfig({ stateDir: '' }), ConfigError)
  assert.throws(() => resolveConfig({ stateDir: 42 }), ConfigError)
})

test('rejects a relative stateDir', () => {
  assert.throws(() => resolveConfig({ stateDir: 'state/hub-bot' }), /must be absolute/)
})

test('rejects unknown keys so configuration typos cannot pass silently', () => {
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', statedir: '/tmp/x' }), /unknown|does not know/i)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', verbose: true }), ConfigError)
})

// The management API can inject into any Session, so it stays off unless devApi is configured with a token.

test('no devApi means the management API stays disabled', () => {
  const config = resolveConfig({ stateDir: '/tmp/x' })
  assert.equal(config.devApi, undefined)
})

test('accepts devApi with a token', () => {
  const config = resolveConfig({ stateDir: '/tmp/x', devApi: { token: 's3cret' } })
  assert.deepEqual(config.devApi, { token: 's3cret' })
})

test('rejects devApi without a usable token', () => {
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', devApi: {} }), /devApi.token is required/)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', devApi: { token: '' } }), ConfigError)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', devApi: { token: 42 } }), ConfigError)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', devApi: true }), ConfigError)
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', devApi: null }), ConfigError)
})

test('rejects unknown keys inside devApi', () => {
  assert.throws(() => resolveConfig({ stateDir: '/tmp/x', devApi: { token: 'x', port: 3199 } }), /does not know config.devApi key/)
})

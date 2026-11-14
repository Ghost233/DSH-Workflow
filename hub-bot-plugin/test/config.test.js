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

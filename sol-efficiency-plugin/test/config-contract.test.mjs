import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveConfig } from '@deepseek-ai/cordis'
import { Config, apply } from '../index.js'

test('DSH exposes both SoL switches as live Host settings', async () => {
  const config = resolveConfig({ Config }, {})
  assert.equal(config.actionFusion.get().enabled, false)
  assert.equal(config.evidenceReducer.get().enabled, false)

  const registered = []
  const listeners = new Map()
  const ctx = {
    effect() {},
    on(name, listener) { listeners.set(name, listener) },
    provide() {},
    plugin(plugin) {
      plugin.apply({ inject(names) { registered.push(names[0]) } })
      return Object.assign(Promise.resolve(), { dispose: async () => {} })
    },
    logger: { error(error) { throw error } },
  }
  await apply(ctx, config)
  assert.deepEqual(registered, [])

  const next = resolveConfig({ Config }, { actionFusion: { enabled: true } })
  config.actionFusion = next.actionFusion
  listeners.get('loader/volatile-update')([['actionFusion']])
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(registered, ['fs'])
})

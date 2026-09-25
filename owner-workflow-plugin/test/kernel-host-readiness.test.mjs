import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Context } from '../../deepseek-harness/vendor/cordis/lib/index.js'
import { hostReadiness } from '../src/kernel-host-readiness.mjs'

test('host readiness requires Owner and SoL in the same running instance', async t => {
  const host = new Context(), other = new Context()
  t.after(async () => { await host.fiber.dispose(); await other.fiber.dispose() })
  const instance = randomUUID()
  assert.equal(hostReadiness(host, instance).ready, false)
  const owner = await host.plugin({ apply: ctx => ctx.provide('workflowComponent:owner', { ready: true }) })
  assert.equal(hostReadiness(host, instance).ready, false)
  const sol = await host.plugin({ apply: ctx => ctx.provide('workflowComponent:sol', { ready: true }) })
  assert.deepEqual(hostReadiness(host, instance).components, { owner: 'ready', sol: 'ready' })
  assert.equal(hostReadiness(host, instance).ready, true)
  assert.equal(hostReadiness(other, instance).ready, false)
  assert.equal(hostReadiness(host).ready, false)
  await sol.dispose()
  assert.deepEqual(hostReadiness(host, instance).components, { owner: 'ready', sol: 'offline' })
  await owner.dispose()
  assert.deepEqual(hostReadiness(host, instance).components, { owner: 'offline', sol: 'offline' })
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Context } from '../../deepseek-harness/vendor/cordis/lib/index.js'
import { hostReadiness } from '../src/kernel-host-readiness.mjs'

test('host readiness requires Owner in the same running instance', async t => {
  const host = new Context(), other = new Context()
  t.after(async () => { await host.fiber.dispose(); await other.fiber.dispose() })
  const instance = randomUUID()
  assert.equal(hostReadiness(host, instance).ready, false)
  const owner = await host.plugin({ apply: ctx => ctx.provide('workflowComponent:owner', { ready: true }) })
  assert.deepEqual(hostReadiness(host, instance).components, { owner: 'ready' })
  assert.equal(hostReadiness(host, instance).ready, true)
  assert.equal(hostReadiness(other, instance).ready, false)
  assert.equal(hostReadiness(host).ready, false)
  await owner.dispose()
  assert.deepEqual(hostReadiness(host, instance).components, { owner: 'offline' })
})

test('Desktop readiness follows its live bridge instance without a Web launcher environment', async t => {
  const host = new Context()
  t.after(() => host.fiber.dispose())
  await host.plugin({ apply: ctx => ctx.provide('workflowComponent:owner', { ready: true }) })
  const instanceId = randomUUID()
  const bridge = await host.plugin({ apply: ctx => ctx.provide('workflowHostInstance', { instanceId }) })
  assert.deepEqual(hostReadiness(host), {
    contract: 'DSH_WEB_HOST_READY_V1', instanceId, components: { owner: 'ready' }, ready: true,
  })
  assert.equal(hostReadiness(host, 'invalid-instance').ready, false)
  await bridge.dispose()
  assert.equal(hostReadiness(host).ready, false)
  assert.equal(hostReadiness(host).instanceId, null)
})

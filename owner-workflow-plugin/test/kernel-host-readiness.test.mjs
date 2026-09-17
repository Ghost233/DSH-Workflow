import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Context, Service } from '../../deepseek-harness/vendor/cordis/lib/index.js'
import { fixture } from '../../approve-for-me-workflow-plugin/test/helpers.mjs'
import * as sol from '../../sol-efficiency-plugin/index.js'
import { applyKernel } from '../src/kernel-plugin.mjs'
import { hostReadiness } from '../src/kernel-host-readiness.mjs'

test('native plugin scopes and the bundled approval adapter share load health only within their host', async t => {
  const f = await fixture(t)
  const instance = randomUUID()
  assert.equal(hostReadiness(f.ctx.root, instance).components.approval, 'ready')
  assert.equal(hostReadiness(f.ctx.root, instance).ready, false)
  await f.ctx.plugin(class extends Service {
    constructor(ctx) { super(ctx, 'webServer') }
    register() { return () => {} }
  })
  const owner = await f.ctx.plugin({ name: 'owner-health-fixture', apply: ctx => applyKernel(ctx, { surfaceOnly: true }) })
  const efficiency = await f.ctx.plugin(sol)
  assert.equal(hostReadiness(f.ctx.root, instance).ready, true)
  assert.equal(hostReadiness(f.ctx.root).ready, false, 'an unowned host is never startup-ready')
  const other = new Context()
  t.after(() => other.fiber.dispose())
  assert.deepEqual(Object.values(hostReadiness(other, instance).components), ['offline', 'offline', 'offline'])
  await efficiency.dispose()
  assert.deepEqual(hostReadiness(f.ctx.root, instance).components, { owner: 'ready', sol: 'offline', approval: 'ready' })
  await f.adapter.dispose()
  assert.equal(hostReadiness(f.ctx.root, instance).components.approval, 'offline')
  await owner.dispose()
  assert.deepEqual(Object.values(hostReadiness(f.ctx.root, instance).components), ['offline', 'offline', 'offline'])
})

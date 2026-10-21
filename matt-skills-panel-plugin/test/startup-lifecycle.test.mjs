import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as settle } from 'node:timers/promises'
import { hookDeckAgentTools } from '../src/deck/registration/register-options.js'

function context() {
  const cleanup = []
  let lookups = 0
  return {
    ctx: { get() { lookups++; return null }, effect(start) { cleanup.push(start()) } },
    dispose() { for (const stop of cleanup) stop() },
    lookups: () => lookups,
  }
}

test('startup registration stops retrying when its plugin is disposed', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fixture = context(), reports = []
  hookDeckAgentTools(fixture.ctx, () => ({ tools: {} }), null, info => reports.push(info), { retries: 5, waitMs: 5000 })
  await settle()
  const before = fixture.lookups()
  assert.ok(before > 0, 'The real startup path must have attempted tools discovery')
  fixture.dispose()
  t.mock.timers.tick(25000)
  await settle()
  assert.equal(fixture.lookups(), before, 'A disposed plugin must not continue tools discovery')
  assert.deepEqual(reports, [], 'Disposal must not produce a late registration failure')
})

test('a pending table does not resume registration after its plugin is disposed', async () => {
  const fixture = context(), reports = []
  let complete
  const table = new Promise(resolve => { complete = resolve })
  hookDeckAgentTools(fixture.ctx, () => table, null, info => reports.push(info), { retries: 0, waitMs: 0 })
  await settle()
  fixture.dispose()
  complete({ tools: {} })
  await settle()
  assert.equal(fixture.lookups(), 0)
  assert.deepEqual(reports, [])
})

test('a live plugin still registers tools that become available after the configured wait', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fixture = context(), registered = [], reports = []
  const table = { names: ['probe'], definitions: [{ name: 'probe', description: 'Owned fixture', parameters: { type: 'object', properties: {} } }],
    tools: { probe: { run: async () => ({ status: 'ok', text: 'done' }) } } }
  hookDeckAgentTools(fixture.ctx, () => table, null, info => reports.push(info), { retries: 5, waitMs: 5000 })
  await settle()
  fixture.ctx.tools = { register: value => registered.push(value.name) }
  t.mock.timers.tick(4999)
  await settle()
  assert.deepEqual(registered, [])
  t.mock.timers.tick(1)
  await settle()
  assert.deepEqual(registered, ['probe'])
  assert.equal(reports[0].ok, true)
  fixture.dispose()
})

test('a late tool-definition load cannot register tools after disposal', async () => {
  const fixture = context(), registered = []
  fixture.ctx.tools = { register: value => registered.push(value.name) }
  let complete
  const definitions = new Promise(resolve => { complete = resolve })
  const table = { names: ['probe'], definitions: [{ name: 'probe', description: 'Owned fixture', parameters: { type: 'object', properties: {} } }],
    tools: { probe: { run: async () => ({ status: 'ok', text: 'done' }) } } }
  hookDeckAgentTools(fixture.ctx, () => table, () => definitions, null, { retries: 0, waitMs: 0 })
  await settle()
  fixture.dispose()
  complete(null)
  await settle()
  assert.deepEqual(registered, [])
})

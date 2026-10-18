import test from 'node:test'
import assert from 'node:assert/strict'
import { dshReadiness } from './dsh-readiness.mjs'

test('a managed Host with readonly inventory is ready without a mutable package manager', async () => {
  const inventory = { entries: [{ entryId: 'inventory', moduleName: '@deepseek-ai/dsh-plugin-inventory', enabled: true, fiberPhase: 'active' }] }
  const result = await dshReadiness('http://127.0.0.1:8123/?token=fixture', {
    request: async (url, options) => {
      const input = JSON.parse(options.body)
      const found = url.pathname === '/api/pluginInventory/list' && input.method === 'pluginInventory/list'
      return { ok: found, json: async () => ({ type: 'server-response', rpcId: input.rpcId,
        result: found ? { ok: true, value: inventory } : { ok: false, error: { message: 'Unknown service' } } }) }
    },
  })
  assert.deepEqual(result, { ready: true, plugins: inventory.entries })
})

const response = value => async (_url, options) => ({ ok: true, json: async () => ({
  type: 'server-response', rpcId: JSON.parse(options.body).rpcId, result: { ok: true, value },
}) })

test('readiness refuses mutable services and enabled or live installer rows including preset compositions', async () => {
  const name = '@deepseek-ai/dsh-plugin-manager'
  const cases = [
    { entries: [], managementAvailable: true },
    ...['active', 'loading', 'pending', 'unloading'].map(fiberPhase => ({
      entries: [{ entryId: 'renamed', moduleName: name, enabled: false, fiberPhase }],
    })),
    { entries: [{ entryId: 'renamed', moduleName: name, enabled: true, fiberPhase: null }] },
    { entries: [], agentPresets: [{ id: 'standard', isDefault: true, rows: [{
      entryId: 'tool', moduleName: '@deepseek-ai/dsh-plugin-manager/tools', enabled: 'conditional', fiberPhase: null,
    }] }] },
  ]
  for (const inventory of cases) {
    await assert.rejects(dshReadiness('http://127.0.0.1:8123', { request: response(inventory) }), /受管版本策略/)
  }
})

test('unknown inventory or unreadable presets cannot be presented as ready', async () => {
  for (const inventory of [{}, { entries: [] , managementAvailable: 'false' },
    { entries: [null] }, { entries: [], agentPresets: {} },
    { entries: [], agentPresets: [{ id: 'broken', broken: 'unavailable', rows: [] }] }]) {
    await assert.rejects(dshReadiness('http://127.0.0.1:8123', { request: response(inventory) }))
  }
})

test('a disabled installer entry with no live fiber does not prevent readonly access', async () => {
  const inventory = { managementAvailable: false, entries: [{
    entryId: 'disabled', moduleName: '@deepseek-ai/dsh-plugin-manager', enabled: false, fiberPhase: null,
  }] }
  assert.equal((await dshReadiness('http://127.0.0.1:8123', { request: response(inventory) })).ready, true)
})

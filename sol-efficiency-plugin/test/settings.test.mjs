import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { boot, logCommand } from './helpers.mjs'
import { requests } from './fixtures/reducer-model.mjs'

const ns = settingsNamespace('sol-efficiency')
async function until(condition) {
  for (let i = 0; i < 100; i++) { if (condition()) return; await delay(10) }
  assert.fail('settings change did not take effect')
}

test('DSH file settings persist checkbox changes and hot-toggle tools without duplicates', async t => {
  const { ctx, tree, cwd } = await boot(t)
  const path = join(cwd, 'settings.yaml')
  await ctx.loader.create({ name: '@deepseek-ai/dsh-settings-file', config: { path, watch: false } })
  await ctx.loader.await()
  assert.ok(ctx.settings.describe().some(row => row.ns === ns))
  await ctx.settings.mutate(ns, [{ op: 'set', path: ['actionFusion', 'enabled'], value: false }])
  await until(() => !ctx.tools.get('write_then_run'))
  assert.match(await readFile(path, 'utf8'), /enabled: false/)
  await ctx.settings.mutate(ns, [{ op: 'set', path: ['actionFusion', 'enabled'], value: true }])
  await until(() => Boolean(ctx.tools.get('write_then_run')))
  await ctx.settings.mutate(ns, [{ op: 'set', path: ['actionFusion', 'enabled'], value: false }])
  await until(() => !ctx.tools.get('write_then_run'))
  // Reload the actual plugin: stored settings must win over composition defaults.
  await tree.update('sol-efficiency', { config: { actionFusion: { enabled: true } } })
  await ctx.loader.await()
  await until(() => !ctx.tools.get('write_then_run'))
  assert.equal(ctx.settings.describe().find(row => row.ns === ns).value.actionFusion.enabled, false)
  await assert.rejects(ctx.settings.mutate(ns, [{ op: 'set', path: ['evidenceReducer', 'timeoutMs'], value: 0 }]))
})

test('EPR checkbox follows the session model and disabling removes reduction', async t => {
  const { ctx, tree, agent, cwd, execute } = await boot(t)
  await tree.update('sol-efficiency', { config: {} })
  await ctx.loader.create({ name: '@deepseek-ai/dsh-settings-file', config: { path: join(cwd, 'settings.yaml'), watch: false } })
  await ctx.loader.await()
  agent.options = { provider: 'sol-test', model: 'fixture' }
  await ctx.settings.mutate(ns, [{ op: 'set', path: ['evidenceReducer', 'enabled'], value: true }])
  await delay(20)
  const before = requests.length
  const result = await execute('bash', { command: logCommand(), description: 'Test inherited reducer route' })
  assert.match(result.content[0].text, /^dsh_sol_evidence_receipt_v1/)
  assert.equal(requests.length, before + 1)
  assert.equal(requests.at(-1).provider, 'sol-test')
  assert.equal(requests.at(-1).model, 'fixture')
  await ctx.settings.mutate(ns, [{ op: 'set', path: ['evidenceReducer', 'enabled'], value: false }])
  await delay(20)
  const plain = await execute('bash', { command: logCommand(), description: 'Test disabled reducer' })
  assert.doesNotMatch(plain.content[0].text, /^dsh_sol_evidence_receipt_v1/)
  assert.equal(requests.length, before + 1)
})

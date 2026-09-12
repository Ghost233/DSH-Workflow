import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { boot } from './helpers.mjs'

async function loadCard(scope) {
  let module, render
  vm.runInNewContext(await readFile(new URL('../client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(value) { module = value } } },
  })
  assert.equal(module.id, 'dsh-sol-efficiency')
  let cursor = 0
  const states = []
  const React = {
    createElement(type, props, ...children) {
      return typeof type === 'function' ? type(props) : { type, props, children: children.flat(Infinity).filter(Boolean) }
    },
    useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], value => { states[index] = value }]
    },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot() },
  }
  module.factory(name => {
    assert.equal(name, 'react')
    return React
  }).apply({
    settingsScope: { bind({ namespace }) { assert.equal(namespace, 'sol-efficiency'); return scope } },
    slots: {
      inject(name, factory) { assert.equal(name, 'settings.plugin.item'); factory() },
      register(entry, component) { assert.equal(entry.key, 'sol-efficiency'); render = component },
    },
  })
  return () => { cursor = 0; return render() }
}
function all(tree, type) {
  return [...tree.type === type ? [tree] : [], ...(tree.children ?? []).flatMap(child => all(child, type))]
}

test('browser checkbox uses the DSH settings seam and changes real host tool registrations', async t => {
  const { ctx, tree, cwd } = await boot(t)
  await tree.update('sol-efficiency', { config: {} })
  const path = join(cwd, 'settings.yaml')
  await ctx.loader.create({ name: '@deepseek-ai/dsh-settings-file', config: { path, watch: false } })
  await ctx.loader.await()
  const ns = settingsNamespace('sol-efficiency')
  const scope = {
    getSnapshot() { return { status: 'ready', writable: true, value: ctx.settings.describe().find(row => row.ns === ns).value } },
    set(field, value) { return ctx.settings.mutate(ns, [{ op: 'set', path: [field], value: structuredClone(value) }]) },
  }
  const render = await loadCard(scope)
  const inputs = all(render(), 'input')
  assert.equal(inputs.length, 2)
  assert.equal(inputs[0].props.checked, false)
  inputs[0].props.onChange({ target: { checked: true } })
  for (let i = 0; i < 100 && !ctx.tools.get('write_then_run'); i++) await delay(10)
  assert.ok(ctx.tools.get('write_then_run'))
  assert.equal(all(render(), 'input')[0].props.checked, true)
  assert.match(await readFile(path, 'utf8'), /enabled: true/)
  all(render(), 'input')[0].props.onChange({ target: { checked: false } })
  for (let i = 0; i < 100 && ctx.tools.get('write_then_run'); i++) await delay(10)
  assert.equal(ctx.tools.get('write_then_run'), undefined)
})

test('read-only browser disables both switches and failed saves show an error', async () => {
  const snapshot = { status: 'ready', writable: false, value: { actionFusion: { enabled: false }, evidenceReducer: { enabled: false } } }
  const render = await loadCard({ getSnapshot: () => snapshot, set: async () => {} })
  assert.ok(all(render(), 'input').every(input => input.props.disabled))
  snapshot.writable = true
  all(render(), 'input')[0].props.onChange({ target: { checked: true } })
  await delay(0)
  assert.ok(all(render(), 'p').some(row => row.props?.role === 'alert'))
  assert.equal(all(render(), 'input')[0].props.checked, false)
})

test('launchers no longer inject SoL or expose launch-specific switches', async () => {
  const launcher = await readFile(new URL('../../start-owner-workflow.sh', import.meta.url), 'utf8')
  assert.doesNotMatch(launcher, /DSH_SOL_|SOL_RUNTIME_|prepare_sol_efficiency/)
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.exports['./client'], './client.js')
  assert.ok(manifest.files.includes('client.js'))
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings-plugins'))
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

test('SoL client uses current DSH configuration forms and plugins tab', async () => {
  let registration
  vm.runInNewContext(await readFile(new URL('../client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(value) { registration = value } } },
  })
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: initial => [initial, () => {}],
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
  }
  const client = registration.factory(name => {
    assert.equal(name, 'react')
    return React
  })
  assert.deepEqual(Array.from(client.inject), ['slots', 'configForms'])
  const snapshot = { status: 'ready', writable: true, value: {
    actionFusion: { enabled: false }, evidenceReducer: { enabled: false },
  } }
  const writes = []
  const form = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    async set(field, value) { writes.push([field, value]); snapshot.value[field] = value; return true },
  }
  const unavailable = { getSnapshot: () => ({ status: 'unavailable' }), subscribe: () => () => {} }
  let render
  client.apply({
    configForms: { get(id) {
      assert.ok(['kernel-sol', 'sol-efficiency'].includes(id))
      return id === 'kernel-sol' ? form : unavailable
    } },
    slots: {
      inject(name, register) { assert.equal(name, 'settings.plugins.tab'); register() },
      register(options, component) { assert.equal(options.id, 'sol-efficiency'); render = component },
    },
  })
  const card = render()
  const tree = card.type(card.props)
  const inputs = tree.children.filter(child => child?.type === 'label').map(label => label.children[0])
  inputs[0].props.onChange({ target: { checked: true } })
  await Promise.resolve()
  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [['actionFusion', { enabled: true }]])
})

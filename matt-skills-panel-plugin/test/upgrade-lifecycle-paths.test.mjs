import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { transformSync } from 'esbuild'
import { hookDeckToolGate } from '../src/host/deckToolGate.js'
import { DECK_SETTINGS_BUS_SLOT } from '../src/shared/config-store/src/settings.js'

test('deck tool restrictions release global subscriptions with their host context', t => {
  const previous = globalThis[DECK_SETTINGS_BUS_SLOT]
  const bus = { value: { workspaces: {} }, listeners: [] }
  globalThis[DECK_SETTINGS_BUS_SLOT] = bus
  const cleanup = [], events = new Set()
  const ctx = {
    get: name => name === 'agents' ? { list: () => [] } : null,
    on(name) { events.add(name); return () => events.delete(name) },
    effect(start) { cleanup.push(start()) },
  }
  const gate = hookDeckToolGate(ctx)
  t.after(() => { gate.dispose(); globalThis[DECK_SETTINGS_BUS_SLOT] = previous })
  assert.equal(bus.listeners.length, 1)
  assert.equal(events.size, 2)
  for (const stop of cleanup) stop()
  assert.equal(bus.listeners.length, 0)
  assert.equal(events.size, 0)
})

test('a gate imported after host disposal leaves no global subscription', t => {
  const previous = globalThis[DECK_SETTINGS_BUS_SLOT]
  const bus = { value: { workspaces: {} }, listeners: [] }
  globalThis[DECK_SETTINGS_BUS_SLOT] = bus
  const ctx = {
    get: name => name === 'agents' ? { list: () => [] } : null,
    on: () => () => {},
    effect() { throw new Error('Host context is disposed') },
  }
  const gate = hookDeckToolGate(ctx)
  t.after(() => { gate.dispose(); globalThis[DECK_SETTINGS_BUS_SLOT] = previous })
  assert.equal(bus.listeners.length, 0)
})

function sandboxPolicyCallback(ctx) {
  const path = new URL('../src/host/index.ts', import.meta.url)
  const source = ts.createSourceFile('host-index.ts', readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  let callback
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'sandboxPolicyFor'
      && ts.isFunctionExpression(node.initializer)) callback = node.initializer.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(callback, 'The real Host must provide the sandbox policy callback')
  const { code } = transformSync(`globalThis.selectPolicy = ${callback}`, { loader: 'ts', target: 'es2020' })
  const scope = { ctx, Promise }
  vm.runInNewContext(code, scope)
  return scope.selectPolicy
}

test('chain policy lookup keeps distinct macOS case and literal backslash directories', async () => {
  for (const [cwd, other] of [['/Users/Matt/Case', '/Users/Matt/case'], ['/Users/Matt/Folder\\Name', '/Users/Matt/Folder/Name']]) {
    const sessions = { list: () => [{ id: 'exact', header: { cwd } }, { id: 'other', header: { cwd: other } }] }
    const sandboxPolicy = { resolve: ({ session }) => ({ sourceSession: session.id }) }
    const select = sandboxPolicyCallback({ get: name => ({ sessions, sandboxPolicy })[name] })
    const result = await select({ cwd: cwd + '//' })
    assert.equal(result.sessionId, 'exact')
    assert.equal(result.policy.sourceSession, 'exact')
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { SettingsController } from '../src/settings-controller.mjs'
import { APPROVE_FOR_ME_DEFAULTS } from '../../owner-workflow-plugin/vendor/dsh-approve-for-me/src/core/defaults.ts'

function fixture(value = structuredClone(APPROVE_FOR_ME_DEFAULTS)) {
  let state = { status: 'ready', writable: true, mode: 'host', value, base: structuredClone(APPROVE_FOR_ME_DEFAULTS), revision: 3 }
  const listeners = new Set()
  const calls = []
  const scope = { getSnapshot: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    async mutate(ops, revision) { calls.push({ ops, revision }) },
  }
  const remote = { async modelCatalog() { return { ok: true, value: { groups: [], failures: [] } } } }
  const controller = new SettingsController(scope, remote)
  return { controller, calls, scope, remote,
    publish(next) { state = { ...state, ...next }; for (const listener of listeners) listener() },
    subscriptions: () => listeners.size }
}

test('a recovered rejected write keeps its draft; conflicting host edits cannot be overwritten', async t => {
  const f = fixture()
  t.after(() => f.controller.dispose())
  f.controller.edit('shellRulesText', 'node --version')
  await f.controller.save()
  assert.match(f.controller.getSnapshot().error, /未保存/)
  assert.equal(f.controller.getSnapshot().draft.shellRulesText, 'node --version')
  f.publish({ revision: 4, value: { ...f.scope.getSnapshot().value, rules: { commandPrefixes: [], reviewerInstructions: 'Another window' } } })
  assert.equal(f.controller.getSnapshot().conflicted, true)
  await f.controller.save()
  assert.equal(f.calls.length, 1)
  f.controller.discard()
  assert.equal(f.controller.getSnapshot().draft.reviewerInstructions, 'Another window')
})

test('saving preserves an unavailable existing route and hidden limits; reset uses native unset', async t => {
  const value = structuredClone(APPROVE_FOR_ME_DEFAULTS)
  value.reviewer = { provider: 'offline', model: 'existing', timeoutMs: 9000 }
  value.limits.reviewerOutputChars = 700
  const f = fixture(value)
  t.after(() => f.controller.dispose())
  f.scope.mutate = async (ops, revision) => {
    f.calls.push({ ops, revision })
    f.publish({ value: ops[0].op === 'unset' ? f.scope.getSnapshot().base : ops[0].value, revision: revision + 1 })
  }
  await f.controller.loadCatalog()
  f.controller.edit('shellRulesText', 'node --version')
  assert.equal(f.controller.getSnapshot().valid, true)
  await f.controller.save()
  assert.equal(f.controller.getSnapshot().dirty, false)
  assert.deepEqual(f.scope.getSnapshot().value.reviewer, value.reviewer)
  assert.deepEqual(f.scope.getSnapshot().value.limits, value.limits)
  await f.controller.save(true)
  assert.deepEqual(f.calls[1], { ops: [{ op: 'unset', path: [] }], revision: 4 })
  assert.deepEqual(f.scope.getSnapshot().value, APPROVE_FOR_ME_DEFAULTS)
})

test('new unavailable routes, malformed rules and read-only settings cannot be saved', async t => {
  const f = fixture()
  t.after(() => f.controller.dispose())
  f.controller.edit('provider', 'unknown')
  f.controller.edit('model', 'unknown')
  await f.controller.save()
  assert.equal(f.calls.length, 0)
  f.controller.discard()
  f.controller.edit('shellRulesText', 'node && touch marker')
  assert.equal(f.controller.getSnapshot().valid, false)
  await f.controller.save()
  f.controller.discard()
  f.publish({ writable: false })
  f.controller.edit('mode', 'rules-only')
  await f.controller.save(true)
  assert.equal(f.calls.length, 0)
})

test('late catalog responses cannot repopulate a reconnected or disposed controller', async () => {
  const f = fixture()
  const first = Promise.withResolvers()
  f.remote.modelCatalog = () => first.promise
  const loading = f.controller.loadCatalog()
  f.remote.modelCatalog = async () => ({ ok: true, value: { groups: [{ id: 'new', models: [] }], failures: [] } })
  await f.controller.loadCatalog()
  first.resolve({ ok: true, value: { groups: [{ id: 'old', models: [] }], failures: [] } })
  await loading
  assert.equal(f.controller.getSnapshot().groups[0].id, 'new')
  f.controller.dispose()
  assert.equal(f.subscriptions(), 0)
})

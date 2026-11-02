import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { attachManagerLifetime } from './superagent-lifetime.mjs'

test('a Host starts graceful shutdown when its manager connection disappears', async () => {
  const calls = [], disposers = []
  const runtime = Object.assign(new EventEmitter(), { env: { DSH_WORKFLOW_MANAGED_SUPERAGENT: '1' }, connected: true, pid: 123,
    kill: (pid, signal) => calls.push([pid, signal]) })
  attachManagerLifetime({ effect: fn => disposers.push(fn()) }, runtime)
  runtime.emit('disconnect')
  assert.deepEqual(calls, [[123, 'SIGINT']])
  disposers[0]()
  runtime.emit('disconnect')
  assert.equal(calls.length, 1)
  runtime.emit('exit')
  assert.deepEqual(calls[1], [-123, 'SIGTERM'])
  runtime.connected = false
  attachManagerLifetime({ effect: fn => disposers.push(fn()) }, runtime)
  await new Promise(resolve => queueMicrotask(resolve))
  assert.deepEqual(calls[2], [123, 'SIGINT'])
  disposers[1]()
})

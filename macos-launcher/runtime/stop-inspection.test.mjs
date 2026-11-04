import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { apply } from './stop-inspection.mjs'

async function fixture(t) {
  const ctx = new EventEmitter()
  const sessionId = 'owned-session', agent = { id: sessionId, status: 'idle', inbox: { nextStep: [], nextTurn: [] } }
  let records = []
  const reminder = { id: 'reminder', title: 'Due', status: 'active', scheduledAt: '2026-11-04T00:00:00Z',
    target: { kind: 'session', sessionId } }
  ctx.workflowHostInstance = { instanceId: 'host' }
  ctx.agents = { list: () => [agent], currentInitiator: () => undefined, isOwnedBy: () => false }
  ctx.jobs = { list: () => [], events: { subscribe: () => () => {} } }
  ctx.get = name => name === 'schedule' ? {
    catalog: async () => [reminder], history: async () => ({ records }),
  } : undefined
  ctx.effect = fn => { ctx.dispose = fn() }
  const oldConnected = Object.getOwnPropertyDescriptor(process, 'connected')
  const oldSend = process.send
  Object.defineProperty(process, 'connected', { value: true, configurable: true })
  let receive
  process.send = (reply, callback) => { receive(reply); callback?.() }
  apply(ctx)
  t.after(() => {
    ctx.dispose()
    if (oldConnected) Object.defineProperty(process, 'connected', oldConnected)
    else delete process.connected
    if (oldSend === undefined) delete process.send
    else process.send = oldSend
  })
  let requestId = 0
  const request = input => new Promise(resolve => {
    receive = resolve
    process.emit('message', { type: 'workflow-stop-inspection', requestId: ++requestId, ...input })
  })
  return { ctx, agent, reminder, request, setRecords: value => { records = value } }
}

for (const scenario of ['confirmed-delivery', 'different-target', 'new-user-message']) {
  test(`stop confirmation tracks ${scenario} under the new schedule API`, async t => {
    const f = await fixture(t)
    const first = await f.request({ action: 'inspect' })
    assert.equal(first.work.find(row => row.kind === 'reminder').agentId, 'owned-session')
    const message = { id: 'delivered', source: { kind: scenario === 'new-user-message' ? 'user' : 'schedule' } }
    f.reminder.status = 'ended'
    f.agent.inbox.nextTurn.push(message)
    f.setRecords([{ messageId: message.id, targetSessionId: scenario === 'different-target' ? 'other-session' : f.agent.id }])
    f.ctx.emit('agent/inbox/inserted', { agent: f.agent, message })
    f.ctx.emit('schedule/changed')
    const result = await f.request({ action: 'commit', accepted: first, confirmed: true,
      instanceId: 'host', operationId: 'stop', expiresAt: Date.now() + 10_000 })
    assert.equal(result.committed, scenario === 'confirmed-delivery')
  })
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from './stop-inspection.mjs'

async function inspect(t, change) {
  const agent = { id: 'session', status: 'idle', inbox: { nextStep: [], nextTurn: [] } }
  const agents = [agent, { ...agent, id: 'other' }]
  const jobs = [], terminals = [], reminders = []
  const services = { schedule: { catalog: async () => reminders }, terminalController: { list: () => terminals } }
  const ctx = {
    workflowHostInstance: { instanceId: 'host' },
    agents: { list: () => agents },
    jobs: { list: id => jobs.filter(job => job.owner === id) },
    get: name => services[name],
    effect: fn => { t.after(fn()) },
  }
  change({ agent, jobs, terminals, reminders, services })
  const oldConnected = Object.getOwnPropertyDescriptor(process, 'connected')
  const oldSend = process.send
  Object.defineProperty(process, 'connected', { value: true, configurable: true })
  const reply = Promise.withResolvers()
  process.send = (value, callback) => { reply.resolve(value); callback?.() }
  t.after(() => {
    if (oldConnected) Object.defineProperty(process, 'connected', oldConnected)
    else delete process.connected
    if (oldSend === undefined) delete process.send
    else process.send = oldSend
  })
  apply(ctx)
  process.emit('message', { type: 'workflow-stop-inspection', requestId: 1 })
  return reply.promise
}

for (const [scenario, change, hasWork, unknown] of [
  ['a running agent and an idle agent', ({ agent }) => { agent.status = 'running' }, true, false],
  ['a queued message', ({ agent }) => { agent.inbox.nextTurn.push({ id: 'message' }) }, true, false],
  ['an unowned background job', ({ jobs }) => { jobs.push({ status: 'running', label: 'private command' }) }, true, false],
  ['an open terminal', ({ terminals }) => { terminals.push({ state: 'running' }) }, true, false],
  ['a scheduled reminder', ({ reminders }) => { reminders.push({ status: 'active' }) }, true, false],
  ['only finished work', ({ jobs, terminals, reminders }) => {
    jobs.push({ status: 'exited' }); terminals.push({ state: 'exited' }); reminders.push({ status: 'ended' })
  }, false, false],
  ['an unavailable schedule service', ({ services }) => { delete services.schedule }, false, true],
]) test(`stop inspection with ${scenario}`, async t => {
  const reply = await inspect(t, change)
  assert.deepEqual({ ...reply, message: undefined }, {
    type: 'workflow-stop-inspection', requestId: 1, instanceId: 'host', hasWork, unknown, message: undefined,
  })
})

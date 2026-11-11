import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Coordination } from '../src/coordination.mjs'
import { TobsBridge } from '../src/tobs-bridge.mjs'

test('mounts project work on an already live principal and removes the tool on unload', async () => {
  let setup, registered, registrations = 0
  const session = { id: 'existing-tob' }
  const ctx = {
    tools: { register: tool => { registered = tool; registrations++; return () => { registered = undefined } } },
    effect: () => {}, on: () => () => {},
  }
  const agent = { session, ctx }
  const unrelated = { session: { id: 'unrelated' } }
  const owner = { botSlug: 'boss', rootRole: 'orchestrator' }
  const core = {
    contributeBotAgentSetup: callback => { setup = callback; return () => {} },
    ownership: { resolve: id => id === session.id ? owner : undefined },
    runtime: { currentOrchestratorSessionId: () => session.id },
  }
  const service = { member: () => ({ role: 'principal' }), team: () => ({ ready: true }), store: { put() {} } }
  const bridge = new TobsBridge({ service, core, defineTool: value => value })
  bridge.start({ list: () => [agent, unrelated] })
  assert.equal(registered?.name, 'project_work')
  setup(ctx, agent, owner)
  assert.equal(registrations, 1)
  assert.deepEqual(JSON.parse(await registered.execute({ action: 'team' }, { agent, signal: new AbortController().signal })), { ready: true })
  bridge.close()
  assert.equal(registered, undefined)
})

test('project tools trust the actual Host Agent and original Human DM, never a supplied bot identity', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'coordination-tobs-'))
  const now = Date.now()
  const service = new Coordination({ path: join(directory, 'state.sqlite'), now: () => now, configuration: {
    repositories: [{ repository: 'example/front', manager: 'front', allowedActors: ['owner'] }],
    members: [{ bot: 'boss', role: 'principal' }, { bot: 'front', parent: 'boss', role: 'manager', repository: 'example/front' }],
  } })
  t.after(async () => { service.close(); await rm(directory, { recursive: true, force: true }) })
  let setup, tool
  const listeners = new Map()
  const agent = { session: { id: 'actual-session' } }
  const core = {
    contributeBotAgentSetup: callback => { setup = callback; return () => {} },
    ownership: { resolve: () => ({ botSlug: 'front', rootRole: 'orchestrator' }) },
    runtime: { currentOrchestratorSessionId: () => 'actual-session', listAssignments: () => [] },
    attention: { list: () => ({ items: [{ id: 'native-source', botSlug: 'front', reason: 'human-dm',
      sourceKind: 'human-message', authorKind: 'human', sourceAvailable: true,
      sourceChannelId: 'dm-front', sourceMessageId: 'original', createdAt: new Date(now).toISOString() }] }) },
    channels: { get: () => ({ id: 'dm-front', type: 'dm', botSlug: 'front' }),
      message: () => ({ id: 'original', author: { kind: 'human' }, body: 'Implement login in the frontend repository' }) },
  }
  const bridge = new TobsBridge({ service, core, defineTool: value => value })
  bridge.start()
  t.after(() => bridge.close())
  setup({ tools: { register: value => { tool = value; return () => {} } }, effect: () => {}, on: (type, listener) => { listeners.set(type, listener); return () => listeners.delete(type) } }, agent, { botSlug: 'front', rootRole: 'orchestrator' })
  const exec = { agent, signal: new AbortController().signal }
  await assert.rejects(tool.execute({ action: 'inbox', input: { bot: 'boss' } }, { ...exec, agent: { session: { id: 'forged' } } }), /Agent/)
  const inbox = JSON.parse(await tool.execute({ action: 'inbox', input: {} }, exec))
  assert.equal(inbox[0].source.text, 'Implement login in the frontend repository')
  const task = JSON.parse(await tool.execute({ action: 'accept', input: {
    event_id: inbox[0].id, receipt: inbox[0].token, title: 'Login', criteria: ['login succeeds'], bot: 'boss',
  } }, exec))
  assert.equal(task.owner, 'front')
  assert.equal(task.canDevelop, true)
  const failure = { agent, turn: 1, step: 2, error: { code: 'MODEL_UNAVAILABLE' } }
  listeners.get('agent/error')({ ...failure, agent: { session: { id: 'forged' } } })
  assert.equal(service.store.list('native-failure').length, 0)
  listeners.get('agent/error')(failure)
  listeners.get('agent/error')(failure)
  assert.equal(service.store.list('native-failure').length, 1)
  assert.equal(service.claim('boss')[0].source.kind, 'dependency-wait')
  assert.equal(service.claim('front')[0].source.kind, 'execution-recovery')
  assert.equal(service.store.get('native-backoff', 'front').failures, 1)
  assert.ok(service.store.get('native-backoff', 'front').retryAt > now)
})

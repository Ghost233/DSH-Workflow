/**
 * Router: the L1→L2 routing core (spec「工具契约」route_to_owner / query_tasks / reply_source).
 * Tested against a fake Sessions port so lazy creation, deleted-Session rebuild, and idempotency are proven
 * without a DSH runtime; index.js wires the real sessionController into the same port.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/store.js'
import { OwnerRegistry } from '../src/registry.js'
import { Router, RouterError } from '../src/router.js'

/** A registry+router with a scriptable fake Sessions port. */
function fixture({ failSessions = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-router-'))
  const store = new Store(dir)
  const registry = new OwnerRegistry(store, { scratchRoot: join(dir, 'scratch') })
  registry.ensureChief({ cwd: '/Volumes/home', workspace: 'Ghost233HomeRepo' })
  const calls = { create: [], prompt: [] }
  const sessions = {
    create: async request => {
      calls.create.push(request)
      return { sessionId: 'session-fake-' + calls.create.length }
    },
    prompt: async request => {
      calls.prompt.push(request)
      if (failSessions.includes(request.sessionId)) {
        const error = new Error('session ' + request.sessionId + ' is absent from persistence')
        error.name = 'ApiSessionNotFound'
        throw error
      }
      return { accepted: true }
    },
  }
  const router = new Router({ store, registry, sessions })
  return { router, registry, store, calls, cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }) } }
}

test('route lazily creates the owner Session, stores trigger+ticket first, then injects', async () => {
  const { router, registry, calls, cleanup } = fixture()
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'DSH-Workflow', cwd: '/repos/DSH-Workflow' })
    const receipt = await router.routeToOwner({ ownerId: owner.id, message: '继续工单 63 收尾' })
    assert.equal(receipt.createdSession, true)
    assert.equal(receipt.rebuilt, false)
    assert.equal(calls.create.length, 1)
    assert.equal(calls.create[0].cwd, '/repos/DSH-Workflow')
    assert.equal(calls.create[0].agentPreset, 'hub-bot-owner')
    // 先存后做: the ticket exists and names the Session before the prompt was admitted.
    const ticket = router.getTicket(receipt.ticketId)
    assert.equal(ticket.owner, owner.id)
    assert.equal(ticket.stage, 'working')
    assert.equal(ticket.mechanism, 'inject')
    assert.equal(ticket.targetSession, receipt.sessionId)
    const trigger = router.getTrigger(ticket.triggerId)
    assert.equal(trigger.message, '继续工单 63 收尾')
    // The injected text carries the authorization record.
    assert.equal(calls.prompt.length, 1)
    assert.match(calls.prompt[0].text, /继续工单 63 收尾/)
    assert.match(calls.prompt[0].text, /授权/)
    assert.equal(registry.get(owner.id).status, 'created')
    // Second route reuses the live Session — no new creation.
    const again = await router.routeToOwner({ ownerId: owner.id, message: '补一句' })
    assert.equal(again.createdSession, false)
    assert.equal(calls.create.length, 1)
    assert.equal(calls.prompt.length, 2)
  } finally { cleanup() }
})

test('route refuses unknown owners and the chief itself', async () => {
  const { router, cleanup } = fixture()
  try {
    await assert.rejects(() => router.routeToOwner({ ownerId: 'nope', message: 'x' }), RouterError)
    await assert.rejects(() => router.routeToOwner({ ownerId: 'chief', message: 'x' }), RouterError)
    await assert.rejects(() => router.routeToOwner({ ownerId: 'chief' }), RouterError)
  } finally { cleanup() }
})

test('one trigger accepted twice produces one task: triggerRef dedupes the whole route', async () => {
  const { router, registry, calls, cleanup } = fixture()
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
    const first = await router.routeToOwner({ ownerId: owner.id, message: 'm', triggerRef: 'feishu:om_1' })
    const second = await router.routeToOwner({ ownerId: owner.id, message: 'm', triggerRef: 'feishu:om_1' })
    assert.equal(second.deduped, true)
    assert.equal(second.ticketId, first.ticketId)
    assert.equal(calls.prompt.length, 1)
    assert.equal(router.queryTasks({}).length, 1)
    // A different triggerRef routes normally.
    await router.routeToOwner({ ownerId: owner.id, message: 'm', triggerRef: 'feishu:om_2' })
    assert.equal(router.queryTasks({}).length, 2)
  } finally { cleanup() }
})

test('a deleted owner Session rebuilds on next injection and the registry is updated', async () => {
  const dead = []
  const { router, registry, calls, cleanup } = fixture({ failSessions: dead })
  try {
    const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
    const first = await router.routeToOwner({ ownerId: owner.id, message: 'first' })
    // Simulate the Session being deleted out from under the registry.
    dead.push(first.sessionId)
    const rebuilt = await router.routeToOwner({ ownerId: owner.id, message: 'after delete' })
    assert.equal(rebuilt.rebuilt, true)
    assert.notEqual(rebuilt.sessionId, first.sessionId)
    assert.equal(registry.get(owner.id).sessionId, rebuilt.sessionId)
    assert.equal(registry.get(owner.id).status, 'created')
    // The ticket now targets the replacement Session.
    assert.equal(router.getTicket(rebuilt.ticketId).targetSession, rebuilt.sessionId)
    assert.equal(calls.create.length, 2)
    assert.equal(calls.prompt.length, 3) // first + failed attempt + retried after rebuild
  } finally { cleanup() }
})

test('the runtime\'s plain-Error missing-session message ("session \"<id>\" not found") also triggers rebuild', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-router-'))
  const store = new Store(dir)
  const registry = new OwnerRegistry(store, { scratchRoot: join(dir, 'scratch') })
  const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
  registry.bindSession(owner.id, 'session-dead')
  let creates = 0
  const router = new Router({ store, registry, sessions: {
    create: async () => ({ sessionId: 'session-replacement-' + ++creates }),
    prompt: async request => {
      if (request.sessionId === 'session-dead') throw new Error('session "session-dead" not found')
      return { accepted: true }
    },
  } })
  try {
    const receipt = await router.routeToOwner({ ownerId: owner.id, message: 'after delete' })
    assert.equal(receipt.rebuilt, true)
    assert.equal(receipt.sessionId, 'session-replacement-1')
    assert.equal(registry.get(owner.id).sessionId, 'session-replacement-1')
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('a non-missing-session prompt failure propagates without rebuilding', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-bot-router-'))
  const store = new Store(dir)
  const registry = new OwnerRegistry(store, { scratchRoot: join(dir, 'scratch') })
  const owner = registry.create({ kind: 'repo', workspace: 'W', cwd: '/w' })
  registry.bindSession(owner.id, 'session-live')
  const router = new Router({ store, registry, sessions: {
    create: async () => { throw new Error('must not be called') },
    prompt: async () => { const e = new Error('provider overloaded'); e.name = 'RemoteError'; throw e },
  } })
  try {
    await assert.rejects(() => router.routeToOwner({ ownerId: owner.id, message: 'x' }), /overloaded/)
    assert.equal(registry.get(owner.id).sessionId, 'session-live')
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('queryTasks filters by owner and stage; replySource records into the outbox', async () => {
  const { router, registry, cleanup } = fixture()
  try {
    const a = registry.create({ kind: 'repo', workspace: 'A', cwd: '/a' })
    const b = registry.create({ kind: 'repo', workspace: 'B', cwd: '/b' })
    await router.routeToOwner({ ownerId: a.id, message: 'one' })
    await router.routeToOwner({ ownerId: b.id, message: 'two' })
    assert.equal(router.queryTasks({}).length, 2)
    assert.equal(router.queryTasks({ owner: a.id }).length, 1)
    assert.equal(router.queryTasks({ owner: a.id })[0].mechanism, 'inject')
    assert.equal(router.queryTasks({ stage: 'working' }).length, 2)
    assert.equal(router.queryTasks({ stage: 'done' }).length, 0)
    const reply = await router.replySource({ text: '工单 63 已收尾', to: 'dsh:session:chief' })
    assert.ok(reply.outboxId.startsWith('out-'))
    assert.equal(reply.state, 'recorded')
    const outbox = router.listOutbox()
    assert.equal(outbox.length, 1)
    assert.equal(outbox[0].body, '工单 63 已收尾')
    assert.equal(outbox[0].to, 'dsh:session:chief')
  } finally { cleanup() }
})

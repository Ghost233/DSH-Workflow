import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Coordination } from '../src/coordination.mjs'
import { Execution } from '../src/execution.mjs'
import { CoordinationRuntime } from '../src/runtime.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'project-execution-'))
  const service = new Coordination({ path: join(root, 'state.sqlite'), configuration: {
    members: [{ bot: 'boss', role: 'principal' }, { bot: 'repo', parent: 'boss', role: 'manager', repository: 'owner/repo' }],
    repositories: [{ repository: 'owner/repo', manager: 'repo', allowedActors: ['owner'] }],
  } })
  t.after(async () => { service.close(); await rm(root, { recursive: true, force: true }) })
  service.ingest({ id: 'issue', kind: 'issue', actor: 'owner', repository: 'owner/repo', number: 1 })
  const [event] = service.claim('repo')
  const task = service.accept('repo', event.id, event.token, { title: 'Build feature', criteria: ['feature works'] })
  const assignments = [], stops = []
  const grant = { id: 'grant', workspaceId: 'workspace', workspacePath: '/authorized/tree', orchestratorWrite: false, writeRevision: 0 }
  const core = { runtime: {
    listAssignments: () => assignments,
    getAssignment: (_bot, id) => assignments.find(row => row.sessionId === id),
    runDirectBotTool: async (bot, name, args) => { stops.push({ bot, name, args }); assignments.find(row => row.sessionId === args.session_id).activity = 'stopped' },
    turnRunning: () => false,
  }, grants: {
    list: () => [grant],
    requireActive: () => grant,
    setOrchestratorWrite(bot, grantId, enabled) {
      assert.equal(bot, 'repo')
      assert.equal(grantId, grant.id)
      grant.orchestratorWrite = enabled
      grant.writeRevision++
      return grant
    },
  }, registry: { get: () => ({ paused: false }) } }
  const sections = []
  core.roster = { snapshot: () => ({ sections }), sectionCreate: async name => {
    const section = { id: 'project-section', name, channelIds: [] }; sections.push(section); return section
  }, channelAssign: async () => {} }
  core.channels = { list: () => [] }
  const workspaces = { prepare: async () => ({ path: '/authorized/tree', branch: 'codex/task' }),
    verify: async () => ({ id: 'proof', tree: 'b'.repeat(40), commands: [{ command: 'check', exitCode: 0 }] }),
    head: async () => ({ head: 'a'.repeat(40), tree: 'b'.repeat(40) }) }
  const github = { ensureIssue: async () => task.issue, ensurePull: async () => ({ head: 'a'.repeat(40), pull: 'https://github.com/owner/repo/pull/2' }), poll: async () => {} }
  const execution = new Execution({ service, core, workspaces, github,
    workspaceRegistry: { list: () => [{ id: 'workspace', path: '/authorized/tree' }] } })
  function native(attemptId) {
    assignments.push({ sessionId: 'native', botSlug: 'repo', continuityKey: attemptId, activity: 'working',
      permission: { grantId: 'grant', workspaceId: 'workspace', primaryCwd: '/authorized/tree' } })
  }
  return { service, task, core, execution, workspaces, github, assignments, stops, native, grant }
}

test('dispatch opens write access on the task worktree by default', async t => {
  const f = await fixture(t)
  f.core.grants.list = () => []
  f.core.grants.create = async (_bot, _workspace, confirmation) => {
    confirmation.validate()
    return f.grant
  }
  const prepared = await f.execution.prepare('repo', f.task.id)
  assert.equal(prepared.next.arguments.grant_id, f.grant.id)
  assert.equal(f.grant.orchestratorWrite, true)
})

test('resume repairs the default on the original Grant and respects an explicit write disable', async t => {
  const f = await fixture(t)
  const prepared = await f.execution.prepare('repo', f.task.id)
  f.native(prepared.attempt.id)
  Object.assign(f.grant, { orchestratorWrite: false, writeRevision: 0 })
  const resumed = await f.execution.prepare('repo', f.task.id)
  assert.equal(resumed.next.arguments.session_id, 'native')
  assert.equal(f.grant.orchestratorWrite, true)
  f.core.grants.setOrchestratorWrite('repo', f.grant.id, false)
  await assert.rejects(f.execution.prepare('repo', f.task.id), /write access was disabled/)
  assert.equal(f.grant.orchestratorWrite, false)
  assert.equal(f.service.store.list('attempt').length, 1)
})

test('native dispatch is reconciled and only its actual Assignment can verify and deliver', async t => {
  const f = await fixture(t)
  const prepared = await f.execution.prepare('repo', f.task.id, new AbortController().signal)
  assert.equal(prepared.next.tool, 'create_assignment')
  assert.equal(prepared.next.arguments.key, prepared.attempt.id)
  await assert.rejects(f.execution.prepare('repo', f.task.id), /reconciliation/)
  f.native(prepared.attempt.id)
  assert.throws(() => f.execution.worker('repo', 'forged-session', prepared.attempt.id), /bound Assignment/)
  await f.execution.verify('repo', 'native', prepared.attempt.id)
  f.workspaces.head = async () => ({ head: 'c'.repeat(40), tree: 'c'.repeat(40) })
  await assert.rejects(f.execution.deliver('repo', 'native', prepared.attempt.id, 'ready'), /matching successful verification/)
  f.workspaces.head = async () => ({ head: 'a'.repeat(40), tree: 'b'.repeat(40) })
  const result = await f.execution.deliver('repo', 'native', prepared.attempt.id, 'ready')
  assert.equal(result.state, 'delivered')
  assert.equal(result.accepted, false)
  f.service.report('repo', prepared.attempt.id, { state: 'progress', summary: 'Review pending', evidence: { pull: 'forged', head: 'forged' } })
  assert.deepEqual(f.service.store.get('task', f.task.id).evidence, result.evidence, 'progress cannot overwrite delivery proof')
  assert.throws(() => f.service.review('boss', f.task.id, 'false', 'not accepted'), /boolean/)
  assert.equal(f.service.store.list('attempt').length, 1)
})

test('stop targets only bound project Sessions and resume preserves the original execution', async t => {
  const f = await fixture(t)
  const prepared = await f.execution.prepare('repo', f.task.id)
  f.native(prepared.attempt.id)
  f.assignments.push({ sessionId: 'unrelated', activity: 'working' })
  f.execution.reconcile('repo')
  f.service.stop('repo', f.task.id)
  await f.execution.stopPending(new AbortController().signal)
  assert.deepEqual(f.stops.map(row => row.args.session_id), ['native'])
  assert.equal(f.assignments[1].activity, 'working')
  f.service.resume('repo', f.task.id)
  const resumed = await f.execution.prepare('repo', f.task.id)
  assert.equal(resumed.next.tool, 'unarchive_assignment')
  assert.ok(resumed.next.arguments.message)
  assert.equal(resumed.next.arguments.session_id, 'native')
  assert.equal(f.service.store.list('attempt').length, 1)
})

test('dependency outage recovery wakes through native system schedules, retaining the event queue', async t => {
  const f = await fixture(t)
  const pending = f.service.notify('boss', { id: 'report', kind: 'child-report', text: 'PR is ready' })
  let wakes = 0
  f.core.schedules = { list: () => [], create: (_bot, input, creator) => {
    assert.equal(creator, 'human'); assert.equal(input.enabled, false); assert.equal(input.locked, true)
    return { id: 'schedule' }
  }, runNow: () => { wakes++ } }
  const runtime = new CoordinationRuntime({ service: f.service, bridge: { execution: f.execution }, core: f.core, github: f.github })
  t.after(() => runtime.close())
  f.service.store.put('native-backoff', 'boss', { failures: 1, retryAt: Date.now() + 60000 })
  await runtime.tick()
  assert.equal(wakes, 0, 'native failure backoff gates background wakes')
  f.service.store.put('native-backoff', 'boss', { failures: 1, retryAt: 0 })
  await runtime.tick()
  await runtime.tick()
  assert.equal(wakes, 1)
  assert.equal(f.service.store.get('event', 'report').state, 'pending')
  assert.equal(pending, undefined)
})

test('native human-stop and failures holds are reported without creating a wake or changing task authority', async t => {
  const f = await fixture(t)
  const runtime = new CoordinationRuntime({ service: f.service, core: f.core, bridge: { execution: f.execution }, github: f.github })
  t.after(() => runtime.close())
  f.core.schedules = { list: () => { throw new Error('A held Bot must not reach schedule mutation') } }
  f.core.runtime.heldCause = () => 'human-stop'
  assert.equal(runtime.wake('repo'), false)
  f.core.runtime.heldCause = () => 'failures'
  assert.equal(runtime.wake('repo'), false)
  const notices = f.service.claim('boss')
  assert.equal(notices.length, 2)
  assert.ok(notices.every(row => row.source.kind === 'reconciliation-required' && !row.canDevelop))
  assert.equal(f.service.store.get('task', f.task.id).sourceId, 'issue')
  assert.equal(f.service.store.list('attempt').length, 0)
})

test('verification failure retains real exit evidence and reports upward instead of becoming delivery proof', async t => {
  const f = await fixture(t)
  const prepared = await f.execution.prepare('repo', f.task.id)
  f.native(prepared.attempt.id)
  await f.execution.verify('repo', 'native', prepared.attempt.id)
  f.workspaces.verify = async () => { throw Object.assign(new Error('exit 7'), {
    tree: 'b'.repeat(40), commands: [{ command: 'project-check', exitCode: 7, outputSha256: 'fixture-output' }],
  }) }
  await assert.rejects(f.execution.verify('repo', 'native', prepared.attempt.id), /exit 7/)
  const failure = f.service.store.list('verification-failure')[0]
  assert.equal(failure.commands[0].exitCode, 7)
  assert.equal(f.service.store.get('verified-tree', prepared.attempt.id).invalidated, true)
  await assert.rejects(f.execution.deliver('repo', 'native', prepared.attempt.id, 'cannot use old proof'), /matching successful verification/)
  assert.equal(f.service.store.list('report')[0].state, 'blocked')
  assert.equal(f.service.claim('boss')[0].source.kind, 'child-report')
})

test('specialist creation waits with backoff, informs its superior and resumes with the same operation key', async t => {
  const f = await fixture(t)
  f.service.configuration.templates = [{ name: 'approved', role: 'executor', modelPreset: 'preset', persona: 'Specialist' }]
  const request = f.service.requestMember('repo', f.task.id, 'approved')
  let available = false, lookups = 0, creations = 0
  f.core.runtime.turnRunning = () => true
  f.core.modelPresets = { get: () => { lookups++; return available ? { id: 'preset' } : undefined } }
  f.core.creations = { create: (_input, key) => { assert.equal(key, request.operationKey); creations++; return { record: { slug: 'specialist' } } } }
  f.core.registry.applyModelPreset = () => ({ ok: true })
  const runtime = new CoordinationRuntime({ service: f.service, core: f.core, bridge: { execution: f.execution }, github: f.github })
  t.after(() => runtime.close())
  await runtime.tick()
  await runtime.tick()
  assert.equal(lookups, 1)
  assert.equal(creations, 0)
  assert.equal(f.service.claim('boss')[0].source.kind, 'dependency-wait')
  available = true
  f.service.now = () => Date.now() + 5000
  await runtime.tick()
  assert.equal(creations, 1)
  assert.equal(f.service.store.get('member-request', request.id).state, 'created')
})

test('failed GitHub feedback remains visible to the superior and retries after its recovery deadline', async t => {
  const f = await fixture(t)
  const task = f.service.saveTask(f.task, { state: 'completed', accepted: true, review: 'Accepted investigation' })
  let available = false, writes = 0, closures = 0
  f.core.runtime.turnRunning = () => true
  f.github.publishStatus = async () => { writes++; if (!available) throw Object.assign(new Error('unavailable'), { dependency: 'network' }) }
  f.github.closeCompletedIssue = async id => { assert.equal(id, task.id); closures++ }
  const runtime = new CoordinationRuntime({ service: f.service, core: f.core, bridge: { execution: f.execution }, github: f.github })
  t.after(() => runtime.close())
  await runtime.tick()
  await runtime.tick()
  assert.equal(writes, 1)
  assert.equal(closures, 0)
  assert.equal(f.service.claim('boss')[0].source.taskId, task.id)
  available = true
  f.service.now = () => Date.now() + 61000
  await runtime.tick()
  assert.equal(writes, 2)
  assert.equal(closures, 1)
  assert.equal(f.service.store.get('retry', `feedback:${task.id}`).revision, task.revision)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, realpath, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { kernelNativeHost } from './fixtures/kernel-native-host.mjs'
import { NativeCommandEffects } from '../src/native-command-effects.mjs'
import { NativeNotificationEffects } from '../src/native-notification-effects.mjs'
import { readSessionEvents } from '../src/dsh-execution.mjs'
import { kernelDigest } from '../src/workflow-engine.mjs'
import { SessionHandleClosedError } from '../../deepseek-harness/packages/session/session-persistence/lib/index.js'

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-native-')))
  const host = await kernelNativeHost(root, { executable: true })
  const commands = new NativeCommandEffects(host.ctx, { root: join(root, 'commands') })
  t.after(async () => { await commands.close(); await host.close(); await rm(root, { recursive: true, force: true }) })
  return { ...host, root, commands }
}

test('native root delivery is deduplicated using persisted messages, not followup return', { timeout: 30_000 }, async t => {
  const { ctx, parent, adapter, root } = await fixture(t)
  const workflow = { id: 'wf', root, rootSessionId: parent.agent.id }
  const notices = new NativeNotificationEffects(ctx, { read: async () => ({ workflows: { wf: workflow } }) }, join(root, 'notices'))
  const action = { id: 'notice-1', workflowId: 'wf', input: { rootSessionId: parent.agent.id, reason: 'technical_failure', detail: 'test' } }
  let result = await notices.deliver(action)
  await parent.agent.whenIdle()
  if (result.pending) result = await notices.deliver(action)
  assert.equal(result.persisted, true)
  assert.deepEqual(await notices.deliver(action), result)
  const stored = await readSessionEvents(ctx.sessionPersistence, parent.agent.id)
  assert.equal(stored.events.filter(event => event.type === 'user/message' && event.data.id === action.id).length, 1)
  assert.equal(adapter.calls, 1)
})

test('an offline root notice defers without replaying its full session history', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-offline-notice-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  let reads = 0
  const workflow = { id: 'wf', root, rootSessionId: 'old-root' }
  const ctx = {
    agents: { get: () => undefined },
    sessionPersistence: { open: () => { reads++; throw new Error('offline session must not be read') } },
  }
  const notices = new NativeNotificationEffects(ctx, { read: async () => ({ workflows: { wf: workflow } }) }, join(root, 'notices'))
  const action = { id: 'offline-notice', workflowId: 'wf', input: { rootSessionId: 'old-root', reason: 'workflow_terminal' } }
  assert.deepEqual(await notices.deliver(action), { deferred: true, reason: 'root_session_offline' })
  assert.equal(reads, 0)
})

test('native root receives the canonical workflow terminal status and revision', { timeout: 30_000 }, async t => {
  const { ctx, parent, root } = await fixture(t)
  const workflow = { id: 'wf', root, rootSessionId: parent.agent.id }
  const notices = new NativeNotificationEffects(ctx, { read: async () => ({ workflows: { wf: workflow } }) }, join(root, 'notices'))
  const detail = { contract: 'DSH_WORKFLOW_TERMINAL_NOTICE_V1', workflowId: 'wf', status: 'cancelled',
    terminal: true, revision: 17, updatedAt: 1234, planVersion: 2,
    counts: { totalTasks: 2, completedTasks: 1, failedTasks: 0, pendingTasks: 0, runningTasks: 0 } }
  const action = { id: 'terminal-notice', workflowId: 'wf',
    input: { rootSessionId: parent.agent.id, reason: 'workflow_terminal', detail } }

  let result = await notices.deliver(action)
  await parent.agent.whenIdle()
  if (result.pending) result = await notices.deliver(action)
  assert.equal(result.persisted, true)

  const stored = await readSessionEvents(ctx.sessionPersistence, parent.agent.id)
  const event = stored.events.find(event => event.type === 'user/message' && event.data.id === action.id)
  const message = JSON.parse(event.data.content[0].text)
  assert.equal(message.contract, 'DSH_WORKFLOW_NOTICE_V1')
  assert.equal(message.workflowId, 'wf')
  assert.equal(message.reason, 'workflow_terminal')
  assert.deepEqual(message.detail, detail)
})

test('a root session closing during notification becomes a durable offline wait without hiding persistence failures', { timeout: 30_000 }, async t => {
  const { ctx, parent, root } = await fixture(t)
  const workflow = { id: 'wf', root, rootSessionId: parent.agent.id }
  const notices = new NativeNotificationEffects(ctx, { read: async () => ({ workflows: { wf: workflow } }) }, join(root, 'notices'))
  const originalFlush = ctx.sessions.flush.bind(ctx.sessions)
  const originalFollowup = parent.agent.followup.bind(parent.agent)
  const action = { id: 'closing-notice', workflowId: 'wf',
    input: { rootSessionId: parent.agent.id, reason: 'workflow_terminal', detail: { status: 'completed' } } }
  parent.agent.followup = () => {}
  try {
    ctx.sessions.flush = async () => { throw new SessionHandleClosedError(parent.agent.id, 'flush') }
    const deferred = await notices.deliver(action)
    assert.deepEqual(deferred, { deferred: true, reason: 'root_session_offline' })

    ctx.sessions.flush = originalFlush
    parent.agent.followup = originalFollowup
    let replay = await notices.deliver(action)
    await parent.agent.whenIdle()
    if (replay.pending) replay = await notices.deliver(action)
    assert.equal(replay.persisted, true)
    const stored = await readSessionEvents(ctx.sessionPersistence, parent.agent.id)
    assert.equal(stored.events.filter(event => event.type === 'user/message' && event.data.id === action.id).length, 1)

    parent.agent.followup = () => {}
    ctx.sessions.flush = async () => { throw new SessionHandleClosedError('different-session', 'flush') }
    await assert.rejects(notices.deliver({ id: 'wrong-session-notice', workflowId: 'wf',
      input: { rootSessionId: parent.agent.id, reason: 'workflow_terminal', detail: { status: 'failed' } } }), /different-session/)

    ctx.sessions.flush = async () => { throw new Error('persistence disk failure') }
    await assert.rejects(notices.deliver({ id: 'broken-notice', workflowId: 'wf',
      input: { rootSessionId: parent.agent.id, reason: 'workflow_terminal', detail: { status: 'failed' } } }), /persistence disk failure/)
  } finally {
    ctx.sessions.flush = originalFlush
    parent.agent.followup = originalFollowup
  }
})

test('native fixed command proves managed-range exit and does not rerun a received command', { timeout: 30_000 }, async t => {
  const { root, commands } = await fixture(t)
  const cwd = join(root, 'candidate'); await mkdir(cwd)
  const request = { action: { id: 'verify-1', attemptId: 'try-1', input: {} }, verificationId: 'unit', cwd,
    argv: [process.execPath, '-e', "require('node:fs').appendFileSync('calls','x'); console.log('executed')"] }
  const result = await commands.execute(request)
  assert.equal(result.managedRangeStopped, true)
  assert.equal(result.terminationScope, 'dsh-managed-range')
  assert.equal(Object.hasOwn(result, 'writersStopped'), false, 'A native range receipt must not claim all writers stopped')
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.managedRangeStopped, true); assert.equal(result.enforcement, 'full')
  assert.deepEqual(await commands.execute(request), result)
  assert.equal(await readFile(join(cwd, 'calls'), 'utf8'), 'x')
})



test('action admission serializes competing hosts while allowing owned live commands in parallel', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-admission-race-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const running = []
  const ctx = { sandbox: { confine: argv => ({ argv, enforcement: 'full' }) }, subprocess: { spawn: () => {
    const done = Promise.withResolvers(); running.push(done)
    return { done: done.promise, terminate() {}, waitForExit: async () => true, collected: {} }
  } } }
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  let authorityChecks = 0
  const a = new NativeCommandEffects(ctx, { root: join(root, 'commands'), hostId: 'same-host',
    assertAuthority: async () => { if (++authorityChecks === 1) { entered.resolve(); await release.promise } } })
  const b = new NativeCommandEffects(ctx, { root: a.root, hostId: 'same-host' })
  const request = { action: { id: 'race', input: {} }, cwd: root, verificationId: 'one', argv: ['fixture'] }
  const first = a.execute(request)
  await entered.promise
  const independentStarted = Promise.withResolvers()
  const independent = b.execute({ ...request, action: { id: 'independent', input: {} }, verificationId: 'other', argv: ['independent'] })
  const originalFirst = running.length
  const deadline = setTimeout(() => independentStarted.reject(new Error('An unrelated Action was blocked by the catalog admission lock')), 250)
  const observeIndependent = async () => {
    while (running.length === originalFirst) await new Promise(resolve => setTimeout(resolve, 5))
    independentStarted.resolve()
  }
  const observed = observeIndependent()
  let independentError
  try { await independentStarted.promise } catch (error) { independentError = error } finally { clearTimeout(deadline) }
  if (independentError) {
    release.resolve()
    while (running.length < 2) await new Promise(resolve => setTimeout(resolve, 5))
    for (const done of running) done.resolve({ exitCode: 0 })
    await Promise.allSettled([first, independent, observed])
    throw independentError
  }
  const competing = assert.rejects(b.execute({ ...request, verificationId: 'two' }), { code: 'EXECUTION_UNCONFIRMED' })
  release.resolve()
  await competing
  assert.equal(running.length, 2, 'a different Action starts while the first admission is still gated')
  const ownParallel = a.execute({ ...request, verificationId: 'three' })
  while (running.length < 3) await new Promise(resolve => setTimeout(resolve, 10))
  for (const done of running) done.resolve({ exitCode: 0 })
  await observed
  assert.equal((await first).ok, true)
  assert.equal((await independent).ok, true)
  assert.equal((await ownParallel).ok, true)
  assert.equal((await a.stop(['race'])).managedRangeStopped, true)
})

test('failed command observation fences the next dispatch until its managed range is stopped', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-uncertain-command-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  let spawned = 0, rangeStopped = false
  const ctx = { sandbox: { confine: async argv => ({ argv, enforcement: 'full' }) }, subprocess: { spawn: () => {
    spawned++
    const done = spawned === 1 ? Promise.reject(new Error('Command observation failed')) : Promise.resolve({ exitCode: 0 })
    done.catch(() => {})
    return { done, terminate() {}, waitForExit: async () => spawned > 1 || rangeStopped, collected: {} }
  } } }
  const commands = new NativeCommandEffects(ctx, { root: join(root, 'commands') })
  const request = { action: { id: 'uncertain', input: {} }, cwd: root, verificationId: 'first', argv: ['fixture'] }
  await assert.rejects(commands.execute(request), /Command observation failed/)
  await assert.rejects(commands.execute({ ...request, verificationId: 'second' }), { code: 'EXECUTION_UNCONFIRMED' })
  assert.equal(spawned, 1)
  assert.equal((await commands.stop(['uncertain'])).managedRangeStopped, false)
  rangeStopped = true
  assert.equal((await commands.stop(['uncertain'])).managedRangeStopped, true)
  assert.equal((await commands.execute({ ...request, verificationId: 'second' })).ok, true)
  assert.equal(spawned, 2)
})





test('native read-only sandbox rejects an actual source write', { timeout: 30_000 }, async t => {
  const { root, commands } = await fixture(t)
  const cwd = join(root, 'candidate'); await mkdir(cwd)
  await writeFile(join(cwd, 'source'), 'original')
  const result = await commands.execute({ action: { id: 'read-1', attemptId: 'try-1', input: {} }, verificationId: 'read', cwd, mode: 'read-only',
    argv: [process.execPath, '-e', "console.log('command-started'); require('node:fs').writeFileSync('source','changed')"] })
  assert.match(result.stdout, /command-started/)
  assert.equal(result.ok, false)
  assert.equal(await readFile(join(cwd, 'source'), 'utf8'), 'original')
})

test('old and wrong-scope command receipts are not reused or promoted to termination proof', { timeout: 30_000 }, async t => {
  const { root, commands } = await fixture(t)
  const cwd = join(root, 'candidate'); await mkdir(cwd)
  const request = { action: { id: 'legacy-receipt', input: {} }, verificationId: 'unit', cwd,
    argv: [process.execPath, '-e', "require('node:fs').appendFileSync('calls','x')"] }
  const result = await commands.execute(request)
  const { managedRangeStopped, terminationScope, ...old } = result
  const receipt = join(root, 'commands', result.commandId, 'result.json')
  for (const stale of [{ ...old, writersStopped: true }, { ...result, terminationScope: 'all-processes' }]) {
    await writeFile(receipt, JSON.stringify(stale))
    await assert.rejects(commands.execute(request), { code: 'EXECUTION_UNCONFIRMED' })
    assert.equal((await commands.stop([request.action.id])).managedRangeStopped, false)
    assert.equal(await readFile(join(cwd, 'calls'), 'utf8'), 'x')
  }
})

test('native termination covers a helper that outlives the command leader', { timeout: 30_000 }, async t => {
  const { root, commands } = await fixture(t)
  const cwd = join(root, 'candidate'); await mkdir(cwd)
  const helper = "const fs=require('node:fs'); fs.appendFileSync('ticks','x'); setInterval(()=>fs.appendFileSync('ticks','x'),20)"
  const leader = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(helper)}],{stdio:'ignore'}).unref(); setTimeout(()=>process.exit(0),150)`
  const result = await commands.execute({ action: { id: 'helpers', attemptId: 'try', input: {} }, verificationId: 'helper', cwd, argv: [process.execPath, '-e', leader] })
  assert.equal(result.managedRangeStopped, true)
  const before = await readFile(join(cwd, 'ticks'), 'utf8'); assert.ok(before.length > 0)
  await new Promise(resolve => setTimeout(resolve, 200))
  assert.equal(await readFile(join(cwd, 'ticks'), 'utf8'), before)
})

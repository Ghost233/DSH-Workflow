import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './helpers.mjs'

test('native Bash escalation is allowed once only under the selected preset and matching fixed rules', async t => {
  const f = await fixture(t)
  const result = await f.execute()
  assert.equal(result.isError, false, JSON.stringify(result))
  assert.match(JSON.stringify(result.content), /v\d+\./)
  assert.equal(f.manual.length, 0)
  const events = f.agent.session.snapshotEvents()
  assert.equal(events.filter(event => event.type === 'approval/asked').length, 1)
  assert.equal(events.find(event => event.type === 'approval/decided').data.outcome, 'allowed-once')
  assert.equal(f.ctx.sandboxPolicy.resolve({ session: f.agent.session }).mode, 'workspace-write')
  f.ctx.permissionPresets.set(f.agent.session, 'workspace-write')
  const denied = await f.execute()
  assert.equal(denied.isError, true)
  assert.equal(f.manual.length, 1)
})

test('unmatched commands and unassociated approval requests reach the native human fallback', async t => {
  const f = await fixture(t)
  assert.equal((await f.execute('pwd')).isError, true)
  assert.equal(f.manual.length, 1)
  const outcome = await f.ctx.approval.request({ agent: f.agent, toolName: 'bash',
    reason: 'escalate sandbox to danger-full-access: Inspect the installed tool version.' })
  assert.equal(outcome, 'rejected')
  assert.equal(f.manual.length, 2)
})

test('native settings preserve user configuration, reject invalid prefixes and apply changed rules immediately', async t => {
  const f = await fixture(t)
  const before = f.ctx.settings.describe().find(item => item.ns === 'approve-for-me')
  assert.ok(before)
  await assert.rejects(f.ctx.settings.mutate('approve-for-me', [{ op: 'set', path: ['rules','commandPrefixes'],
    value: [{ tool: 'shell', prefix: 'node && rm' }] }], before.revision))
  await f.ctx.settings.mutate('approve-for-me', [{ op: 'set', path: ['rules','commandPrefixes'], value: [] }], before.revision)
  assert.equal((await f.execute()).isError, true)
  assert.equal(f.manual.length, 1)
})

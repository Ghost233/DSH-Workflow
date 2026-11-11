import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Coordination } from '../src/coordination.mjs'
import { CoordinationRuntime } from '../src/runtime.mjs'

async function fixture(t, repositories = ['owner/front', 'owner/back']) {
  const directory = await mkdtemp(join(tmpdir(), 'project-groups-'))
  const members = [{ bot: 'boss', role: 'principal' }, ...repositories.map((repository, i) =>
    ({ bot: `manager-${i}`, role: 'manager', parent: 'boss', repository }))]
  const service = new Coordination({ path: join(directory, 'state.sqlite'), configuration: {
    members, repositories: repositories.map((repository, i) => ({ repository, manager: `manager-${i}` })),
  } })
  const sections = [], calls = [], channels = members.map(member => ({ id: `dm-${member.bot}`, type: 'dm', botSlug: member.bot }))
  const core = { channels: { list: () => channels }, roster: {
    snapshot: () => ({ sections: structuredClone(sections), pins: ['dm-boss'], hidden: ['unrelated'] }),
    sectionCreate: async name => { const row = { id: `section-${sections.length}`, name, channelIds: [] }; sections.push(row); calls.push('create'); return structuredClone(row) },
    channelAssign: async (channel, id) => {
      calls.push('assign')
      for (const row of sections) row.channelIds = row.channelIds.filter(value => value !== channel)
      sections.find(row => row.id === id).channelIds.push(channel)
    },
  } }
  const runtime = new CoordinationRuntime({ service, core })
  t.after(async () => { await runtime.close(); service.close(); await rm(directory, { recursive: true, force: true }) })
  return { service, runtime, core, sections, channels, calls }
}

test('project onboarding reuses its folder and gathers current and newly created specialists', async t => {
  const f = await fixture(t)
  f.sections.push({ id: 'user-folder', name: 'front', channelIds: ['unrelated-channel'] })
  for (const repository of f.service.configuration.repositories) await f.runtime.ensureProjectGroup(repository)
  assert.deepEqual(f.sections.map(row => row.name), ['front', 'back'])
  assert.deepEqual(f.sections[0].channelIds, ['unrelated-channel', 'dm-manager-0'])
  assert.ok(!f.sections.flatMap(row => row.channelIds).includes('dm-boss'))
  f.service.store.put('member', 'specialist', { bot: 'specialist', parent: 'manager-0', role: 'executor', repository: 'owner/front' })
  f.channels.push({ id: 'dm-specialist', type: 'dm', botSlug: 'specialist' })
  for (const repository of f.service.configuration.repositories) await f.runtime.ensureProjectGroup(repository)
  assert.ok(f.sections[0].channelIds.includes('dm-specialist'))
  assert.equal(f.calls.filter(value => value === 'create').length, 1)
  const calls = f.calls.length
  for (const repository of f.service.configuration.repositories) await f.runtime.ensureProjectGroup(repository)
  assert.equal(f.calls.length, calls, 'a settled team does not rewrite the roster')
  f.sections[0].name = 'My frontend project'
  await f.runtime.ensureProjectGroup(f.service.configuration.repositories[0])
  assert.equal(f.sections[0].name, 'My frontend project', 'the persisted section identity preserves user renames')
})

test('same-named repositories from different owners receive distinct project folders', async t => {
  const f = await fixture(t, ['alice/app', 'bob/app'])
  for (const repository of f.service.configuration.repositories) await f.runtime.ensureProjectGroup(repository)
  assert.deepEqual(f.sections.map(row => row.name), ['alice/app', 'bob/app'])
  assert.deepEqual(f.sections.map(row => row.channelIds), [['dm-manager-0'], ['dm-manager-1']])
})

test('a failed channel move retries the existing section without creating another folder', async t => {
  const f = await fixture(t, ['owner/front'])
  const assign = f.core.roster.channelAssign
  let failed = false
  f.core.roster.channelAssign = async (...args) => { if (!failed) { failed = true; throw Error('temporarily unavailable') }; return assign(...args) }
  await assert.rejects(f.runtime.ensureProjectGroup(f.service.configuration.repositories[0]), /temporarily/)
  await f.runtime.ensureProjectGroup(f.service.configuration.repositories[0])
  assert.equal(f.sections.length, 1)
  assert.deepEqual(f.sections[0].channelIds, ['dm-manager-0'])
})

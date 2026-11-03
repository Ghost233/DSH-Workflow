import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkSuperagentBinding, saveSuperagentBinding } from './superagent-binding.mjs'

test('historical tasks cannot resume under a different project or bot identity', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'superagent-binding-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const project = { name: 'A', repository: 'owner/a', githubLogin: 'alice', localProjectDir: '/a', executionRoot: '/work', prepare: 'clone' }
  const accounts = { github: '/gh-alice', feishu: '/bot-a', feishuAppId: 'cli_a', prepare: 'clone' }
  const check = (value, hasTickets) => checkSuperagentBinding({ directory, project: value, accounts, hasTickets })
  await assert.rejects(check(project, true), /已有任务历史/)
  await saveSuperagentBinding(directory, await check(project, false))
  assert.equal(await check({ ...project, name: 'renamed', executionEnabled: false }, true), await check(project, true))
  await assert.rejects(check({ ...project, repository: 'owner/b' }, true), /已有任务历史/)
  await assert.rejects(checkSuperagentBinding({ directory, project, accounts: { ...accounts, feishuAppId: 'cli_b' }, hasTickets: true }), /已有任务历史/)
  await assert.rejects(check({ ...project, localProjectDir: '/different' }, true), /已有任务历史/)
  assert.notEqual(await check({ ...project, repository: 'owner/b' }, false), await check(project, true))
})

test('preserves the existing binding fingerprint for projects without a Feishu profile', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'superagent-binding-legacy-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const project = { repository: 'owner/a', githubLogin: 'alice', ghConfigDir: '/gh', feishuConfigDir: '/lark',
    localProjectDir: '/project', executionRoot: '/tasks', prepare: 'clone', feishuChatId: 'oc_a' }
  const accounts = { github: '/gh-wrapper', feishu: '/lark-wrapper', feishuAppId: 'cli_a', prepare: '/prepare-wrapper' }
  const keys = ['repository', 'githubLogin', 'ghConfigDir', 'ghExecutable', 'feishuConfigDir', 'larkExecutable',
    'localProjectDir', 'executionRoot', 'prepare', 'authorName', 'authorEmail', 'feishuChatId']
  const original = createHash('sha256').update(JSON.stringify([
    ...keys.map(key => project[key] ?? ''), accounts.github, accounts.feishu, accounts.feishuAppId, accounts.prepare,
  ])).digest('hex')
  await saveSuperagentBinding(directory, original)
  assert.equal(await checkSuperagentBinding({ directory, project: { ...project, feishuProfile: '' }, accounts, hasTickets: true }), original)
  await assert.rejects(checkSuperagentBinding({ directory, project: { ...project, feishuProfile: 'cli_b' }, accounts, hasTickets: true }), /已有任务历史/)
})


test('short runtime directory upgrade preserves historical bindings but still rejects changed identities', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'superagent-binding-runtime-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const project = { repository: 'owner/a', githubLogin: 'alice', feishuConfigDir: '/original', feishuProfile: 'cli_a' }
  const old = { github: '/gh', feishu: '/previous-wrapper', feishuAppId: 'cli_a', prepare: '' }
  const check = (p, accounts, hasTickets) => checkSuperagentBinding({ directory, project: p, accounts, hasTickets })
  await saveSuperagentBinding(directory, await check(project, old, false))
  const next = { ...old, feishu: '/short-directory-wrapper', previousFeishu: old.feishu }
  const upgraded = await check(project, next, true)
  assert.notEqual(upgraded, await check(project, old, true))
  await assert.rejects(check({ ...project, repository: 'owner/b' }, next, true), /已有任务历史/)
  await assert.rejects(check({ ...project, feishuProfile: 'cli_b' }, next, true), /已有任务历史/)
  await assert.rejects(check(project, { ...next, feishuAppId: 'cli_b' }, true), /已有任务历史/)
  await saveSuperagentBinding(directory, upgraded)
  assert.equal(await check(project, next, true), upgraded)
})

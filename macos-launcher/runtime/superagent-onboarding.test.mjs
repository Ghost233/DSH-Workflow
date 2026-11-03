import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { feishuChoices, githubDiscovery, inspectLocalProject } from './superagent-onboarding.mjs'

test('repository discovery uses only the selected gh account and never returns its token', async t => {
  const root = await mkdtemp(join(tmpdir(), 'onboarding-gh-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const account = { login: 'alice', directory: root }, calls = []
  const run = async (_command, args, options) => {
    calls.push({ args, env: options.env })
    if (args[0] === 'auth') return { stdout: 'fixture-secret\n' }
    assert.equal(options.env.GH_CONFIG_DIR, root)
    assert.equal(options.env.GH_TOKEN, 'fixture-secret')
    if (args[1] === 'user') return { stdout: JSON.stringify({ login: 'alice', id: 123 }) }
    if (args.at(-1).startsWith('user/repos')) return { stdout: JSON.stringify([[{ full_name: 'owner/private', private: true,
      default_branch: 'main', permissions: { push: true } }, { full_name: 'owner/read', default_branch: 'main', permissions: { push: false } }]]) }
    return { stdout: JSON.stringify([[{ name: 'main' }, { name: 'develop' }]]) }
  }
  const result = await githubDiscovery({ account, action: 'repositories', accounts: [account], run })
  assert.deepEqual(result.repositories.map(row => row.name), ['owner/private'])
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret/)
  assert.deepEqual((await githubDiscovery({ account, action: 'branches', repository: 'owner/private', accounts: [account], run })).branches, ['main', 'develop'])
  assert.ok(calls.some(row => row.args.includes('--user') && row.args.includes('alice')))
  await assert.rejects(githubDiscovery({ account: { ...account, login: 'bob' }, action: 'repositories', accounts: [account], run }), /请选择/)
})

test('selecting a local project checks its remote without modifying uncommitted files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'onboarding-project-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  execFileSync('git', ['init', '-q', root])
  execFileSync('git', ['-C', root, 'remote', 'add', 'origin', 'git@github.com:Owner/Repo.git'])
  await writeFile(join(root, 'uncommitted.txt'), 'keep')
  assert.equal((await inspectLocalProject({ directory: root, repository: 'owner/repo' })).matches, true)
  await assert.rejects(inspectLocalProject({ directory: root, repository: 'other/repo' }), /不是该 GitHub 仓库/)
  assert.equal(await readFile(join(root, 'uncommitted.txt'), 'utf8'), 'keep')
})

test('bot chat and member selectors use the bot identity and return display names with IDs', async t => {
  const root = await mkdtemp(join(tmpdir(), 'onboarding-feishu-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'bin')); await mkdir(join(root, 'bot'))
  await writeFile(join(root, 'bin/lark-cli'), '#!/bin/sh\n'); await chmod(join(root, 'bin/lark-cli'), 0o700)
  const bot = { directory: join(root, 'bot'), profile: 'bot-a', executable: '@bundled' }
  const previous = process.env.LARKSUITE_CLI_APP_ID
  process.env.LARKSUITE_CLI_APP_ID = 'wrong-global-app'
  t.after(() => { if (previous === undefined) delete process.env.LARKSUITE_CLI_APP_ID; else process.env.LARKSUITE_CLI_APP_ID = previous })
  const run = async (_command, args, options) => {
    assert.equal(options.env.LARKSUITE_CLI_PROFILE, 'bot-a')
    assert.equal(options.env.LARKSUITE_CLI_APP_ID, undefined)
    assert.ok(args.includes('--as') && args.includes('bot'))
    assert.equal(args[args.indexOf('--page-limit') + 1], '1000')
    return { stdout: JSON.stringify({ ok: true, data: args.includes('+chat-list')
      ? { chats: [{ chat_id: 'oc_one', name: '项目群' }] }
      : { users: [{ member_id: 'ou_alice', name: 'Alice' }] }, meta: { pagination: { complete: false } } }) }
  }
  const chats = await feishuChoices({ resources: root, bot, action: 'chats', run })
  assert.deepEqual(chats.chats, [{ id: 'oc_one', name: '项目群' }])
  assert.equal(chats.truncated, true)
  assert.deepEqual((await feishuChoices({ resources: root, bot, action: 'members', chatId: 'oc_one', run })).members, [{ id: 'ou_alice', name: 'Alice' }])
  const checkRun = async (_command, args, options) => {
    assert.equal(options.env.LARKSUITE_CLI_PROFILE, 'bot-a')
    assert.ok(args.includes('--as') && args.includes('bot'))
    return { stdout: JSON.stringify({ ok: true, data: args.includes('+chat-list')
      ? { chats: [{ chat_id: 'oc_one', name: '项目群' }] } : { items: [{ body: { content: 'private group content' } }] } }) }
  }
  const check = await feishuChoices({ resources: root, bot, action: 'check', chatId: 'oc_one', run: checkRun })
  assert.equal(check.joined, true); assert.equal(check.historyReadable, true)
  assert.equal(check.eventSubscription, 'unverified')
  assert.doesNotMatch(JSON.stringify(check), /private group content/)
  const denied = await feishuChoices({ resources: root, bot, action: 'check', chatId: 'oc_one', run: async (cmd, args, options) => {
    if (args.includes('+chat-messages-list')) throw new Error('missing scope')
    return checkRun(cmd, args, options)
  } })
  assert.equal(denied.historyReadable, false)
  await assert.rejects(feishuChoices({ resources: root, bot, action: 'members', chatId: '../bad', run }), /请选择飞书群/)
})

test('resolves placeholder member names when the bot can read user profiles and keeps IDs otherwise', async t => {
  const root = await mkdtemp(join(tmpdir(), 'onboarding-member-name-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'bin')); await mkdir(join(root, 'bot'))
  await writeFile(join(root, 'bin/lark-cli'), '#!/bin/sh\n'); await chmod(join(root, 'bin/lark-cli'), 0o700)
  const bot = { directory: join(root, 'bot'), profile: 'bot-a', executable: '@bundled' }
  const run = async (_command, args) => ({ stdout: JSON.stringify(args.includes('+chat-members-list')
    ? { ok: true, data: { users: [{ member_id: 'ou_one', name: '用户441369' }, { member_id: 'ou_two', name: '' }] } }
    : args.includes('ou_one') ? { ok: true, data: { name: 'Ghost233' } } : { ok: true, data: { open_id: 'ou_two' } }) })
  const value = await feishuChoices({ resources: root, bot, action: 'members', chatId: 'oc_one', run })
  assert.deepEqual(value.members, [{ id: 'ou_one', name: 'Ghost233' }, { id: 'ou_two', name: 'ou_two' }])
  assert.equal(value.namesIncomplete, true)
})

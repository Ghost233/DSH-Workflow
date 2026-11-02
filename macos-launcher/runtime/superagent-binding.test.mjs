import test from 'node:test'
import assert from 'node:assert/strict'
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

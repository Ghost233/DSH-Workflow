import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { applySuperagentProjectSettings } from './superagent-runtime-settings.mjs'

test('applies each project account and execution settings through the Superagent management interface', async t => {
  const blocks = {
    eval: { revision: 0, value: { mode: 'observe', timeoutSeconds: 120, model: null } },
    policy: { revision: 0, value: { rules: [], sources: {} } },
    executor: { revision: 0, value: { directory: '', prepare: '', maxWorkers: 3, blockedCommands: [] } },
  }
  const sources = [
    { id: 'github', installed: true, revision: 0, value: { enabled: true, config: { repository: '', cli: '', observeIssues: false } } },
    { id: 'feishu', installed: true, revision: 0, value: { enabled: false, config: { cli: '', chats: [] } } },
  ]
  let paused, bindingSaved = false, feishuChecks = 0
  const server = createServer(async (req, res) => {
    const path = req.url.replace('/orchestrator/api/', '')
    const answer = value => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)) }
    if (req.method === 'GET' && path === 'settings') return answer({ blocks, sources })
    if (req.method === 'GET' && path === 'state') {
      const feishu = sources[1].value.enabled && ++feishuChecks > 2 ? { botId: 'ou_bot', appId: 'cli_fixture' } : null
      return answer({ setup: { accounts: { agent: 'alice', repository: 'owner/a', feishu } }, health: { runtime: { state: 'ready' } } })
    }
    let text = ''; for await (const chunk of req) text += chunk
    const input = JSON.parse(text)
    if (path === 'executor/pause') { assert.equal(bindingSaved, true); paused = input.paused; return answer({ paused }) }
    const name = decodeURIComponent(path.slice('settings/'.length))
    const target = name.startsWith('source:') ? sources.find(row => row.id === name.slice(7)) : blocks[name]
    assert.equal(input.revision, target.revision)
    target.value = input.value; target.revision++
    answer({ saved: true, revision: target.revision, restarting: name === 'source:feishu' })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}`
  await applySuperagentProjectSettings({ url, project: { repository: 'owner/a', githubLogin: 'alice', executionRoot: '/tmp/work',
    policyManaged: true, feishuListen: 'all', acceptMode: 'auto', acceptRules: [{ id: 'bug', name: 'Bug', enabled: true, instruction: 'Fix clear project bugs; ignore chat.' }],
    prepare: 'prepare fixture', executionEnabled: true, githubAllowed: 'alice,bob', feishuChatId: 'oc_chat', feishuAllowedId: 'ou_alice' },
  accounts: { github: '/tmp/gh-a', feishu: '/tmp/lark-a', feishuAppId: 'cli_fixture' }, beforeResume: async () => { bindingSaved = true } })
  assert.equal(sources[0].value.config.repository, 'owner/a')
  assert.equal(sources[0].value.config.cli, '/tmp/gh-a')
  assert.equal(sources[1].value.config.cli, '/tmp/lark-a')
  assert.equal(sources[1].value.enabled, true)
  assert.deepEqual(sources[1].value.config.chats, [{ chatId: 'oc_chat', listen: 'all' }])
  assert.equal(blocks.eval.value.mode, 'auto')
  assert.equal(blocks.policy.value.rules[0].id, 'bug')
  assert.equal(blocks.policy.value.sources.feishu.admission.oc_chat.listedUnaddressed, 'inferred')
  assert.deepEqual(blocks.policy.value.sources.github.allowed, [{ id: 'alice' }, { id: 'bob' }])
  assert.deepEqual(blocks.policy.value.sources.feishu.allowed, [{ id: 'ou_alice' }])
  assert.equal(blocks.executor.value.directory, '/tmp/work')
  assert.equal(blocks.executor.value.prepare, 'prepare fixture')
  assert.equal(paused, false)
  const revisions = JSON.stringify({ blocks, sources })
  await applySuperagentProjectSettings({ url, project: { repository: 'owner/a', githubLogin: 'alice', executionRoot: '/tmp/work',
    policyManaged: true, feishuListen: 'all', acceptMode: 'auto', acceptRules: [{ id: 'bug', name: 'Bug', enabled: true, instruction: 'Fix clear project bugs; ignore chat.' }],
    prepare: 'prepare fixture', executionEnabled: true, githubAllowed: 'alice,bob', feishuChatId: 'oc_chat', feishuAllowedId: 'ou_alice' },
    accounts: { github: '/tmp/gh-a', feishu: '/tmp/lark-a', feishuAppId: 'cli_fixture' } })
  assert.equal(JSON.stringify({ blocks, sources }), revisions)
  await applySuperagentProjectSettings({ url, project: { repository: 'owner/a', githubLogin: 'alice', executionRoot: '/tmp/work',
    policyManaged: true,
    prepare: 'prepare fixture', executionEnabled: false, githubAllowed: '', feishuChatId: '', feishuAllowedId: '' },
  accounts: { github: '/tmp/gh-a', feishu: '/tmp/lark-a', feishuAppId: 'cli_fixture' } })
  assert.deepEqual(sources[1].value.config.chats, [])
  assert.deepEqual(blocks.policy.value.sources.github.allowed, [])
  assert.deepEqual(blocks.policy.value.sources.feishu.allowed, [])
  assert.equal(paused, true)
  blocks.policy.value.sources.github.allowed = [{ id: 'legacy-user' }]
  blocks.policy.value.sources.feishu.allowed = [{ id: 'ou_legacy' }]
  sources[1].value.config.chats = [{ chatId: 'oc_legacy', listen: 'all' }]
  await applySuperagentProjectSettings({ url, project: { legacy: true, preserveLegacyPolicy: true, repository: 'owner/a', githubLogin: 'alice',
    executionRoot: '/tmp/work', prepare: 'prepare fixture', executionEnabled: false },
  accounts: { github: '/tmp/gh-a', feishu: '/tmp/lark-a', feishuAppId: 'cli_fixture' } })
  assert.deepEqual(blocks.policy.value.sources.github.allowed, [{ id: 'legacy-user' }])
  assert.deepEqual(blocks.policy.value.sources.feishu.allowed, [{ id: 'ou_legacy' }])
  assert.equal(sources[1].value.config.chats[0].chatId, 'oc_legacy')
  assert.equal(sources[1].value.config.chats[0].listen, 'all')
  assert.equal(blocks.eval.value.mode, 'auto')
  assert.equal(blocks.policy.value.rules[0].id, 'bug')
  await applySuperagentProjectSettings({ url, project: { repository: 'owner/a', githubLogin: 'alice',
    executionRoot: '/tmp/work', prepare: 'prepare fixture', githubAllowed: 'overwrite', feishuChatId: 'oc_chat', feishuAllowedId: 'ou_overwrite' },
    accounts: { github: '/tmp/gh-a', feishu: '/tmp/lark-a', feishuAppId: 'cli_fixture' } })
  assert.deepEqual(blocks.policy.value.sources.github.allowed, [{ id: 'legacy-user' }])
  assert.deepEqual(blocks.policy.value.sources.feishu.allowed, [{ id: 'ou_legacy' }])
  assert.deepEqual(sources[1].value.config.chats, [{ chatId: 'oc_legacy', listen: 'all' }])
})

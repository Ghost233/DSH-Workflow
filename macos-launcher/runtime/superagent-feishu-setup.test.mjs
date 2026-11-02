import test from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listFeishuBots, registerFeishuBot } from './superagent-feishu-setup.mjs'

test('QR setup keeps credentials in a new bot-only configuration and emits no secrets', async t => {
  const root = await mkdtemp(join(tmpdir(), 'feishu-qr-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resources = join(root, 'resources'), dataRoot = join(root, 'data')
  await mkdir(join(resources, 'bin'), { recursive: true }); await mkdir(dataRoot, { mode: 0o700 })
  const cli = join(resources, 'bin/lark-cli')
  await writeFile(cli, '#!/bin/sh\nprintf "https://open.feishu.cn/page/cli?user_code=fixture\\n" >&2\n'); await chmod(cli, 0o700)
  const previous = process.env.LARKSUITE_CLI_APP_ID
  process.env.LARKSUITE_CLI_APP_ID = 'wrong-global-app'
  t.after(() => { if (previous === undefined) delete process.env.LARKSUITE_CLI_APP_ID; else process.env.LARKSUITE_CLI_APP_ID = previous })
  const events = [], calls = [], input = new PassThrough()
  const run = async (_cli, args, options) => {
    calls.push({ args, env: options.env })
    if (args.join(' ') === 'auth status --json') return { stdout: JSON.stringify({ appId: 'cli_fixture', identities: { bot: { status: 'ready' } } }) }
    return { stdout: 'strict-mode: bot\n' }
  }
  const bot = await registerFeishuBot({ dataRoot, resources, input, run, emit: row => events.push(row) })
  assert.equal(events[0].type, 'qr')
  assert.match(events[0].url, /^https:\/\/open\.feishu\.cn\/page\/cli\?/)
  assert.equal(bot.appId, 'cli_fixture')
  assert.equal(bot.profile, 'cli_fixture')
  assert.equal(bot.executable, '@bundled')
  assert.ok(bot.directory.startsWith(join(dataRoot, 'superagent-feishu') + '/'))
  assert.ok(calls.some(row => row.args.join(' ') === 'config strict-mode bot'))
  assert.ok(calls.every(row => row.env.LARKSUITE_CLI_CONFIG_DIR === bot.directory))
  assert.ok(calls.every(row => row.env.LARKSUITE_CLI_APP_ID === undefined))
  assert.doesNotMatch(JSON.stringify({ events, bot }), /appSecret|accessToken/)
  input.destroy()
})

test('bot discovery preserves other configurations and marks unrestricted profiles unavailable', async t => {
  const root = await mkdtemp(join(tmpdir(), 'feishu-list-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resources = join(root, 'resources'), dataRoot = join(root, 'data')
  await mkdir(join(resources, 'bin'), { recursive: true }); await mkdir(join(dataRoot, 'superagent-feishu/one'), { recursive: true, mode: 0o700 })
  await writeFile(join(resources, 'bin/lark-cli'), '#!/bin/sh\n'); await chmod(join(resources, 'bin/lark-cli'), 0o700)
  const run = async (_cli, args, options) => {
    if (!options.env.LARKSUITE_CLI_CONFIG_DIR.startsWith(dataRoot)) throw new Error('not a fixture')
    if (args.join(' ') === 'profile list') return { stdout: JSON.stringify([{ name: 'bot-a', appId: 'cli_a' }]) }
    if (args[0] === 'auth') return { stdout: JSON.stringify({ appId: 'cli_a', identities: { bot: { status: 'ready' } } }) }
    return { stdout: 'strict-mode: off\n' }
  }
  const result = await listFeishuBots({ dataRoot, resources, run })
  assert.equal(result.bots.length, 1)
  assert.equal(result.bots[0].ready, false)
  assert.deepEqual(await readdir(join(dataRoot, 'superagent-feishu')), ['one'])
})

test('cancelling QR registration terminates the CLI and keeps its isolated configuration', async t => {
  const root = await mkdtemp(join(tmpdir(), 'feishu-cancel-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const resources = join(root, 'resources'), dataRoot = join(root, 'data')
  await mkdir(join(resources, 'bin'), { recursive: true }); await mkdir(dataRoot, { mode: 0o700 })
  const cli = join(resources, 'bin/lark-cli')
  await writeFile(cli, '#!/bin/sh\nprintf "https://open.feishu.cn/page/cli?user_code=fixture\\n" >&2\nexec /bin/sleep 30\n')
  await chmod(cli, 0o700)
  const input = new PassThrough(); input.resume()
  await assert.rejects(registerFeishuBot({ dataRoot, resources, input, emit: () => input.end() }), /已取消/)
  assert.equal((await readdir(join(dataRoot, 'superagent-feishu'))).length, 1)
})

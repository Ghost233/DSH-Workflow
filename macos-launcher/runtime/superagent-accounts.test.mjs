import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareSuperagentAccounts } from './superagent-accounts.mjs'

test('each project selects its own gh account and bot configuration without changing global state', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-accounts-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const ghDir = join(root, 'gh-profile'), larkDir = join(root, 'lark-profile'), directory = join(root, 'project')
  for (const path of [ghDir, larkDir, directory]) await mkdir(path, { mode: 0o700 })
  const gh = join(root, 'fake-gh'), lark = join(root, 'fake-lark')
  await writeFile(gh, '#!/bin/sh\nif [ "$1 $2" = "auth token" ]; then printf "fixture-token-%s" "$6"; elif [ -z "$GH_TOKEN" ]; then printf alice; else printf "%s|%s" "$GH_CONFIG_DIR" "$GH_TOKEN"; fi\n')
  await writeFile(lark, '#!/bin/sh\nif [ "$1 $2" = "auth status" ]; then printf \'{"appId":"cli_fixture","identities":{"bot":{"status":"ready"}}}\'; else printf "%s" "$LARKSUITE_CLI_CONFIG_DIR"; fi\n')
  await chmod(gh, 0o700); await chmod(lark, 0o700)
  const result = await prepareSuperagentAccounts({ directory, project: { githubLogin: 'alice', ghConfigDir: ghDir,
    ghExecutable: gh, feishuConfigDir: larkDir, larkExecutable: lark } })
  const env = { ...process.env, GH_TOKEN: 'wrong-global-token', GITHUB_TOKEN: 'wrong-global-token' }
  const github = spawnSync(result.github, ['api', 'user'], { env, encoding: 'utf8' })
  assert.equal(github.status, 0)
  assert.equal(github.stdout, `${ghDir}|fixture-token-alice`)
  const feishu = spawnSync(result.feishu, ['probe'], { env, encoding: 'utf8' })
  assert.equal(feishu.status, 0)
  assert.equal(feishu.stdout, larkDir)
  assert.equal(result.feishuAppId, 'cli_fixture')
  assert.doesNotMatch(await readFile(result.github, 'utf8'), /fixture-token/)
  await assert.rejects(prepareSuperagentAccounts({ directory, project: { githubLogin: 'bob', ghConfigDir: ghDir, ghExecutable: gh } }), /活动账号/)
})

test('sets the chosen Git author only inside the new task repository', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-author-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const ghDir = join(root, 'gh'), directory = join(root, 'project'), task = join(root, 'task')
  await mkdir(ghDir); await mkdir(directory)
  const gh = join(root, 'fake-gh')
  await writeFile(gh, '#!/bin/sh\nif [ "$1 $2" = "api user" ]; then printf alice; else printf fixture-token; fi\n'); await chmod(gh, 0o700)
  const result = await prepareSuperagentAccounts({ directory, project: { githubLogin: 'alice', ghConfigDir: ghDir,
    ghExecutable: gh, prepare: 'mkdir -p "$DSH_SUPERAGENT_DIR" && git -C "$DSH_SUPERAGENT_DIR" init -q',
    authorName: 'Alice Example', authorEmail: 'alice@example.invalid' } })
  const run = spawnSync('/bin/sh', ['-c', result.prepare], { env: { ...process.env, DSH_SUPERAGENT_DIR: task }, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(spawnSync('git', ['-C', task, 'config', '--local', 'user.name'], { encoding: 'utf8' }).stdout.trim(), 'Alice Example')
  assert.equal(spawnSync('git', ['-C', task, 'config', '--local', 'user.email'], { encoding: 'utf8' }).stdout.trim(), 'alice@example.invalid')
})

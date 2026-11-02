import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { feishuEventPaths, protectedProjectPaths, superagentSandboxArguments } from './superagent-sandbox.mjs'

test('a Superagent Host cannot change the selected project or its Git data', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-sandbox-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const project = join(root, 'project with spaces'), work = join(root, 'work'), alias = join(root, 'alias'), other = join(root, 'other-project')
  await mkdir(project); await mkdir(work); await mkdir(other); await symlink(project, alias)
  execFileSync('git', ['init', '-q', project])
  await writeFile(join(project, 'uncommitted.txt'), 'original')
  await writeFile(join(other, 'uncommitted.txt'), 'other original')
  const paths = await protectedProjectPaths(project, work)
  const script = 'printf changed > "$1/uncommitted.txt" 2>/dev/null; printf changed > "$2/uncommitted.txt" 2>/dev/null; printf changed > "$1/.git/probe" 2>/dev/null; printf changed > "$4/uncommitted.txt" 2>/dev/null; printf ok > "$3/result"'
  const result = spawnSync('/usr/bin/sandbox-exec', [...superagentSandboxArguments(paths, [await realpath(work)]), '--', '/bin/sh', '-c', script,
    'fixture', project, alias, work, other], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(await readFile(join(project, 'uncommitted.txt'), 'utf8'), 'original')
  assert.equal(await readFile(join(other, 'uncommitted.txt'), 'utf8'), 'other original')
  await assert.rejects(lstat(join(project, '.git/probe')), { code: 'ENOENT' })
  assert.equal(await readFile(join(work, 'result'), 'utf8'), 'ok')
})

test('allows only the shared credential store and its atomic-write files outside task directories', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-credential-sandbox-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const project = join(root, 'project'), work = join(root, 'work'), daily = join(root, 'daily')
  await mkdir(project); await mkdir(work); await mkdir(daily)
  execFileSync('git', ['init', '-q', project])
  const paths = await protectedProjectPaths(project, work)
  const credential = join(await realpath(daily), '.credentials.yaml')
  const script = 'printf lock > "$1.lock"; printf temp > "$1.012345abcdef.tmp"; printf secret > "$1"; printf bad > "$2/other" 2>/dev/null; printf ok > "$3/result"'
  const result = spawnSync('/usr/bin/sandbox-exec', [...superagentSandboxArguments(paths, [await realpath(work)], { credential }),
    '--', '/bin/sh', '-c', script, 'fixture', credential, daily, work], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(await readFile(credential, 'utf8'), 'secret')
  assert.equal(await readFile(`${credential}.lock`, 'utf8'), 'lock')
  assert.equal(await readFile(`${credential}.012345abcdef.tmp`, 'utf8'), 'temp')
  await assert.rejects(lstat(join(daily, 'other')), { code: 'ENOENT' })
})

test('startup pause host cannot run a previously configured CLI or shell', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-bootstrap-sandbox-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const project = join(root, 'project'), work = join(root, 'work')
  await mkdir(project); await mkdir(work)
  execFileSync('git', ['init', '-q', project])
  const paths = await protectedProjectPaths(project, work), node = await realpath(process.execPath)
  const program = `const { spawnSync } = require('node:child_process');
const child = spawnSync('/bin/sh', ['-c', 'printf unsafe']);
process.stdout.write(child.error ? child.error.code : String(child.status));`
  const result = spawnSync('/usr/bin/sandbox-exec', [...superagentSandboxArguments(paths, [await realpath(work)], { onlyExecutable: node }),
    '--', node, '-e', program], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'EPERM')
})

test('allows only the selected Feishu bot event runtime directory', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-feishu-sandbox-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const project = join(root, 'project'), work = join(root, 'work'), config = join(root, 'lark')
  await mkdir(project); await mkdir(work); await mkdir(config)
  execFileSync('git', ['init', '-q', project])
  await writeFile(join(config, 'config.json'), 'keep')
  const paths = await protectedProjectPaths(project, work), events = await feishuEventPaths(config, 'cli_a')
  const script = 'mkdir -p "$1/events/cli_a"; printf event > "$1/events/cli_a/bus.log"; printf bad > "$1/config.json" 2>/dev/null; mkdir "$1/events/cli_b" 2>/dev/null; printf ok > "$2/result"'
  const result = spawnSync('/usr/bin/sandbox-exec', [...superagentSandboxArguments(paths, [await realpath(work)], { feishuEvents: events }),
    '--', '/bin/sh', '-c', script, 'fixture', config, work], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(await readFile(join(config, 'events/cli_a/bus.log'), 'utf8'), 'event')
  assert.equal(await readFile(join(config, 'config.json'), 'utf8'), 'keep')
  await assert.rejects(lstat(join(config, 'events/cli_b')), { code: 'ENOENT' })
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSuperagentProject, guidedPrepare, listSuperagentGithubAccounts, listSuperagentProjects, projectDirectory, updateSuperagentProject } from './superagent-projects.mjs'
import { superagentSocket } from './superagent-service.mjs'

test('keeps project configuration and the existing Superagent in separate owned directories', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-projects-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dataRoot = join(root, 'data'), repo = join(root, 'repo'), work = join(root, 'work'), account = join(root, 'gh')
  for (const path of [dataRoot, repo, work, account]) await mkdir(path, { mode: 0o700 })
  const repoB = join(root, 'repo-b'), workB = join(root, 'work-b'), repoOld = join(root, 'repo-old'), workOld = join(root, 'work-old')
  for (const path of [repoB, workB, repoOld, workOld]) await mkdir(path, { mode: 0o700 })
  await writeFile(join(repo, 'uncommitted.txt'), 'keep this change')
  const legacy = join(dataRoot, 'superagent'); await mkdir(legacy, { mode: 0o700 })
  await writeFile(join(legacy, 'profile-owner.json'), '{"legacy":true}\n')
  const input = { name: 'Project A', repository: 'owner/a', githubLogin: 'alice', ghConfigDir: account,
    localProjectDir: repo, executionRoot: work, prepare: 'prepare-command' }
  const first = await createSuperagentProject(dataRoot, input)
  await assert.rejects(createSuperagentProject(dataRoot, { ...input, name: 'Wrong account', githubLogin: 'bob',
    localProjectDir: repoB, executionRoot: workB }), /独立的 gh 配置目录/)
  const second = await createSuperagentProject(dataRoot, { ...input, name: 'Project B', repository: 'owner/b', localProjectDir: repoB, executionRoot: workB })
  assert.notEqual(first.id, second.id)
  assert.notEqual(projectDirectory(dataRoot, first.id), projectDirectory(dataRoot, second.id))
  assert.deepEqual((await listSuperagentProjects(dataRoot)).map(row => row.name).sort(), ['Project A', 'Project B', '原有 Superagent'])
  assert.equal((await updateSuperagentProject(dataRoot, first.id, { ...input, name: 'Renamed' })).name, 'Renamed')
  const migrated = await updateSuperagentProject(dataRoot, 'legacy', { ...input, name: '原有项目', localProjectDir: repoOld, executionRoot: workOld })
  assert.equal(migrated.legacy, true)
  assert.equal((await listSuperagentProjects(dataRoot)).find(row => row.id === 'legacy').repository, 'owner/a')
  assert.equal(await readFile(join(repo, 'uncommitted.txt'), 'utf8'), 'keep this change')
  assert.equal(await readFile(join(legacy, 'profile-owner.json'), 'utf8'), '{"legacy":true}\n')
})

test('rejects an execution root overlapping the local project and refuses unsafe project identifiers', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-project-safety-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dataRoot = join(root, 'data'), repo = join(root, 'repo'), account = join(root, 'gh')
  for (const path of [dataRoot, repo, account]) await mkdir(path, { mode: 0o700 })
  await assert.rejects(createSuperagentProject(dataRoot, { name: 'A', repository: 'owner/a', githubLogin: 'alice',
    ghConfigDir: account, localProjectDir: repo, executionRoot: repo, prepare: 'x' }), /执行目录/)
  assert.throws(() => projectDirectory(dataRoot, '../repo'), /项目标识/)
})

test('rejects shared, nested, or nonempty task roots without touching existing files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-project-roots-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dataRoot = join(root, 'data'), work = join(root, 'work'), nested = join(work, 'nested'), existing = join(root, 'existing')
  for (const path of [dataRoot, work, existing]) await mkdir(path, { mode: 0o700 })
  const first = await createSuperagentProject(dataRoot, { name: 'A', executionRoot: work })
  await mkdir(nested)
  await writeFile(join(existing, 'uncommitted.txt'), 'keep')
  await assert.rejects(createSuperagentProject(dataRoot, { name: 'B', executionRoot: work }), /重叠/)
  await assert.rejects(createSuperagentProject(dataRoot, { name: 'B', executionRoot: nested }), /重叠/)
  await assert.rejects(createSuperagentProject(dataRoot, { name: 'B', executionRoot: existing }), /必须为空/)
  await assert.rejects(updateSuperagentProject(dataRoot, first.id, { ...first, executionRoot: existing }), /必须为空/)
  assert.equal(await readFile(join(existing, 'uncommitted.txt'), 'utf8'), 'keep')
})

test('guided tasks use an independent Git repository and leave the local project untouched', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-guided-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const remote = join(root, 'remote.git'), seed = join(root, 'seed'), task = join(root, 'task'), config = join(root, 'gitconfig')
  execFileSync('git', ['init', '--bare', '-q', remote])
  execFileSync('git', ['init', '-q', '-b', 'main', seed])
  execFileSync('git', ['-C', seed, 'config', 'user.name', 'Fixture'])
  execFileSync('git', ['-C', seed, 'config', 'user.email', 'fixture@example.invalid'])
  await writeFile(join(seed, 'tracked.txt'), 'committed')
  execFileSync('git', ['-C', seed, 'add', 'tracked.txt'])
  execFileSync('git', ['-C', seed, 'commit', '-q', '-m', 'fixture'])
  execFileSync('git', ['-C', seed, 'push', '-q', remote, 'main'])
  await writeFile(join(seed, 'pr.txt'), 'pull request')
  execFileSync('git', ['-C', seed, 'add', 'pr.txt'])
  execFileSync('git', ['-C', seed, 'commit', '-q', '-m', 'pull request'])
  execFileSync('git', ['-C', seed, 'push', '-q', remote, 'HEAD:refs/pull/5/head'])
  await writeFile(join(seed, 'uncommitted.txt'), 'keep')
  execFileSync('git', ['config', '--file', config, `url.file://${remote}.insteadOf`, 'https://github.com/owner/repo.git'])
  const env = { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', DSH_SUPERAGENT_DIR: task, DSH_SUPERAGENT_NAME: 'fixture' }
  execFileSync('/bin/sh', ['-c', guidedPrepare('owner/repo', 'main')], { env, stdio: 'pipe' })
  assert.equal(execFileSync('git', ['-C', task, 'branch', '--show-current'], { encoding: 'utf8' }).trim(), 'agent/fixture')
  assert.equal(await readFile(join(task, 'tracked.txt'), 'utf8'), 'committed')
  await assert.rejects(readFile(join(task, 'uncommitted.txt')), { code: 'ENOENT' })
  assert.equal(await readFile(join(seed, 'uncommitted.txt'), 'utf8'), 'keep')
  const prTask = join(root, 'pr-task')
  execFileSync('/bin/sh', ['-c', guidedPrepare('owner/repo', 'main')], { env: { ...env,
    DSH_SUPERAGENT_DIR: prTask, DSH_SUPERAGENT_NAME: 'pr-fixture', DSH_SUPERAGENT_GITHUB_PR_HEAD: 'refs/pull/5/head' }, stdio: 'pipe' })
  assert.equal(await readFile(join(prTask, 'pr.txt'), 'utf8'), 'pull request')
  await assert.rejects(readFile(join(task, 'pr.txt')), { code: 'ENOENT' })
  assert.throws(() => guidedPrepare('owner/repo', '../bad'), /分支/)
})

test('guided projects get a private task root without asking for a command', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-guided-create-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const repo = join(root, 'repo'), account = join(root, 'gh')
  await mkdir(repo); await mkdir(account)
  const project = await createSuperagentProject(root, { guided: true, name: 'owner/repo', repository: 'owner/repo', baseBranch: 'main',
    githubLogin: 'alice', ghConfigDir: account, localProjectDir: repo, githubAllowed: 'alice' })
  assert.equal(project.executionEnabled, true)
  assert.match(project.executionRoot, /superagent-workspaces/)
  assert.match(project.prepare, /DSH_SUPERAGENT_GITHUB_PR_HEAD/)
  assert.equal(project.baseBranch, 'main')
})

test('an unconfigured legacy project can use the wizard without replacing its existing data', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-guided-legacy-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const legacy = join(root, 'superagent'), repo = join(root, 'repo'), account = join(root, 'gh')
  for (const path of [legacy, repo, account]) await mkdir(path, { mode: 0o700 })
  await writeFile(join(legacy, 'profile-owner.json'), '{"legacy":true}\n')
  await writeFile(join(legacy, 'history-fixture'), 'do not change')
  const input = { guided: true, name: '原有 Superagent', repository: 'owner/repo', baseBranch: 'main',
    githubLogin: 'alice', ghConfigDir: account, localProjectDir: repo, preserveLegacyPolicy: true }
  const project = await updateSuperagentProject(root, 'legacy', input)
  assert.equal(project.legacy, true)
  assert.equal(project.preserveLegacyPolicy, true)
  assert.equal(project.executionEnabled, true)
  assert.match(project.executionRoot, /superagent-workspaces/)
  assert.equal(await readFile(join(legacy, 'history-fixture'), 'utf8'), 'do not change')
  const before = await readdir(join(root, 'superagent-workspaces'))
  await assert.rejects(updateSuperagentProject(root, 'legacy', { ...project, guided: true }), /不能重新生成/)
  assert.deepEqual(await readdir(join(root, 'superagent-workspaces')), before)
})

test('lists named gh profiles without reading or changing their credentials', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-gh-profiles-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const profiles = join(root, 'gh-profiles')
  await mkdir(join(profiles, 'alice'), { recursive: true }); await mkdir(join(profiles, 'bob'))
  await writeFile(join(profiles, 'alice', 'hosts.yml'), 'private fixture')
  assert.deepEqual(await listSuperagentGithubAccounts({ home: root, configHome: root }), [
    { login: 'alice', directory: join(profiles, 'alice') }, { login: 'bob', directory: join(profiles, 'bob') },
  ])
  assert.equal(await readFile(join(profiles, 'alice', 'hosts.yml'), 'utf8'), 'private fixture')
})

test('does not change protected project mappings while any Superagent is running', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-registry-'))
  const dataRoot = join(root, 'data'); await mkdir(dataRoot, { mode: 0o700 })
  const project = await createSuperagentProject(dataRoot, { name: 'A' })
  const socket = superagentSocket(dataRoot, project.id), socketDirectory = dirname(socket)
  await mkdir(socketDirectory, { mode: 0o700 })
  const server = createServer(connection => connection.once('data', () => connection.end(JSON.stringify({ ok: true,
    value: { protocol: 1, service: { state: 'running', pid: 123 } } }) + '\n')))
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socket, resolve) })
  await chmod(socket, 0o600)
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(socketDirectory, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }) })
  const child = spawn(process.execPath, [fileURLToPath(new URL('./superagent-service.mjs', import.meta.url)), 'create-project', dataRoot, root, root])
  let output = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk })
  child.stdin.end(JSON.stringify({ name: 'B' }))
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
  assert.equal(code, 1)
  assert.match(JSON.parse(output).error, /先停止所有 Superagent/)
  assert.deepEqual((await listSuperagentProjects(dataRoot)).map(row => row.name), ['A'])
})

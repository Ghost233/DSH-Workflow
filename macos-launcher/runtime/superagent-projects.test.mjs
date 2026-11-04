import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSuperagentProject, extraWritableRootsForProject, getCommonWritableRoots, getSuperagentProject, guidedPrepare, listSuperagentGithubAccounts, listSuperagentProjects, projectDirectory, saveCommonWritableRoots, updateSuperagentProject } from './superagent-projects.mjs'
import { superagentSocket } from './superagent-service.mjs'
import { superagentSandboxArguments } from './superagent-sandbox.mjs'

test('common writable roots are inherited without sharing project-only roots', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-common-roots-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const data = join(root, 'data'), common = join(root, 'common'), own = join(root, 'own')
  for (const path of [data, common, own]) await mkdir(path)
  assert.deepEqual(await getCommonWritableRoots(data), { revision: 0, roots: [] })
  const a = await createSuperagentProject(data, { name: 'A', extraWritableRoots: [own] })
  const b = await createSuperagentProject(data, { name: 'B' })
  const saved = await saveCommonWritableRoots(data, { revision: 0, roots: [common] })
  assert.deepEqual(saved, { revision: 1, roots: [await realpath(common)] })
  assert.deepEqual(await extraWritableRootsForProject(data, await getSuperagentProject(data, a.id)), [await realpath(common), await realpath(own)])
  assert.deepEqual(await extraWritableRootsForProject(data, await getSuperagentProject(data, b.id)), [await realpath(common)])
  await assert.rejects(saveCommonWritableRoots(data, { revision: 0, roots: [] }), /更改|刷新/)
  await saveCommonWritableRoots(data, { revision: 1, roots: [] })
  assert.deepEqual(await extraWritableRootsForProject(data, await getSuperagentProject(data, a.id)), [await realpath(own)])
})

test('common writable roots cannot overlap project or account directories now or in future projects', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-common-protection-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const data = join(root, 'data'), repo = join(root, 'repo'), tasks = join(root, 'tasks'), account = join(root, 'gh'), common = join(root, 'common')
  for (const path of [data, repo, tasks, account, common]) await mkdir(path)
  await createSuperagentProject(data, { name: 'A', localProjectDir: repo, executionRoot: tasks, ghConfigDir: account })
  for (const path of [root, data, repo, tasks, account, '/']) {
    await assert.rejects(saveCommonWritableRoots(data, { revision: 0, roots: [path] }), /目录|保护|重叠/)
  }
  await saveCommonWritableRoots(data, { revision: 0, roots: [common] })
  await assert.rejects(createSuperagentProject(data, { name: 'B', localProjectDir: common }), /目录|保护|重叠/)
  await rm(common, { recursive: true }); await symlink(repo, common)
  const a = (await listSuperagentProjects(data)).find(row => row.name === 'A')
  await assert.rejects(extraWritableRootsForProject(data, a), /改变|重叠/)
})

test('common and project grants cannot expose nested private directories to other projects', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-common-private-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const data = join(root, 'data'), shared = join(root, 'sdk'), privateDir = join(shared, 'private')
  await mkdir(data); await mkdir(shared); await mkdir(privateDir)
  const a = await createSuperagentProject(data, { name: 'A', extraWritableRoots: [privateDir] })
  await assert.rejects(saveCommonWritableRoots(data, { revision: 0, roots: [shared] }), /项目|重叠/)
  await saveCommonWritableRoots(data, { revision: 0, roots: [privateDir] })
  await assert.rejects(updateSuperagentProject(data, a.id, { ...a, extraWritableRoots: [shared] }), /公共|重叠/)
})

test('guided creation checks the common grant before creating a workspace', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-common-guided-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const data = join(root, 'data'), common = join(root, 'common'), account = join(root, 'gh')
  for (const path of [data, common, account]) await mkdir(path)
  await saveCommonWritableRoots(data, { revision: 0, roots: [common] })
  await assert.rejects(createSuperagentProject(data, { guided: true, dedicated: true, name: 'B', repository: 'owner/b',
    baseBranch: 'main', githubLogin: 'alice', ghConfigDir: account, storageRoot: common }), /公共|重叠/)
  assert.deepEqual(await readdir(common), [])
})

test('macOS sandbox combines common and project-only grants without sharing other project roots', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-common-sandbox-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const data = join(root, 'data'), common = join(root, 'common'), own = join(root, 'own'), workA = join(root, 'work-a'), workB = join(root, 'work-b'), guard = join(root, 'guard')
  for (const path of [data, common, own, workA, workB, guard]) await mkdir(path)
  const a = await createSuperagentProject(data, { name: 'A', executionRoot: workA, extraWritableRoots: [own] })
  const b = await createSuperagentProject(data, { name: 'B', executionRoot: workB })
  await saveCommonWritableRoots(data, { revision: 0, roots: [common] })
  const invoke = async (project, work, target) => {
    const roots = await extraWritableRootsForProject(data, await getSuperagentProject(data, project.id))
    const args = superagentSandboxArguments([await realpath(guard)], [await realpath(work), ...roots])
    execFileSync('/usr/bin/sandbox-exec', [...args, '--', '/usr/bin/touch', target], { stdio: 'pipe' })
  }
  await invoke(a, workA, join(common, 'a'))
  await invoke(b, workB, join(common, 'b'))
  await invoke(a, workA, join(own, 'a'))
  await assert.rejects(invoke(b, workB, join(own, 'b')))
  await assert.rejects(invoke(a, workA, join(workB, 'a')))
  assert.deepEqual((await readdir(common)).sort(), ['a', 'b'])
  assert.deepEqual(await readdir(own), ['a'])
})

test('stores explicit writable SDK directories per project and preserves them on older updates', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-extra-roots-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const data = join(root, 'data'), cache = join(root, 'flutter-cache'), repo = join(root, 'repo'), tasks = join(root, 'tasks')
  for (const path of [data, cache, repo, tasks]) await mkdir(path)
  const first = await createSuperagentProject(data, { name: 'A', localProjectDir: repo, executionRoot: tasks, extraWritableRoots: [cache] })
  assert.deepEqual(first.extraWritableRoots, [await realpath(cache)])
  const second = await createSuperagentProject(data, { name: 'B', extraWritableRoots: [cache] })
  assert.deepEqual(second.extraWritableRoots, first.extraWritableRoots)
  const { extraWritableRoots, ...oldClientInput } = first
  const updated = await updateSuperagentProject(data, first.id, { ...oldClientInput, name: 'Renamed' })
  assert.deepEqual(updated.extraWritableRoots, first.extraWritableRoots)
  const cleared = await updateSuperagentProject(data, first.id, { ...updated, extraWritableRoots: [] })
  assert.deepEqual(cleared.extraWritableRoots, [])
  assert.deepEqual((await listSuperagentProjects(data)).find(row => row.id === second.id).extraWritableRoots, first.extraWritableRoots)
})

test('rejects unsafe writable directories and prevents future projects from overlapping a shared cache', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-extra-safety-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const data = join(root, 'data'), repo = join(root, 'repo'), tasks = join(root, 'tasks'), cache = join(root, 'cache')
  for (const path of [data, repo, tasks, cache]) await mkdir(path)
  await writeFile(join(repo, 'uncommitted'), 'keep')
  const project = await createSuperagentProject(data, { name: 'A', localProjectDir: repo, executionRoot: tasks, extraWritableRoots: [cache] })
  for (const path of [data, root, repo, tasks, '/', join(root, 'missing')]) {
    await assert.rejects(updateSuperagentProject(data, project.id, { ...project, extraWritableRoots: [path] }))
  }
  await assert.rejects(createSuperagentProject(data, { name: 'B', executionRoot: cache }), /重叠|保护/)
  assert.equal(await readFile(join(repo, 'uncommitted'), 'utf8'), 'keep')
})

test('rechecks a saved writable directory before startup and rejects a redirected path', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-extra-recheck-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const data = join(root, 'data'), cache = join(root, 'cache'), outside = join(root, 'outside')
  for (const path of [data, cache, outside]) await mkdir(path)
  const project = await createSuperagentProject(data, { name: 'A', extraWritableRoots: [cache] })
  assert.deepEqual(await extraWritableRootsForProject(data, project), project.extraWritableRoots)
  await rm(cache, { recursive: true }); await symlink(outside, cache)
  await assert.rejects(extraWritableRootsForProject(data, project), /改变/)
})

test('a saved SDK grant survives reloading and remains isolated to the selected project', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-extra-restart-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const data = join(root, 'data'), cache = join(root, 'cache'), work = join(root, 'work'), guard = join(root, 'guard')
  for (const path of [data, cache, work, guard]) await mkdir(path)
  const a = await createSuperagentProject(data, { name: 'A' })
  const b = await createSuperagentProject(data, { name: 'B' })
  const probe = async (project, name) => {
    const roots = await extraWritableRootsForProject(data, project)
    const args = superagentSandboxArguments([await realpath(guard)], [await realpath(work), ...roots])
    execFileSync('/usr/bin/sandbox-exec', [...args, '--', '/usr/bin/touch', join(cache, name)], { stdio: 'pipe' })
  }
  await assert.rejects(probe(a, 'before'))
  await updateSuperagentProject(data, a.id, { ...a, extraWritableRoots: [cache] })
  await probe(await getSuperagentProject(data, a.id), 'first-start')
  await probe(await getSuperagentProject(data, a.id), 'restart')
  await assert.rejects(probe(await getSuperagentProject(data, b.id), 'other-project'))
  assert.deepEqual((await readdir(cache)).sort(), ['first-start', 'restart'])
})

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
  assert.deepEqual((await listSuperagentProjects(dataRoot)).map(row => row.name).sort(), ['Project A', 'Project B'])
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

test('checks a canonical workspace path before creating anything under an aliased data root', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-canonical-work-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const actual = join(root, 'actual'), alias = join(root, 'alias'), account = join(root, 'gh')
  await mkdir(actual, { mode: 0o700 }); await mkdir(account, { mode: 0o700 }); await symlink(actual, alias)
  const canonical = await realpath(actual)
  await assert.rejects(createSuperagentProject(alias, { guided: true, dedicated: true, name: 'B', repository: 'owner/b',
    baseBranch: 'main', githubLogin: 'alice', ghConfigDir: account }, { beforeGuidedCreate: work => {
    assert.ok(work.startsWith(join(canonical, 'superagent-workspaces') + '/'))
    throw new Error('guard checked')
  } }), /guard checked/)
  assert.deepEqual(await readdir(join(actual, 'superagent-workspaces')), [])
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
  let running = true
  const server = createServer(connection => connection.once('data', () => connection.end(JSON.stringify({ ok: true,
    value: { protocol: 1, service: { state: running ? 'running' : 'stopped', pid: running ? 123 : null } } }) + '\n')))
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
  const saveCommon = () => new Promise((resolve, reject) => {
    const childProcess = spawn(process.execPath, [fileURLToPath(new URL('./superagent-service.mjs', import.meta.url)), 'save-common-writable-roots', dataRoot, root, root])
    let text = ''; childProcess.stdout.setEncoding('utf8'); childProcess.stdout.on('data', chunk => { text += chunk })
    childProcess.stdin.end(JSON.stringify({ revision: 0, roots: [] }))
    childProcess.once('error', reject); childProcess.once('close', code => resolve({ code, reply: JSON.parse(text) }))
  })
  const denied = await saveCommon()
  assert.equal(denied.code, 1); assert.match(denied.reply.error, /先停止所有 Superagent/)
  assert.equal((await getCommonWritableRoots(dataRoot)).revision, 0)
  running = false
  const accepted = await saveCommon()
  assert.equal(accepted.code, 0); assert.equal(accepted.reply.value.commonWritableRoots.revision, 1)
})

test('a dedicated project can be added beside a running dedicated project without exposing either workspace', async t => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-running-create-')), dataRoot = join(root, 'data')
  const repo = join(root, 'repo-a'), tasks = join(root, 'tasks-a'), account = join(root, 'gh'), feishu = join(root, 'feishu'), runtimeExtra = join(root, 'runtime-extra')
  for (const path of [dataRoot, repo, tasks, account, feishu, runtimeExtra]) await mkdir(path, { mode: 0o700 })
  const first = await createSuperagentProject(dataRoot, { name: 'A', localProjectDir: repo, executionRoot: tasks, feishuConfigDir: feishu, deploymentMode: 'dedicated' })
  const marker = join(repo, 'uncommitted.txt'); await writeFile(marker, 'keep')
  const socket = superagentSocket(dataRoot, first.id), socketDirectory = dirname(socket)
  await mkdir(socketDirectory, { mode: 0o700 })
  let sandboxPolicy, sandboxRoots
  const server = createServer(connection => connection.once('data', () => connection.end(JSON.stringify({ ok: true,
    value: { protocol: 1, projectId: first.id, sandboxPolicy, sandboxRoots, service: { state: 'running', pid: 123 } } }) + '\n')))
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socket, resolve) }); await chmod(socket, 0o600)
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(socketDirectory, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }) })
  const create = async input => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./superagent-service.mjs', import.meta.url)), 'create-project', dataRoot, root, root])
    let output = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk })
    child.stdin.end(JSON.stringify(input)); const code = await new Promise(resolve => child.once('close', resolve))
    return { code, reply: JSON.parse(output) }
  }
  const input = { guided: true, dedicated: true, name: 'B', repository: 'owner/b', baseBranch: 'main', githubLogin: 'alice', ghConfigDir: account }
  const unattested = await create(input)
  assert.equal(unattested.code, 1); assert.match(unattested.reply.error, /未确认目录隔离/)
  sandboxPolicy = 1
  const missingRoots = await create(input)
  assert.equal(missingRoots.code, 1); assert.match(missingRoots.reply.error, /未确认目录隔离/)
  sandboxRoots = await Promise.all([projectDirectory(dataRoot, first.id), repo, tasks, feishu, runtimeExtra].map(path => realpath(path)))
  const alias = join(root, 'tasks-alias'); await symlink(tasks, alias)
  for (const storageRoot of [tasks, alias, projectDirectory(dataRoot, first.id), feishu, runtimeExtra, join(dataRoot, 'superagent-projects')]) {
    const refused = await create({ ...input, storageRoot })
    assert.equal(refused.code, 1); assert.match(refused.reply.error, /目录|保护|重叠/)
  }
  assert.deepEqual(await readdir(tasks), [])
  const created = await create(input)
  assert.equal(created.code, 0, JSON.stringify(created.reply))
  assert.equal(created.reply.value.project.deploymentMode, 'dedicated')
  const newRepo = created.reply.value.project.localProjectDir
  const args = superagentSandboxArguments([join(projectDirectory(dataRoot, first.id), 'project.json')], [projectDirectory(dataRoot, first.id), repo, tasks])
  assert.throws(() => execFileSync('/usr/bin/sandbox-exec', [...args, '--', '/usr/bin/touch', join(newRepo, 'must-not-write')], { stdio: 'ignore' }))
  assert.deepEqual(await readdir(newRepo), [])
  const second = created.reply.value.project
  const secondArgs = superagentSandboxArguments([join(projectDirectory(dataRoot, second.id), 'project.json')], [projectDirectory(dataRoot, second.id), second.localProjectDir, second.executionRoot])
  assert.throws(() => execFileSync('/usr/bin/sandbox-exec', [...secondArgs, '--', '/usr/bin/touch', marker], { stdio: 'ignore' }))
  assert.equal(await readFile(marker, 'utf8'), 'keep')
  assert.equal((await listSuperagentProjects(dataRoot)).length, 2)
})

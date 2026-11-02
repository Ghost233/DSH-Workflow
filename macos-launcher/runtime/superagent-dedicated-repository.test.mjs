import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeDedicatedRepository } from './superagent-dedicated-repository.mjs'
import { createSuperagentProject, getSuperagentProject, updateSuperagentProject } from './superagent-projects.mjs'
import { superagentSandboxArguments } from './superagent-sandbox.mjs'

test('dedicated projects persist intake settings and create real task worktrees without touching personal checkouts', async t => {
  const root = await mkdtemp(join(tmpdir(), 'station-dedicated-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const gh = join(root, 'gh'), source = join(root, 'personal'), remote = join(root, 'remote.git')
  await mkdir(gh)
  const git = (...args) => execFileSync('git', args, { stdio: 'pipe' })
  git('init', '-q', '-b', 'main', source); git('init', '--bare', '-q', remote)
  git('-C', source, 'config', 'user.name', 'Personal'); git('-C', source, 'config', 'user.email', 'personal@example.invalid')
  await writeFile(join(source, 'file.txt'), 'committed')
  git('-C', source, 'add', 'file.txt'); git('-C', source, 'commit', '-qm', 'base'); git('-C', source, 'push', '-q', remote, 'main')
  git('--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main')
  await writeFile(join(source, 'file.txt'), 'uncommitted')
  await assert.rejects(createSuperagentProject(root, { guided: true, dedicated: true, storageRoot: source,
    name: 'Unsafe', repository: 'owner/repo', baseBranch: 'main', githubLogin: 'alice', ghConfigDir: gh }), /工作区之外/)
  const project = await createSuperagentProject(root, { guided: true, dedicated: true, name: 'Project', repository: 'owner/repo', baseBranch: 'main',
    githubLogin: 'alice', ghConfigDir: gh, authorName: 'Agent', authorEmail: 'agent@example.invalid',
    policyManaged: true, feishuListen: 'all', acceptMode: 'auto', acceptRules: [{ id: 'bug', name: 'Bug', enabled: true, instruction: 'Only reproducible bugs; ignore chat.' }] })
  assert.equal(project.deploymentMode, 'dedicated')
  assert.notEqual(project.localProjectDir, source)
  const exec = promisify(execFile)
  let clones = 0
  const run = (command, args, options) => {
    if (args.includes('clone')) { clones++; args = args.map(arg => arg === 'https://github.com/owner/repo.git' ? remote : arg) }
    return exec(command, args, options)
  }
  await initializeDedicatedRepository({ project, github: '/fixture/gh', run })
  await initializeDedicatedRepository({ project, github: '/fixture/gh', run })
  assert.equal(clones, 1)
  const task = join(project.executionRoot, 'ticket')
  const env = { ...process.env, DSH_SUPERAGENT_DIR: task, DSH_SUPERAGENT_NAME: 'ticket', DSH_SUPERAGENT_TICKET: 'ticket' }
  const sandbox = superagentSandboxArguments([await realpath(source)], [await realpath(project.localProjectDir), await realpath(project.executionRoot)])
  execFileSync('/usr/bin/sandbox-exec', [...sandbox, '--', '/bin/sh', '-c', project.prepare], { env, stdio: 'pipe' })
  assert.equal(await readFile(join(task, 'file.txt'), 'utf8'), 'committed')
  assert.equal(await readFile(join(source, 'file.txt'), 'utf8'), 'uncommitted')
  const updated = await updateSuperagentProject(root, project.id, { ...project, name: 'Renamed' })
  const reopened = await getSuperagentProject(root, project.id)
  assert.equal(reopened.feishuListen, 'all'); assert.equal(reopened.acceptMode, 'auto')
  assert.deepEqual(reopened.acceptRules, project.acceptRules)
  assert.equal(reopened.prepare, project.prepare)
  assert.equal(updated.policyManaged, true)
  await assert.rejects(updateSuperagentProject(root, project.id, { ...reopened, feishuListen: 'bad' }), /无效/)
  await assert.rejects(updateSuperagentProject(root, project.id, { ...reopened, acceptRules: [] }), /至少一条/)
  const other = await createSuperagentProject(root, { guided: true, dedicated: true, name: 'Other', repository: 'owner/other',
    baseBranch: 'main', githubLogin: 'alice', ghConfigDir: gh })
  await writeFile(join(other.localProjectDir, 'existing.txt'), 'keep')
  await assert.rejects(initializeDedicatedRepository({ project: other, github: '/fixture/gh', run }), /已有未完成的数据/)
  assert.equal(await readFile(join(other.localProjectDir, 'existing.txt'), 'utf8'), 'keep')
})

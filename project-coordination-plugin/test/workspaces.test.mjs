import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Workspaces } from '../src/workspaces.mjs'

const exec = promisify(execFile)
test('worktree preparation reuses its exact reservation and verification records real command outcomes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'coordination-worktrees-')), checkout = join(root, 'repository')
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(checkout)
  await exec('git', ['init', '--quiet', checkout])
  await writeFile(join(checkout, 'input.txt'), 'source\n')
  await exec('git', ['-C', checkout, 'add', '.'])
  await exec('git', ['-C', checkout, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture'])
  const workspaces = new Workspaces()
  const repository = { checkout, executionRoot: join(root, 'work'), branchPrefix: 'codex/',
    verificationCommands: [[process.execPath, '-e', 'process.exit(0)']] }
  const attempt = { id: 'attempt-1', taskId: 'task-1' }
  const prepared = await workspaces.prepare(repository, attempt)
  assert.equal((await workspaces.prepare(repository, attempt)).path, prepared.path)
  const evidence = await workspaces.verify(repository, prepared)
  assert.equal(evidence.commands[0].exitCode, 0)
  assert.match(evidence.tree, /^[a-f0-9]{40}$/)
  assert.equal((await workspaces.unchanged(prepared)).unchanged, true)
  await writeFile(join(prepared.path, 'input.txt'), 'changed\n')
  await assert.rejects(workspaces.unchanged(prepared), /clean/)
  await assert.rejects(workspaces.head(prepared), /clean/)
  await exec('git', ['-C', prepared.path, 'add', 'input.txt'])
  await exec('git', ['-C', prepared.path, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '--quiet', '-m', 'change'])
  await assert.rejects(workspaces.unchanged(prepared), /changes/)
  assert.ok((await workspaces.head(prepared)).head)
  await assert.rejects(workspaces.verify({ ...repository, verificationCommands: [[process.execPath, '-e', 'process.exit(7)']] }, prepared), /exit 7/)
})

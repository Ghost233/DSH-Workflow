import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readFile, realpath, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { SubmissionPipeline } from '../src/submission-pipeline.mjs'
import { assertOwnerWrite } from '../src/owner-access.mjs'

const execute = promisify(execFile)
const git = async (root, args) => (await execute('git', args, { cwd: root })).stdout.trim()

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-pipeline-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const worktree = join(root, 'repo')
  await mkdir(join(worktree, 'src/api'), { recursive: true })
  await execute('git', ['init', '-q', worktree])
  await writeFile(join(worktree, 'src/api/value.mjs'), 'export const value = 1\n')
  await writeFile(join(worktree, '.gitignore'), 'node_modules/\n')
  await git(worktree, ['add', '.'])
  await git(worktree, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'baseline'])
  const baseCommit = await git(worktree, ['rev-parse', 'HEAD'])
  const ownerBranch = await git(worktree, ['branch', '--show-current'])
  const attempt = { id: 'attempt1', authority: 'authority', definitionDigest: 'definition', baseCommit }
  const task = { id: 'T1', title: 'Change API value', write: ['src/api/**'], verify: ['one', 'two'] }
  const owner = { id: 'api', scope: ['src/api/**'], exclude: [] }
  let calls = 0
  const pipeline = new SubmissionPipeline({ artifactsRoot: join(root, 'artifacts'),
    assertAuthority: async authority => assert.equal(authority, attempt.authority),
    executeCommand: async request => {
      calls++
      try {
        const result = await execute(request.argv[0], request.argv.slice(1), { cwd: request.cwd, signal: request.signal })
        return { exitCode: 0, stdout: result.stdout, stderr: result.stderr, enforcement: 'full' }
      } catch (error) {
        return { exitCode: Number(error.code) || 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '', enforcement: 'full' }
      }
    },
    reviewCandidate: async ({ candidate }) => ({ passed: true, commitSha: candidate.commitSha, reasons: ['candidate matches task'] }),
    integrateCandidate: async () => { throw new Error('not used') },
  })
  return { root, worktree, ownerBranch, attempt, task, owner, pipeline, get calls() { return calls } }
}

async function submittedCandidate(f, value = 2) {
  await writeFile(join(f.worktree, 'src/api/value.mjs'), `export const value = ${value}\n`)
  const submission = await f.pipeline.captureSubmission({ ...f, report: { summary: `value becomes ${value}` } })
  const candidate = await f.pipeline.seal({ id: `seal-${value}`, input: { submission, authority: f.attempt.authority } })
  return { submission, candidate }
}

test('Owner submission becomes one immutable task commit on its durable Owner branch', async t => {
  const f = await fixture(t)
  const { candidate } = await submittedCandidate(f)
  assert.equal(candidate.commitSha, await git(f.worktree, ['rev-parse', 'HEAD']))
  assert.equal(await git(f.worktree, ['branch', '--show-current']), f.ownerBranch)
  assert.equal((await git(f.worktree, ['show', '-s', '--format=%P', candidate.commitSha])).split(/\s+/u)[0], f.attempt.baseCommit)
  assert.equal(candidate.treeSha, await git(f.worktree, ['show', '-s', '--format=%T', candidate.commitSha]))
  assert.deepEqual(candidate.paths, ['src/api/value.mjs'])
  assert.equal(Object.hasOwn(candidate, 'contentDigest'), false)
  assert.equal(Object.hasOwn(candidate, 'manifest'), false)
  assert.equal(await git(f.worktree, ['status', '--porcelain']), '')
})

test('each fixed verification uses a disposable checkout of the same task commit', async t => {
  const f = await fixture(t)
  const { candidate } = await submittedCandidate(f)
  const action = { id: 'verify1', input: { candidate, task: f.task, verifications: [
    { id: 'one', run: [process.execPath, '-e', "require('fs').writeFileSync('src/api/value.mjs', 'changed by test')"] },
    { id: 'two', run: [process.execPath, '-e', "if (!require('fs').readFileSync('src/api/value.mjs','utf8').includes('2')) process.exit(1)"] },
  ] } }
  const result = await f.pipeline.verify(action)
  assert.equal(result.passed, true, JSON.stringify(result))
  assert.equal(result.commitSha, candidate.commitSha)
  assert.equal(f.calls, 2)
  assert.deepEqual(await f.pipeline.verify(action), result)
  assert.equal(f.calls, 2)
  assert.equal(await readFile(join(f.worktree, 'src/api/value.mjs'), 'utf8'), 'export const value = 2\n')
})

test('verification failure and changed Git identity fail closed', async t => {
  const f = await fixture(t)
  const { candidate } = await submittedCandidate(f)
  const result = await f.pipeline.verify({ id: 'verify-fail', input: { candidate,
    task: { ...f.task, verify: ['one'] }, verifications: [{ id: 'one', run: [process.execPath, '-e', 'process.exit(3)'] }] } })
  assert.equal(result.passed, false)
  assert.equal(result.results[0].exitCode, 3)
  await assert.rejects(f.pipeline.assertCandidate({ ...candidate, treeSha: '0'.repeat(40) }), /identity changed/)
})

test('KAC-21: writes check scope and linked ancestors before the native mutation', async t => {
  const f = await fixture(t)
  const binding = { ...f, authority: f.attempt.authority }
  const authority = async token => assert.equal(token, 'authority')
  assert.equal(await assertOwnerWrite(binding, 'src/api/new.mjs', authority), join(await realpath(f.worktree), 'src/api/new.mjs'))
  await assert.rejects(assertOwnerWrite(binding, 'src/web/no.mjs', authority), /scope/)
  await assert.rejects(assertOwnerWrite(binding, '.git/config', authority), /scope/)
  await symlink(f.root, join(f.worktree, 'src/api/link'))
  await assert.rejects(assertOwnerWrite(binding, 'src/api/link/out', authority), /linked path/)
})

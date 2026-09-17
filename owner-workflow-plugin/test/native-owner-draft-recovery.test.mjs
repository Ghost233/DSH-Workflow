import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertRetryDraft } from '../src/native-session-effects.mjs'
import { currentBranch, git, statusRecords } from '../src/git.mjs'

test('a settled same-task retry can carry scoped unsubmitted files across a newer base', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ukr-owner-draft-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await git(root, ['init', '-q'])
  await git(root, ['switch', '-qc', 'main'])
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src', 'existing.ts'), 'baseline\n')
  await git(root, ['add', '.'])
  await git(root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'baseline'])
  const oldBase = await git(root, ['rev-parse', 'HEAD'])
  await writeFile(join(root, 'README.md'), 'new integration\n')
  await git(root, ['add', '.'])
  await git(root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'integration'])
  const newBase = await git(root, ['rev-parse', 'HEAD'])
  const oldBranch = 'dsh/owner/wf/api/old'
  const newBranch = 'dsh/owner/wf/api/new'
  await git(root, ['switch', '-qc', oldBranch, oldBase])
  await writeFile(join(root, 'src', 'existing.ts'), 'draft change\n')
  await writeFile(join(root, 'src', 'new.ts'), 'new draft\n')
  const owner = { id: 'api', scope: ['src/**'], exclude: [] }
  const task = { id: 'T1', write: ['src/**'] }
  const prior = { id: 'old', taskId: 'T1', ownerId: 'api', definitionDigest: 'same', phase: 'failed',
    baseCommit: oldBase, submission: null, candidate: null, quarantined: false,
    termination: { executionSettled: true, sourceWritesClosed: true, managedRangeStopped: true,
      terminationScope: 'dsh-managed-range', terminationId: 'draft-range' } }
  const workflow = { id: 'wf', attempts: { old: prior } }
  const action = { input: { task, owner, definitionDigest: 'same', baseCommit: newBase,
    repair: { fromAttemptId: 'old', candidate: null } } }
  const records = await statusRecords(root)
  assert.deepEqual(records.map(record => record.path).sort(), ['src/existing.ts', 'src/new.ts'])
  await assertRetryDraft(action, workflow, root, newBranch, owner, records, await currentBranch(root), oldBase)
  await git(root, ['switch', '-qc', newBranch, newBase])
  assert.equal(await git(root, ['rev-parse', 'HEAD']), newBase)
  assert.equal(await readFile(join(root, 'src', 'existing.ts'), 'utf8'), 'draft change\n')
  assert.equal(await readFile(join(root, 'src', 'new.ts'), 'utf8'), 'new draft\n')

  await mkdir(join(root, 'docs'))
  await writeFile(join(root, 'docs', 'outside.md'), 'out of scope\n')
  await assert.rejects(assertRetryDraft(action, workflow, root, newBranch, owner,
    await statusRecords(root), newBranch, newBase), /Owner write exceeds task scope/u)
  await rm(join(root, 'docs'), { recursive: true })
  await assert.rejects(assertRetryDraft(action, { ...workflow, attempts: { old: { ...prior,
    termination: { ...prior.termination, sourceWritesClosed: false } } } }, root, newBranch, owner,
  await statusRecords(root), newBranch, newBase), /settled same-task retry/u)
})

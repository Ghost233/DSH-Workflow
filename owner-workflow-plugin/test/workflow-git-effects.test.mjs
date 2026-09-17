import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { git } from '../src/git.mjs'
import { SubmissionPipeline } from '../src/submission-pipeline.mjs'
import { WorkflowGitEffects } from '../src/workflow-git-effects.mjs'
import { kernelDigest } from '../src/workflow-engine.mjs'

const exec = promisify(execFile)


test('revised Spec/Tickets merge with integrated Owner code and reconcile the same ref after interruption', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-source-revision-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const environment = { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@invalid' }
  const command = async args => (await exec('git', args, { cwd: root, env: environment })).stdout.trim()
  await command(['init', '-q']); await mkdir(join(root, 'src')); await mkdir(join(root, 'docs/specs'), { recursive: true })
  await writeFile(join(root, 'src/a'), 'original code'); await writeFile(join(root, 'docs/specs/feature.md'), 'R1')
  await command(['add', '.']); await command(['commit', '-qm', 'initial'])
  const previousBase = await command(['rev-parse', 'HEAD']), branch = await command(['branch', '--show-current'])
  const ref = 'refs/heads/dsh/workflow/revised-sources'
  await command(['checkout', '-qb', 'dsh/workflow/revised-sources'])
  await writeFile(join(root, 'src/a'), 'integrated owner code'); await command(['add', 'src/a']); await command(['commit', '-qm', 'owner implementation'])
  const expectedBase = await command(['rev-parse', 'HEAD'])
  await command(['checkout', branch]); await writeFile(join(root, 'docs/specs/feature.md'), 'R2')
  await command(['add', 'docs/specs/feature.md']); await command(['commit', '-qm', 'revised sources'])
  const checkpointCommit = await command(['rev-parse', 'HEAD']), config = await readFile(join(root, '.git/config'))
  const input = { previousBase, checkpointCommit, expectedBase, proposal: { sources: { snapshotDigest: 'fixture-native-binding-tested-separately' } } }
  const action = { id: 'source-revision', workflowId: 'wf', createdAt: Date.UTC(2026, 8, 13), input, inputDigest: kernelDigest(input) }
  const options = { root, artifactsRoot: join(root, 'artifacts'), integrationRef: ref }
  await exec(process.execPath, ['--input-type=module', '-e', `import { WorkflowGitEffects } from ${JSON.stringify(new URL('../src/workflow-git-effects.mjs', import.meta.url).href)};
    const effect=new WorkflowGitEffects({...${JSON.stringify(options)},fault:async()=>{throw Error('injected revision crash')}});
    try{await effect.prepareRevision(${JSON.stringify(action)},{assertCurrent:async()=>{}})}catch(error){if(error.message!=='injected revision crash')throw error}`], { env: environment })
  const actual = await command(['rev-parse', ref])
  const result = await new WorkflowGitEffects(options).prepareRevision(action, { assertCurrent: async () => {} })
  assert.equal(result.commitSha, actual)
  assert.equal(await command(['show', `${actual}:src/a`]), 'integrated owner code')
  assert.equal(await command(['show', `${actual}:docs/specs/feature.md`]), 'R2')
  await command(['merge-base', '--is-ancestor', checkpointCommit, actual])
  assert.equal(await command(['rev-parse', 'HEAD']), checkpointCommit)
  assert.equal(await readFile(join(root, 'src/a'), 'utf8'), 'original code')
  assert.deepEqual(await readFile(join(root, '.git/config')), config)
})

test('actual Git integration preserves the user checkout and reconciles a crash after ref update', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-git-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  await git(root, ['init', '-q'])
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src', 'a'), 'base')
  await git(root, ['add', '.'])
  await git(root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'base'])
  const base = await git(root, ['rev-parse', 'HEAD'])
  const ref = 'refs/heads/dsh/workflow/20260913-1-regression'
  await git(root, ['update-ref', ref, base])
  const worktree = join(root, 'owner'); await git(root, ['worktree', 'add', '-b', 'dsh/owner/test', worktree, base])
  await writeFile(join(worktree, 'src', 'a'), 'candidate')
  const authority = 'owner-authority'
  const pipeline = new SubmissionPipeline({ artifactsRoot: join(root, 'artifacts'), assertAuthority: async () => {} })
  const owner = { id: 'api', scope: ['src/**'], exclude: [] }
  const task = { id: 'T1', title: 'Fix contract', write: ['src/**'], verify: [] }
  const submitted = await pipeline.captureSubmission({ attempt: { id: 'attempt', authority, definitionDigest: 'definition', baseCommit: base }, task, owner, worktree, ownerBranch: 'dsh/owner/test', report: { reason: 'Fix behavior' } })
  const candidate = await pipeline.seal({ id: 'seal', input: { submission: submitted, authority } })
  const input = { candidate, authority, verification: { commitSha: candidate.commitSha, passed: true }, expectedBase: base }
  const action = { id: 'integrate', workflowId: 'wf', attemptId: 'attempt', createdAt: Date.UTC(2026, 8, 13), input, inputDigest: kernelDigest(input) }
  // Identity is supplied only to the isolated child test process; no config file is written.
  const script = `import { WorkflowGitEffects } from ${JSON.stringify(new URL('../src/workflow-git-effects.mjs', import.meta.url).href)};
    const engine = new WorkflowGitEffects({root:${JSON.stringify(root)}, artifactsRoot:${JSON.stringify(join(root, 'git-artifacts'))}, integrationRef:${JSON.stringify(ref)}, assertAuthority:async()=>{}, fault:async()=>{throw new Error('injected crash')}});
    try {await engine.integrate(${JSON.stringify(action)})} catch(error) { if(error.message !== 'injected crash') throw error; }
  `
  await exec(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@invalid' } })
  assert.equal(await git(root, ['rev-parse', 'HEAD']), base)
  assert.equal(await readFile(join(root, 'src', 'a'), 'utf8'), 'base')
  const integrated = await git(root, ['rev-parse', ref]); assert.notEqual(integrated, base)
  const engine = new WorkflowGitEffects({ root, artifactsRoot: join(root, 'git-artifacts'), integrationRef: ref, assertAuthority: async () => {} })
  const result = await engine.observe(action)
  assert.equal(result.commitSha, integrated)
  assert.equal(await git(root, ['show', `${integrated}:src/a`]), 'candidate')
  assert.deepEqual(await engine.integrate(action), result)
  assert.equal(await git(root, ['rev-list', '--count', `${base}..${ref}`]), '2')
  const log = JSON.parse(await readFile(result.worklogRef, 'utf8'))
  const history = JSON.parse(await git(root, ['show', `${integrated}:${log.historyPath}`]))
  assert.equal(history.reason.reason, 'Fix behavior')
  assert.equal(kernelDigest(history), log.historyDigest)
})

test('a read-only Owner review seals its report into history and worklog without business file changes', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ukr-readonly-owner-report-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  await git(root, ['init', '-q'])
  await git(root, ['config', 'user.name', 'Fixture'])
  await git(root, ['config', 'user.email', 'fixture@invalid'])
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src', 'a'), 'base')
  await git(root, ['add', '.'])
  await git(root, ['commit', '-qm', 'base'])
  const base = await git(root, ['rev-parse', 'HEAD'])
  const ref = 'refs/heads/dsh/workflow/readonly-owner-report'
  await git(root, ['update-ref', ref, base])
  const worktree = join(root, 'owner'); await git(root, ['worktree', 'add', '-b', 'dsh/owner/review', worktree, base])
  const authority = 'readonly-owner-authority'
  const artifactsRoot = join(root, 'artifacts')
  const pipeline = new SubmissionPipeline({ artifactsRoot, assertAuthority: async () => {} })
  const report = { status: 'completed', summary: 'Panel and extension are affected; their existing terminal checks must rerun.' }
  const submitted = await pipeline.captureSubmission({ attempt: { id: 'review-attempt', authority, definitionDigest: 'review-definition', baseCommit: base },
    task: { id: 'worker_impact_review', title: 'Review Worker impact', role: 'review', write: [], verify: [] },
    owner: { id: 'worker', scope: ['worker/**'], exclude: [] }, worktree, ownerBranch: 'dsh/owner/review', report })
  const candidate = await pipeline.seal({ id: 'seal-review', input: { submission: submitted, authority } })
  const input = { candidate, authority, verification: { commitSha: candidate.commitSha, passed: true }, expectedBase: base }
  const action = { id: 'integrate-review', workflowId: 'wf', attemptId: 'review-attempt', createdAt: Date.UTC(2026, 8, 14),
    input, inputDigest: kernelDigest(input) }
  const result = await new WorkflowGitEffects({ root, artifactsRoot, integrationRef: ref, assertAuthority: async () => {} }).integrate(action)
  const log = JSON.parse(await readFile(result.worklogRef, 'utf8'))
  const history = JSON.parse(await git(root, ['show', `${result.commitSha}:${log.historyPath}`]))
  assert.deepEqual(log.changed, [])
  assert.deepEqual(log.reason, report)
  assert.deepEqual(history.reason, report)
  assert.equal(await git(root, ['show', `${result.commitSha}:src/a`]), 'base')
})

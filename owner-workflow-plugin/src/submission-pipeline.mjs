import { isManagedRangeStopped } from './execution-evidence.mjs'
import { mkdir, readFile, lstat, rm, realpath } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute, sep } from 'node:path'
import { publishArtifact as publish } from './effect-artifacts.mjs'
import { kernelDigest } from './workflow-engine.mjs'
import { git, statusRecords, currentBranch } from './git.mjs'
import { ownerAllows, scopeMatches } from './model.mjs'
import { isProtectedRelativePath } from './owner-boundary.mjs'
import { createVerificationResult, assertPassingVerification } from './verification.mjs'
import { assertOwnerWrite } from './owner-access.mjs'

function within(root, path) {
  const rel = relative(resolve(root), resolve(path))
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}
async function json(path) { return JSON.parse(await readFile(path, 'utf8')) }
async function exists(path) { try { await lstat(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }

async function removeCandidateWorktree(repositoryRoot, directory, signal, { missingOk = false } = {}) {
  try { await git(repositoryRoot, ['worktree', 'remove', '--force', directory], signal); return }
  catch (error) {
    if (!missingOk) throw error
    await rm(directory, { recursive: true, force: true })
    await git(repositoryRoot, ['worktree', 'prune'], signal).catch(() => undefined)
  }
}

async function checkoutCandidateWorktree(candidate, directory, signal) {
  await removeCandidateWorktree(candidate.repositoryRoot, directory, signal, { missingOk: true })
  await mkdir(resolve(directory, '..'), { recursive: true, mode: 0o700 })
  await git(candidate.repositoryRoot, ['-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--detach', directory, candidate.commitSha], signal)
  return directory
}

function verificationDirectoryNames(id) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,200}$/.test(id)) throw new Error('Invalid verification artifact identity')
  return { active: `verify-${id}` }
}

/** Pipeline receipts live outside model write scope. No method drives a scheduler. */
export class SubmissionPipeline {
  constructor({ artifactsRoot, assertAuthority, executeCommand, reviewCandidate, integrateCandidate, stopCommands, hooks = {} }) {
    this.root = resolve(artifactsRoot)
    this.assertAuthority = assertAuthority
    this.executeCommand = executeCommand
    this.reviewCandidate = reviewCandidate
    this.integrateCandidate = integrateCandidate
    this.stopCommands = stopCommands
    this.hooks = hooks
  }
  location(id) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,200}$/.test(id)) throw new Error('Invalid pipeline artifact identity')
    return join(this.root, id)
  }
  async receipt(action) {
    const path = join(this.location(action.id), 'result.json')
    return await exists(path) ? await json(path) : null
  }
  async captureSubmission({ attempt, task, owner, worktree, ownerBranch, report }, signal) {
    await this.assertAuthority(attempt.authority, { writes: true, signal })
    const source = await realpath(worktree)
    const head = await git(source, ['rev-parse', 'HEAD'], signal)
    if (attempt.baseCommit && head !== attempt.baseCommit) throw new Error('Owner worktree HEAD changed outside the submitted baseline')
    const changes = await statusRecords(source, signal)
    const paths = [...new Set(changes.flatMap(record => [record.path, ...(record.originalPath ? [record.originalPath] : [])]))]
    const illegal = paths.filter(path => isProtectedRelativePath(path) || !ownerAllows(owner, path) || !task.write.some(pattern => scopeMatches(pattern, path)))
    if (illegal.length) throw new Error(`Owner changes exceed authorized scope: ${illegal.join(', ')}`)
    if (await currentBranch(source, signal) !== ownerBranch) throw new Error('Owner worktree is not attached to its durable Owner branch')
    await git(source, ['add', '-A', '--', '.'], signal)
    await git(source, ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
      '-c', 'user.name=DSH Owner Workflow', '-c', 'user.email=dsh-owner-workflow@local',
      'commit', '--allow-empty', '-m', `Owner ${owner.id}: ${task.title}`], signal)
    const commitSha = await git(source, ['rev-parse', 'HEAD'], signal)
    const treeSha = await git(source, ['show', '-s', '--format=%T', commitSha], signal)
    const parent = await git(source, ['show', '-s', '--format=%P', commitSha], signal)
    if (parent.split(/\s+/u)[0] !== attempt.baseCommit) throw new Error('Owner task commit is not based on the admitted task baseline')
    const repositoryRoot = (await git(source, ['worktree', 'list', '--porcelain'], signal)).split(/\r?\n/u)
      .find(line => line.startsWith('worktree '))?.slice('worktree '.length)
    if (!repositoryRoot) throw new Error('Owner repository root is unavailable')
    const value = { contract: 'DSH_SUBMITTED_CANDIDATE_V1', attemptId: attempt.id, authority: attempt.authority,
      definitionDigest: attempt.definitionDigest, worktree: source, baseCommit: attempt.baseCommit,
      repositoryRoot, ownerBranch, commitSha, treeSha, task, owner, report, paths }
    const artifact = join(this.location(`sub-${attempt.id}`), 'submission.json')
    await publish(artifact, value)
    return { artifact, manifestDigest: kernelDigest(value) }
  }
  async seal(action, { signal } = {}) {
    const prior = await this.receipt(action)
    if (prior) { await this.assertCandidate(prior, signal); return prior }
    const submission = action.input.submission
    if (!within(this.root, submission.artifact)) throw new Error('Submission artifact is outside controlled storage')
    const source = await json(submission.artifact)
    if (kernelDigest(source) !== submission.manifestDigest || source.authority !== action.input.authority) throw new Error('Submission receipt mismatch')
    await this.assertAuthority(source.authority, { writes: false, signal })
    const directory = this.location(action.id)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await this.assertAuthority(source.authority, { writes: false, signal })
    const candidate = { repositoryRoot: source.repositoryRoot, ownerBranch: source.ownerBranch,
      baseCommit: source.baseCommit, commitSha: source.commitSha, treeSha: source.treeSha,
      paths: source.paths, authority: source.authority, submissionArtifact: submission.artifact }
    await this.assertCandidate(candidate, signal)
    return publish(join(directory, 'result.json'), candidate)
  }
  async assertCandidate(candidate, signal) {
    if (!candidate.sourceOnly && !within(this.root, candidate.submissionArtifact)) throw new Error('Candidate receipt escapes controlled storage')
    const [tree, parents] = await Promise.all([
      git(candidate.repositoryRoot, ['show', '-s', '--format=%T', candidate.commitSha], signal),
      git(candidate.repositoryRoot, ['show', '-s', '--format=%P', candidate.commitSha], signal),
    ])
    if (tree !== candidate.treeSha || !candidate.sourceOnly && parents.split(/\s+/u)[0] !== candidate.baseCommit) throw new Error('Owner task commit identity changed')
    return candidate
  }
  async restoreCandidate(action, worktree, signal) {
    const candidate = action.input.repair?.candidate
    if (!candidate) return
    await this.assertCandidate(candidate, signal)
    const submitted = await json(candidate.submissionArtifact)
    if (submitted.attemptId !== action.input.repair.fromAttemptId || submitted.definitionDigest !== action.input.definitionDigest) throw new Error('Repair candidate definition does not match the original task')
    const { owner, task, authority } = action.input
    for (const path of submitted.paths) {
      signal?.throwIfAborted()
      if (isProtectedRelativePath(path) || !ownerAllows(owner, path) || !task.write.some(pattern => scopeMatches(pattern, path))) throw new Error('Repair candidate exceeds current scope')
      const [original, current] = await Promise.all([candidate.baseCommit, action.input.baseCommit]
        .map(commit => git(worktree, ['ls-tree', '-z', commit, '--', path], signal)))
      if (original !== current) throw new Error(`Repair baseline changed within its write range: ${path}`)
      const target = join(worktree, path)
      await assertOwnerWrite({ worktree, task, owner, authority }, target, (value, options) => this.assertAuthority(value, { ...options, writes: false }))
      const present = await git(candidate.repositoryRoot, ['cat-file', '-e', `${candidate.commitSha}:${path}`], signal)
        .then(() => true, () => false)
      if (present) await git(worktree, ['restore', '--source', candidate.commitSha, '--worktree', '--', path], signal)
      else await rm(target, { recursive: true, force: true })
    }
  }
  async verify(action, context = {}) {
    const { signal } = context
    const { candidate, task, verifications } = action.input
    await this.assertCandidate(candidate, signal)
    const directory = this.location(action.id)
    for (const verification of verifications) verificationDirectoryNames(verification.id)
    const prior = await this.receipt(action)
    if (prior) {
      if (prior.commitSha !== candidate.commitSha || typeof prior.passed !== 'boolean'
        || !Array.isArray(prior.results) || prior.executionSettled !== true || !prior.review
        || this.stopCommands && prior.results.some(result => !isManagedRangeStopped(result.commandTermination))) throw new Error('Stored verification receipt does not match this candidate or result contract')
      return prior
    }
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const results = []
    for (const verification of verifications) {
      signal?.throwIfAborted()
      const saved = join(directory, `${verification.id}.json`)
      if (await exists(saved)) {
        const result = await json(saved)
        if (this.stopCommands && !isManagedRangeStopped(result.commandTermination)) throw new Error('Stored verification lacks scoped command settlement')
        await removeCandidateWorktree(candidate.repositoryRoot, join(directory, `verify-${verification.id}`), signal, { missingOk: true })
        results.push(result); continue
      }
      const executionDirectory = join(directory, `verify-${verification.id}`)
      let commandReturned = false
      let result
      try {
        await checkoutCandidateWorktree(candidate, executionDirectory, signal)
        const cwd = resolve(executionDirectory, verification.cwd ?? '.')
        if (!within(executionDirectory, cwd) || !within(await realpath(executionDirectory), await realpath(cwd))) throw new Error('Verification cwd escapes snapshot')
        await this.assertAuthority(candidate.authority, { writes: false, signal })
        const evidence = await this.executeCommand({ action, argv: verification.run, cwd, verificationId: verification.id, signal })
        commandReturned = true
        if (this.stopCommands && !isManagedRangeStopped(evidence)) throw new Error('Verification managed command range has not settled')
        await this.hooks.afterCommand?.({ action, verification, evidence })
        result = { ...createVerificationResult({ verificationId: verification.id, argv: verification.run,
          cwd: verification.cwd ?? '.', commitSha: candidate.commitSha,
          exitCode: evidence.exitCode, enforcement: evidence.enforcement, approvalOutcome: evidence.approvalOutcome,
          ok: evidence.ok, timedOut: evidence.timedOut, aborted: evidence.aborted,
          stdout: evidence.stdout, stderr: evidence.stderr }),
          ...(this.stopCommands ? { commandTermination: { managedRangeStopped: evidence.managedRangeStopped,
            terminationScope: evidence.terminationScope, terminationId: evidence.terminationId } } : {}) }
      } catch (error) {
        if (signal?.aborted) throw error
        if (error.code === 'EXECUTION_UNCONFIRMED' || commandReturned) throw error
        const termination = this.stopCommands ? await this.stopCommands(action) : undefined
        if (this.stopCommands && !isManagedRangeStopped(termination)) throw error
        result = { verificationId: verification.id, commitSha: candidate.commitSha, passed: false,
          status: 'execution_error', error: String(error.message ?? error),
          ...(termination ? { commandTermination: termination } : {}) }
      }
      // Publish the command evidence before releasing its disposable worktree.
      await publish(saved, result)
      try { await removeCandidateWorktree(candidate.repositoryRoot, executionDirectory, signal, { missingOk: true }) }
      catch (error) { result = { ...result, cleanupErrors: [{ path: executionDirectory, code: error.code ?? error.name }] } }
      results.push(result)
    }
    await this.assertCandidate(candidate, signal)
    const reviewDirectory = join(directory, 'review-worktree')
    await checkoutCandidateWorktree(candidate, reviewDirectory, signal)
    const review = await this.reviewCandidate({ action, candidate: { ...candidate, artifact: reviewDirectory }, task, results, signal })
    if (review?.pending || review?.deferred) return review
    await removeCandidateWorktree(candidate.repositoryRoot, reviewDirectory, signal, { missingOk: true })
    const passed = results.length === task.verify.length && results.every(result => {
      try { assertPassingVerification(result, candidate.commitSha); return true } catch { return false }
    }) && review?.passed === true && review.commitSha === candidate.commitSha
    const cleanupErrors = results.flatMap(result => result.cleanupErrors ?? [])
    return publish(join(directory, 'result.json'), { commitSha: candidate.commitSha, passed, results, review, executionSettled: true,
      ...(cleanupErrors.length ? { cleanupErrors } : {}) })
  }
  async integrate(action, { signal } = {}) {
    await this.assertCandidate(action.input.candidate, signal)
    await this.assertAuthority(action.input.authority, { writes: false, signal })
    const prior = await this.receipt(action)
    if (prior) return prior
    const result = await this.integrateCandidate(action, { signal })
    return publish(join(this.location(action.id), 'result.json'), result)
  }
  adapters() {
    return Object.fromEntries([['seal_candidate', 'seal'], ['verify_candidate', 'verify'], ['integrate_candidate', 'integrate']]
      .map(([kind, method]) => [kind, {
        execute: (action, context) => this[method](action, context),
        observe: async (action, context) => {
          const prior = await this.receipt(action)
          if (prior) return prior
          return context?.executionQuiescent ? this[method](action, context) : { pending: true, fact: 'unknown' }
        },
      }]))
  }
}

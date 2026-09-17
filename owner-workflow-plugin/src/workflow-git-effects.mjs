import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { git } from './git.mjs'
import { kernelDigest } from './workflow-engine.mjs'
import { artifactPath, publishArtifact, readArtifact } from './effect-artifacts.mjs'
import { ownerAllows, scopeMatches } from './model.mjs'
import { isProtectedRelativePath } from './owner-boundary.mjs'
import { ownerMemoryRepositoryDirectory } from './memory.mjs'
import { orchestratorDocumentPath } from './orchestrator-documents.mjs'

const execFileAsync = promisify(execFile)
async function indexedGit(root, args, { index, input, date, signal } = {}) {
  const pending = execFileAsync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, signal,
    env: { ...process.env, ...(index ? { GIT_INDEX_FILE: index } : {}), ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) } })
  pending.child.stdin?.end(input ?? '')
  return (await pending).stdout.trimEnd()
}
async function treeEntries(root, revision, signal) {
  const records = (await git(root, ['ls-tree', '-r', '-z', revision], signal)).split('\0').filter(Boolean)
  return new Map(records.map(record => {
    const tab = record.indexOf('\t')
    const [mode, type, object] = record.slice(0, tab).split(' ')
    if (tab < 0 || !['blob', 'commit'].includes(type)) throw new Error('Invalid Git tree entry')
    return [record.slice(tab + 1), { mode, object }]
  }))
}

const sha = value => { if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value)) throw new Error('Expected full Git object identity'); return value }

/** Local integration changes only its explicitly allocated Workflow ref. User checkout is untouched. */
export class WorkflowGitEffects {
  constructor({ root, artifactsRoot, integrationRef, assertAuthority, verifyIntegration, fault }) {
    if (!/^refs\/heads\/dsh\/workflow\/[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(integrationRef) || integrationRef.includes('..')) throw new Error('Invalid Workflow integration ref')
    this.root = root; this.artifactsRoot = artifactsRoot; this.ref = integrationRef
    this.assertAuthority = assertAuthority; this.verifyIntegration = verifyIntegration; this.fault = fault
  }
  async integrate(action, { signal } = {}) {
    const { candidate, verification, expectedBase, authority } = action.input
    sha(expectedBase); sha(candidate.baseCommit)
    await this.assertAuthority(authority, { writes: false, signal })
    const [candidateTree, candidateParents] = await Promise.all([
      git(candidate.repositoryRoot, ['show', '-s', '--format=%T', candidate.commitSha], signal),
      git(candidate.repositoryRoot, ['show', '-s', '--format=%P', candidate.commitSha], signal),
    ])
    if (candidateTree !== candidate.treeSha || candidateParents.split(/\s+/u)[0] !== candidate.baseCommit
      || verification.commitSha !== candidate.commitSha || verification.passed !== true) throw new Error('Integration candidate or verification changed')
    const receiptPath = artifactPath(this.artifactsRoot, action.id)
    const prior = await readArtifact(receiptPath)
    if (prior) return prior
    const root = await realpath(this.root)
    const directory = join(this.artifactsRoot, action.id); await mkdir(directory, { recursive: true, mode: 0o700 })
    const preparedPath = artifactPath(this.artifactsRoot, action.id, 'prepared.json')
    let prepared = await readArtifact(preparedPath)
    if (prepared && prepared.inputDigest !== action.inputDigest) throw new Error('Prepared integration input changed')
    if (!prepared) {
      const current = await git(root, ['rev-parse', this.ref], signal)
      if (current !== expectedBase) throw new Error('Integration ref changed before preparation')
      const tree = sha(candidate.treeSha)
      const source = await readArtifact(candidate.submissionArtifact)
      if (!source || source.authority !== authority) throw new Error('Missing submitted scope authority')
      const changed = [...candidate.paths]
      const observedChanged = (await git(root, ['diff', '--name-only', '--no-renames', '-z', candidate.baseCommit, tree], signal)).split('\0').filter(Boolean).sort()
      if (kernelDigest(observedChanged) !== kernelDigest([...changed].sort())) throw new Error('Candidate changed paths do not match its Git tree')
      const illegal = changed.filter(path => isProtectedRelativePath(path) || !ownerAllows(source.owner, path) || !source.task.write.some(scope => scopeMatches(scope, path)))
      if (illegal.length) throw new Error(`Integration changes exceed Owner scope: ${illegal.join(', ')}`)
      const date = new Date(action.createdAt).toISOString()
      const candidateCommit = sha(candidate.commitSha)
      let commitSha = candidateCommit
      let combined = verification
      if (expectedBase !== candidate.baseCommit) {
        const [original, latest, proposed] = await Promise.all([candidate.baseCommit, expectedBase, tree].map(revision => treeEntries(root, revision, signal)))
        for (const path of changed) {
          if (kernelDigest(latest.get(path) ?? null) !== kernelDigest(original.get(path) ?? null)
            && kernelDigest(latest.get(path) ?? null) !== kernelDigest(proposed.get(path) ?? null)) throw new Error(`Integration path changed since the Owner baseline: ${path}`)
        }
        // Owner ranges are disjoint. Apply precisely this candidate's changed
        // paths to the latest tree; no repository merge drivers or hooks run.
        const combinedIndex = join(directory, 'combined.index')
        await indexedGit(root, ['read-tree', expectedBase], { index: combinedIndex, signal })
        const patch = changed.map(path => {
          const entry = proposed.get(path)
          return `${entry?.mode ?? '0'} ${entry?.object ?? '0'.repeat(expectedBase.length)}\t${path}\0`
        }).join('')
        await indexedGit(root, ['update-index', '-z', '--index-info'], { index: combinedIndex, input: patch, signal })
        const combinedTree = sha(await indexedGit(root, ['write-tree'], { index: combinedIndex, signal }))
        commitSha = sha(await indexedGit(root, ['commit-tree', combinedTree, '-p', expectedBase, '-p', candidateCommit, '-m', `Integrate Owner ${source.owner.id}: ${source.task.title}\n\nWorkflow-Action: ${action.id}`], { date, signal }))
        combined = await this.verifyIntegration({ action, commitSha, tree: combinedTree, source, signal })
        if (combined?.pending || combined?.deferred) return combined
        if (combined?.passed !== true || combined.commitSha !== commitSha || combined.executionSettled !== true) throw new Error('Combined integration has not passed verification')
      }
      const codeCommit = commitSha
      const historyPath = `${ownerMemoryRepositoryDirectory(source.owner.id)}/.sources/${action.workflowId}/${action.attemptId}.json`
      const history = { contract: 'DSH_OWNER_HISTORY_V2', workflowId: action.workflowId, attemptId: action.attemptId,
        ownerId: source.owner.id, taskId: source.task.id, reason: source.report, baseCommit: expectedBase, codeCommit,
        changed,
        verification: { passed: combined.passed, commitSha: combined.commitSha,
          results: (combined.results ?? []).map(item => ({ verificationId: item.verificationId, passed: item.passed, testCount: item.testCount, kind: item.kind })),
          review: { passed: combined.review?.passed, commitSha: combined.review?.commitSha, reasons: combined.review?.reasons } } }
      const historyDigest = kernelDigest(history)
      const historyBlob = sha(await indexedGit(root, ['hash-object', '-w', '--stdin'], { input: `${JSON.stringify(history, null, 2)}\n`, signal }))
      const historyIndex = join(directory, 'history.index')
      await indexedGit(root, ['read-tree', codeCommit], { index: historyIndex, signal })
      await indexedGit(root, ['update-index', '-z', '--index-info'], { index: historyIndex, input: `100644 ${historyBlob}\t${historyPath}\0`, signal })
      const historyTree = sha(await indexedGit(root, ['write-tree'], { index: historyIndex, signal }))
      commitSha = sha(await indexedGit(root, ['commit-tree', historyTree, '-p', codeCommit, '-m', `Seal Owner ${source.owner.id} history\n\nWorkflow-Action: ${action.id}\nHistory: ${historyDigest}`], { date, signal }))
      const worklogRef = artifactPath(this.artifactsRoot, action.id, 'worklog.json')
      await publishArtifact(worklogRef, { contract: 'DSH_OWNER_WORKLOG_V2', workflowId: action.workflowId,
        attemptId: action.attemptId, ownerId: source.owner.id, taskId: source.task.id, reason: source.report,
        baseCommit: expectedBase, candidateCommit, commitSha,
        changed, verification: combined, submissionArtifact: candidate.submissionArtifact,
        historyPath, historyDigest, codeCommit })
      prepared = { inputDigest: action.inputDigest, candidateCommit, commitSha, worklogRef,
        baseCommit: expectedBase, verified: true, integrationRef: this.ref, memoryPending: true }
      await publishArtifact(preparedPath, prepared)
    }
    await this.assertAuthority(authority, { writes: false, signal })
    const current = await git(root, ['rev-parse', this.ref], signal)
    if (current === expectedBase) {
      await git(root, ['update-ref', this.ref, prepared.commitSha, expectedBase], signal)
      await this.fault?.('after-ref-update')
    } else if (current !== prepared.commitSha) throw new Error('Integration ref has an unrelated update; do not replay')
    return publishArtifact(receiptPath, prepared)
  }
  async observe(action, context = {}) {
    const saved = await readArtifact(artifactPath(this.artifactsRoot, action.id))
    if (saved) return saved
    const prepared = await readArtifact(artifactPath(this.artifactsRoot, action.id, 'prepared.json'))
    if (prepared?.inputDigest === action.inputDigest && await git(this.root, ['rev-parse', this.ref]) === prepared.commitSha) {
      return publishArtifact(artifactPath(this.artifactsRoot, action.id), prepared)
    }
    // The effects executor holds the Action OS lock: preparation/private Git
    // objects may be reconstructed, while a recorded ref update is never repeated.
    if (context.executionQuiescent) return this.integrate(action, context)
    return { pending: true, fact: 'unknown' }
  }
  async prepareRevision(action, { signal, assertCurrent } = {}) {
    const { previousBase, checkpointCommit, expectedBase } = action.input
    for (const commit of [previousBase, checkpointCommit, expectedBase]) sha(commit)
    if (!assertCurrent) throw new Error('Source revision requires current control authority')
    await assertCurrent()
    const root = await realpath(this.root), receiptPath = artifactPath(this.artifactsRoot, action.id)
    const prior = await readArtifact(receiptPath); if (prior) return prior
    const directory = join(this.artifactsRoot, action.id); await mkdir(directory, { recursive: true, mode: 0o700 })
    const preparedPath = artifactPath(this.artifactsRoot, action.id, 'prepared.json')
    let prepared = await readArtifact(preparedPath)
    if (prepared && prepared.inputDigest !== action.inputDigest) throw new Error('Source revision input changed')
    if (!prepared) {
      const governance = action.input.proposal.sources.registryBaseline
      const planningCommit = governance ? action.input.proposal.sources.codeBaseline?.checkpointCommit : checkpointCommit
      if (!planningCommit || governance && checkpointCommit !== governance.commitSha) throw new Error('Source revision does not bind the approved Registry and planning checkpoint')
      await git(root, ['merge-base', '--is-ancestor', previousBase, planningCommit], signal)
      const planningPaths = (await git(root, ['diff', '--name-only', '--no-renames', '-z', previousBase, planningCommit], signal)).split('\0').filter(Boolean)
      const registryPaths = new Set()
      let registryTree
      if (governance) {
        if (!governance.evidenceRef || !governance.registryDigest) throw new Error('Registry revision lacks approved evidence')
        const sourceHead = action.input.proposal.sources.codeBaseline?.sourceHead
        if (!sourceHead) throw new Error('Registry revision lacks its source baseline')
        await git(root, ['merge-base', '--is-ancestor', sourceHead, governance.commitSha], signal)
        for (const path of (await git(root, ['diff', '--name-only', '--no-renames', '-z', `${governance.commitSha}^`, governance.commitSha], signal)).split('\0').filter(Boolean)) {
          if (!/^\.owner-workflow\/(?:config\.json|owners\/[a-z][a-z0-9_-]*\/owner\.md)$/.test(path)) throw new Error('Registry commit contains non-governance changes')
          registryPaths.add(path)
        }
        registryTree = await treeEntries(root, governance.commitSha, signal)
      }
      const changed = [...new Set([...planningPaths, ...registryPaths])]
      if (!changed.length || changed.some(path => !registryPaths.has(path) && !orchestratorDocumentPath({ root, cwd: root, filePath: path }))) throw new Error('Source revision contains non-planning changes')
      const [original, latest, proposed] = await Promise.all([previousBase, expectedBase, planningCommit].map(revision => treeEntries(root, revision, signal)))
      for (const path of planningPaths.filter(path => registryPaths.has(path))) if (kernelDigest(proposed.get(path) ?? null) !== kernelDigest(registryTree.get(path) ?? null)) throw new Error(`Registry revision changed after approval: ${path}`)
      for (const path of changed) {
        const selected = registryPaths.has(path) ? registryTree.get(path) : proposed.get(path)
        if (kernelDigest(latest.get(path) ?? null) !== kernelDigest(original.get(path) ?? null)
          && kernelDigest(latest.get(path) ?? null) !== kernelDigest(selected ?? null)) throw new Error(`Planning document conflicts with integrated work: ${path}`)
      }
      const index = join(directory, 'revision.index')
      await indexedGit(root, ['read-tree', expectedBase], { index, signal })
      const patch = changed.map(path => { const entry = registryPaths.has(path) ? registryTree.get(path) : proposed.get(path); return `${entry?.mode ?? '0'} ${entry?.object ?? '0'.repeat(expectedBase.length)}\t${path}\0` }).join('')
      await indexedGit(root, ['update-index', '-z', '--index-info'], { index, input: patch, signal })
      const tree = sha(await indexedGit(root, ['write-tree'], { index, signal }))
      const commitSha = sha(await indexedGit(root, ['commit-tree', tree, '-p', expectedBase, '-p', planningCommit,
        ...(governance ? ['-p', governance.commitSha] : []),
        '-m', `Bind revised Spec/Tickets\n\nWorkflow-Action: ${action.id}\nSnapshot: ${action.input.proposal.sources.snapshotDigest}`], { date: new Date(action.createdAt).toISOString(), signal }))
      prepared = { inputDigest: action.inputDigest, baseCommit: expectedBase, checkpointCommit, commitSha, changed,
        evidenceRef: preparedPath, executionSettled: true }
      await publishArtifact(preparedPath, prepared)
    }
    await assertCurrent()
    const current = await git(root, ['rev-parse', this.ref], signal)
    if (current === expectedBase) {
      await git(root, ['update-ref', this.ref, prepared.commitSha, expectedBase], signal)
      await this.fault?.('after-revision-ref-update')
    } else if (current !== prepared.commitSha) throw new Error('Source revision ref changed outside its action')
    return publishArtifact(receiptPath, prepared)
  }
}

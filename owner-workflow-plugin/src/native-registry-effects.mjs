import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir } from 'node:fs/promises'
import { readRegistryForProposal, ensureRegistry, proposeRegistryChange, applyApprovedRegistryChange } from './registry.mjs'
import { OWNER_CONFIGURATION_DIRECTORY, OWNER_COLLECTION_DIRECTORY, OWNER_DESCRIPTOR_FILE } from './project-layout.mjs'
import { kernelDigest } from './workflow-engine.mjs'
import { requestActionDecision } from './native-decision-effects.mjs'
import { artifactPath, publishArtifact, readArtifact } from './effect-artifacts.mjs'

const execute = promisify(execFile)
async function registryGit(root, argv, index, signal) {
  return (await execute('git', argv, { cwd: root, encoding: 'utf8', signal, env: { ...process.env, ...(index ? { GIT_INDEX_FILE: index } : {}) } })).stdout.trim()
}

/** Registry governance is a normal persistent Action, including its exact native decision. */
export class NativeRegistryEffects {
  constructor(store, { git = registryGit } = {}) { this.store = store; this.root = join(store.directory, 'registry-actions'); this.git = git }
  async execute(action, { signal } = {}) {
    const identity = action.retryRootId ?? action.id
    const receipt = artifactPath(this.root, identity)
    const { root, proposal, beforeExists, baseline } = action.input
    const git = (argv, index) => this.git(root, argv, index, signal)
    const prior = await readArtifact(receipt)
    if (prior) {
      if (prior.proposalDigest !== proposal.digest || prior.applied && (await git(['rev-parse', 'HEAD']) !== prior.commitSha
        || kernelDigest((await readRegistryForProposal(root)).registry) !== prior.registryDigest)) throw new Error('Registry receipt no longer matches the installed branch and ownership')
      return prior
    }
    // Recompute the concrete proposal; a model-supplied approvedDigest is never authority.
    const operation = proposal.operation === 'batch' ? { type: 'batch', operations: proposal.operations, reason: proposal.reason } : null
    if (!operation || proposeRegistryChange(proposal.before, operation).digest !== proposal.digest) throw new Error('Registry proposal content changed')
    const decisionPath = artifactPath(this.root, identity, 'decision.json')
    let decision = await readArtifact(decisionPath)
    if (!decision) {
      const state = await this.store.read()
      const original = state.workflows[action.workflowId].decisions[`registry-${identity}`]
      if (original?.status === 'answered' && original.binding.proposalDigest === proposal.digest
        && original.binding.root === root && original.binding.inputDigest === action.inputDigest) decision = original
      else decision = await requestActionDecision(this.store, action, { id: `registry-${action.id}`, kind: 'permission',
        request: { question: '是否应用这一批 Owner 职责与写入范围？', detail: JSON.stringify(proposal, null, 2), options: ['应用这批职责', '取消'] },
        binding: { proposalDigest: proposal.digest, root } }, signal)
      await publishArtifact(decisionPath, decision)
    }
    if (decision.status !== 'answered' || decision.binding.proposalDigest !== proposal.digest
      || decision.binding.root !== root || decision.binding.inputDigest !== action.inputDigest) throw new Error('Registry approval does not bind the retried proposal')
    const id = decision.id
    const answer = decision.answer?.answers?.find(item => item.id === id)
    const approved = !answer?.custom?.trim() && answer?.selected?.length === 1 && answer.selected[0] === '应用这批职责'
    if (!approved) return publishArtifact(receipt, { applied: false, proposalDigest: proposal.digest, evidenceRef: decision.evidenceRef, executionSettled: true })
    const check = async () => {
      signal?.throwIfAborted()
      const state = await this.store.read(), current = state.actions[action.id]
      if (!current || current.stopRequested || state.workflows[action.workflowId].cancelRequested || current.inputDigest !== action.inputDigest) throw new Error('Registry action authority expired')
    }
    await check()
    // Missing identity is a concrete configuration error before any Registry write.
    await git(['var', 'GIT_AUTHOR_IDENT']); await git(['var', 'GIT_COMMITTER_IDENT'])
    const recordedCommit = await readArtifact(artifactPath(this.root, identity, 'commit.json'))
    const currentHead = await git(['rev-parse', 'HEAD'])
    if (await git(['symbolic-ref', 'HEAD']) !== baseline.ref
      || currentHead !== baseline.head && currentHead !== recordedCommit?.commitSha) throw new Error('User branch changed during Registry approval')
    let current = await readRegistryForProposal(root)
    const afterDigest = kernelDigest(proposal.after)
    if (kernelDigest(current.registry) === afterDigest && current.exists) {
      // Only reconcile after our durable intent. Matching user edits alone are not our receipt.
      const intent = await readArtifact(artifactPath(this.root, identity, 'intent.json'))
      if (intent?.proposalDigest !== proposal.digest) throw new Error('Registry changed outside this action')
    } else {
      if (current.exists !== beforeExists && !(current.exists && !beforeExists && current.registry.owners.length === 0)
        || kernelDigest(current.registry) !== kernelDigest(proposal.before)) throw new Error('Registry changed after the exact proposal was approved')
      await publishArtifact(artifactPath(this.root, identity, 'intent.json'), { proposalDigest: proposal.digest, decisionRef: decision.evidenceRef })
      await check()
      if (!current.exists) { await ensureRegistry(root); current = await readRegistryForProposal(root) }
      await check()
      await applyApprovedRegistryChange(root, { ...proposal, approvedDigest: proposal.digest })
    }
    if (kernelDigest((await readRegistryForProposal(root)).registry) !== afterDigest) throw new Error('Registry installation did not match the approved snapshot')
    const commitPath = artifactPath(this.root, identity, 'commit.json')
    let commit = await readArtifact(commitPath)
    if (!commit) {
      if (await git(['rev-parse', 'HEAD']) !== baseline.head
        || await git(['symbolic-ref', 'HEAD']) !== baseline.ref) throw new Error('User branch advanced during Registry approval')
      const directory = join(this.root, identity); await mkdir(directory, { recursive: true, mode: 0o700 })
      const index = join(directory, 'registry.index')
      await git(['read-tree', baseline.head], index)
      const files = [...new Set([`${OWNER_CONFIGURATION_DIRECTORY}/config.json`,
        ...[...proposal.before.owners, ...proposal.after.owners].map(owner => `${OWNER_CONFIGURATION_DIRECTORY}/${OWNER_COLLECTION_DIRECTORY}/${owner.id}/${OWNER_DESCRIPTOR_FILE}`)])]
      await git(['add', '-A', '--', ...files], index)
      const tree = await git(['write-tree'], index)
      const commitSha = await git(['commit-tree', tree, '-p', baseline.head, '-m', `Owner Registry: ${proposal.reason}\n\nWorkflow-Action: ${identity}\nProposal: ${proposal.digest}`])
      commit = { commitSha, baseline, proposalDigest: proposal.digest }
      await publishArtifact(commitPath, commit)
    }
    await check()
    const head = await git(['rev-parse', 'HEAD'])
    if (await git(['symbolic-ref', 'HEAD']) !== baseline.ref) throw new Error('User switched branches during Registry installation')
    if (head === baseline.head) await git(['update-ref', baseline.ref, commit.commitSha, baseline.head])
    else if (head !== commit.commitSha) throw new Error('Registry commit has an unrelated branch update')
    return publishArtifact(receipt, { applied: true, proposalDigest: proposal.digest, registryDigest: afterDigest,
      commitSha: commit.commitSha, evidenceRef: decision.evidenceRef, executionSettled: true })
  }
  adapter() { return { execute: (action, context) => this.execute(action, context), observe: (action, context) => this.execute(action, context) } }
}

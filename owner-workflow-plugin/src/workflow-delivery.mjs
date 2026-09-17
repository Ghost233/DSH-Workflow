import { realpath } from 'node:fs/promises'
import { git, statusRecords } from './git.mjs'
import { artifactPath, readArtifact, publishArtifact } from './effect-artifacts.mjs'

/** Deliver a verified Workflow by fast-forward only; never repairs or clears the user's checkout. */
export class WorkflowDelivery {
  constructor(store, root, { fault } = {}) { this.store = store; this.root = root; this.fault = fault }
  async inspect(action, { prepared = false } = {}) {
    const workflow = (await this.store.read()).workflows[action.workflowId]
    if (!workflow || workflow.cancelRequested || workflow.planVersion !== action.input.planVersion
      || workflow.integrationHead !== action.input.commitSha || workflow.finalVerification?.passed !== true) throw new Error('Final delivery authority expired')
    const root = await realpath(action.input.root)
    if (root !== workflow.root || !action.input.branch || action.input.branch !== workflow.baseBranch) throw new Error('Delivery branch identity is missing or changed')
    const branch = await git(root, ['symbolic-ref', '--short', 'HEAD'])
    if (branch !== action.input.branch) throw new Error('User changed the checkout branch; delivery is preserved for review')
    const changes = (await statusRecords(root, undefined, { readOnly: true })).filter(change => !change.path.startsWith('.dsh-workflow/'))
    const permitted = new Set(action.input.sourcePaths ?? [])
    for (const change of changes) {
      if (!permitted.has(change.path) || change.originalPath
        || !['??', ' M', ...(prepared ? ['A ', 'M '] : [])].includes(change.code)) {
        throw new Error(`User checkout contains changes; delivery will not overwrite them: ${change.path}`)
      }
      const actual = await git(root, ['hash-object', '--', change.path])
      const expected = await git(root, ['rev-parse', '--verify', `${action.input.commitSha}:${change.path}`]).catch(() => null)
      if (actual !== expected) throw new Error(`User checkout contains changes; delivery will not overwrite them: ${change.path}`)
    }
    return { root, head: await git(root, ['rev-parse', 'HEAD']), sourcePaths: changes.map(change => change.path) }
  }
  async execute(action, { signal } = {}) {
    const saved = await readArtifact(artifactPath(this.root, action.id))
    if (saved) return saved
    let inspected
    try {
      const prepared = await readArtifact(artifactPath(this.root, action.id, 'prepared.json'))
      inspected = await this.inspect(action, { prepared: Boolean(prepared) })
      if (inspected.head !== action.input.expectedHead && inspected.head !== action.input.commitSha) throw new Error('User branch advanced; recomposition and verification are required')
    } catch (error) {
      // No checkout mutation has been attempted. Persist this known failure so
      // it cannot become an endless "unknown execution" observation loop.
      return publishArtifact(artifactPath(this.root, action.id), { blocked: true, executionSettled: true,
        reason: error.message, inputDigest: action.inputDigest, evidenceRef: artifactPath(this.root, action.id) })
    }
    const { root, head, sourcePaths } = inspected
    const intent = { root, branch: action.input.branch, expectedHead: action.input.expectedHead, commitSha: action.input.commitSha, planVersion: action.input.planVersion, inputDigest: action.inputDigest }
    await publishArtifact(artifactPath(this.root, action.id, 'prepared.json'), intent)
    if (head !== action.input.commitSha) {
      if (sourcePaths.length) await git(root, ['add', '--', ...sourcePaths], signal)
      try {
        await git(root, ['-c', 'core.hooksPath=/dev/null', 'merge', '--ff-only', '--no-edit', action.input.commitSha], signal)
      } catch (error) {
        if (sourcePaths.length && await git(root, ['rev-parse', 'HEAD']) === head) {
          await git(root, ['restore', '--staged', '--', ...sourcePaths]).catch(() => undefined)
        }
        throw error
      }
    }
    await this.fault?.('after-checkout-update')
    const after = await this.inspect(action)
    if (after.head !== action.input.commitSha) throw new Error('Checkout fast-forward was not confirmed')
    return publishArtifact(artifactPath(this.root, action.id), { ...intent, userCheckoutUpdated: true, evidenceRef: artifactPath(this.root, action.id) })
  }
  async observe(action) {
    const saved = await readArtifact(artifactPath(this.root, action.id))
    if (saved) return saved
    const prepared = await readArtifact(artifactPath(this.root, action.id, 'prepared.json'))
    if (!prepared || prepared.inputDigest !== action.inputDigest) return { pending: true, fact: 'unknown' }
    const current = await this.inspect(action, { prepared: true })
    if (current.head !== action.input.commitSha) return this.execute(action)
    return publishArtifact(artifactPath(this.root, action.id), { ...prepared, userCheckoutUpdated: true, evidenceRef: artifactPath(this.root, action.id) })
  }
  adapter() { return { execute: (action, context) => this.execute(action, context), observe: action => this.observe(action) } }
}

import { artifactPath, readArtifact, publishArtifact } from './effect-artifacts.mjs'
import { kernelDigest } from './workflow-engine.mjs'
import { git } from './git.mjs'
import { ownerMemoryRepositoryDirectory } from './memory.mjs'

/** Raw history is the authority. Summaries are optional, source-bound derived artifacts. */
export class OwnerMemoryEffects {
  constructor(store, sessions, root) { this.store = store; this.sessions = sessions; this.root = root }
  async history(projectRoot, ownerId) {
    const state = await this.store.read()
    const raw = []
    const known = new Set()
    const prefix = `${ownerMemoryRepositoryDirectory(ownerId)}/.sources/`
    const paths = (await git(projectRoot, ['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', prefix])).split('\0').filter(path => path.endsWith('.json'))
    for (const path of paths) {
      const record = JSON.parse(await git(projectRoot, ['show', `HEAD:${path}`]))
      if (record.contract !== 'DSH_OWNER_HISTORY_V2') continue
      if (record.ownerId !== ownerId) throw new Error(`Tracked history has a different Owner: ${path}`)
      const digest = kernelDigest(record); known.add(digest)
      raw.push({ reference: path, digest, commitSha: record.codeCommit, reason: record.reason,
        changed: record.changed, baseCommit: record.baseCommit, historyPath: path })
    }
    for (const workflow of Object.values(state.workflows).filter(item => item.root === projectRoot)) {
      for (const attempt of Object.values(workflow.attempts).filter(item => item.ownerId === ownerId && item.integration)) {
        const path = attempt.integration.worklogRef
        const record = await readArtifact(path)
        if (!record || record.ownerId !== ownerId || record.workflowId !== workflow.id || record.attemptId !== attempt.id
          || record.commitSha !== attempt.integration.commitSha) throw new Error(`Owner history source is missing or inconsistent: ${path}`)
        if (record.historyPath) {
          const tracked = JSON.parse(await git(projectRoot, ['show', `${record.commitSha}:${record.historyPath}`]))
          if (kernelDigest(tracked) !== record.historyDigest) throw new Error(`Tracked Owner history changed: ${record.historyPath}`)
          if (known.has(record.historyDigest)) continue
          known.add(record.historyDigest)
        }
        raw.push({ reference: path, digest: kernelDigest(record), commitSha: record.commitSha,
          reason: record.reason, changed: record.changed, baseCommit: record.baseCommit, historyPath: record.historyPath })
      }
    }
    return { ownerId, root: projectRoot, records: raw, digest: kernelDigest(raw) }
  }
  async validate(action, report) {
    const source = await readArtifact(action.input.worklogRef)
    if (!source || source.ownerId !== action.input.ownerId || source.commitSha !== action.input.commitSha) throw new Error('Owner summary source is unavailable')
    if (report.sourceDigest !== kernelDigest(source) || report.worklogRef !== action.input.worklogRef
      || typeof report.summary !== 'string' || !report.summary.trim()) throw new Error('Owner summary must bind the exact sealed worklog')
    return { sourceDigest: report.sourceDigest, worklogRef: report.worklogRef, summary: report.summary }
  }
  async execute(action, context) {
    const prior = await readArtifact(artifactPath(this.root, action.id))
    if (prior) return prior
    const source = await readArtifact(action.input.worklogRef)
    if (!source || source.ownerId !== action.input.ownerId || source.commitSha !== action.input.commitSha) throw new Error('Cannot summarize missing Owner history')
    const workflow = (await this.store.read()).workflows[action.workflowId]
    const result = await this.sessions.execute(action, context, { role: 'memory-curator', worktree: workflow.root,
      prompt: ['Summarize only this sealed Owner history. Preserve the change reason, version, current behavior and verification limits; do not invent missing history.',
        'Return workflow_action_submit({report:{summary,sourceDigest,worklogRef}}).',
        JSON.stringify({ source, sourceDigest: kernelDigest(source), worklogRef: action.input.worklogRef })].join('\n\n') })
    if (result.pending || result.deferred) return result
    return publishArtifact(artifactPath(this.root, action.id), result)
  }
  adapter() { return { execute: (action, context) => this.execute(action, context),
    observe: async (action, context) => {
      const prior = await readArtifact(artifactPath(this.root, action.id))
      if (prior) return prior
      const result = await this.sessions.observeSession(action, `owner-${kernelDigest([action.id, 'memory-curator']).slice(0, 40)}`, context)
      if (result.pending || result.deferred) return result
      return publishArtifact(artifactPath(this.root, action.id), result)
    } } }
}

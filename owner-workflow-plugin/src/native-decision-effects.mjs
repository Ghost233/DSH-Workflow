import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { withControlLock } from './workflow-store.mjs'
import { artifactPath, readArtifact, publishArtifact } from './effect-artifacts.mjs'
import { askNativeQuestion } from './dsh-execution.mjs'

/** Real root question/answer handling; persisted requests survive a presentation host restart. */
export class NativeDecisionEffects {
  constructor(ctx, store, root) { this.ctx = ctx; this.store = store; this.root = root }
  async execute(action, { signal } = {}) {
    const snapshot = await this.store.read()
    const workflow = snapshot.workflows[action.workflowId]
    const decision = workflow?.decisions[action.input.decisionId]
    if (!decision || decision.status === 'superseded' || workflow.cancelRequested || decision.requestDigest !== action.input.requestDigest) throw new Error('Decision request was superseded')
    const prior = await readArtifact(artifactPath(this.root, action.id))
    if (prior) return prior
    const parent = this.ctx.agents.get(workflow.rootSessionId)
    if (!parent) return { deferred: true, reason: 'root_session_offline' }
    if (!this.ctx.agents.roots().includes(parent) || parent.id !== decision.rootSessionId) throw new Error('Decision must reach its real root Agent')
    await mkdir(join(this.root, action.id), { recursive: true, mode: 0o700 })
    return withControlLock(artifactPath(this.root, action.id, 'presentation.lock'), async () => {
      const answerPath = artifactPath(this.root, action.id, 'answer.json')
      let saved = await readArtifact(answerPath)
      if (!saved) {
        const question = { id: decision.id, header: decision.kind === 'permission' ? '执行权限' : '需求决定',
          question: decision.request.question, detail: decision.request.detail,
          options: (decision.request.options ?? []).map(option => typeof option === 'string' ? { label: option, description: option } : option), multiSelect: false }
        await publishArtifact(artifactPath(this.root, action.id, 'request.json'), { question, requestDigest: decision.requestDigest, rootSessionId: parent.id })
        let answer
        try { answer = await askNativeQuestion(this.ctx.userQuestions, { agent: parent, questions: [question], signal }) }
        catch (error) {
          if (error.code !== 'ASK_CANCELLED') throw error
          answer = { answers: [{ id: decision.id, selected: [], custom: '' }], cancelled: true }
        }
        if (answer?.answers?.length !== 1 || answer.answers[0].id !== decision.id) throw new Error('Native answer does not match the requested decision')
        saved = { answer, requestDigest: decision.requestDigest, rootSessionId: parent.id }
        await publishArtifact(answerPath, saved)
      }
      await this.store.transact({ type: 'decision.answer', workflowId: workflow.id, id: decision.id, requestDigest: saved.requestDigest,
        rootSessionId: saved.rootSessionId, answer: saved.answer, evidenceRef: answerPath })
      return publishArtifact(artifactPath(this.root, action.id), { decisionId: decision.id, requestDigest: decision.requestDigest, persisted: true })
    }, { signal, timeoutMs: 30_000 })
  }
  adapter() { return { execute: (action, context) => this.execute(action, context), observe: (action, context) => this.execute(action, context) } }
}

export async function requestActionDecision(store, action, { id, kind, request, binding }, signal) {
    await store.transact({ type: 'decision.request', workflowId: action.workflowId, id, kind, request,
      binding: { actionId: action.id, inputDigest: action.inputDigest, ...binding } }, { signal })
    // Install before the first read, so an immediate native answer cannot be lost.
    return new Promise((resolveAnswer, reject) => {
      let disposed = false
      const finish = (error, value) => {
        if (disposed) return
        disposed = true; unsubscribe(); signal?.removeEventListener('abort', abort)
        error ? reject(error) : resolveAnswer(value)
      }
      const check = async () => {
        try {
          const state = await store.read(), current = state.actions[action.id]
          const decision = state.workflows[action.workflowId]?.decisions[id]
          if (!current || current.stopRequested || ['failed', 'cancelled', 'succeeded'].includes(current.status)
            || decision?.status === 'superseded') return finish(new Error('Action decision authority expired'))
          if (decision?.status === 'answered') finish(null, decision)
        } catch (error) { finish(error) }
      }
      const unsubscribe = store.subscribe(() => { void check() })
      const abort = () => finish(signal.reason ?? new Error('Action decision cancelled'))
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort(); else void check()
    })
  }

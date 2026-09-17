import { realpath, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { readSessionEvents, sessionEvents } from './dsh-execution.mjs'
import { withControlLock } from './workflow-store.mjs'
import { artifactPath, publishArtifact, readArtifact } from './effect-artifacts.mjs'

function received(events, id) {
  return events.some(event => event.type === 'user/message' && event.data.id === id
    || event.type === 'agent/inbox/spliced' && event.data.inserted?.some(message => message.id === id))
}
function targetHandleClosed(error, sessionId) {
  return error?.name === 'SessionHandleClosedError' && error.sessionId === sessionId
}
/** Delivery means the intended native root's persistence contains this message. */
export class NativeNotificationEffects {
  constructor(ctx, store, root) { this.ctx = ctx; this.store = store; this.root = root }
  async deliver(action, { signal } = {}) {
    const state = await this.store.read()
    const workflow = state.workflows[action.workflowId]
    if (!workflow || workflow.rootSessionId !== action.input.rootSessionId) throw new Error('Notification root binding changed')
    const directory = join(this.root, action.id)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    return withControlLock(artifactPath(this.root, action.id, 'delivery.lock'), async () => {
      const saved = await readArtifact(artifactPath(this.root, action.id))
      if (saved) return saved
      // A dormant root cannot receive a follow-up. Defer before loading its
      // potentially large session history; replay checks the durable message
      // when that exact root becomes live again.
      const agent = this.ctx.agents.get(workflow.rootSessionId)
      if (!agent) return { deferred: true, reason: 'root_session_offline' }
      const stored = await readSessionEvents(this.ctx.sessionPersistence, workflow.rootSessionId, { signal })
      if (stored.header.id !== workflow.rootSessionId
        || await realpath(stored.header.cwd) !== await realpath(workflow.root)) throw new Error('Notification target is not the workflow root session')
      const receipt = { rootSessionId: workflow.rootSessionId, messageId: action.id, persisted: true }
      if (received(stored.events, action.id)) return publishArtifact(artifactPath(this.root, action.id), receipt)
      if (agent.session.header.id !== workflow.rootSessionId || !this.ctx.agents.roots().includes(agent)) throw new Error('Live root identity mismatch')
      const queued = [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some(message => message.id === action.id)
      try {
        if (!received(sessionEvents(agent), action.id) && !queued) {
          agent.followup({ id: action.id, role: 'user', content: [{ type: 'text', text: JSON.stringify({
            contract: 'DSH_WORKFLOW_NOTICE_V1', workflowId: workflow.id, reason: action.input.reason, detail: action.input.detail,
          }) }], source: { kind: 'plugin', plugin: 'dsh-owner-workflow', form: 'notice', summary: 'Owner Workflow 状态报告' } })
        }
        if (await this.ctx.sessions.flush(agent.session) !== true) return { pending: true, fact: 'running' }
      } catch (error) {
        // Agent teardown closes its write handle before unregistering the live
        // identity. That exact refusal is an offline lifecycle edge, not a
        // durability failure. Re-read storage before deferring in case close
        // drained the notice; every other persistence error remains fatal.
        if (!targetHandleClosed(error, workflow.rootSessionId)) throw error
        const closing = await readSessionEvents(this.ctx.sessionPersistence, workflow.rootSessionId, { signal })
        if (received(closing.events, action.id)) return publishArtifact(artifactPath(this.root, action.id), receipt)
        return { deferred: true, reason: 'root_session_offline' }
      }
      const persisted = await readSessionEvents(this.ctx.sessionPersistence, workflow.rootSessionId, { signal })
      if (!received(persisted.events, action.id)) return { pending: true, fact: 'running' }
      return publishArtifact(artifactPath(this.root, action.id), receipt)
    }, { signal })
  }
  adapter() { return { execute: (action, context) => this.deliver(action, context), observe: (action, context) => this.deliver(action, context) } }
}

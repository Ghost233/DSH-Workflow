import { Execution } from './execution.mjs'
/** Agent-local integration. Host objects, not model arguments, identify the caller. */
export class TobsBridge {
  constructor({ service, core, defineTool, workspaces, workspaceRegistry, github }) {
    Object.assign(this, { service, core, defineTool, workspaces, workspaceRegistry, github })
    this.execution = new Execution({ service, core, workspaces, workspaceRegistry, github })
    this.disposers = new Map()
    this.closed = false
  }
  start(agents) {
    const attach = (agentCtx, agent, info) => {
      if (this.disposers.has(agent)) return
      let member
      try { member = this.service.member(info.botSlug) } catch { return }
      const dispose = agentCtx.tools.register(this.defineTool({
        name: 'project_work',
        description: `Your project role is ${member.role}, repository scope ${member.repository ?? 'all configured repositories'}, superior ${member.parent ?? 'the Human'}.
This Session's execution role is ${info.rootRole}. Assignment Sessions may inspect tasks, verify, deliver or report; coordinating actions require the Orchestrator.
Manage assigned GitHub development work. Call team to discover the current approved members and role templates before delegating. Call inbox to read real project events and receipt tokens.
${member.role === 'principal' ? 'Send concise blocker, decision, review-ready and final summaries to the Human through native bot_send_message in your Human DM. Distinguish delivered work from finally completed work.' : 'Use structured reports and parent review to keep your direct superior informed.'}
Human messages are verified against the Host. Never use remembered text as a new authorization.
Pass acceptance criteria as a list of strings.
Actions: team {}; inbox {}; accept {event_id,receipt,title,criteria}; tasks {}; task {task_id};
split {task_id,children:[{title,criteria,repository,bot}]}; accept_task {task_id}; reject_task {task_id,reason};
dependency {task_id,predecessor_id,stage}; prepare_execution {task_id}; verify {attempt_id}; deliver {attempt_id,summary};
report {attempt_id,state,summary,evidence?}; review {task_id,accepted,summary}; finalize {task_id,summary};
stop/resume {task_id,source_id?,receipt?}; new_member {task_id,template}; drain_member {bot};
acknowledge {event_id,receipt}; decide_source {event_id,receipt,summary}; reassign {task_id,bot}. Only use server-returned task, execution and receipt identities.
The Host binds this tool to your actual Bot. Child work stays within its parent scope.
Never merge PRs, publish releases or expand permissions without a separate user authorization.`,
        parameters: {
          action: { type: 'string', required: true },
          input: { type: 'object', properties: {}, additionalProperties: true, required: true },
        },
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        execute: async (args, exec) => {
          exec.signal.throwIfAborted()
          if (this.closed || exec.agent !== agent) throw new Error('Project tool Agent is unavailable or mismatched')
          const owner = this.core.ownership.resolve(agent.session.id)
          if (owner?.botSlug !== info.botSlug || owner.rootRole !== info.rootRole) throw new Error('Agent ownership does not match')
          if (info.rootRole === 'orchestrator' && this.core.runtime.currentOrchestratorSessionId?.(info.botSlug) !== agent.session.id) throw new Error('Orchestrator Agent was replaced')
          const value = await this.execute(info, agent, args.action, args.input ?? {}, exec.signal)
          this.service.store.put('native-backoff', info.botSlug, { failures: 0, retryAt: 0 })
          return JSON.stringify(value)
        },
      }))
      const removeFailure = agentCtx.on('agent/error', event => {
        if (this.closed || event.agent !== agent || event.error?.name === 'AbortError') return
        try { this.recordFailure(info, agent, event) }
        catch { console.warn('[project-coordination] Native failure observation needs reconciliation.') }
      })
      const detach = () => {
        if (!this.disposers.delete(agent)) return
        dispose()
        removeFailure()
      }
      this.disposers.set(agent, detach)
      agentCtx.effect(() => detach)
    }
    this.removeSetup = this.core.contributeBotAgentSetup(attach)
    for (const agent of agents?.list() ?? []) {
      const owner = this.core.ownership.resolve(agent.session.id)
      if (!owner || !['orchestrator', 'assignment'].includes(owner.rootRole)) continue
      if (owner.rootRole === 'orchestrator' && this.core.runtime.currentOrchestratorSessionId(owner.botSlug) !== agent.session.id) continue
      attach(agent.ctx, agent, owner)
    }
  }
  recordFailure(info, agent, event) {
    const { botSlug: bot, rootRole } = info
    const owner = this.core.ownership.resolve(agent.session.id)
    if (owner?.botSlug !== bot || owner.rootRole !== rootRole) return
    const id = `failure:${agent.session.id}:${event.turn}:${event.step}`
    if (this.service.store.get('native-failure', id)) return
    const code = /^[A-Z0-9_]{1,80}$/.test(event.error?.code ?? '') ? event.error.code : 'EXECUTION_ERROR'
    const dependency = /MODEL|PROVIDER|CREDENTIAL|LLM|RATE/.test(code) ? 'model' : /NETWORK|TIMEOUT|ECONN|SERVER|TRANSPORT/.test(code) ? 'network' : 'execution'
    this.execution.reconcile(bot)
    const attempt = this.service.store.list('attempt').find(row => row.bot === bot && row.sessionId === agent.session.id)
    if (attempt && this.service.store.get('task', attempt.taskId)?.hold) return
    if (attempt) this.service.waitFor(attempt.id, dependency, `Native ${dependency} failure (${code}); waiting for recovery`)
    this.service.store.put('native-failure', id, { bot, sessionId: agent.session.id, code, at: this.service.now() })
    const failures = (this.service.store.get('native-backoff', bot)?.failures ?? 0) + 1
    this.service.store.put('native-backoff', bot, { failures,
      retryAt: this.service.now() + Math.min(300000, 1000 * 2 ** Math.min(failures, 9)) })
    const text = `Native ${dependency} execution is waiting for recovery (${code}). Inspect existing tasks and Sessions before retrying; keep stopped tasks stopped.`
    this.service.notify(bot, { id: `recovery:${id}`, kind: 'execution-recovery', actor: bot, text })
    const parent = this.service.member(bot).parent
    if (parent) this.service.notify(parent, { id: `upward:${id}`, kind: 'dependency-wait', actor: bot, text })
  }
  scanHuman(bot) {
    let cursor
    for (let page = 0; page < 10; page++) {
      const batch = this.core.attention.list({ botSlug: bot, limit: 100, ...(cursor ? { cursor } : {}) })
      for (const item of batch.items) {
        if (item.botSlug !== bot || item.reason !== 'human-dm' || item.sourceKind !== 'human-message'
          || item.authorKind !== 'human' || !item.sourceAvailable || !item.sourceChannelId || !item.sourceMessageId) continue
        const createdAt = Date.parse(item.createdAt)
        if (!Number.isFinite(createdAt) || this.service.now() - createdAt > (this.service.configuration.sourceMaxAgeMs ?? 900000)) continue
        const channel = this.core.channels.get(item.sourceChannelId)
        const message = channel && this.core.channels.message(channel.id, item.sourceMessageId)
        if (channel?.type !== 'dm' || channel.botSlug !== bot || channel.remoteBot || message?.author?.kind !== 'human'
          || message.id !== item.sourceMessageId || typeof message.body !== 'string') continue
        this.service.ingestHuman(bot, { id: item.id, text: message.body, createdAt,
          channelId: channel.id, messageId: message.id })
      }
      cursor = batch.nextCursor
      if (!cursor) break
    }
  }
  snapshot(bot, id) {
    const task = this.service.task(bot, id)
    const latestReport = task.latestReportId ? this.service.store.get('report', task.latestReportId) : null
    const pullNumber = task.evidence?.pull && /\/pull\/(\d+)$/.exec(task.evidence.pull)?.[1]
    const proof = (kind, evidenceId) => {
      const value = evidenceId && this.service.store.get(kind, evidenceId)
      return value && this.service.store.get('attempt', value.attemptId)?.taskId === id ? value : null
    }
    return { ...task, latestReport,
      verification: proof('verification', task.evidence?.verificationId),
      verificationFailure: proof('verification-failure', latestReport?.evidence?.verificationFailureId),
      pull: pullNumber ? this.service.store.get('pull', `${task.repositories[0]}:${pullNumber}`) : null,
      githubSync: this.service.store.get('retry', `feedback:${task.id}`) ?? null,
      children: this.service.store.list('task').filter(row => row.parentId === id),
      attempts: this.service.store.list('attempt').filter(row => row.taskId === id) }
  }
  async execute(info, agent, action, input, signal) {
    const bot = info.botSlug
    if (action === 'tasks') return this.service.tasks(bot).map(task => this.snapshot(bot, task.id))
    if (action === 'task') return this.snapshot(bot, input.task_id)
    if (info.rootRole === 'assignment' && ['verify', 'deliver', 'report'].includes(action)) {
      const attempt = this.execution.worker(bot, agent.session.id, input.attempt_id)
      try {
        if (action === 'verify') return await this.execution.verify(bot, agent.session.id, attempt.id, signal)
        if (action === 'deliver') return await this.execution.deliver(bot, agent.session.id, attempt.id, input.summary, signal)
        if (input.state === 'delivered') throw new Error('Use deliver to collect verified PR evidence')
        const evidence = input.state === 'no-change' ? { reason: input.evidence?.reason, ...await this.workspaces.unchanged(attempt) } : input.evidence
        this.execution.worker(bot, agent.session.id, attempt.id)
        return this.service.report(bot, attempt.id, { state: input.state, summary: input.summary, evidence })
      } catch (error) {
        if (error.dependency === 'network' || error.name === 'TypeError' || error.name === 'TimeoutError') this.service.waitFor(attempt.id, 'network', 'Dependency unavailable; inspect before retry', error.retryAfterMs)
        throw error
      }
    }
    if (info.rootRole !== 'orchestrator') throw new Error('This action requires the owning Orchestrator')
    if (action === 'team') return this.service.team(bot)
    if (action === 'prepare_execution') return this.execution.prepare(bot, input.task_id, signal)
    if (action === 'reassign') return this.service.reassign(bot, input.task_id, input.bot)
    if (action === 'decide_source') return this.service.decideSource(bot, input.event_id, input.receipt, input.summary)
    if (action === 'inbox') { this.scanHuman(bot); return this.service.claim(bot) }
    if (action === 'accept') return this.service.accept(bot, input.event_id, input.receipt, { title: input.title, criteria: input.criteria })
    if (action === 'split') return this.service.split(bot, input.task_id, input.children)
    if (action === 'accept_task') return this.service.acceptTask(bot, input.task_id)
    if (action === 'reject_task') return this.service.rejectTask(bot, input.task_id, input.reason)
    if (action === 'dependency') return this.service.addDependency(bot, input.task_id, input.predecessor_id, input.stage)
    if (action === 'review') return this.service.review(bot, input.task_id, input.accepted, input.summary)
    if (action === 'finalize') return this.service.finalize(bot, input.task_id, input.summary)
    if (action === 'acknowledge') return this.service.acknowledge(bot, input.event_id, input.receipt)
    if (action === 'new_member') return this.service.requestMember(bot, input.task_id, input.template)
    if (action === 'drain_member') return this.service.drainMember(bot, input.bot)
    if (action === 'stop' || action === 'resume') {
      const task = this.service[action](bot, input.task_id, input.source_id ? { sourceId: input.source_id, token: input.receipt } : undefined)
      if (action === 'stop') {
        for (const member of new Set(this.service.store.list('attempt').map(row => row.bot))) this.execution.reconcile(member)
        await this.execution.stopPending(signal)
      }
      return task
    }
    throw new Error('Unknown project action')
  }
  close() {
    this.closed = true
    this.removeSetup?.()
    for (const dispose of this.disposers.values()) dispose()
  }
}

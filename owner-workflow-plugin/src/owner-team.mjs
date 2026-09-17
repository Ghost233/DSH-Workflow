import { isAbsolute } from 'node:path'
import { DshCompatibilityError, sessionEvents } from './dsh-execution.mjs'

export const OWNER_TEAM_PROVIDER = 'dsh-owner-workflow:owner-team'
const admittedActivations = new WeakMap()

/** Native history is readable; only the Runner may activate this provider's sessions. */
export function assertOwnerTeamActivation(agent) {
  if (agent.session?.header?.origin !== 'subagent') return
  const descriptor = sessionEvents(agent).find(event => event.type === 'subagent/descriptor')?.data
  if (descriptor?.provider === OWNER_TEAM_PROVIDER
    && !['activating', 'idle', 'running'].includes(admittedActivations.get(agent)?.phase)) {
    throw fail('OWNER_TEAM_RUNNER_REQUIRED', 'Owner Team 会话只能由持有任务租约的 Runner 恢复；请回到主线程处理任务')
  }
}

function fail(code, message) {
  return Object.assign(new Error(message), { code })
}

function identity(record) {
  for (const field of ['workflowRoot', 'workflowId', 'ownerId', 'worktree', 'sessionId', 'parentSessionId']) {
    if (typeof record?.[field] !== 'string' || record[field].length === 0) {
      throw fail('OWNER_TEAM_IDENTITY', `Owner Team 缺少 ${field}`)
    }
  }
  if (!isAbsolute(record.workflowRoot) || !isAbsolute(record.worktree)) {
    throw fail('OWNER_TEAM_IDENTITY', 'Owner Team 工作区必须使用绝对路径')
  }
  return JSON.stringify([record.workflowRoot, record.workflowId, record.ownerId])
}

function containsPrompt(events, promptId) {
  return events.some(event => (event.type === 'user/message' && event.data.id === promptId)
    || (event.type === 'agent/inbox/spliced' && event.data.inserted?.some(message => message.id === promptId)))
}

// A parent Agent's creation options are only its initial route. The Web model
// picker records the live choice in the Session, including a pending choice
// made after the last request. Capture that route when creating each member.
function currentParentOptions(parent) {
  const options = { ...parent.options }
  const routeEvent = sessionEvents(parent).findLast(event => event.type === 'model/selection'
    || event.type === 'request/header')
  if (routeEvent === undefined) return options
  const header = routeEvent.type === 'request/header' ? routeEvent.data.header : undefined
  const selection = header?.config ?? routeEvent.data
  if (typeof selection?.provider !== 'string' || !selection.provider
    || typeof selection?.model !== 'string' || !selection.model) {
    throw fail('OWNER_TEAM_MODEL_SELECTION', '主线程模型选择缺少 provider 或 model')
  }
  delete options.reasoningEffort
  options.provider = selection.provider
  options.model = selection.model
  if (selection.reasoningEffort !== undefined && header?.adapterDefaults?.reasoningEffort !== true) {
    options.reasoningEffort = selection.reasoningEffort
  }
  return options
}

/**
 * Plugin-owned Owner sessions, independent of DSH Agent Teams and one-shot providers.
 * Runner owns durable member records, cross-process Owner leases, worktree/scope
 * checks and acceptance. This class owns live handles and task-local evidence only.
 * Persist a member record before activation; use explicit resume after reconciliation.
 */
export class OwnerTeamSessions {
  #ctx
  #members = new Map()
  #closed = false

  constructor(ctx) {
    this.#ctx = ctx
    for (const method of ['create', 'resume', 'get', 'isOwnedBy']) {
      if (typeof ctx.agents?.[method] !== 'function') {
        throw new DshCompatibilityError(`Owner Team 需要 AgentRegistry.${method}()`)
      }
    }
    if (typeof ctx.sessions?.flush !== 'function') {
      throw new DshCompatibilityError('Owner Team 需要 SessionStore.flush()')
    }
  }

  #assertParent(parent, record) {
    if (this.#ctx.agents.get(parent?.id) !== parent || parent?.id !== record.parentSessionId) {
      throw fail('OWNER_TEAM_PARENT', 'Owner Team 主线程不是当前绑定的存活 Agent')
    }
  }

  async activate(record, parent, { resume = false, setup, signal, agentOptions } = {}) {
    record = Object.freeze({ ...record })
    const key = identity(record)
    this.#assertParent(parent, record)
    if (this.#closed) throw fail('OWNER_TEAM_CLOSED', 'Owner Team 已停止')
    const existing = this.#members.get(key)
    if (existing !== undefined) {
      if (Object.keys(existing.record).some(field => existing.record[field] !== record[field])) {
        throw fail('OWNER_TEAM_IDENTITY', 'Owner Team 成员的会话或工作区绑定已改变')
      }
      if (existing.phase !== 'idle') throw fail('OWNER_TEAM_BUSY', `Owner ${record.ownerId} 正被占用`)
      if (!this.#ctx.agents.isOwnedBy(record.sessionId, parent)
        || this.#ctx.agents.get(record.sessionId) !== existing.handle.agent) {
        throw fail('OWNER_TEAM_STALE', 'Owner Team 会话已失效，需要显式对账和恢复')
      }
      return existing.handle.agent
    }
    const controller = new AbortController()
    const entry = { record: Object.freeze({ ...record }), phase: 'activating', controller }
    this.#members.set(key, entry)
    const options = {
      parentAgent: parent,
      agentOptions: agentOptions ?? currentParentOptions(parent),
      signal: signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal]),
      setup: async (ctx, agent) => {
        if (agent.id !== record.sessionId || agent.session.header.origin !== 'subagent' || agent.session.header.cwd !== record.worktree
          || agent.session.header.parentSession !== record.parentSessionId) {
          throw fail('OWNER_TEAM_IDENTITY', 'Owner Team 持久会话身份或工作区不匹配')
        }
        const presets = parent.ctx.get?.('agentPresets')
        const parentPreset = presets?.composedPreset(parent.ctx)
        if (parentPreset !== undefined) {
          if (typeof presets.composeFrom !== 'function' || presets.composeFrom(ctx, parent.ctx) !== parentPreset) {
            throw new DshCompatibilityError('Owner Team must join the parent’s actual native preset generation before setup')
          }
        }
        entry.agent = agent
        admittedActivations.set(agent, entry)
        const previous = sessionEvents(agent).find(event => event.type === 'subagent/descriptor')?.data
        if (previous !== undefined && (previous.version !== 3 || previous.mode !== 'continuable'
          || previous.provider !== OWNER_TEAM_PROVIDER || previous.label !== `Owner ${record.ownerId}`)) {
          throw fail('OWNER_TEAM_IDENTITY', 'Owner Team 持久会话的原生身份不匹配')
        }
        ctx.on('agent/pre-step', async (_event, next) => {
          let changed = false
          if (!sessionEvents(agent).some(event => event.type === 'subagent/descriptor')) {
            // Public Session event contracts, pinned and exercised against DSH rc.2.
            // An unleased native reconstruction has no tools; Runner setup supplies
            // task-scoped permissions. The creation guard also vetoes that activation.
            const descriptor = { version: 3, mode: 'continuable', provider: OWNER_TEAM_PROVIDER,
              label: `Owner ${record.ownerId}`, toolFilter: { allow: [] } }
            for (const [field, source] of [['agentProvider', 'provider'], ['agentModel', 'model'], ['agentReasoningEffort', 'reasoningEffort']]) {
              if (agent.options[source] !== undefined) descriptor[field] = agent.options[source]
            }
            agent.session.append('subagent/descriptor', descriptor)
            changed = true
          }
          if (!sessionEvents(parent).some(event => event.type === 'subagent/catalog' && event.data.childId === agent.id)) {
            parent.session.append('subagent/catalog', { version: 0, childId: agent.id,
              childCreatedAt: agent.session.header.createdAt, mode: 'continuable', label: `Owner ${record.ownerId}` })
            changed = true
          }
          if (changed && (await this.#ctx.sessions.flush(agent.session) !== true
            || await this.#ctx.sessions.flush(parent.session) !== true)) {
            throw fail('OWNER_TEAM_DURABILITY', 'Owner Team 原生会话目录持久化未确认')
          }
          return next()
        }, { prepend: true })
        await setup?.(ctx, agent)
      },
    }
    entry.activation = (async () => {
      try {
        entry.handle = resume
          ? await this.#ctx.agents.resume({ ...options, resumeSessionId: record.sessionId })
          : await this.#ctx.agents.create({ ...options, sessionId: record.sessionId, meta: {
              cwd: record.worktree, parentSession: parent.id, origin: 'subagent',
              agentPreset: parent.ctx.get?.('agentPresets')?.composedPreset(parent.ctx),
              delegationDepth: Number(parent.session.header.delegationDepth ?? 0) + 1,
            } })
        if (this.#closed) {
          await entry.handle.dispose()
          throw fail('OWNER_TEAM_CLOSED', 'Owner Team 已停止')
        }
        entry.phase = 'idle'
        return entry.handle.agent
      } catch (error) {
        entry.phase = 'faulted'
        this.#members.delete(key)
        throw error
      }
    })()
    return entry.activation
  }

  /** Dispatch is accepted before it settles; neither state means workflow acceptance. */
  async dispatch(record, parent, { taskId, attemptId, planDigest, promptId, prompt, signal, onAccepted }) {
    const key = identity(record)
    this.#assertParent(parent, record)
    const entry = this.#members.get(key)
    if (this.#closed) throw fail('OWNER_TEAM_CLOSED', 'Owner Team 已停止')
    if (entry === undefined || entry.record.sessionId !== record.sessionId
      || entry.record.worktree !== record.worktree) throw fail('OWNER_TEAM_IDENTITY', 'Owner Team 成员尚未激活或绑定不匹配')
    if (entry.phase !== 'idle') throw fail('OWNER_TEAM_BUSY', `Owner ${record.ownerId} 正被占用`)
    for (const value of [taskId, attemptId, planDigest, promptId, prompt]) {
      if (typeof value !== 'string' || value.length === 0) throw fail('OWNER_TEAM_DISPATCH', '派发必须绑定任务、attempt、计划摘要、promptId 和内容')
    }
    const agent = entry.handle.agent
    if (this.#ctx.agents.get(agent.id) !== agent || !this.#ctx.agents.isOwnedBy(agent.id, parent)) {
      throw fail('OWNER_TEAM_STALE', 'Owner Team 会话已失效')
    }
    if (agent.status !== 'idle' || agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0) {
      throw fail('OWNER_TEAM_BUSY', 'Owner Team 会话仍有执行或待处理消息，必须先对账')
    }
    const before = sessionEvents(agent)
    if (containsPrompt(before, promptId)) {
      throw fail('OWNER_TEAM_ALREADY_ACCEPTED', '该 prompt 已被接收，必须先对账，不能重复派发')
    }
    const runSignal = signal === undefined ? entry.controller.signal : AbortSignal.any([signal, entry.controller.signal])
    runSignal.throwIfAborted()
    entry.phase = 'running'
    const settled = Promise.withResolvers()
    entry.settled = settled.promise
    const binding = Object.freeze({ taskId, attemptId, planDigest, promptId, sessionId: agent.id })
    let accepted = false
    let drained = false
    const cancel = () => agent.cancel({ kind: 'parent' })
    runSignal.addEventListener('abort', cancel, { once: true })
    try {
      agent.followup({ id: promptId, role: 'user', content: [{ type: 'text', text: prompt }], source: { kind: 'user' } })
      accepted = true
      if (await this.#ctx.sessions.flush(agent.session) !== true) throw fail('OWNER_TEAM_DURABILITY', 'Owner Team 接收持久化未确认')
      await onAccepted?.(binding)
      await agent.whenIdle()
      drained = true
      runSignal.throwIfAborted()
      if (await this.#ctx.sessions.flush(agent.session) !== true) throw fail('OWNER_TEAM_DURABILITY', 'Owner Team 终态持久化未确认')
      const suffix = sessionEvents(agent).slice(before.length)
      const promptIndex = suffix.findIndex(event => event.type === 'user/message' && event.data.id === promptId)
      const turnStart = suffix.slice(0, promptIndex).findLast(event => event.type === 'turn/start')
      const terminal = suffix.slice(promptIndex + 1).find(event => event.type === 'turn/end' && event.data.turn === turnStart?.data.turn)
      if (promptIndex < 0 || turnStart === undefined || terminal === undefined) {
        throw fail('OWNER_TEAM_NO_TERMINAL', 'Owner Team 当前派发没有已执行的 prompt 和终态证据')
      }
      const events = suffix.filter(event => event.seq >= turnStart.seq && event.seq <= terminal.seq)
      return { binding, events, reason: terminal.data.reason, phase: 'settled' }
    } catch (error) {
      // An accepted dispatch may still be driving when persistence or its receipt fails.
      // Keep occupancy until cancellation has actually converged.
      cancel()
      await agent.whenIdle()
      drained = true
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), { accepted, binding })
    } finally {
      runSignal.removeEventListener('abort', cancel)
      entry.phase = drained ? 'idle' : 'faulted'
      settled.resolve()
    }
  }

  async suspend(record) {
    const key = identity(record)
    const entry = this.#members.get(key)
    if (entry === undefined) return
    if (entry.phase !== 'idle') throw fail('OWNER_TEAM_BUSY', '执行尚未收敛，不能释放 Owner 会话')
    if (entry.record.sessionId !== record.sessionId) throw fail('OWNER_TEAM_IDENTITY', '不能释放不同会话的 Owner')
    entry.phase = 'suspending'
    await entry.handle.dispose()
    this.#members.delete(key)
  }

  async suspendWorkflow(workflowRoot, workflowId) {
    const entries = [...this.#members.values()].filter(entry => entry.record.workflowRoot === workflowRoot
      && entry.record.workflowId === workflowId)
    if (entries.some(entry => entry.phase !== 'idle')) throw fail('OWNER_TEAM_BUSY', 'Owner Team 仍在执行，不能清理工作区')
    for (const entry of entries) await this.suspend(entry.record)
  }

  async dispose() {
    this.#closed = true
    const entries = [...this.#members.values()]
    for (const entry of entries) entry.controller.abort(new Error('Owner Team 已停止'))
    const results = await Promise.allSettled(entries.map(async entry => {
      try {
        await entry.activation
      } catch (error) {
        if (entry.handle === undefined) return
        throw error
      }
      await entry.settled
      await entry.handle.dispose()
    }))
    this.#members.clear()
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason)
    if (failures.length > 0) throw new AggregateError(failures, 'Owner Team 会话释放失败')
  }
}

/**
 * The L2 owner tool plugin — loaded as a STATIC row inside the hub-bot-owner preset's plugins list
 * (cordis.patch.yml), the same proven channel as src/router-tools.js.
 *
 * Six tools (spec #65「L2 会话管理」): search_sessions / read_session / inject_session / create_session /
 * report / escalate. Two disciplines are enforced in code, not left to the prompt:
 *   - identity: the calling session's cwd (workingDirectory service over exec.agent) must match a registered
 *     owner's cwd — owner tools refuse to run anywhere else;
 *   - 越界拒执: create_session/inject_session/read_session targets must live inside the owner's cwd subtree;
 *     anything outside is refused with a pointer at escalate().
 *
 * Worker sessions are created WITHOUT agentPreset, so they run the deployment's default preset — the user's
 * own configuration, never rewritten by the plugin (spec #65).
 */
import { randomUUID } from 'node:crypto'
import { getHub } from './hub.js'
import { ownerPersona, PERSONA_PREFIX_SECTION, PERSONA_PREFIX_ORDER } from './persona.js'
import { TaskError, translateTaskError } from './tasks.js'
import { isWithinCwd } from './paths.js'
import { recordReportFact } from './reporting.js'
import { insertOutbox } from './outbox.js'

export const name = 'hub-bot-owner-tools'
// See router-tools.js: sessionController/sessionPersistence are load-bearing for cross-realm service
// resolution. workingDirectory is the identity channel (session cwd ↔ owner registry row).
export const inject = ['tools', 'systemPrompt', 'sessionController', 'sessionPersistence', 'workingDirectory']

/** The installed hub, or a model-readable failure when the root plugin is absent from the composition. */
function hub(ctx) {
  const found = ctx.reflect.get('hubBot', false) ?? getHub()
  if (!found) throw new Error('hub-bot root plugin is not running in this profile — the owner tools need its store and Sessions port')
  return found
}

function norm(cwd) {
  return typeof cwd === 'string' && cwd.length > 1 && cwd.endsWith('/') ? cwd.slice(0, -1) : cwd
}

/**
 * Resolves the calling owner from the tool-execution's agent: the session cwd must equal a registered owner's
 * cwd. Tools act on behalf of that owner and only inside its subtree.
 */
async function callerOwner(ctx, api, exec) {
  if (!exec?.agent) throw new Error('hub-bot owner tools: no agent context — refusing to act')
  const cwd = norm(await ctx.workingDirectory.ensure(exec.agent, exec.signal))
  const owner = api.registry.list().find(o => o.role === 'owner' && norm(o.cwd) === cwd)
  if (!owner) {
    throw new Error('hub-bot owner tools: session cwd ' + cwd + ' is not a registered owner root — refusing to act')
  }
  return owner
}

/** The session's recorded cwd, looked up in the controller inventory; undefined when unknown. */
async function sessionCwd(ctx, sessionId, signal) {
  const listed = await ctx.sessionController.list({}, signal)
  const item = (listed.items ?? []).find(s => s.sessionId === sessionId)
  return item?.cwd === undefined ? undefined : norm(item.cwd)
}

/** Guard: refuse targets outside the owner's responsibility subtree (越界拒执 — escalate instead). */
async function mustBeInside(ctx, owner, sessionId, signal) {
  const cwd = await sessionCwd(ctx, sessionId, signal)
  if (cwd === undefined) throw new Error('unknown session "' + sessionId + '" in the controller inventory')
  if (!isWithinCwd(norm(owner.cwd), cwd)) {
    throw new Error('session ' + sessionId + ' (cwd ' + cwd + ') is outside this owner\'s subtree ' + owner.cwd + ' — do NOT act across repos; call escalate with the reason instead')
  }
  return cwd
}

function mustOwnTicket(api, owner, ticketId) {
  const ticket = api.tasks.getTicket(ticketId)
  if (!ticket) throw new Error('unknown ticket "' + ticketId + '" — call query via L1 or check the id')
  if (ticket.owner !== owner.id) throw new Error('ticket ' + ticketId + ' belongs to ' + ticket.owner + ', not ' + owner.id)
  return ticket
}

/** Tool surface shape: TaskError → a plain Error carrying the machine-readable code (单一助手 translateTaskError). */
function unwrapTaskError(error) {
  return translateTaskError(error, (code, message) => new Error(code + ': ' + message))
}

/** Compacts one transcript page into model-readable lines: role | text, tool calls by name. */
function compactTranscript(page, max) {
  const out = []
  for (const record of page?.records ?? []) {
    const event = record.event ?? record
    const type = event?.type
    const message = event?.data?.message
    if (!type || !message) continue
    if (type === 'user/message' || type === 'assistant/message' || type === 'system/message') {
      for (const part of message.content ?? []) {
        if (part?.type === 'text' && part.text) out.push(message.role + ': ' + part.text.slice(0, 400))
        if (part.type === 'tool-call') out.push(message.role + ' [tool] ' + (part.name ?? '?') + ' ' + JSON.stringify(part.arguments ?? {}).slice(0, 160))
      }
    }
  }
  return out.slice(-max)
}

export function apply(ctx) {
  const api = hub(ctx)
  ctx.systemPrompt.section({ name: PERSONA_PREFIX_SECTION, order: PERSONA_PREFIX_ORDER, text: ownerPersona() })

  ctx.tools.register({
    name: 'search_sessions',
    description: '搜索责任边界内的会话：列出 cwd 在你责任目录下的会话；给 query 时做内容搜索。先找可复用的执行会话再考虑新建。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '可选：内容搜索关键词' },
        limit: { type: 'number', description: '可选：最多返回几条，缺省 20' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { sessions: { type: 'array' } }, required: ['sessions'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: value.sessions.length === 0
        ? '（责任边界内没有匹配会话）'
        : value.sessions.map(s => s.sessionId + ' | cwd=' + s.cwd + (s.role === 'owner' ? ' | 负责人会话，勿注入' : '') + (s.running ? ' | 运行中' : '') + (s.snippet ? ' | ' + s.snippet.slice(0, 80) : '')).join('\n') }],
    },
    execute: async (args, exec) => {
      const owner = await callerOwner(ctx, api, exec)
      const signal = exec?.signal ?? AbortSignal.timeout(30000)
      const limit = args.limit ?? 20
      if (args.query) {
        const found = await ctx.sessionController.search({ query: args.query }, signal)
        const items = []
        for (const hit of found.items ?? []) {
          const cwd = await sessionCwd(ctx, hit.sessionId, signal)
          if (cwd !== undefined && isWithinCwd(norm(owner.cwd), cwd)) items.push({ sessionId: hit.sessionId, cwd, snippet: hit.snippet })
          if (items.length >= limit) break
        }
        return { sessions: items }
      }
      const listed = await ctx.sessionController.list({}, signal)
      // Tag registry-bound owner sessions so the L2 does not mistake another L2 (preset-only delegates) for a
      // worker session. Note: a session ORPHANED by an owner rebuild keeps its owner preset but leaves the
      // registry, so it cannot be tagged — that residual is documented in the README.
      const ownerSessionIds = new Set(api.registry.list().map(o => o.sessionId).filter(Boolean))
      const sessions = (listed.items ?? [])
        .filter(s => s.cwd !== undefined && isWithinCwd(norm(owner.cwd), norm(s.cwd)))
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, limit)
        .map(s => ({ sessionId: s.sessionId, cwd: norm(s.cwd), running: Boolean(s.running), role: ownerSessionIds.has(s.sessionId) ? 'owner' : 'session' }))
      return { sessions }
    },
  })

  ctx.tools.register({
    name: 'read_session',
    description: '读取一个会话的近期记录（压缩成 role: 文本 行），用于观察执行会话的进展与结果。',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '目标会话 id（必须在责任边界内）' },
        maxMessages: { type: 'number', description: '可选：最多回多少行压缩记录，缺省 30' },
      },
      required: ['sessionId'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { lines: { type: 'array' } }, required: ['lines'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: value.lines.length === 0 ? '（无记录）' : value.lines.join('\n') }],
    },
    execute: async (args, exec) => {
      const owner = await callerOwner(ctx, api, exec)
      const signal = exec?.signal ?? AbortSignal.timeout(30000)
      await mustBeInside(ctx, owner, args.sessionId, signal)
      const page = await ctx.sessionController.page({ address: { kind: 'session', sessionId: args.sessionId }, maxMessages: 200 }, signal)
      return { lines: compactTranscript(page, args.maxMessages ?? 30) }
    },
  })

  ctx.tools.register({
    name: 'create_session',
    description: '在你的责任边界内创建一个执行会话（默认 preset，保持用户自己的配置；插件不改写）。绑定 ticketId 时记入任务记录。',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: '可选：执行会话目录，缺省为你的责任目录；必须在你责任目录之内' },
        ticketId: { type: 'string', description: '可选：绑定到这张任务票' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { sessionId: { type: 'string' }, cwd: { type: 'string' }, preset: { type: 'string' } }, required: ['sessionId', 'cwd', 'preset'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: '执行会话 ' + value.sessionId + '（cwd=' + value.cwd + '，preset=' + value.preset + '）' }],
    },
    execute: async (args, exec) => {
      const owner = await callerOwner(ctx, api, exec)
      const cwd = norm(args.cwd ?? owner.cwd)
      if (!isWithinCwd(norm(owner.cwd), cwd)) {
        throw new Error('create_session: cwd ' + cwd + ' is outside this owner\'s subtree ' + owner.cwd + ' — do NOT act across repos; call escalate with the reason instead')
      }
      // Deliberately no agentPreset: worker Sessions run the deployment default — the user's own preset.
      const created = await ctx.sessionController.create({ cwd })
      const sessionId = created.sessionId ?? created.session?.id
      if (!sessionId) throw new Error('create_session: the controller returned no sessionId')
      if (args.ticketId !== undefined) {
        mustOwnTicket(api, owner, args.ticketId)
        api.tasks.bindWorkerSession(args.ticketId, { sessionId, cwd })
      }
      return { sessionId, cwd, preset: 'default' }
    },
  })

  ctx.tools.register({
    name: 'inject_session',
    description: '向执行会话注入一条消息。带 ticketId 时注入文本自动携带该任务创建时的授权记录（不可变）。requestId 幂等：同值重复注入只送达一次。',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '目标会话 id（必须在责任边界内）' },
        text: { type: 'string', description: '注入正文' },
        ticketId: { type: 'string', description: '可选：关联任务票，注入文本携带其授权记录' },
        requestId: { type: 'string', description: '可选：幂等键，缺省自动生成' },
      },
      required: ['sessionId', 'text'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { accepted: { type: 'boolean' }, requestId: { type: 'string' } }, required: ['accepted', 'requestId'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: value.accepted ? '已注入（' + value.requestId + '）' : '注入未被接受（' + value.requestId + '，幂等去重或队列拒绝）' }],
    },
    execute: async (args, exec) => {
      if (typeof args.text !== 'string' || !args.text.trim()) throw new Error('inject_session: text must be a non-empty string')
      const owner = await callerOwner(ctx, api, exec)
      const signal = exec?.signal ?? AbortSignal.timeout(60000)
      await mustBeInside(ctx, owner, args.sessionId, signal)
      let text
      if (args.ticketId !== undefined) {
        const ticket = mustOwnTicket(api, owner, args.ticketId)
        const auth = ticket.authorization
        // 票面权威（#66）: 授权记录缺失时拒绝凭会话叙事注入 —— 不编造，走 escalate。
        if (!auth) throw new Error('inject_session: ticket ' + args.ticketId + ' has no authorization record on its face — do not act on narrative claims; call escalate instead')
        text = '[hub-bot 任务 ' + args.ticketId + '] ' + args.text.trim()
          + '\n\n授权：' + auth.actor + ' 经 ' + auth.source + ' 于 ' + auth.at + '；任务 ' + args.ticketId + '；负责人 ' + owner.id
      } else {
        text = '[hub-bot 负责人 ' + owner.id + '] ' + args.text.trim()
      }
      const requestId = args.requestId ?? 'hub-bot-owner-' + randomUUID()
      const result = await ctx.sessionController.prompt({
        requestId, sessionId: args.sessionId, mode: 'queue', content: [{ type: 'text', text }],
      }, signal)
      return { accepted: result?.accepted !== false, requestId }
    },
  })

  ctx.tools.register({
    name: 'report',
    description: '把进展归类到任务（三种形态，恰给其一）：summary=干完了（票转等您验收，等用户验收是挡板）；question=需要用户回答（票转等您回复）；failure=不可恢复的失败原因（票转失败）。summary 形态建议同时给四段：result/changes/verification/risks（结果/变更/验证/风险，要么全给要么不给）。每次 report 的事实自动并入本次唤醒的归类摘要：唤醒结束时一条报给总负责人（同仓库多任务只产生一条对外汇报）。写进 report 的必须是已发生的票面事实，不写计划与估计。',
    parameters: {
      type: 'object',
      properties: {
        ticketId: { type: 'string', description: '任务票 id' },
        summary: { type: 'string', description: '形态一：结果摘要（一两句，含落点：文件路径等）' },
        result: { type: 'string', description: '四段之一：结果（做成了什么）' },
        changes: { type: 'string', description: '四段之二：变更（改了哪些文件/配置）' },
        verification: { type: 'string', description: '四段之三：验证（怎么确认的：测试/命令/输出）' },
        risks: { type: 'string', description: '四段之四：风险（遗留问题、需要用户知道的事）' },
        evidence: { type: 'string', description: '可选：证据（transcript 摘录、命令输出要点），配合 summary' },
        question: { type: 'string', description: '形态二：要问用户的一个问题（一两句）' },
        failure: { type: 'string', description: '形态三：不可恢复的失败原因（一两句）' },
      },
      required: ['ticketId'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { ticketId: { type: 'string' }, stage: { type: 'string' }, stageText: { type: 'string' } }, required: ['ticketId', 'stage', 'stageText'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: '任务 ' + value.ticketId + ' 已转入' + value.stageText + '（' + value.stage + '）' }],
    },
    execute: async (args, exec) => {
      const owner = await callerOwner(ctx, api, exec)
      mustOwnTicket(api, owner, args.ticketId)
      const modes = [args.summary !== undefined, args.question !== undefined, args.failure !== undefined].filter(Boolean).length
      if (modes !== 1) throw new Error('report: give exactly one of summary / question / failure')
      const sectionKeys = ['result', 'changes', 'verification', 'risks']
      const givenSections = sectionKeys.filter(k => args[k] !== undefined)
      const sections = givenSections.length === 0 ? undefined
        : Object.fromEntries(sectionKeys.map(k => [k, args[k]]))
      try {
        const ticket = args.question !== undefined
          ? api.tasks.ask({ ticketId: args.ticketId, question: args.question })
          : args.failure !== undefined
            ? api.tasks.fail({ ticketId: args.ticketId, reason: args.failure })
            : api.tasks.report({ ticketId: args.ticketId, summary: args.summary, evidence: args.evidence, sections })
        // #67 汇报链: the fact joins this wake's single digest row (stored first); the runner flushes it to
        // the chief once this session goes idle — one wake, one outward message.
        recordReportFact(api.store, owner.id, ticket)
        await api.router.tick()
        const { text } = api.tasks.summarize(ticket.id)
        return { ticketId: ticket.id, stage: ticket.stage, stageText: text }
      } catch (error) { throw unwrapTaskError(error) }
    },
  })

  ctx.tools.register({
    name: 'escalate',
    description: '上报总负责人：请求越界（超出你的责任目录）、授权与会话叙事矛盾、阻塞或需要裁决时使用。票转为被卡住（blocked），L1 可经 query_tasks 看到；用户的后续消息会把票释放回进行中。',
    parameters: {
      type: 'object',
      properties: {
        ticketId: { type: 'string', description: '可选：关联任务票' },
        reason: { type: 'string', description: '上报原因（一两句）' },
      },
      required: ['reason'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { escalated: { type: 'boolean' } }, required: ['escalated'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: value.escalated ? '已上报总负责人' : '未上报' }],
    },
    execute: async (args, exec) => {
      const owner = await callerOwner(ctx, api, exec)
      try {
        if (args.ticketId !== undefined) {
          mustOwnTicket(api, owner, args.ticketId)
          const ticket = api.tasks.escalate({ ticketId: args.ticketId, reason: args.reason })
          // #67: 被卡住 = 需要行动 — the fact joins this wake's digest to the chief.
          recordReportFact(api.store, owner.id, ticket)
          await api.router.tick()
        } else {
          if (typeof args.reason !== 'string' || !args.reason.trim()) throw new TaskError('reason-required', 'escalate: reason must be a non-empty string')
        }
      } catch (error) { throw unwrapTaskError(error) }
      insertOutbox(api.store, { kind: 'escalation', ticketId: args.ticketId ?? null, ownerId: owner.id, to: 'chief', body: args.reason.trim(), state: 'recorded' })
      return { escalated: true }
    },
  })
}

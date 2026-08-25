import { randomUUID } from 'node:crypto'

import {
  buildReviewerPrompt,
  detectFixedHighRisk,
  evaluateCommandRules,
  parseApprovalSettings,
} from '../vendor/dsh-approve-for-me/src/core/index.ts'

import {
  normalizeOperationApprovalPrefix,
  operationCommandMatchesPrefix,
  operationCommandNeedsApproval,
} from './operation.mjs'

export const OPERATION_ALLOW_ONCE_LABEL = '仅允许这一次'
export const OPERATION_ALLOW_PREFIX_LABEL = '本次会话允许此前缀'
export const OPERATION_REJECT_LABEL = '拒绝'

const APPROVE_FOR_ME_SETTINGS_NAMESPACE = 'approve-for-me'
const REVIEWER_MAX_TOKENS = 1_024
const DEFAULT_REVIEWER_TIMEOUT_MS = 30_000
const REVIEWER_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    decision: { type: 'string', enum: ['allow', 'deny', 'escalate'] },
    rationale: { type: 'string' },
  },
  required: ['decision'],
})

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

function contentText(value) {
  if (!Array.isArray(value)) return ''
  return value
    .filter(block => isRecord(block) && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
}

/** 只把用户、开发者约束和用户选项作为可信上下文，不把工具输出交给审批模型当指令。 */
function trustedTranscript(agent) {
  const result = []
  const surface = agent?.session?.surface?.nodes
  const events = agent?.session?.events
  if (!Array.isArray(surface) || events === undefined) return result
  for (const seq of surface) {
    const event = events[seq]
    if (event?.type !== 'user/message') continue
    const source = isRecord(event.data?.source) ? event.data.source : undefined
    const content = contentText(event.data?.content)
    if (source === undefined || content === '') continue
    if (source.kind === 'user') result.push({ role: 'user', content })
    if (source.kind === 'agent-instructions' && source.form === 'instructions') {
      result.push({ role: 'developer', content })
    }
    if (source.kind === 'user-selection') result.push({ role: 'user-selection', content })
  }
  return result
}

function reviewerOutput(value, maxChars) {
  if (!isRecord(value)) return undefined
  if (Object.keys(value).some(key => key !== 'decision' && key !== 'rationale')) return undefined
  if (!['allow', 'deny', 'escalate'].includes(value.decision)) return undefined
  if (value.rationale !== undefined && typeof value.rationale !== 'string') return undefined
  let serialized
  try {
    serialized = JSON.stringify(value)
  } catch {
    return undefined
  }
  if (serialized.length > maxChars) return undefined
  return value
}

function requestRoute(agent) {
  const config = agent?.session?.requestHeader?.()?.config
  return {
    provider: config?.provider ?? agent?.options?.provider,
    model: config?.model ?? agent?.options?.model,
  }
}

function settingsService(ctx) {
  if (ctx?.settings !== undefined) return ctx.settings
  if (typeof ctx?.get === 'function') return ctx.get('settings')
  return undefined
}

/**
 * 读取已经安装的 dsh-approve-for-me 设置，但不注册同名设置分区，也不接管主代理的 Approval 事件。
 * 上游插件未安装、设置格式不兼容或读取失败时一律回退人工问询。
 */
export function readApproveForMeSettings(ctx) {
  const service = settingsService(ctx)
  if (service === undefined) return { ok: false, reason: 'settings-unavailable' }
  let raw
  try {
    if (typeof service.get === 'function') raw = service.get(APPROVE_FOR_ME_SETTINGS_NAMESPACE)
    if (raw === undefined && typeof service.describe === 'function') {
      raw = service.describe().find(item => String(item?.ns) === APPROVE_FOR_ME_SETTINGS_NAMESPACE)?.value
    }
  } catch {
    return { ok: false, reason: 'settings-unavailable' }
  }
  if (raw === undefined) return { ok: false, reason: 'settings-unavailable' }
  const parsed = parseApprovalSettings(raw)
  if (!parsed.ok) return { ok: false, reason: 'settings-invalid', issues: parsed.issues }
  return { ok: true, settings: parsed.settings }
}

async function reviewWithModel(ctx, {
  operatorAgent,
  parentAgent,
  command,
  description,
  settings,
  signal,
  lifetime,
}) {
  const subagents = ctx?.subagents ?? (typeof ctx?.get === 'function' ? ctx.get('subagents') : undefined)
  if (subagents?.start === undefined) return { allowed: false, reason: 'reviewer-unavailable' }
  const operatorRoute = requestRoute(operatorAgent)
  const parentRoute = requestRoute(parentAgent)
  const provider = settings.reviewer?.provider ?? operatorRoute.provider ?? parentRoute.provider
  const model = settings.reviewer?.model ?? operatorRoute.model ?? parentRoute.model
  if (provider === undefined || model === undefined) return { allowed: false, reason: 'reviewer-route-unavailable' }
  const prompt = buildReviewerPrompt({
    reviewerInstructions: settings.rules.reviewerInstructions,
    trustedTranscript: trustedTranscript(parentAgent),
    untrustedRequest: {
      toolName: process.platform === 'win32' ? 'pwsh' : 'bash',
      command,
      justification: description,
      reason: 'Operation 请求执行一次需要扩大只读沙箱的精确命令',
    },
    limits: settings.limits,
  })
  if (!prompt.ok || prompt.messages.length !== 2) return { allowed: false, reason: 'reviewer-prompt-invalid' }
  const persona = prompt.messages[0]
  const userPrompt = prompt.messages[1]
  if (persona?.role !== 'system' || userPrompt?.role !== 'user') {
    return { allowed: false, reason: 'reviewer-prompt-invalid' }
  }
  const timeout = new AbortController()
  const timeoutMs = settings.reviewer?.timeoutMs ?? DEFAULT_REVIEWER_TIMEOUT_MS
  const timer = globalThis.setTimeout(() => {
    timeout.abort(new Error('Operation 自动审批复核超时'))
  }, timeoutMs)
  const signals = [lifetime, timeout.signal]
  if (signal !== undefined) signals.push(signal)
  const fusedSignal = AbortSignal.any(signals)
  let run
  let disposed = false
  let outcome = { allowed: false, reason: 'reviewer-incomplete' }
  try {
    if (fusedSignal.aborted) outcome = { allowed: false, reason: 'reviewer-aborted' }
    else run = await subagents.start('spawn', {
      parent: operatorAgent,
      label: 'Operation 命令审批复核',
      signal: fusedSignal,
      persona: persona.content,
      prompt: [{ type: 'text', text: userPrompt.content }],
      agentOptions: {
        provider,
        model,
        maxTokens: REVIEWER_MAX_TOKENS,
        operationApprovalReviewer: true,
      },
      toolFilter: { allow: [] },
      outputSchema: REVIEWER_OUTPUT_SCHEMA,
    })
    if (run !== undefined) {
      const result = await run.result
      if (result?.stopReason === 'completed') {
        const verdict = reviewerOutput(result.structured, settings.limits.reviewerOutputChars)
        outcome = verdict?.decision === 'allow'
          ? { allowed: true, reason: 'reviewer-allowed', rationale: verdict.rationale }
          : { allowed: false, reason: `reviewer-${verdict?.decision ?? 'invalid'}`, rationale: verdict?.rationale }
      }
    }
  } catch (error) {
    outcome = { allowed: false, reason: 'reviewer-error', error: errorText(error) }
  } finally {
    if (run !== undefined) {
      try {
        await run.dispose()
        disposed = true
      } catch {
        disposed = false
      }
    }
    globalThis.clearTimeout(timer)
  }
  if (run !== undefined && !disposed) return { allowed: false, reason: 'reviewer-dispose-failed' }
  if (fusedSignal.aborted) return { allowed: false, reason: 'reviewer-aborted' }
  return outcome
}

/** Operation 专用审批插件：只服务 operation_exec，不监听主代理的标准 bash/pwsh Approval。 */
export function createOperationApprovalPlugin(ctx, { clock = () => new Date().toISOString() } = {}) {
  const prefixGrants = new Map()
  const lifetime = new AbortController()
  const activeReviews = new Set()

  const plugin = {
    grantPrefix(parentSessionId, prefix, approvalId, operationId) {
      let grants = prefixGrants.get(parentSessionId)
      if (grants === undefined) {
        grants = new Map()
        prefixGrants.set(parentSessionId, grants)
      }
      const existing = grants.get(prefix)
      if (existing !== undefined) return existing
      const grant = {
        id: `prefix-grant-${randomUUID()}`,
        prefix,
        approvalId,
        operationId,
        grantedAt: clock(),
        useCount: 0,
      }
      grants.set(prefix, grant)
      return grant
    },
    revokePrefix(parentSessionId, grantId) {
      const grants = prefixGrants.get(parentSessionId)
      if (grants === undefined) return
      for (const [prefix, grant] of grants) {
        if (grant.id === grantId) grants.delete(prefix)
      }
      if (grants.size === 0) prefixGrants.delete(parentSessionId)
    },
    matchPrefix(parentSessionId, command) {
      const grants = prefixGrants.get(parentSessionId)
      if (grants === undefined) return undefined
      return [...grants.values()]
        .filter(grant => operationCommandMatchesPrefix(command, grant.prefix))
        .sort((left, right) => right.prefix.length - left.prefix.length)[0]
    },
    clearSession(parentSessionId) {
      prefixGrants.delete(parentSessionId)
    },
    async evaluateAutomatic({ operatorAgent, parentAgent, command, description, signal }) {
      if (lifetime.signal.aborted) return { outcome: 'manual', reason: 'plugin-disposed' }
      // Operation 对设备、系统、网络和远程写操作的保守门禁优先级高于通用白名单；
      // 这类命令只能由用户的一次性授权或本次会话前缀授权放行。
      if (operationCommandNeedsApproval(command)) {
        return { outcome: 'manual', reason: 'operation-explicit-human-required' }
      }
      const captured = readApproveForMeSettings(ctx)
      if (!captured.ok) return { outcome: 'manual', reason: captured.reason }
      const tool = process.platform === 'win32' ? 'pwsh' : 'shell'
      const risk = detectFixedHighRisk(command, tool)
      if (risk.status !== 'safe') return { outcome: 'manual', reason: 'high-risk', signal: risk.signal }
      const rules = evaluateCommandRules(command, tool, captured.settings.rules.commandPrefixes)
      if (rules.status !== 'matched') return { outcome: 'manual', reason: 'rules-unmatched', detail: rules.reason }
      if (captured.settings.mode === 'rules-only') {
        return { outcome: 'allowed-once', source: 'approve-for-me-rules', matchedPrefixes: rules.matchedPrefixes }
      }
      const review = reviewWithModel(ctx, {
        operatorAgent,
        parentAgent,
        command,
        description,
        settings: captured.settings,
        signal,
        lifetime: lifetime.signal,
      })
      activeReviews.add(review)
      let reviewed
      try {
        reviewed = await review
      } finally {
        activeReviews.delete(review)
      }
      if (!reviewed.allowed) return { outcome: 'manual', reason: reviewed.reason }
      return {
        outcome: 'allowed-once',
        source: 'approve-for-me-reviewer',
        matchedPrefixes: rules.matchedPrefixes,
        ...(reviewed.rationale === undefined ? {} : { rationale: reviewed.rationale }),
      }
    },
    async askHuman(agent, pending, exec) {
      const userQuestions = ctx?.userQuestions
        ?? (typeof ctx?.get === 'function' ? ctx.get('userQuestions') : undefined)
      if (userQuestions?.ask === undefined) {
        throw new Error('Harness 没有挂载原生问询服务，不能处理 Operation 命令授权')
      }
      const questionId = `operation-prefix-${pending.id}`
      const options = [
        { label: OPERATION_ALLOW_ONCE_LABEL, description: '只允许当前展示的精确命令执行一次。' },
        ...(pending.commandPrefix === undefined ? [] : [{
          label: OPERATION_ALLOW_PREFIX_LABEL,
          description: `本次主会话允许以“${pending.commandPrefix}”开头的命令。`,
        }]),
        { label: OPERATION_REJECT_LABEL, description: '拒绝当前命令，不创建任何授权。' },
      ]
      const answer = await userQuestions.ask({
        questions: [{
          id: questionId,
          header: 'Operation 授权',
          question: '如何授权这条命令？',
          detail: [
            `动作：${pending.action}`,
            `风险：${pending.risk}`,
            `精确命令：${pending.command}`,
            ...(pending.commandPrefix === undefined ? [] : [`建议前缀：${pending.commandPrefix}`]),
            '',
            '自动审批已经依次检查 Operation 会话白名单、approve-for-me 固定风险、配置白名单和可选模型复核；来到这里表示仍需人工决定。',
            '“本次会话允许此前缀”只匹配完整字面参数边界，不使用通配符；主会话结束或 Harness 重启后自动失效。可以在“其他”中输入当前精确命令的字面前缀。',
          ].join('\n'),
          options,
          multiSelect: false,
        }],
        agent,
        signal: exec?.signal,
      })
      const item = answer?.answers?.find(candidate => candidate?.id === questionId)
      const custom = typeof item?.custom === 'string' ? item.custom.trim() : ''
      if (custom !== '') {
        try {
          return {
            outcome: 'allowed-session-prefix',
            prefix: normalizeOperationApprovalPrefix(custom, pending.command),
            source: 'native-question-custom',
          }
        } catch (error) {
          return { outcome: 'invalid-prefix', feedback: errorText(error), source: 'native-question-custom' }
        }
      }
      const selected = item?.selected?.[0]
      if (selected === OPERATION_ALLOW_ONCE_LABEL) return { outcome: 'allowed-once', source: 'native-question' }
      if (selected === OPERATION_ALLOW_PREFIX_LABEL) {
        return { outcome: 'allowed-session-prefix', prefix: pending.commandPrefix, source: 'native-question' }
      }
      if (selected === OPERATION_REJECT_LABEL) return { outcome: 'rejected', source: 'native-question' }
      throw new Error('Harness 原生问询没有返回有效的 Operation 授权决定')
    },
    async dispose() {
      lifetime.abort(new Error('Operation 专用审批插件已停止'))
      await Promise.allSettled([...activeReviews])
      activeReviews.clear()
      prefixGrants.clear()
    },
  }
  return plugin
}

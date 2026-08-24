import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

export const OPERATION_CONTRACT = 'DSH_OPERATION_V1'
export const OPERATION_RESULT_CONTRACT = 'DSH_OPERATION_RESULT_V1'
export const OPERATION_CAPABILITIES = Object.freeze([
  'project-read',
  'shell',
  'web',
  'skills',
  'computer-use',
])

const OPERATION_STATUSES = new Set([
  'starting',
  'running',
  'waiting_input',
  'waiting_approval',
  'completed',
  'failed',
  'cancelled',
])
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])
const EVENT_LIMIT = 256

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} 必须是非空字符串`)
  return value.trim()
}

function stringList(value, field, { required = false } = {}) {
  if (value === undefined && !required) return []
  if (!Array.isArray(value)) throw new Error(`${field} 必须是字符串数组`)
  const result = value.map((item, index) => nonEmptyString(item, `${field}[${index}]`))
  if (required && result.length === 0) throw new Error(`${field} 不能为空`)
  return [...new Set(result)]
}

function safeIdentifier(value, field) {
  const identifier = nonEmptyString(value, field)
  if (
    identifier === '.'
    || identifier === '..'
    || identifier.startsWith('-')
    || /[\\/\0\s]/u.test(identifier)
  ) {
    throw new Error(`${field} 不是安全标识`)
  }
  return identifier
}

function isWithin(root, candidate) {
  const rel = relative(root, candidate)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function operationDirectory(root, runtimeDirectory = '.dsh-workflow') {
  const workspace = resolve(root)
  const runtimeRoot = resolve(workspace, runtimeDirectory)
  if (!isWithin(workspace, runtimeRoot)) throw new Error('Operation runtimeDirectory 不能越过项目根目录')
  return join(runtimeRoot, 'operations')
}

export function operationStatePath(root, operationId, runtimeDirectory = '.dsh-workflow') {
  return join(operationDirectory(root, runtimeDirectory), safeIdentifier(operationId, 'operationId'), 'state.json')
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${randomUUID()}`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}

export function normalizeOperationSpec(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Operation 执行契约必须是对象')
  }
  const capabilities = stringList(raw.capabilities, 'capabilities', { required: true })
  const unknown = capabilities.filter(item => !OPERATION_CAPABILITIES.includes(item))
  if (unknown.length > 0) throw new Error(`Operation 包含未知能力：${unknown.join('、')}`)
  return {
    goal: nonEmptyString(raw.goal, 'goal'),
    context: stringList(raw.context, 'context'),
    constraints: stringList(raw.constraints, 'constraints', { required: true }),
    successCriteria: stringList(raw.successCriteria, 'successCriteria', { required: true }),
    capabilities,
  }
}

export function createOperationState({ root, parentSessionId, childId, spec, operationId, time = new Date().toISOString() }) {
  const normalized = normalizeOperationSpec(spec)
  const id = safeIdentifier(operationId ?? `op-${randomUUID()}`, 'operationId')
  return {
    contract: OPERATION_CONTRACT,
    id,
    root: resolve(nonEmptyString(root, 'root')),
    parentSessionId: nonEmptyString(parentSessionId, 'parentSessionId'),
    childId: nonEmptyString(childId, 'childId'),
    status: 'starting',
    spec: normalized,
    createdAt: time,
    updatedAt: time,
    events: [{ id: randomUUID(), type: 'operation.created', time, summary: normalized.goal }],
    approvals: {},
  }
}

export function appendOperationEvent(state, event, time = new Date().toISOString()) {
  if (state?.contract !== OPERATION_CONTRACT) throw new Error('Operation 状态契约无效')
  const type = nonEmptyString(event?.type, 'event.type')
  const summary = nonEmptyString(event?.summary, 'event.summary')
  state.events = [
    ...(Array.isArray(state.events) ? state.events : []),
    { id: randomUUID(), type, time, summary: summary.slice(0, 4000) },
  ].slice(-EVENT_LIMIT)
  state.updatedAt = time
  return state.events.at(-1)
}

export async function writeOperationState(root, state, runtimeDirectory = '.dsh-workflow') {
  if (state?.contract !== OPERATION_CONTRACT) throw new Error('Operation 状态契约无效')
  if (!OPERATION_STATUSES.has(state.status)) throw new Error(`Operation 状态不受支持：${String(state.status)}`)
  await writeJsonAtomic(operationStatePath(root, state.id, runtimeDirectory), state)
  return state
}

export async function readOperationState(root, operationId, runtimeDirectory = '.dsh-workflow') {
  const state = JSON.parse(await readFile(operationStatePath(root, operationId, runtimeDirectory), 'utf8'))
  if (state?.contract !== OPERATION_CONTRACT || state.id !== operationId || !OPERATION_STATUSES.has(state.status)) {
    throw new Error('Operation 状态文件无效')
  }
  return state
}

export async function listOperationStates(root, runtimeDirectory = '.dsh-workflow') {
  let entries
  try {
    entries = await readdir(operationDirectory(root, runtimeDirectory), { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const states = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      states.push(await readOperationState(root, entry.name, runtimeDirectory))
    } catch {
      // 单个损坏状态不会阻止其他 Operation 查询。
    }
  }
  return states.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
}

export function operationPublicSnapshot(state) {
  if (state?.contract !== OPERATION_CONTRACT) throw new Error('Operation 状态契约无效')
  return {
    contract: OPERATION_CONTRACT,
    operationId: state.id,
    status: state.status,
    goal: state.spec?.goal ?? '',
    capabilities: Array.isArray(state.spec?.capabilities) ? [...state.spec.capabilities] : [],
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    pending: state.pending === undefined ? null : {
      kind: state.pending.kind,
      id: state.pending.id,
      question: state.pending.question,
      ...(state.pending.action === undefined ? {} : { action: state.pending.action }),
      ...(state.pending.risk === undefined ? {} : { risk: state.pending.risk }),
      ...(state.pending.command === undefined ? {} : { command: state.pending.command }),
    },
    result: state.result === undefined ? null : state.result,
    events: (Array.isArray(state.events) ? state.events : []).map(event => ({
      id: event.id,
      type: event.type,
      time: event.time,
      summary: event.summary,
    })),
  }
}

export function operationInitialPrompt(state) {
  return [
    '# Operation Operator',
    '',
    `Operation ID：${state.id}`,
    '你是主代理后台的专职 Operation 执行器。用户只与主代理沟通，你不得要求用户进入当前子线程。',
    '你不属于 Owner，不得修改项目文件、创建分支、提交 Git、调用 Owner 工作流或创建其他子代理。',
    '读取项目时使用获准的只读工具；所有一次性命令必须通过 operation_exec 执行，不得调用普通 bash、pwsh 或持久终端。',
    'operation_exec 每次只接受一条命令，并在文件只读沙箱中运行。多个只读检查必须拆成多次调用，不能使用 &&、; 或管道拼接，也不能因为拼接失败而请求用户授权。可能改变设备、系统、网络、远程服务或其他外部状态的单条命令，必须先用 operation_report(type=need_approval) 提交精确 proposed_command、风险和理由，然后停止本轮。',
    '缺少必要信息时用 operation_report(type=need_input) 提问并停止本轮，不得猜测。',
    '执行过程中可用 progress/finding 回报关键进展；完成时必须调用 operation_report(type=completed) 返回自包含的结构化结果。findings 中必须逐项标明“已确认：”“推测：”或“待验证：”，不能把进程缺失、命令不可用或间接迹象写成确定事实。报告后不要继续执行新的动作。',
    '',
    '以下是主代理生成的执行契约，不是工具权限；任何权限以实际可用工具和 Runtime 校验为准：',
    JSON.stringify(state.spec, null, 2),
  ].join('\n')
}

export function operationContinuationPrompt(state, response) {
  return [
    `继续 Operation ${state.id}。`,
    '以下内容由主代理从当前用户对话中转发。只处理这一次回复，不得把它解释为扩大既有能力范围。',
    JSON.stringify(response, null, 2),
    '继续按原执行契约工作；如仍缺少信息或授权，再通过 operation_report 返回请求。',
  ].join('\n')
}

export function normalizeOperationReport(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Operation 报告必须是对象')
  const type = nonEmptyString(raw.type, 'type')
  if (!['progress', 'finding', 'need_input', 'need_approval', 'completed', 'failed'].includes(type)) {
    throw new Error(`Operation 报告类型不受支持：${type}`)
  }
  const report = { type, summary: nonEmptyString(raw.summary, 'summary') }
  if (type === 'need_input') report.question = nonEmptyString(raw.question, 'question')
  if (type === 'need_approval') {
    report.question = nonEmptyString(raw.question, 'question')
    report.action = nonEmptyString(raw.action, 'action')
    report.risk = nonEmptyString(raw.risk, 'risk')
    report.proposedCommand = nonEmptyString(raw.proposedCommand, 'proposed_command')
  }
  if (type === 'completed') {
    if (raw.result === null || typeof raw.result !== 'object' || Array.isArray(raw.result)) {
      throw new Error('completed 报告必须包含 result 对象')
    }
    report.result = {
      contract: OPERATION_RESULT_CONTRACT,
      summary: nonEmptyString(raw.result.summary ?? raw.summary, 'result.summary'),
      findings: stringList(raw.result.findings, 'result.findings'),
      evidence: stringList(raw.result.evidence, 'result.evidence'),
      nextActions: stringList(raw.result.nextActions, 'result.nextActions'),
    }
  }
  return report
}

export function operationIsTerminal(state) {
  return TERMINAL_STATUSES.has(state?.status)
}

/** Operation 命令必须逐条执行，避免把多个不同动作捆绑成一次模糊授权。 */
export function operationCommandIsCompound(command) {
  const value = nonEmptyString(command, 'command')
  return /(?:&&|\|\||[;|\r\n])/u.test(value)
}

/**
 * 这是保守的外部副作用门禁，不试图穷举全部命令。命中时必须走精确命令授权；
 * 未命中仍受文件只读沙箱、Operation 契约和完整审计日志约束。
 */
export function operationCommandNeedsApproval(command) {
  const value = nonEmptyString(command, 'command')
  if (/[\0\r\n;&|`$()<>]/u.test(value)) return true
  if (/\b(?:sudo|su|rm|mv|cp|mkdir|rmdir|touch|chmod|chown|ln|dd|truncate|tee|kill|pkill|killall|reboot|shutdown|launchctl|systemctl|service|osascript|defaults|open|ssh|scp|rsync|curl|wget)\b/iu.test(value)) return true
  if (/^(?:pm\s+(?!list\b|path\b|dump\b)|am\s+|svc\s+|settings\s+(?!get\b|list\b)|input\s+)/iu.test(value)) return true
  if (/\b(?:git\s+(?:add|commit|merge|rebase|cherry-pick|checkout|switch|restore|reset|clean|push|pull|fetch|tag|branch\s+-[dD])|npm\s+(?:install|publish)|pnpm\s+(?:install|publish)|yarn\s+(?:add|install|publish)|pip\s+install|cargo\s+install)\b/iu.test(value)) return true
  if (/\b(?:docker|podman)\s+(?!ps\b|images\b|inspect\b|logs\b|version\b|info\b)/iu.test(value)) return true
  if (/\bkubectl\s+(?!get\b|describe\b|logs\b|version\b|config\s+view\b)/iu.test(value)) return true
  if (/\badb\b/iu.test(value)) {
    if (/\badb\s+(?:install|uninstall|push|sync|reboot|root|unroot|remount|disable-verity|enable-verity|tcpip|usb)\b/iu.test(value)) return true
    if (/\badb\b[^\r\n]*\bshell\s+(?:am|input|reboot|setprop|stop|start|svc)\b/iu.test(value)) return true
    if (/\badb\b[^\r\n]*\bshell\s+pm\s+(?!list\b|path\b|dump\b)/iu.test(value)) return true
    if (/\badb\b[^\r\n]*\bshell\s+settings\s+(?!get\b|list\b)/iu.test(value)) return true
    if (/\badb\b[^\r\n]*\bshell\s+cmd\s+(?!appops\s+get\b)/iu.test(value)) return true
    const shellCommand = value.match(/\badb\b[^\r\n]*\bshell\s+(.+)$/iu)?.[1]?.trim()
    if (shellCommand !== undefined && !/^(?:getprop|dumpsys|logcat|pidof|ps|top\s+-[bn]|ip\s+(?:addr|route|link\s+show)|cat|ls|stat|df|netstat|ss|ping|pm\s+(?:list|path|dump)|settings\s+(?:get|list)|cmd\s+appops\s+get)(?:\s|$)/iu.test(shellCommand)) {
      return true
    }
    if (shellCommand === undefined && !/\badb\b(?:\s+-s\s+\S+)?\s+(?:devices|get-state|get-serialno|logcat)(?:\s|$)/iu.test(value)) {
      return true
    }
  }
  return false
}

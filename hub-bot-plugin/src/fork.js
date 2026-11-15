/**
 * The fork path (issue #69, spec「路由判断」场景四 + 「错误场景」确认超时）.
 *
 * fork 是重操作：L2 负责人在上下文污染/走偏/工具故障/独立开发隔离时经 fork_session 工具（src/owner-tools.js）
 * 发起确认 —— 意图以结构化 action 落在票面 pendingConfirm（先存后做），票转 person/confirm，确认文本由
 * 代码生成（指明对象与预期结果，消息纪律第 3 条），经汇报链呈给用户。
 *
 * 用户确认（route_to_owner resolution:"confirm"）后由本模块代码化执行 —— 会话形态变更不靠模型自觉：
 * dsh-api-session-controller fork() 从源会话的最近完成回合（或指定 atSeq 含边界）切出前缀建成新会话，
 * 任务绑到新会话续作（mechanism:'fork' + 新 Assignment），原会话保留可查、不再注入（互不干扰）。
 * 用户否定（"reject"）票转被卡住、保持原会话；取消（"cancel"）与 24h 超时是终态（见 src/router.js 清扫）。
 */
import { TaskError } from './tasks.js'

/** The pendingConfirm.action.type marking a fork intent. */
export const FORK_ACTION_TYPE = 'fork'

/**
 * Builds (and validates) the stored fork intent. atSeq is the inclusive source event boundary
 * (dsh-api-session-controller SessionForkRequest.atSeq) — omitting it forks the latest completed-turn prefix;
 * passing one cuts BEFORE the pollution started （上下文污染场景的关键能力）.
 */
export function buildForkAction({ sessionId, cwd, atSeq, reason }) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw new TaskError('fork-session-required', 'fork: sessionId must be a non-empty string')
  if (typeof cwd !== 'string' || !cwd.trim()) throw new TaskError('fork-cwd-required', 'fork: cwd must be a non-empty string (the fork inherits it)')
  if (typeof reason !== 'string' || !reason.trim()) throw new TaskError('fork-reason-required', 'fork: reason must say why and to what end (一两句)')
  const action = { type: FORK_ACTION_TYPE, sessionId: sessionId.trim(), cwd, reason: reason.trim() }
  if (atSeq !== undefined) {
    if (!Number.isSafeInteger(atSeq) || atSeq < 0) throw new TaskError('fork-atseq-invalid', 'fork: atSeq must be a non-negative safe integer')
    action.atSeq = atSeq
  }
  return action
}

/**
 * The user-facing confirmation text is built by CODE from the action — 指明对象与预期结果， never free prose
 * (spec 消息纪律： Confirm concretely, once). The owner's reason is quoted verbatim inside.
 */
export function forkConfirmText(action, ticketId) {
  return '确认 fork：把会话 ' + action.sessionId + '（cwd=' + action.cwd + '）'
    + (action.atSeq !== undefined ? ' 从事件 ' + action.atSeq + '（含）处' : '')
    + ' fork 出一个新会话，继续任务 ' + ticketId + '——' + action.reason
    + '。预期结果：任务在新会话续作，原会话保留可查、不再注入。确认后执行。'
}

/**
 * Executes the stored fork intent on user confirmation (route resolution "confirm" 的执行体）.
 * Order matters: fork FIRST, then the state transition — a fork failure leaves the ticket at person/confirm
 * so the user can retry or reject. Throws TaskError with a machine-readable code on every failure mode.
 *
 * @returns {{ ticket: object, fromSessionId: string, sessionId: string, cwd: string, atSeq?: number }}
 */
export async function confirmTicketFork({ tasks, sessions, ticketId }) {
  const ticket = tasks.getTicket(ticketId)
  if (!ticket) throw new TaskError('unknown-ticket', 'unknown ticket "' + ticketId + '"')
  if (ticket.stage !== 'person/confirm') throw new TaskError('illegal-transition', 'ticket ' + ticketId + ': confirm requires person/confirm, got ' + ticket.stage)
  const action = ticket.pendingConfirm?.action
  if (!action || action.type !== FORK_ACTION_TYPE) throw new TaskError('no-pending-fork', 'ticket ' + ticketId + ' has no pending fork action')
  if (typeof sessions.fork !== 'function') throw new TaskError('fork-unavailable', 'the Sessions port has no fork capability (hub-bot index wiring missing)')
  let forked
  try {
    forked = await sessions.fork({ sessionId: action.sessionId, ...(action.atSeq !== undefined ? { atSeq: action.atSeq } : {}) })
  } catch (error) {
    throw new TaskError('fork-failed', 'fork of session ' + action.sessionId + ' failed: ' + (error instanceof Error ? error.message : String(error)))
  }
  const sessionId = forked?.sessionId ?? forked?.session?.id
  if (typeof sessionId !== 'string' || !sessionId) throw new TaskError('fork-empty', 'sessions.fork returned no session id')
  const confirmed = tasks.confirm({ ticketId, result: { fork: { fromSessionId: action.sessionId, sessionId } }, by: 'user' })
  const bound = tasks.bindWorkerSession(ticketId, { sessionId, cwd: action.cwd, mechanism: 'fork' })
  void confirmed
  return { ticket: bound, fromSessionId: action.sessionId, sessionId, cwd: action.cwd, atSeq: action.atSeq }
}

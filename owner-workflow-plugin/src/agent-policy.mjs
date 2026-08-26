/**
 * 子代理能力策略只负责选择沙箱，不维护易失的工具白名单。
 * Harness 新增或重命名工具时，Owner、Planner 和 Operator 不应因此失去基础能力。
 */
export const READ_ONLY_AGENT_ROLES = new Set([
  'planner',
  'plan-reviewer',
  'reviewer',
  'memory-curator',
  'memory-reviewer',
])

const MAIN_MUTATING_TOOLS = new Set([
  'write',
  'edit',
  'str_replace_editor',
  'apply_patch',
  'bash',
  'pwsh',
  'shell',
  'terminal',
  'terminal_open',
  'terminal_send',
  'terminal_signal',
  'terminal_close',
  'subagent',
  'subagent_fork',
  'subagent_acp',
  'subagent_codex',
  'subagent_claude_code',
  'send_message',
  'interrupt_agent',
  'owner_write',
  'owner_edit',
  'owner_bash',
  'owner_verify',
  'owner_repair',
  'owner_submit',
  'owner_memory_note',
  'owner_host_exec',
  'request_subgraph',
  'request_handoff',
])
const MAIN_MUTATION_NAME = /(?:^|_)(?:write|edit|patch|create|delete|remove|update|deploy|publish|push|send|execute|run)(?:_|$)/u

const OWNER_DESCENDANT_TOOLS = new Set([
  'subagent',
  'subagent_fork',
  'subagent_acp',
  'subagent_codex',
  'subagent_claude_code',
])

function isOrchestrationTool(toolName) {
  return toolName === 'owner_workflow'
    || toolName.startsWith('workflow_')
    || toolName.startsWith('operation_')
}

function childOrchestrationToolAllowed(role, toolName) {
  if (toolName === 'workflow_git_inspect') return true
  if (role === 'planner' && toolName === 'workflow_plan_submit') return true
  if (role === 'plan-reviewer' && toolName === 'workflow_plan_review_submit') return true
  if (role === 'operator' && ['operation_report', 'operation_exec'].includes(toolName)) return true
  return false
}

/** 子代理继承完整工具集；文件写入能力交给 Harness 沙箱。 */
export function configureChildSandbox(childCtx, role) {
  const mode = role === 'owner' ? 'workspace-write' : 'read-only'
  const approvalPolicy = role === 'owner' ? 'ask' : 'never'
  childCtx.agent?.session?.append?.('sandbox/mode', { mode })
  // Owner 的受控桥接请求需要在任务现场显示原生卡片；其他子代理仍确定性关闭授权。
  const approvalEvents = Array.isArray(childCtx.agent?.session?.events)
    ? childCtx.agent.session.events.filter(event => event?.type === 'approval/policy')
    : []
  if (approvalEvents.at(-1)?.data?.policy !== approvalPolicy) {
    childCtx.agent?.session?.append?.('approval/policy', {
      policy: approvalPolicy,
      source: role === 'owner' ? 'owner-workflow' : 'delegation',
    })
  }
  return mode
}

/**
 * 主代理启用 Owner 模式后只阻止已知的直接开发入口。
 * 未知工具不再默认拒绝，避免 Harness 升级后只读能力因白名单漂移而失效。
 */
export function toolExecutionDenial({ activeOwner, role, modeEnabled, toolName, toolArguments }) {
  if (activeOwner !== undefined) {
    if (['bash', 'pwsh'].includes(toolName)
      && toolArguments !== null
      && typeof toolArguments === 'object'
      && Object.hasOwn(toolArguments, 'sandbox_permissions')) {
      return `Owner ${activeOwner.owner?.id ?? '未知'} 不能通过 Shell 参数直接申请沙箱升级；移除 sandbox_permissions 后先在 workspace-write 运行。只有该精确命令实际被沙箱拒绝且需要 worktree 外资源时，才可调用 owner_host_exec`
    }
    if (OWNER_DESCENDANT_TOOLS.has(toolName)) {
      return `Owner ${activeOwner.owner?.id ?? '未知'} 同时只能运行一个执行子线程，不能再创建后代 Agent`
    }
    if (isOrchestrationTool(toolName)) {
      return `Owner ${activeOwner.owner?.id ?? '未知'} 不能控制 Workflow 或 Operation；协调只通过 owner_submit、request_handoff 和 request_subgraph`
    }
    return undefined
  }
  if (role !== undefined) {
    if (isOrchestrationTool(toolName) && !childOrchestrationToolAllowed(role, toolName)) {
      return `${role} 子代理不能控制主 Workflow 或创建其他 Operation`
    }
    return undefined
  }
  if (!modeEnabled) return undefined
  if (!MAIN_MUTATING_TOOLS.has(toolName) && !MAIN_MUTATION_NAME.test(toolName)) return undefined
  return `Owner 工作模式已启用，主会话不能直接调用 ${toolName}；代码修改交给 Owner，非编码执行交给 Operator`
}

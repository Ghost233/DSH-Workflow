import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

const OWNER_HOST_EXEC_TOOL = 'owner_host_exec'

function sessionIdOf(exec) {
  return exec?.agent?.id ?? exec?.agent?.session?.header?.id
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`owner_host_exec 必须提供非空 ${label}`)
  }
  return value.trim()
}

function isWithin(root, candidate) {
  const rel = relative(root, candidate)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function resolveWorkdir(active, value) {
  const worktree = resolve(active.worktree)
  const requested = value === undefined
    ? worktree
    : resolve(worktree, requiredText(value, 'workdir'))
  if (!isWithin(worktree, requested)) {
    throw new Error(`owner_host_exec 的 workdir 只能位于当前 Owner worktree：${requested}`)
  }
  if (!existsSync(requested)) throw new Error(`owner_host_exec 的 workdir 不存在：${requested}`)
  const realWorktree = realpathSync(worktree)
  const realRequested = realpathSync(requested)
  if (!isWithin(realWorktree, realRequested)) {
    throw new Error(`owner_host_exec 的 workdir 经过链接越过当前 Owner worktree：${requested}`)
  }
  return requested
}

function publicShellResult(result) {
  return {
    kind: result?.kind ?? 'foreground',
    exitCode: result?.exitCode ?? null,
    signal: result?.signal ?? null,
    timedOut: result?.timedOut === true,
    aborted: result?.aborted === true,
    timeoutMs: result?.timeoutMs,
    stdout: result?.stdout?.text ?? '',
    stdoutTruncated: result?.stdout?.truncated === true,
    stderr: result?.stderr?.text ?? '',
    stderrTruncated: result?.stderr?.truncated === true,
    sandbox: result?.sandbox,
  }
}

/**
 * Owner 的一次性宿主命令桥。
 * 授权卡片归属于当前 Owner 任务现场；只有插件登记且用户明确 allowed-once 的精确命令才执行。
 */
export async function executeOwnerHostCommand(runtime, args, exec) {
  const sessionId = sessionIdOf(exec)
  const active = sessionId === undefined ? undefined : runtime.activeOwners.get(sessionId)
  if (active === undefined) throw new Error('owner_host_exec 只能由当前正在运行的 Owner 子代理调用')
  if (active.hostCommandPending === true) throw new Error('当前 Owner 已有一个宿主命令等待授权或执行')

  const command = requiredText(args?.command, 'command')
  const description = requiredText(args?.description, 'description')
  const justification = requiredText(args?.justification, 'justification')
  const workdir = resolveWorkdir(active, args?.workdir)
  const timeoutMs = args?.timeout_ms
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new Error('owner_host_exec 的 timeout_ms 必须是正数')
  }

  const approval = runtime.ctx?.approval
    ?? (typeof runtime.ctx?.get === 'function' ? runtime.ctx.get('approval') : undefined)
  const shell = runtime.ctx?.shell
    ?? (typeof runtime.ctx?.get === 'function' ? runtime.ctx.get('shell') : undefined)
  if (typeof approval?.request !== 'function') throw new Error('Harness 没有挂载原生 approval 服务，不能显示 Owner 现场授权卡片')
  if (typeof shell?.resolve !== 'function' || typeof shell?.run !== 'function') {
    throw new Error('Harness 没有挂载宿主 Shell，不能执行 Owner 授权命令')
  }

  active.hostCommandPending = true
  try {
    if (active.lease !== undefined) await runtime.assertOwnerLease(active.lease)
    let outcome
    const approvalRequest = {
      agent: exec.agent,
      toolName: OWNER_HOST_EXEC_TOOL,
      callId: exec.callId,
      reason: [
        `Owner：${active.owner.id}`,
        `任务：${active.stageId}`,
        `用途：${description}`,
        `原因：${justification}`,
        `工作目录：${workdir}`,
        `精确命令：${command}`,
        '批准只允许以上命令以 danger-full-access 执行一次。',
      ].join('\n'),
      signal: exec?.signal,
    }
    active.hostApprovalRequest = approvalRequest
    try {
      outcome = await approval.request(approvalRequest)
    } catch (error) {
      if (/outside an open turn/u.test(String(error?.message ?? error))) {
        throw new Error('当前 Owner 任务没有开放回合，无法显示宿主命令授权卡片；已保留现场，恢复该 Owner 任务后可重试', { cause: error })
      }
      throw error
    } finally {
      if (active.hostApprovalRequest === approvalRequest) delete active.hostApprovalRequest
    }

    await runtime.appendWorkflowLog?.(active.workflowRoot, active.workflowId, 'owner.host-command-approval', {
      ownerId: active.owner.id,
      taskId: active.stageId,
      command,
      workdir: relative(active.worktree, workdir) || '.',
      outcome,
      summary: `${description}：${outcome}`,
    })
    if (outcome !== 'allowed-once') {
      const reason = outcome === 'rejected'
        ? '用户拒绝了 Owner 宿主命令'
        : outcome === 'cancelled'
          ? 'Owner 宿主命令授权已取消'
          : 'Owner 宿主命令授权通道不可用'
      throw new Error(`${reason}；命令没有执行`)
    }

    if (runtime.activeOwners.get(sessionId) !== active) {
      throw new Error('Owner 宿主命令获批后 active Owner 绑定已经失效，命令没有执行')
    }
    if (active.lease !== undefined) await runtime.assertOwnerLease(active.lease)
    const checkedWorkdir = resolveWorkdir(active, args?.workdir)
    const spec = shell.resolve({
      command,
      workdir: checkedWorkdir,
      signal: exec?.signal,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      stdoutMaxBytes: 256 * 1024,
      env: { GIT_OPTIONAL_LOCKS: '0' },
      sandboxPolicy: {
        mode: 'danger-full-access',
        workspaceRoot: active.worktree,
        ...(sessionId === undefined ? {} : { sessionId }),
      },
    })
    let result
    try {
      result = await shell.run(spec)
    } catch (error) {
      await runtime.appendWorkflowLog?.(active.workflowRoot, active.workflowId, 'owner.host-command-failed', {
        ownerId: active.owner.id,
        taskId: active.stageId,
        command,
        workdir: relative(active.worktree, checkedWorkdir) || '.',
        summary: `${description}：${String(error?.message ?? error)}`,
      })
      throw error
    }
    if (result?.kind === 'background') throw new Error('owner_host_exec 不允许后台命令')
    await runtime.appendWorkflowLog?.(active.workflowRoot, active.workflowId, 'owner.host-command-finished', {
      ownerId: active.owner.id,
      taskId: active.stageId,
      command,
      workdir: relative(active.worktree, workdir) || '.',
      exitCode: result?.exitCode ?? null,
      summary: `${description}（exitCode=${String(result?.exitCode ?? 'unknown')}）`,
    })
    return publicShellResult(result)
  } finally {
    active.hostCommandPending = false
    delete active.hostApprovalRequest
  }
}

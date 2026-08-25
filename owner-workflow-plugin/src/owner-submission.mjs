import { ownerResult } from './model.mjs'
import { OwnerVerificationApprovalRequiredError } from './owner-lifecycle.mjs'

function sessionIdOf(exec) {
  return exec?.agent?.id ?? exec?.agent?.session?.header?.id
}

/**
 * Owner 的唯一事务边界。子代理可以在 worktree 中自由工作；只有此处会验证、提交并固定结果。
 */
export async function submitOwnerResult(runtime, rawReport, exec) {
  const sessionId = sessionIdOf(exec)
  const active = sessionId === undefined ? undefined : runtime.activeOwners.get(sessionId)
  if (active === undefined) throw new Error('owner_submit 只能由当前正在运行的 Owner 子代理调用')
  active.submissionAttempted = true
  if (active.submission !== undefined) return active.submission.publicResult
  if (active.submitting === true) throw new Error('owner_submit 已在执行提交关卡，请等待当前调用完成')
  const report = ownerResult(
    rawReport,
    `Owner ${active.owner.id} 完成了任务 ${active.stage.id}`,
    { plan: active.state.plan, sourceOwnerId: active.owner.id },
  )
  if (report.status === 'needs_repair') {
    throw new Error('owner_submit 不接受 needs_repair 作为终态；请留在当前子线程继续修复。若固定验证失败，请按工具返回错误调整后重新提交 completed；确实无法继续时提交 blocked 或 failed。')
  }
  if (report.status === 'blocked') {
    const executedFailure = Object.values(active.verificationResults ?? {}).find(result => (
      result?.passed === false && Number.isInteger(result?.exitCode)
      && (result?.enforcement === 'full'
        || (result?.enforcement === 'approved-host' && result?.approvalOutcome === 'allowed-once'))
    ))
    if (executedFailure !== undefined) {
      const output = [executedFailure.stderr, executedFailure.stdout]
        .filter(value => typeof value === 'string' && value.trim() !== '')
        .join('\n')
      throw new Error(
        `固定验证 ${executedFailure.verificationId} 已实际执行并失败（exitCode=${executedFailure.exitCode}），`
        + '这不是授权阻塞，不能提交 blocked；请根据验证输出修复代码或测试后重新提交 completed。'
        + (output === '' ? '' : `\n${output}`),
      )
    }
  }
  if (report.status !== 'completed') {
    const publicResult = {
      contract: 'DSH_OWNER_SUBMISSION_V1',
      status: report.status,
      summary: report.summary,
      accepted: true,
      nextAction: '当前任务将返回主代理处理，不会进入验证、提交或合并。',
    }
    active.submission = { report, publicResult }
    return publicResult
  }

  active.submitting = true
  try {
    const inspection = await runtime.inspectOwnerAttempt(
      active.state,
      active.entry,
      report,
      exec.signal,
      active,
    )
    if (inspection.violations.length > 0) {
      throw new Error(`提交关卡拒绝当前改动：${inspection.violations.join('；')}。请在当前 worktree 调整后重新调用 owner_submit，或使用 request_handoff 转交。`)
    }
    const task = active.state.plan.tasks.find(item => item.id === active.stage.id)
    try {
      for (const verificationId of task?.verify ?? []) {
        await runtime.recordBoundVerification({
          task_id: active.stage.id,
          verification_id: verificationId,
          description: 'owner_submit 提交关卡自动验证',
        }, exec)
      }
    } catch (error) {
      if (!(error instanceof OwnerVerificationApprovalRequiredError)) throw error
      const blockedReport = {
        ...report,
        status: 'blocked',
        summary: error.message,
      }
      const publicResult = {
        contract: 'DSH_OWNER_SUBMISSION_V1',
        status: 'blocked',
        summary: error.message,
        accepted: true,
        nextAction: '固定验证正在等待当前 Owner 任务现场的原生授权；已保留 worktree，可从行动收件箱返回现场处理。',
      }
      active.submission = { report: blockedReport, publicResult }
      return publicResult
    }
    const committed = await runtime.commitOwnerAttempt(
      active.state,
      active.stage,
      active.entry,
      inspection,
      exec.signal,
    )
    const publicResult = {
      contract: 'DSH_OWNER_SUBMISSION_V1',
      status: 'completed',
      summary: report.summary,
      accepted: true,
      changedFiles: committed.changed,
      commitSha: committed.commitSha,
      nextAction: '提交关卡已通过，请停止继续修改并结束当前任务。',
    }
    active.submission = { report, inspection, committed, publicResult }
    return publicResult
  } finally {
    active.submitting = false
  }
}

/** Owner 已提交合法的跨责任域请求，当前任务转为等待重新编排。 */
export class OwnerHandoffError extends Error {
  constructor(ownerId, handoffs, partialResult) {
    super(`Owner ${ownerId} 请求转交 ${handoffs.length} 项跨区域或监督事项`)
    this.name = 'OwnerHandoffError'
    this.code = 'OWNER_HANDOFF'
    this.handoffs = handoffs
    this.partialResult = partialResult
  }
}

/** Owner 主动报告阻塞或失败，不应继续进入验证与提交。 */
export class OwnerReportedError extends Error {
  constructor(report) {
    super(`Owner 主动报告 ${report.status}：${report.summary}`)
    this.name = 'OwnerReportedError'
    this.code = report.status === 'blocked' ? 'OWNER_REPORTED_BLOCKED' : 'OWNER_REPORTED_FAILURE'
    this.report = report
  }
}

/** 固定验证需要在当前 Owner 任务现场取得原生一次性授权，当前任务必须安全停住。 */
export class OwnerVerificationApprovalRequiredError extends Error {
  constructor(message) {
    super(message)
    this.name = 'OwnerVerificationApprovalRequiredError'
    this.code = 'OWNER_VERIFICATION_APPROVAL_REQUIRED'
  }
}

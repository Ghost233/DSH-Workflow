/** Human-readable detail for DSH native user questions. Durable decisions still bind their structured inputs. */
export const markdownText = value => String(value).replace(/\s+/gu, ' ').replace(/[\\`*_{}\[\]()#+.!|<>~-]/gu, '\\$&')

export function markdownCode(value) {
  const content = String(value).replace(/\s+/gu, ' ')
  const longest = Math.max(0, ...[...content.matchAll(/`+/gu)].map(match => match[0].length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}${longest ? ` ${content} ` : content}${fence}`
}

const markdownList = values => values.length ? values.map(value => `- ${markdownCode(value)}`).join('\n') : '- 无'
const ownerValues = items => items?.length ? items.map(markdownCode).join('、') : '无'
const operationNames = { add: '新增', remove: '移除', transfer: '转交', split: '拆分', merge: '合并' }

export function registryApprovalDetail(proposal, root) {
  const before = new Map(proposal.before.owners.map(owner => [owner.id, owner]))
  const after = new Map(proposal.after.owners.map(owner => [owner.id, owner]))
  const fields = [
    ['name', '名称'], ['description', '职责说明'], ['scope', '写入范围'], ['exclude', '排除范围'],
    ['declaredExclude', '声明排除'], ['managedExclude', '托管排除'], ['parentOwnerId', '父 Owner'], ['status', '状态'],
  ]
  const display = value => Array.isArray(value) ? ownerValues(value) : value == null ? '无' : markdownText(value)
  const changed = (previous, current) => {
    if (!Array.isArray(previous) || !Array.isArray(current)) return `${display(previous)} → ${display(current)}`
    const added = current.filter(item => !previous.includes(item))
    const removed = previous.filter(item => !current.includes(item))
    return added.length || removed.length
      ? [added.length ? `新增 ${ownerValues(added)}` : '', removed.length ? `移除 ${ownerValues(removed)}` : ''].filter(Boolean).join('；')
      : `${display(previous)} → ${display(current)}`
  }
  const lines = [
    `- **项目：** ${markdownCode(root)}`,
    `- **变更原因：** ${markdownText(proposal.reason)}`,
    `- **操作：** ${proposal.operations.map((operation, index) => `${index + 1}. ${operationNames[operation.type] ?? markdownText(operation.type)}（${markdownText(operation.reason)}）`).join('；')}`,
    '', '### 本次受影响的 Owner',
  ]
  for (const id of proposal.affectedOwnerIds) {
    const old = before.get(id), next = after.get(id)
    const action = !old ? '新增' : !next ? '移除' : '调整'
    lines.push('', `**${action} ${markdownText(id)}**`)
    for (const [key, label] of fields) {
      const previous = old?.[key], current = next?.[key]
      if (JSON.stringify(previous) === JSON.stringify(current)) continue
      if (!old && (current == null || Array.isArray(current) && !current.length || key === 'status' && current === 'active')) continue
      lines.push(`- ${label}：${old && next ? changed(previous, current) : next ? display(current) : `${display(previous)} → 无`}`)
    }
  }
  const unchanged = proposal.before.owners.filter(owner => !proposal.affectedOwnerIds.includes(owner.id)).length
  lines.push('', `**其他 ${unchanged} 位 Owner：** 职责不变。`, `**提案校验值：** ${markdownCode(proposal.digest)}`)
  return lines.join('\n')
}

export function planningDecisionDetail(obligation) {
  const basis = obligation.classificationBasis
  const lines = []
  if (obligation.detail) lines.push(`- **审查说明：** ${markdownText(obligation.detail)}`)
  if (obligation.suggestion) lines.push(`- **建议：** ${markdownText(obligation.suggestion)}`)
  if (!basis) return lines.join('\n')
  lines.push(`- **依据：** ${markdownCode(basis.source.id)} / ${markdownCode(basis.source.version)}`,
    '', '### 技术事实', ...basis.technicalFacts.map(fact => `- ${markdownText(fact)}`))
  if (basis.businessCommitmentDelta) {
    const change = basis.businessCommitmentDelta
    lines.push('', '### 业务承诺变化',
      `- 当前承诺：${markdownText(change.currentCommitment)}`,
      `- 建议承诺：${markdownText(change.proposedCommitment)}`,
      `- 影响：${markdownText(change.consequence)}`)
  }
  if (basis.externalPermissionGap) {
    const gap = basis.externalPermissionGap
    lines.push('', '### 外部权限缺口',
      `- 所需权限：${markdownText(gap.requiredPermission)}`,
      `- 目标：${markdownText(gap.target)}`,
      `- 受阻操作：${markdownText(gap.blockedAction)}`)
  }
  return lines.join('\n')
}

export function publicOwnerBusinessDecisionDetail(change) {
  return [
    `**关联验收条件：** ${markdownCode(change.acceptanceCriterion)}`,
    '', '### 业务承诺变化',
    `- 当前承诺：${markdownText(change.currentCommitment)}`,
    `- 建议承诺：${markdownText(change.proposedCommitment)}`,
    `- 影响：${markdownText(change.consequence)}`,
  ].join('\n')
}

export function planningAuthorizationDetail({ root, branch, spec, scope, files }) {
  return [
    `- **项目：** ${markdownCode(root)}`,
    `- **分支：** ${markdownCode(branch)}`,
    `- **规格：** ${markdownCode(spec.id)} / ${markdownCode(spec.revision)}`,
    '', '### 授权范围',
    '- 按下方规格实施；后续业务承诺变化仍需你的决定。',
    `- 允许在当前本地分支提交规划文档：${[...scope.roots.map(path => `${path}/**/*.md`), ...scope.files].map(markdownCode).join('、') || '无'}。该范围内的后续规划文档修订复用本次授权。`,
    '- 每次提交仍核验写入来源与代码基线；不包含其他人的修改、业务源码或远程推送。',
    '', '### 本次文件', markdownList(files),
    '', '### 规格内容', spec.content,
  ].join('\n')
}

export function crossThreadCancellationDetail({ root, workflowId, originalSessionId, requestingSessionId }) {
  return [
    `- **项目：** ${markdownCode(root)}`,
    `- **旧工作流：** ${markdownCode(workflowId)}`,
    `- **原主线程：** ${markdownCode(originalSessionId)}`,
    `- **请求主线程：** ${markdownCode(requestingSessionId)}`,
    '', '### 本次操作',
    '- 仅取消旧流程；保留候选、历史、恢复计数和未确认终止的占用。',
    '- 不接管旧线程的执行权限，也不保证未结算资源立即释放。',
  ].join('\n')
}

export function recoveryAuthorizationDetail({ reason, used, attempts, limit }) {
  return [
    `- **原因：** ${markdownText(reason)}`,
    `- **已使用：** ${used} 次；**本次最多增加：** ${attempts} 次；**恢复总上限：** ${limit} 次。`,
    '', '审查失败只反馈主线程，不自动重规划。',
  ].join('\n')
}

/** Convert only the presentation copy; never change the durable decision request or its digest. */
export function decisionPresentationDetail(decision) {
  const binding = decision.binding ?? {}
  if (binding.recoveryRequest && binding.recovery) {
    return recoveryAuthorizationDetail({ reason: binding.recoveryRequest.reason,
      used: binding.recovery.used, attempts: binding.recoveryRequest.attempts, limit: binding.recovery.limit })
  }
  const raw = decision.request.detail
  if (typeof raw !== 'string') return raw
  if (!binding.obligationId && !binding.publicOwnerDecisionDigest) return raw
  let parsed
  try { parsed = JSON.parse(raw) } catch { return raw }
  if (binding.obligationId && typeof parsed?.source?.id === 'string'
    && typeof parsed.source.version === 'string' && Array.isArray(parsed.technicalFacts)) {
    return planningDecisionDetail({ classificationBasis: parsed })
  }
  if (binding.publicOwnerDecisionDigest && ['acceptanceCriterion', 'currentCommitment', 'proposedCommitment', 'consequence']
    .every(field => typeof parsed?.[field] === 'string')) return publicOwnerBusinessDecisionDetail(parsed)
  return raw
}

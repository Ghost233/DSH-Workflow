import { createHash } from 'node:crypto'

export const CONVERGENCE_CONTRACT = 'DSH_WORKFLOW_CONVERGENCE_V1'
export const CONVERGENCE_RUNTIME_VERSION = 'evidence-lease-v3'

export const AUTONOMOUS_STRATEGIES = Object.freeze([
  'local_subgraph_rewrite',
  'diagnose',
  'owner_council',
  'arbitrate',
  'alternate_implementation',
])

const AUTHORITY_HINT_PATTERN = /(?:用户|人工|授权|凭据|密钥|secret|token|真实设备|真实钱包|真实外部服务|付费|费用|生产|发布|上线|不可逆|删除外部|外部账户|产品选择|业务选择)/iu

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

function normalizedText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/giu, '<id>')
    .replace(/\b[0-9a-f]{32,64}\b/giu, '<digest>')
    .replace(/(?:\/?[\w.@+-]+){2,}/gu, '<path>')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .slice(0, 800)
}

export function issueCategory(issue) {
  const text = `${issue?.title ?? ''}\n${issue?.detail ?? ''}\n${issue?.suggestion ?? ''}`
  if (/(?:owner|责任域|scope|越界|跨域)/iu.test(text)) return 'owner-boundary'
  if (/(?:只读|--output|输出参数|唯一生产者|双生产者|producer|capture|generation|lineage|artifact)/iu.test(text)) {
    return 'artifact-boundary'
  }
  if (/(?:验证脚本不存在|入口不存在|固定验证|verification|argv|cwd|命令不存在|可执行性)/iu.test(text)) {
    return 'verification-entry'
  }
  if (/(?:依赖|版本|registry|resolved|integrity|官方.*url|来源|lockfile|expectations|baseline)/iu.test(text)) {
    return 'dependency-evidence'
  }
  if (/(?:dependsOn|依赖顺序|环|前置|dag|子图|叶子|拆分|抽象|abstract|composite|decomposition|渐进式|混合.*结果)/iu.test(text)) return 'dag-structure'
  if (/(?:完成条件|验收|行为测试|覆盖不足|无法证明)/iu.test(text)) return 'acceptance-evidence'
  if (/(?:事实|调查|discovery|未知|无法查明)/iu.test(text)) return 'discovery'
  return 'review-issue'
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function plainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function classificationTextList(value) {
  if (!Array.isArray(value)) return undefined
  const items = [...new Set(value.map(nonEmptyText).filter(Boolean))]
  return items.length > 0 ? items : undefined
}

function exactRecord(value, keys) {
  return plainRecord(value) && Object.keys(value).every(key => keys.includes(key))
}

function normalizeDecisionClassificationBasis(value, source, field) {
  if (value === undefined) return undefined
  if (!exactRecord(value, ['source', 'technicalFacts', 'businessCommitmentDelta', 'externalPermissionGap'])) {
    throw new Error(`${field} 必须是只包含 source、technicalFacts、businessCommitmentDelta、externalPermissionGap 的对象`)
  }
  if (!exactRecord(value.source, ['id', 'version'])) {
    throw new Error(`${field}.source 必须是只包含 id 与 version 的对象`)
  }
  const basisSource = {
    id: nonEmptyText(value.source.id),
    version: nonEmptyText(value.source.version),
  }
  if (basisSource.id === undefined || basisSource.version === undefined
    || basisSource.id !== source?.id || basisSource.version !== source?.version) {
    throw new Error(`${field}.source 必须与 obligation sourceId/sourceVersion 一致`)
  }
  const technicalFacts = classificationTextList(value.technicalFacts)
  if (technicalFacts === undefined) throw new Error(`${field}.technicalFacts 必须是非空技术事实数组`)
  let businessCommitmentDelta
  if (value.businessCommitmentDelta !== undefined) {
    const raw = value.businessCommitmentDelta
    if (!exactRecord(raw, ['currentCommitment', 'proposedCommitment', 'consequence'])) {
      throw new Error(`${field}.businessCommitmentDelta 必须是完整的业务承诺差异`)
    }
    const currentCommitment = nonEmptyText(raw.currentCommitment)
    const proposedCommitment = nonEmptyText(raw.proposedCommitment)
    const consequence = nonEmptyText(raw.consequence)
    if (currentCommitment === undefined || proposedCommitment === undefined || consequence === undefined) {
      throw new Error(`${field}.businessCommitmentDelta 必须提供当前承诺、拟议承诺和后果`)
    }
    if (currentCommitment === proposedCommitment) {
      throw new Error(`${field}.businessCommitmentDelta 当前承诺必须与拟议承诺不同`)
    }
    businessCommitmentDelta = { currentCommitment, proposedCommitment, consequence }
  }
  let externalPermissionGap
  if (value.externalPermissionGap !== undefined) {
    const raw = value.externalPermissionGap
    if (!exactRecord(raw, ['requiredPermission', 'target', 'blockedAction'])) {
      throw new Error(`${field}.externalPermissionGap 必须是完整的外部权限缺口`)
    }
    const requiredPermission = nonEmptyText(raw.requiredPermission)
    const target = nonEmptyText(raw.target)
    const blockedAction = nonEmptyText(raw.blockedAction)
    if (requiredPermission === undefined || target === undefined || blockedAction === undefined) {
      throw new Error(`${field}.externalPermissionGap 必须提供权限、目标和受阻动作`)
    }
    externalPermissionGap = { requiredPermission, target, blockedAction }
  }
  return {
    source: basisSource,
    technicalFacts,
    ...(businessCommitmentDelta === undefined ? {} : { businessCommitmentDelta }),
    ...(externalPermissionGap === undefined ? {} : { externalPermissionGap }),
  }
}

function classificationRequiresUserAuthority(basis) {
  return basis?.businessCommitmentDelta !== undefined || basis?.externalPermissionGap !== undefined
}

function decisionRecordClassification({ closeWhen, classificationBasis, source, field, allowLegacyObligations }) {
  if (closeWhen?.kind !== 'decision_record') return undefined
  const basis = normalizeDecisionClassificationBasis(classificationBasis, source, `${field}.classificationBasis`)
  if (basis === undefined) {
    if (!allowLegacyObligations) throw new Error(`${field} 新 decision_record 义务必须提供 classificationBasis`)
    return { authorityRequired: closeWhen.authority === 'user', kind: 'legacy_unclassified', basis: undefined }
  }
  const authorityRequired = classificationRequiresUserAuthority(basis)
  const expectedAuthority = authorityRequired ? 'user' : 'orchestrator'
  if (closeWhen.authority !== expectedAuthority) {
    throw new Error(`${field}.closeWhen.authority 与 classificationBasis 的${authorityRequired ? '业务承诺或外部权限' : '技术事实'}分类冲突`)
  }
  return {
    authorityRequired,
    kind: authorityRequired
      ? basis.externalPermissionGap !== undefined ? 'external_permission_gap' : 'business_commitment_delta'
      : 'technical',
    basis,
  }
}

function obligationTargets(issue, review) {
  return [...new Set([
    ...(issue?.targetTaskIds ?? review?.targetTaskIds ?? []),
  ].map(value => String(value).trim()).filter(Boolean))].sort()
}

function obligationSource(issue, review, { allowLegacyObligations }) {
  const declaredId = nonEmptyText(issue?.obligationId)
  const sourceId = nonEmptyText(issue?.sourceId)
  const sourceVersion = nonEmptyText(issue?.sourceVersion) ?? nonEmptyText(review?.sourceVersion)
  if (!allowLegacyObligations && declaredId === undefined) {
    throw new Error('新审查义务必须提供不可变 obligationId')
  }
  if (!allowLegacyObligations && sourceId === undefined) {
    throw new Error('新审查义务必须提供显式 sourceId')
  }
  if (!allowLegacyObligations && sourceVersion === undefined) {
    throw new Error('新审查义务必须提供显式 sourceVersion')
  }
  // A legacy record can be retained only through the explicit compatibility
  // path. Its fallback intentionally hashes lossless fields: normalizedText
  // erases paths and identifiers, so it is unsuitable for obligation identity.
  const legacySource = digest(['legacy-review-requirement', {
    title: String(issue?.title ?? ''),
    detail: String(issue?.detail ?? ''),
    suggestion: String(issue?.suggestion ?? ''),
  }])
  return {
    declaredId,
    id: sourceId ?? declaredId ?? legacySource,
    version: sourceVersion ?? String(review?.contract ?? 'unversioned-review'),
  }
}

function normalizeCloseWhen(raw, targets, { allowLegacyObligations }) {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const kind = nonEmptyText(raw.kind)
    const taskId = nonEmptyText(raw.taskId)
    const verificationId = nonEmptyText(raw.verificationId)
    if (kind === 'plan_verification_binding' && taskId !== undefined && verificationId !== undefined) {
      return { kind, taskId, verificationId }
    }
    if (kind === 'task_verification_result' && taskId !== undefined && verificationId !== undefined) {
      return { kind, taskId, verificationId }
    }
    if (kind === 'plan_task_executable' && taskId !== undefined) {
      return { kind, taskId }
    }
    const authority = nonEmptyText(raw.authority)
    if (kind === 'decision_record' && taskId !== undefined && ['orchestrator', 'user'].includes(authority)) {
      return { kind, taskId, authority }
    }
  }
  if (!allowLegacyObligations) {
    throw new Error('新审查义务必须提供受支持的 closeWhen')
  }
  // Old reviews did not declare a Runtime-verifiable release condition. Keep
  // their obligations visible, but never infer that a later `passed` closes
  // them from prose, a title rewrite, or a changed evidence digest.
  return { kind: 'runtime_evidence_required', targetTaskIds: targets }
}

function obligationIdentity(obligation) {
  return canonical({
    obligationId: obligation?.declaredId ?? obligation?.id ?? null,
    source: obligation?.source ?? null,
    targetTaskIds: [...(obligation?.targetTaskIds ?? [])].sort(),
    closeWhen: obligation?.closeWhen ?? null,
  })
}

function hasClosureContract(obligation) {
  const condition = obligation?.closeWhen
  return obligation?.source?.id !== undefined
    && typeof obligation.source.version === 'string'
    && Array.isArray(obligation.targetTaskIds)
    && obligation.targetTaskIds.includes(condition?.taskId)
    && condition !== undefined
    && ['plan_verification_binding', 'task_verification_result', 'plan_task_executable', 'decision_record'].includes(condition.kind)
    && typeof condition.taskId === 'string'
    && (['plan_verification_binding', 'task_verification_result'].includes(condition.kind)
      ? typeof condition.verificationId === 'string'
      : condition.kind === 'decision_record'
        ? ['orchestrator', 'user'].includes(condition.authority)
        : true)
}

export function reviewIssueObligation(issue, review = {}, { allowLegacyObligations = false } = {}) {
  if (allowLegacyObligations && typeof issue === 'string') {
    issue = { title: issue, detail: issue, suggestion: '' }
  }
  const category = issueCategory(issue)
  const targets = obligationTargets(issue, review)
  if (!allowLegacyObligations && targets.length === 0) {
    throw new Error('新审查义务必须提供显式 targetTaskIds')
  }
  const title = String(issue?.title ?? '').trim()
  const source = obligationSource(issue, review, { allowLegacyObligations })
  const closeWhen = normalizeCloseWhen(issue?.closeWhen, targets, { allowLegacyObligations })
  const declaredBasis = issue?.classificationBasis === undefined
    ? undefined
    : normalizeDecisionClassificationBasis(issue.classificationBasis, { id: source.id, version: source.version }, '审查义务.classificationBasis')
  if (classificationRequiresUserAuthority(declaredBasis) && closeWhen.kind !== 'decision_record') {
    throw new Error('审查义务 的业务承诺或外部权限分类必须使用 decision_record authority=user')
  }
  const classification = decisionRecordClassification({
    closeWhen,
    classificationBasis: declaredBasis,
    source: { id: source.id, version: source.version },
    field: '审查义务',
    allowLegacyObligations,
  })
  const identity = { source, targetTaskIds: targets, closeWhen }
  return {
    id: source.declaredId ?? digest(identity),
    ...(source.declaredId === undefined ? {} : { declaredId: source.declaredId }),
    category,
    severity: issue?.severity ?? 'medium',
    title: title || category,
    detail: String(issue?.detail ?? '').trim(),
    suggestion: String(issue?.suggestion ?? '').trim(),
    source: { id: source.id, version: source.version },
    targetTaskIds: targets,
    ...(issue?.targetVerificationIds?.length ? { targetVerificationIds: [...new Set(issue.targetVerificationIds)].sort() } : {}),
    ...(classification?.basis === undefined ? {} : { classificationBasis: classification.basis }),
    ...(classification === undefined ? {} : { decisionClassification: classification.kind }),
    closeWhen,
    status: 'open',
  }
}

function assertNoBatchIdentityConflict(obligations) {
  const seen = new Map()
  for (const obligation of obligations) {
    const existing = seen.get(obligation.id)
    if (existing === undefined) {
      seen.set(obligation.id, obligation)
      continue
    }
    if (obligationIdentity(existing) !== obligationIdentity(obligation)) {
      throw new Error(`同一 obligationId 不能声明不同义务合同：${obligation.id}`)
    }
  }
  return [...seen.values()]
}

export function reviewObligations(review, { allowLegacyObligations = false } = {}) {
  const obligations = (review?.issues ?? []).map(issue => {
    if (issue === null || typeof issue !== 'object' || Array.isArray(issue)) {
      if (!allowLegacyObligations) throw new Error('新审查义务必须是结构化合同')
    }
    return reviewIssueObligation(issue, review, { allowLegacyObligations })
  })
  if (obligations.length > 0) return assertNoBatchIdentityConflict(obligations)
  if (review?.status === 'needs_discovery') {
    if (!allowLegacyObligations) {
      throw new Error('新 needs_discovery 审查必须通过结构化 issues 提供义务合同')
    }
    return (review.discoveryQuestions ?? []).map(question => ({
      id: digest(['discovery', String(question)]),
      category: 'discovery',
      severity: 'high',
      title: String(question),
      detail: String(question),
      suggestion: '由只读诊断代理取得 Runtime 可核验事实',
      source: { id: digest(['discovery', String(question)]), version: String(review?.contract ?? 'unversioned-review') },
      targetTaskIds: [...new Set(review.targetTaskIds ?? [])].sort(),
      closeWhen: { kind: 'runtime_evidence_required', targetTaskIds: [...new Set(review.targetTaskIds ?? [])].sort() },
      status: 'open',
    }))
  }
  if (review?.status === 'needs_decision') {
    if (!allowLegacyObligations) {
      throw new Error('新 needs_decision 审查必须通过结构化 issues 提供义务合同')
    }
    return (review.decisionQuestions ?? []).map(question => ({
      id: digest(['decision', String(question)]),
      // Historical free text is unresolved but is never evidence that an
      // external user authorization exists.  Only an explicit persisted
      // decision_record authority=user remains a conservative human gate.
      category: 'legacy-decision-unclassified',
      severity: 'high',
      title: String(question),
      detail: String(question),
      suggestion: '优先由 Owner 会诊与独立 Arbiter 根据现有 Intent 裁决',
      source: { id: digest(['decision', String(question)]), version: String(review?.contract ?? 'unversioned-review') },
      targetTaskIds: [...new Set(review.targetTaskIds ?? [])].sort(),
      closeWhen: { kind: 'runtime_evidence_required', targetTaskIds: [...new Set(review.targetTaskIds ?? [])].sort() },
      status: 'open',
    }))
  }
  return []
}

function stableVerificationResult(result) {
  return {
    passed: result?.passed === true,
    exitCode: Number.isSafeInteger(result?.exitCode) ? result.exitCode : null,
    timedOut: result?.timedOut === true,
    commitSha: nonEmptyText(result?.commitSha) ?? null,
  }
}

function taskEvidence(task) {
  return {
    taskId: task?.taskId ?? task?.id,
    fixedCommitSha: nonEmptyText(task?.fixedCommitSha) ?? null,
    verificationResults: Object.fromEntries(Object.entries(task?.verificationResults ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, result]) => [id, stableVerificationResult(result)])),
  }
}

function taskIdsForVerifiedFile(file) {
  return [...new Set([
    file?.taskId,
    ...(Array.isArray(file?.candidateTaskIds) ? file.candidateTaskIds : []),
  ].map(nonEmptyText).filter(Boolean))].sort()
}

function verifiedFileEvidence(runtimeFacts) {
  return (Array.isArray(runtimeFacts?.verifiedFiles) ? runtimeFacts.verifiedFiles : [])
    .map(file => ({
      taskIds: taskIdsForVerifiedFile(file),
      path: nonEmptyText(file?.path),
      kind: file?.kind,
      sha256: nonEmptyText(file?.sha256)?.toLowerCase(),
    }))
    .filter(file => file.kind === 'file'
      && file.path !== undefined
      && /^[a-f0-9]{64}$/u.test(file.sha256 ?? '')
      && file.taskIds.length > 0)
    .sort((left, right) => canonical(left).localeCompare(canonical(right)))
}

function planningWorktreeFileEvidence(runtimeFacts) {
  return (Array.isArray(runtimeFacts?.worktrees) ? runtimeFacts.worktrees : [])
    .flatMap(worktree => (Array.isArray(worktree?.files) ? worktree.files : []).map(file => ({
      taskIds: taskIdsForVerifiedFile(file),
      path: nonEmptyText(file?.path),
      kind: file?.kind,
      sha256: nonEmptyText(file?.sha256)?.toLowerCase(),
    })))
    .filter(file => file.kind === 'file'
      && file.path !== undefined
      && /^[a-f0-9]{64}$/u.test(file.sha256 ?? ''))
    .sort((left, right) => canonical(left).localeCompare(canonical(right)))
}

/**
 * A diagnostic projection only.  It intentionally excludes candidate/HEAD
 * bookkeeping, sessions, timestamps, and all consultation prose.  Callers
 * must still use per-obligation Runtime evidence below to decide progress.
 */
export function workflowEvidenceDigest(state, runtimeFacts) {
  return digest({
    tasks: (state?.tasks ?? []).map(taskEvidence).sort((left, right) => String(left.taskId).localeCompare(String(right.taskId))),
    // Recovery paths outside plan review still pass the Runtime's freshly
    // inspected owner worktree facts.  Retain only ordinary-file hashes and
    // task associations, never worktree paths, status prose, or timestamps.
    verifiedFiles: [...verifiedFileEvidence(runtimeFacts), ...planningWorktreeFileEvidence(runtimeFacts)]
      .sort((left, right) => canonical(left).localeCompare(canonical(right))),
  })
}

export function planStructureDigest(plan) {
  return digest({
    owners: (plan?.owners ?? []).map(owner => owner.id).sort(),
    verifications: (plan?.verifications ?? []).map(item => ({ id: item.id, run: item.run, cwd: item.cwd ?? '.' }))
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
    tasks: (plan?.tasks ?? []).map(task => ({
      id: task.id,
      role: task.role,
      ownerId: task.ownerId,
      dependsOn: [...(task.dependsOn ?? [])].sort(),
      write: [...(task.write ?? [])].sort(),
      verify: [...(task.verify ?? [])].sort(),
      decomposition: task.decomposition === undefined ? null : {
        status: task.decomposition.status,
        kind: task.decomposition.kind,
        ownerCandidates: [...(task.decomposition.ownerCandidates ?? [])].sort(),
        unknowns: task.decomposition.unknowns ?? [],
      },
    })).sort((left, right) => String(left.id).localeCompare(String(right.id))),
  })
}

function sameObligation(left, right) {
  if (left?.id !== right?.id) return false
  // Compatibility records may lack a closeWhen/source contract, but the
  // persisted id still identifies the same retained record. Contract
  // availability controls closure, never whether a repeated legacy record is
  // a newly introduced obligation.
  if (!hasClosureContract(left) || !hasClosureContract(right)) return true
  return obligationIdentity(left) === obligationIdentity(right)
}

function uniqueObligations(values) {
  return [...new Map(values.map(item => [item.id, item])).values()]
}

function identityConflicts(priorOpen, current) {
  const conflicts = []
  for (const next of current) {
    const nextReferenceId = next.declaredId ?? next.id
    for (const previous of priorOpen) {
      const previousReferenceId = previous.declaredId ?? previous.id
      if (previousReferenceId !== nextReferenceId) continue
      if (sameObligation(previous, next)) continue
      conflicts.push({
        id: next.id,
        declaredId: nextReferenceId,
        previousObligationId: previous.id,
        reason: 'obligation_identity_changed',
      })
    }
  }
  return conflicts
}

function runtimeClosureEvidence(runtimeEvidence, candidate) {
  return {
    planDigest: runtimeEvidence?.planDigest === candidate?.planDigest ? runtimeEvidence.planDigest : undefined,
    planBindings: Array.isArray(runtimeEvidence?.planBindings) ? runtimeEvidence.planBindings : [],
    taskVerificationResults: Array.isArray(runtimeEvidence?.taskVerificationResults) ? runtimeEvidence.taskVerificationResults : [],
    executableTasks: Array.isArray(runtimeEvidence?.executableTasks) ? runtimeEvidence.executableTasks : [],
    decisionRecords: Array.isArray(runtimeEvidence?.decisionRecords) ? runtimeEvidence.decisionRecords : [],
  }
}

function progressRuntimeEvidence(runtimeEvidence, candidate) {
  const closure = runtimeClosureEvidence(runtimeEvidence, candidate)
  return {
    ...closure,
    verifiedFiles: closure.planDigest === undefined ? [] : verifiedFileEvidence(runtimeEvidence),
  }
}

function obligationProofId(obligation, fact) {
  return digest({
    contract: CONVERGENCE_CONTRACT,
    obligation: {
      id: obligation.id,
      source: obligation.source,
      targetTaskIds: obligation.targetTaskIds,
      closeWhen: obligation.closeWhen,
    },
    fact,
  })
}

function proofRecord(obligation, fact) {
  return {
    id: obligationProofId(obligation, fact),
    // This identity deliberately omits Reviewer-controlled obligation/source
    // identifiers.  It prevents a model from recycling one physical Runtime
    // fact under a fresh obligationId every round.
    factId: digest({ contract: CONVERGENCE_CONTRACT, fact }),
    ...fact,
  }
}

/**
 * Runtime facts can affect the next recovery action only when they name the
 * open obligation's own target and release condition.  Candidate identity is
 * a freshness gate, rather than a fact identifier: returning A/B candidates
 * with the same binding, file digest, or result cannot mint new progress.
 */
function obligationProgressEvidence(obligation, candidate, runtimeEvidence) {
  if (!hasClosureContract(obligation)) return []
  const evidence = progressRuntimeEvidence(runtimeEvidence, candidate)
  if (evidence.planDigest === undefined) return []
  const condition = obligation.closeWhen
  const facts = []
  if (condition.kind === 'plan_verification_binding') {
    if (evidence.planBindings.some(item => (
      item?.taskId === condition.taskId && item?.verificationId === condition.verificationId
    ))) {
      facts.push({ kind: 'plan_verification_binding', taskId: condition.taskId, verificationId: condition.verificationId })
    }
  }
  if (condition.kind === 'task_verification_result') {
    for (const result of evidence.taskVerificationResults) {
      if (result?.taskId !== condition.taskId
        || result?.verificationId !== condition.verificationId
        || result?.planDigest !== candidate.planDigest
        || result?.current !== true
        || result?.passed !== true
        || result?.exitCode !== 0
        || nonEmptyText(result?.commitSha) === undefined) continue
      facts.push({
        kind: 'task_verification_result',
        taskId: condition.taskId,
        verificationId: condition.verificationId,
        commitSha: result.commitSha,
      })
    }
  }
  // Structural facts are deliberately relevant only to the structural
  // closeWhen.  A newly executable task cannot renew a verification issue.
  if (condition.kind === 'plan_task_executable') {
    if (evidence.executableTasks.some(item => item?.taskId === condition.taskId)) {
      facts.push({ kind: 'plan_task_executable', taskId: condition.taskId })
    }
  }
  if (condition.kind === 'decision_record') {
    for (const record of evidence.decisionRecords) {
      if (record?.obligationId !== obligation.id
        || record?.planDigest !== candidate.planDigest
        || record?.taskId !== condition.taskId
        || record?.authority !== condition.authority
        || record?.source?.id !== obligation.source.id
        || record?.source?.version !== obligation.source.version
        || record?.status !== 'recorded'
        || record?.current !== true
        || nonEmptyText(record?.decisionId) === undefined) continue
      facts.push({
        kind: 'decision_record',
        taskId: condition.taskId,
        authority: condition.authority,
        decisionId: record.decisionId,
      })
    }
  }
  // A host has re-read and hashed this file after validating the current
  // candidate.  The file may guide recovery, but it never closes an
  // obligation without the existing explicit Reviewer closure request.
  for (const file of evidence.verifiedFiles) {
    if (!file.taskIds.includes(condition.taskId)) continue
    facts.push({
      kind: 'verified_file',
      taskId: condition.taskId,
      path: file.path,
      sha256: file.sha256,
    })
  }
  return [...new Map(facts.map(fact => {
    const proof = proofRecord(obligation, fact)
    return [proof.id, proof]
  })).values()].sort((left, right) => left.id.localeCompare(right.id))
}

function runtimePhysicalEvidence(candidate, runtimeEvidence) {
  const evidence = progressRuntimeEvidence(runtimeEvidence, candidate)
  if (evidence.planDigest === undefined) return []
  const facts = []
  for (const binding of evidence.planBindings) {
    const taskId = nonEmptyText(binding?.taskId)
    const verificationId = nonEmptyText(binding?.verificationId)
    if (taskId !== undefined && verificationId !== undefined) {
      facts.push({ kind: 'plan_verification_binding', taskId, verificationId })
    }
  }
  for (const result of evidence.taskVerificationResults) {
    const taskId = nonEmptyText(result?.taskId)
    const verificationId = nonEmptyText(result?.verificationId)
    const commitSha = nonEmptyText(result?.commitSha)
    if (taskId !== undefined
      && verificationId !== undefined
      && commitSha !== undefined
      && result?.planDigest === candidate.planDigest
      && result?.current === true
      && result?.passed === true
      && result?.exitCode === 0) {
      facts.push({ kind: 'task_verification_result', taskId, verificationId, commitSha })
    }
  }
  for (const task of evidence.executableTasks) {
    const taskId = nonEmptyText(task?.taskId)
    if (taskId !== undefined) facts.push({ kind: 'plan_task_executable', taskId })
  }
  for (const record of evidence.decisionRecords) {
    const taskId = nonEmptyText(record?.taskId)
    const decisionId = nonEmptyText(record?.decisionId)
    if (taskId !== undefined
      && decisionId !== undefined
      && ['orchestrator', 'user'].includes(record?.authority)
      && record?.planDigest === candidate.planDigest
      && record?.status === 'recorded'
      && record?.current === true) {
      facts.push({ kind: 'decision_record', taskId, authority: record.authority, decisionId })
    }
  }
  for (const file of evidence.verifiedFiles) {
    for (const taskId of file.taskIds) {
      facts.push({ kind: 'verified_file', taskId, path: file.path, sha256: file.sha256 })
    }
  }
  return [...new Map(facts.map(fact => {
    const id = digest({ contract: CONVERGENCE_CONTRACT, fact })
    return [id, { id, ...fact }]
  })).values()].sort((left, right) => left.id.localeCompare(right.id))
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function seenEvidenceLedger(value) {
  if (!isPlainRecord(value)) return undefined
  const ledger = new Map()
  for (const [obligationId, records] of Object.entries(value)) {
    if (!Array.isArray(records)) continue
    const normalized = [...new Map(records.map(record => {
      const id = typeof record === 'string' ? record : nonEmptyText(record?.id)
      return id === undefined ? undefined : [id, typeof record === 'string' ? { id } : record]
    }).filter(Boolean)).values()].sort((left, right) => left.id.localeCompare(right.id))
    if (normalized.length > 0) ledger.set(obligationId, normalized)
  }
  return ledger
}

function serializeSeenEvidence(ledger) {
  return Object.fromEntries([...ledger.entries()]
    .filter(([, records]) => records.length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([obligationId, records]) => [obligationId, records.sort((left, right) => left.id.localeCompare(right.id))]))
}

function seenEvidenceFacts(value) {
  if (!Array.isArray(value)) return undefined
  return new Map(value.map(record => {
    const id = typeof record === 'string' ? record : nonEmptyText(record?.id)
    return id === undefined ? undefined : [id, typeof record === 'string' ? { id } : record]
  }).filter(Boolean))
}

function serializeSeenEvidenceFacts(facts) {
  return [...facts.values()].sort((left, right) => left.id.localeCompare(right.id))
}

function strategyRenewals(value) {
  if (!Array.isArray(value)) return []
  return [...new Map(value.map(item => {
    const id = nonEmptyText(item?.id)
    return id === undefined ? undefined : [id, {
      id,
      evidenceIds: [...new Set((Array.isArray(item?.evidenceIds) ? item.evidenceIds : [])
        .map(nonEmptyText).filter(Boolean))].sort(),
      status: item?.status === 'consumed' ? 'consumed' : 'available',
      ...(nonEmptyText(item?.grantedAt) === undefined ? {} : { grantedAt: item.grantedAt }),
      ...(nonEmptyText(item?.consumedAt) === undefined ? {} : { consumedAt: item.consumedAt }),
    }]
  }).filter(Boolean)).values()]
}

function renewalForEvidence(proofs, time) {
  const evidenceIds = [...new Set(proofs.map(proof => proof.id))].sort()
  if (evidenceIds.length === 0) return undefined
  return {
    id: digest(['local_strategy_renewal', evidenceIds]),
    evidenceIds,
    status: 'available',
    grantedAt: time,
  }
}

export function verifiedClosure(obligation, review, candidate, runtimeEvidence, time) {
  if (!hasClosureContract(obligation)) return { reason: 'missing_closure_contract' }
  const requested = (review?.obligationClosures ?? []).filter(item => item?.obligationId === obligation.id)
  if (requested.length === 0) return { reason: 'closure_evidence_missing' }
  const evidence = runtimeClosureEvidence(runtimeEvidence, candidate)
  for (const closure of requested) {
    if (closure?.planDigest !== candidate?.planDigest || evidence.planDigest !== candidate?.planDigest) continue
    const condition = obligation.closeWhen
    if (closure.kind !== condition.kind
      || closure.taskId !== condition.taskId
      || closure.verificationId !== condition.verificationId) continue
    if (condition.kind === 'plan_verification_binding') {
      const binding = evidence.planBindings.some(item => (
        item?.taskId === condition.taskId && item?.verificationId === condition.verificationId
      ))
      if (!binding) continue
      return {
        resolution: {
          kind: condition.kind,
          taskId: condition.taskId,
          verificationId: condition.verificationId,
          planDigest: candidate.planDigest,
          resolvedAt: time,
        },
      }
    }
    if (condition.kind === 'task_verification_result') {
      const result = evidence.taskVerificationResults.find(item => (
        item?.taskId === condition.taskId
        && item?.verificationId === condition.verificationId
        && item?.planDigest === candidate.planDigest
        && item?.passed === true
        && item?.exitCode === 0
        && item?.current === true
        && typeof item?.commitSha === 'string'
        && item.commitSha !== ''
      ))
      if (result === undefined) continue
      return {
        resolution: {
          kind: condition.kind,
          taskId: condition.taskId,
          verificationId: condition.verificationId,
          planDigest: candidate.planDigest,
          commitSha: result.commitSha,
          resolvedAt: time,
        },
      }
    }
    if (condition.kind === 'plan_task_executable') {
      const executable = evidence.executableTasks.some(item => item?.taskId === condition.taskId)
      if (!executable) continue
      return {
        resolution: {
          kind: condition.kind,
          taskId: condition.taskId,
          planDigest: candidate.planDigest,
          resolvedAt: time,
        },
      }
    }
    if (condition.kind === 'decision_record') {
      const record = evidence.decisionRecords.find(item => (
        item?.decisionId === closure.decisionId
        && item?.obligationId === obligation.id
        && item?.planDigest === candidate.planDigest
        && item?.taskId === condition.taskId
        && obligation.targetTaskIds.includes(condition.taskId)
        && item?.authority === condition.authority
        && item?.source?.id === obligation.source.id
        && item?.source?.version === obligation.source.version
        && item?.status === 'recorded'
        && item?.current === true
      ))
      if (record === undefined) continue
      return {
        resolution: {
          kind: condition.kind,
          taskId: condition.taskId,
          authority: condition.authority,
          decisionId: record.decisionId,
          planDigest: candidate.planDigest,
          resolvedAt: time,
        },
      }
    }
  }
  return {
    reason: requested.some(item => item?.planDigest !== candidate?.planDigest)
      ? 'closure_version_mismatch'
      : 'closure_evidence_unverified',
  }
}

function preferredStrategies(review, obligations, unsupportedNewObligations) {
  if (unsupportedNewObligations.length > 0) return ['arbitrate', 'owner_council', 'diagnose', 'local_subgraph_rewrite', 'alternate_implementation']
  if (review?.status === 'needs_discovery' || obligations.some(item => item.category === 'discovery')) {
    return ['diagnose', 'owner_council', 'local_subgraph_rewrite', 'arbitrate', 'alternate_implementation']
  }
  if (review?.status === 'needs_decision') {
    return ['owner_council', 'arbitrate', 'diagnose', 'local_subgraph_rewrite', 'alternate_implementation']
  }
  if (review?.status === 'needs_split') {
    return ['local_subgraph_rewrite', 'owner_council', 'arbitrate', 'diagnose', 'alternate_implementation']
  }
  return ['local_subgraph_rewrite', 'diagnose', 'owner_council', 'arbitrate', 'alternate_implementation']
}

function nextUnusedStrategy(preferred, used) {
  return preferred.find(strategy => !used.includes(strategy)) ?? 'autonomous_incident'
}

function decisionClassificationDiagnostic(record, scope) {
  const closeWhen = record?.closeWhen
  if (closeWhen?.kind !== 'decision_record') return undefined
  const source = record?.source ?? {
    id: record?.sourceId,
    version: record?.sourceVersion,
  }
  let basis
  let integrity = 'structured'
  try {
    basis = normalizeDecisionClassificationBasis(record?.classificationBasis, source, `${scope} decision_record`)
  } catch (error) {
    // Strict submissions are rejected by reviewIssueObligation/model.  This
    // branch reads already-persisted or hand-assembled state defensively: a
    // malformed asserted business ground must not downgrade a human gate.
    integrity = 'invalid_basis'
  }
  const text = `${record?.title ?? ''}\n${record?.detail ?? ''}\n${record?.suggestion ?? ''}`
  const basisRequiresUser = classificationRequiresUserAuthority(basis)
  const explicitUser = closeWhen.authority === 'user'
  const malformedBasisClaimsAuthority = integrity === 'invalid_basis'
    && plainRecord(record?.classificationBasis)
    && (record.classificationBasis.businessCommitmentDelta !== undefined
      || record.classificationBasis.externalPermissionGap !== undefined)
  const authorityRequired = explicitUser || basisRequiresUser || malformedBasisClaimsAuthority
  return {
    obligationId: record?.id ?? record?.obligationId,
    scope,
    authorityRequired,
    classification: basis === undefined
      ? explicitUser ? 'legacy_explicit_user_authority' : 'legacy_unclassified'
      : basisRequiresUser
        ? basis.externalPermissionGap === undefined ? 'business_commitment_delta' : 'external_permission_gap'
        : 'technical',
    integrity,
    keywordHint: AUTHORITY_HINT_PATTERN.test(text),
    ...(basis === undefined ? {} : { basis }),
  }
}

/**
 * Returns a projection of authority facts.  Textual words such as 用户 or
 * token are retained only as diagnostics; they never grant user authority.
 * Open persisted obligations are deliberately considered even when a newer
 * Reviewer omits them or changes its status to `passed`.
 */
export function reviewDecisionClassification(review, { obligations = [] } = {}) {
  const classifications = []
  for (const obligation of obligations) {
    if (obligation?.status !== 'open') continue
    const classification = decisionClassificationDiagnostic(obligation, 'persisted_open_obligation')
    if (classification !== undefined) classifications.push(classification)
  }
  if (review?.status === 'needs_decision') {
    for (const issue of review.issues ?? []) {
      const classification = decisionClassificationDiagnostic(issue, 'submitted_review')
      if (classification !== undefined) classifications.push(classification)
    }
  }
  return {
    authorityRequired: classifications.some(item => item.authorityRequired),
    classifications,
  }
}

export function reviewRequiresUserAuthority(review, options = {}) {
  return reviewDecisionClassification(review, options).authorityRequired
}

export function reconcileReviewConvergence({ previous, candidate, review, evidenceDigest, time, runtimeEvidence, allowLegacyObligations = false }) {
  const current = reviewObligations(review, { allowLegacyObligations })
  const sameCycle = previous?.contract === CONVERGENCE_CONTRACT
    && previous?.cycleId === candidate.cycleId
  // A PlanRevision can change its candidate digest, split a task, or start a
  // successor cycle while the same requirement is still unresolved. The
  // state belongs to one Workflow, so dropping its open ledger merely because
  // the cycle label changed would make a new plan an approval bypass.
  const baseline = previous?.contract === CONVERGENCE_CONTRACT ? previous : undefined
  const inheritedAcrossCycle = baseline !== undefined && !sameCycle
  const priorObligations = baseline?.obligations ?? []
  const priorOpen = priorObligations.filter(item => item.status === 'open')
  const introduced = current.filter(item => !priorObligations.some(previousItem => sameObligation(previousItem, item)))
  const conflicts = identityConflicts(priorObligations, current)
  const conflictingIds = new Set(conflicts.map(item => item.id))
  const unconflictedIntroduced = introduced.filter(item => !conflictingIds.has(item.id))
  // `evidenceDigest` remains useful diagnostics for operators, but it is not
  // authority to renew recovery.  It includes no sufficient obligation
  // mapping, and callers may legitimately refresh it for a new session or
  // candidate without learning a new Runtime fact.
  const priorSeenEvidence = seenEvidenceLedger(baseline?.seenEvidence)
  const priorSeenFacts = seenEvidenceFacts(baseline?.seenEvidenceFacts)
  const hasDurableSeenEvidence = baseline !== undefined
    && priorSeenEvidence !== undefined
    && priorSeenFacts !== undefined
  const seenEvidence = priorSeenEvidence ?? new Map()
  const seenFacts = priorSeenFacts ?? new Map()
  const physicalEvidence = runtimePhysicalEvidence(candidate, runtimeEvidence)
  // Resolved requirements cannot fund another recovery.  Conflicted review
  // records cannot do so either: their Reviewer-controlled identity is not a
  // trusted way to relabel a physical fact.
  const currentOpen = current.filter(item => (
    !conflictingIds.has(item.id)
    && !priorObligations.some(previousItem => previousItem.status === 'resolved' && sameObligation(previousItem, item))
  ))
  const evidenceSubjects = uniqueObligations([...priorOpen, ...currentOpen])
  const observedEvidence = new Map(evidenceSubjects.map(obligation => [
    obligation.id,
    obligationProgressEvidence(obligation, candidate, runtimeEvidence),
  ]))
  const newEvidenceByObligation = new Map()
  // Compare only with the prior durable snapshot.  One genuinely new Runtime
  // fact may be relevant to multiple already-declared independent obligations
  // in this same reconciliation; the renewal below still groups them once.
  const knownFactIds = new Set(seenFacts.keys())
  for (const obligation of [...evidenceSubjects].sort((left, right) => left.id.localeCompare(right.id))) {
    const known = new Set((seenEvidence.get(obligation.id) ?? []).map(item => item.id))
    const fresh = []
    if (baseline !== undefined && hasDurableSeenEvidence) {
      for (const proof of observedEvidence.get(obligation.id) ?? []) {
        if (known.has(proof.id) || knownFactIds.has(proof.factId)) continue
        fresh.push(proof)
      }
    }
    newEvidenceByObligation.set(obligation.id, fresh)
  }
  // Persist every observed proof, including an unsupported new record.  The
  // same proof cannot become new later merely because the Reviewer retries it
  // under another obligation ID or source version.
  for (const obligation of evidenceSubjects) {
    const retained = seenEvidence.get(obligation.id) ?? []
    const merged = new Map(retained.map(item => [item.id, item]))
    for (const proof of observedEvidence.get(obligation.id) ?? []) {
      merged.set(proof.id, proof)
      const { id, factId, ...fact } = proof
      if (!seenFacts.has(factId)) seenFacts.set(factId, { id: factId, ...fact })
    }
    if (merged.size > 0) seenEvidence.set(obligation.id, [...merged.values()])
  }
  // Record all candidate-validated Runtime facts, including one currently
  // relevant only to a resolved requirement.  A later Reviewer cannot relabel
  // that physical fact as a fresh issue and obtain another renewal.
  for (const fact of physicalEvidence) {
    if (!seenFacts.has(fact.id)) seenFacts.set(fact.id, fact)
  }
  const newEvidence = [...newEvidenceByObligation.values()].flat()
  const evidenceChanged = newEvidence.length > 0
  const closures = new Map(priorOpen.map(item => [item.id, verifiedClosure(item, review, candidate, runtimeEvidence, time)]))
  const resolved = priorOpen.filter(item => closures.get(item.id)?.resolution !== undefined)
  const closureBlockers = priorOpen
    .filter(item => closures.get(item.id)?.resolution === undefined)
    .map(item => ({ id: item.id, reason: closures.get(item.id)?.reason ?? 'closure_evidence_missing' }))
  const admittedNew = baseline === undefined
    ? unconflictedIntroduced
    : unconflictedIntroduced.filter(item => (newEvidenceByObligation.get(item.id) ?? []).length > 0)
  const unsupportedNewObligations = [
    ...(baseline === undefined ? [] : unconflictedIntroduced.filter(item => !admittedNew.includes(item))),
    ...current.filter(item => conflictingIds.has(item.id)),
  ]
  const obligations = baseline === undefined
    ? current
    : uniqueObligations([
        ...(baseline.obligations ?? []).map(item => {
          const resolvedItem = closures.get(item.id)?.resolution
          if (resolvedItem !== undefined) return { ...item, status: 'resolved', resolvedAt: time, resolution: resolvedItem }
          const display = current.find(next => sameObligation(item, next))
          return display === undefined
            ? item
            : { ...item, severity: display.severity, title: display.title, detail: display.detail, suggestion: display.suggestion }
        }),
        ...admittedNew,
      ])
  const openObligations = obligations.filter(item => item.status === 'open')
  const passed = review?.status === 'passed'
    && openObligations.length === 0
    && unsupportedNewObligations.length === 0
    && conflicts.length === 0
  const progress = passed
    ? 'passed'
    : resolved.length > 0
      ? 'obligation_reduced'
      : evidenceChanged
        ? 'new_evidence'
        : 'none'
  // Evidence can fund one later local retry, but never clears the finite
  // strategy ledger.  Workflow-wide attempt budgeting is deliberately owned
  // by Runtime (T-09), so this contract neither reads nor resets it.
  const usedStrategies = baseline === undefined
    ? []
    : [...new Set([...(baseline.usedStrategies ?? []), ...(candidate.strategy === undefined ? [] : [candidate.strategy])])]
  const renewalRecords = strategyRenewals(baseline?.localStrategyRenewals)
  const renewal = baseline === undefined ? undefined : renewalForEvidence(newEvidence, time)
  if (renewal !== undefined && !renewalRecords.some(item => item.id === renewal.id)) renewalRecords.push(renewal)
  const authorityClassification = reviewDecisionClassification(review, { obligations: openObligations })
  const authorityRequired = authorityClassification.authorityRequired
  const preferred = preferredStrategies(review, openObligations, unsupportedNewObligations)
  let consumedRenewal
  let nextStrategy = passed
    ? 'awaiting_approval'
    : authorityRequired
      ? 'request_user_authority'
      : nextUnusedStrategy(preferred, usedStrategies)
  if (nextStrategy === 'autonomous_incident' && !passed && !authorityRequired) {
    const available = renewalRecords.find(item => item.status === 'available')
    if (available !== undefined && preferred.includes('local_subgraph_rewrite')) {
      available.status = 'consumed'
      available.consumedAt = time
      consumedRenewal = available
      nextStrategy = 'local_subgraph_rewrite'
    }
  }
  const event = {
    at: time,
    candidatePlanDigest: candidate.planDigest,
    planStructureDigest: candidate.planStructureDigest,
    strategy: candidate.strategy ?? 'initial',
    progress,
    evidenceChanged,
    newEvidenceObligationIds: [...new Set(evidenceSubjects
      .filter(item => (newEvidenceByObligation.get(item.id) ?? []).length > 0)
      .map(item => item.id))],
    inheritedAcrossCycle,
    resolvedObligationIds: resolved.map(item => item.id),
    openObligationIds: openObligations.map(item => item.id),
    unsupportedNewObligationIds: unsupportedNewObligations.map(item => item.id),
    closureBlockers,
    identityConflicts: conflicts,
    ...(consumedRenewal === undefined ? {} : { consumedLocalStrategyRenewal: consumedRenewal.id }),
    nextStrategy,
  }
  return {
    contract: CONVERGENCE_CONTRACT,
    runtimeVersion: CONVERGENCE_RUNTIME_VERSION,
    cycleId: candidate.cycleId,
    inheritedAcrossCycle,
    evidenceDigest,
    seenEvidence: serializeSeenEvidence(seenEvidence),
    seenEvidenceFacts: serializeSeenEvidenceFacts(seenFacts),
    localStrategyRenewals: renewalRecords,
    obligations,
    unsupportedNewObligations,
    closureBlockers,
    identityConflicts: conflicts,
    usedStrategies,
    activeStrategy: candidate.strategy ?? 'initial',
    nextStrategy,
    progress,
    authorityRequired,
    authorityClassifications: authorityClassification.classifications,
    updatedAt: time,
    history: [...(baseline?.history ?? []), event].slice(-50),
  }
}

export function planRevisionCycleId(parent, intentIds) {
  return digest({ parent, intentIds: [...(intentIds ?? [])].sort() })
}

export function convergenceStrategyPrompt(strategy) {
  if (strategy === 'diagnose') {
    return '本轮不是再次润色计划。先只读核验未满足证据义务直接涉及的文件、命令入口和 Runtime facts；只有获得新事实后才能修改目标子图。'
  }
  if (strategy === 'owner_council') {
    return '本轮必须吸收受影响 Owner 的会诊事实并裁定接口边界；只修改会诊指向的局部子图，不得重写无关任务。'
  }
  if (strategy === 'arbitrate') {
    return '本轮按照独立 Arbiter 冻结的证据义务执行，不得新增审查类别；只提交能够关闭这些义务的最小局部差量。'
  }
  if (strategy === 'alternate_implementation') {
    return '此前策略没有减少未满足义务。本轮必须选择不同的实现/验收结构，复用已完成 checkpoint，禁止重复同一任务拓扑和 verification 绑定。'
  }
  return '本轮只重写 Reviewer targetTaskIds 及其必要后继的局部子图；无关任务、Owner 和验证定义必须保持语义不变。'
}

function failureAuthorityBasis(context) {
  const raw = context?.classificationBasis
  if (!plainRecord(raw) || !plainRecord(raw.source)) return undefined
  try {
    const basis = normalizeDecisionClassificationBasis(raw, raw.source, 'failure.classificationBasis')
    return classificationRequiresUserAuthority(basis) ? basis : undefined
  } catch {
    return undefined
  }
}

export function classifyFailure(error, context = {}) {
  const message = String(error?.message ?? error ?? '')
  const combined = `${message}\n${context.stderr ?? ''}\n${context.stdout ?? ''}`
  // Current structured user grounds outrank incidental technical error text.
  // Runtime validates execution bindings before supplying this basis.
  const authorityBasis = failureAuthorityBasis(context)
  if (authorityBasis !== undefined) {
    return { class: 'external_authority', message, classificationBasis: authorityBasis }
  }
  if (/(?:max[-_ ]?tokens|token budget|budget exhausted|context length|上下文.*上限|预算耗尽|额度耗尽)/iu.test(combined)) {
    return { class: 'budget_exhausted', message }
  }
  if (/(?:exit(?:Code)?\s*[=:]?\s*127|command not found|not found.*(?:tsc|node|npm|pnpm|yarn)|ENOENT|cwd 不存在|node_modules|控制桥|socket|ECONNREFUSED|EPIPE|lease|pid|端口.*占用|EADDRINUSE|沙箱|sandbox)/iu.test(combined)) {
    return { class: 'runtime_environment', message }
  }
  if (/(?:scope|越过.*范围|plan|dag|dependsOn|verification.*不存在|固定验证.*绑定|producer|validator|lineage|owner_submit.*契约|Schema)/iu.test(combined)) {
    return { class: 'contract_dag', message }
  }
  if (/(?:timeout|timed out|超时|rate.?limit|429|network|fetch failed|连接重置)/iu.test(combined)) {
    return { class: 'transient', message }
  }
  if (/(?:测试失败|verification|exit(?:Code)?\s*[=:]?\s*[1-9]|typecheck|build failed|assert|编译失败)/iu.test(combined)) {
    return { class: 'implementation', message }
  }
  return { class: 'unknown', message }
}

const FAILURE_STRATEGIES = Object.freeze({
  budget_exhausted: ['local_subgraph_rewrite', 'diagnose', 'alternate_implementation'],
  runtime_environment: ['repair_runtime', 'diagnose', 'same_owner_repair', 'local_subgraph_rewrite', 'alternate_implementation'],
  transient: ['repair_runtime', 'same_owner_repair', 'diagnose', 'alternate_implementation'],
  implementation: ['same_owner_repair', 'diagnose', 'local_subgraph_rewrite', 'owner_council', 'alternate_implementation'],
  contract_dag: ['local_subgraph_rewrite', 'owner_council', 'arbitrate', 'diagnose', 'alternate_implementation'],
  unknown: ['diagnose', 'same_owner_repair', 'owner_council', 'local_subgraph_rewrite', 'alternate_implementation'],
})

export function selectFailureRecovery({ failureClass, usedStrategies = [], evidenceChanged = false }) {
  if (failureClass === 'external_authority') return 'request_user_authority'
  const used = evidenceChanged ? [] : usedStrategies
  const preferred = FAILURE_STRATEGIES[failureClass] ?? FAILURE_STRATEGIES.unknown
  return nextUnusedStrategy(preferred, used)
}

export function failureFingerprint({ workflowId, planDigest, taskId, ownerId, failureClass, message, strategy }) {
  return digest({
    workflowId,
    planDigest,
    taskId,
    ownerId,
    failureClass,
    message: normalizedText(message),
    strategy,
  })
}

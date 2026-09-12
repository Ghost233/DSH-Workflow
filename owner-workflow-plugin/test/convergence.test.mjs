import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyFailure,
  planRevisionCycleId,
  planStructureDigest,
  reconcileReviewConvergence,
  reviewDecisionClassification,
  reviewIssueObligation,
  reviewObligations,
  reviewRequiresUserAuthority,
  selectFailureRecovery,
  workflowEvidenceDigest,
} from '../src/convergence.mjs'

function candidate(overrides = {}) {
  const plan = overrides.plan ?? {
    owners: [{ id: 'quality' }],
    verifications: [{ id: 'unit', run: ['npm', 'test'], cwd: '.' }],
    tasks: [{
      id: 'T1', role: 'work', ownerId: 'quality', dependsOn: [], write: ['tests/**'], verify: ['unit'],
      decomposition: { status: 'leaf', kind: 'leaf', ownerCandidates: ['quality'], unknowns: [] },
    }],
  }
  return {
    cycleId: planRevisionCycleId(1, ['intent-1']),
    planDigest: 'a'.repeat(64),
    planStructureDigest: planStructureDigest(plan),
    strategy: 'local_subgraph_rewrite',
    ...overrides,
  }
}

function review(status, title, detail = title) {
  return {
    status,
    summary: detail,
    issues: title === undefined ? [] : [{
      obligationId: 'test-review-obligation',
      sourceId: 'test-review-source',
      sourceVersion: 'R4',
      targetTaskIds: ['T1'],
      closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
      severity: 'high',
      title,
      detail,
      suggestion: '修复问题',
    }],
    targetTaskIds: title === undefined ? [] : ['T1'],
  }
}

test('证据义务冻结后，相同语义问题不会因改写标题被当成新进展', () => {
  const firstCandidate = candidate({ strategy: 'local_subgraph_rewrite' })
  const first = reconcileReviewConvergence({
    candidate: firstCandidate,
    review: review('needs_revision', '验证命令可能覆盖产物', 'role=verify 使用 --output 写入 artifact'),
    evidenceDigest: 'evidence-a',
    time: '2026-01-01T00:00:00.000Z',
  })
  assert.equal(first.obligations.length, 1)
  assert.equal(first.progress, 'none')

  const second = reconcileReviewConvergence({
    previous: first,
    candidate: candidate({ strategy: 'diagnose', planDigest: 'b'.repeat(64) }),
    review: review('needs_split', '只读 lineage 仍有第二生产者', 'validator 仍携带 --output'),
    evidenceDigest: 'evidence-a',
    time: '2026-01-01T00:01:00.000Z',
  })
  assert.equal(second.progress, 'none')
  assert.equal(second.obligations.filter(item => item.status === 'open').length, 1)
  assert.deepEqual(second.usedStrategies, ['diagnose'])
})

test('没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合', () => {
  const fixedVerification = {
    severity: 'high',
    title: '固定验证入口缺失',
    detail: 'T1 必须保留 unit 验证绑定',
    suggestion: '补回 unit 验证',
    obligationId: 'ac16-fixed-unit-binding',
    sourceId: 'AC-16',
    sourceVersion: 'R4',
    targetTaskIds: ['T1'],
    closeWhen: {
      kind: 'plan_verification_binding',
      taskId: 'T1',
      verificationId: 'unit',
    },
  }
  const first = reconcileReviewConvergence({
    candidate: candidate(),
    review: {
      status: 'needs_revision',
      summary: '固定验证入口缺失',
      issues: [fixedVerification],
      targetTaskIds: ['T1'],
    },
    evidenceDigest: 'same-evidence',
    time: '2026-01-01T00:00:00.000Z',
  })
  const nextReview = {
    status: 'needs_split',
    summary: '新增依赖来源要求',
    issues: [
      { ...fixedVerification, title: '固定验证入口仍缺失' },
      {
        obligationId: 'ac16-dependency-source',
        sourceId: 'AC-16',
        sourceVersion: 'R4',
        targetTaskIds: ['T1'],
        closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'registry' },
        severity: 'high',
        title: '依赖来源不完整',
        detail: '缺少 registry 与 integrity',
        suggestion: '增加来源',
      },
    ],
    targetTaskIds: ['T1'],
  }
  const second = reconcileReviewConvergence({
    previous: first,
    candidate: candidate({ strategy: 'local_subgraph_rewrite', planDigest: 'b'.repeat(64) }),
    review: nextReview,
    evidenceDigest: 'same-evidence',
    time: '2026-01-01T00:01:00.000Z',
  })
  assert.equal(second.unsupportedNewObligations.length, 1)
  assert.equal(second.nextStrategy, 'arbitrate')
  assert.equal(second.obligations.length, 1)
})

test('新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务', () => {
  const fixedVerification = {
    severity: 'high',
    title: '固定验证入口缺失',
    detail: 'T1 必须保留 unit 验证绑定',
    suggestion: '补回 unit 验证',
    obligationId: 'ac16-fixed-unit-binding',
    sourceId: 'AC-16',
    sourceVersion: 'R4',
    targetTaskIds: ['T1'],
    closeWhen: {
      kind: 'plan_verification_binding',
      taskId: 'T1',
      verificationId: 'unit',
    },
  }
  const first = reconcileReviewConvergence({
    candidate: candidate(),
    review: {
      status: 'needs_revision',
      summary: '固定验证入口缺失',
      issues: [fixedVerification],
      targetTaskIds: ['T1'],
    },
    evidenceDigest: 'evidence-a',
    time: '2026-01-01T00:00:00.000Z',
  })
  const second = reconcileReviewConvergence({
    previous: first,
    candidate: candidate({ strategy: 'diagnose', planDigest: 'b'.repeat(64) }),
    review: {
      status: 'needs_discovery',
      summary: '依赖来源需要核验',
      issues: [{
        obligationId: 'ac16-registry-binding',
        sourceId: 'AC-16',
        sourceVersion: 'R4',
        targetTaskIds: ['T1'],
        closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'registry' },
        severity: 'high',
        title: '依赖来源需要核验',
        detail: 'T1 需要 registry 固定验证绑定。',
        suggestion: '补齐 registry 绑定。',
      }],
    },
    evidenceDigest: 'evidence-b',
    time: '2026-01-01T00:01:00.000Z',
    runtimeEvidence: {
      planDigest: 'b'.repeat(64),
      planBindings: [{ taskId: 'T1', verificationId: 'registry' }],
    },
  })
  assert.equal(second.progress, 'new_evidence')
  assert.equal(second.unsupportedNewObligations.length, 0)
  assert.deepEqual(second.usedStrategies, ['diagnose'])
  assert.equal(second.obligations.filter(item => item.status === 'open').length, 2)
})

test('交替会诊文本、时间、会话、HEAD 和候选摘要不能在 30 轮内重置策略', () => {
  let state = reconcileReviewConvergence({
    candidate: candidate(),
    review: review('needs_revision', '会诊 A：固定事实未变'),
    evidenceDigest: 'diagnostic-initial',
    time: '2026-01-01T00:00:00.000Z',
    runtimeEvidence: { planDigest: 'a'.repeat(64), sessionId: 'session-initial', workflowHead: 'head-initial' },
  })
  for (let round = 0; round < 30; round += 1) {
    const planDigest = round % 2 === 0 ? 'b'.repeat(64) : 'a'.repeat(64)
    state = reconcileReviewConvergence({
      previous: state,
      candidate: candidate({
        planDigest,
        strategy: state.nextStrategy === 'autonomous_incident' ? undefined : state.nextStrategy,
        consultationSessionId: `session-${round}`,
        workflowHead: `unrelated-head-${round}`,
      }),
      review: review('needs_revision', round % 2 === 0 ? '会诊 A：同一结论' : '会诊 B：同义改写'),
      evidenceDigest: `diagnostic-${round}-${Date.UTC(2026, 0, 1, 0, 0, round)}`,
      time: `2026-01-01T00:00:${String(round).padStart(2, '0')}.000Z`,
      runtimeEvidence: { planDigest, sessionId: `session-${round}`, workflowHead: `unrelated-head-${round}` },
    })
    assert.equal(state.progress, 'none')
    assert.deepEqual(state.seenEvidenceFacts, [])
  }
  assert.deepEqual([...state.usedStrategies].sort(), [
    'alternate_implementation', 'arbitrate', 'diagnose', 'local_subgraph_rewrite', 'owner_council',
  ])
  assert.equal(state.nextStrategy, 'autonomous_incident')
})

test('当前候选恢复的验证绑定只登记一次进展，不自动关闭且重复事实不续期', () => {
  const initial = reconcileReviewConvergence({
    candidate: candidate(),
    review: review('needs_revision', '需要恢复 unit 固定绑定'),
    evidenceDigest: 'diagnostic-a',
    time: '2026-01-01T00:00:00.000Z',
  })
  const restoredCandidate = candidate({ planDigest: 'b'.repeat(64), strategy: initial.nextStrategy })
  const restoredEvidence = {
    planDigest: restoredCandidate.planDigest,
    planBindings: [{ taskId: 'T1', verificationId: 'unit' }],
  }
  const restored = reconcileReviewConvergence({
    previous: initial,
    candidate: restoredCandidate,
    review: review('needs_revision', 'Runtime 已恢复当前绑定，但 Reviewer 未请求关闭'),
    evidenceDigest: 'diagnostic-b',
    time: '2026-01-01T00:01:00.000Z',
    runtimeEvidence: restoredEvidence,
  })
  assert.equal(restored.progress, 'new_evidence')
  assert.equal(restored.obligations[0].status, 'open')
  assert.deepEqual(restored.usedStrategies, ['local_subgraph_rewrite'])
  assert.equal(restored.seenEvidence[restored.obligations[0].id].length, 1)
  assert.equal(restored.seenEvidenceFacts.length, 1)

  const replayed = reconcileReviewConvergence({
    previous: restored,
    candidate: candidate({ planDigest: restoredCandidate.planDigest, strategy: restored.nextStrategy, consultationSessionId: 'new-session' }),
    review: review('needs_revision', '另一位 Reviewer 重述恢复绑定'),
    evidenceDigest: 'diagnostic-c',
    time: '2026-01-01T00:02:00.000Z',
    runtimeEvidence: { ...restoredEvidence, sessionId: 'new-session', workflowHead: 'unrelated-head' },
  })
  assert.equal(replayed.progress, 'none')
  assert.equal(replayed.obligations[0].status, 'open')
  assert.equal(replayed.seenEvidenceFacts.length, 1)
  assert.deepEqual(replayed.usedStrategies, ['local_subgraph_rewrite', 'diagnose'])
})

test('已解决义务的新文件和反复更换 obligationId 都不能回收策略租约', () => {
  const resolvedIssue = {
    obligationId: 'resolved-unit', sourceId: 'AC-15', sourceVersion: 'R4', targetTaskIds: ['T1'],
    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
    severity: 'high', title: '已解决的 unit 绑定', detail: 'T1 绑定 unit。', suggestion: '无。',
  }
  const stillOpen = {
    obligationId: 'still-open-t2', sourceId: 'AC-15', sourceVersion: 'R4', targetTaskIds: ['T2'],
    closeWhen: { kind: 'plan_verification_binding', taskId: 'T2', verificationId: 'unit' },
    severity: 'high', title: 'T2 仍未解决', detail: 'T2 绑定 unit。', suggestion: '无。',
  }
  const initial = reconcileReviewConvergence({
    candidate: candidate(),
    review: { status: 'needs_revision', summary: '两项义务', issues: [resolvedIssue, stillOpen] },
    evidenceDigest: 'diagnostic-a', time: '2026-01-01T00:00:00.000Z',
  })
  const afterClosure = reconcileReviewConvergence({
    previous: initial,
    candidate: candidate({ strategy: initial.nextStrategy }),
    review: {
      status: 'needs_revision', summary: '只关闭 T1', issues: [resolvedIssue, stillOpen],
      obligationClosures: [{ obligationId: 'resolved-unit', kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit', planDigest: 'a'.repeat(64) }],
    },
    evidenceDigest: 'diagnostic-b', time: '2026-01-01T00:01:00.000Z',
    runtimeEvidence: { planDigest: 'a'.repeat(64), planBindings: [{ taskId: 'T1', verificationId: 'unit' }] },
  })
  const resolvedOnlyFile = { taskId: 'T1', path: 'src/already-resolved.js', kind: 'file', sha256: 'c'.repeat(64) }
  let state = reconcileReviewConvergence({
    previous: afterClosure,
    candidate: candidate({ strategy: afterClosure.nextStrategy }),
    review: { status: 'needs_revision', summary: 'T2 仍然阻塞', issues: [stillOpen] },
    evidenceDigest: 'diagnostic-c', time: '2026-01-01T00:02:00.000Z',
    runtimeEvidence: { planDigest: 'a'.repeat(64), verifiedFiles: [resolvedOnlyFile] },
  })
  assert.equal(state.progress, 'none')
  assert.equal(state.seenEvidenceFacts.some(item => item.path === resolvedOnlyFile.path), true)
  for (let round = 0; round < 5; round += 1) {
    const recycled = {
      ...stillOpen,
      obligationId: `recycled-${round}`,
      sourceId: `reviewer-${round}`,
      sourceVersion: `R4-${round}`,
      title: `换 ID 的同一文件事实 ${round}`,
    }
    state = reconcileReviewConvergence({
      previous: state,
      candidate: candidate({ strategy: state.nextStrategy === 'autonomous_incident' ? undefined : state.nextStrategy }),
      review: { status: 'needs_revision', summary: recycled.title, issues: [recycled] },
      evidenceDigest: `diagnostic-recycled-${round}`,
      time: `2026-01-01T00:03:0${round}.000Z`,
      runtimeEvidence: { planDigest: 'a'.repeat(64), verifiedFiles: [resolvedOnlyFile] },
    })
    assert.equal(state.progress, 'none')
    assert.equal(state.unsupportedNewObligations.length, 1)
  }
  assert.equal(state.localStrategyRenewals.length, 1)
  assert.equal(state.localStrategyRenewals[0].status, 'consumed')
})

test('决定分类只接受结构化业务差异或外部权限，关键词只是诊断提示', () => {
  const base = {
    obligationId: 'decision-classification', sourceId: 'AC-14', sourceVersion: 'R4', targetTaskIds: ['T1'],
    severity: 'high', suggestion: '记录可核验的决定。',
  }
  const technical = {
    ...base,
    title: '用户取消连接后的 token 清理顺序',
    detail: '现有取消回调仍能读取连接状态，需决定资源释放顺序。',
    closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'orchestrator' },
    classificationBasis: {
      source: { id: 'AC-14', version: 'R4' },
      technicalFacts: ['取消回调在 token 失效前仍需读取连接状态。'],
    },
  }
  const business = {
    ...base,
    obligationId: 'business-classification',
    title: '保留缓存恢复还是在取消后清空',
    detail: '当前承诺允许恢复消费者使用缓存；拟议行为会改变该承诺。',
    closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' },
    classificationBasis: {
      source: { id: 'AC-14', version: 'R4' },
      technicalFacts: ['恢复消费者当前依赖取消后的缓存。'],
      businessCommitmentDelta: {
        currentCommitment: '取消后保留缓存恢复',
        proposedCommitment: '取消后清空全部缓存',
        consequence: '恢复消费者不再能按原承诺恢复。',
      },
    },
  }
  const permission = {
    ...business,
    obligationId: 'permission-classification',
    title: '连接第三方生产服务',
    detail: '测试环境没有该服务的访问权限。',
    classificationBasis: {
      source: { id: 'AC-14', version: 'R4' },
      technicalFacts: ['当前测试环境没有生产服务访问令牌。'],
      externalPermissionGap: {
        requiredPermission: '生产服务访问令牌',
        target: '第三方生产服务',
        blockedAction: '发起真实连接验证',
      },
    },
  }
  assert.equal(reviewRequiresUserAuthority({ status: 'needs_decision', issues: [technical] }), false)
  assert.equal(reviewRequiresUserAuthority({ status: 'needs_decision', issues: [business] }), true)
  assert.equal(reviewRequiresUserAuthority({ status: 'needs_decision', issues: [permission] }), true)
  const mixed = reviewDecisionClassification({ status: 'needs_decision', issues: [technical, business] })
  assert.equal(mixed.authorityRequired, true)
  assert.equal(mixed.classifications.find(item => item.obligationId === 'decision-classification').keywordHint, true)
  assert.equal(reviewRequiresUserAuthority({
    status: 'needs_decision', decisionQuestions: ['用户 token 应在取消连接时如何释放？'],
  }), false)
})

test('未关闭的 user decision 不能被后续 Reviewer 遗漏或改写为 passed 而降权', () => {
  const issue = {
    obligationId: 'preserve-user-authority', sourceId: 'AC-14', sourceVersion: 'R4', targetTaskIds: ['T1'],
    closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' }, severity: 'high',
    title: '缓存恢复承诺待决定', detail: '取消后的缓存行为会影响既有恢复承诺。', suggestion: '由用户选择。',
    classificationBasis: {
      source: { id: 'AC-14', version: 'R4' },
      technicalFacts: ['恢复消费者当前依赖取消后的缓存。'],
      businessCommitmentDelta: {
        currentCommitment: '保留缓存恢复', proposedCommitment: '清空全部缓存', consequence: '恢复行为改变。',
      },
    },
  }
  const first = reconcileReviewConvergence({
    candidate: candidate(), review: { status: 'needs_decision', summary: '范围待决', issues: [issue] },
    evidenceDigest: 'evidence-a', time: '2026-01-01T00:00:00.000Z',
  })
  const omitted = reconcileReviewConvergence({
    previous: first, candidate: candidate(), review: { status: 'passed', summary: 'Reviewer 遗漏旧义务', issues: [] },
    evidenceDigest: 'evidence-a', time: '2026-01-01T00:01:00.000Z',
  })
  assert.equal(omitted.obligations.find(item => item.id === issue.obligationId).status, 'open')
  assert.equal(omitted.authorityRequired, true)
  assert.equal(omitted.nextStrategy, 'request_user_authority')
  assert.equal(omitted.authorityClassifications[0].scope, 'persisted_open_obligation')
})

test('新 decision_record 分类缺失或冲突被拒绝，旧显式 user authority 保守保留', () => {
  const base = {
    obligationId: 'strict-classification', sourceId: 'AC-14', sourceVersion: 'R4', targetTaskIds: ['T1'],
    closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' }, severity: 'high',
    title: '范围待定', detail: '需要选择。', suggestion: '记录决定。',
  }
  assert.throws(() => reviewIssueObligation(base), /classificationBasis/u)
  assert.equal(reviewIssueObligation(base, {}, { allowLegacyObligations: true }).decisionClassification, 'legacy_unclassified')
  assert.equal(reviewRequiresUserAuthority({ status: 'needs_decision', issues: [base] }), true)
  assert.throws(() => reviewIssueObligation({
    ...base,
    classificationBasis: {
      source: { id: 'AC-14', version: 'R4' }, technicalFacts: ['资源释放顺序尚未固定。'],
    },
  }), /classificationBasis.*技术事实|authority/u)
  assert.throws(() => reviewIssueObligation({
    ...base,
    closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'orchestrator' },
    classificationBasis: {
      source: { id: 'AC-14', version: 'R4' }, technicalFacts: ['缓存被恢复消费者读取。'],
      businessCommitmentDelta: {
        currentCommitment: '允许恢复', proposedCommitment: '禁止恢复', consequence: '恢复行为改变。',
      },
    },
  }), /classificationBasis.*业务承诺|authority/u)
})

test('失败分类选择不同的自治恢复策略而不是统一 await_user', () => {
  assert.equal(classifyFailure('planner stopped: max-tokens，预算耗尽').class, 'budget_exhausted')
  assert.equal(classifyFailure('npm run typecheck exitCode=127 command not found').class, 'runtime_environment')
  assert.equal(classifyFailure('固定验证 unit exitCode=1').class, 'implementation')
  assert.equal(classifyFailure('role=verify 使用 --output 违反唯一 producer').class, 'contract_dag')
  assert.equal(classifyFailure('credential unauthorized while using a token').class, 'unknown')
  assert.equal(classifyFailure('连接失败', {
    classificationBasis: {
      source: { id: 'AC-14', version: 'R4' },
      technicalFacts: ['当前环境没有生产服务凭据。'],
      externalPermissionGap: {
        requiredPermission: '生产服务凭据', target: '支付服务', blockedAction: '执行真实结算',
      },
    },
  }).class, 'external_authority')
  assert.equal(selectFailureRecovery({ failureClass: 'runtime_environment' }), 'repair_runtime')
  assert.equal(selectFailureRecovery({ failureClass: 'budget_exhausted' }), 'local_subgraph_rewrite')
  assert.equal(selectFailureRecovery({
    failureClass: 'runtime_environment',
    usedStrategies: ['repair_runtime'],
  }), 'diagnose')
})

test('Workflow 证据摘要只投影稳定的任务结果和 Runtime 文件哈希', () => {
  const base = {
    workflowHead: 'a',
    activePlanRevision: 1,
    tasks: [{
      taskId: 'T1',
      status: 'running',
      cursor: 'cursor-a',
      fixedCommitSha: 'commit-a',
      verificationResults: {
        unit: {
          passed: true,
          exitCode: 0,
          contentDigest: 'content-a',
          sessionId: 'session-a',
          startedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    }],
  }
  const facts = {
    generatedAt: '2026-01-01T00:00:00.000Z',
    worktrees: [{
      worktree: '/temporary/session-a', ownerId: 'quality', runs: [{ status: 'running' }],
      files: [{ candidateTaskIds: ['T1'], path: 'src/work.js', kind: 'file', sha256: 'a'.repeat(64) }],
    }],
  }
  const first = workflowEvidenceDigest(base, facts)
  const bookkeepingOnly = workflowEvidenceDigest(
    {
      ...base,
      workflowHead: 'unrelated-head',
      activePlanRevision: 2,
      error: '换一种总结',
      planningAgent: { ownerConsultations: [{ facts: ['会诊文字变化'], constraints: ['另一会话'] }] },
      tasks: [{ ...base.tasks[0], status: 'completed', cursor: 'cursor-b', verificationResults: {
        unit: { ...base.tasks[0].verificationResults.unit, sessionId: 'session-b', startedAt: '2026-01-01T00:10:00.000Z' },
      } }],
    },
    { ...facts, generatedAt: '2026-01-01T00:10:00.000Z', worktrees: [{ ...facts.worktrees[0], worktree: '/temporary/session-b', runs: [{ status: 'completed' }] }] },
  )
  assert.equal(first, bookkeepingOnly)
  const contentChanged = workflowEvidenceDigest(base, {
    ...facts,
    worktrees: [{ ...facts.worktrees[0], files: [{ candidateTaskIds: ['T1'], path: 'src/work.js', kind: 'file', sha256: 'b'.repeat(64) }] }],
  })
  assert.notEqual(first, contentChanged)
  const verificationChanged = workflowEvidenceDigest({
    ...base,
    tasks: [{ ...base.tasks[0], verificationResults: { unit: { ...base.tasks[0].verificationResults.unit, contentDigest: 'content-b' } } }],
  }, facts)
  assert.notEqual(first, verificationChanged)
})

test('稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并', () => {
  const verification = reviewIssueObligation({
    obligationId: 'ac16-fixed-verification',
    sourceId: 'AC-16',
    sourceVersion: 'R4',
    targetTaskIds: ['T1'],
    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
    severity: 'high',
    title: '固定验证尚未绑定',
    detail: 'T1 必须绑定 unit。',
    suggestion: '绑定 unit。',
  })
  const acceptance = reviewIssueObligation({
    obligationId: 'ac16-independent-acceptance',
    sourceId: 'AC-16',
    sourceVersion: 'R4',
    targetTaskIds: ['T1'],
    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'acceptance' },
    severity: 'high',
    title: '独立验收尚未绑定',
    detail: 'T1 还必须绑定 acceptance。',
    suggestion: '绑定 acceptance。',
  })
  const retitled = reviewIssueObligation({
    obligationId: 'ac16-fixed-verification',
    sourceId: 'AC-16',
    sourceVersion: 'R4',
    targetTaskIds: ['T1'],
    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
    severity: 'high',
    title: '标题重写后仍是同一义务',
    detail: 'T1 必须绑定 unit。',
    suggestion: '绑定 unit。',
  })

  assert.notEqual(verification.id, acceptance.id)
  assert.equal(verification.id, retitled.id)
  assert.deepEqual(verification.source, { id: 'AC-16', version: 'R4' })
  assert.deepEqual(verification.targetTaskIds, ['T1'])
  assert.deepEqual(verification.closeWhen, {
    kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit',
  })
  const titleCategoryBefore = reviewIssueObligation({
    title: 'Owner scope 仍然不明', detail: '同一条非展示要求。', suggestion: '补齐确定性证明。',
  }, {}, { allowLegacyObligations: true })
  const titleCategoryAfter = reviewIssueObligation({
    title: '固定 verification 仍然不明', detail: '同一条非展示要求。', suggestion: '补齐确定性证明。',
  }, {}, { allowLegacyObligations: true })
  assert.notEqual(titleCategoryBefore.id, titleCategoryAfter.id)
})

test('展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝', () => {
  const base = {
    obligationId: 'AC-16-unit',
    sourceId: 'AC-16',
    sourceVersion: 'R4',
    targetTaskIds: ['T1'],
    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
    severity: 'high',
    detail: '保留固定验证绑定。',
    suggestion: '绑定 unit。',
  }
  const withTaskLikeTitle = reviewIssueObligation({ ...base, title: '说明中提到 T2 但目标仍是 T1' })
  const retitled = reviewIssueObligation({ ...base, title: 'ordinary Title wording changed' })
  assert.deepEqual(withTaskLikeTitle.targetTaskIds, ['T1'])
  assert.equal(withTaskLikeTitle.id, retitled.id)
  assert.throws(() => reviewObligations({
    issues: [
      base,
      { ...base, closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'integration' } },
    ],
  }), /同一.*义务|obligationId.*合同/u)
})

test('严格义务必须有 ID；已见事实不能用新 ID 重新引入已解决的合同', () => {
  const contract = {
    sourceId: 'AC-16',
    sourceVersion: 'R4',
    targetTaskIds: ['T1'],
    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
    severity: 'high',
    detail: '同一来源中的独立要求。',
    suggestion: '保留每项要求。',
  }
  assert.throws(() => reviewIssueObligation({ ...contract, title: '没有 ID' }), /obligationId/u)

  const firstIssue = { ...contract, obligationId: 'ac16-requirement-one', title: '要求一' }
  const initial = reconcileReviewConvergence({
    candidate: candidate(),
    review: { status: 'needs_revision', summary: '记录要求一', issues: [firstIssue] },
    evidenceDigest: 'evidence-a',
    time: '2026-01-01T00:00:00.000Z',
  })
  const resolved = reconcileReviewConvergence({
    previous: initial,
    candidate: candidate(),
    review: {
      status: 'passed',
      summary: '关闭要求一',
      issues: [{ ...firstIssue, title: '要求一的展示文案更新' }],
      obligationClosures: [{
        obligationId: 'ac16-requirement-one',
        kind: 'plan_verification_binding',
        taskId: 'T1',
        verificationId: 'unit',
        planDigest: 'a'.repeat(64),
      }],
    },
    evidenceDigest: 'evidence-a',
    time: '2026-01-01T00:01:00.000Z',
    runtimeEvidence: { planDigest: 'a'.repeat(64), planBindings: [{ taskId: 'T1', verificationId: 'unit' }] },
  })
  assert.equal(resolved.obligations[0].status, 'resolved')

  const secondId = reconcileReviewConvergence({
    previous: resolved,
    candidate: candidate(),
    review: {
      status: 'passed',
      summary: '出现同合同的另一项要求',
      issues: [{ ...contract, obligationId: 'ac16-requirement-two', title: '完全不同的标题' }],
    },
    evidenceDigest: 'evidence-b',
    time: '2026-01-01T00:02:00.000Z',
  })
  assert.deepEqual(
    secondId.obligations.map(item => [item.id, item.status]),
    [['ac16-requirement-one', 'resolved']],
  )
  assert.equal(secondId.unsupportedNewObligations[0].id, 'ac16-requirement-two')
  assert.notEqual(secondId.nextStrategy, 'awaiting_approval')
})

test('不同 obligationId 的同合同要求独立保留，关闭一项不会关闭另一项', () => {
  const base = {
    sourceId: 'AC-16', sourceVersion: 'R4', targetTaskIds: ['T1'],
    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
    severity: 'high', detail: '各项义务分别关闭。', suggestion: '保留独立 ID。',
  }
  const firstIssue = { ...base, obligationId: 'ac16-independent-one', title: '要求一' }
  const secondIssue = { ...base, obligationId: 'ac16-independent-two', title: '要求二' }
  const initial = reconcileReviewConvergence({
    candidate: candidate(), review: { status: 'needs_revision', summary: '两项独立要求', issues: [firstIssue, secondIssue] },
    evidenceDigest: 'evidence-a', time: '2026-01-01T00:00:00.000Z',
  })
  const afterOneClosure = reconcileReviewConvergence({
    previous: initial, candidate: candidate(),
    review: {
      status: 'needs_revision', summary: '只关闭第一项', issues: [firstIssue, secondIssue],
      obligationClosures: [{
        obligationId: firstIssue.obligationId, kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit', planDigest: 'a'.repeat(64),
      }],
    },
    evidenceDigest: 'evidence-a', time: '2026-01-01T00:01:00.000Z',
    runtimeEvidence: { planDigest: 'a'.repeat(64), planBindings: [{ taskId: 'T1', verificationId: 'unit' }] },
  })
  assert.deepEqual(afterOneClosure.obligations.map(item => [item.id, item.status]), [
    ['ac16-independent-one', 'resolved'],
    ['ac16-independent-two', 'open'],
  ])
})

test('已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告', () => {
  const resolved = reviewIssueObligation({
    obligationId: 'legacy-acceptance',
    sourceId: 'AC-16',
    sourceVersion: 'R4',
    targetTaskIds: ['T1'],
    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
    severity: 'high',
    title: '旧义务',
    detail: '同一合同。',
    suggestion: '无。',
  })
  const previous = {
    contract: 'DSH_WORKFLOW_CONVERGENCE_V1',
    cycleId: candidate().cycleId,
    evidenceDigest: 'evidence-a',
    obligations: [{ ...resolved, status: 'resolved', resolvedAt: '2026-01-01T00:00:00.000Z' }],
  }
  const next = reconcileReviewConvergence({
    previous,
    candidate: candidate(),
    review: {
      status: 'passed',
      summary: '重复报告了已解决义务',
      issues: [{
        obligationId: 'legacy-acceptance',
        sourceId: 'AC-16',
        sourceVersion: 'R4',
        targetTaskIds: ['T1'],
        closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
        severity: 'high',
        title: '文案已改写',
        detail: '同一合同。',
        suggestion: '无。',
      }],
    },
    evidenceDigest: 'evidence-a',
    time: '2026-01-01T00:01:00.000Z',
  })
  assert.equal(next.obligations.length, 1)
  assert.equal(next.obligations[0].status, 'resolved')
  assert.equal(next.unsupportedNewObligations.length, 0)
  assert.equal(next.nextStrategy, 'awaiting_approval')
})

test('遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等', () => {
  const issue = {
    obligationId: 'ac32-unit-binding',
    sourceId: 'AC-32',
    sourceVersion: 'R4',
    targetTaskIds: ['T1'],
    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
    severity: 'high',
    title: '必须提供 unit 固定验证',
    detail: '当前任务缺少 unit 固定验证绑定。',
    suggestion: '把 unit 绑定到 T1。',
  }
  const first = reconcileReviewConvergence({
    candidate: candidate(),
    review: { ...review('needs_revision', undefined), issues: [issue], targetTaskIds: ['T1'] },
    evidenceDigest: 'evidence-a',
    time: '2026-01-01T00:00:00.000Z',
  })
  const nextCandidate = candidate({ planDigest: 'b'.repeat(64) })
  const omitted = reconcileReviewConvergence({
    previous: first,
    candidate: nextCandidate,
    review: { ...review('passed', undefined), obligationClosures: [] },
    evidenceDigest: 'evidence-b',
    time: '2026-01-01T00:01:00.000Z',
    runtimeEvidence: { planDigest: nextCandidate.planDigest, planBindings: [{ taskId: 'T1', verificationId: 'unit' }] },
  })
  assert.equal(omitted.obligations.filter(item => item.status === 'open').length, 1)
  assert.notEqual(omitted.nextStrategy, 'awaiting_approval')

  const stale = reconcileReviewConvergence({
    previous: omitted,
    candidate: nextCandidate,
    review: {
      ...review('passed', undefined),
      obligationClosures: [{
        obligationId: first.obligations[0].id,
        kind: 'plan_verification_binding',
        taskId: 'T1',
        verificationId: 'unit',
        planDigest: 'a'.repeat(64),
      }],
    },
    evidenceDigest: 'evidence-b',
    time: '2026-01-01T00:02:00.000Z',
    runtimeEvidence: { planDigest: nextCandidate.planDigest, planBindings: [{ taskId: 'T1', verificationId: 'unit' }] },
  })
  assert.equal(stale.obligations.filter(item => item.status === 'open').length, 1)

  const closed = reconcileReviewConvergence({
    previous: stale,
    candidate: nextCandidate,
    review: {
      ...review('passed', undefined),
      obligationClosures: [{
        obligationId: first.obligations[0].id,
        kind: 'plan_verification_binding',
        taskId: 'T1',
        verificationId: 'unit',
        planDigest: nextCandidate.planDigest,
      }],
    },
    evidenceDigest: 'evidence-b',
    time: '2026-01-01T00:03:00.000Z',
    runtimeEvidence: { planDigest: nextCandidate.planDigest, planBindings: [{ taskId: 'T1', verificationId: 'unit' }] },
  })
  assert.equal(closed.obligations.filter(item => item.status === 'open').length, 0)
  assert.equal(closed.obligations[0].resolution.kind, 'plan_verification_binding')
  assert.equal(closed.nextStrategy, 'awaiting_approval')

  const replayed = reconcileReviewConvergence({
    previous: closed,
    candidate: nextCandidate,
    review: closed.review ?? { ...review('passed', undefined), obligationClosures: [] },
    evidenceDigest: 'evidence-b',
    time: '2026-01-01T00:04:00.000Z',
    runtimeEvidence: { planDigest: nextCandidate.planDigest, planBindings: [{ taskId: 'T1', verificationId: 'unit' }] },
  })
  assert.equal(replayed.obligations.length, 1)
  assert.equal(replayed.obligations[0].status, 'resolved')
})

test('任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果', () => {
  const issue = {
    obligationId: 'AC-32-current-result',
    sourceId: 'AC-32',
    sourceVersion: 'R4',
    targetTaskIds: ['T1'],
    closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' },
    severity: 'high',
    title: '需要当前验证结果',
    detail: '验证结果不能来自旧内容。',
    suggestion: '提供当前结果。',
  }
  const initial = reconcileReviewConvergence({
    candidate: candidate(),
    review: { status: 'needs_revision', summary: '需要当前验证结果', issues: [issue] },
    evidenceDigest: 'evidence-a',
    time: '2026-01-01T00:00:00.000Z',
  })
  const closeReview = {
    status: 'passed',
    summary: '请求关闭',
    issues: [],
    obligationClosures: [{
      obligationId: initial.obligations[0].id,
      kind: 'task_verification_result',
      taskId: 'T1',
      verificationId: 'unit',
      planDigest: initial.history[0].candidatePlanDigest,
    }],
  }
  const baseResult = {
    taskId: 'T1',
    verificationId: 'unit',
    planDigest: initial.history[0].candidatePlanDigest,
    passed: true,
    exitCode: 0,
    contentDigest: 'content-a',
  }
  const stale = reconcileReviewConvergence({
    previous: initial,
    candidate: candidate(),
    review: closeReview,
    evidenceDigest: 'evidence-a',
    time: '2026-01-01T00:01:00.000Z',
    runtimeEvidence: { planDigest: initial.history[0].candidatePlanDigest, taskVerificationResults: [baseResult] },
  })
  assert.equal(stale.obligations[0].status, 'open')
  assert.equal(stale.closureBlockers[0].reason, 'closure_evidence_unverified')
  const current = reconcileReviewConvergence({
    previous: stale,
    candidate: candidate(),
    review: closeReview,
    evidenceDigest: 'evidence-a',
    time: '2026-01-01T00:02:00.000Z',
    runtimeEvidence: { planDigest: initial.history[0].candidatePlanDigest, taskVerificationResults: [{ ...baseResult, current: true }] },
  })
  assert.equal(current.obligations[0].status, 'resolved')
})

test('旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定', () => {
  const previous = {
    contract: 'DSH_WORKFLOW_CONVERGENCE_V1',
    cycleId: 'previous-plan-cycle',
    evidenceDigest: 'evidence-a',
    obligations: [{ id: 'legacy-obligation', category: 'acceptance-evidence', targetTaskIds: ['T1'], status: 'open' }],
  }
  const next = reconcileReviewConvergence({
    previous,
    candidate: candidate({ planDigest: 'b'.repeat(64) }),
    review: {
      ...review('passed', undefined),
      obligationClosures: [{
        obligationId: 'legacy-obligation',
        kind: 'alternative_decision',
        planDigest: 'b'.repeat(64),
        decisionId: 'self-declared',
        sourceId: 'AC-16',
        sourceVersion: 'R4',
      }],
    },
    evidenceDigest: 'evidence-b',
    time: '2026-01-01T00:01:00.000Z',
    runtimeEvidence: { planDigest: 'b'.repeat(64), planBindings: [] },
  })
  assert.equal(next.obligations[0].status, 'open')
  assert.equal(next.closureBlockers[0].reason, 'missing_closure_contract')
  assert.equal(next.inheritedAcrossCycle, true)
  assert.notEqual(next.nextStrategy, 'awaiting_approval')
})

test('显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入', () => {
  const legacyIssue = {
    obligationId: 'legacy-contract-free',
    targetTaskIds: ['T1'],
    severity: 'high',
    title: '历史义务',
    detail: '旧合同没有关闭条件。',
    suggestion: '保留记录。',
  }
  const legacy = reviewIssueObligation(legacyIssue, {}, { allowLegacyObligations: true })
  const next = reconcileReviewConvergence({
    previous: {
      contract: 'DSH_WORKFLOW_CONVERGENCE_V1',
      cycleId: candidate().cycleId,
      evidenceDigest: 'evidence-a',
      obligations: [{ ...legacy, status: 'resolved', resolvedAt: '2026-01-01T00:00:00.000Z' }],
    },
    candidate: candidate(),
    review: { status: 'passed', summary: '重复读取旧记录', issues: [legacyIssue] },
    evidenceDigest: 'evidence-a',
    time: '2026-01-01T00:01:00.000Z',
    allowLegacyObligations: true,
  })
  assert.equal(next.obligations.length, 1)
  assert.equal(next.obligations[0].status, 'resolved')
  assert.equal(next.unsupportedNewObligations.length, 0)
})


test('旧字符串与问题列表按原文保留不同路径的要求身份', () => {
  const options = { allowLegacyObligations: true }
  const first = reviewIssueObligation('检查 src/alpha.ts', {}, options)
  const second = reviewIssueObligation('检查 src/beta.ts', {}, options)
  assert.notEqual(first.id, second.id)
  assert.equal(first.title, '检查 src/alpha.ts')
  for (const kind of ['decision', 'discovery']) {
    const review = {
      status: `needs_${kind}`,
      issues: [],
      [`${kind}Questions`]: ['检查 src/alpha.ts？', '检查 src/beta.ts？'],
    }
    const result = reconcileReviewConvergence({
      previous: undefined, candidate: candidate(), review,
      allowLegacyObligations: true,
    })
    assert.equal(result.obligations.length, 2)
    assert.notEqual(result.obligations[0].id, result.obligations[1].id)
  }
})

test('结构可执行关闭只依赖 Runtime 记录的任务存在，不将其视为业务完成', () => {
  const issue = {
    obligationId: 'ac32-executable-subtree',
    sourceId: 'AC-32',
    sourceVersion: 'R4',
    targetTaskIds: ['T1'],
    closeWhen: { kind: 'plan_task_executable', taskId: 'T1' },
    severity: 'high',
    title: '任务需要可执行结构',
    detail: '这是结构性义务。',
    suggestion: '记录可执行任务。',
  }
  const initial = reconcileReviewConvergence({
    candidate: candidate(),
    review: { status: 'needs_split', summary: '尚不可执行', issues: [issue] },
    evidenceDigest: 'evidence-a', time: '2026-01-01T00:00:00.000Z',
  })
  const closeReview = {
    status: 'passed', summary: '请求关闭结构义务', issues: [],
    obligationClosures: [{
      obligationId: issue.obligationId, kind: 'plan_task_executable', taskId: 'T1', planDigest: initial.history[0].candidatePlanDigest,
    }],
  }
  const omitted = reconcileReviewConvergence({
    previous: initial, candidate: candidate(), review: closeReview,
    evidenceDigest: 'evidence-a', time: '2026-01-01T00:01:00.000Z',
    runtimeEvidence: { planDigest: initial.history[0].candidatePlanDigest, taskVerificationResults: [] },
  })
  assert.equal(omitted.obligations[0].status, 'open')
  const closed = reconcileReviewConvergence({
    previous: omitted, candidate: candidate(), review: closeReview,
    evidenceDigest: 'evidence-a', time: '2026-01-01T00:02:00.000Z',
    runtimeEvidence: { planDigest: initial.history[0].candidatePlanDigest, executableTasks: [{ taskId: 'T1' }] },
  })
  assert.equal(closed.obligations[0].status, 'resolved')
  assert.deepEqual(closed.obligations[0].resolution, {
    kind: 'plan_task_executable', taskId: 'T1', planDigest: initial.history[0].candidatePlanDigest, resolvedAt: '2026-01-01T00:02:00.000Z',
  })
})

test('版本化决定必须由 Runtime 当前记录完整绑定，且不同义务 ID 不会共享关闭结果', () => {
  const decisionIssue = obligationId => ({
    obligationId,
    sourceId: 'AC-32',
    sourceVersion: 'R4',
    targetTaskIds: ['T1'],
    closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'orchestrator' },
    classificationBasis: {
      source: { id: 'AC-32', version: 'R4' },
      technicalFacts: ['当前候选需要由编排器固定既有技术方案。'],
    },
    severity: 'high',
    title: '需要编排器决定',
    detail: '必须引用当前版本的 Runtime 决定。',
    suggestion: '记录决定。',
  })
  const firstId = 'ac32-contract-decision'
  const secondId = 'ac32-same-source-independent-decision'
  const initial = reconcileReviewConvergence({
    candidate: candidate(),
    review: { status: 'needs_decision', summary: '需要技术决定', issues: [decisionIssue(firstId), decisionIssue(secondId)] },
    evidenceDigest: 'evidence-a', time: '2026-01-01T00:00:00.000Z',
  })
  const closeReview = {
    status: 'passed', summary: '请求记录决定关闭', issues: [],
    obligationClosures: [{
      obligationId: firstId, kind: 'decision_record', taskId: 'T1', planDigest: initial.history[0].candidatePlanDigest, decisionId: 'decision-r4-1',
    }],
  }
  const record = overrides => ({
    decisionId: 'decision-r4-1', obligationId: firstId, planDigest: initial.history[0].candidatePlanDigest,
    taskId: 'T1', authority: 'orchestrator', source: { id: 'AC-32', version: 'R4' }, status: 'recorded', current: true,
    ...overrides,
  })
  const evidence = decisionRecords => ({ planDigest: initial.history[0].candidatePlanDigest, decisionRecords })
  for (const invalid of [
    record({ planDigest: 'b'.repeat(64) }),
    record({ decisionId: 'decision-r4-stale' }),
    record({ taskId: 'T2' }),
    record({ source: { id: 'AC-32', version: 'R3' } }),
    record({ authority: 'user' }),
    record({ current: false }),
  ]) {
    const rejected = reconcileReviewConvergence({
      previous: initial, candidate: candidate(), review: closeReview,
      evidenceDigest: 'evidence-a', time: '2026-01-01T00:01:00.000Z', runtimeEvidence: evidence([invalid]),
    })
    assert.equal(rejected.obligations.find(item => item.id === firstId).status, 'open')
    assert.equal(rejected.closureBlockers.find(item => item.id === firstId).reason, 'closure_evidence_unverified')
  }
  const closed = reconcileReviewConvergence({
    previous: initial, candidate: candidate(), review: closeReview,
    evidenceDigest: 'evidence-a', time: '2026-01-01T00:02:00.000Z', runtimeEvidence: evidence([record()]),
  })
  assert.equal(closed.obligations.find(item => item.id === firstId).status, 'resolved')
  assert.equal(closed.obligations.find(item => item.id === secondId).status, 'open')
  assert.equal(closed.obligations.find(item => item.id === firstId).resolution.decisionId, 'decision-r4-1')
})

test('decision_record 的 user authority 明确请求用户，同时保留旧问题文本回退', () => {
  assert.equal(reviewRequiresUserAuthority({
    status: 'needs_decision',
    issues: [{ closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' } }],
  }), true)
  assert.equal(reviewRequiresUserAuthority({
    status: 'needs_decision',
    issues: [{ closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'orchestrator' } }],
  }), false)
})

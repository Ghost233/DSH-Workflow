import assert from 'node:assert/strict'
import test from 'node:test'
import {
  markdownCode, planningDecisionDetail, publicOwnerBusinessDecisionDetail,
  planningAuthorizationDetail, crossThreadCancellationDetail, recoveryAuthorizationDetail,
  decisionPresentationDetail,
} from '../src/approval-markdown.mjs'

test('decision cards show business differences and escaped facts instead of raw JSON', () => {
  const detail = planningDecisionDetail({ detail: '现有 *行为* 将改变', suggestion: '请用户决定',
    classificationBasis: { source: { id: 'AC-14', version: 'R4' }, technicalFacts: ['路径 ** 仍匹配'],
      businessCommitmentDelta: { currentCommitment: '保留缓存', proposedCommitment: '清空缓存', consequence: '无法恢复' },
      externalPermissionGap: { requiredPermission: '发布权限', target: '生产环境', blockedAction: '部署服务' } } })
  assert.match(detail, /### 技术事实/u)
  assert.match(detail, /当前承诺：保留缓存/u)
  assert.match(detail, /建议承诺：清空缓存/u)
  assert.match(detail, /所需权限：发布权限/u)
  assert.match(detail, /现有 \\\*行为\\\* 将改变/u)
  assert.match(detail, /路径 \\\*\\\* 仍匹配/u)
  assert.doesNotMatch(detail, /"businessCommitmentDelta"|"technicalFacts"/u)
})

test('public Owner card shows the exact acceptance criterion and commitment change', () => {
  const detail = publicOwnerBusinessDecisionDetail({ acceptanceCriterion: 'AC-1',
    currentCommitment: '保留', proposedCommitment: '移除', consequence: '旧客户端无法恢复' })
  assert.match(detail, /关联验收条件：\*\* `AC-1`/u)
  assert.match(detail, /当前承诺：保留/u)
  assert.match(detail, /建议承诺：移除/u)
  assert.match(detail, /旧客户端无法恢复/u)
  assert.doesNotMatch(detail, /\{"acceptanceCriterion"/u)
})

test('planning card keeps the full spec and renders paths and glob as code', () => {
  const detail = planningAuthorizationDetail({ root: '/repo', branch: 'main',
    spec: { id: 'S1', revision: 'R2', content: '# 规格\n\n- 验收 A' },
    scope: { roots: ['docs/specs'], files: ['CONTEXT.md'] }, files: ['docs/specs/S1.md'] })
  assert.match(detail, /### 授权范围/u)
  assert.match(detail, /`docs\/specs\/\*\*\/\*\.md`/u)
  assert.match(detail, /- `docs\/specs\/S1\.md`/u)
  assert.match(detail, /### 规格内容\n# 规格\n\n- 验收 A/u)
  assert.equal(markdownCode('a`b'), '`` a`b ``')
})

test('cross-thread and recovery cards present scope and limits as Markdown', () => {
  const cancel = crossThreadCancellationDetail({ root: '/repo', workflowId: 'W-1',
    originalSessionId: 'session-old', requestingSessionId: 'session-new' })
  assert.match(cancel, /\*\*旧工作流：\*\* `W-1`/u)
  assert.match(cancel, /### 本次操作/u)
  assert.match(cancel, /保留候选、历史、恢复计数/u)
  const recovery = recoveryAuthorizationDetail({ reason: '需要修复', used: 2, attempts: 1, limit: 4 })
  assert.match(recovery, /\*\*已使用：\*\* 2 次/u)
  assert.match(recovery, /\*\*本次最多增加：\*\* 1 次/u)
  assert.match(recovery, /\*\*恢复总上限：\*\* 4 次/u)
})

test('durable decision JSON stays unchanged while its question is rendered as Markdown', () => {
  const business = { request: { detail: JSON.stringify({ acceptanceCriterion: 'AC-1', currentCommitment: '保留',
    proposedCommitment: '移除', consequence: '不再恢复' }) }, binding: { publicOwnerDecisionDigest: 'digest' } }
  const original = JSON.stringify(business)
  assert.match(decisionPresentationDetail(business), /建议承诺：移除/u)
  assert.equal(JSON.stringify(business), original)
  const planning = { request: { detail: JSON.stringify({ source: { id: 'AC-2', version: 'R1' },
    technicalFacts: ['原行为'], businessCommitmentDelta: { currentCommitment: 'A', proposedCommitment: 'B', consequence: 'C' } }) },
  binding: { obligationId: 'issue' } }
  assert.match(decisionPresentationDetail(planning), /### 技术事实/u)
  assert.match(decisionPresentationDetail(planning), /建议承诺：B/u)
  const recovery = { request: { detail: 'legacy single-line detail' },
    binding: { recoveryRequest: { reason: '修复一次', attempts: 1 }, recovery: { used: 2, limit: 3 } } }
  assert.match(decisionPresentationDetail(recovery), /恢复总上限：\*\* 3 次/u)
  assert.equal(recovery.request.detail, 'legacy single-line detail')
  assert.equal(decisionPresentationDetail({ request: { detail: 'unparseable' }, binding: { obligationId: 'old' } }), 'unparseable')
})

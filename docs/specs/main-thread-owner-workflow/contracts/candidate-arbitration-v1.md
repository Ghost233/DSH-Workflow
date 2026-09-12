# Candidate arbitration V1

T-15 同一活跃执行版本内的实际仲裁：付费 Planner 与普通候选 Review → 逐 Owner 的付费会诊 → 独立付费 Arbiter → 最新有效审查 → 后继局部重建。此合同不承担 T-17 硬截止、T-18 版本激活或 T-19 默认启用/legacy迁移。

## 生产与采纳

恢复候选的 arbitratePendingPlanRevision 接入内部 arbitrateRecoveryCandidate。Arbiter 独立使用 revision_review 类型与 candidate-arbitration 逻辑身份，和前驱 Planner/Review/Owner advice 共用同一失败根预算。冻结完整候选、前驱 Planner 与普通 Review、选定会诊的 operation/session/attempt/原始回执、Runtime facts、worktree基线与prompt后才能启动。

candidateArbitrations 保存 reserved/failed/applied/cancelled。known failed 才能递增 ordinal，已完成会诊不因 Arbiter 失败而重跑。reserved/creating/未知结果复用固定 request/prompt 对账，不重复领取或发送。缺余额拒绝外部启动，主控制持久技术暂停，不伪装用户授权。

validatedPlanReview 和 assertArbitrationReview 校验候选与冻结义务；收敛结算仍按 Runtime 证据，不允许模型自称通过就清除未解决义务。最新状态事务核对源记录后，原子结算预算、session、仲裁operation以及candidate.review/convergence。历史 candidateReviews 和会诊记录不被覆盖。

## 最新审查来源

已采纳仲裁匹配其 appliedCandidate，重放必须认证 Planner、普通Review、Owner advice和Arbiter的实际JSONL回执及固定持久记录，最后再检查最新来源一致。不能为了重放已采纳仲裁而重新调用针对旧完整候选的会诊生产者。

reviewRecoveryCandidate 对匹配的已采纳仲裁返回最新有效结果及 arbitration provenance；普通结果仍有独立来源。rebuildRecoveryCandidate 的 predecessor.kind 区分 ordinary/arbitration，分别携带 reviewOperation/arbitrationOperation；replanRecoveryHandoffs 验证对应历史来源及同根身份。合法仲裁改写当前review不应被误判成普通Review历史篡改。

## 边界与验证

有限 Owner selection 沿用 R77，完整相关集合与实际选中集合保存在来源记录中，不宣称未选中的 Owner 已参与。候选活跃版本始终未切换，审批激活仍受 T-18 门禁约束。

实际控制socket执行仲裁、再次drive进入下一合法状态、新Harness零模型重放、Arbiter语义失败仅重试自身、预算耗尽、创建后丢响应、候选变化、历史raw损坏与仲裁后局部重建，必须通过真实Harness/持久记录验证。MockAdapter仅替代模型传输；不能将此局部协议的测试通过计作CA-01交付完成。

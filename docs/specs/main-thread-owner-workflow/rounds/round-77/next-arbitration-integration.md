# R77 后继：仲裁 Review 必须同时接通结果来源消费

本轮正式测试期间只读核对 runtime.mjs 的 arbitratePendingPlanRevision、drivePendingPlanRevision、rebuildRecoveryCandidate、replanRecoveryHandoffs。以下是下一实现的依赖，不是当前已可达故障：R75 恢复仲裁门禁仍在。

1. R77 的 consultRecoveryCandidateOwners 返回有效 advice[]，持久 candidateOwnerConsultations 记录原始回执、全候选、前驱、Owner/Registry 和 selection。仲裁入口应先消费该协议，然后冻结本次所用 advice operation/request/receipt/result；不能把数组本身当成来源证明，也不能将有限 selection 描述为全部相关 Owner。
2. 仲裁使用独立 revision_review operation，固定 active A、候选 C、前驱普通 Review、全部已采纳会诊、Runtime facts 和 prompt；每次物理启动继续使用同 root 预算/session。语义验证使用 validatedPlanReview 与 assertArbitrationReview，成功/失败的结算与候选更新原子完成。
3. 普通 arbitratePendingPlanRevision 会覆盖 candidate.review 与 planConvergence。现 reviewRecoveryCandidate 的 applied 重放要求这两者等于普通 candidateReviews.result；因此不能只接计费仲裁并直接覆盖字段，再让后续恢复路径继续调用普通 Review 的 replayOnly。那会把合法仲裁结果误判为普通 Review 回执变化。
4. rebuildRecoveryCandidate 当前先调用普通 reviewRecoveryCandidate(replayOnly)，再只从 candidateReviews 取前驱；replanRecoveryHandoffs.verifyPredecessor 也只读取 candidateReviews。下一轮必须让这些消费者明确认证最新有效审查的种类（普通 Review 或仲裁），并保留历史前驱。不能删除旧记录、重写其结果，或把仲裁冒充第一次普通 Review。
5. 仲裁本身的 applied 重放也应先识别已结算仲裁，再按其冻结历史来源认证；不能先强制重新执行 R77 会诊，因为 candidate.review/完整候选已经合法变化。重放须检查实际仲裁原始接受回执、历史会诊及当前候选/收敛与已应用结果一致，零新模型。
6. candidateRecoverySource 需要加入仲裁 operation/request/session/attempt。实际 driver 的 arbitrate 分支调用成功后，下一次 drive 必须进入新的合法策略或等待状态；以真实 socket/driver、fresh Harness 重放和后继局部重建验证，不能仅断言 direct method 返回。

R77 是真实会诊生产与采纳的子范围；上述 paid arbitration Review、后继重建的来源切换及最终 T18 激活均未完成。

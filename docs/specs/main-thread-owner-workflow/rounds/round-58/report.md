# R58：真实Planner/Review会话的预留身份与提交对账

新增内部reconcileReplanSession适配器，消费R57操作预留。真实provider使用固定session/prompt，创建前持久creating，真实创建与提交回调记录生命周期；已有状态只读取原始证据，不再次启动。没有本适配器绑定的既存会话也拒绝覆盖。Owner恢复仍使用原专属路径。

原始JSONL核对复用既有完整性及稳定revision读取；新reader支持同一turn多个step，并关联真实tool/call、tool/result及accepted合同。实际submit先赢得submissionReady后dispose可形成aborted终态；本轮真实Planner和Review均证明成功提交回执不要求completed。系统提示插件实际注入的上下文先持久固定，再与原始日志精确匹配。

submission_observed仅表示提交证据，T13保持running；无成功提交的明确终态按failed/cancelled结算。未知创建、内容变化、来源失效、执行引用冲突及不完整日志均暂停，不补发、不退款。不改当前plan/tasks，不声称候选语义已接受或DAG已应用。

开发最终9/9；正式154/154：replan-session9、recovery-session27、recovery-admission57、runtime-recovery-budget48、plugin13。零失败、跳过、超时或源码漂移，原始证据见candidate.json、round.diff、test-results.json及formal-*.log。首次开发失败与调试日志保留；创建响应丢失是故障注入，新Harness上下文重开不是控制器SIGKILL恢复证明。

独立只读审查无新增P1/P2，主线程复核同意，本轮结束。详见review.md；不代表T15或整体规格验收通过。

T15仍开发中。实际cycle/handoff来源、每次咨询计费、候选语义及结果应用尚待接线。只读接缝核对发现旧入口持有不可重入workflow锁，不能在其中等待新driver的同锁回调；后续必须采用短事务固定输入、锁外执行、最新状态核验应用。详见entry-integration-audit.md。

无提交/推送/同步操作。git-evidence.json记录本地主main与缓存tracking一致；Harness落后3364、vendor落后4，Synapse detached，未查询实时远端；保留原有未提交文件，无备份迁移。

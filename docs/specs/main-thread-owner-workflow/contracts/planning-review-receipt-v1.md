# 独立规划候选审查来源 v1

T27 的前置阶段：`workflow_planning_review(candidate_id)` 对 T26 持久候选发起生产只读 Reviewer，不接收主线程自报 review 或 approved。检查实际根主线程、原 checkpoint/授权、live Registry、无 active Workflow 或 pending checkpoint，复用 planning-checkpoint lease。当前实现限初始候选；活跃版本的父版本事务尚待 T27 后续实现。

Reviewer 消费完整固定候选和原 implementationScope。正式 provider 将候选 ID 和实际父会话写入 role binding；仅结构化 `workflow_plan_review_submit` 接收原始 tool callId、sessionId、parentId 和未规范化 rawReview。生产 runChild 核验子会话来源，再由 Runtime 验证结构化审查。缺少来源最多两次后拒绝。普通文本、主线程自报 passed 不能形成回执。

DSH_PLANNING_REVIEW_RECEIPT_V1 包含 candidateId、planDigest、registryDigest、authorizationId、orchestratorId、原始来源及规范化 review；按内容摘要写入 `.dsh-workflow/planning-reviews/`，读取重验摘要。候选和现场在审查后重查，当前规划文件即使前后 Git dirty 状态相同，内容变化也拒绝。回执不创建 Workflow/OwnerRun，activationAuthorized=false。

此回执是激活事务的输入，不是激活权限。首次激活按 [planning-activation-v1](planning-activation-v1.md) 在同一事务中重验候选、原授权、live Registry、审查问题与原始来源；审查 passed 本身不证明需求扩大已授权，也不关闭旧义务。活跃父版本修订、旧 attempt 迁移及恢复预算接缝仍待 T27/T18 后续完成。

版本迁移比较本任务所引用的验证命令/cwd、Ticket/片段/合同版本，变化进入 pending_check，无关节点不受影响。write 扩大仍为 pending_check，旧 attempt 不得获得新增权限；权限保留与新包派发仍须由实际激活/提交路径验证。

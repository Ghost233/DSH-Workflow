# R86 反思审查

主线程按 T27、R4 §5.7/5.9 和 [planning-activation-v1](../../contracts/planning-activation-v1.md) 复核固定候选。

开发阶段关闭两项问题。其一，激活工具最初返回的 workflow summary 不含测试假定的 `id` 字段；测试改为读取权威 activation.workflowId，没有修改产品合同。其二，新事务遇到同名 branch/worktree 时曾会把未知资源当成崩溃残留接管；现在只有已经存在匹配 journal 才允许恢复，无 journal 的资源明确拒绝且不发布状态。

状态发布顺序满足本轮边界：候选、审查、授权、Registry 和现场先核验；journal prepared 后才创建 worktree；完整 approved Workflow 状态最后原子替换发布。状态发布后、journal 标 active 前即使中断，完整 Workflow 已是唯一执行权威；同候选重放只修复 journal，不新增版本。状态发布前中断则 pending journal 阻止普通 preflight 创建另一条图，并复用既有 branch/worktree。

执行连接使用现有生产 control bridge：`supervisor-start` 将 approved 状态转 running，随后 `supervisor-next` 只返回依赖就绪的 `task-s`。planningSnapshot/planningPackages 持久进入状态，因此实际 Owner prompt 使用 T26 固定包；没有另造演示调度器。

本轮未发现新的确认 P1/P2。已知剩余属于 T27 原范围：活跃 Workflow 的新文档 checkpoint/候选、预期父版本竞争、旧 attempt 权限及迟到回执迁移；T18 恢复预算和 T17 停止结算仍独立。首次激活通过不能替代这些完成条件。

正式采集有一项装配错误：脚本写了不存在的 `external-runner.test.mjs`，该行以 exit 1、零用例保留。生产候选未改动，随后在同一候选上运行真实 `runner.test.mjs`，10/10 通过并记录测试文件摘要。该修正只补缺失入口，不重跑或掩盖其他结果。

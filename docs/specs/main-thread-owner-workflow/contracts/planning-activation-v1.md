# 固定候选首次激活合同 v1

`workflow_planning_activate(candidate_id, review_id)` 只允许实际存活的 Owner 模式根主线程调用。输入必须是同一项目内可重读的 T26 固定候选与 R85 独立审查回执；Runtime 联合核验候选、完整执行包、checkpoint 快照、原 implementationScope 授权、当前 HEAD/branch、live Registry、Reviewer 原始子会话来源和 passed 结果。主线程不能提供 raw plan、review、approved 或替代授权字段。

初始候选若含未批准 Registry 提案、blocked 执行包、未关闭审查问题、错配摘要或规划之外的工作区修改，激活前拒绝。当前规划 Markdown 可以在 checkpoint 后继续讨论和编辑，但不能替代冻结内容；业务源码或其他现场变化不能被吸收进执行版本。

激活事务使用与 checkpoint/compile/review 相同的项目级 planning lease。workflow ID、branch 和 worktree 由 candidate ID 确定；`.dsh-workflow/planning-activations/<candidateId>.json` 记录 `prepared → worktree_ready → active`。工作树先固定到 checkpoint commit，完整 Workflow 状态最后以原子替换发布。状态发布前没有 active Workflow；未完成 journal 会使普通 preflight 拒绝创建另一条图。恢复复用同一 branch/worktree 和输入；已发布状态的同候选重放不新增 PlanRevision。

发布的 Workflow 直接处于 approved，包含候选 plan、完整 planningSnapshot/planningPackages、review receipt/authorization ID、PlanRevision 1 与 pending task 状态，并设置 Runner 队列时间。外置 Runner 的正式 control bridge 可以执行 `supervisor-start`，Supervisor 只从该完整图选择 ready task。持久候选和审查回执自身继续保持 `activationAuthorized:false`；执行权来自已发布 Workflow 与原授权联合绑定。

同一固定父快照的候选竞争共享项目 planning lease，最多一个完整 Workflow 占据项目槽位。另一个候选在状态发布前不得生成第二个可见 Workflow。事务保留中断资源以供恢复，不自动删除未知 branch/worktree 或用户现场。

本合同仅覆盖首次版本激活。活跃 Workflow 上的 Spec/Ticket 修订、预期父版本竞争、旧 attempt 权限和迟到回执迁移仍属于 T27 后续；恢复预算继承属于 T18，停止结算属于 T17。legacy `workflow_start` / plan approval 协议保持原行为。

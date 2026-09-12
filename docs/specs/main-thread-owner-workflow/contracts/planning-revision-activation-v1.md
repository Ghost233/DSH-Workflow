# 活跃规划版本激活合同 v1

执行中的 Spec/Ticket 技术修订使用 `workflow_planning_revision_checkpoint` 固定来源。入口只接受 Workflow 根主线程、`workflow_id`、`expected_plan_revision`、T05 manifest、原生写入来源链和根分支 Git baseline。快照除普通 checkpoint 字段外，必须保存 `executionParent={workflowId,planRevision,planDigest,workflowBranch}`；父版本任一字段变化即拒绝，不能把旧文档候选套到新 DAG。

checkpoint 仍只提交被选中的规划 Markdown，并沿用原授权的文档范围和 implementationScope。活跃 Workflow 的 Owner 可以继续执行；checkpoint、compile 和独立 review 每个边界都重读父执行版本。任务状态和 workflow HEAD 可随旧 attempt 前进，父 PlanRevision/digest/branch 不能变化。已有 `pendingPlanRevision` 时不再创建另一份执行候选。

`workflow_planning_compile` 与 `workflow_planning_review` 消费快照中的父版本绑定。候选继续保存完整 Ticket/AC/合同及单 Owner 包，Reviewer 回执继续记录真实子会话和原始工具提交来源；passed 本身不授予执行权限。

`workflow_planning_activate` 识别带 `executionParent` 的候选后，在 Workflow 锁内联合核验父版本、checkpoint、候选、包、live Registry、独立 Review、根分支 HEAD、规划现场和原实施授权。验证成功先持久保存带 `fixedPlanning` 来源的 `pendingPlanRevision`，再由既有 PlanRevision 切换事务发布完整版本。中断时旧版本仍是 active，Runner 只能恢复同一持久候选；不会消费半更新 DAG。

切换复用 `carry_valid / pending_check / abort`：完全无关且引用未变的结果可继续有效；合同、快照、依赖、验证或兼容语义变化进入 `pending_check`；Owner 变化、任务删除、Registry 变化及 write 收窄进入 `abort`。运行中的兼容 attempt 沿用旧权限自然结束，不能获得新包扩大的 write 权限。已完成 task 的定义保持不变，新增修复或验证使用新节点。

每次成功切换写入 `planningRevisionSources`，保留 revision、parent、plan digest、candidate、review、snapshot 和 authorization ID。同父候选由 Workflow 锁竞争，首个持久候选占用切换事务；后续候选收到父版本过期或已有候选错误。同候选在“已暂存未发布”和“已发布”两种崩溃窗口均可重放，不重复增加 PlanRevision 或再次迁移 task。

权限边界失效的 T17 受控 attempt 在新版本原子发布时先保留原 `ownerRun`，写入 `stopping`、固定 `revisionStop` 和唯一 cancel request，再向匹配 attempt/session/token/generation 的真实 child 请求取消。取消返回不归档旧 attempt、不释放同 Owner；无当前取消目标进入有限 `termination_unconfirmed/inspect_runtime`。只有持久 session terminal 出现后，Runtime 才把带 settled receipt 的完整旧记录移入 `ownerRunHistory`、释放旧 reservation，并把新版本中仍存在的 task 置为 pending；被新DAG删除的task只归档旧记录，不得复建。旧 Owner 即使存活在另一OS进程，其结果从激活落盘起也无法通过 completion admission。

legacy `workflow_revision_approve` 的人工批准行为不变。没有 T17 attempt control 的既有运行继续采用原兼容归档路径，等待 T19 决定默认激活及迁移策略；不得静默伪造其启动前 deadline。固定 Spec/Ticket 技术修订以最初实施授权为依据自动切换；业务承诺扩大或原授权缺失仍须回主线程讨论。恢复候选继续受 T18 门禁保护，跨版本根问题与预算继承由 T18 完成。

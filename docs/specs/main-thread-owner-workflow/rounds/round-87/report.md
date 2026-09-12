# R87 报告：活跃 Workflow 固定规划版本

T27 的活跃父版本修订路径已接通。新增 `workflow_planning_revision_checkpoint`，不可变快照绑定当前 `workflowId/PlanRevision/planDigest/workflowBranch`；compile、独立 review 和 activation 每个边界都会重读父版本及原授权。首次激活路径与 legacy 审批协议保持原行为。

固定候选激活时，Runtime 在 Workflow 锁内保存可恢复的 `pendingPlanRevision.fixedPlanning`，随后复用既有任务迁移器发布完整版本。真实 Runtime 集成夹具覆盖 Spec/Ticket R1→R2、父 snapshot 链、独立 Planner/Reviewer 来源、一个 completed task、一个 running 兼容 task、一个 Owner 变化的 running task、暂存后模拟崩溃、同父竞争、原授权只询问一次及激活后重放。兼容 running task 保持旧 attempt 和旧权限，因固定引用变化进入 `pending_check`；Owner 失效 attempt 被移出当前记录、写入历史并标为 `invalid/stopped`；竞争候选按过期父版本拒绝。

当前仍需完成 T27 与 T17/T18 相接的权限失效和跨进程迟到回执场景。恢复候选激活门禁没有放宽，T27 保持“开发中”，F2/B01/CA01 不标完成。

广度回归在候选主体上共 260 项通过、7 个明确 legacy skip、零失败/取消，覆盖 planning checkpoint、compile/activation、packages/authority/source chain、PlanRevision、plugin/workflow state、Runner 和完整 control 166 项。最后增加 legacy 自动迁移拒绝门禁后，固定候选定向集成 1/1、plugin 13/13 通过；未用定向结果覆盖前述广度证据。`git diff --check` 通过，HEAD 保持 `154914064f5ceb2f8eb413865e10a54e8ffbc663`，没有提交或推送用户现场。

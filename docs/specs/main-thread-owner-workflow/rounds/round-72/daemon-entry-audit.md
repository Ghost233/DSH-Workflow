# 后继 daemon 接线审计（只读，尚未实施）

当前控制表 workflow-state.mjs 的 active candidate pause 分支，在通知 delivered 后直接返回 command:null；external-runner.mjs discoverRunnableWorkflows 仅发现 command 非空的持久工作流。这是独立任务虽已可选择、可预留、可实际执行，但 daemon 尚不自动启动的直接原因。

外部 daemon 对除 execute 外的命令统一发送 workflow-drive，并按 root/workflowId 去重活跃请求；Runtime driveWorkflow 再基于当前持久状态核对 expectedCommand。已有 public workflow-drive 路由可复用，不需要开放被 V2 禁止的 legacy Owner 动作。

后继最小实现：在已投递有效 pause、无用户决定时，用专用 selector 产生独立创建命令；Runtime 重新读取并持久领取，逐个经专用 runCandidateIndependentReservation 执行。已 reserved 且无 Owner 历史需要显式可恢复派发；launching/未知历史不可作为首次执行重新发送。同源无独立任务维持 command:null，技术失败不重试旧 history；真实权限场景优先等待用户。不得将 selector 的任务子集作为完整 Workflow 写回。

需要先验证的限制：当前独立执行未传递 daemon 控制请求的终止 signal，已有控制 socket 超时不等于实际 Owner 终止（T17范围）；必须保留持久 launching 防止超时或新进程重复执行。若允许同批并行结束，共享 pendingTaskMerge/Memory 事务会碰撞，当前首次能力宜串行 finish；空闲槽位领取与启动之间的竞态需要原子 reservation 复核。配置/合同不满足应返回稳定等待原因，不能把同源 selector 错误变成反复 workflow-drive 重试。

建议证据：真实 socket discovery→workflow-drive→Owner verify/commit/merge→再次 discovery 无同源重试；新 Harness reserved 恢复与 launching 不重发；权限优先投影；候选变化拒绝旧 expectedCommand/绑定。此次仅记录接缝，不视作已交付。

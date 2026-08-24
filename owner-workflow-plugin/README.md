# DeepSeek Harness Owner 工作流插件

这是面向 DeepSeek Harness 的 Owner 工作流插件。当前实现只执行 `DSH_PLAN_V2` 任务 DAG，不提供 Quick 模式；旧 V1 计划仅可查询和导出。

用户始终只与主代理沟通。需要实际执行但不修改仓库的任务由后台 Operation Operator 使用受控通用能力完成；临时 ADB、Docker 或诊断命令不固化进插件，需要外部副作用时回到主对话请求精确授权。需要修改仓库时才进入 Owner 开发流程。

Owner 子代理固定使用 `workspace-write`，自身授权策略为 `never`。如果精确命令必须访问 worktree 外的共享 SDK、编译器或缓存，Owner 使用 `owner_host_exec` 把完整命令、目录和理由交给主代理的 Harness 原生授权卡片；只有“允许一次”才执行该命令。Owner 直接设置 `sandbox_permissions` 会被拒绝。

所有短期开发子线程通过 descriptor-backed one-shot Subagent provider 创建并在结果结束后 dispose；正式验证的沙箱拒绝由 `owner_submit` 自动路由主代理授权。验证快照原样保留相对符号链接，避免内容摘要因链接目标被绝对化而误判漂移。

Owner Registry 必须经过提案、digest 展示和用户审批；Owner 分析子代理只提供建议，设定、提案和批准全部发生在创建该 Workflow 的主线程。批准结果会独立固定到项目启动分支并同步当前 workflow，不依赖功能 Workflow 最终交付。Owner 只根据代码本身的长期责任域划分，例如目录、模块、包、接口、依赖方向和稳定职责；不能根据当前 Workflow 的阶段、任务、review/verify、修复步骤或并行需求划分。后续 Workflow 复用固定 Owner 定义，只重新创建本次执行子线程、Owner 分支和 worktree；每个任务通过必需的固定验证后，以固定 commit SHA 完成并合入 workflow。

内部 `workflowId` 继续用于状态、锁、socket 和 worktree 隔离，但不会出现在新建 Git 分支名称中。Workflow 分支采用 `dsh/workflow/<日期>-<项目递增序号>-<需求摘要>`，Owner 分支在 `dsh/owner/` 下复用同一可读前缀。

计划必须先经过独立 Reviewer 审查。Runtime 默认允许最多三轮有界修订，每轮都绑定当前 `planDigest` 并废止旧审查与批准；达到上限后主编排者必须调用 `workflow_plan_revision_extend`。该工具通过原生“同意/不同意/自定义输入”问询决定是否只为当前 Workflow 增加三次额度；同意后继续原 Workflow，不取消、不重建，也不调用 `workflow_recover`。

非法修订候选不会覆盖当前计划或触发取消：Runtime 返回结构化、可重试的失败结果；修订成功后的重复调用是无副作用幂等操作，并明确要求重新审查。

规划器连续两次提交非法计划时，Runtime 会保留已创建的 Workflow，并返回包含真实 ID 和 `recoverable` 的结构化失败结果；主编排者只恢复同一个 Workflow，不重复创建分支。

确定性 Runner daemon 随 Harness 启动和停止，通过持久 receipt 调度所有已登记工作区中获批的 Workflow：`create` 只产生 reservation，必须由 runner 显式 `execute` 才会启动 Harness 内的 Owner 子代理；`wait` 通过事件游标长等待；Runner 自身不调用模型。Web Harness 启动时，插件会在同一服务上注册只读 `/owner-workflow` Dashboard，并在会话头部与侧边栏提供主动等待列表；列表同时显示 Operation 等待以及 Owner Workflow 的未执行、执行中、依赖等待、决策等待和 Runner 心跳状态，不依赖模型或第三方 Session Event。独立的 `127.0.0.1:57357` Dashboard 仍保留为兼容入口。两个页面都不写状态、不调度 Agent、不执行命令。`failed`/`blocked` 保留现场供恢复；用户通过原生问询明确取消后，插件删除未合入的临时分支和 worktree，只保留 Runtime 状态与日志。`deepseek-harness/` 子模块保持零修改，用户可见文档与提示词使用中文。

完整说明：

- [中文使用说明](README.zh.md)
- [Owner 工作流技术路线](../docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md)
- [V2 迁移说明](../docs/OWNER-WORKFLOW-V2-MIGRATION.md)

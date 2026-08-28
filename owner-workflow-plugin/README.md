# DeepSeek Harness Owner 工作流插件

这是面向 DeepSeek Harness 的 Owner 工作流插件。当前实现只执行 `DSH_PLAN_V2` 任务 DAG，不提供 Quick 模式；旧 V1 计划仅可查询和导出。

用户始终只与主代理沟通。需要实际执行但不修改仓库的任务由后台 Operation Operator 使用受控通用能力完成；同一项目同时只允许一个未结束 Operation。公开资料使用继承的 `web_search`/`web_fetch`，`curl`/`wget` 仍按外部命令要求人工授权。临时 ADB、Docker 或诊断命令不固化进插件；`operation_exec` 的专用审批插件先匹配本次主会话前缀，再复用固定版本 `dsh-approve-for-me` 的风险、白名单和可选无工具模型复核。自动通过只允许当前精确命令一次，其他情况把同一 Operator 会话置为可续接等待并回到主线程原生问询；改变方向时可原子拒绝当前待授权命令再续接，不会把正常等待显示成子代理异常中断。主代理的标准 Bash/PowerShell 仍由独立安装的 `dsh-approve-for-me` 处理。命令失败、人工授权次数和总时长都有有界预算，达到上限后基于已有证据收尾。终态释放驻留资源并归档持久会话，会话与事件继续保留供审计。需要修改仓库时才进入 Owner 开发流程。

Owner 子代理使用 `workspace-write + ask`，但只有 Runtime 登记的 `owner_host_exec` 与固定验证请求可以通过严格门禁到达 Harness 原生授权 UI；卡片显示在当前 Owner 任务现场，其他直接升级会被拒绝。运行状态的“需要处理”负责跨会话发现并跳转，不在主会话代答。

所有短期开发子线程通过 descriptor-backed one-shot Subagent provider 创建并在结果结束后 dispose；正式验证的沙箱拒绝由 `owner_submit` 在 Owner 现场发起精确授权。验证快照原样保留相对符号链接，避免内容摘要因链接目标被绝对化而误判漂移。

同一个 Git 项目同一时间只允许一个未结束 Workflow，并绑定一棵单根 DSH 会话树。普通 Synapse fork 只用于讨论；明确 Intent 保存后会原生询问“现在重新规划 / 继续讨论”，只有前者才按需生成不可变 PlanRevision。运行中受影响结果先标记“待检查”，按最新 DAG 验证有效后才编译长期 Owner Memory。

Owner Registry 必须经过提案、digest 展示和用户审批；Owner 分析子代理只提供建议，设定、提案和批准全部发生在创建该 Workflow 的主线程。批准结果会独立固定到项目启动分支并同步当前 workflow，不依赖功能 Workflow 最终交付。Owner 只根据代码本身的长期责任域划分，例如目录、模块、包、接口、依赖方向和稳定职责；不能根据当前 Workflow 的阶段、任务、review/verify、修复步骤或并行需求划分。后续 Workflow 复用固定 Owner 定义，只重新创建本次执行子线程、Owner 分支和 worktree；每个任务通过必需的固定验证后，以固定 commit SHA 完成并合入 workflow。

内部 `workflowId` 继续用于状态、锁、socket 和 worktree 隔离，但不会出现在新建 Git 分支名称中。Workflow 分支采用 `dsh/workflow/<日期>-<项目递增序号>-<需求摘要>`，Owner 分支在 `dsh/owner/` 下复用同一可读前缀。

计划必须先经过独立 Reviewer 审查。Runtime 默认允许最多三轮有界修订，每轮都绑定当前 `planDigest` 并废止旧审查与批准；达到上限后主编排者必须调用 `workflow_plan_revision_extend`。该工具通过原生“同意/不同意/自定义输入”问询决定是否只为当前 Workflow 增加三次额度；同意后继续原 Workflow，不取消、不重建，也不调用 `workflow_recover`。

非法修订候选不会覆盖当前计划或触发取消：Runtime 返回结构化、可重试的失败结果；修订成功后的重复调用是无副作用幂等操作，并明确要求重新审查。

规划器连续两次提交非法计划时，Runtime 会保留已创建的 Workflow，并返回包含真实 ID 和 `recoverable` 的结构化失败结果；主编排者只恢复同一个 Workflow，不重复创建分支。

确定性 Runner daemon 随 Harness 启动和停止，通过持久 receipt 调度唯一获批 Workflow；Runner 自身不调用模型。Web Harness 同时加载固定的只读 `dsh-synapse/` 子模块和 `/owner-workflow` Dashboard。Operation 审批策略核心固定在 `vendor/dsh-approve-for-me/` 子模块。会话头部、每个工作区与侧边栏提供统一运行状态，按“需要处理 / 总览 / 主线程 / 子代理”分类；全屏浮层只提示需要处理的事项。状态通过可自动重连的 Harness SSE 接收，不运行轮询，断线时明确显示连接状态。`deepseek-harness/` 只新增通用的工作区行 action slot，另外两个上游子模块保持零修改。

完整说明：

- [中文使用说明](README.zh.md)
- [Owner 工作流技术路线](../docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md)
- [Synapse、Intent 与动态 DAG 设计](../docs/SYNAPSE-DYNAMIC-DAG.md)
- [V2 迁移说明](../docs/OWNER-WORKFLOW-V2-MIGRATION.md)

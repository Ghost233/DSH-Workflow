# DSH-Workflow

这是一个运行在 DeepSeek Harness 之外的 Owner 工作流插件。`deepseek-harness/`、`dsh-synapse/` 与 `owner-workflow-plugin/vendor/dsh-approve-for-me/` 都是固定 commit 的只读上游子模块；插件自有代码、脚本、文档和测试均位于主工程，不修改上游源码。

## 启动

推荐按 Harness 来源选择两个启动脚本：

```sh
# 使用 npm 上指定的 DeepSeek Harness 版本（可替换为 latest 或其他版本）
./start-owner-workflow-npm.sh --version 0.1.0-rc.8

# 使用 deepseek-harness 子模块当前检出的、已构建版本
./start-owner-workflow-submodule.sh
```

npm 模式也可使用环境变量固定版本：

```sh
DSH_NPM_VERSION=0.1.0-rc.8 ./start-owner-workflow-npm.sh
```

子模块模式直接使用 `deepseek-harness/`。首次启动或子模块 commit 变更后，它会在子模块自身的忽略路径中安装依赖并构建匹配的 CLI 与 Web 产物，不会修改受版本控制的子模块文件。原有启动脚本仍保留为高级入口，可使用 `DSH_LAUNCHER=npx|source|source-runtime` 选择来源。

npm 和独立子模块源码启动模式都会默认传递 `--no-open`，不会自动打开浏览器；需要恢复自动打开时设置 `DSH_WEB_OPEN=1`。

子模块入口也可以直接调用同一 commit 构建出的 DSH 插件管理 CLI；该模式不会启动 Web、Runner 或注入临时 patch：

```sh
./start-owner-workflow-submodule.sh plugin --profile web add dsh-approve-for-me@latest
```

兼容原有调用：

```sh
./start-owner-workflow.sh
```

在 Harness 中选择 `owner-workflow` Agent preset 后，直接用自然语言描述需求即可，用户始终只和主代理沟通。只读代码审计进入 `workflow_audit`；需要实际执行但不修改仓库的任务进入后台 Operation；需要修改仓库时才执行 `workflow_preflight` → `workflow_start`，创建独立 workflow 分支和 worktree。`workflow_start` 会启动一个可续接的 Plan Agent，由 Runtime 在内部完成规划、独立审查和最多一次自动修订；主会话只在 Owner Registry 或最终计划需要用户批准时介入。既有改动和子模块内部改动不会被自动提交、暂存、丢弃或隐藏。开发工作流使用带优先级与失败策略的 `DSH_PLAN_V2` 任务级 DAG、Owner Registry 审批、固定验证和事件驱动 `workflowd` 调度；没有 Quick 模式。

Operation Operator 默认继承主代理模型。如需使用低成本模型，可在启动前设置：

```sh
DSH_OWNER_WORKFLOW_OPERATION_MODEL=<模型编号> ./start-owner-workflow-submodule.sh
```

跨 provider 时同时设置 `DSH_OWNER_WORKFLOW_OPERATION_PROVIDER`。Operation 不要求 Git 仓库：Git 工作区使用仓库根，非 Git 目录使用当前会话工作目录；同一工作区同一时间只保留一个未结束 Operation 和一个可续接 Operator 子线程，重复启动只返回当前状态。Operation 使用通用受控能力并逐条执行一次性命令，不把 ADB、Docker 或某个项目的临时命令固化进插件。`operation_exec` 的专用审批插件依次检查：用户在本次主会话明确放行的字面前缀、Operation 必须人工处理的设备/系统/网络风险、`dsh-approve-for-me` 的固定风险与配置白名单，以及可选的无工具模型复核。自动链路只产生当前精确命令的一次性授权；任何不匹配、异常、超时或高风险都回到主线程原生多选项问询。主代理自己的标准 Bash/PowerShell 审批仍完全由已安装的 `dsh-approve-for-me` 处理，两条链路互不接管。前缀授权不写入长期状态，主会话结束或 Harness 重启后自动失效。Operation 终态释放驻留资源并归档持久会话，历史仍可审计。

Owner Registry 提案与 DAG 计划批准使用 Harness 原生问询面板。编排者直接调用 `workflow_owner_change_approve` 或 `workflow_plan_approve`，面板提供“同意”“不同意”和自定义输入；只有明确选择“同意”才会修改 Registry 或固定计划。编排者不会再输出要求用户复制回复的批准口令。

Owner 在独立 worktree 中使用 `workspace-write`，子线程自身不能请求授权。若同一精确命令必须访问 worktree 外的共享 SDK、编译器或缓存，Owner 会调用 `owner_host_exec`，由 Harness 在主对话展示原生授权卡片；只有“允许一次”才执行该命令。用户仍然只与主代理沟通。

Owner、Planner 与 Reviewer 使用正式 descriptor-backed one-shot Harness 子代理，任务结束即释放运行资源；`owner_submit` 的固定验证会自动把共享 SDK/缓存访问请求路由到主代理授权，不依赖子代理猜测。验证契约同时固定 argv 与受限仓库相对 cwd；新的 Flutter 验证必须显式声明包根 cwd。授权后实际执行失败时，Runtime 会保留有界 stdout/stderr 并返回同一 Owner 修复，不会再误报为授权阻塞。验证快照保留相对符号链接，避免虚假的 worktree 内容漂移。

Owner 因等待主代理授权而进入 `blocked` 后，主线程先查询 `workflow_supervisor_status`，再使用返回的完整 workflow、task 和 Owner 编号调用 `workflow_owner_recover`。恢复会继续使用原分支、原 worktree 和未提交修改，不会重建 Workflow；任务超时从本次恢复时间重新计算，不会沿用旧 reservation 的启动时间。

Planner 在计划中只选择 Owner ID。Runtime 会从正式 Registry 注入 Owner 名称、职责、scope、exclude 和父子关系，并使用注入后的范围校验每个任务的 `write`；模型改写描述或伪造更宽 scope 都不会改变权限边界。

独立计划 Reviewer 通过专用 `workflow_plan_review_submit` 提交结构化结果，状态只能是 `passed` 或 `needs_revision`。首次契约错误会携带确定性校验信息自动重试一次，不再解析普通文本 JSON，也不会因模型使用 `failed` 等未知状态而丢失整个工作流。

后台 Operation 存在时，当前会话标题旁会出现“等待 N”；侧边栏底部的“主动等待 N”可以查看所有会话、所有已登记工作区的等待事项。列表明确显示目标、等待对象、状态、已等待时间和最近信息。它直接读取 `.dsh-workflow/operations/` 的确定性状态，不要求模型维护列表，也不会向 Harness 会话日志写入第三方事件。

当前先保留外置 workflowd 的手动启动方式：

```sh
run-owner-workflow --workflow-id <workflow-id>
```

Dashboard 会随 Web Harness 一起注入，但本轮不自动启动 workflowd。Harness 启动后，在同一地址打开：

```text
http://127.0.0.1:3080/owner-workflow
```

页面先选择 Runtime 已登记的业务工作区，再切换查看开发 workflow 和后台 Operation；只读展示任务级 DAG、Owner、Operation 状态与有限事件摘要，不提供调度、写入、命令或 Git 操作。会话头部和侧边栏等待列表通过同源只读接口 `/owner-workflow/api/waits` 共享同一份状态。浏览器只传 opaque workspace ID，不能传入本地路径。端口不是 `3080` 时，请替换为 Harness 实际监听端口。原 `run-owner-workflow --dashboard --workflow-id <workflow-id>` 保留为兼容的独立只读服务。

完整使用说明见 [插件说明](owner-workflow-plugin/README.zh.md)、[技术路线](docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md) 与 [V2 迁移说明](docs/OWNER-WORKFLOW-V2-MIGRATION.md)。

## 安装与同步

本地开发默认由启动脚本以 patch 注入当前插件。也可按官方插件方式安装 profile 或 GitHub 地址，具体命令见插件说明。

更新上游 Harness 子模块：

```sh
git submodule update --remote --merge deepseek-harness
```

审批策略核心固定在 `owner-workflow-plugin/vendor/dsh-approve-for-me/`。升级它时必须显式更新父仓库 gitlink，并重新运行全量测试；启动脚本会拒绝未初始化、commit 不一致或内部存在改动的策略源码。

更新命令不会修改插件逻辑；同步后重新运行插件测试并重启终端即可。

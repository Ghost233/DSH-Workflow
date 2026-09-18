# DSH-Workflow

Owner 工作流运行在官方 DeepSeek Harness 上。项目维护 `owner-workflow-plugin/`、`sol-efficiency-plugin/` 和 `approve-for-me-workflow-plugin/`，以及项目侧启动与验收代码。DSH 和第三方子模块保持上游源码原样。

## 启动

```sh
./start-owner-workflow.sh
```

这是唯一日常启动入口，不需要参数或插件范围环境变量。脚本调用统一 Web 宿主，校验 `dsh-runtime.json` 固定的官方 DSH 构建，并在同一宿主加载 Owner、SoL 和自研审批适配器。启动成功后终端报告实际地址、实例 ID 和项目内日志路径；不会自动打开浏览器标签。

启动使用现有 DSH Web profile。端口检查通过后，脚本会通过 DSH 原生插件管理命令，按顺序将当前 DSH 版本的 Agent Teams Host 和 Web 实验层加入 `$DSH_HOME/profiles/web`；已启用的版本不会重复安装。首次启用需要 pnpm 和 npm registry，除这两个插件外不改动其他 profile 设置、凭据或用户 preset。项目侧临时装配文件与日志位于 `.dsh-workflow/`。端口被占用或构建身份不符时明确失败。退出启动进程会回收该次启动的宿主，不保留脱离宿主运行的旧 daemon。

第三方清单保留在 `project-plugins.json` 与 `project-plugins.lock.json`，日常入口默认尝试加载清单中的全部插件；若宿主依赖或版本不兼容，会在启动前明确失败，不默默禁用。清单中的第三方包不属于本项目维护范围；用户已有 profile 插件仍由 DSH 按原配置处理。

## 使用流程

在现有浏览器页面选择业务项目，与主线程讨论需求。主线程形成需求总结、Spec 和 Ticket，取得所需的执行授权后冻结规划材料；Planner 基于这些材料生成 DAG，独立 Reviewer 审查后交给统一 Runner。

Runner 按依赖、容量和文件所有权调度 Owner Team。Owner 使用独立工作记录和执行工作区；公共模块改动由对应 Owner 评估，下游按影响重新验证。主线程处理需求取舍和需用户决策的问题。拒绝或修改意见必须带回主线程，不能被当作授权。

持久 Store、Engine 和 Runner 是唯一执行状态来源，Dashboard 与通知读取同一状态。执行结果要经过验证和收尾才能报告完成；取消必须等待受控执行范围结算。现有会话和历史运行数据不会因代码替换自动删除。

设计与验收记录见 [领域术语](CONTEXT.md)、[统一内核替换计划](docs/specs/main-thread-owner-workflow/unified-kernel-replacement-plan.md) 和 [开发与实测记录](docs/specs/main-thread-owner-workflow/unified-kernel-development.md)。完整 Coinhub 浏览器验收仍在进行；确定性回归通过不代表产品旅程与整个编排流程已经验收通过。

## 验证

```sh
node scripts/run-kernel-regression.mjs
```

回归包含正式启动脚本的真实 CLI 宿主测试、四个自研插件就绪检查、宿主退出与配置保留，以及内核、Owner、规划、审批、交付的确定性测试。真实业务验收沿用同一个无参数启动入口，在已打开的浏览器标签操作，并检查主线程和每个 Owner teammate 的记录。

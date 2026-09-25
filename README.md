# DSH-Workflow

Owner 工作流运行在官方 DeepSeek Harness 上。项目维护 `owner-workflow-plugin/` 和 `sol-efficiency-plugin/`，以及项目侧启动与验收代码。DSH 和第三方子模块保持上游源码原样。

## 启动

```sh
./start-owner-workflow.sh
```

这是唯一日常启动入口，不需要参数或插件范围环境变量。脚本调用统一 Web 宿主，校验 `dsh-runtime.json` 固定的官方 DSH 构建，并在同一宿主加载 Owner 和 SoL。启动成功后终端报告实际地址、实例 ID 和项目内日志路径；不会自动打开浏览器标签。

启动使用现有 DSH Web profile。端口检查通过后，脚本会通过 DSH 原生插件管理命令启用当前版本的 Agent Teams 组合包，并移除已废弃的独立 Web 层；已启用的版本不会重复安装。首次启用需要 pnpm 和 npm registry，除 Agent Teams 迁移外不改动其他 profile 设置、凭据或用户 preset。项目侧临时装配文件与日志位于 `.dsh-workflow/`。端口被占用或构建身份不符时明确失败。退出启动进程会回收该次启动的宿主，不保留脱离宿主运行的旧 daemon。

第三方清单保留在 `project-plugins.json` 与 `project-plugins.lock.json`。日常入口装配自研插件，并按锁定版本逐个尝试加载清单里标记为 `startup: true` 的第三方插件，包括 MattSkillsDeck。单个第三方插件安装或装配失败时记录原因、跳过该项并继续启动其余插件和 Owner、SoL。用户已有 profile 插件仍由 DSH 按原配置处理；不改动第三方源码。

## 使用流程

在现有浏览器页面选择业务项目，与主线程讨论需求。主线程形成需求总结、Spec 和 Ticket，取得所需的执行授权后冻结规划材料；Planner 基于这些材料生成 DAG，独立 Reviewer 审查后交给统一 Runner。

Runner 按依赖、容量和文件所有权调度 Owner Team。Owner 使用独立工作记录和执行工作区；公共模块改动由对应 Owner 评估，下游按影响重新验证。主线程处理需求取舍和需用户决策的问题。拒绝或修改意见必须带回主线程，不能被当作授权。

持久 Store、Engine 和 Runner 是唯一执行状态来源，Dashboard 与通知读取同一状态。执行结果要经过验证和收尾才能报告完成；取消必须等待受控执行范围结算。现有会话和历史运行数据不会因代码替换自动删除。

设计与验收记录见 [领域术语](CONTEXT.md)、[统一内核替换计划](docs/specs/main-thread-owner-workflow/unified-kernel-replacement-plan.md) 和 [开发与实测记录](docs/specs/main-thread-owner-workflow/unified-kernel-development.md)。完整 Coinhub 浏览器验收仍在进行；确定性回归通过不代表产品旅程与整个编排流程已经验收通过。

## 验证

```sh
node scripts/run-kernel-regression.mjs
```

回归包含正式启动脚本的真实 CLI 宿主测试、Owner 与 SoL 就绪检查、宿主退出与配置保留，以及内核、Owner、规划和交付的确定性测试。真实业务验收沿用同一个无参数启动入口，在已打开的浏览器标签操作，并检查主线程和每个 Owner teammate 的记录。

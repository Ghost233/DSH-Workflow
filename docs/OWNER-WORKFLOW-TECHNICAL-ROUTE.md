# Owner Workflow 统一 Kernel 技术路线

本文描述当前生产入口实际加载的新 Kernel。旧架构的实现讨论、Spec 和 proof 继续作为审计历史保存，不再作为启动或调用说明。

## 1. 公开入口与宿主组合

项目日常入口只有：

```sh
./start-owner-workflow.sh
```

脚本拒绝任何参数，并执行 `scripts/kernel-web-launch.mjs`。启动流程由 `scripts/kernel-launch-composition.mjs` 生成临时 Cordis 组合：

1. 读取并保留现有 Web profile 与用户 patch。
2. 将 `owner-workflow-plugin/kernel-presets/` 作为系统可信 preset 根并选择 `owner-workflow`。
3. 只装配当前 Owner surface、Kernel Dashboard、SoL 和自研审批流程。
4. 对项目旧条目做组合期禁用，不写回用户 profile。
5. 通过项目 plugin manager 启动官方 Web 宿主，不自动打开浏览器。

启动器在准备组合前核验固定 DSH 构建并检查目标端口。临时 patch、状态和日志落在调用目录的 `.dsh-workflow/`。没有需要单独启动、探活或接管的执行服务。

当前公开导出为：

- `owner-workflow-plugin/index.js` → `src/kernel-entry.mjs`
- `owner-workflow-plugin/dashboard-host.mjs` → `src/kernel-dashboard-host.mjs`
- package root export → `src/kernel-entry.mjs`
- package dashboard export → `src/kernel-dashboard-host.mjs`

## 2. 内核边界

核心模块按职责分层：

| 模块 | 责任 |
|---|---|
| `src/kernel-plugin.mjs` | 在同一 Cordis host 和 catalog root 上提供共享 Kernel，注册工具、指导、文档守卫与宿主内 Runner |
| `src/kernel-runtime.mjs` | 对外协调 checkpoint、Registry、Workflow、恢复和取消请求 |
| `src/workflow-store.mjs` | 持久化控制状态、事务更新与唤醒 |
| `src/workflow-engine.mjs` | 纯状态转移、action 准入、锁、恢复预算、隔离和权威 view |
| `src/workflow-runner.mjs` | 读取到期 action 并驱动效果；在宿主内启动和关闭 |
| `src/workflow-effects.mjs` | 执行、观察和停止 action，持久化结果或明确失败 |
| `src/native-*-effects.mjs` | 连接 DSH 原生会话、命令、规划、决策、通知与 Registry |
| `src/owner-team-runtime.mjs` | 长期 Owner 会话、任务派发、提交和停止 |
| `src/workflow-git-effects.mjs` | 候选封存、验证和受保护集成 |
| `src/workflow-delivery.mjs` | 在用户分支和 HEAD 仍匹配时执行 fast-forward 交付 |
| `src/kernel-dashboard.mjs` | 从 Store 和 Engine view 生成只读 Web 投影 |

`kernel-entry.mjs` 是唯一正式插件面。Kernel 在同一宿主、同一 catalog root 内共享一份 Store 与 Runner，避免工具面、Dashboard 和执行器各自推导状态。

## 3. 来源链与实施授权

主线程负责需求讨论、Spec/Ticket 写入和用户授权。实现授权通过 `workflow_planning_finalize` 固化为 checkpoint，至少绑定：

- 用户授权来源与实施范围；
- Spec/Ticket 的文档快照；
- 代码基线和 Git 身份；
- 当前 Registry 摘要；
- Planner 使用的支持材料。

`workflow_start` 只接受已冻结的 checkpoint。Planner 输出绑定相同来源链的一份 DAG，独立 Reviewer 对 plan digest、Owner 路由、依赖、资源和验证义务做审查。任何实质文档、代码或 Registry 变化都需要新的受审查版本；旧计划不能静默跨越新基线。

文档守卫只允许主线程在授权阶段写入相应规划文档。Owner 的任务 authority 只覆盖其受审查任务、scope 与固定验证，不能反向修改用户授权。

## 4. Registry 与长期 Owner

Registry 是长期责任域真源。Planner 只选择正式 Owner ID；Kernel 从 Registry 注入 Owner 定义并检查：

- `scope`、`exclude` 与任务写入集合；
- 依赖关系和公开消费方；
- 端口、设备、数据库、缓存等共享资源；
- Owner 需要执行的固定验证。

`workflow_registry_change` 是独立治理动作。新项目可先完成 Registry，再冻结实施 checkpoint。活动 Workflow 中的 Registry 变化必须先停止受影响执行，取得源码写入关闭证据，再要求基于新摘要重新规划。新责任域不能覆盖尚未结算的工作。

跨模块公开合同变化使用 `workflow_public_owner_request`。请求、Owner 决策、当前 plan revision、消费者影响和证据摘要必须互相绑定。若结论改变用户的产品承诺，主线程通过原生问询取得决定。

## 5. DAG、执行与资源准入

计划只有一份任务级 DAG。复合节点表达分解和出口，叶子节点必须同时具备：

- 一个正式 Owner；
- 明确的依赖输入和可写范围；
- 可独立验收的完成条件；
- 与 Ticket 或来源绑定的验证；
- 必要的共享资源声明。

Engine 根据依赖、catalog 并行上限、workflow 并行上限和资源锁准入 action。同一 Owner、重叠的项目资源或等价的主机端口会串行。并行任务各自在隔离候选区执行，不能直接修改用户 checkout。

Runner 只消费 Store 中到期且可准入的 action。每个效果具有持久 action ID、input digest、claim、执行证据和结果；重复回执必须幂等。结果校验在 Engine 状态转移中完成，效果层不能自行宣告任务或 Workflow 成功。

## 6. 候选、验证与交付

Owner 提交只证明候选产物已持久化，不等于验证或交付。后续链路是：

1. 确认 Owner 执行结算和源码写入关闭。
2. 封存候选并绑定 authority、任务定义和输入摘要。
3. 在候选内容上运行任务验证。
4. 按期望 integration HEAD 集成候选。
5. 对整份当前计划运行最终验证并关闭 Evidence Obligations。
6. 确认用户分支、HEAD 和工作区仍符合冻结边界。
7. 只用 fast-forward 更新用户 checkout，并保存交付回执。

用户分支前进、切换分支或存在待覆盖文件时，交付会变成可见 failure，保留已经验证的集成候选供处理。Kernel 不执行 reset、rebase、自动 stash、clean 或覆盖。

## 7. 停止、隔离与恢复

取消、超时、重规划或 Registry 变化会先标记执行停止，再创建 `stop_execution` action。停止成功必须提供与原 authority 匹配的：

- 执行已经结算；
- 源码写入已经关闭；
- 唯一 termination ID；
- action 或 Owner 所需的目标身份。

在证据齐全前，action 或 attempt 保持 stopping/uncertain；超过终止窗口则进入 quarantine，并继续占用相应锁和容量。停止适配器的异常是独立技术失败，不会被取消信号伪装成普通执行错误，也不能伪造取消完成。

恢复工具沿用原 issue、来源链和预算：

- `workflow_retry_task`：重试失败任务；
- `workflow_retry_action`：重试规划、验证、交付或治理 action；
- `workflow_replan`：在现有问题证据与当前基线上生成新计划。

失败现场继续保留项目 reservation，直到恢复成功或取消完全结算。新 Workflow 不能用不同 ID 绕过隔离与恢复义务。

## 8. 终态与主线程通知

Engine 从同一权威 view 推导 `completed`、`failed` 和 `cancelled`。每个非终态到终态的状态边缘只入队一个 `workflow_terminal` notice。notice 包含：

- `workflowId`、终态、workflow revision、更新时间和 plan version；
- 任务计数；
- 有界的 `attention` 与 recovery issues；
- 主要 failure 的原因和 detail；
- Registry、交付或取消的有界 outcome。

`NativeNotificationEffects` 把该 detail 原样写入绑定的原生 root session，并以 action ID 去重。通知只有在目标会话持久化中出现相同 message ID 后才结算。

取消只有在所有相关执行都取得停止回执、源码写入关闭且没有 quarantine 时成为 `cancelled`。如果终止窗口先产生 `failed`，迟到的有效停止回执可以形成一次状态纠正通知；它携带 `correctionReason` 和被替代 notice 的 ID、旧状态、revision。相同终态的重复回执不会再次通知。

## 9. Dashboard

`src/kernel-dashboard-host.mjs` 在同一 Web 宿主挂载 `/owner-workflow` 和健康检查。Dashboard 通过 `WorkflowStore.read()` 与 `view()` 生成只读快照，不调用初始化、修复、drive 或效果执行。

当前 GET 路由为：

- `/owner-workflow/api/health`
- `/owner-workflow/api/waits`
- `/owner-workflow/api/waits/events`
- `/owner-workflow/api/workspaces`
- `/owner-workflow/api/workflows`
- `/owner-workflow/api/snapshot`
- `/owner-workflow/api/snapshot/events`

SSE 连接按固定刷新周期比较快照并发送变化。页面是否刷新、连接是否存活都不是 Workflow 进度或执行完成证据。

## 10. 配置与维护边界

启动组合保留用户已有 profile、patch、credentials、provider/model、approval policy、sandbox 和 Git 身份。项目自研兼容修改只落在 Owner、SoL、Approve for Me 插件或项目集成层；DSH 和第三方上游保持原样。

`.dsh-workflow/` 是项目运行数据，不是长期 Owner Registry。正式 Registry、Spec/Ticket、Owner 知识和需要审查的交付内容必须位于项目 Git 边界内。

## 12. 验证状态

确定性 Kernel 回归由 `node scripts/run-kernel-regression.mjs` 汇总。定向模块测试可使用 Node test runner 执行对应 `owner-workflow-plugin/test/` 文件。

真实系统沙箱、官方 Web 宿主和浏览器链路受机器环境约束。新版浏览器全流程验收仍在进行中；现有单元、集成和 fixture 结果只能证明其实际覆盖的合同。历史 proof 与 Spec 记录继续保留，不应改写成当前使用步骤。

# Synapse、Intent 与动态 DAG 设计

## 1. 总体边界

本项目同时固定两个只读上游子模块：

```text
deepseek-harness/       Harness 源码与本地源码启动入口
dsh-synapse/            非线性会话地图与 fork 交互
owner-workflow-plugin/  自有编排、执行、Git、Memory 与 UI 适配
```

启动脚本把 Synapse Web 插件、Owner Workflow 服务端插件、Dashboard 和行动收件箱客户端加载到同一个 Harness Web 进程。子模块必须与父仓库 gitlink 完全一致且内部干净；升级只能显式更新父仓库 gitlink。

Synapse 只负责会话层：自由讨论、普通 fork、返回历史锚点、比较讨论分支和切换 DSH 原生会话。它不读取或写入 `.dsh-workflow/`，也不自动创建 Workflow task。

Owner Workflow Runtime 是执行层唯一权威，负责 Owner Registry、Intent Ledger、PlanRevision、DAG、Supervisor、Owner lease、Git/worktree、验证、Memory 和最终交付。

## 2. 一个项目只有一个活动 Workflow

同一个 Git 项目同一时间只允许一个尚未最终交付或完整取消清理的 Workflow。`planning`、`planned`、`approved`、`running`、`blocked`、`failed` 和尚未 finalize 的 `completed` 状态都会占用唯一槽位。损坏且无法读取的状态文件也占用槽位，不能被静默忽略。

唯一 Workflow 可以包含并行 DAG，例如 `A || B`；限制的是 Workflow 数量，不是 task 并发。

Workflow 创建时固定 `conversationRootSessionId`。这个 Workflow 只接受从该根会话通过 DSH 普通 fork 谱系产生的讨论会话。其他同目录会话、执行子代理和无法核验完整谱系的会话不能提交 Intent。

Synapse 的长期讨论树与 Workflow 生命周期没有强绑定。Workflow finalize 后，后续新需求可以从长期讨论树中的任意普通会话节点创建新的唯一 Workflow；该节点会成为新 Workflow 的根。

## 3. Intent Ledger

普通讨论、fork、方案比较和历史回看都不会自动改变 DAG。只有用户明确表达以下语义时，主编排者才调用 `workflow_intent_submit`：

- 加入当前 Workflow；
- 更新 DAG；
- 把 B 与 A 并行；
- 把 C 设为 A、B 的前置；
- 删除或调整当前 Workflow 中的明确任务。

Intent 只保存用户明确表达的内容、来源会话、fork 锚点、状态和时间。状态只有：

```text
pending
incorporated
rejected
```

保存 Intent 后，插件必须通过 Harness 原生问询明确提醒：

```text
已保存 Intent；当前共有 N 条待整理。是否现在重新规划？

现在重新规划
继续讨论
其他（输入意见）
```

选择“继续讨论”时不调用 Planner，后续 Intent 继续累计。选择“现在重新规划”或用户随后明确要求更新 DAG 时，才按需唤醒一次 Planner，统一处理当前全部 `pending` Intent。

## 4. PlanRevision

PlanRevision 是精简的不可变计划快照：

```text
number
parent
planDigest
plan: DSH_PLAN_V2
```

Intent 自己记录最终进入的 revision；变更原因写入 Runtime 事件日志；Registry digest 已包含在 `DSH_PLAN_V2` 中，不在 Revision 外层重复保存。

一次只能存在一个候选。Planner 开始汇总时固定当前 pending Intent 集合；审查期间产生的新 Intent 自动留给下一轮，不能修改当前候选 digest。需要包含新 Intent 时，Workflow 根会话先用 `workflow_revision_discard` 废止候选，再显式重新规划。

候选流程固定为：

```text
workflow_revision_plan
        ↓
workflow_revision_review
        ↓
workflow_revision_approve
```

最终批准只能在 Workflow 根会话进行。原生问询必须展示新增、删除和变更任务，以及依赖和 Owner 差异；只有明确同意后 Runtime 才切换活动 revision。

PlanRevision 的自动收敛不按候选次数停止。首次 Reviewer 一次性冻结 Evidence Obligations；后续候选只有在 Runtime facts、固定验证、Git checkpoint 或 open obligation 数量发生变化时才续期进展租约。无进展时 Runner 必须切换局部改写、只读诊断、Owner 会诊、独立仲裁或替代实现，不能继续生成同一语义候选。只有外部授权问题才询问用户；工程问题在所有不同策略都无法产生新证据时保存自治事故与完整现场。

DAG 节点不按预计耗时或代码行数判断大小。一个 Owner、一个独立结果、一个相关文件/产物族和一份可核验证据同时成立时，该节点就是叶子并停止拆分。

## 5. 运行中切换

任务的执行状态仍是 `pending / running / completed / stopped`，另有结果检查状态：

```text
valid          最终有效
pending_check  待检查
invalid        已失效
```

切换规则：

- 任务语义完全无关：继续执行，已完成结果保持 `valid`。
- 新增前置、验证或需求变化，或者 write 范围扩大：旧运行自然结束并合入 workflow HEAD，但结果标记“待检查”；只保留临时 Memory 日志。
- Owner 变化、任务删除、write 收窄或 Registry 权限变化：立即使 Owner lease 失效并取消子代理，旧结果不合入；Runtime 从最新 checkpoint 自动重建受影响局部子图。只有需要外部授权时才进入人工决定。

以运行中的 `A || B` 倒插前置 `C` 为例：

1. 新 revision 获批。
2. A、B 当前运行自然结算，结果标记“待检查”。
3. 为避免同一 Owner 并发和基线倒置，Runtime 等旧 reservation 完成后才放行 C。
4. C 在最新 workflow HEAD 上执行并合入。
5. A、B Owner 分支同步最新 workflow HEAD。
6. A、B 进入 `recheckOnly`，重新执行计划绑定的固定验证；不为制造提交而改代码。
7. 验证通过后恢复 `valid`；失败时由原 Owner 按新 DAG 修复。

Runtime 只处理受影响任务，不机械重做全部节点。

## 6. Owner Memory

Owner Memory 分为：

- 当前 Memory：Git 跟踪的极简中文能力与设计事实；
- 临时 Memory：Runtime 中当前 task 的完成、结论、下一步和阻塞日志。

未最终有效、尚未完成最新 DAG 检查或尚未合并到 workflow HEAD 的结果只能追加临时日志，不能封存来源、修改 `.owner-workflow/owners/<owner-id>/memory` 或运行 Memory Compiler。

只有任务按最新 revision 的依赖与固定验证全部通过后，Runtime 才执行：

```text
封存最终临时日志
→ Curator 基于当前代码生成受限提案
→ Reviewer 与格式校验
→ 更新并提交当前 Memory
```

当前 Memory 不记录日期、行号、提交 SHA、测试输出、审查过程或逐文件流水账。

## 7. Owner 授权与行动收件箱

Owner 会话使用 `workspace-write + ask`。插件在该会话的 `approval/request` waterfall 前设置严格门禁：只有 Runtime 当前登记且对象身份完全匹配的 `owner_host_exec` 或固定验证请求可以继续到 Harness UI；模型通过 Shell 直接申请的其他升级会返回 `rejected`。

授权卡片属于请求产生的 Owner 会话，包含精确命令、目录、任务和原因。主会话不转发、不复制批准结果，也不代替目标会话作答。

行动收件箱是只读发现与导航层：

- 合并 `.dsh-workflow` 的 Operation/Runner 等待投影；
- 合并 Harness `SessionSummary.pendingInteraction` 中的 approval、question 和 plan-review；
- 点击条目调用原生 `sessions.open(sessionId)` 返回现场；
- 会话头部、侧边栏和 `shell.overlay` 浮层同时提供入口；
- Synapse 全屏地图打开时，浮层仍保持可见。

请求处理后，Harness 原生 pending 状态消失，收件箱自动移除条目。收件箱不执行批准、不转发消息、不修改 Runtime 状态。

## 8. Git 生命周期

Workflow 从用户当前分支创建可读 workflow 分支；每个 Owner 从 workflow 分支创建自己的分支和 worktree。Owner task 完成后立即合入 workflow HEAD。

所有任务最终有效后，必须先完成 Implementation Review，再将固定 workflow HEAD 合并回创建时的原始分支。成功后删除本 Workflow 的全部 Owner/workflow 临时分支和 worktree。`failed`、`blocked` 与“待检查”都不是最终完成状态，不能提前 finalize。

## 9. 恢复与验证

Runtime 状态、Intent、Revision、等待项、Owner worklog、reservation 和事件都持久化在 `.dsh-workflow/`，进程重启后不依赖聊天记忆恢复。

最少回归场景：

- 第二个 Workflow 在第一个未结束时被拒绝；
- 普通无关会话不能提交 Intent；
- 同根普通 fork 可以提交 Intent；
- Intent 后选择继续讨论不会调用 Planner；
- 候选冻结后新增 Intent 留到下一轮；
- A、B 运行时倒插 C；
- 同一 Owner 的 C、A 不并发；
- “待检查”阶段不编译长期 Memory；
- Owner 现场授权只允许 Runtime 登记请求；
- Synapse 全屏时行动收件箱可见并能跳回目标会话；
- 子模块未初始化、gitlink 不匹配或内部脏改动时拒绝启动。

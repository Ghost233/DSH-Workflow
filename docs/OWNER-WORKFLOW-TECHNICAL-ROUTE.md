# Owner 工作流技术路线

## 运行时模块边界

- `runtime.mjs`：组合工作流状态、Runner、Supervisor、Git 合并和公开 Runtime API，不再定义 Owner 工具白名单。
- `agent-policy.mjs`：只处理主代理编排边界、子代理沙箱模式和同一 Owner 禁止派生后代 Agent。
- `owner-agent.mjs`：生成一次性 Owner 子线程的中文任务、记忆和提交说明。
- `owner-boundary.mjs`：检查基线到固定 HEAD 的全部提交路径、受保护路径和最终 Git 提交。
- `owner-submission.mjs`：实现唯一 `owner_submit` 事务，按顺序执行边界检查、固定验证和提交。
- `owner-host-command.mjs`：处理 Owner 的一次性宿主命令；把原生授权路由到主代理，并在明确允许一次后执行卡片中的精确命令。
- `owner-lifecycle.mjs`：定义 blocked、handoff 等 Owner 生命周期信号。

子代理的正常开发能力由 Harness 提供，插件只在角色边界和提交事务上实施确定性约束。

## 1. 范围与不可变约束

本路线描述当前 Owner 工作流 V2 的 Operation、Runtime、Registry、任务调度、验证、Git 集成和只读观测边界。实现采用纯 `DSH_PLAN_V2`：不存在 Quick 模式；任何会写入代码的需求都必须创建独立 workflow 分支、Owner 分支和 Owner worktree。无需修改仓库但需要实际执行的任务使用独立 Operation，不创建开发分支。

`deepseek-harness/` 是上游 Git 子模块，保持零修改。所有用户可见错误、提示词、日志摘要和文档使用中文。Owner 在隔离 worktree 中获得正常开发工具，但不能控制 Workflow、Operation 或派生后代 Agent；状态转移和最终提交仍由运行时裁决。

旧 V1 计划只支持历史查询和导出。它不能被激活、调度、恢复、验证、合并或 finalize；运行时不会从缺失字段猜测 V2 依赖或验证。

## 2. 持久化边界

```text
用户
  │
  ▼
主编排者 ── audit / operation_* / workflow_* ───────────────▶ 运行时
     │                                                       │
     └──── 用户只与主代理沟通 ◀── Operation Operator 回报 ──┤
                                                     │
                 Git 跟踪：.owner-workflow/ ◀────────┤ Registry
                 Git 忽略：.dsh-workflow/  ◀─────────┤ workflow 状态、事件、lease、现场
                                                     │
                                     本地 Unix 控制桥 ◀┘
                                                     ▲
                                     外置 Supervisor ──┘
                                                     │
                                   Harness 短期 Owner Agent
```

Git 跟踪的 `.owner-workflow/` 是跨 workflow 的 Owner Registry 真源：

```text
.owner-workflow/
├── config.json
└── owners/<owner-id>.md
```

Owner 的代码分析可以由专门子代理完成，但设定、提案展示、原生问询与批准必须绑定创建 Workflow 的主线程；批准后才由 Runtime 写入项目基础分支。

Git 忽略的 `.dsh-workflow/` 保存 workflow 状态、Operation 状态、任务记录、lease、控制清单、事件流、临时 worktree、固定 SHA/预合并记录、日志和 Dashboard 投影。`.owner-memory/` 仍是 Git 跟踪的长期知识真源，不授予 Owner scope。

### 2.1 非编码 Operation 通道

主代理根据用户的自然语言生成 Operation 执行契约，用户不需要提供具体命令，也不需要进入子线程。契约包含：

- `goal`：需要得到的结果；
- `context`：项目、设备和故障现场；
- `constraints`：禁止动作和风险边界；
- `successCriteria`：可判断完成的标准；
- `capabilities`：本次最小通用能力。

`operation_start` 创建可续接的后台 Operator。Operator 不属于 Owner，不获得文件 scope，不创建开发分支；它继承正常工具，但项目文件沙箱保持只读。需要精确外部副作用时优先使用 `operation_exec` 触发 Harness 原生审批。ADB、Docker、系统日志或项目临时命令由 Operator 根据现场生成，不进入 Workflow 源码。

Operator 只能通过 `operation_report` 与主代理通信：

```text
progress / finding ──▶ 持久事件；不要求用户切换页面
need_input          ──▶ 主代理在当前对话询问 ──▶ operation_continue
need_approval       ──▶ operation_approve ──▶ Harness 原生授权卡片
completed / failed  ──▶ 唤醒主代理并返回结构化结果
```

每次 `operation_exec` 只能执行一条命令；复合命令会被确定性拒绝，多个只读检查必须拆分，不能被误转为用户副作用授权。可能改变设备、系统、网络或远程状态的命令不能以 `read-only` 执行。Runtime 为 `need_approval` 固定精确命令并生成一次性授权编号；主代理随后调用 `operation_approve`，以自身会话和当前工具 `callId` 调用 Harness 的 `ctx.approval.request`。Web UI 使用原生卡片显示原因和 `command` 参数；只有 `allowed-once` 才将完全相同的命令标记为可执行一次。普通文本、`ask_user_question`、子代理自述或旧 Operation 的决定都不能产生授权。`operation_start` 后依赖 Operator 主动回报，主代理不得轮询状态。

Harness 会把委派子代理的 approval policy 固定为 `never`，所以 Operator 不能直接弹卡片。卡片必须由主代理的 `operation_approve` 工具发起；用户仍然只与主代理沟通。进入 `waiting_input` 或 `waiting_approval` 后，Runtime 拒绝 Operator 的后续 `progress`、`failed`、`completed` 等报告，防止等待状态被低成本模型自行覆盖。

Operation 子代理默认继承主代理模型；部署可通过 `DSH_OWNER_WORKFLOW_OPERATION_PROVIDER` 和 `DSH_OWNER_WORKFLOW_OPERATION_MODEL` 选择低成本模型。Operator 继承正常工具，项目文件保持只读；精确外部副作用通过 Harness 原生授权，状态转移仍由 Runtime 控制，而不是交给低成本模型判断。

## 3. Registry 审批

规划子 Agent 可以提出 Registry 变化，但不能直接写正式 Registry。运行时按以下顺序处理：

1. `owner_change_propose` 校验受管根、scope、父子关系和现有任务影响，生成包含 before/after 与精确 digest 的提案。
2. 主编排者立即调用 `workflow_owner_change_approve`，由工具确定性读取并展示提案摘要、受影响 Owner、文件范围和 digest；不让模型手写批准提示。
3. `workflow_owner_change_approve` 先校验待批准提案与 digest，再通过 `ctx.userQuestions.ask` 显示“同意/不同意/自定义输入”原生问询。只有明确同意才在 workflow worktree 应用 Registry 并形成可审计 Git 变更；不同意和自定义意见都不修改状态。
4. `workflow_plan_approve` 使用相同的原生问询门禁。问询前先校验独立审查、`planDigest` 和实时 `registryDigest`；只有明确同意才把计划转为 `approved`。
5. 受影响的 reserved 或 running task 存在时拒绝应用；应用后使旧计划、Review、验证和完成绑定失效，必须重新规划、审查和审批。

Registry 的正式增删、拆分、合并、转交和 scope 变化没有绕过审批的直写入口。初始 Registry 为空时，Planner 只能提出第一批 Owner；Registry digest 与完整 plan digest 都获批后才能启动 Supervisor。

Planner 计划中的 `owners` 是 Owner ID 选择器，不是第二份 Registry。Runtime 根据这些 ID 从当前正式 Registry（或本轮 `registryOperation` 的确定性 after 快照）注入名称、职责、scope、exclude 与父子关系，然后才规范化任务并校验 `task.write`。因此 Planner 的自然语言改写不会造成伪冲突，伪造宽 scope 也会被正式边界覆盖并拒绝越界任务。

计划 Reviewer 不再通过普通文本返回 JSON。Runtime 只向当前 `plan-reviewer` 角色开放 `workflow_plan_review_submit`，该工具只接受 `DSH_PLAN_REVIEW_V1`、`passed|needs_revision` 和结构化 issues。子线程没有成功提交或提交非法契约时，Runtime 会携带确定性校验错误新建一次独立重试；第二次仍失败才关闭处理。合法结果随后绑定当前 `planDigest` 并原子保存。

## 4. DSH_PLAN_V2 与任务 DAG

V2 计划的最小契约为：

```json
{
  "contract": "DSH_PLAN_V2",
  "registryDigest": "<sha256>",
  "owners": [],
  "verifications": [
    { "id": "unit-user", "run": ["npm", "test", "--", "user"], "cwd": "packages/user" }
  ],
  "tasks": [
    {
      "id": "T1",
      "role": "work",
      "ownerId": "network-user",
      "title": "实现用户接口",
      "dependsOn": [],
      "write": ["src/network/user/**"],
      "verify": ["unit-user"],
      "done": ["中文验收条件"]
    }
  ]
}
```

运行时激活前校验：

- 计划契约必须是 `DSH_PLAN_V2`，且 Registry digest 与当前正式 Registry 一致。
- 任务 ID 唯一；`dependsOn` 只能引用现有任务，运行时检测 DAG 环。
- `role` 只能是 `work`、`review` 或 `verify`。Review 是显式只读节点，只阻塞自己的下游依赖。
- `write` 必须是该 Owner scope 的子集；scope、路径链接和受保护路径由运行时重新校验。
- `verifications` 使用唯一 ID、argv 数组和可选受限仓库相对 `cwd`；任务只能引用 ID，不能修改命令、工作目录、附加参数或临时换验证。新的 Flutter 验证必须显式声明包根 cwd。
- 任务必须声明完成条件和必需验证；验证未在当前内容版本全部通过时，任务不能完成。

持久化 workflow 状态只能是 `initializing`、`planning`、`planned`、`registry_pending_plan`、`approved`、`running`、`blocked`、`failed`、`completed`、`stopped` 或 `cancelled`；运行时拒绝写入未知状态。任务状态是 `pending`、`running`、`completed` 或 `stopped`；`reserved` 只是 `running` 且尚未绑定执行者的元数据。停止原因与动作使用有限配对，例如 `task_failed/repair_task`、`decision_required/await_user`、`thread_failed/replace_thread`、`plan_invalid/revise_plan` 和 `runtime_failed/retry_runtime`。

## 5. Owner 固定分支与 worktree

每个 workflow 的分支和现场固定为：

```text
dsh/workflow/<日期>-<项目递增序号>-<需求摘要>
dsh/owner/<日期>-<项目递增序号>-<需求摘要>/<owner-id>
.dsh-workflow/worktrees/<workflow-id>/owners/<owner-id>
```

内部 `workflow-id` 仍用于状态、锁、socket 和 worktree 的唯一隔离，但不暴露在新建 Git 分支名称中。可见分支的项目递增序号由 Runtime 在受控锁内分配，需求摘要由确定性字符清理生成。workflow 分支从启动时的当前分支建立。每个 Owner 在同一 workflow 内复用分支和 worktree，但每个任务创建并回收一个短期 Harness 子代理；同一 Owner 的 lease 保证这些任务不会并行执行。

创建前必须先通过只读 `workflow_preflight`。它返回基线分支、HEAD、全部非运行时 Git 改动和 `baseDigest`；`workflow_start` 要求这个摘要仍与实时现场一致。预检不会暂存、提交、还原或隐藏改动。若含有子模块内部脏改动，运行时明确拒绝开始，不把该现场误当成可由父仓库提交的 gitlink 变更。

脚本派发前执行 Owner 同步：确认前次任务已经结算、Owner worktree 干净，并将 Owner 分支快进至 workflow HEAD。Owner 子代理在该 worktree 中继承正常工具和 `workspace-write`，读取整个仓库不受 scope 限制；`request_handoff` 和 `request_subgraph` 仍用于结构化协调。

Planner、Reviewer、Memory 与 Owner 子线程统一由插件注册的正式 one-shot Subagent provider 创建。`SubagentRuntime` 生成版本匹配的 `subagent/descriptor`，provider 在首次请求前写入 descriptor，并保留角色沙箱、提示词与 active Owner 绑定。调用方等待单次 `result` 后在 `finally` 中 dispose；会话历史保留为可审计的 inactive one-shot 记录，不再以只有 `origin=subagent`、缺少 descriptor 的“会话记录损坏”条目出现。

所有子代理的 `approval/policy` 固定为 `never`，所以 Owner 不能自己弹出隐藏授权卡片。普通命令先在 `workspace-write` 中执行；如果同一精确命令因为需要访问 worktree 外的共享 SDK、编译器或缓存而被拒绝，Owner 调用 `owner_host_exec`。Runtime 校验调用者仍是 active Owner、工作目录位于其 worktree、Owner lease 未漂移，然后以创建该 Workflow 的主代理作为 `ctx.approval.request` 的 `agent`，在主对话展示 Owner、任务、用途、理由、目录和完整命令。只有 `allowed-once` 才以 `danger-full-access` 执行该命令一次；拒绝、取消、通道不可用、主代理没有开放回合或 Owner 绑定失效都不会执行。

Owner 必须调用 `owner_submit`。这个唯一提交关卡自动执行固定验证，按真实 Git diff 检查 scope、链接和受保护路径，生成提交后再次校验固定 SHA；Git 忽略文件不进入提交，不再阻断结算。快照复制使用 `verbatimSymlinks` 保留相对符号链接，避免 `AGENTS.md -> CLAUDE.md` 被改写成宿主绝对路径后产生虚假摘要漂移。通过后立即把固定 SHA 合入 workflow HEAD，并记录任务和事件。冲突、越界或审计失败都会保留 Owner 现场。

提交关卡不接受 `needs_repair` 终态，而是把错误返回同一短期子线程继续修改。旧 Runtime 已经留下合法未提交修改时，恢复流程识别脏文件、固定原审计基线并跳过覆盖式同步；新子线程在原 worktree 继续处理，提交后通过预合并接入最新 workflow HEAD。脏文件越过 Owner scope、触及受保护路径、分支错配或失去共同基线时仍会关闭处理并保留现场。

跨 Owner 需求只能形成结构化 handoff；Owner 不能在执行回合内直接扩大 scope 或改变 Registry。

## 6. 必需验证

`owner_submit` 根据当前 task 的 `verify` 列表自动执行全部固定验证。运行时确认当前会话、Owner lease、任务绑定和 verification ID，然后在 Owner 当前内容的一次性独立 Git 快照中，以 `workspace-write` 沙箱执行计划保存的固定 argv 与 cwd；cwd 必须留在快照根目录内，且与 argv 一起持久化为审计证据。若该精确命令被沙箱明确拒绝访问共享 SDK、编译器或缓存，Runtime 直接以创建 Workflow 的主代理请求 Harness 原生一次性授权；允许后只在新的独立快照中以 `danger-full-access` 从同一个 cwd 重试同一命令，并把 `approved-host + allowed-once` 作为固定证据。后台 Runner 没有主代理开放回合时，提交关卡自动返回 blocked 并保留 worktree，等待主对话恢复同一任务，不依赖 Owner 模型猜测授权工具。命令一旦实际执行且退出码非 0，就属于验证失败而不是授权阻塞；Runtime 持久化有界 stdout/stderr、返回同一 Owner 修复，并拒绝接受虚假的 blocked 报告。

运行时记录命令、cwd、退出码、沙箱 enforcement、内容摘要和任务绑定，并检查验证期间内容未漂移。旧计划缺少 Flutter cwd 时，兼容分支只从受控 task.write、固定 `flutter test test/...` 参数和唯一存在的 `pubspec.yaml` 推导包根；缺少或多个候选都会 fail-closed，且同一计划的所有缺失 cwd Flutter 验证复用该唯一目录。该兼容仅服务历史已批准计划，新的 Flutter 验证必须显式声明 cwd。只有全部必需验证在当前内容版本通过，提交关卡才会生成提交；“测试未运行但模型说已完成”不会被接受。

## 7. Supervisor 控制路径

外置 `run-owner-workflow` 是持久 `workflowd`。它不读取、遍历或解释原始计划，也不自行选择任务，只通过本地控制桥领取确定性 receipt。Runtime 是 DAG、Owner scope、lease、验证、Git 与状态的唯一权威：

```text
supervisor next → create | wait | notify | inspect | stop
create → supervisor-ack → 持久 reservation → supervisor-execute
wait → supervisor-await-event(cursor) → 事件或受控超时
notify → main outbox → runner 输出 → outbox ack
```

动作责任如下：

| 动作 | 运行时含义 |
| --- | --- |
| `create` | 只持久化任务、Owner、lease、提示和 profile 的 reservation；不会由 Runtime 隐式启动 Agent |
| `supervisor-execute` | 由 runner 显式启动或恢复指定 reservation；请求可重放且状态受 Runtime 校验 |
| `wait` / `supervisor-await-event` | 按持久事件游标长等待当前任务状态或游标变化；超时仅写入一次受控观察 |
| `notify` / main outbox | 把需要主编排者、用户或人工处理的事项持久化；runner 交付并确认前不会丢失 |
| `inspect` | 达到连续无进展阈值后读取有限状态，返回确定性观测 |
| `stop` | 没有 active task 时停止 Supervisor；不推断业务结果 |

Supervisor、Planner、Reviewer、Owner 和 Memory 角色使用独立 profile；并发上限来自 `.owner-workflow/config.json`，不能由 Planner 为填满并发槽位而拆分任务。

`DSH_PLAN_V2` 任务可声明 `priority`（高值优先）、`onFailure`、`onBlocked` 与 `onTimeout`。`onTimeout.afterMs` 是 Owner 启动后的最长无结算时限（60 秒到 24 小时，默认 30 分钟）。超时会先持久化决策阻塞，再向当前已登记 Owner 会话请求取消；Runtime 对 `onFailure.repair_owner` 按 `maxAttempts` 重新放回已批准 DAG。超时、阻塞和其他失败策略写入主会话决策路径，不允许 runner 或模型在未批准计划之外猜测状态迁移。

## 8. 恢复、取消与局部重规划

恢复只读取状态、revision、lease、固定 SHA、事件和 Agent 标识。原 Owner 可用时继续原 Agent、分支和 worktree；失效时按有限 reason/action 规则请求替换或修复，不能创建第二个同 Owner 并行执行者。恢复事务会清除当前任务旧的超时结论，并记录新的恢复/启动时间；Supervisor 计算 `onTimeout` 时取有效 reservation 与当前 Owner 运行中的较新基线，避免旧回执把刚恢复的 Workflow 重新写成 `blocked`。

尚未产生业务提交的 active work task 可以请求 Composite 子 DAG；运行时保留父任务的外部依赖，并校验子任务 scope、验证和 entry/exit。普通 handoff 触发局部 delta 重规划；受影响任务必须显式 carry-forward 或 invalidate，旧 Review、验证和完成状态不能静默沿用。

`failed` 和 `blocked` 保留未提交改动、Owner/workflow worktree、分支、日志、事件和 outbox，供同一 Workflow 恢复。`cancel` 是用户明确放弃本次工作的清理命令：原生问询明确同意后停止后续派发，不执行最终合并，强制删除未合入的临时分支、worktree 和未提交修改，只保留 Runtime 状态、日志、事件与 Dashboard 历史。规划、审查、验证、工具或模型错误不能自动触发 `cancel`。

## 9. Dashboard 只读投影

Web Harness 启动时，bundle 会加载一个仅依赖 `webServer` 的 Dashboard 宿主插件，并在同一服务上注册：

```text
/owner-workflow
```

Runtime 把实际业务工作区登记到启动脚本固定目录中的 `workspaces.json`，页面先通过 opaque `workspace_id` 选择工作区，再使用只读 workflow 与 Operation 接口。页面可查看 workflow、任务级 DAG、Owner、后台 Operation、等待主代理状态和经过字段白名单处理的最近事件；目录接口不返回本地路径，Operation 投影也不暴露父子会话或等待批准的原始命令。浏览器不能传入任意本地路径，也没有状态迁移、Git、Shell、CORS 或命令接口。该实现使用 Harness 已有的命名 Web 路由，不修改子模块，也不要求第三方插件侵入不存在的主界面顶部 Tab 插槽。

静态客户端模块另外占用两个现有的可加性 Slot：

- `conversation.session.header.actions`：只在当前会话存在活动 Operation 时显示“等待 N”。
- `sidebar.footer.action`：持续显示跨会话“主动等待 N”，展开后按会话分组。

两个入口共用 `GET /owner-workflow/api/waits`。接口扫描已登记工作区中的 `.dsh-workflow/operations/*/state.json`，只返回活动状态、父会话编号、工作区显示名和经过长度限制的摘要；不会返回本地路径、子线程编号或原始命令。客户端以一秒间隔刷新，并在接口暂不可用时明确显示错误而不伪造状态。

这里不使用自定义 Session Event。当前 Harness 的持久化读取端只接受构建时已知事件，外部插件写入未登记事件会破坏会话重载；因此 Operation 磁盘状态保持唯一权威，等待列表只是可丢弃、可重建的只读视图。

兼容的独立观测服务仍可启动：

```sh
./run-owner-workflow.sh --dashboard --workflow-id wf-... --port 57357
```

独立服务默认绑定 `127.0.0.1:57357`。它必须带 `workflow-id`，只读取运行时写出的 `.dsh-workflow/dashboard/<workflow-id>/progress.json` 和 `events.jsonl`，通过 GET `/api/progress` 和 SSE `/events` 提供观测；不同 workflow 的投影和事件严格隔离。两种 Dashboard 都不写 workflow、不调度 Agent、不执行 Shell 或验证；页面不是状态真源。

在计划尚未生成、正在初始化或失败恢复时，progress 投影固定为 `DSH_WORKFLOW_PROGRESS_V1`、当前状态和空 `tasks` 数组；这属于合法生命周期状态，不能因为缺少任务数组而让 workflow 状态写入失败。所有插件工具先把结果规范化为无损 JSON：可选字段必须省略，不能向 Harness 返回 `undefined`、循环引用、二进制对象或非有限数值。

## 10. 最终集成

所有任务完成后必须执行显式 `implementation_review`，它固定当前 workflow HEAD；任何后续变更都会使该 Review 失效。`finalize` 尝试把已审查的 workflow HEAD 合入启动分支的最新 HEAD，并在需要时使用临时预合并验证。冲突时保留 workflow 分支、Owner 分支、worktree、日志和状态，不声称交付成功。

## 11. 兼容边界

历史 V1 状态只能用于查询和导出，Dashboard 对其也只生成空任务投影。V1 不会被 Supervisor 创建、等待、恢复或合并；要继续开发，必须按 [V2 迁移说明](OWNER-WORKFLOW-V2-MIGRATION.md) 新建并审批 `DSH_PLAN_V2`。

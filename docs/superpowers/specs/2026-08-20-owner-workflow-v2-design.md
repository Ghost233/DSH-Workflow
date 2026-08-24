# Owner 工作流 V2 设计

## 目标

将当前按阶段调度的 Owner 工作流升级为脚本驱动的任务级 DAG 系统。所有依赖、Owner 责任域、验证、调度、恢复和最终合并都由运行时或外置脚本判定；LLM 只提供受限的规划语义、代码修改和结构化结果，不能自行推进状态。

本设计不提供 Quick 模式。任何会写入代码的需求都必须建立独立 workflow 分支和 worktree。`deepseek-harness/` 子模块保持零修改。

## 非目标

- 不复制 Claude Code 的 `standalone_thread`、新 Main 交接或项目内 Hook 机制。
- 不授予 Owner Git、普通 Shell 或越界写入权限。
- 不把 Owner 对话、模型文字结论或 Dashboard 页面作为状态真源。
- 不在本次设计中支持远程多机执行；控制桥仍只监听本机 Unix socket。

## 总体架构

```text
用户 → Owner 编排者 → 运行时规划/审批接口
                         │
                         ├─ Git 跟踪的 .owner-workflow/（Owner Registry）
                         ├─ Git 忽略的 .dsh-workflow/（workflow 状态与事件）
                         └─ 本地控制桥
                               ▲
外置脚本化 Supervisor ────────┘
       │ next / ack / wait / inspect
       ▼
Harness 持久 Owner 子 Agent → 受控写入 / 固定验证 / 固定提交
```

运行时是唯一状态写入者。外置 Supervisor 仅执行控制桥返回的确定性动作，并把宿主观测值回传为回执。所有状态转移、依赖解析、超时判定、分支同步和合并由脚本决定。

## 目录与持久化

### Git 跟踪：`.owner-workflow/`

```text
.owner-workflow/
├── config.json
└── owners/
    └── <owner-id>.md
```

- `config.json` 记录 schema 版本、受管根目录、最大并发和各角色模型 profile。
- Owner 文档使用中文 Markdown 与 YAML frontmatter，记录 id、责任、scope、排除范围、父 Owner 和状态。
- Owner Registry 是跨 workflow 的责任域真源；任何 split、merge、transfer、增删 Owner 或 scope 变化都必须走提案、digest、用户批准和应用。
- Registry 变更与业务代码一样进入 workflow 分支，最终与 workflow 一并交付；未批准提案只存在于运行时状态。

### Git 忽略：`.dsh-workflow/`

- workflow 实例、任务状态、lease、控制清单、事件流、临时 worktree、预合并记录和 Dashboard 投影。
- 所有状态文件带契约版本、revision 和原子写锁；旧 revision 不能覆盖新状态。
- `.owner-memory/` 继续是 Git 跟踪的长期知识真源，不获得 Owner scope 授权能力。

## Owner Registry 治理

规划子 Agent 可以提出 Owner Registry 变更，但不能直接写入正式 Registry。运行时提供以下确定性流程：

1. `owner_change_propose` 校验 scope、父子关系、受管根目录和现有任务影响，生成精确 digest。
2. 编排者向用户展示变更摘要、受影响 Owner、文件范围和 digest。
3. 只有 `owner_change_approve` 提交完全匹配 digest 后，运行时才把变更写入 workflow worktree 中的 `.owner-workflow/`。
4. 运行中存在 reserved 或 running task 时拒绝改变正式 Registry；需先在安全边界停止或完成受影响任务。
5. 应用变更后使旧计划、Review 和验证绑定失效，必须重新规划、审查和批准。

初始 Registry 为空时，Planner 可提议第一批 Owner；用户批准该 Registry digest 与完整 plan digest 后才允许启动 Supervisor。

## V2 计划与任务级 DAG

计划契约升级为 `DSH_PLAN_V2`，核心字段如下：

```json
{
  "verifications": [{ "id": "unit-user", "run": ["npm", "test", "--", "user"] }],
  "tasks": [{
    "id": "T1",
    "role": "work",
    "ownerId": "network-user",
    "title": "实现用户接口",
    "dependsOn": [],
    "write": ["src/network/user/**"],
    "verify": ["unit-user"],
    "done": ["中文验收条件"]
  }]
}
```

- 任务而非阶段是 DAG 节点；`dependsOn` 只能指向现有任务，运行时检测环。
- `role` 只能是 `work`、`review` 或 `verify`。Review 是显式只读节点，只阻塞下游依赖，不隐式审查无关任务。
- `write` 必须是该 Owner scope 的子集；运行时用 scope matcher 验证而非相信 Planner。
- `verifications` 使用唯一短 ID 与 argv 数组。任务只能引用 ID，不能传 shell 字符串或附加参数。
- 计划激活前，运行时先校验 schema、Registry digest、任务依赖、Owner 路由、验证引用和固定 gate；随后独立 Planner Reviewer 只评估真实并行度与图是否过度拆分或过度串行。

旧 `DSH_PLAN_V1` 只允许查看和导出。缺少任务依赖、显式角色或固定验证的旧 workflow 标记为不可继续，不能由模型猜测迁移。

## Owner 执行与 Git 同步

每个 Owner 在一个 workflow 内固定使用一个分支和 worktree：

```text
dsh/owner/<日期>-<项目递增序号>-<需求摘要>/<owner-id>
.dsh-workflow/worktrees/<workflow-id>/owners/<owner-id>
```

每次脚本派发同一 Owner 前执行 `owner-sync`：确认前次任务已结算，将 Owner 分支快进至 workflow HEAD，并验证 worktree 干净。Owner 的分支和 worktree 可以复用，但每个任务创建并回收一个短期 Harness 子代理；同一 Owner 的 lease 覆盖进程、任务、分支和 worktree。

Owner 在隔离 worktree 中继承正常开发工具和 `workspace-write`，可以读取整个仓库。完成时必须调用 `owner_submit`；运行时自动验证、按真实 Git diff 检查 scope 与受保护路径，并在提交后再次校验固定 commit SHA。每个任务完成后立刻进行临时预合并并更新 workflow HEAD；Owner worktree 和分支仅在 workflow finalize 后清理。

所有短期角色使用插件专用的正式 one-shot Subagent provider。Harness 生成 descriptor，provider 在首次请求前持久化并在单次结果后释放 run；目录投影因此能把历史识别为 inactive one-shot。验证快照复制必须启用 `verbatimSymlinks`，使相对链接在真实 worktree 与快照中保持相同摘要。

Owner 子代理的 `approval/policy` 固定为 `never`。如果普通 Shell 的同一精确命令因为访问 worktree 外共享 SDK、编译器或缓存而被拒绝，Owner 只能调用 `owner_host_exec`。该桥以主代理身份显示 Harness 原生授权卡片，并在 `allowed-once` 后执行一次；子代理直接设置 `sandbox_permissions`、非 active Owner、越过 worktree 的工作目录和失效 lease 一律拒绝。

正式 required verification 由提交关卡直接处理授权：先在 `workspace-write` 快照执行；明确 denied 后以主代理身份申请原生一次性授权，允许后在新快照中执行相同 argv，并持久化 `approved-host` 与 `allowed-once` 证据。主代理没有开放回合时任务进入 blocked 并保留现场。

跨 Owner 需求只能产生结构化 handoff。scope 增删、Owner split/merge/transfer 只能形成 Registry 提案，不能在 Owner 执行回合中直接生效。

## 验证

Owner 通过 `owner_submit` 触发当前 task 的全部固定验证。运行时：

1. 校验调用者是当前 task 绑定的 Owner，且 verification ID 已绑定。
2. 在 Owner 当前内容的独立 Git 快照内，以 `workspace-write` 沙箱执行计划中固定 argv。
3. 记录命令、退出码、沙箱 enforcement、固定输入 commit 和结果摘要。
4. 只有任务的全部必需验证在当前内容版本通过，提交关卡才可生成固定提交。

验证失败会把有界 stdout/stderr 证据直接返回当前短期 Owner 子线程，由它调整后重新调用 `owner_submit`；已经实际执行且退出码非 0 的验证不能被报告为授权 blocked，也不会接受“测试未运行但已完成”的模型文本。

## 外置 Supervisor

外置 `run-owner-workflow` 升级为持久 Supervisor。它不会读取或解释原始计划文件，而是循环调用控制桥：

```text
supervisor next → create | wait | notify | inspect | stop
supervisor ack  → 只回传 action id 与宿主观测值
```

- `create`：控制桥指定任务、Owner、绑定、提示和 profile；Supervisor 请求主 Harness 创建或 followup 已登记 Agent。
- `wait`：脚本等待当前批次，不超过配置上限；状态变化或超时才回传。
- `inspect`：连续无进展阈值后读取有限状态，生成确定性的恢复建议，不由 Supervisor 猜测业务结果。
- `notify`：将需要主编排者批准、手工解决或最终交付的事项转发回主会话。
- `stop`：仅在没有 active task 时允许。

Supervisor、Planner、Reviewer、Owner 与 Memory 角色在 `.owner-workflow/config.json` 中拥有独立 model/effort profile。并发上限由配置读取，不能由 Planner 为填满槽位而拆分任务。

## 任务生命周期与恢复

Workflow 状态：`active`、`completed`、`stopped`、`cancelled`。

Task 状态：`pending`、`running`、`completed`、`stopped`。`reserved` 是 `running + executorId=null` 的执行元数据，不是额外状态。

`stopped` 必须使用有限 reason/action 配对：`input_missing/provide_input`、`decision_required/await_user`、`task_failed/repair_task`、`thread_failed/replace_thread`、`plan_invalid/revise_plan`、`runtime_failed/retry_runtime`。未知值直接拒绝。

恢复只读取状态、lease、固定 commit、事件和 Agent 标识。原 Owner 可恢复时继续原 Agent、分支和 worktree；不能创建第二个同 Owner Agent。`failed`/`blocked` 表示准备恢复，因此保留现场、日志和分支。`cancelled` 只表示用户经原生问询明确放弃：停止派发且不执行最终合并，删除未合入的 Owner/workflow 临时分支、worktree 和未提交修改，只保留 Runtime 状态与日志。错误不能自动触发取消或创建替代 Workflow。

## 子图与重规划

尚未产生业务提交的 active work task 可以请求展开为 Composite 子 DAG。运行时保留父任务的外部依赖，将内部子任务、内部 Review 与 entry/exit 写入新 plan revision；后继继续依赖父任务。已有完成任务与固定提交不可被重写。

普通 handoff 或 Registry 变更触发局部 delta 重规划。runtime 明确要求对受影响任务执行 carry-forward 或 invalidate；旧 Review、验证和完成状态不会被静默沿用。

## Dashboard

Dashboard 固定绑定 `127.0.0.1:57357`。它仅读取 runtime 投影的 `progress.json` 与 `events.jsonl`，通过 SSE 推送任务级状态；不写 workflow、不调度 Agent、不执行命令。页面展示 DAG、任务状态、Owner、验证、handoff、lease、恢复和合并信息。

## 最终集成

所有任务完成后进行显式 Implementation Review。Review 固定 workflow HEAD；任何变更都会使其失效。通过后，finalize 尝试把已审查 workflow HEAD 合并到启动分支的最新 HEAD；若存在新提交，以临时预合并验证，冲突时保留全部 worktree、分支与状态，不声称交付成功。

## 测试与验收

新增或扩展自动化测试至少覆盖：

- Registry 提案、digest 审批、受管根限制、split/merge/transfer 和运行中拒绝修改。
- V2 DAG schema、环检测、任务依赖、显式 Review、验证绑定和 V1 拒绝继续。
- 固定 Owner 分支/worktree 的多任务同步、固定 SHA 预合并和最终清理。
- 验证 argv 不可篡改、失败阻断完成、沙箱 enforcement 与日志证据。
- Supervisor `create/wait/notify/inspect/stop`、无进展阈值、Agent 失败恢复、取消和 lease 抢占。
- Composite 子图、handoff delta、Review/验证失效。
- Dashboard 投影与 SSE 数据源，不把页面作为状态写入端。
- 当前 scope、链接、ignored 文件、memory、控制桥、恢复和子模块未修改的回归测试。

所有文档、提示词、日志摘要和用户可见错误使用中文。

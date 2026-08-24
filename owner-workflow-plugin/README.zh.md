# DeepSeek Harness Owner 工作流插件

这是主工程中的独立插件包。`deepseek-harness/` 仅作为上游代码子模块，本插件不修改子模块源码、目录、catalog 或 preset。插件通过 Harness profile 或本地 patch 加载，工作流状态写入业务项目的 `.dsh-workflow/`。

## 当前契约

- 代码写入只使用 `DSH_PLAN_V2`；没有 Quick 模式。
- 用户始终只与主代理沟通。需要实际执行但不修改仓库的任务使用独立 Operation；后台 Operator 不属于 Owner，通过 `operation_report` 把进展、问题、授权请求和结果返回当前主对话。
- Operation 不内置 ADB、Docker 或项目临时命令。Operator 使用通用 `operation_exec` 在文件只读沙箱中逐条执行一次性命令；多个检查不能用 `&&`、分号或管道拼接。可能改变设备、系统、网络或远程状态的单条命令必须通过主会话的 Harness 原生“拒绝/允许一次”授权卡片处理。
- 旧 V1 计划只允许查询和导出，不允许启动、调度、恢复、验证、合并或 finalize。
- Owner Registry 是 Git 跟踪的责任域真源。Registry 变化必须经过提案、精确 digest 审批和运行时应用，不能由规划器或 Owner 直接写入。
- Owner 是由代码本身决定的长期责任域：依据目录、模块、包、接口边界、依赖方向、稳定业务或技术职责以及可独立演进的文件集合。禁止按照当前 Workflow 的阶段、任务步骤、修复顺序、review/verify 角色、验证类型、临时需求名称或并行度目标创建、拆分或命名 Owner。Workflow 只能把 DAG task 路由给 Owner，不能反过来塑造 Owner。
- Owner 分析子代理只提交代码责任域建议。Owner 的设定、Registry 提案展示、用户原生问询和批准全部绑定创建该 Workflow 的主线程；其他会话、Owner、Planner、Reviewer 和 Runner 都不能代办。批准后 Runtime 才把 Registry 固定到项目基础分支，供后续 Workflow 复用。
- 内部 `workflowId` 只用于状态文件、锁、socket 和 worktree 隔离。新建 Workflow Git 分支不暴露随机 ID，格式为 `dsh/workflow/<日期>-<项目递增序号>-<需求摘要>`；Owner 分支格式为 `dsh/owner/<同一可读前缀>/<owner-id>`。项目递增序号由 Runtime 在受控锁内分配。
- 计划是任务级 DAG。节点使用 `dependsOn`，角色为 `work`、`review` 或 `verify`；任务必须绑定计划中的验证 ID，并声明 `priority`、`onFailure`、`onBlocked` 与 `onTimeout`。Runtime 只执行已经批准的策略，未覆盖的语义决策一律进入主会话 outbox。
- Owner 在每个 workflow 内固定使用一个 Owner 分支和一个 worktree。同一 Owner 的后续任务复用该现场；任务完成时固定 commit SHA，验证通过后立即合入 workflow HEAD。
- Owner Memory 采用可编译的两层模型：`当前 Memory` 是 Git 跟踪的简短中文能力说明；`临时 Memory` 是当前未完成 task 的完成、结论、下一步和阻塞记录。Owner 只能调用 `owner_memory_note` 追加临时 Memory，不能直写长期页面。
- 每个 task 在完成前必须由 Runtime 自动封存临时 Memory 为隐藏编译来源，再由受限 Memory Curator/Reviewer 增量更新当前 Memory 并提交 Git；封存或编译失败时 task 不能标记 `completed`。当前 Memory 只描述系统现在有效的能力，不记录日期、行号、提交 SHA、测试输出、审查过程或逐文件流水账。
- 确定性 Runner daemon 随 Harness 启动和停止，自动发现已登记工作区中 `approved` 或可恢复的 `running` Workflow。它只领取并执行控制桥 receipt：`create` 先形成持久 reservation，只有 runner 的 `execute` 才会启动 Harness 内的 Owner 子代理；`wait` 通过事件游标长等待，不读取或解释计划，不自行选择任务，也不调用模型。
- Web Harness 启动时会同时加载只读 Dashboard 路由 `/owner-workflow`，可切换查看开发 workflow 和后台 Operation；它只读取 Runtime 投影，不提供调度、写入、Git 或命令接口。
- 同一个静态客户端插件会在当前会话头部显示“等待 N”，并在侧边栏底部显示跨会话“主动等待 N”。两处列表共享 `/owner-workflow/api/waits`，直接投影 Operation 磁盘状态，不依赖模型维护，也不向 Harness 会话日志追加第三方事件。
- `failed`/`blocked` 保留现场供恢复；`cancel` 经用户原生问询明确同意后放弃本次工作，删除未合入的临时分支、worktree 和未提交修改，只保留 Runtime 状态与日志。
- 所有用户可见文本、提示词、日志摘要和文档使用中文；`deepseek-harness/` 保持零修改。

## 安装与启动

启动时按 Harness 来源选择：

```sh
cd /Users/admin/code/DSH-Workflow

# 固定 npm 上的 Harness 版本
./start-owner-workflow-npm.sh --version 0.1.0-rc.8

# 使用 deepseek-harness 子模块当前检出的、已构建版本
./start-owner-workflow-submodule.sh

# 或继续使用高级兼容入口
./start-owner-workflow.sh
```

npm 模式可用 `DSH_NPM_VERSION=<版本或 dist-tag>` 指定版本。子模块模式不读取原子模块旧的 `apps/cli/lib/bin.js`：它以子模块当前 commit 在主工程 `.dsh-harness-runtime/<commit>/` 创建独立依赖与构建缓存，再运行其中由该 commit 源码构建的 `apps/cli/lib/bin.js`；原子模块不会安装、构建、切换或写入。两个模式都会准备 `owner-workflow` preset，并通过本地 patch 注入当前插件源码。

npm 与独立子模块源码启动入口默认附加 `--no-open`，Harness 不会自动打开浏览器；如需恢复自动打开，设置 `DSH_WEB_OPEN=1`。

需要安装 bundle 时，在 Harness checkout 中执行：

```sh
dsh plugin --profile web add /Users/admin/code/DSH-Workflow/owner-workflow-plugin
dsh --profile web
```

从源码运行 Harness 时，可将 `dsh` 替换为 Harness 官方源码入口，仍然只把本插件加入 profile。

## 标准流程

主编排者使用单职责 `workflow_*` 工具；旧 `owner_workflow(action=...)` 只保留给历史会话兼容：

1. 只需要读取仓库并给出审计、分析或建议时使用 `workflow_audit`，不创建 workflow。
2. 需要实际执行但不修改仓库时，主代理将自然语言需求整理为目标、上下文、约束、完成标准和最小能力，调用 `operation_start`。Operator 在后台运行，用户不需要进入子线程。
3. Operator 返回 `need_input` 时，主代理在当前对话取得信息并调用 `operation_continue`；返回 `need_approval` 时，主代理立即调用 `operation_approve`。Harness 会在当前主对话显示包含动作、风险和精确命令的原生授权卡片，用户点击“允许一次”后才恢复同一个 Operator。普通文本与 `ask_user_question` 不能产生授权。Operator 会主动回报；`operation_status` 只用于用户明确查询或恢复中断现场，不能轮询。使用 `operation_cancel` 取消。
   Operation 活动期间，当前会话头部会显示“等待 N”；侧边栏底部的全局列表会按会话分组显示所有等待事项。列表状态包括“等待后台 Operator”“等待用户补充信息”和“等待用户授权决定”。
4. 需要改代码时先使用 `workflow_preflight`。它返回当前 Git 基线、未提交改动与 `baseDigest`；只有 `canStart=true` 时，才能将同一个摘要传给 `workflow_start`。这一步不会自动提交、暂存、丢弃或掩盖既有改动；子模块内部脏改动必须由用户先处理。
5. `workflow_start` 从预检基线创建 workflow 分支，并让规划子代理返回 `DSH_PLAN_V2`、Owner 定义、验证定义和任务 DAG。
   计划中的 `owners` 只选择 Owner ID；Runtime 从正式 Registry 确定性注入完整 Owner 定义，再校验任务写入范围。Planner 的描述改写或 scope 扩大不会成为权限来源。
   如果规划子代理连续两次提交都不满足契约，工具返回 `DSH_WORKFLOW_PLANNING_FAILED_V1`，其中包含真实 `workflowId`、错误、失败次数和 `recoverable`。可恢复时必须对同一个 ID 调用 `workflow_recover`，不能重新创建 Workflow；达到有界上限后才交给用户决定。
6. 如果规划结果包含 Registry 变化，先使用 `workflow_owner_change_propose` 生成提案和 digest，随后立即调用 `workflow_owner_change_approve`。该工具自行显示 Harness 原生“同意/不同意/自定义输入”问询；只有明确选择“同意”才应用提案，自定义输入只作为修改意见。
7. 使用 `workflow_plan_review` 执行独立计划审查；需要修改时使用 `workflow_plan_revise`，审查通过后立即调用 `workflow_plan_approve`。该工具用同样的原生问询固定 `plan_digest` 和 `registry_digest`，不再要求用户复制批准口令。
   计划 Reviewer 必须通过内部 `workflow_plan_review_submit` 提交结构化结果，状态仅允许 `passed` 或 `needs_revision`；首次契约错误由 Runtime 自动携带错误重试一次。计划审查默认最多允许三轮修订，每次修订都会归档对应审查、废止旧摘要的审查与批准，并要求重新独立审查。计划工具会返回可直接调用的 `nextTool` 与 `nextArgs`，主编排者不得自行改写。达到上限后 Runtime 会确定性要求调用 `workflow_plan_revision_extend`；该工具显示原生“同意/不同意/自定义输入”问询，只有用户同意才为当前 Workflow 增加一组额度并继续 `workflow_plan_revise`。不得调用 `workflow_recover`、取消或重新创建 Workflow；`maxPlanRevisionTurns` 也不是 `workflow_start` 自然语言需求可以设置的字段。
   修订候选连续两次不满足 V2 契约时返回 `DSH_WORKFLOW_PLAN_REVISION_FAILED_V1`，保留上一版计划、Reviewer 结果和成功修订额度；可恢复时只能重试同一个 Workflow，不能取消或重新创建。修订成功后的重复调用返回 `DSH_WORKFLOW_PLAN_REVISION_SKIPPED_V1`，并确定性指向重新审查。
8. 计划批准后 Runner daemon 自动接管，不需要手工运行脚本。`workflow_plan_approve` 首先返回 `runner.status=queued`；此时只能说明“已排队”，等待 Workflow 进入 `running` 后才能说明 Owner 正在执行。需要临时禁用自动 Runner 时，可在启动 Harness 前设置 `DSH_OWNER_WORKFLOW_RUNNER=0`；`run-owner-workflow.sh --workflow-id wf-...` 仅保留为诊断兼容入口。

9. 会话头部和侧边栏“主动等待”会显示未执行、执行中、等待依赖、等待用户决定和 Runner 离线状态；`/owner-workflow` Dashboard 同时显示任务统计。用户明确查询时也可以使用 `workflow_status` 或 `workflow_supervisor_status`。所有任务完成后依次执行 `workflow_implementation_review` 和 `workflow_finalize`。

`workflow_git_inspect` 只提供受限 `status`、`diff` 与 `log` 证据，不读取 `.git` 内部文件或执行任意 Shell。计划批准、任务调度和最终集成均由运行时裁决；主会话不直接修改业务文件。

后台 Operator 默认继承主代理的 provider/model。需要使用低成本模型时，在启动 Harness 前设置：

```sh
DSH_OWNER_WORKFLOW_OPERATION_MODEL=<模型编号> \
DSH_OWNER_WORKFLOW_OPERATION_PROVIDER=<可选 provider> \
./start-owner-workflow-submodule.sh
```

Operation 当前支持 `project-read`、`shell`、`web`、`skills` 与按安装情况解析的 `computer-use` 能力。Runtime 只把执行契约要求且实际存在的工具交给 Operator；Operator 不能创建子代理、调用 Owner 工具或扩大能力。

## 计划最小形态

`DSH_PLAN_V2` 必须声明 Registry digest、固定验证 argv、可选受限仓库相对 cwd、任务依赖和执行策略。新的 Flutter 验证必须显式声明 Flutter 包根 cwd；不能依赖运行时猜测。示例：

```json
{
  "contract": "DSH_PLAN_V2",
  "registryDigest": "<64 位 digest>",
  "summary": "实现用户网络接口",
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
      "done": ["中文验收条件"],
      "priority": 100,
      "onFailure": { "action": "repair_owner", "maxAttempts": 2 },
      "onBlocked": { "action": "handoff_replan" },
      "onTimeout": { "action": "notify_main", "afterMs": 1800000 }
    }
  ]
}
```

运行时会校验 schema、DAG 环、Owner scope、验证引用、Registry digest 和固定 gate。`cwd` 不能是绝对路径、越界路径或通配符路径；它与 argv 一起持久化为验证证据。验证工具只接受当前任务已绑定的 `verification_id`，不接受模型临时传入的命令、工作目录或额外参数。所有必需验证必须在当前内容版本通过，任务才可完成。

已批准的旧计划若缺少 Flutter `cwd`，仅可在运行时从受控 task.write、固定 `flutter test test/...` 目标和唯一存在的 `pubspec.yaml` 共同推导包根；没有候选或存在多个候选都会 fail-closed。该过渡分支不会用于新计划，也不会扫描或猜测任意目录。

## Owner Registry

正式 Registry 位于 Git 跟踪的：

```text
.owner-workflow/
├── config.json
└── owners/
    └── <owner-id>.md
```

Owner 文档包含中文说明和规范化前置元数据，例如：

```markdown
---
registry: {"description":"负责用户网络接口","id":"network-user","name":"用户网络模块","parentOwnerId":null,"scope":["src/network/user/**"],"status":"active"}
---
# 用户网络模块

负责用户网络接口。
```

新增、移除、拆分、合并、转交和 scope 变化都走 `owner_change_propose` → `owner_change_approve` 原生问询。问询提供“同意”“不同意”和自定义输入；只有明确同意才应用 digest 对应提案。运行中存在受影响的 reserved 或 running task 时，Registry 变化会被拒绝；应用后旧计划、审查和验证绑定失效。Runtime 在重新规划前把批准后的 Registry 单独提交到 workflow 分支，确保后续 Owner 分支和最终交付都包含同一份责任域定义。

Registry 批准后还会立即以独立提交固定到项目启动分支；它不依赖功能 Workflow 最终交付。功能 Workflow 即使取消，后续 Workflow 也会直接读取并复用这些 Owner 定义，只重新创建本次 Owner 子线程、分支和 worktree。旧版本遗留在 Workflow 分支中的已批准 Registry 会在继续审查、修订、批准、启动 Supervisor，或下一次 `workflow_start` 创建分支之前迁移到项目启动分支；若基础分支已有不同的非空 Registry，则拒绝自动覆盖。

## 固定现场与合并

一次 workflow 使用：

```text
dsh/workflow/<日期>-<项目递增序号>-<需求摘要>
dsh/owner/<日期>-<项目递增序号>-<需求摘要>/<owner-id>
.dsh-workflow/worktrees/<workflow-id>/owners/<owner-id>
```

每次派发同一 Owner 前，运行时确认前一任务已经结算、Owner worktree 干净，并将 Owner 分支快进到 workflow HEAD。每个任务创建一个短期 Harness 子代理；它在独立 Owner worktree 中继承正常开发工具和 `workspace-write`，可以读取整个仓库。Owner 长期连续性由启动时注入、完成后沉淀的 `.owner-memory` 提供，不依赖永久子线程。

这些短期子线程通过插件注册的正式 one-shot Subagent provider 创建。Harness 自己生成并持久化版本匹配的 `subagent/descriptor`，每个 run 结束后立即 dispose 运行资源；历史记录仍可审计，但会显示为已结束的一次性子代理，而不是“会话记录损坏”。旧版本已经产生、仅缺 descriptor 的诊断记录不会自动改写或删除。

Owner 子代理的原生授权策略固定为 `never`，不会在隐藏子线程中等待用户。普通 Shell 因为必须访问 worktree 外的共享 SDK、编译器或缓存而被沙箱拒绝时，Owner 使用 `owner_host_exec` 原样提交命令、worktree 内工作目录和中文理由。Harness 授权卡片显示在创建 Workflow 的主对话；只有用户选择“允许一次”后，Runtime 才以宿主权限执行这条完全相同的命令一次。直接在 `bash`/`pwsh` 中设置 `sandbox_permissions`、目录越过 Owner worktree、拒绝、取消、授权通道不可用或 Owner 绑定失效都会确定性停止，且不会执行命令。

### Owner Memory 编译

Memory 的可靠性由插件 Runtime 保证，Skill 只用于固定主代理、Owner 和 Memory 子代理的操作规范。一次 task 的流程为：

```text
当前 Memory 注入 Owner → Owner 用 owner_memory_note 记录简短临时进展
→ owner_submit 固定代码提交 → Runtime 封存临时日志 → Memory Curator 生成受限提案
→ Reviewer/格式校验 → 提交当前 Memory → task completed
```

`.owner-memory/owners/`、`interfaces/`、`concepts/` 与 `decisions/` 中的页面是人可读的当前知识；隐藏的 `.owner-memory/.sources/` 仅保存每次任务的简短封存日志，供后续重新编译使用，不会注入给 Owner。隐藏 `.catalog.json` 保存来源、时效和替代关系等机器元数据，避免把审计字段塞进可读 Markdown 页面。

`owner_submit` 的正式固定验证不依赖 Owner 主动调用授权工具。`workspace-write` 明确拒绝固定命令后，Runtime 自动把完整 verification ID 和命令路由到主代理的原生授权卡片；允许一次后在独立快照中精确重试。若后台 Runner 派发时主代理没有开放回合，提交关卡自动结算为 blocked、保留 worktree，并要求主对话恢复同一 Workflow/task/Owner。若授权后的命令已经执行但退出码非 0，Runtime 会持久化有界 stdout/stderr、把证据返回同一 Owner，并拒绝将其误报为 blocked；Owner 必须修复后重新提交。

Owner 完成时调用唯一的 `owner_submit` 提交关卡。运行时自动执行固定验证，根据真实 Git diff 检查 scope、链接和受保护路径，再生成并固定 commit SHA；复制验证快照时原样保留相对符号链接，Git 忽略文件不会进入提交，因此不作为 Owner 越界。越界时 Owner 在同一短期子线程调整后重试，或创建 handoff。任务通过后立即把固定 SHA 合入 workflow。出现冲突或审计失败时保留现场，不宣称任务或交付成功。最终 `implementation_review` 固定 workflow HEAD；`finalize` 再尝试把已审查 HEAD 合入启动分支的最新 HEAD。

`needs_repair` 不能作为 `owner_submit` 的终态：提交关卡会要求当前短期子线程继续调整，避免留下脏现场后再进入恢复循环。对于旧版本已经留下的合法未提交修改，恢复流程不会先执行覆盖式 `owner-sync`，而是在相同 Owner worktree 中创建新的短期子线程继续处理；通过提交关卡后再与最新 workflow HEAD 合并。

## Supervisor 与 Dashboard

Runner daemon 随 Harness 生命周期运行，通过本地控制桥执行受控 receipt，并自动为目录表中的获批 Workflow 启动独立确定性 runner。Runtime 仍是 DAG、scope、lease、验证、Git 与状态的唯一权威；runner 不会在确认 `create` 后由 Runtime 隐式派发 Owner，而是继续显式发送 `supervisor-execute`。daemon 与 runner 都不是 Agent，不调用 LLM。

| receipt / 控制动作 | 责任 |
| --- | --- |
| `create` → `supervisor-ack` | Runtime 持久化不可伪造的 Owner reservation，不会隐式启动 Owner |
| `supervisor-execute` | runner 显式执行 reservation；重复请求幂等，重启后由 `supervisor-recover` 重新领取 |
| `wait` → `supervisor-await-event` | 基于持久事件游标长等待；超时只记录一次受控观察，不再快速 `next → ack` 轮询 |
| `notify` → main outbox | Runtime 持久化主会话通知；runner 输出通知后显式确认，未确认项会在下次启动时保留 |
| `inspect` | 在连续无进展时读取有限状态并请求确定性恢复观测 |
| `stop` | 没有 active task 时停止 Supervisor；不猜测业务结果 |

runner 默认每次等待 30 秒；可以使用 `--event-wait-ms 60000` 调整到最多 60 秒。主会话通知保存在 workflow state 的 `mainOutbox`，并由等待列表投影为“等待用户决定”；runner 日志仍保留诊断摘要，因此 Harness 主会话临时不可用时不会丢失决策请求。

启动 Web Harness 后，在浏览器访问：

```text
http://127.0.0.1:3080/owner-workflow
```

该页面随 Harness 进程启动和关闭。Runtime 会把实际业务工作区登记到启动目录中的安全目录表；页面先用 opaque workspace ID 选择工作区，再切换“开发 Workflow”和“后台 Operation”。同一宿主还提供 `/owner-workflow/api/waits`：静态客户端每秒刷新一次，将活动 Operation 按父会话投影到会话头部和侧边栏。磁盘状态是唯一权威来源，页面刷新或 Harness 重启后可重新构建列表；接口不会暴露本地路径或等待批准的原始命令。当前 Harness 没有第三方插件可直接注册的主界面顶部 Tab，因此完整 DAG 入口仍是同一 Web Server 的独立 Dashboard 页面，不修改上游子模块。

原有独立只读 Dashboard 仍保留，适合仅观察某一个 workflow：

```sh
./run-owner-workflow.sh --dashboard --workflow-id wf-... --port 57357
```

`--dashboard` 只启动 `127.0.0.1:57357` 的只读 HTTP/SSE 服务；它不写 workflow、不调度 Agent、不执行验证。两种 Dashboard 的状态来源都是运行时投影，而不是页面输入。

## 取消、恢复与迁移

`failed` 或 `blocked` 表示仍准备恢复，原 Owner/workflow 分支、worktree 和未提交修改都会保留。恢复只读取状态、lease、固定 SHA、事件和 Agent 标识，不能为同一 Owner 创建第二个并行 Agent。Owner 恢复时会清除该任务旧的超时结论，并以本次 Owner 运行时间作为新的 `onTimeout` 基线；旧 reservation 的历史 `launchedAt` 不能让刚恢复的任务立即进入 `blocked`。

`action=cancel` 只表示用户明确放弃当前 Workflow。工具会先显示 Harness 原生“同意/不同意/自定义输入”问询；同意后停止后续派发，不执行最终合并，删除尚未合入启动分支的 Owner/workflow 临时分支、worktree 和其中的未提交修改，只保留 Runtime 状态、事件日志和 Dashboard 历史。规划、审查、验证、工具或模型错误不得触发自动取消和重建。

历史计划不自动猜测任务依赖、Owner 范围或验证。请参阅 [V2 迁移说明](../docs/OWNER-WORKFLOW-V2-MIGRATION.md)；技术边界见 [技术路线](../docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md)。

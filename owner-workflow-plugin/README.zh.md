# DeepSeek Harness Owner 工作流插件

这是主工程中的独立插件包。`deepseek-harness/`、`dsh-synapse/` 与 `vendor/dsh-approve-for-me/` 都是固定 commit 的只读上游子模块，本插件不修改它们的源码。启动脚本把 Owner Workflow 与 Synapse Web 插件加载到同一个 Harness Web 进程；工作流状态写入业务项目的 `.dsh-workflow/`。

## 当前契约

- 主线程可以直接保存 Matt 讨论、ADR、Spec、Ticket 和进度文档，无需先启动 DAG；路径范围、工具边界和验证见[主线程文档权限](../docs/ORCHESTRATOR-DOCUMENTS.md)。
- 代码写入只使用 `DSH_PLAN_V2`；没有 Quick 模式。
- `workflow_start` 会启动一个可续接 Plan Agent。纯脚本 Runner/Runtime 状态机在持久修订预算内驱动首次规划、Registry 批准后的重新规划以及有界自动修订；独立 Reviewer 每轮仍保持一次性只读审查。主会话只接收完整 Registry 批次或最终计划的原生批准请求，以及达到确定性恢复上限后的明确失败回报。
- 同一个 Git 项目同一时间只允许一个未结束 Workflow。Workflow 绑定一棵以创建会话为根的 DSH 会话树；其他普通 fork 只用于讨论，同一 Workflow 内的 DAG 仍可并行多个 Owner task。
- 普通讨论不会自动进入 DAG。只有用户明确要求“加入当前 Workflow”“更新 DAG”“并行”或“新增前置”时才保存 Intent；保存后 Harness 会明确询问“现在重新规划 / 继续讨论”，后者不会唤醒 Planner。
- 用户始终只与主代理沟通。需要实际执行但不修改业务文件的任务使用独立 Operation；它不要求 Git 仓库：Git 工作区使用仓库根，非 Git 目录使用当前会话工作目录。同一工作区同时只允许一个未结束 Operation，对应一个可续接 Operator 子线程。重复启动只返回当前 Operation，不创建第二个子线程。
- Operation 不内置 ADB、Docker 或项目临时命令。公开网页与官方文档使用继承的 `web_search`/`web_fetch`；`curl`/`wget` 继续按外部命令要求人工授权，不能作为逐 URL 文档查询的替代路径。Operator 使用通用 `operation_exec` 逐条执行一次性命令；多个检查不能用 `&&`、分号、后台符号、管道、反引号或命令替换拼接。Operation 专用审批插件先匹配用户在本次主会话明确放行的字面前缀；未命中时先执行 Operation 的显式人工风险门禁，再复用 `dsh-approve-for-me` 的固定风险、配置白名单和可选无工具模型复核。自动通过只允许当前精确命令一次；其余请求会持久化并把同一个 Operator 会话置为可续接等待，不会把正常等待显示成子代理异常中断。主代理只能选择显示原生授权卡片、拒绝当前命令并原子改向，或取消 Operation，不能同时发起普通问询。Operation 不监听标准 `approval/request`，不会接管主代理的 Bash/PowerShell；主代理仍使用独立安装的 `dsh-approve-for-me`。问询提供“仅允许这一次/拒绝”，存在最小 `approval_prefix` 时增加“本次会话允许此前缀”，并允许在“其他”中输入更窄前缀。会话前缀只保存在当前进程，主会话结束或 Harness 重启后失效。Operation 默认在连续 2 条命令失败、3 次人工授权请求或运行 15 分钟后停止启动新命令，要求 Operator 基于已有证据收尾。Operation 终态仍会释放驻留资源并通过 Workspace Registry 归档持久会话，状态和事件继续保留供审计。
- 旧 V1 计划只允许查询和导出，不允许启动、调度、恢复、验证、合并或 finalize。
- Owner Registry 是 Git 跟踪的责任域真源。Planner 必须把同一轮发现的全部 Registry 变化合并成一个 `batch` 提案；主线程只显示一张包含所有子操作、before/after 和精确 digest 的审批卡片，明确同意后由 Runtime 原子应用，不能由规划器或 Owner 直接写入。
- Owner 是由代码本身决定的长期责任域：依据目录、模块、包、接口边界、依赖方向、稳定业务或技术职责以及可独立演进的文件集合。禁止按照当前 Workflow 的阶段、任务步骤、修复顺序、review/verify 角色、验证类型、临时需求名称或并行度目标创建、拆分或命名 Owner。Workflow 只能把 DAG task 路由给 Owner，不能反过来塑造 Owner。
- Owner 分析子代理只提交代码责任域建议。Owner 的设定、Registry 提案展示、用户原生问询和批准全部绑定创建该 Workflow 的主线程；其他会话、Owner、Planner、Reviewer 和 Runner 都不能代办。批准后 Runtime 才把 Registry 固定到项目基础分支，供后续 Workflow 复用。
- 内部 `workflowId` 只用于状态文件、锁、socket 和 worktree 隔离。新建 Workflow Git 分支不暴露随机 ID，格式为 `dsh/workflow/<日期>-<项目递增序号>-<需求摘要>`；Owner 分支格式为 `dsh/owner/<同一可读前缀>/<owner-id>`。项目递增序号由 Runtime 在受控锁内分配。
- 计划只有一份可递归的任务级 DAG，不另建 Roadmap。高层节点可以先标记为 `decomposition.status=abstract`，再根据 Reviewer 结论和 Owner 会诊递归展开；只有 `leaf` 节点需要精确 `write` 与固定验证，含 abstract 节点的 DAG 不能批准执行。节点使用 `dependsOn`，角色为 `work`、`review` 或 `verify`，并声明 `priority`、`onFailure`、`onBlocked` 与 `onTimeout`。Runtime 只执行已经批准的策略，未覆盖的语义决策一律进入主会话 outbox。
- 规划期会让相关长期 Owner 作为只读顾问参与拆分。每个 Owner 只能结合自己的设定、scope、长期记忆和仓库事实提供约束、依赖、handoff 和验证建议；Planner 仍是唯一 DAG 修改者，Owner 会诊不能改 Registry、计划或代码。
- Owner 在每个 workflow 内固定使用一个 Owner 分支和一个 worktree。同一 Owner 的后续任务复用该现场；任务完成时固定 commit SHA，验证通过后立即合入 workflow HEAD。
- Owner Memory 采用可编译的两层模型：`当前 Memory` 是 Git 跟踪的简短中文能力说明；`临时 Memory` 是当前未完成 task 的完成、结论、下一步和阻塞记录。Owner 只能调用 `owner_memory_note` 追加临时 Memory，不能直写长期页面。
- 未最终有效或仍处于“待检查”的结果只追加 Runtime 临时 Memory，不封存、不修改或编译长期 Memory。任务按最新 DAG 验证有效后，Runtime 先把原始 worklog 封存进 Git，再由受限 Memory Curator/Reviewer 增量更新当前 Memory。摘要失败不会撤销已核验代码：封存提交、worklog digest、源文件 digest 和固定代码 SHA 会随 deferred 结果持久化；fresh Runtime 重收同一 `owner-finish` 时只重试摘要，来源缺失或漂移则明确失败且不补造历史。
- 集中验收使用包导出的`./acceptance-runner`，把planning snapshot、plan、代码commit、内容digest、Spec和Ticket固定到同一候选。独立验证在其他项失败后继续收集；真实依赖失败的项标记blocked。Node test入口分别记录失败、超时、取消、跳过、未运行、零用例、计数不明和候选漂移，只有非零用例且证据绑定完整的结果可通过；这不会放宽Owner提交关卡。
- 确定性 Runner daemon 随 Harness 启动和停止，通过本机 Leader lease、递增 generation 和 fencing token 保证全局只有一个执行者。每次规划恢复、规划决定投递或执行都写入 `.dsh-workflow/runner/attempts/`，重启时先把旧 `running` attempt 结算为 `interrupted`，再从 Workflow 真源重新发现；每个 Workflow 只保留最近 100 个 attempt。多个卡住的 `planned` Workflow 并发发送受限控制动作，不会因为单个 LLM 或控制桥变慢而阻塞全局扫描；Harness 离线或 Provider 异常时按错误类别指数退避。修订预算耗尽会原子持久化为 `awaiting_revision_extension`、main outbox 与 Runner 可发现通知，直接在根会话显示原生额度决定；批准后 Runtime 自动恢复同一 Planner。问询也允许终止自动规划并退回主线程讨论：Runtime 保留现场、启动只读总结子代理，并把现状与不收敛原因返回根会话，不会把终止误当作取消 Workflow。Runner 不读取计划语义、不直接修改 Workflow 状态，也不自行调用模型。计划批准后才领取 Supervisor receipt：`create` 先形成持久 reservation，只有 runner 的 `execute` 才会启动 Harness 内的 Owner 子代理；`wait` 通过事件游标长等待，不自行选择任务。
- Web Harness 启动时会同时加载只读 Dashboard 路由 `/owner-workflow`，可切换查看开发 workflow 和后台 Operation；它只读取 Runtime 投影，不提供调度、写入、Git 或命令接口。
- 静态客户端提供统一“运行状态”：首个“需要处理”Tab 合并 Runtime 待处理项与 Harness 原生 `pendingInteraction`，随后是“总览 / 主线程 / 子代理”。子代理在同一 Tab 内按 Planner/Reviewer、Owner、Operation 与交付审查分组；状态直接来自 Workflow、Runner daemon 与 Harness `agent/status`，不是 LLM 摘要。侧栏入口、工作区入口与 Synapse 浮层都只显示当前 Workspace 中当前 Session 谱系的活动状态；已归档、已删除、已不在 Session 列表或已经终结的旧状态不会混入当前视图。
- `failed`/`blocked` 保留现场供恢复；`cancel` 经用户原生问询明确同意后放弃本次工作，删除未合入的临时分支、worktree 和未提交修改，只保留 Runtime 状态与日志。
- 所有用户可见文本、提示词、日志摘要和文档使用中文；`deepseek-harness/` 只新增通用的 `sidebar.workspace.action` 列表 slot，运行状态业务仍由本插件拥有。

## 安装与启动

首次克隆必须初始化固定子模块：

```sh
git clone --recurse-submodules <本项目地址>
# 已经克隆时：
git submodule update --init --recursive
```

启动前会核对三个子模块的 gitlink、初始化状态和内部脏改动；任一不匹配都会拒绝启动。上游升级只能显式更新父仓库中的 gitlink，不能在子模块里直接开发。

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

npm 模式可用 `DSH_NPM_VERSION=<版本或 dist-tag>` 指定版本。子模块模式直接使用当前检出的 `deepseek-harness/`：首次启动或子模块 commit 变更后，会在其忽略路径中安装依赖、构建 CLI 与 Web 产物，再运行该子模块的 `apps/cli/lib/bin.js`；不会修改受版本控制的子模块文件。两个模式都会准备 `owner-workflow` preset，并通过本地 patch 注入当前插件源码。

npm 与独立子模块源码启动入口默认附加 `--no-open`，Harness 不会自动打开浏览器；如需恢复自动打开，设置 `DSH_WEB_OPEN=1`。

子模块入口也支持直接使用同一 commit 构建出的 DSH CLI 管理 profile 插件。该模式只执行 CLI，不启动 Web、Owner Workflow Runner 或本地临时 patch：

```sh
./start-owner-workflow-submodule.sh plugin --profile web add dsh-approve-for-me@latest
```

需要安装 bundle 时，在 Harness checkout 中执行：

```sh
dsh plugin --profile web add /Users/admin/code/DSH-Workflow/owner-workflow-plugin
dsh --profile web
```

从源码运行 Harness 时，可将 `dsh` 替换为 Harness 官方源码入口，仍然只把本插件加入 profile。

## 标准流程

主编排者使用单职责 `workflow_*` 工具；旧 `owner_workflow(action=...)` 只保留给历史会话兼容：

1. 只需要读取仓库并给出审计、分析、计划或建议时使用 `workflow_audit`。它先保持只读；审计完成后在当前主会话显示“立即开始实施 / 仅保留计划 / 自定义意见”原生问询。等待选择期间进入运行状态的“需要处理”，不能静默显示为 0；只有选择立即实施才由同一工具自动执行 `workflow_preflight → workflow_start`。
2. 需要实际执行但不修改仓库时，主代理将自然语言需求整理为目标、上下文、约束、完成标准和最小能力，调用 `operation_start`。Operator 在后台运行，用户不需要进入子线程。
3. Operator 返回 `need_input` 时，主代理在当前对话取得信息并调用 `operation_continue`。`operation_exec` 需要扩大只读沙箱时，专用审批插件先检查本次会话前缀，再复用当前 Profile 中 `approve-for-me` 设置的固定风险、白名单和可选模型复核；通过时只自动执行当前精确命令一次。未通过时 Operator 返回 `need_approval`。主代理调用 `operation_approve` 显示原生授权卡片；若需要改变方向，则调用 `operation_continue(reject_pending_approval=true)` 原子拒绝待授权命令并续接同一个 Operator；也可调用 `operation_cancel`。这三个动作只能选择一个，不能再并发普通问询。Harness 会在当前主对话显示包含动作、风险、精确命令和可选前缀的原生多选项问询；只有用户明确选择“仅允许这一次”或“本次会话允许此前缀”才产生授权。Operator 会主动回报；`operation_status` 只用于用户明确查询或恢复现场，不能轮询。
   Operation 活动期间，当前会话头部会显示“等待 N”，对应工作区行会显示该工作区的收件箱入口；侧边栏底部的总收件箱按“工作区 → 会话”显示所有等待事项。列表状态包括“等待后台 Operator”“等待用户补充信息”和“等待用户授权决定”。
4. 需要改代码时先使用 `workflow_preflight`。它返回当前 Git 基线、未提交改动与 `baseDigest`；只有 `canStart=true` 时，才能将同一个摘要传给 `workflow_start`。这一步不会自动提交、暂存、丢弃或掩盖既有改动；子模块内部脏改动必须由用户先处理。
5. `workflow_start` 从预检基线创建 workflow 分支，并启动可续接 Plan Agent。Runtime 先让相关 Owner 结合各自设定和长期记忆只读会诊，再让 Planner 生成一份可递归 `DSH_PLAN_V2` DAG，并调用独立 Reviewer 审查；主会话不得手工串联 `workflow_recover`、`workflow_plan_review` 或 `workflow_plan_revise`。
   计划中的 `owners` 只选择 Owner ID；Runtime 从正式 Registry 确定性注入完整 Owner 定义，再校验任务写入范围。Planner 的描述改写或 scope 扩大不会成为权限来源。
   Plan Agent 或内部 Reviewer 失败时，Runtime 先按 failure class 自动切换诊断、会诊、仲裁或替代实现；主会话只接收状态，不承担工程修复。只有真正需要外部授权时才等待用户决定。
6. 如果规划结果包含 Registry 变化，Plan Agent 会持久化提案并主动回报摘要。主会话只使用回报中的 digest 调用 `workflow_owner_change_approve`；该工具自行显示 Harness 原生“同意/不同意/自定义输入”问询。批准后同一个 Plan Agent 自动继续重新规划。
7. Runtime 自动执行独立计划审查。首次审查一次性冻结有限 Evidence Obligations；后续只能关闭这些义务，没有新的 Runtime facts 时不能新增问题或换标题重提。纯脚本 Runner 根据证据是否增加、义务是否减少自动选择局部子图改写、只读诊断、Owner 会诊、独立仲裁或替代实现；修订次数只作遥测，不决定继续或停止。
   `needs_decision` 不再默认退回用户：工程和架构问题先由 Owner 会诊与 Arbiter 裁决。只有凭据、真实设备、费用、生产发布、不可逆外部操作或原始 Intent 无法决定的产品权限才请求用户。所有自治策略均未产生新证据时保存 checkpoint 与 `autonomousIncident`，不要求用户处理工程问题。审查通过后 Runtime 主动回报 `plan_digest` 和 `registry_digest`，主会话才调用 `workflow_plan_approve`。
8. 计划批准后 Runner daemon 自动接管，不需要手工运行脚本。默认 catalog 位于 `${DSH_HOME}/owner-workflow`，不同工作区和 Harness 窗口复用同一个持久 Leader；启动器会校验 runner 源码摘要，版本变化时先停止旧 Leader，再启动新版本。`DSH_OWNER_WORKFLOW_CATALOG_ROOT` 可显式改址，`DSH_OWNER_WORKFLOW_RUNNER_PERSIST=0` 仅用于测试或希望随当前 Harness 退出的临时运行。`workflow_plan_approve` 首先返回 `runner.status=queued`；此时只能说明“已排队”，等待 Workflow 进入 `running` 后才能说明 Owner 正在执行。需要临时禁用自动 Runner 时，可在启动 Harness 前设置 `DSH_OWNER_WORKFLOW_RUNNER=0`；`run-owner-workflow.sh --workflow-id wf-...` 仅保留为诊断兼容入口。

9. 执行期间可以在同一会话树的任意普通讨论分支明确提交 `workflow_intent_submit`。工具保存 Intent 后显示“现在重新规划 / 继续讨论”原生问询；只有前者会调用一次 Planner。候选依次经过 `workflow_revision_review` 和根会话中的 `workflow_revision_approve`。不可变版本只保存 `number`、`parent`、`planDigest` 和完整 `DSH_PLAN_V2` 快照。
   Revision 切换时，无关任务继续有效；新增前置、验证、需求变化或 write 扩大允许旧运行自然结束并合入，但结果先标记“待检查”，新增依赖完成后重新执行固定验证。Owner 变化、任务删除、write 收窄或 Registry 权限变化会立即中止旧运行，旧结果不合入。
10. 运行状态会分别显示 Runner、Workflow、主线程和全部子代理的确定性生命周期；只有授权、输入、Workflow 决策和明确故障进入“需要处理”。点击条目返回请求产生的会话。`/owner-workflow` Dashboard 同时显示任务统计。用户明确查询时也可以使用 `workflow_status` 或 `workflow_supervisor_status`。所有任务完成并且不存在“待检查”结果后，依次执行 `workflow_implementation_review` 和 `workflow_finalize`。

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
    └── <owner-id>/
        ├── owner.md
        └── memory/
```

每个 Owner 的 `owner.md` 包含中文说明和规范化前置元数据，长期知识保存在同级 `memory/`，例如：

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

每次派发同一 Owner 前，运行时确认前一任务已经结算、Owner worktree 干净，并将 Owner 分支快进到 workflow HEAD。每个任务创建一个短期 Harness 子代理；它在独立 Owner worktree 中继承正常开发工具和 `workspace-write`，可以读取整个仓库。Owner 长期连续性由启动时注入、完成后沉淀的 `.owner-workflow/owners/<owner-id>/memory` 提供，不依赖永久子线程。

这些短期子线程通过插件注册的正式 one-shot Subagent provider 创建。Harness 自己生成并持久化版本匹配的 `subagent/descriptor`，每个 run 结束后立即 dispose 运行资源；历史记录仍可审计，但会显示为已结束的一次性子代理，而不是“会话记录损坏”。旧版本已经产生、仅缺 descriptor 的诊断记录不会自动改写或删除。

Owner 子代理使用 `workspace-write + ask`，但插件在 Owner 会话的 `approval/request` waterfall 前设置严格门禁：只有 Runtime 当前登记的 `owner_host_exec` 或固定验证请求可以继续到 Harness UI，模型通过普通 Shell 直接申请的其他升级会被确定性拒绝。授权卡片显示在当前 Owner 任务现场；运行状态的“需要处理”负责发现并跳转，主会话不代答。只有用户选择“允许一次”后，Runtime 才执行卡片中的同一精确命令一次。

### Owner Memory 编译

Memory 的可靠性由插件 Runtime 保证，Skill 只用于固定主代理、Owner 和 Memory 子代理的操作规范。一次 task 的流程为：

```text
当前 Memory 注入 Owner → Owner 用 owner_memory_note 记录简短临时进展
→ owner_submit 固定代码提交 → 若仍“待检查”，只保留临时日志
→ 最新 DAG 的依赖与固定验证全部通过 → Runtime 封存最终日志
→ Memory Curator 生成受限提案 → Reviewer/格式校验 → 提交当前 Memory → task 最终有效
```

每个 `.owner-workflow/owners/<owner-id>/memory/` 中的页面是该 Owner 人可读的当前知识；其中隐藏的 `.sources/` 仅保存每次任务的简短封存日志，供后续重新编译使用，不会注入给 Owner。相邻 `.catalog.json` 保存来源、时效和替代关系等机器元数据，避免把审计字段塞进可读 Markdown 页面。

`owner_submit` 的正式固定验证不依赖 Owner 主动调用授权工具。`workspace-write` 明确拒绝固定命令后，Runtime 自动把完整 verification ID 和命令登记为当前 Owner 现场的原生授权请求；允许一次后在独立快照中精确重试。若当前 Owner 没有开放回合，提交关卡保留 worktree，恢复同一 Workflow/task/Owner 后重试。若授权后的命令已经执行但退出码非 0，Runtime 会持久化有界 stdout/stderr、把证据返回同一 Owner，并拒绝将其误报为授权阻塞。

Owner 完成时调用唯一的 `owner_submit` 提交关卡。运行时自动执行固定验证，根据真实 Git diff 检查 scope、链接和受保护路径，再生成并固定 commit SHA；复制验证快照时原样保留相对符号链接，Git 忽略文件不会进入提交，因此不作为 Owner 越界。越界时 Owner 在同一短期子线程调整后重试，或创建 handoff。任务通过后立即把固定 SHA 合入 workflow。出现冲突或审计失败时保留现场，不宣称任务或交付成功。最终 `implementation_review` 固定 workflow HEAD；`finalize` 再尝试把已审查 HEAD 合入启动分支的最新 HEAD。

`needs_repair` 不能作为 `owner_submit` 的终态：提交关卡会要求当前短期子线程继续调整，避免留下脏现场后再进入恢复循环。对于旧版本已经留下的合法未提交修改，恢复流程不会先执行覆盖式 `owner-sync`，而是在相同 Owner worktree 中创建新的短期子线程继续处理；通过提交关卡后再与最新 workflow HEAD 合并。

## Supervisor 与 Dashboard

Runner daemon 随 Harness 生命周期运行，通过本地控制桥执行受控 receipt，并自动为目录表中的获批 Workflow 启动独立确定性 runner。Runtime 仍是 DAG、scope、lease、验证、Git 与状态的唯一权威；runner 不会在确认 `create` 后由 Runtime 隐式派发 Owner，而是继续显式发送 `supervisor-execute`。daemon 与 runner 都不是 Agent，不调用 LLM。

V2 task 可用 `resources` 声明端口、数据库、设备或构建缓存等代码路径之外的共享执行设施，例如 `tcp:localhost:5432`、`db:test`。Supervisor 选择任务和 Runtime 实际启动 Owner 时都会核对全局并行槽、Owner 排他、持久 reservation 与这些资源身份；直接控制调用不能绕过该准入。代码路径仍由 Owner Registry scope、单 Owner lease 和提交关卡约束。

公共 Owner 对跨模块请求提交 `compatible_extension` 或 `migration_required` 后，Runtime 会幂等创建内部 Intent，并由 Runner 自动推进 PlanRevision。计划中的 `publicOwnerChanges` 必须显式绑定权威 request/decision digest、目标公共 Owner 的唯一实现 task、完整消费者集合、公共合同版本和迁移顺序。Runtime 在激活事务中重新读取持久 decision session；旧决定、遗漏消费者、错误 Owner、错误版本或缺失依赖都会关闭候选。消费者依赖公共实现 task，因此只有固定验证通过、固定 commit 生成并成功合入 workflow 后才能开始。`rejected`、`facts_missing` 和 `business_decision_required` 仍进入主线程动作，不会自动生成实现节点。

| receipt / 控制动作 | 责任 |
| --- | --- |
| `create` → `supervisor-ack` | Runtime 持久化不可伪造的 Owner reservation，不会隐式启动 Owner |
| `supervisor-execute` | runner 显式执行 reservation；重复请求幂等，重启后由 `supervisor-recover` 重新领取 |
| `wait` → `supervisor-await-event` | 基于持久事件游标长等待；超时只记录一次受控观察，不再快速 `next → ack` 轮询 |
| `notify` → main outbox | Runtime 持久化主会话通知；runner 输出通知后显式确认，未确认项会在下次启动时保留 |
| `inspect` | 在连续无进展时读取有限状态并请求确定性恢复观测 |
| `stop` | 没有 active task 时停止 Supervisor；不猜测业务结果 |

runner 默认每次等待 30 秒；可以使用 `--event-wait-ms 60000` 调整到最多 60 秒。主会话通知保存在 workflow state 的 `mainOutbox`，并由运行状态投影到“需要处理”。新 Workflow 不再产生“计划修订额度耗尽”问询：修订次数只作遥测，Dashboard 直接显示当前 Evidence Obligation 数量、语义进展和下一自治策略。旧状态中的扩额决定卡片仍可读取和完成，但不会成为新收敛流程的控制条件。

启动 Web Harness 后，在浏览器访问：

```text
http://127.0.0.1:3080/owner-workflow
```

该页面随 Harness 进程启动和关闭。Runtime 会把实际业务工作区登记到启动目录中的安全目录表；页面先用 opaque workspace ID 选择工作区，再切换“开发 Workflow”和“后台 Operation”。选中的 Workflow 通过 `/owner-workflow/api/snapshot/events` 接收文件事件驱动的 SSE，状态变化后立即重取安全快照，不再每三秒轮询；状态栏明确显示“实时已连接”或自动重连状态。页面按确定性 phase 区分“计划审查中”“计划修订中”“计划审查未通过”和真正的“等待计划批准”，需要回主会话处理时显示原因与主会话编号，不把所有 `planned` 误标成待批准。布局取消最大宽度并跟随屏幕，最小宽度为 1000px。同一宿主还提供 `/owner-workflow/api/waits` 快照和 `/owner-workflow/api/waits/events` SSE 供会话内运行状态使用。磁盘状态是唯一权威来源；接口不会暴露本地路径或等待批准的原始命令。

原有独立只读 Dashboard 仍保留，适合仅观察某一个 workflow：

```sh
./run-owner-workflow.sh --dashboard --workflow-id wf-... --port 57357
```

`--dashboard` 只启动 `127.0.0.1:57357` 的只读 HTTP/SSE 服务；它不写 workflow、不调度 Agent、不执行验证。两种 Dashboard 的状态来源都是运行时投影，而不是页面输入。

## 取消、恢复与迁移

`failed` 或 `blocked` 表示仍准备恢复，原 Owner/workflow 分支、worktree 和未提交修改都会保留。恢复只读取状态、lease、固定 SHA、事件和 Agent 标识，不能为同一 Owner 创建第二个并行 Agent。Owner 恢复时会清除该任务旧的超时结论，并以本次 Owner 运行时间作为新的 `onTimeout` 基线；旧 reservation 的历史 `launchedAt` 不能让刚恢复的任务立即进入 `blocked`。

新建 Workflow 在计划激活时冻结 `DSH_RECOVERY_RUNTIME_POLICY_V1`：整个 Workflow 最多新领12次恢复 attempt，同一根问题及其拆分、改名或跨 Owner 后继最多8次。Owner hard deadline 使用已经批准的任务 `onTimeout.afterMs`，取消请求后最多观察30秒终态证据；后续修改 Runtime 全局设置不会改写活动 Workflow。策略缺失、版本未知、字段被修改或与当前 admission config 不一致时拒绝启动。没有该策略标记的旧 active Workflow 保持原行为，不自动补账或迁移。

`action=cancel` 只表示用户明确放弃当前 Workflow。工具会先显示 Harness 原生“同意/不同意/自定义输入”问询；同意后停止后续派发，不执行最终合并，删除尚未合入启动分支的 Owner/workflow 临时分支、worktree 和其中的未提交修改，只保留 Runtime 状态、事件日志和 Dashboard 历史。规划、审查、验证、工具或模型错误不得触发自动取消和重建。

历史计划不自动猜测任务依赖、Owner 范围或验证。请参阅 [V2 迁移说明](../docs/OWNER-WORKFLOW-V2-MIGRATION.md)；技术边界见 [技术路线](../docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md)。

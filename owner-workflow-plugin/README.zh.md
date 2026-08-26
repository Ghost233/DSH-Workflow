# DeepSeek Harness Owner 工作流插件

这是主工程中的独立插件包。`deepseek-harness/`、`dsh-synapse/` 与 `vendor/dsh-approve-for-me/` 都是固定 commit 的只读上游子模块，本插件不修改它们的源码。启动脚本把 Owner Workflow 与 Synapse Web 插件加载到同一个 Harness Web 进程；工作流状态写入业务项目的 `.dsh-workflow/`。

## 当前契约

- 代码写入只使用 `DSH_PLAN_V2`；没有 Quick 模式。
- `workflow_start` 会启动一个可续接 Plan Agent。它在同一子会话中处理首次规划、Registry 批准后的重新规划以及最多一次自动修订；独立 Reviewer 仍保持一次性只读审查。主会话只接收 Registry 或最终计划的原生批准请求，以及明确的失败回报。
- 同一个 Git 项目同一时间只允许一个未结束 Workflow。Workflow 绑定一棵以创建会话为根的 DSH 会话树；其他普通 fork 只用于讨论，同一 Workflow 内的 DAG 仍可并行多个 Owner task。
- 普通讨论不会自动进入 DAG。只有用户明确要求“加入当前 Workflow”“更新 DAG”“并行”或“新增前置”时才保存 Intent；保存后 Harness 会明确询问“现在重新规划 / 继续讨论”，后者不会唤醒 Planner。
- 用户始终只与主代理沟通。需要实际执行但不修改业务文件的任务使用独立 Operation；它不要求 Git 仓库：Git 工作区使用仓库根，非 Git 目录使用当前会话工作目录。同一工作区同时只允许一个未结束 Operation，对应一个可续接 Operator 子线程。重复启动只返回当前 Operation，不创建第二个子线程。
- Operation 不内置 ADB、Docker 或项目临时命令。Operator 使用通用 `operation_exec` 逐条执行一次性命令；多个检查不能用 `&&`、分号、后台符号、管道、反引号或命令替换拼接。Operation 专用审批插件先匹配用户在本次主会话明确放行的字面前缀；未命中时先执行 Operation 的显式人工风险门禁，再复用 `dsh-approve-for-me` 的固定风险、配置白名单和可选无工具模型复核。自动通过只允许当前精确命令一次；任何异常、超时、不匹配或高风险都持久化请求、暂停 Operator 并回到主线程原生多选项问询。Operation 不监听标准 `approval/request`，不会接管主代理的 Bash/PowerShell；主代理仍使用独立安装的 `dsh-approve-for-me`。问询提供“仅允许这一次/拒绝”，存在最小 `approval_prefix` 时增加“本次会话允许此前缀”，并允许在“其他”中输入更窄前缀。会话前缀只保存在当前进程，主会话结束或 Harness 重启后失效。Operation 终态仍会释放驻留资源并通过 Workspace Registry 归档持久会话，状态和事件继续保留供审计。
- 旧 V1 计划只允许查询和导出，不允许启动、调度、恢复、验证、合并或 finalize。
- Owner Registry 是 Git 跟踪的责任域真源。Registry 变化必须经过提案、精确 digest 审批和运行时应用，不能由规划器或 Owner 直接写入。
- Owner 是由代码本身决定的长期责任域：依据目录、模块、包、接口边界、依赖方向、稳定业务或技术职责以及可独立演进的文件集合。禁止按照当前 Workflow 的阶段、任务步骤、修复顺序、review/verify 角色、验证类型、临时需求名称或并行度目标创建、拆分或命名 Owner。Workflow 只能把 DAG task 路由给 Owner，不能反过来塑造 Owner。
- Owner 分析子代理只提交代码责任域建议。Owner 的设定、Registry 提案展示、用户原生问询和批准全部绑定创建该 Workflow 的主线程；其他会话、Owner、Planner、Reviewer 和 Runner 都不能代办。批准后 Runtime 才把 Registry 固定到项目基础分支，供后续 Workflow 复用。
- 内部 `workflowId` 只用于状态文件、锁、socket 和 worktree 隔离。新建 Workflow Git 分支不暴露随机 ID，格式为 `dsh/workflow/<日期>-<项目递增序号>-<需求摘要>`；Owner 分支格式为 `dsh/owner/<同一可读前缀>/<owner-id>`。项目递增序号由 Runtime 在受控锁内分配。
- 计划是任务级 DAG。节点使用 `dependsOn`，角色为 `work`、`review` 或 `verify`；任务必须绑定计划中的验证 ID，并声明 `priority`、`onFailure`、`onBlocked` 与 `onTimeout`。Runtime 只执行已经批准的策略，未覆盖的语义决策一律进入主会话 outbox。
- Owner 在每个 workflow 内固定使用一个 Owner 分支和一个 worktree。同一 Owner 的后续任务复用该现场；任务完成时固定 commit SHA，验证通过后立即合入 workflow HEAD。
- Owner Memory 采用可编译的两层模型：`当前 Memory` 是 Git 跟踪的简短中文能力说明；`临时 Memory` 是当前未完成 task 的完成、结论、下一步和阻塞记录。Owner 只能调用 `owner_memory_note` 追加临时 Memory，不能直写长期页面。
- 未最终有效或仍处于“待检查”的结果只追加 Runtime 临时 Memory，不封存、不修改或编译长期 Memory。只有任务按最新 DAG 验证有效后，Runtime 才封存最终日志并由受限 Memory Curator/Reviewer 增量更新当前 Memory；失败时不能进入最终有效状态。
- 确定性 Runner daemon 随 Harness 启动和停止，自动发现已登记工作区中 `approved` 或可恢复的 `running` Workflow。它只领取并执行控制桥 receipt：`create` 先形成持久 reservation，只有 runner 的 `execute` 才会启动 Harness 内的 Owner 子代理；`wait` 通过事件游标长等待，不读取或解释计划，不自行选择任务，也不调用模型。
- Web Harness 启动时会同时加载只读 Dashboard 路由 `/owner-workflow`，可切换查看开发 workflow 和后台 Operation；它只读取 Runtime 投影，不提供调度、写入、Git 或命令接口。
- 静态客户端提供统一“行动收件箱”：会话头部、侧边栏和 `shell.overlay` 全屏浮层都会合并 Runtime 等待项与 Harness 原生 `pendingInteraction`。点击条目只跳转到请求产生的会话，授权和问询仍在原始现场处理；Synapse 全屏地图打开时浮层入口仍可见。
- `failed`/`blocked` 保留现场供恢复；`cancel` 经用户原生问询明确同意后放弃本次工作，删除未合入的临时分支、worktree 和未提交修改，只保留 Runtime 状态与日志。
- 所有用户可见文本、提示词、日志摘要和文档使用中文；`deepseek-harness/` 保持零修改。

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

1. 只需要读取仓库并给出审计、分析或建议时使用 `workflow_audit`，不创建 workflow。
2. 需要实际执行但不修改仓库时，主代理将自然语言需求整理为目标、上下文、约束、完成标准和最小能力，调用 `operation_start`。Operator 在后台运行，用户不需要进入子线程。
3. Operator 返回 `need_input` 时，主代理在当前对话取得信息并调用 `operation_continue`。`operation_exec` 需要扩大只读沙箱时，专用审批插件先检查本次会话前缀，再复用当前 Profile 中 `approve-for-me` 设置的固定风险、白名单和可选模型复核；通过时只自动执行当前精确命令一次。未通过时 Operator 返回 `need_approval`，主代理立即调用 `operation_approve`。Harness 会在当前主对话显示包含动作、风险、精确命令和可选前缀的原生多选项问询；只有用户明确选择“仅允许这一次”或“本次会话允许此前缀”才恢复同一个 Operator。普通文本不能产生授权。Operator 会主动回报；`operation_status` 只用于用户明确查询或恢复中断现场，不能轮询。使用 `operation_cancel` 取消。
   Operation 活动期间，当前会话头部会显示“等待 N”；侧边栏底部的全局列表会按会话分组显示所有等待事项。列表状态包括“等待后台 Operator”“等待用户补充信息”和“等待用户授权决定”。
4. 需要改代码时先使用 `workflow_preflight`。它返回当前 Git 基线、未提交改动与 `baseDigest`；只有 `canStart=true` 时，才能将同一个摘要传给 `workflow_start`。这一步不会自动提交、暂存、丢弃或掩盖既有改动；子模块内部脏改动必须由用户先处理。
5. `workflow_start` 从预检基线创建 workflow 分支，并启动可续接 Plan Agent。Runtime 在内部让它生成 `DSH_PLAN_V2`、Owner 定义、验证定义和任务 DAG，再调用独立 Reviewer 审查；主会话不得手工串联 `workflow_recover`、`workflow_plan_review` 或 `workflow_plan_revise`。
   计划中的 `owners` 只选择 Owner ID；Runtime 从正式 Registry 确定性注入完整 Owner 定义，再校验任务写入范围。Planner 的描述改写或 scope 扩大不会成为权限来源。
   Plan Agent 或内部 Reviewer 失败时会主动回报明确原因；主会话保留现场并等待用户决定，不会自行重建 Workflow 或串联旧的规划工具。
6. 如果规划结果包含 Registry 变化，Plan Agent 会持久化提案并主动回报摘要。主会话只使用回报中的 digest 调用 `workflow_owner_change_approve`；该工具自行显示 Harness 原生“同意/不同意/自定义输入”问询。批准后同一个 Plan Agent 自动继续重新规划。
7. Runtime 自动执行独立计划审查；若 Reviewer 提出问题，最多将意见回传给同一个 Plan Agent 自动修订一次。审查通过后 Runtime 主动回报 `plan_digest` 和 `registry_digest`，主会话才调用 `workflow_plan_approve`。该工具用原生问询固定两个 digest，不再要求用户复制批准口令。
   计划 Reviewer 通过内部 `workflow_plan_review_submit` 提交结构化结果，状态仅允许 `passed` 或 `needs_revision`；首次契约错误由 Runtime 自动携带错误重试一次。审查需要修订时，Runtime 最多把问题回传给同一个 Plan Agent 一次；仍未通过则主动回报并停止。主会话不读取或执行旧 `nextTool` / `nextArgs` 来继续规划。
8. 计划批准后 Runner daemon 自动接管，不需要手工运行脚本。`workflow_plan_approve` 首先返回 `runner.status=queued`；此时只能说明“已排队”，等待 Workflow 进入 `running` 后才能说明 Owner 正在执行。需要临时禁用自动 Runner 时，可在启动 Harness 前设置 `DSH_OWNER_WORKFLOW_RUNNER=0`；`run-owner-workflow.sh --workflow-id wf-...` 仅保留为诊断兼容入口。

9. 执行期间可以在同一会话树的任意普通讨论分支明确提交 `workflow_intent_submit`。工具保存 Intent 后显示“现在重新规划 / 继续讨论”原生问询；只有前者会调用一次 Planner。候选依次经过 `workflow_revision_review` 和根会话中的 `workflow_revision_approve`。不可变版本只保存 `number`、`parent`、`planDigest` 和完整 `DSH_PLAN_V2` 快照。
   Revision 切换时，无关任务继续有效；新增前置、验证、需求变化或 write 扩大允许旧运行自然结束并合入，但结果先标记“待检查”，新增依赖完成后重新执行固定验证。Owner 变化、任务删除、write 收窄或 Registry 权限变化会立即中止旧运行，旧结果不合入。
10. 行动收件箱会显示未执行、执行中、等待依赖、Harness 原生授权、用户问询和 Runner 离线状态；点击条目返回请求产生的会话。`/owner-workflow` Dashboard 同时显示任务统计。用户明确查询时也可以使用 `workflow_status` 或 `workflow_supervisor_status`。所有任务完成并且不存在“待检查”结果后，依次执行 `workflow_implementation_review` 和 `workflow_finalize`。

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

Owner 子代理使用 `workspace-write + ask`，但插件在 Owner 会话的 `approval/request` waterfall 前设置严格门禁：只有 Runtime 当前登记的 `owner_host_exec` 或固定验证请求可以继续到 Harness UI，模型通过普通 Shell 直接申请的其他升级会被确定性拒绝。授权卡片显示在当前 Owner 任务现场；行动收件箱负责发现并跳转，主会话不代答。只有用户选择“允许一次”后，Runtime 才执行卡片中的同一精确命令一次。

### Owner Memory 编译

Memory 的可靠性由插件 Runtime 保证，Skill 只用于固定主代理、Owner 和 Memory 子代理的操作规范。一次 task 的流程为：

```text
当前 Memory 注入 Owner → Owner 用 owner_memory_note 记录简短临时进展
→ owner_submit 固定代码提交 → 若仍“待检查”，只保留临时日志
→ 最新 DAG 的依赖与固定验证全部通过 → Runtime 封存最终日志
→ Memory Curator 生成受限提案 → Reviewer/格式校验 → 提交当前 Memory → task 最终有效
```

`.owner-memory/owners/`、`interfaces/`、`concepts/` 与 `decisions/` 中的页面是人可读的当前知识；隐藏的 `.owner-memory/.sources/` 仅保存每次任务的简短封存日志，供后续重新编译使用，不会注入给 Owner。隐藏 `.catalog.json` 保存来源、时效和替代关系等机器元数据，避免把审计字段塞进可读 Markdown 页面。

`owner_submit` 的正式固定验证不依赖 Owner 主动调用授权工具。`workspace-write` 明确拒绝固定命令后，Runtime 自动把完整 verification ID 和命令登记为当前 Owner 现场的原生授权请求；允许一次后在独立快照中精确重试。若当前 Owner 没有开放回合，提交关卡保留 worktree，恢复同一 Workflow/task/Owner 后重试。若授权后的命令已经执行但退出码非 0，Runtime 会持久化有界 stdout/stderr、把证据返回同一 Owner，并拒绝将其误报为授权阻塞。

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

# Owner 工作流 V2 迁移说明

## 结论

V2 不是把旧计划字段补齐后继续执行，而是建立新的、经过审批的 `DSH_PLAN_V2` workflow。旧 V1 只可查询和导出；运行时不会猜测依赖、Owner scope、验证或合并关系，也不会自动把旧计划转换为可执行计划。

## 迁移前提

- 没有 Quick 迁移路径。任何需要写代码的需求都从当前分支重新启动 V2 workflow。
- 先执行 `workflow_preflight`。只有 `canStart=true` 且同一个 `baseDigest` 仍有效时，才能执行 `workflow_start`；它不会自动处理既有改动或子模块内部脏改动。
- 先确认 `deepseek-harness/` 子模块状态，不向其中写入任何插件或业务文件。
- 旧 workflow 的状态、日志、分支和 worktree 作为审计现场保留；不要通过清理操作掩盖未审计改动。

## 迁移步骤

### 1. 只读盘点并导出旧计划

使用状态查询或导出能力保存旧计划、Owner 定义、日志和已有提交信息。盘点结果只能作为人工规划输入，不能直接交给 Supervisor 执行。若旧状态不是 `DSH_PLAN_V2`，应明确标记为只读历史资料。

### 2. 建立并审批正式 Owner Registry

把当前责任域整理为 `.owner-workflow/config.json` 与 `.owner-workflow/owners/<owner-id>/owner.md`；同一 Owner 的长期知识放在相邻 `memory/`。对于新增、移除、拆分、合并、转交或 scope 变化：

Owner 分析子代理只能提出建议；以下提案、展示、问询和批准必须全部在创建该 Workflow 的主线程完成。批准结果再由 Runtime 固定到项目基础分支，不能只保存在单次 Workflow 分支或子代理上下文中。

1. 把同一轮发现的全部变更收进一个 `type=batch`、`operations=[...]` 的结构化 operation，再通过 `workflow_owner_change_propose` 一次提交；不得按 Owner 拆成多轮问询。
2. 在一张审批卡片中展示全部子操作、最终 before/after、受影响 Owner、文件范围和 proposal digest。
3. 用户确认完全匹配的 digest。
4. 调用一次 `workflow_owner_change_approve` 打开 Harness 原生“同意/不同意/自定义输入”问询；只有明确同意才原子应用整批变更，并重新读取 Registry digest。

不能直接编辑正式 Registry 来绕过 digest 审批。运行中存在受影响的 reserved 或 running task 时，先停止或完成安全边界内的任务，再处理 Registry 变化。

### 3. 从零生成 DSH_PLAN_V2

规划器必须重新声明：

- `registryDigest` 与正式 Registry 的绑定；
- 每个固定验证的唯一 ID 和 argv；
- 每个任务的 `id`、`role`、`ownerId`、`dependsOn`、`write`、`verify` 和 `done`；
- 显式 Review/Verify 节点及其下游依赖。

旧计划中的阶段边界不能直接当作任务依赖；缺少信息时返回 `plan_invalid/revise_plan`，由用户或主编排者补充，而不是由模型猜测。

Owner 也不能从旧计划的阶段或新 Workflow 的流程反推。Owner 必须依据代码目录、模块、包、接口、依赖方向和长期职责划分；阶段、work/review/verify、修复步骤与并行分组全部属于 DAG task。同一代码责任域可以包含多个不同流程任务，不能为了当前 Workflow 拆成临时 Owner。

### 4. 独立审查与审批

使用 `workflow_plan_review` 检查真实并行度、过度拆分、依赖环、Owner 路由、验证绑定和 Registry digest。修订后使用 `workflow_plan_revise` 并重新审查。审查通过后立即调用 `workflow_plan_approve` 打开原生问询；只有用户明确同意 plan digest 与 registry digest，Supervisor 才能启动。

### 5. 固定现场执行

用外置 `workflowd` runner 启动执行：

Runner daemon 会随 Harness 自动启动：对计划审查驱动失败或超时的 `planned` Workflow，它只请求 Runtime 做可验证的 digest 补绑与 Reviewer 恢复；对获批 Workflow 才接管 Supervisor。手工 `run-owner-workflow.sh --workflow-id wf-...` 只作为诊断兼容入口。

Owner 固定使用：

```text
dsh/owner/<日期>-<项目递增序号>-<需求摘要>/<owner-id>
.dsh-workflow/worktrees/<workflow-id>/owners/<owner-id>
```

任务完成时固定提交 SHA，必需验证通过后立即合入 workflow。下一任务复用同一 Owner 现场并先同步到最新 workflow HEAD；不通过阶段性批处理来决定合并。

### 6. 审查、集成或取消

全部任务完成后执行 `workflow_implementation_review`，再执行 `workflow_finalize`。finalize 把固定 workflow HEAD 合并回启动分支，随后删除全部 Owner/workflow 临时分支和 worktree。`failed`/`blocked` 保留现场供同一 Workflow 恢复；只有用户明确放弃时才执行 `workflow_cancel`，并在原生问询同意后删除未合入的临时分支、worktree 和未提交修改，只保留 Runtime 状态与日志。

## 历史名称的替换边界

下表只用于识别历史文档中的旧说法，不是可执行接口：

| 历史说法 | V2 替换 | 约束 |
| --- | --- | --- |
| `DSH_PLAN_V1` | 新建 `DSH_PLAN_V2` 任务 DAG | V1 仅查询、导出，不能启动执行 |
| `stage` / `stages` | `tasks` + `dependsOn` | 不把阶段顺序自动猜成任务依赖 |
| `merge-stage` | 任务 finish 时固定 SHA 并合入 workflow | 不由 runner 解释或批量合并阶段 |
| `owner_add` 或 scope 直写 | `owner_change_propose` → digest 审批 → `owner_change_approve` | 正式 Registry 没有绕过审批的直写入口 |

旧名称若出现在日志或历史计划中，只作为迁移识别标签；不得复制到新的 V2 计划、提示词或执行命令中。

## 迁移验收清单

- [ ] 旧计划已经只读导出，未被当作可执行输入。
- [ ] 正式 Registry 已生成，所有变化都有审批 digest。
- [ ] 新计划契约为 `DSH_PLAN_V2`，任务依赖无环，并声明 priority 与失败、阻塞、超时策略。
- [ ] 每个任务的 `write` 在 Owner scope 内，所有必需验证引用固定 ID。
- [ ] plan review 通过，plan digest 与 registry digest 已批准。
- [ ] `create` 只形成持久 reservation，只有外置 runner 的 `supervisor-execute` 可以启动 Owner。
- [ ] runner 通过 `supervisor-await-event` 以事件游标等待；`notify` 进入持久 main outbox 后才交付主会话。
- [ ] 每个任务都记录固定 commit SHA、验证结果和合入 workflow 的结果。
- [ ] Web Harness 的 `/owner-workflow` Dashboard 能只读显示固定启动工作区的投影；兼容的 `127.0.0.1:57357` 独立 Dashboard 也不写状态；`failed`/`blocked` 显示可恢复现场，明确取消后只保留状态与日志。
- [ ] `deepseek-harness/` 子模块没有修改。

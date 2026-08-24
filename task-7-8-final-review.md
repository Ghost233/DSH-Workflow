# Task 7 + Task 8 最终安全复审

## 结论

- Critical：1 项。
- Important：4 项。
- Minor：无独立于上述问题的 Minor。
- 本次只读审查未修改实现、测试或 Git 状态；仅写入本报告。

## 可读专项测试证据

以下命令均针对当前工作区执行：

```text
node --test owner-workflow-plugin/test/verification.test.mjs owner-workflow-plugin/test/security.test.mjs owner-workflow-plugin/test/control.test.mjs
tests 71
pass 71
fail 0

node --test owner-workflow-plugin/test/model.test.mjs owner-workflow-plugin/test/supervisor.test.mjs
tests 56
pass 56
fail 0

node --test --test-name-pattern='request|白名单|V1|Composite|delta|固定 commit|completed|Registry' owner-workflow-plugin/test/resilience.test.mjs owner-workflow-plugin/test/control.test.mjs
tests 24
pass 24
fail 0
```

通过不等于全部安全关闭；下列问题是测试未覆盖的可达路径或边界。

## Critical

### C-1：V1 的 completed/awaiting_finish 幂等路径仍可执行

位置：

- `owner-workflow-plugin/src/runtime.mjs:3182-3195`：`runExternalOwner` 在调用任何 V2 门禁前处理持久化旧记录。`previous.status === 'completed'` 直接进入 `assertCompletedOwnerRecord`；`awaiting_finish/committed` 且 `deferFinish` 时直接返回旧 result。
- `owner-workflow-plugin/src/runtime.mjs:4712-4761`：`assertCompletedOwnerRecord` 没有调用 `assertV2WorkflowExecutable`；其内部的 `assertRequiredTaskVerifications` 在非 V2 上于 `:4674-4675` no-op。
- `owner-workflow-plugin/src/runtime.mjs:2944-2960`：控制桥仍把 `run-owner`、`owner-sync`、`owner-finish` 路由到这些入口。

复现依据：构造一个 `DSH_PLAN_V1` 状态，并在 `ownerRuns[stageId:ownerId]` 放入 status 为 `completed`、包含可核验 `result.worktree/branch/commitSha` 的记录；控制桥发送 `run-owner` 会返回旧 result，而不会经过 V1 拒绝。将记录设为 `awaiting_finish` 或 `committed` 后发送 `owner-sync`，也会命中 `:3193-3195` 的直接返回。当前 `owner-workflow-plugin/test/control.test.mjs:1888-2003` 的 V1 用例只使用空的 `ownerRuns`，因此只覆盖正常启动分支，没有覆盖这两个幂等分支。

这违反“V1 只能查看和导出、任何执行路径都拒绝”的硬边界，属于 Critical。

## Important

### I-1：V2 任务允许 `verify: []`，完成门禁因此可在没有验证证据时通过

位置：

- `owner-workflow-plugin/src/model.mjs:590-595`：`identifierList` 默认允许空数组。
- `owner-workflow-plugin/src/model.mjs:774-777`：V2 task 的 `verify` 使用默认 `allowEmpty`，没有要求至少一个绑定验证。
- `owner-workflow-plugin/src/runtime.mjs:4699-4710`：完成门禁只遍历 `task.verify`；为空时循环零次并返回成功，没有任何 `verificationResults` 证据。
- `owner-workflow-plugin/test/resilience.test.mjs:101-118`：V2 测试计划明确以 `verify: []` 构造任务，同时添加 legacy `stages` 以适配旧运行时。

复现依据：以该 V2 计划启动 Owner，Owner 不调用 `owner_verify`，只要其它检查和提交条件满足，`assertRequiredTaskVerifications` 对空数组直接返回，`commitOwnerAttempt`/`finishOwner` 不会拒绝。至少 work task 应要求非空 required verification，或由明确的安全策略证明无需验证；当前实现没有这样的策略。

### I-2：验证后的最终结算没有重新绑定 plan/revision/status；owner-sync 也可返回漂移后的旧结果

位置：

- `owner-workflow-plugin/src/runtime.mjs:4795-4814`：验证结果记录了 `planDigest`、`revision`、workflow/task status 等快照字段。
- `owner-workflow-plugin/src/runtime.mjs:4694-4708`：完成门禁实际只校验 `writeGeneration`、content digest 和 `assertPassingVerification`，没有比较结果中的 `planDigest/revision` 与当前状态。
- `owner-workflow-plugin/src/runtime.mjs:4233-4243`、`:4131-4137`：执行过程中虽会做验证门禁，但检查结束后仍有检查、提交和状态保存窗口。
- `owner-workflow-plugin/src/runtime.mjs:3300-3313`：Owner 结果保存前只调用 `assertWorkflowNotCancelled`，没有锁内确认最新 plan digest、revision、task status/executor 仍与本次运行绑定。
- `owner-workflow-plugin/src/runtime.mjs:3193-3195`：`owner-sync` 对已有 `awaiting_finish/committed` 记录直接返回旧 result，不验证固定 commit、branch、worktree clean 或当前验证状态。

复现依据：在最后一次验证门禁返回后、`runExternalOwner` 的结算锁内保存前，将任务改为 stopped/blocked、推进 workflow revision，或执行不影响该任务语义的 plan delta；当前最终保存只拒绝 cancelled，仍可把 ownerRun 写成 completed。另一路径是在首次 `owner-sync` 后修改 Owner worktree/branch，再次 `owner-sync`，`:3193-3195` 直接返回旧成功结果；现有测试只覆盖无漂移的两阶段结算。

这使 Task 7 修复的状态/代次绑定只覆盖验证调用临界区，没有覆盖“验证完成到最终结算”的临界区。

### I-3：V2 保留未经规范化的 legacy `stages`，可重新打开旧 `merge-stage` 执行路径；纯 V2 handoff replan 反而依赖该测试字段

位置：

- `owner-workflow-plugin/src/runtime.mjs:1307-1312`、`:2097-2102`：V2 计划规范化后仍把 planner 输出的任意 `stages` 原样挂回 plan。
- `owner-workflow-plugin/src/runtime.mjs:1250-1261`：V2 启动只确认适配 stage 的 id、单任务和 owner 相同，不比较其 `files/acceptance/dependsOn` 与规范化 V2 task，也不拒绝 legacy stage。
- `owner-workflow-plugin/src/runtime.mjs:3707-3739`、`:3857-3864`：`mergeExternalStage` 只要求 V2 contract，却按 `plan.stages`、`completedStages`、legacy `ownerRuns` 工作，不校验 Supervisor task DAG、V2 task projection 或所有任务的终态。
- `owner-workflow-plugin/src/runtime.mjs:2103-2124`：handoff replan 直接读取 `state.plan.stages`；没有 legacy stages 的标准 V2 plan 会在该路径失败。
- `owner-workflow-plugin/test/resilience.test.mjs:73-118`、`:248-261`：V2 fixture 手工添加 `stages`/`v2Stage`，掩盖了纯 V2 生产路径缺少该字段的问题。

复现依据：让 planner 返回合法 V2 `tasks`，并额外携带一组仅通过 id/owner 检查的 legacy `stages`；批准后先通过旧 `run-owner` 生成 legacy ownerRun，再调用控制桥 `merge-stage`。该路径可以把 `completedStages` 和 workflow status 推进为完成，而 V2 `tasks` 仍为 pending/running，绕过 Supervisor 的 DAG/Review 投影。若去掉 `stages`，handoff replan 又会在 `state.plan.stages.find` 处失败。

### I-4：生产 planner prompt 仍要求输出 V1，解析器却只接受 V2

位置：

- `owner-workflow-plugin/src/runtime.mjs:538-563`：`plannerPrompt` 的示例使用 `contract: PLAN_CONTRACT`、`stages`、legacy task `files/acceptance`。
- `owner-workflow-plugin/src/runtime.mjs:652-667`：handoff replan prompt 明确要求“完整的 DSH_PLAN_V1 JSON”。
- `owner-workflow-plugin/src/runtime.mjs:1304-1307`、`:2094-2098`：解析器明确拒绝非 `DSH_PLAN_V2`。

这是 fail-closed 而不是 V1 被接受：V1 planner output 会被拒绝，正向安全测试也证明了这一点；但正常规划/转交流程被 prompt 自身引导到必拒格式，实际运行会失败，促使测试和调用方继续携带未受控 legacy stages 作为适配。应把生产 prompt/schema 与 V2 parser 完全对齐，并单独实现受约束的内部 Supervisor adapter。

## 已确认关闭的原 Critical/Important（含证据）

- Task 7 写代次：`owner-workflow-plugin/src/runtime.mjs:4652-4668` 每次 `owner_write/owner_edit` 成功后递增 `writeGeneration`；`owner-workflow-plugin/src/runtime.mjs:4700-4705` 在门禁比较结果代次，覆盖回滚和写回相同内容。对应 `security.test.mjs` 的回滚/相同内容用例通过。
- Task 7 验证状态 TOCTOU：`owner-workflow-plugin/src/runtime.mjs:4771-4789` 固定执行前状态，`:4816-4848` 在锁内重新解析绑定 argv、内容 digest 和 workflow/task/Owner/session/revision 状态；漂移测试通过。上述 I-2 说明的是最终结算边界仍缺一次绑定检查。
- Task 7 host 证据：`owner-workflow-plugin/src/runtime.mjs:1013-1015` 要求 shell 的 `sandboxMode` 为 `workspace-write`；`owner-workflow-plugin/src/verification.mjs:64-90` 将非零 exit、非 full、`ok:false`、超时、中止、后台结果固定为 `passed:false`；相关测试通过。
- V1 正常启动/finish/recover/merge 和 Supervisor 专用端点都有 `assertV2WorkflowExecutable` 或 `supervisorProjection` 门禁；`control.test.mjs:1888-2003` 的空记录 V1 测试通过。C-1 是该门禁之前的持久记录快路径遗漏。
- completed/fixed commit：`owner-workflow-plugin/src/model.mjs:1041-1077` 禁止删除、改写、invalidate 已完成任务，并从 task state 与 ownerRuns 检查固定业务提交；`owner-workflow-plugin/src/runtime.mjs:4712-4761` 校验 completed 的固定 worktree、branch、commit、clean 状态和验证。模型/恢复专项测试通过。
- Composite/delta：`owner-workflow-plugin/src/model.mjs:633-735` 拒绝外部任务直接依赖 child；`:976-1004` 的失效闭包覆盖 child→exit→parent→后继；`:1041-1105` 做 completed/carry-forward/fixed commit 保护。`model.test.mjs` 的 Composite/delta 专项 通过。
- Registry equality：`owner-workflow-plugin/src/model.mjs:942-955` 和 `runtime.mjs:1545-1559` 同时固定 digest、Owner 数量及完整 Owner identity；直接 `applyPlanDelta` 也不再只依赖 runtime wrapper。
- handoff metadata：`owner-workflow-plugin/index.js:194-220` 使用 `additionalProperties:false`；`runtime.mjs:2473-2504` 先 `ownerResult` 白名单化，再由运行时覆盖 id、task、source、session、status。伪造字段测试通过。
- V2 planner 不接受 V1：`runtime.mjs:1304-1307`、`:2094-2098` 及 `model.mjs:1108-1112` 都 fail-closed；模型与控制专项测试通过。当前遗留问题是生产 prompt 仍发 V1（I-4），不是解析器接受 V1。

## Minor

无独立于 Critical/Important 的 Minor；应先修复上述四项并补充对应回归测试，再重新进行最终放行复审。

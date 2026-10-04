# Task 8 独立实现审查

审查范围：Task 8 brief/design，以及 `model.mjs`、`supervisor.mjs`、`runtime.mjs`、`index.js` 和 model/supervisor/resilience/control 测试。未修改实现文件，未提交 Git。

## 结论

- Critical：1 项。
- Important：6 项。
- Minor：无独立于上述问题的 Minor。

指定专项测试已新鲜运行：

```text
node --test owner-workflow-plugin/test/model.test.mjs owner-workflow-plugin/test/supervisor.test.mjs owner-workflow-plugin/test/resilience.test.mjs owner-workflow-plugin/test/control.test.mjs
tests 138
pass 138
fail 0
```

测试通过不能覆盖下列状态伪造、完成节点重写和 Composite 边界场景。

## Critical

### C-1：V1 仍可通过运行时控制桥实际执行

位置：

- `owner-workflow-plugin/src/runtime.mjs:1188-1213`：`validateOwnerStartState` 对 `DSH_PLAN_V2` 之外的计划进入旧 V1 stage 校验分支，而不是拒绝执行。
- `owner-workflow-plugin/src/runtime.mjs:2856-2881`：控制桥仍接受 `run-owner`、`owner-sync`、`owner-finish`、`owner-recover` 和 `merge-stage`。
- `owner-workflow-plugin/src/runtime.mjs:3097-3102`：`runExternalOwner` 对旧 `ownerRuns` 继续启动/结算。
- `owner-workflow-plugin/test/control.test.mjs:1854-1929`：测试明确以 `DSH_PLAN_V1` 验证 `owner-sync`/`owner-finish` 可执行。

设计明确规定 V1 只能查看和导出，不能继续执行。当前 Supervisor 专用端点虽然在 `runtime.mjs:1340-1347` 拒绝 V1，但旧控制动作仍提供了可达的执行后门；这会绕过 V2 的任务 DAG、显式 Review、固定验证和 Composite/局部 delta 门禁，属于核心安全边界失效。

## Important

### I-1：没有固定 commit 的 completed task 仍可被 invalidate 并重置

位置：

- `owner-workflow-plugin/src/model.mjs:1019-1027`：只有 `affected && fixedCommitForTask(...)` 时才拒绝 completed task；没有固定提交时允许继续。
- `owner-workflow-plugin/src/model.mjs:1029-1034`：受影响记录进入 `resetTaskRecord`，状态改为 `pending` 并清除完成/验证证据。
- `owner-workflow-plugin/test/model.test.mjs:183-202`：只覆盖带 `fixedCommit` 的 completed task，未覆盖 completed 但无 commit 的情况。

Task 8 brief/design 要求已有完成节点只能 carry-forward；完成状态本身不能因为缺少 commit 字段而变成可重写条件。对 completed task 传 `invalidate` 且不带固定 commit 时，当前实现会让它重新执行。

### I-2：invalidation closure 没有包含 Composite 的 parent/exit 结构

位置：

- `owner-workflow-plugin/src/model.mjs:935-960`：`dependencyClosure` 只沿 `dependsOn` 的反向边传播。
- `owner-workflow-plugin/src/model.mjs:1012-1017`：`applyPlanDelta` 直接使用该 closure 计算受影响任务。
- `owner-workflow-plugin/src/supervisor.mjs:66-78`、`145-158`：Supervisor 另行通过 Composite `exit` 推导 parent 状态，但 delta 重置不会同步清除 parent/downstream 的完成证据。

Composite 的 child 不通过 `dependsOn` 指向 parent；因此 invalidate `T2-1` 时，closure 不会自动包含 Composite parent `T2` 及依赖 `T2` 的后继 `T3`。若 parent 或后继已有完成投影，旧完成/Review/验证可能被 carry-forward，形成“child 已失效但 parent/downstream 仍完成”的不一致状态。

### I-3：后续 delta 可以让 Composite 外部任务直接依赖 child

位置：

- `owner-workflow-plugin/src/model.mjs:657-660`：只限制 child 的 `dependsOn` 必须是同一 Composite 内部节点，没有限制外部任务不能依赖 child。
- `owner-workflow-plugin/src/model.mjs:986-1056`：`applyPlanDelta` 只做普通 V2 规范化和 DAG 校验，没有保持 Composite 的外部边界。
- `owner-workflow-plugin/src/supervisor.mjs:145-158`：无 parent 的外部任务只按自身 `dependsOn` 判断 ready；若它依赖 child，child 完成后即可被派发，不要求 parent/全部 exit 完成。

初次 `expandCompositeTask` 会保留原后继对 parent 的依赖，但后续 `request_handoff` 的任意合法 V2 `delta.plan` 可改成 `T3.dependsOn = ['T2-1']`。这违反“后继继续依赖父任务”的 Composite 语义。

### I-4：request 工具没有以 ownerRuns 的固定 commit 阻止重规划

位置：

- `owner-workflow-plugin/src/runtime.mjs:2321-2324`：`requestSubgraph` 只检查当前 `state.tasks` 记录中的 commit 字段。
- `owner-workflow-plugin/src/runtime.mjs:2372-2404`：`requestHandoff` 没有等价的 commit/ownerRuns 检查。
- `owner-workflow-plugin/src/model.mjs:1019-1023`：固定 commit 保护只在记录状态已经是 `completed` 时触发。
- `owner-workflow-plugin/src/model.mjs:1037-1042`：受影响任务的 `ownerRuns`/reservation 记录会被过滤删除。

V2 的 supervisor task 仍可能是 `running`，但对应 `ownerRuns[taskId:ownerId]` 已是 `awaiting_finish`/`committed` 且含 `result.commitSha`。此时 active Owner 可请求 handoff 或 Composite delta；当前代码会重置 task，并删除带固定 commit 的 ownerRun 证据。也就是说，已有业务提交只因尚未投影成 `tasks.status=completed` 就可被局部 delta 改写。

### I-5：request_handoff 的 handoff 对象未白名单化，并在校验后覆盖运行时字段

位置：

- `owner-workflow-plugin/index.js:194-208`：`handoff` 仅声明为普通 object，没有字段白名单和 `additionalProperties: false`。
- `owner-workflow-plugin/src/runtime.mjs:2381-2395`：只对少数 Registry 字段和 owner 类型目标做校验；其它字段未规范化。
- `owner-workflow-plugin/src/runtime.mjs:2405-2418`：`...structuredClone(handoff)` 放在运行时生成的 `id`、`taskId`、`sourceOwnerId`、`sessionId`、`status` 等字段之后，调用者可以覆盖这些状态真源字段。

Owner 可以携带 `status: 'planned'/'completed'`、伪造 `id`、`taskId`、来源 session 或其它任意字段。这样可以让请求不再匹配 pending handoff，污染审计记录，或伪造请求归属。它虽不直接写业务文件，但已经成为 workflow 状态写入后门。

### I-6：Registry 边界只在两个 runtime 包装器中校验，applyPlanDelta 本身可绕过

位置：

- `owner-workflow-plugin/src/model.mjs:848-860`：`expandCompositeTask` 只拒绝 proposal 携带显式 Registry 字段。
- `owner-workflow-plugin/src/model.mjs:986-1056`：`applyPlanDelta` 接受任意经过 V2 normalize 的 `delta.plan`，没有要求 owners、scope 或 registry digest 与旧计划一致。
- `owner-workflow-plugin/src/runtime.mjs:1474-1488`：Registry 边界校验只由 `requestSubgraph`/`requestHandoff` 的调用方显式调用。

因此直接调用导出的 `applyPlanDelta`，或未来新增一个 delta 调用点，就可以在保持相同 `registryDigest` 的情况下替换 Owner 集合、scope 或 parentOwner 定义。Registry 是跨 workflow 的责任域真源，不能依赖每个调用方都记得补一层 wrapper 校验。

## 已确认的正向证据

- `supervisor.mjs:214-232` 通过 active Owner 集合和本批 selected Owner 集合限制同一 Owner 每次最多一个任务；runtime 的磁盘 lease 在 `runtime.mjs:1560-1637`，Owner 运行入口也在 `runtime.mjs:4074-4079` 做重复线程保护。对应 supervisor/resilience 专项用例通过。
- `expandCompositeTask` 的初始 parent 外部依赖、entry/exit 可达性和基础 ready 投影测试通过；这证明正常展开路径成立，但不覆盖后续 delta 的结构破坏。
- `request_subgraph`/`request_handoff` 的基础 active session、当前 task 和 Registry 边界用例通过；没有覆盖 ownerRuns 已 commit、handoff 额外字段覆盖和 child 失效闭包。
- model 层的 V1 规范化测试通过，只能证明模型读取路径不把 V1 当作 V2；不能抵消 C-1 所述 runtime legacy control path 仍可执行 V1。

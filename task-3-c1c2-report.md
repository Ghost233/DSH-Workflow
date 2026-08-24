# Task 3 C1/C2 修复报告

## 结论

C1 与 C2 已按限定范围修复：计划批准现在以 workflow worktree 中实时读取的正式 Owner Registry 为准，proposal approval digest 与 Registry content digest 已分离；`handoff_replan` 在运行 Planner 前要求 live Registry 存在，并在保存新计划前拒绝未登记或定义漂移的 Owner。

## 根因与修复

### C1：live Registry 内容 digest 门禁

- 根因：`approveOwnerChange` 把 proposal digest 写入 `state.registryDigest`；`approvePlan` 只比较调用参数与该缓存值，不读取正式 Registry，也不重新核对计划 Owner。
- 新增统一的 live Registry 规划校验：读取或初始化正式 Registry、计算规范化 content digest、比较状态绑定 digest，并按入口要求核对计划 Owner 定义。
- `plan_approve` 现在要求状态已绑定 Registry content digest，并同时校验 live digest、状态绑定 digest、调用者 digest、计划内可选绑定 digest 和 Owner 定义。
- `registry_status.registryDigest` 现在返回 live content digest，`boundRegistryDigest` 单独暴露 workflow 状态绑定值。
- Registry 提案批准后，`approvedProposalDigest` 保存被批准的 proposal digest；`registryDigest` 保存批准后正式 Registry 的 content digest。日志、返回值和 workflow summary 均保持两者分离。

### C2：handoff Registry 门禁

- `handoff_replan` 在调用 Planner 前加载 live Registry，并校验当前计划 Owner。
- Planner 返回的新计划在保存前再次对 live Registry 校验全部 Owner 定义。
- Handoff 重规划不允许夹带 `registryOperation`；Registry 变化仍必须走独立 proposal/approve/replan 流程。
- `planWorkflowState`、`revisePlan`、`replanHandoffs`、`reviewPlan` 与 `approvePlan` 共用同一 live Registry 校验路径。

## TDD 记录

修复前运行：

- `node --test owner-workflow-plugin/test/control.test.mjs`：19/23 通过。预期失败覆盖 live Registry 缺失、内容漂移、Owner 定义漂移及 proposal/content digest 混用。
- `node --test owner-workflow-plugin/test/resilience.test.mjs`：16/20 通过。预期失败覆盖 proposal/content digest 分离、handoff 缺失 Registry、handoff 未登记 Owner；另有一项 I1 跨 Runtime 原子性测试失败。

修复后针对 C1/C2 运行：

- `node --test --test-name-pattern='计划批准|Registry 批准要求' owner-workflow-plugin/test/control.test.mjs`：4/4 通过。
- `node --test --test-name-pattern='两个 Runtime 竞争批准|handoff_replan' owner-workflow-plugin/test/resilience.test.mjs`：4/4 通过。

完整回归：

- `node --test owner-workflow-plugin/test/control.test.mjs`：23/23 通过。
- `node --test owner-workflow-plugin/test/resilience.test.mjs`：19/20 通过。唯一失败为 `另一个 Runtime 持有 workflow CAS 锁时批准不会先改 Registry`，对应审查报告 I1 的 Registry 文件与 workflow state 跨 Harness 原子性问题；本任务明确仅修复 C1/C2，因此未扩展到 I1。

## 范围确认

- 实现只修改 `owner-workflow-plugin/src/runtime.mjs`。
- 回归测试限定在 `owner-workflow-plugin/test/control.test.mjs` 与 `owner-workflow-plugin/test/resilience.test.mjs`。
- 本次未修改 `registry.mjs`、`index.js`、runner 或其他实现文件。
- 未提交 Git。

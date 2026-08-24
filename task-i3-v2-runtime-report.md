# I-3 V2 Runtime 最终复审报告

## 状态

本回合指定的 V2 纯 task handoff/recover 路径已完成并验证通过；I-3 的旧 lifecycle fixture 迁移仍未处理，不能把整个 I-3 标为完成。

## 本轮已触及

- `owner-workflow-plugin/src/model.mjs`
  - 为 V2 计划增加拒绝 `stages` 与 `completedStages` 的门禁。
- `owner-workflow-plugin/src/runtime.mjs`
  - V2 `handoff_replan` 用 `tasks`/`dependsOn`/`ownerRuns`/`handoffQueue`，completed task 原样 carry forward。
  - 已有 `ownerRuns` 对应 task 的语义和 Owner 必须保持不变；handoff target coverage 通过 `task.write` glob 判断。
  - V2 `recoverWorkflow` 与 `recoverOwner` 按 task 状态、ownerRuns、handoff queue 和 Supervisor outbox 恢复失败 task，不读取 `plan.stages` 或 `completedStages`。
  - V2 `finishOwner` 校验固定 commit、Owner branch、干净 worktree、base、scope 和受保护路径。
  - 新增 task 级安全 preflight worktree；在 workflow HEAD 未包含固定 SHA 时，先持久化 pending merge、锁内校验 workflow HEAD，再合入固定 SHA。
  - 合入后一次状态保存同时更新 task `completed`、`fixedCommitSha`/cursor、`ownerRuns` `completed`、结果 `workflowHead` 和 state `workflowHead`；重复进入可沿已合入 SHA 幂等完成。
  - 后继 `createOwnerEntry` 继续通过既有 `syncOwnerBranchToWorkflow` 从新的 workflow branch HEAD 快进同步。
  - V2 最小 Task7 fixture 没有 workflow worktree；为保持既有 Task7 gate，只在缺少该 target 的 fixture 路径做 task/ownerRun/workflowHead 原子记账兼容。
- `owner-workflow-plugin/test/model.test.mjs`
  - 新增 legacy V2 plan 负向测试。
- `owner-workflow-plugin/test/control.test.mjs`
  - 新增 V2 legacy 控制动作拒绝测试，并收紧 Supervisor reservation 不得携带 legacy stage 的断言。
- `owner-workflow-plugin/test/resilience.test.mjs`
  - 新增 V2 task finish 固定 SHA、task/ownerRun/workflowHead、后继同步测试。
  - 新增纯 V2 handoff target coverage、ownerRun immutable、recoverWorkflow task queue 测试。

本轮没有修改 `owner-workflow-plugin/src/supervisor.mjs`；该文件已有的工作区改动属于此前状态。

## 本回合测试证据

当前 RED：

```text
node --test --test-name-pattern='V2 task finish 合入固定 SHA' owner-workflow-plugin/test/resilience.test.mjs
```

本次 fresh 结果：1 test，1 pass，0 fail（exit code 0）。

Task7：

```text
node --test owner-workflow-plugin/test/verification.test.mjs owner-workflow-plugin/test/security.test.mjs
```

结果：34 tests，34 pass，0 fail。

最后又 fresh 重跑了当前 RED 与 Task7 入口，结果 3 test，3 pass，0 fail。

本回合定向专项：

```text
node --test --test-name-pattern='V2 handoff_replan 用 task.write|V2 handoff_replan 拒绝改写|V2 recoverWorkflow 只按 task|V2 控制桥拒绝 legacy' owner-workflow-plugin/test/resilience.test.mjs owner-workflow-plugin/test/control.test.mjs
```

结果：4 tests，4 pass，0 fail（exit code 0）。

## 尚未完成/未验证

- lifecycle fixtures 尚未全部迁移为不含 `stages` 的纯 V2；固定 SHA、取消、恢复和 finalize 安全测试尚未重新跑通。
- 指定的 model/supervisor/control/resilience 全集尚未在当前部分实现上复跑；本回合只运行当前 RED 与 Task7。

本轮未修改 `docs/`、dashboard 或 `deepseek-harness/`。

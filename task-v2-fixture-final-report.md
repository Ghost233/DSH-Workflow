# V2 测试夹具迁移最终报告

## 状态

BLOCKED。按用户中止指令停止继续修改；本轮没有完成两份测试的全量迁移，也没有达到全通过。

## 基线 RED

执行命令：

```text
cd /Users/admin/code/DSH-Workflow/owner-workflow-plugin
node --test test/control.test.mjs test/resilience.test.mjs
```

结果：退出码 1；共 91 个测试，48 个通过、43 个失败。

主要根因已确认不是生产 V2 校验错误，而是旧测试夹具仍向 `DSH_PLAN_V2` 传入 `stages` / `completedStages`，被生产 `normalizePlanV2` 正确拒绝；另有一处 Supervisor 完成序列仍按旧行为期待 `wait`，而 V2 task 已完成后应直接进入 `stop`。

## 已迁移

仅修改了 `owner-workflow-plugin/test/resilience.test.mjs`：

- `createPlan` 已改为直接返回纯 `DSH_PLAN_V2`，使用 `tasks`、task 级 `dependsOn`、`write`、非空 `verify` 和 `done`，不再返回 `plan.stages`。
- `createWorkflow` 已删除 `completedStages` / `stageResults` 状态，并统一用 `createTaskState(plan)` 初始化 task states。
- `createOwner` 已改为调用真实的 V2 `runtime.createOwnerEntry`，删除 `v2Stage` 适配器。
- 多处恢复、Registry race、handoff、finalize 的夹具引用已改为 `plan.tasks` / task state；finalize 安全夹具已去掉旧 stage Owner 变体，改用合法 V2 Owner 路径。
- 新增了 task state 与 `awaiting_finish` 夹具辅助函数，供后续 task finish 等价测试使用；尚未接入全部旧 stage 合并测试。
- 生产文件没有修改。

## 未迁移 / 阻塞项

- `owner-workflow-plugin/test/control.test.mjs` 尚未修改；其中仍有 Registry/V1 与 finalize/Supervisor fixtures 携带 `plan.stages`、`completedStages`、`stageResults`。
- `resilience.test.mjs` 中旧的“阶段合并”测试组尚未替换为 `finishOwner`、task state 和 Supervisor completion 等价测试，仍包含 `mergeExternalStage`、`stageResults` 与 `completedStages` 断言。
- Supervisor 真实生命周期测试尚未把已完成 task 后的旧 `wait + supervisor-ack` 序列改为 V2 的直接 `stop + supervisor-stop`。
- resilience 的“规划中恢复”断言仍与当前 V2 `recoverWorkflow` 只恢复 failed task 的语义不一致。
- 尚未完成最终 control/resilience 全量 GREEN 验证，不能声称 DONE。

## 范围核对

- 生产代码：未改。
- 本轮新增报告：`task-v2-fixture-final-report.md`。
- 由于工作区原有文件大量为用户未提交改动，本报告不对其作归属或清理判断。

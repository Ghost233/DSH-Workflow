# Control V2 fixture 迁移报告

## 状态

DONE

## 范围

- 本轮只修改 `owner-workflow-plugin/test/control.test.mjs`，并新增本报告。
- 未编辑生产代码。
- 保留真实 V1 历史兼容/只读拒绝 fixture 中的 `stages`、`completedStages` 和 `stageResults`。

## 迁移内容

- Supervisor V2 fixture 改为使用 `ownerRuns`、`workflowHead` 和运行时创建的 task states；V2 Owner 现场使用 `taskId`。
- Supervisor 完成测试在 task 完成后直接取得 `stop`，通过 `supervisor-stop` 结束，不再确认旧的 `wait` receipt。
- finalize 与 Implementation Review fixture 均改为纯 `DSH_PLAN_V2`：只使用 `tasks`、task states、`ownerRuns` 和 `workflowHead`，删除 plan 内的 `stages` 及状态层的旧阶段字段。
- handoff 重规划 fixture 改为纯 V2 task states，并绑定当前 `workflowHead`。
- 主工具取消 fixture 移除旧 `completedStages`，保留 task state 与 `workflowHead`。
- 末尾 `DSH_PLAN_V1` 控制桥/外置执行入口只读拒绝测试保持原样，继续覆盖 V1 可读但不可执行的历史边界。

## TDD 与验证证据

基线运行：

```text
node --test test/control.test.mjs
42 tests，39 pass，3 fail
```

基线失败分别对应：Supervisor 完成测试仍按旧 `wait` 确认、finalize V2 fixture 携带 `stages`、Implementation Review V2 fixture 携带 `stages`。

最终运行：

```text
node --test test/control.test.mjs
42 tests，42 pass，0 fail，0 cancelled，0 skipped
```

未运行 resilience 或其他测试文件；本任务验收范围为 control 全套。

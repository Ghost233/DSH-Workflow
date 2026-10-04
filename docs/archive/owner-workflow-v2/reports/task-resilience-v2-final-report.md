# Resilience V2 迁移最终报告

## 状态

DONE。`resilience.test.mjs` 的剩余 7 项失败已迁移为纯 V2 语义；生产代码仍严格拒绝 `stages`、`completedStages` 与 V2 `merge-stage`，未放宽 legacy 调度路径。

## 最终验证

完整 resilience：

```text
cd /Users/admin/code/DSH-Workflow/owner-workflow-plugin
node --test test/resilience.test.mjs
```

结果：退出码 0；47 个测试全部通过，0 失败。

最后 handoff 用例定向验证：

```text
node --test --test-name-pattern='V2 task finish 按 task.write 覆盖把 handoff queue 标记为 completed' test/resilience.test.mjs
```

结果：退出码 0；1/1 通过。

## 迁移覆盖

- `finishOwner` 固定 SHA 合入，并同步 task、`ownerRuns`、`workflowHead`。
- Owner branch 在固定提交后继续移动时拒绝结算，不跟随后续提交。
- workflow 已实际合入但状态未记账时，`finishOwner` 恢复并幂等完成。
- V2 `pendingTaskMerge` 恢复只清理 task preflight，保留 Owner worktree 与 branch。
- cancel 保留 dirty worktree、workflow worktree、branch、日志和 Supervisor 现场，并拒绝迟到结算。
- workflow recovery 只恢复 failed task、`ownerRuns` 与 Supervisor reservation；planning 状态不走恢复路径。
- 目标 Owner 完成 task 后，按目标 task 的 `write` 覆盖 handoff 文件，将对应 handoff 标记为 `completed`、记录 `completedTaskId` 并写入完成日志。
- Registry race、handoff replan、finalize 清理/冲突、固定 review SHA 和 Supervisor/task recovery 覆盖保持通过。

## 变更范围

- 修改：`owner-workflow-plugin/test/resilience.test.mjs`
- 修改：`owner-workflow-plugin/src/runtime.mjs`：V2 `finishOwner` 按 `task.write` 覆盖完成 planned handoff，并记录 `handoff.completed` 日志。
- 未引入或恢复任何 `stages`、`completedStages`、`stageResults` 执行依赖或 V2 `merge-stage` 调度入口。

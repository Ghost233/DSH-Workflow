# Task 6 Important 1 修复报告

## 根因

`owner-workflow-plugin/src/supervisor.mjs` 原先只按全局 `parallel` 槽位截取 ready task，没有排除已有 `running` task 占用的 Owner，也没有在同一批次内按 `ownerId` 去重。因此同一 Owner 的多个 ready task 会进入同一个 `create` receipt，触发固定 Owner lease 的伪失败。

## 修复

- 每批 `create` 最多选择一个相同 `ownerId` 的 ready task；未入选 task 保持 `pending`。
- 已有 `running` task 的 Owner 不再进入本批派发；`running + executorId=null` 的 reserved 形态同样受保护。
- 不同 Owner 仍可在剩余并行槽位中同时派发。
- 保留原有 `actionId` 对完整任务状态投影、计划身份、revision 和动作 payload 的绑定，以及既有 status/action ACK 校验。

## TDD 验证

先加入回归测试后运行：

```text
node --test test/supervisor.test.mjs
tests 15; pass 13; fail 2
```

两个失败分别命中：同 Owner ready task 被同批派发、已有 running/reserved Owner 未被排除。

实现最小修复后运行：

```text
node --test test/supervisor.test.mjs
tests 15; pass 15; fail 0
```

## 变更范围

- `owner-workflow-plugin/src/supervisor.mjs`
- `owner-workflow-plugin/test/supervisor.test.mjs`
- `task-6-i1-report.md`

未提交 Git commit。

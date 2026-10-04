# Task 4 Important 修复报告

## 范围

- 修改：`owner-workflow-plugin/src/supervisor.mjs`
- 修改：`owner-workflow-plugin/test/supervisor.test.mjs`
- 未修改 runtime，未提交。

## 修复内容

1. `actionId` 现在绑定 workflow ID、workflow revision、规范化计划指纹、完整任务投影、并行配置和 `actionSequence`。计划、revision、任务投影或配置变化后的旧 ACK 都会被拒绝。
2. ACK 观测按动作使用闭合 schema。`create` 的显式 `status` 仅接受 `running`；`wait`/`inspect` 仅接受 `running`、`completed`、`stopped`，并严格校验 stopped 的 reason/action；`notify`/`stop` 仅接受空观测。
3. 状态规范化拒绝非法任务状态和 running 数超过 `config.parallel` 的恢复状态；合法 `wait` 覆盖全部 active task。
4. `actionSequence`、`unchangedPolls` 与并行值仅接受安全整数；到达不可递增的 action sequence 上限时关闭处理，避免 ACK 后 sequence 或 actionId 重用。

## TDD 与验证

- 新增回归测试后，旧实现的 Supervisor 测试为 7 通过、5 失败，失败点覆盖 actionId 绑定、ACK schema、并行恢复状态和安全整数。
- 额外对 notify ACK 的拒绝分支执行了 RED 验证：移除该分支校验后，测试因“缺少预期异常”失败；恢复校验后通过。
- 最终执行：

```text
node --test test/supervisor.test.mjs test/model.test.mjs
```

结果：45/45 通过。

# Task 3 C1A 竞态修复报告

## 实施结果

- Owner 获得自身 lease 后，启动路径在 `withOwnerLease(workflow-lock-<workflowId>)` 跨进程临界区内重新读取 workflow state。
- 写入 `ownerRuns[*].status = "starting"` 前重新调用既有启动校验，覆盖 approved/running 状态、计划批准、plan review digest、正式 Registry digest 及计划 Owner。
- 最新 state 为 `registry_pending_plan` 时，校验失败；不会写入 `starting`，也不会创建或执行 Owner entry。
- 未修改 approval、Registry 或 Runner 侧代码。

## 回归测试

- 新增确定性测试：在 workflow lease 临界区进入后模拟 Registry approval 已使最新 state 失效，断言启动被拒绝、`ownerRuns` 未写入且 Owner 未执行。
- 验证命令：`node --test test/resilience.test.mjs`
- 结果：23 passed，0 failed。

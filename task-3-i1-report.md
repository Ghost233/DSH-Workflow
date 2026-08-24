# Task 3 I1 修复报告

## 结论

Task 3 Review I1 已按限定范围修复：Registry approval 现在先进入 workflow state 的跨进程写锁与 revision CAS 临界区，在临界区内重新读取并校验 proposal、digest、revision 和活动任务状态。两个 Runtime 对同一 proposal 竞争批准时最多一个成功；锁竞争或陈旧 revision 的失败者不会修改 Registry 内容或 Git index。

状态文件原子保存若在 Registry 应用后失败，Runtime 会通过 `applyApprovedRegistryChange` 的既有 Registry 事务安装反向恢复提案，把正式 Registry 与 index 恢复到 proposal 应用前；恢复失败会以 `AggregateError` 明确报告不完整回滚，不会静默吞掉错误。

## 根因与修复

- 根因：`approveOwnerChange` 原先先调用 `applyApprovedRegistryChange`，之后才由 `saveState` 获取 workflow state 跨进程写锁并做 revision CAS。锁冲突或 revision 变化会拒绝 state 保存，但 Registry 和 index 已经提交。
- `saveState` 现在允许在取得跨进程写锁、重新读取磁盘 state 并通过 revision CAS 后执行受保护的 state 准备操作；普通调用仍沿用原保存路径。
- `approveOwnerChange` 在该临界区中重新校验 state contract、项目归属、活动任务、`pendingRegistryProposal` 和批准 digest，校验通过后才应用 Registry。
- Registry 应用成功后才构造并保存对应 workflow state；state 原子写失败时执行反向 Registry 事务恢复。
- `writeJsonAtomic` 会清理失败的临时文件，避免原子 rename 失败后留下 state 临时内容。

## TDD 记录

修复前运行：

- `node --test owner-workflow-plugin/test/resilience.test.mjs`：19/20 通过。失败项为 `另一个 Runtime 持有 workflow CAS 锁时批准不会先改 Registry`；实际 Registry 比期望多出 `owner-c`。
- 增加 state 保存故障注入测试后、加入回滚实现前运行 `node --test --test-name-pattern='workflow state 原子保存失败' owner-workflow-plugin/test/resilience.test.mjs`：0/1 通过；实际 Registry 同样残留 `owner-c`，证明测试命中半应用问题。

GREEN 针对验证：

- `node --test --test-name-pattern='两个 Runtime 竞争批准|另一个 Runtime 持有 workflow CAS 锁|workflow state 原子保存失败' owner-workflow-plugin/test/resilience.test.mjs`：3/3 通过。
- 竞争测试断言恰好一个 approval fulfilled、一个 rejected，并校验 live Registry、workflow state digest、approved proposal digest、Git index 路径和 worktree/index 一致。
- CAS 锁失败与 state 保存故障测试都校验 Registry owner 集合、pending proposal、绑定 digest、approved digest、完整 Registry index 快照和 worktree/index 一致；故障注入测试还校验无 state 临时文件残留。

## 完整验证

- `node --test owner-workflow-plugin/test/resilience.test.mjs`：21/21 通过。
- `node --test owner-workflow-plugin/test/control.test.mjs`：23/23 通过。
- `npm test --prefix owner-workflow-plugin`：147/147 通过，0 失败、0 跳过。

## 范围确认

- 实现只修改 `owner-workflow-plugin/src/runtime.mjs`。
- 测试只修改 `owner-workflow-plugin/test/resilience.test.mjs`；未修改 `control.test.mjs`。
- 新增本报告 `task-3-i1-report.md`。
- 未修改 `registry.mjs`、`index.js`、runner 或其他实现文件。
- 未执行 Git commit。

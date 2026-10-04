# Task 6：主工具公开 cancel 报告

## 范围

- `owner-workflow-plugin/index.js`
  - 主工具 ACTIONS 已公开 `cancel`。
  - 参数动作枚举及中文动作描述包含 `cancel`。
  - 主工具中文说明明确 `action=cancel` 的取消语义。
  - `execute` switch 调用 `runtime.cancelWorkflow(agent, workflow_id)`，并复用 `requireString` 校验参数。
- `owner-workflow-plugin/test/control.test.mjs`
  - 验证主工具暴露 `cancel` 且保留 `status` 旧动作。
  - 验证缺少 `workflow_id` 时拒绝。
  - 验证主工具 cancel 返回 `cancelled`，随后 status 返回 `cancelled` 并落盘。

未修改 runtime、runner 或 docs；未提交 Git commit。

## TDD 证据

1. RED：新增主工具测试后运行 `node --test test/control.test.mjs`，新增测试因主工具中文说明尚未包含 `action=cancel` 而失败；同时暴露出当前 control 中已有的 runtime 测试失败。
2. GREEN：补充 index.js 中文说明并修正测试 fixture 使用 Git 实际仓库根路径。
3. 定向验证：

   ```text
   node --test --test-name-pattern='^主工具' test/control.test.mjs
   tests 4 / pass 4 / fail 0
   ```

## 完整 control 结果

```text
node --test test/control.test.mjs
tests 37 / pass 36 / fail 1
```

唯一失败是既有 runtime 测试 `cancel 将活动任务和 reservation 有限结算，幂等保留 outbox 并拒绝后续派发`（`test/control.test.mjs:687`），断言 `saved.supervisorOutbox['T1:api'].status` 为 `cancelled`，实际为 `stopped`。该问题位于 runtime 行为，按本任务约束未修改。

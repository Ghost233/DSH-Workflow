# Task I-1/I-2 最小修复报告

## 结论

DONE。仅收敛修复 V2 required verification 与 Owner 结算/重放的绑定门禁；未修改 docs、dashboard 或 deepseek-harness。

## I-1

- `normalizePlanV2` 对 `role: work` 强制 `verify` 为非空数组；review/verify 任务仍保留原有非验证角色边界。
- 运行时验证门禁再次拒绝持久化 V2 work task 的空 `verify`，避免直接篡改状态绕过模型校验。
- resilience/control fixture 中的 V2 work task 改为绑定 `unit`；仅覆盖取消、恢复等非验证行为的测试显式 mock `assertRequiredTaskVerifications`。

## I-2

- stored verification result 现在必须匹配当前 planDigest、taskId、Owner、session、workflow/task status、writeGeneration，并继续通过当前 worktree 内容与完整 enforcement 证据校验。
- `runExternalOwner` 对 persisted `completed`、`awaiting_finish`、`committed` 快路径先执行 V2 gate，再校验固定 commit、branch、worktree clean 和 required evidence；重放旧证据或脏现场均 fail closed。
- Owner 结果最终写入 `committed` 前，在 workflow lock 内重新校验当前 V2 plan digest、task/Owner/session binding、running 状态和全部 required evidence；并发状态漂移不会被覆盖保存。

## TDD / verification

先加入回归测试后，I-1/I-2 新测试按预期失败（4 failures）；完成最小实现后专项命令通过：

```text
rtk node --test owner-workflow-plugin/test/verification.test.mjs owner-workflow-plugin/test/security.test.mjs owner-workflow-plugin/test/control.test.mjs owner-workflow-plugin/test/model.test.mjs
tests 115
pass 115
fail 0
cancelled 0
skipped 0
todo 0
```

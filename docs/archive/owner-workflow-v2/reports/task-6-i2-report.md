# Task 6 Important 2 修复报告

## 范围

- `owner-workflow-plugin/src/runtime.mjs`
- `owner-workflow-plugin/test/resilience.test.mjs`
- 本报告；未创建提交。

未修改 git helper、finalize、cancel 或 runner。

## 修复

`createOwnerEntry()` 现在在持久 Owner 分支已被 workflow 完整包含时，将恢复任务的审计基线更新为 `syncOwnerBranchToWorkflow()` 返回的当前同步 HEAD。故任务 A 没有独有提交而失败、任务 B 推进 workflow 后，任务 A 的后续差异只从新的同步基线计算，不会把 B 的文件带入 `changedFiles` 或 scope 校验。

旧记录如保存了 `result.commitSha` 或 `partialCommitSha`，恢复前会验证该固定提交：它必须位于原 `baseCommit` 之后且仍在持久 Owner 分支 HEAD 的历史中。否则恢复会安全拒绝，避免通过重置基线掩盖独有固定提交的丢失。

## TDD 证据

1. 既有回归覆盖：A 无独有提交失败，B 合并推进 workflow，恢复 A 后 `baseCommit` 为 B 后的 workflow HEAD，`changedFiles` 只有 `owned/result.txt`，并可结算。
2. 新增回归先运行失败：构造旧记录含 A 的独有固定提交、但 Owner 分支被重置而丢失该提交；运行结果为 `Missing expected rejection`。
3. 实现固定提交历史校验后，两个恢复回归均通过。

## 验证

```text
node --test --test-name-pattern='Owner A 无独有提交失败后恢复|恢复记录含独有固定提交' test/resilience.test.mjs
tests 2; pass 2; fail 0

node --test test/resilience.test.mjs
tests 30; pass 30; fail 0
```

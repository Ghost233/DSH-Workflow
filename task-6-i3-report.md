# Task 6 Important 3 修复报告

## 结论

已修复 finalize 在 Owner worktree 存在 tracked、untracked 或 ignored 脏内容时仍先执行强制清理的问题。

finalize 现在会在任何 worktree/branch 清理副作用之前，先用包含 ignored 文件的 Git 状态检查逐一核对所有已登记 Owner worktree。只要任一 worktree 不干净，本次清理立即关闭处理：不调用后续的 preflight、Owner、workflow worktree 强制删除，不删除 Owner/workflow/preflight 分支或现场；workflow state 保存 `cleanupPending: true`、`cleanupKind: "workflow"` 和包含 worktree、脏路径的明确中文 `cleanupError`。人工审计并清理脏内容后，重试 finalize 会沿用已保存的 `finalMergeHead`，再执行原有清理并清除 cleanupPending 状态。

未实现 cancel，未修改 runner、supervisor、registry，也未提交 Git。

## 根因与修改

`src/runtime.mjs` 已有 Owner dirty 检查，但检查位于 `cleanupOrphanPreflights()` 之后。由于底层 worktree 清理使用 force remove，dirty finalize 在拒绝 Owner 清理前已经删除了 preflight worktree/branch，安全门并未覆盖整个清理阶段。

本次把 `cleanupOrphanPreflights()` 移到所有 Owner worktree 全量检查通过之后。Owner 检查循环仍位于任何 Owner remove 之前，因此不会出现“前面的干净 Owner 已删、后面的 dirty Owner 才报错”的部分清理。

`test/resilience.test.mjs` 的回归矩阵覆盖：

- tracked 修改；
- untracked 文件；
- ignored 文件；
- 三种场景都验证 `cleanupPending/cleanupKind/中文 cleanupError`；
- 三种场景都验证 Owner、workflow、preflight worktree 与对应分支完整保留；
- 三种场景都在清理脏内容后重试 finalize，并验证既有清理成功、`cleanupPending` 清除。

## TDD 证据

基线：

```text
node --test test/resilience.test.mjs
tests 30; pass 30; fail 0
```

RED：先补“dirty 时 preflight 也不得被提前强制删除”及清理后重试断言，未改 runtime 时运行：

```text
node --test --test-name-pattern='finalize 遇到 tracked' test/resilience.test.mjs
tests 4; pass 0; fail 4
```

tracked、untracked、ignored 三个子测试均在 preflight 保留断言处得到 `false !== true`，证明旧顺序确实先发生了删除副作用。

GREEN：移动安全门顺序后重复同一命令：

```text
tests 4; pass 4; fail 0
```

## 最终验证

工作目录：`owner-workflow-plugin`

```text
node --test test/resilience.test.mjs
tests 30; pass 30; fail 0
duration_ms 24735.243417

npm test
tests 193; pass 193; fail 0
duration_ms 28231.665
```

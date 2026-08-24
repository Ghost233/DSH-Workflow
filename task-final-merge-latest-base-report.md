# 最终复审 I-1：latest-base final merge 修复报告

## 状态

DONE。

## 根因

`finalizeWorkflow()` 原先把启动分支当前 HEAD 与 workflow 创建时保存的 `state.baseHead` 强制比较。启动分支只要出现合法的新提交，finalize 就直接拒绝，未执行设计要求的 latest-base 临时预合并。

## 修复

- `git.mjs` 新增 `preflightMerge()`：固定解析 base HEAD，校验完整 review SHA，在临时分支/worktree 中执行合并；合并失败不 abort、不删除 worktree 或分支。
- `runtime.mjs` 改为读取 `baseBranch` 最新 HEAD 创建 final preflight。
- preflight 前后均校验 Implementation Review 固定 SHA、workflow worktree HEAD 与 workflow branch 不发生变化，并确认 preflight HEAD 包含 review SHA。
- preflight 成功后，只有在启动分支 HEAD 未再次变化时才把固定 review SHA 合入启动分支。
- 冲突或竞态失败时保存 `finalMergePreflight`、`finalMergeError`，追加 `workflow.final-merge-failed` 日志，保留 workflow、Owner、preflight 现场，不进入清理。
- `resilience.test.mjs` 新增中文回归覆盖：启动分支新增普通提交成功，以及 latest-base 冲突时现场保留、`MERGE_HEAD` 指向固定 review SHA、状态记录失败。

## TDD 证据

RED：先写两个回归测试并运行：

```text
node --test --test-name-pattern='latest base|最新 base' owner-workflow-plugin/test/resilience.test.mjs
tests 2; pass 0; fail 2
```

失败原因为现有实现仍报“启动分支在 workflow 创建后发生变化”。

GREEN：实现后定向测试：

```text
node --test --test-name-pattern='latest base|最新 base' owner-workflow-plugin/test/resilience.test.mjs
tests 2; pass 2; fail 0
```

回归验证：

```text
node --test owner-workflow-plugin/test/resilience.test.mjs
tests 48; pass 48; fail 0
```

## 变更范围

- 修改：`owner-workflow-plugin/src/git.mjs`
- 修改：`owner-workflow-plugin/src/runtime.mjs`
- 修改：`owner-workflow-plugin/test/resilience.test.mjs`
- 新增：本报告

未主动修改其他文件；工作树中原有的其他 staged、unstaged 和 untracked 改动均保留。

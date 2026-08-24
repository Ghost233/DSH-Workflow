# Task 6a Git helper 报告

## 实现

新增并完成 `syncOwnerBranchToWorkflow(root, ownerWorktree, ownerBranch, workflowBranch, signal)`：

- 校验 Owner worktree 当前绑定 `ownerBranch`；
- 使用 `status --porcelain=v1 --untracked-files=all --ignored -z` 拒绝 tracked、untracked、ignored 任一脏状态；
- 解析 `workflowBranch` 的提交并在 Owner worktree 执行 `git merge --ff-only`；
- 非快进同步转换为中文错误 `无法以快进方式同步 workflow 分支`；
- 成功后返回 Owner worktree 的 HEAD。

## TDD 场景

- 成功快进：通过；
- tracked、untracked、ignored 脏状态拒绝：通过；
- worktree 分支绑定错误拒绝：通过；
- workflow 与 Owner 分叉时非 ff 拒绝且 HEAD 不移动：通过。

## 验证

```text
node --test test/git.test.mjs
10 passed, 0 failed
```

未修改 runtime/runner，未提交 Git commit。

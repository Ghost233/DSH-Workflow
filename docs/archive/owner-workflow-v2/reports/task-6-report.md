# Task 6 实现报告

## 实现范围

- `owner-workflow-plugin/src/git.mjs`
  - 新增 `syncOwnerBranchToWorkflow(root, ownerWorktree, ownerBranch, workflowBranch, signal)`。
  - 同步前把普通、未跟踪和 ignored 文件都视为脏状态并拒绝覆盖。
  - 同步前后校验 worktree 当前分支，错误分支不会先移动 HEAD。
  - 固定 workflow 分支的最新 commit SHA，并使用 `git merge --ff-only` 同步。
- `owner-workflow-plugin/src/runtime.mjs`
  - Owner 分支固定为 `dsh/owner/<workflow>/<owner>`。
  - Owner worktree 固定为 `.dsh-workflow/worktrees/<workflow>/owners/<owner>`。
  - 新建、复用或恢复 Owner worktree 后统一调用 owner-sync；新任务以同步后的 workflow HEAD 作为 `baseCommit`，同任务恢复仍保留持久化 `baseCommit`。
  - 阶段完成只清理 preflight，不再删除 Owner worktree；finalize 仍统一删除 Owner worktree、Owner 分支和 workflow 资源。
  - 已持久化的旧 `stage-<stage>-a<attempt>-<owner>` worktree 与旧分支仍可按原记录恢复，阶段清理不会静默删除。
- `owner-workflow-plugin/test/git.test.mjs`
  - 覆盖 ff-only 快进、ignored 脏文件拒绝、错误分支拒绝且 HEAD 不移动。
- `owner-workflow-plugin/test/resilience.test.mjs`
  - 覆盖同一 Owner 的两个 V2 task 复用固定分支/worktree，并在首任务合并后同步最新 workflow HEAD。
  - 覆盖旧 stage 路径恢复和阶段重入保留。
  - 覆盖 finalize 才清理固定 Owner worktree/branch。

## TDD 记录

RED：先加入测试后运行：

```text
node --test owner-workflow-plugin/test/git.test.mjs owner-workflow-plugin/test/resilience.test.mjs
tests 33; pass 28; fail 5
```

五个失败分别命中：同步接口尚未导出（3 项）、仍使用 stage/attempt Owner 分支（1 项）、阶段清理仍删除旧 Owner worktree（1 项）。

GREEN：实现后同一命令结果：

```text
tests 33; pass 33; fail 0
```

全量回归：

```text
node --test owner-workflow-plugin/test/*.test.mjs
tests 180; pass 180; fail 0
```

## 交付状态

- 未修改 supervisor、runner、verification、dashboard。
- 未提交 Git commit。

# Task 6b Runtime 路径接入报告

## 实现

- `src/runtime.mjs` 导入并调用 Task 6a 的 `syncOwnerBranchToWorkflow`。
- 新 Owner 现场固定为：
  - 分支：`dsh/owner/<workflow>/<owner>`
  - worktree：`.dsh-workflow/worktrees/<workflow>/owners/<owner>`
- 同一 workflow 中同一 Owner 的后续 V2 task 复用固定分支和 worktree；创建或恢复现场后先同步到当前 workflow HEAD，并把同步后的提交作为新任务 `baseCommit`。
- 同一任务恢复时继续读取持久化的 `baseCommit`、branch 和 worktree；旧 `stage-<stage>-a<attempt>-<owner>` 路径只通过既有运行记录恢复，不再为新任务生成。
- 阶段完成只清理 preflight，不清理 Owner worktree；finalize 统一清理 Owner worktree、Owner 分支及 workflow 资源。

## TDD 覆盖

- RED 覆盖了仍生成 stage/attempt Owner 路径，以及阶段完成误删 Owner worktree 的旧行为。
- GREEN 覆盖：
  - 两个 V2 task 的 Owner branch/worktree 恒定；
  - 首任务提交进入 workflow 后，第二任务现场对齐最新 workflow HEAD；
  - 旧 stage 路径记录可恢复且阶段重入仅清理 preflight；
  - finalize 才清理固定 Owner worktree 和分支。

## 验证

工作目录：`owner-workflow-plugin`

```text
node --test test/resilience.test.mjs
24 passed, 0 failed

node --test test/control.test.mjs
32 passed, 0 failed

node --test test/*.test.mjs
181 passed, 0 failed
```

未修改 runner、supervisor、verification；未提交 Git commit。

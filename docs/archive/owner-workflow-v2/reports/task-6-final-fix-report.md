# Task 6 final rereview 修复报告

日期：2026-08-21

## 结论

Task 6 final rereview 的 Important 1 与 Minor 1 已按 fail-closed 和可等待释放语义修复。修改仅涉及：

- `owner-workflow-plugin/src/runtime.mjs`
- `owner-workflow-plugin/test/resilience.test.mjs`
- `owner-workflow-plugin/test/control.test.mjs`
- 本报告

未修改 Git helper，未提交 Git。

## Important 1：finalize legacy ownerRuns 身份安全门

根因是 finalize 使用 `record.result.worktree ?? record.worktree` 折叠持久化字段，只检查候选路径是否 dirty；顶层与 `result` 冲突会被静默忽略，路径边界、链接和实际 attached branch 均未核验。

本轮增加统一的 Owner cleanup 预检：

1. 同时读取每条 `ownerRuns` 的 top/result `worktree` 和 `branch`，显式拒绝非法类型及字段冲突。
2. worktree 必须是绝对路径，并位于当前 workflow 的受控目录 `.dsh-workflow/worktrees/<workflow-id>/` 内。
3. branch 必须属于当前 workflow 的 Owner 分支前缀。
4. 对仍存在的 worktree，在任何清理副作用前拒绝链接路径、非 worktree 根目录，以及记录 branch 与实际 attached branch 不一致。
5. 同一路径被多条记录绑定到不同 branch 时拒绝清理。
6. 所有身份检查与 dirty 检查全部通过后，才允许清理 preflight、Owner/workflow worktree 和分支。

任何检查失败都会沿现有错误路径保存：

- `cleanupPending: true`
- `cleanupKind: "workflow"`
- `cleanupError`

并保留 workflow、Owner、preflight、外部 worktree 及其分支。合法固定 Owner 路径和旧 `stage-<stage>-a<attempt>-<owner>` 路径仍可完成清理；缺失资源继续使用原有 `missingOk` 幂等语义。

## Minor 1：Supervisor dispatch 与 runtime.dispose

根因是 `queueSupervisorReservations()` 不检查 runtime 释放状态，而 `dispose()` 直接清空 `supervisorDispatches`，没有等待其中仍会调用 `finishOwner()` 和持久化状态的后台 Promise。

修复后：

1. `dispose()` 同步设置 `disposed`，使后续 Supervisor reservation 不再创建 dispatch。
2. 首次 dispose 固定快照已登记 dispatch，并通过 `Promise.allSettled()` 等待其终态后再清空运行时 Map、关闭控制桥和释放 lease。
3. `disposePromise` 让并发或重复 dispose 复用同一释放过程。
4. 原控制测试不再只等待 Owner API 首次调用，而是等待 reservation 持久化为 `completed` 后 teardown。
5. 新增生命周期回归，证明 dispose 在已登记 dispatch 未结算时不会提前完成，且 dispose 开始后不会派发新的 reservation。

## TDD 证据

RED：

```text
node --test --test-name-pattern='runtime\.dispose|finalize 对 legacy|finalize 仍可' test/control.test.mjs test/resilience.test.mjs
tests 11; pass 3; fail 8
```

失败符合预期：dispose 提前完成；六类畸形 legacy 记录未在清理前 fail-closed；合法 fixed/legacy-stage 正向用例保持通过。

GREEN：

```text
node --test --test-name-pattern='runtime\.dispose|finalize 对 legacy|finalize 仍可' test/control.test.mjs test/resilience.test.mjs
tests 11; pass 11; fail 0
```

新增 finalize 回归覆盖：

- top worktree 越出当前 workflow 目录
- result worktree 越出当前 workflow 目录
- worktree 符号链接
- 记录 branch 与实际 attached branch 不一致
- top/result worktree 冲突
- top/result branch 冲突
- 每种拒绝均保存 `cleanupPending`，且不删除任何受保护 worktree/branch
- 合法固定路径与旧 stage 路径仍可清理

## 验证结果

核心两文件组合：

```text
node --test test/resilience.test.mjs test/control.test.mjs
tests 80; pass 80; fail 0
```

Task 6 targeted 四文件单命令联跑：

```text
node --test test/git.test.mjs test/resilience.test.mjs test/control.test.mjs test/supervisor.test.mjs
tests 109; pass 109; fail 0
```

本次联跑未再出现 teardown `ENOTEMPTY`。

Full：

```text
npm test
exit 0

node --test --test-reporter=dot test/*.test.mjs
tests 211; exit 0
```

格式检查：

```text
git diff --check -- owner-workflow-plugin/src/runtime.mjs owner-workflow-plugin/test/resilience.test.mjs owner-workflow-plugin/test/control.test.mjs
exit 0
```

## 最终验收矩阵

| 项目 | 结果 |
|---|---|
| top/result 任一 worktree 越出当前 workflow 受控目录 | fail-closed，保留全部现场 |
| worktree 经过链接 | fail-closed，保留全部现场 |
| 记录 branch 与实际 attached branch 不一致 | fail-closed，保留全部现场 |
| top/result worktree 或 branch 冲突 | fail-closed，保留全部现场 |
| 失败状态持久化 | `cleanupPending=true`、`cleanupKind=workflow` |
| 合法固定 Owner 路径 | 可清理 |
| 合法旧 stage Owner 路径 | 可清理 |
| dispose 后新 Supervisor dispatch | 被阻止 |
| dispose 前已登记 dispatch | 等待终态后释放 |
| targeted 单命令联跑 | 109/109 通过，无 `ENOTEMPTY` |
| full suite | 211 项通过 |

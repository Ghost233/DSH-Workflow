# Task 6 修复后最终只读复审

日期：2026-08-21

## Verdict

**Complete — 建议关闭 Task 6。**

- Critical：0
- Important：0
- Minor：0

本轮未发现仍需阻断 Task 6 关闭的缺陷。`task-6-final-rereview.md` 的 Important 1（legacy `ownerRuns` 清理身份边界）和 Minor 1（Supervisor dispatch 与 `runtime.dispose()` teardown 竞态）均已按 `task-6-final-fix-report.md` 所述落地，并由当前实现、负向回归和重新运行的 targeted/full 测试共同验证。

## 复审范围

只读检查：

- `owner-workflow-plugin/src/git.mjs`
- `owner-workflow-plugin/src/runtime.mjs`
- `owner-workflow-plugin/index.js`
- `owner-workflow-plugin/src/supervisor.mjs`
- `owner-workflow-plugin/test/git.test.mjs`
- `owner-workflow-plugin/test/resilience.test.mjs`
- `owner-workflow-plugin/test/control.test.mjs`
- `owner-workflow-plugin/test/supervisor.test.mjs`
- `task-6-final-rereview.md`
- `task-6-final-fix-report.md`

未修改实现或测试；唯一新增文件是本复审报告。

## Findings

未发现 Critical、Important 或 Minor finding。

## 验收矩阵

| 验收项 | 结论 | 证据 |
|---|---|---|
| legacy 路径边界 | 通过 | `runtime.mjs:313-370` 同时读取 top/result worktree，要求绝对路径且位于当前 workflow 受控目录；存在路径还会拒绝链接并核对真实 worktree 根。`resilience.test.mjs:2007-2135` 覆盖 top/result 越界和符号链接，均在清理前 fail-closed。 |
| branch 身份 | 通过 | `runtime.mjs:329-367` 要求记录 branch 属于当前 workflow Owner 前缀，并核对实际 attached branch；同一路径绑定冲突 branch 也拒绝。分支错配回归通过。 |
| top/result 字段冲突 fail-closed | 通过 | `runtime.mjs:304-352` 拒绝非法字段类型、worktree 冲突、branch 冲突及缺失可核验 branch；`resilience.test.mjs:2067-2095` 的两类冲突回归通过。失败路径由 `runtime.mjs:3569-3575` 保存 `cleanupPending=true`、`cleanupKind=workflow`，且身份/dirty 全量预检位于任何清理副作用之前。 |
| 合法 fixed/legacy-stage 路径兼容 | 通过 | `resilience.test.mjs:2137-2162` 同时证明固定 Owner 路径和旧 stage Owner 路径仍能完成 finalize 清理，避免安全门误伤合法历史状态。 |
| dispose 等待、无已知 teardown race | 通过 | `runtime.mjs:2226-2251` 在 disposed 后拒绝新 dispatch；`runtime.mjs:4406-4436` 首次 dispose 固定已登记 dispatch 快照、复用 `disposePromise`，并在清空运行时状态及关闭桥/lease 前 `Promise.allSettled()` 等待终态。`control.test.mjs:304-395` 同时等待真实 reservation 终态，并验证 dispose 不提前返回、不接收新 dispatch。targeted 联跑未再出现 `ENOTEMPTY`。 |
| 同 Owner 限流 | 通过 | `supervisor.mjs:161-170` 排除 active Owner，并在同一批次按 Owner 去重；`supervisor.test.mjs:76-145` 覆盖不同 Owner 并行、同 Owner ready 去重以及 running/reserved 排除。 |
| 恢复审计 base | 通过 | `runtime.mjs:2677-2729` 验证旧 base 与固定提交历史；Owner HEAD 已进入推进后的 workflow 时使用同步后 HEAD 作为新审计 base，否则保留旧 base。`resilience.test.mjs:442-585` 覆盖跨 Owner 推进后的恢复和固定提交丢失拒绝。 |
| dirty 现场保留 | 通过 | `runtime.mjs:3547-3558` 在任何 preflight/Owner/workflow 清理前检查 tracked、untracked、ignored；底层 `git.mjs:264-275` 默认不再强制删除 dirty worktree。`resilience.test.mjs:1872-2005` 三类现场及清理后重试均通过。 |
| cancel 现场保留 | 通过 | `runtime.mjs:3852-3905` 只有限结算 workflow/task/Owner/reservation 并保存取消日志，不调用 Git/worktree 清理；`index.js:9-29,69-81,143-146` 公开并说明 cancel。`resilience.test.mjs:306-439` 覆盖 dirty、分支、workflow worktree、日志、幂等和 finalized 拒绝。 |
| rebase/merge/cherry-pick fail-closed | 通过 | `git.mjs:226-261` 在 dirty、branch 和 ff-only 同步前检测三类进行中操作；`git.test.mjs:158-245` 断言 clean paused 操作被拒绝且 HEAD/Owner ref 不移动。 |
| 仅 finalize 清理固定现场 | 通过 | 阶段清理 `runtime.mjs:3199-3219` 只处理 preflight；cancel 不清理；Owner/workflow worktree 与分支的正常删除只位于 `runtime.mjs:3483-3593` 的 finalize 路径。旧阶段重入仍保留 Owner worktree。 |

## 与前两份报告对照

- `task-6-final-rereview.md` 的 Important 1 已闭合：当前 finalize 不再信任单一 `result.worktree ?? worktree`，而是先验证两个来源的一致性、受控目录、链接、真实 worktree 根和 attached branch；任一异常都会在删除前进入 `cleanupPending`。
- `task-6-final-rereview.md` 的 Minor 1 已闭合：dispose 会阻止新派发并等待已登记 dispatch；原 teardown 用例也等待 reservation 持久化为 `completed` 后才删除 fixture。
- `task-6-final-fix-report.md` 所列六类 legacy 负向场景、两类合法路径和 dispose 生命周期回归均与当前代码、测试一致。

## 测试结果

工作目录：`owner-workflow-plugin`

Targeted 四文件单命令：

```text
node --test test/git.test.mjs test/resilience.test.mjs test/control.test.mjs test/supervisor.test.mjs
tests 109; pass 109; fail 0; cancelled 0; skipped 0; todo 0
exit 0
```

Full：

```text
npm test
tests 211; pass 211; fail 0; cancelled 0; skipped 0; todo 0
exit 0
```

targeted 联跑和 full 均未复现此前 `ENOTEMPTY` teardown 失败。

## 最终结论

Task 6 的固定 Owner branch/worktree、脚本化 ff-only 同步、同 Owner 限流、恢复审计 base、Git 进行中操作拒绝、dirty/cancel 现场保留、legacy 清理身份安全门以及 dispose 等待语义均已闭合。当前证据支持 **Complete / 可关闭 Task 6**。

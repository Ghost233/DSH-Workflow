# Task 6 最终只读再复审

## Verdict

**Important — changes required；不建议按当前状态关闭 Task 6。**

- Critical：0
- Important：1
- Minor：1

同 Owner 限流、恢复审计 base、已登记 Owner 现场的 dirty finalize 保全、cancel 不删除、rebase/merge/cherry-pick 拒绝、阶段后保留固定 worktree 等前次问题均已落地并有回归。剩余 Important 是 finalize 对持久化旧记录中的 worktree 路径缺少受控目录/分支身份复核：畸形、陈旧或被错误复用的记录可以让 finalize 删除工作流目录之外的另一个干净 linked worktree。另有一个后台 Supervisor dispatch 与 runtime dispose 的时序问题，已在 targeted 联跑中触发一次 teardown 失败。

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
- `task-6-final-review.md`、`task-6-i1-report.md`、`task-6-i2-report.md`、`task-6-i3-report.md`、`task-6-cancel-runtime-report.md`、`task-6-cancel-index-report.md`

未扩大到 verification/dashboard；未修改实现或测试。

## Findings

### Important 1：finalize 信任旧记录中的任意 worktree 路径，可删除工作流目录外的干净 linked worktree

`src/runtime.mjs:3476-3478` 直接从 `ownerRuns[*].result.worktree ?? ownerRuns[*].worktree` 收集路径。后续只检查该路径是否存在及是否 dirty（`3479-3488`），然后把路径原样传给 `removeWorktree(root, ownerWorktree)`（`3491-3492`）。这里没有像 `createOwnerEntry()` 的 `src/runtime.mjs:2617-2618` 那样验证路径位于受控 worktree 根，也没有校验该 worktree 当前绑定的分支与记录中的 Owner 分支一致。

本次只读复审在 `/tmp` 中构造了一个完成态 workflow，并让一条 legacy `ownerRuns` 记录指向同仓库、工作流目录之外的另一个干净人工 linked worktree。调用 `finalizeWorkflow()` 后探针结果为：

```json
{"externalWorktreeExistedBefore":true,"externalWorktreeExistsAfterFinalize":false}
```

这不要求业务分支或 Owner 代码参与；只要持久状态陈旧、畸形，或旧路径后来被另一个 worktree 复用即可触发。dirty tracked/untracked/ignored 内容仍会被现有安全门拦住，因此本探针没有证明未提交内容丢失；但删除工作流边界之外的合法 worktree 仍违反“finalize 只清理本 workflow 固定现场”和旧记录 fail-closed 的要求。

现有 legacy 回归 `test/resilience.test.mjs:1597-1677` 只覆盖合法旧 stage 路径恢复与阶段重入保留，没有覆盖越界路径、跨 workflow 路径、记录分支与实际 worktree 分支不一致，因而不能阻止该回归。

建议在任何 status/remove 副作用前，对每个旧记录候选同时校验：路径位于当前 workflow 的受控根内；真实路径不经过链接；已登记 worktree 的 attached branch 与记录分支一致；分支属于当前 workflow 的 Owner 前缀。畸形记录应保存 `cleanupPending` 并保留全部现场。应同时枚举并核对顶层与 `result` 中的路径，不能用 `??` 静默忽略冲突字段。

### Minor 1：runtime dispose 不等待后台 Supervisor dispatch，targeted 联跑出现 teardown 竞态

`src/runtime.mjs:2156-2178` 把后台 dispatch Promise 放入 `supervisorDispatches`；但 `src/runtime.mjs:4337-4347` 的 `dispose()` 直接清空该 Map，没有等待或停止其中的 Promise。`test/control.test.mjs:304-352` 只等到 stub Owner API 被调用便进入 dispose/删除 fixture，未等待 dispatch 后续的 `finishOwner()` 路径结束。

四个 targeted 文件联跑时，该用例的业务断言通过后在 teardown 触发：

```text
ENOTEMPTY: directory not empty, rmdir '.../dsh-supervisor-control-.../.dsh-workflow'
tests 98; pass 97; fail 1
```

同一用例单独重跑、四组测试分别顺序运行及 full suite 均通过，说明这是负载相关竞态而不是本次核心语义断言失败。它仍会削弱测试稳定性，并允许插件释放后尚未结算的 dispatch 继续碰触持久状态。建议 dispose 先阻止新派发，再等待或有界取消现有 dispatch；测试 teardown 也应等待 reservation 达到终态，而不是只等待 Owner API 首次被调用。

## 验收矩阵

| 验收项 | 结论 | 证据 |
|---|---|---|
| 同 Owner 限流 | 通过 | `supervisor.mjs:161-170` 同时排除 active Owner 与同批重复 Owner；`supervisor.test.mjs:96-145` 覆盖同批、running 和 reserved；不同 Owner 并行仍通过 |
| 恢复审计 base | 通过 | `runtime.mjs:2630-2657` 校验旧 base/固定提交历史，并在 Owner HEAD 已进入 workflow 时采用同步后 HEAD；`resilience.test.mjs:442-585` 覆盖跨 Owner 推进与固定提交丢失拒绝 |
| dirty finalize 保全 | 通过（已登记且路径可信的现场） | `runtime.mjs:3476-3506` 在任何 preflight/Owner 清理前检查 tracked、untracked、ignored 并保存 `cleanupPending`；`resilience.test.mjs:1783-1916` 三类现场及重试均通过 |
| cancel 不删除 | 通过 | `runtime.mjs:3783-3835` 只有限结算状态并记录 cancel，不调用清理；`index.js:23,80,143-144` 公开动作；resilience/control/main-tool 回归覆盖 dirty 现场、分支、workflow worktree、日志、outbox、幂等及 finalized 拒绝 |
| rebase/merge/cherry-pick 拒绝 | 通过 | `git.mjs:226-261` 在 dirty/branch/merge 前检查操作标记；`git.test.mjs:158-245` 用 clean paused 三类操作断言 HEAD 与 Owner ref 不移动 |
| 固定 worktree 仅 finalize 清理 | 通过 | 固定路径由 `runtime.mjs:222-237` 生成；阶段清理 `3128-3148` 只处理 preflight；cancel 无删除；Owner worktree 正常删除只在 finalize `3491-3492` |
| 旧记录安全 | **不通过** | 合法旧 stage 路径恢复/保留通过，但 finalize 未验证持久路径边界和 attached branch；受控探针可删除 workflow 外干净 linked worktree |

## 与既有报告对照

- `task-6-i1-report.md`：同 Owner 每批一个、active/reserved Owner 排除已实现；纯 Supervisor 回归通过。
- `task-6-i2-report.md`：恢复时更新审计 base，并验证旧固定提交仍在 Owner 历史中的描述与实现、测试一致。
- `task-6-i3-report.md`：对状态中已登记、可信路径的 Owner worktree，tracked/untracked/ignored 全量预检及 preflight 保留顺序已实现；本次 Important 是其未覆盖的持久路径身份边界。
- `task-6-cancel-runtime-report.md`：取消保留现场、状态有限结算、幂等与 finalized 拒绝均吻合。
- `task-6-cancel-index-report.md`：报告当时提到的 outbox `cancelled`/`stopped` 断言不一致已闭合；当前 control 测试明确断言 `stopped + decision_required/await_user` 并通过。
- `task-6-final-review.md`：原 Important 1/2/3/4 和 rebase 测试缺口均已有对应修复证据；原“畸形 legacy 记录负向测试”缺口仍存在，并被本次探针证明为实际越界清理风险。

## 测试结果

工作目录：`owner-workflow-plugin`

顺序 targeted：

```text
node --test test/git.test.mjs
tests 14; pass 14; fail 0

node --test test/supervisor.test.mjs
tests 15; pass 15; fail 0

node --test test/control.test.mjs
tests 37; pass 37; fail 0

node --test test/resilience.test.mjs
tests 32; pass 32; fail 0
```

四文件单命令 targeted 联跑：

```text
node --test test/git.test.mjs test/resilience.test.mjs test/control.test.mjs test/supervisor.test.mjs
tests 98; pass 97; fail 1
```

唯一失败为 Minor 1 所述 teardown `ENOTEMPTY`；失败用例单独重跑通过。

独立 full：

```text
npm test
tests 200; pass 200; fail 0
```

当前 full 计数为 200，已取代 i3 报告中的 193 以及更早报告中的 181/180。

## 最终结论

Task 6 前次列出的核心调度、恢复 base、dirty/cancel 现场保全和 Git 操作拒绝均已实质修复；cancel 的设计真源也已按“停止派发、绝不删除现场”闭合。但 finalize 仍可因未验证的旧记录路径删除当前 workflow 边界之外的干净 linked worktree，属于 **Important**。修复该路径身份安全门并补畸形 legacy 负向回归后，Task 6 才适合关闭；后台 dispatch/dispose 竞态可作为同轮 Minor 一并收口。

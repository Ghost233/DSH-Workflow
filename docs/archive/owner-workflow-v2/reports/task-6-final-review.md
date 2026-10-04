# Task 6 最终只读复审

## Verdict

**Important — 不建议按当前状态关闭 Task 6。**

- Critical：0
- Important：4
- Minor：2

固定 Owner 分支/worktree、`ff-only` 同步、dirty/错误分支/分叉拒绝、阶段后保留现场、finalize 清理、旧 stage 记录恢复等主体路径已经落地并通过对应测试；但 Supervisor 会同时派发同一 Owner 的多个任务，恢复任务可能保留过旧 `baseCommit`，finalize 会强制删除事后变脏的 Owner worktree，且取消语义在设计、Task 6 计划和实现之间没有闭合。这些问题会导致合法 V2 DAG 确定性失败，或删除未审计现场。

## Findings

### Important 1：Supervisor 会把同一 Owner 的多个就绪任务同时派发，与单 lease/单 Agent/单 worktree 模型冲突

`src/supervisor.mjs:161-164` 仅按全局并行槽位截取 ready tasks，没有按 `ownerId` 去重，也没有排除已有 active Owner。只读探针构造两个无依赖、同属 `api`、`parallel=2` 的任务时，`supervisorNext()` 返回一个同时包含 `T1`、`T2` 的 `create` receipt。

随后 `src/runtime.mjs:2647-2649` 为两个不同 task key 分别启动 `runExternalOwner()`，但第二个运行会被 Owner lease 拒绝；`failSupervisorReservation()` 又会把该任务记为 `stopped/task_failed/repair_task`。这不是业务失败，而是调度器违反了固定 Owner 执行模型造成的伪失败。

影响：同一 Owner 的合法并行根任务不能可靠执行；“同 Owner 多 task 复用”只在串行依赖场景成立。现有 `resilience` 测试只覆盖 `T2 dependsOn T1`，没有覆盖两个同时 ready 的同 Owner task。

建议：Supervisor 每批最多选择一个相同 `ownerId`，并排除已有 running task 所占用的 Owner；增加 Supervisor + control 端到端回归，确认第二个任务保持 pending，首任务结算后再复用同一 session/branch/worktree。

### Important 2：同一任务恢复在 workflow 已推进时会同步新 HEAD，却继续使用旧 `baseCommit`

`src/runtime.mjs:2610-2617` 对新建和恢复记录都无条件执行 owner-sync，但随后使用：

```js
const baseCommit = previous?.baseCommit ?? syncedHead
```

如果任务在未产生独有提交时失败，其他 Owner 随后把提交合入 workflow，再恢复原任务，则 owner 分支可以安全快进到新 workflow HEAD；然而 `baseCommit` 仍是失败前的旧 HEAD。`src/runtime.mjs:3567-3574` 之后从旧 base 计算全部 changed files，会把期间其他 Owner 已合入的文件也算入当前 Owner 变更，并触发错误的 scope 越界拒绝。

影响：跨 Owner 并行工作后，原任务的正常恢复可能无法完成。现有测试覆盖“新任务使用同步后的 HEAD”和“同任务保留旧 base”两个孤立断言，但没有覆盖二者组合。

建议：明确区分“同任务恢复”和“前一任务已结算后的新任务同步”。若恢复前允许 workflow 推进，需要把审计基线建模为同步后的新 HEAD，同时单独固定/验证恢复前已有提交；否则同任务恢复不得无条件快进。增加“任务 A 失败、Owner B 合并、任务 A 恢复”的回归。

### Important 3：finalize 强制删除 Owner worktree 前不复查 dirty/ignored 状态

`src/git.mjs:244-247` 的 `removeWorktree()` 固定使用 `git worktree remove --force`；`src/runtime.mjs:3427-3438` 的 finalize 清理直接调用它，没有像 owner-sync 那样检查 tracked、untracked、ignored 文件。

Owner worktree 在阶段完成后会长期保留，此后若出现进程残留或人工产生的未提交/ignored 文件，finalize 会静默删除这些未审计内容。workflow 已审查 HEAD 不会被污染，但现场数据会丢失。

建议：finalize 清理前对每个 Owner worktree 执行包含 ignored 的 dirty 检查；存在内容时进入 `cleanupPending` 并保留现场，要求显式审计/清理后重试。增加 finalize dirty、untracked、ignored 三类测试。

### Important 4：取消语义未实现，而且验收文字彼此冲突

V2 设计“任务生命周期与恢复”明确要求取消只停止后续派发并保留现场、日志和分支，绝不删除未审计改动；Task 6 计划步骤 4 又写成 worktree 只在 `finalize/cancel` 明确清理中删除。当前主工具 action 没有 `cancel`，runtime 也没有 cancel workflow 路径；只有状态枚举和 Supervisor 的防御性 `cancelled` 处理。

因此当前只能验证“阶段后不清理、finalize 清理”，不能验证用户要求的 cancel 边界，也不能判断 cancel 应清理还是必须保留。Task 6a/6b 报告均未说明这一冲突。

建议：先以 V2 设计为真源统一语义。若遵循设计，cancel 应停止派发并保留所有 worktree/branch，仅 finalize 清理；若产品决定 cancel 也清理，必须修改设计并定义 dirty/未审计现场的保全流程。随后补齐公开 action、runtime 状态转移和 control/resilience 测试。

### Minor 1：没有 rebase-in-progress 的专门回归

当前 owner-sync 先检查 dirty，再检查 attached branch，暂停 rebase 通常会因 detached HEAD 或 Git 拒绝 merge 而 fail-closed；但 `git.test.mjs` 只覆盖 dirty、错误分支和普通分叉，没有显式构造 clean paused rebase 并断言 HEAD/refs 不移动。

用户验收项明确包含 rebase 拒绝，建议增加 clean paused rebase fixture，并同时覆盖 merge/cherry-pick in-progress。当前实现从代码路径看会拒绝，但测试证据不完整。

### Minor 2：全量测试夹具在外部并行压力下有时序脆弱性

四组命令并行启动时，full 首次结果为 180/181，失败项是 `workflow state 原子保存失败时回滚 Registry 内容和 index`：夹具在被测逻辑读取 state 前先把 state 文件替换成目录，实际得到 `current === undefined` 的 TypeError。随后单独重跑 full 为 181/181。

这不是 Task 6 功能回归，但说明该故障注入测试依赖精确时序，不适合与其他重测试进程并行运行。最终验收结果以下方独立重跑为准。

## 验收矩阵

| 验收项 | 结论 | 证据 |
|---|---|---|
| 固定 branch 名称 | 通过 | `runtime.mjs:222-228`；resilience 同 Owner 双任务断言 |
| 固定 worktree 名称 | 通过 | `runtime.mjs:230-237`；路径为 `owners/<owner>` |
| sync 使用 ff-only | 通过 | `git.mjs:232-241`；Git 成功与分叉拒绝测试 |
| dirty 拒绝 | 通过 | tracked/untracked/ignored 统一由 `status --ignored` 拒绝 |
| 错误 branch 拒绝且 HEAD 不移动 | 通过 | `git.test.mjs` 对应测试 |
| rebase 拒绝 | 部分通过 | 实现 fail-closed，但缺专门回归 |
| 同 Owner 多 task 复用 | 部分通过 | 串行 task 的 branch/worktree 与持久 session 复用通过；同 Owner 同批调度失败 |
| 阶段后不清理 Owner 现场 | 通过 | `cleanupCompletedStageArtifacts()` 仅清理 preflight；旧 stage 重入测试通过 |
| finalize 才清理 | 部分通过 | finalize 正常/幂等/恢复测试通过；dirty 现场会被 `--force` 删除 |
| cancel 清理/保留 | 未闭合 | 设计与 Task 6 计划冲突，且没有 cancel action/runtime 路径 |
| 旧 stage 记录安全恢复 | 通过（有限） | 合法旧 branch/worktree 记录恢复并保留；缺畸形 legacy 记录负向测试 |
| lease 交互 | 部分通过 | fencing、跨 workflow 互斥通过；Supervisor 未按 Owner 维度限流 |
| Registry 交互 | 通过 | live digest、CAS、运行中拒绝、回滚测试通过 |
| Supervisor 交互 | 不通过 | 可在同一 create receipt 派发两个相同 Owner 任务 |

## 测试结果

工作目录：`owner-workflow-plugin`

```text
node --test test/git.test.mjs
tests 10; pass 10; fail 0

node --test test/resilience.test.mjs
tests 24; pass 24; fail 0

node --test test/control.test.mjs
tests 32; pass 32; fail 0

node --test test/*.test.mjs  # 独立重跑
tests 181; pass 181; fail 0
```

Task 6a/6b 报告中的当前单组计数与独立重跑一致；较早 `task-6-report.md` 的 full 180/180 已被后续新增测试取代。

## 最终结论

Task 6 的 Git helper 与固定路径实现可以保留，现有测试也证明了主要 happy path 和多项 fail-closed 行为。但在关闭 Task 6 前，至少需要修复 Important 1、Important 2，并明确 Important 4 的取消真源；Important 3 应作为清理安全门一并解决。当前 verdict 为 **Important / changes required**。

# V2 纯任务级 Runtime 修复报告

## 状态

本轮工作已按用户中断指令停止。除本报告外，没有修改 `runtime.mjs`、`model.mjs`、`supervisor.mjs` 或测试，也没有提交 Git。

未修改 `docs/`、`dashboard` 和 `deepseek-harness/`。

## 已修改

- 新增本报告：`task-v2-pure-runtime-report.md`。

## 已核对但未修复

- I-1：V2 `work` task 仍允许 `verify: []`；生产校验和测试 fixture 尚未改为非空验证绑定。
- I-2：最终 Owner 结算尚未补齐 `result.planDigest`、状态、Owner、session、写代次绑定，也未把 `awaiting_finish` 快路径和最终锁内保存统一到完整 V2 gate。
- I-3：V2 runtime 仍存在 legacy `stages` / `completedStages` 执行依赖；任务级 Owner adapter、finish 后安全预合并、task/ownerRun/workflowHead 更新、纯 tasks/dependencies/ownerRuns recover 与 handoff replan 尚未实现；V2 `merge-stage` 尚未按要求拒绝。
- I-4：生产 planner 与 handoff replan prompt 尚未完全切换为 V2 任务级格式。

## C-1 保留情况

现有 V1 控制桥、`runExternalOwner`、`finishOwner`、`recoverOwner` 和 `mergeExternalStage` 拒绝回归仍在工作区测试中；本轮没有触碰相关实现或测试。

## 测试证据

已运行：

```text
node --test owner-workflow-plugin/test/model.test.mjs owner-workflow-plugin/test/supervisor.test.mjs owner-workflow-plugin/test/control.test.mjs owner-workflow-plugin/test/resilience.test.mjs
```

结果：`141` tests，`140` pass，`1` fail。

唯一失败是 `resilience.test.mjs` 的“cancel 活动 Owner 时保留 dirty worktree、分支、日志和未结算现场”；失败发生在取消后的 Owner 结算竞态路径，错误为“工作流已取消，Owner 的未结算结果已保留在现场”。由于用户随后要求立即停止，本轮没有继续诊断或修复。

## 未解风险

I-1～I-4 均未关闭；V2 仍可能依赖 legacy stage 适配，验证证据与最终结算之间仍存在绑定漂移窗口，且当前指定四组测试不是全绿。因此不能声称架构修复完成。

# 新 Workflow 恢复运行策略 V1

协议：`DSH_RECOVERY_RUNTIME_POLICY_V1`，版本 `1`，来源 `R92-T19-REPRESENTATIVE-V1`。

每个新建 Workflow 在规划前写入待激活策略；计划首次批准或原生候选直接激活时，把同一份策略与当前 `planDigest` 绑定并持久化：

```json
{
  "contract": "DSH_RECOVERY_RUNTIME_POLICY_V1",
  "version": 1,
  "source": "R92-T19-REPRESENTATIVE-V1",
  "recoveryProtocol": "DSH_RECOVERY_ADMISSION_V1",
  "totalLimit": 12,
  "problemLimit": 8,
  "ownerAttemptDeadline": "approved_task_on_timeout",
  "ownerTerminationObservationMs": 30000
}
```

`totalLimit` 是整个 Workflow 可新领的恢复 attempt 总数；`problemLimit` 是同一根问题及其跨任务、跨 Owner、拆分或改名后继的上限。一次代表性的单 Owner 候选恢复链依次执行 Planner、普通 Review、Owner advice、Arbiter、后继 Planner、后继 Review，共登记六次持久恢复领取。问题上限 8 为这条链保留一次有限的两阶段 Planner/Review 语义修复；Workflow 上限 12 允许一个完整六次链之外再处理一个有限独立根问题，同时保证两个根的总消耗不能超过 12。实际耗尽规则仍由恢复账本决定，不根据模型文本或运行时全局设置改变。

Owner hard deadline 使用已批准执行包的 `task.onTimeout.afterMs`。当前计划归一化的缺省值是 1,800,000ms；Planner 可以在计划审查和批准前给任务写入 60,000–86,400,000ms 内的明确值。Workflow 激活后，Runtime 全局 `ownerAttemptDeadlineMs` 不能改写它。30,000ms 只用于取消请求后的终态观察窗口，不是模型生成时限；本地 Mock/Harness 的毫秒耗时只验证调用链和持久行为，不用于校准生产模型期限。

## 导入和启用规则

- 新 Workflow 在批准前持有 `recoveryRuntimeRequired` 和 `pendingRecoveryRuntimePolicy`；未批准状态不创建账本，也不被误判为已启用恢复。
- 首次批准把待激活策略转成 `recoveryRuntimePolicy`，写入 `recoveryProtocol`，并以当前 `planDigest` 生成 `DSH_RECOVERY_ADMISSION_CONFIG_V1`。原生规划候选首次激活直接原子写入这四项。
- 策略字段、版本、来源、限额、协议、截止来源或观察窗口缺失、未知或被修改时关闭处理；策略和 admission config 不一致时也拒绝。不得回落为无限额或 legacy。
- PlanRevision 继续使用 T18 的执行版本边和同一账本历史；策略及两级上限不随全局配置、普通批准或新 `planDigest` 重置。
- 既有 active Workflow 若没有 `recoveryRuntimeRequired`，继续按原状态和显式 Runtime 配置解释。它不会被补写新账本，也不会从 `recoveryCount` 或旧 attempt 推算余额。

代表执行记录见 [R92 measurement](../rounds/round-92/measurement.json)，实现与兼容回归见 [R92报告](../rounds/round-92/report.md)。

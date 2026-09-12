# R89 实现复核

## 结论

未发现阻止 T17 标记为开发完成的问题。实现满足工单声明的边界：hard deadline 与既有 idle timeout 分离；先持久 stopping 再取消；取消回调不作为终止证明；未知终止有限返回；同 Owner 保持隔离；独立 Owner 继续；迟到结果经过四元身份和 generation 门禁；恢复账本只在持久 terminal 后结算一次。

## 复核要点

- 时间状态是 attempt 记录的一部分，`fixedDeadlineAt` 不被 heartbeat 更新，`remainingCeilingMs` 只减不增；墙钟倒退关闭处理。
- `stopping` 不进入旧 in-memory orphan 推断，重启后优先读取 session persistence 的 `turn/end`。
- 技术暂停把任务从无限 running/wait 收敛到受支持的 `termination_unconfirmed/inspect_runtime`，不会自动重入同 Owner。
- 结果提交在产生副作用的关键边界重复核验；隔离 worktree 中已经形成但未接纳的旧提交不会进入 Workflow。
- T13恢复 attempt 只有匹配当前 plan/task/Owner/attempt/session/token 的 terminal 才结算；普通初次 attempt 不产生恢复扣费。

## 保留边界

`ownerAttemptDeadlineMs` 当前必须显式配置，`ownerTerminationObservationMs` 有有限默认但仅在 hard deadline 启用时生效。生产代表时长、新 Workflow 默认启用和 legacy 激活策略属于 T19；跨执行版本身份继承属于 T18。本轮没有把测试时长冒充生产参数。

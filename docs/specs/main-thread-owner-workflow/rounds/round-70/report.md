# R70：Owner入口门禁与重放一致性

内部runExternalOwner在初读和持锁最新状态拒绝候选reservation，finishOwner、recoverOwner及admission入口同样拒绝。重放中性化前必须有pending/running task。真实socket仍由既有V2 legacy守卫拒绝；纠正R69将尾部路由视为可达的公开P1误判。

首次开发3通过/1失败：测试错误期待新的门禁文本，而socket实际被更早的V2守卫拒绝；修正证据解读和断言后4/4。正式221通过/7既有跳过，零失败/超时/漂移。独立审查确认实际缺口关闭，无新增P1/P2。日志及R69更正保留。

T15仍开发中，实际Owner派发/验证/提交/Memory/finish生命周期尚未接线。下一步完整接缝和正负端到端要求见owner-lifecycle-audit.md；当前没有把reservation落盘当成任务执行完成。

未commit/push/fetch或同步分支，保留现有修改。main与缓存tracking一致；Harness缓存behind3364、vendor behind4，Synapse detached，实时远端未查询。

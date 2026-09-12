# R50：关闭探针的无效重排

真实 Owner record 已进入 autonomous_incident 时，保护协议探针保留技术暂停，并返回 resumed=false。此前只重排 task，导致预算领取持续拒绝且 Supervisor 再次排队。真实用户待决仍优先处理。

正式测试111/111：runtime恢复40、admission43、session27、现有实际文件证据R06探针1。零失败/跳过/超时/候选漂移；原始日志与命令在test-results.json，源码摘要在candidate.json，增量在round.diff。独立只读审查关闭R49 P2，无新增P1/P2。新测试使用明确标注的受控持久incident状态，连续两次真实driveWorkflow探针返回未恢复且状态/调用不变；不宣称验证了incident产生的完整策略耗尽过程。

这是保守技术暂停，不是已实现按新证据自动升级incident策略。T15仍开发中：其他Supervisor技术拒绝投影、自动超时恢复、外部局部重规划与统一主控制投影尚未完成。下一轮优先处理领取拒绝未产生新失败来源时仍被重新排队的问题，保留真实失败的有限预算重试及独立Owner执行。

T16第二局部证明已由主线程复核，跨进程第三切片在独立proof目录推进；不解锁T17。所有用户既有改动保留，未提交/推送/同步。git-evidence.json记录本地main与tracking相同；Harness落后本地tracking3364，vendor落后4，Synapse detached。未查询实时远端，依赖未同步。

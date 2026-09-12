# R53：技术暂停与用户待决的控制接缝关闭

已批准且state.planReviewDigest绑定当前计划时，保留的awaiting_approval不再跳过技术暂停。测试使用真实Review normalizer（不含虚构的嵌套planDigest）、收敛计算、approvePlan及Supervisor启动，走首次免费失败、付费失败、耗尽后报告与等待。

Runner按本次technicalNotificationId投递并核对delivered/ID，较早pending报告不会抢占；同ID重复投递仍使用既有幂等路径。技术incident与真实typed authority并存时，当前报告未交付显示用户待决并安排交付，交付后用户wait；普通保护协议decision按当前来源去重，避免每次ACK制造新pending。

正式319通过/7既有跳过，0失败/超时/漂移：runtime47、admission43、session27、supervisor22、workflow-state11、control159通过/7跳过、runner10。见test-results.json/原始日志/candidate.json/round.diff。独立审查关闭R52三个P2，无新增P1/P2。

T15仍开发中：自动超时恢复与外部局部重规划尚未接线；问题根映射、直接入口与完整主报告的一致性仍需最终联合核验，不能称整个DAG恢复已收敛。T16已审校第三/四切片，真实恢复新attempt证明和剩余停止适配矩阵正在独立推进，不解锁T17。

未提交、推送或同步。git-evidence.json记录当前工作区与本地tracking：主main一致，Harness落后3364、vendor落后4，Synapse detached；未查询实时远端。用户既有改动全部保留。

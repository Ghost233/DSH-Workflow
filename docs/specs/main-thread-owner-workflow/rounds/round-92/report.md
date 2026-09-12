# R92：T19 有限恢复策略启用完成

新 Workflow 现在冻结 `DSH_RECOVERY_RUNTIME_POLICY_V1`。代表候选恢复链实际登记 Planner、普通 Review、Owner advice、Arbiter、后继 Planner 和后继 Review 六次恢复领取；V1 将单根问题上限固定为8，允许一次有界的两阶段 Planner/Review语义修复，将 Workflow 总上限固定为12。确定性耗尽测试证明同一根第9次因 `problem_exhausted` 拒绝，第二根在总计12次后因 `workflow_exhausted` 拒绝，账本最终分布为8+4。

Owner hard deadline 取自批准执行包的 `task.onTimeout.afterMs`，当前计划默认是1,800,000ms；激活后修改 Runtime 全局 deadline/observation 配置不会改写现场。取消后的终态观察窗口固定30,000ms。代表 Harness 的约2.98秒和独立Owner场景的约3.42秒仅记录本地调用与持久路径，没有拿 Mock 耗时推导生产模型时限。原始测量见 [measurement.json](measurement.json)，配置解释见 [recovery-runtime-policy-v1.md](../../contracts/recovery-runtime-policy-v1.md)。

legacy `workflow_start` 在计划批准前只持有待激活策略，首次批准时与 `planDigest` 绑定；原生候选首次激活直接写入活动策略、恢复协议和12/8配置。策略缺失、未知版本、来源或字段被改写、策略与 admission config 不一致均在 Owner/恢复启动前拒绝。没有新策略标记的旧 active Workflow 保持原行为，重放不会补写账本或改变旧审批。

正式受影响范围371项通过、7个既有legacy跳过、0失败，覆盖12套策略、激活、控制、候选恢复、会话、预算、hard deadline、PlanRevision和Workflow状态测试。两项代表测量另行各通过1次。T19状态更新为开发完成，F11关闭；F7–F9/F11组成的B04实现切片已就绪，仍须在CA01集中候选中与B03及其他模块联合验收。

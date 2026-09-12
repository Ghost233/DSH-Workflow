# R67：候选暂停的独立选择与确认补丁

新增candidateIndependentNext/ackCandidateIndependentCreate。来源与目标Owner任务作为种子，按active A依赖、反向依赖、父子关系闭包排除；保留全量运行槽位及Owner互斥，未投递reservation计入占用。仅create/wait，普通Supervisor不能确认csa来源绑定动作；确认结果只有实际target补丁与actionSequence，不返回可覆盖全局tasks/config的替代状态。

开发初版夹具Owner大写不符合模型约束，6例在初始化失败；已改合法Owner标识。后续开发6/6、7/7、补Composite后8/8；真实Harness暂停集成8/8。正式选择器8、Supervisor22、暂停8、workflow-state11，共49/49，无跳过/失败/超时/漂移。日志保留。

本轮是Runtime调度前置，不改变deriveWorkflowControl，不派发新Owner。后续需要reservation持久绑定、锁内复核及Owner成功/失败收尾隔离后，才能宣称暂停期间独立执行完成。T15仍开发中。

独立审查确认1项P2：reserved/launching reservation对应stopped/completed任务时没有计入全局槽位，需在选择前拒绝矛盾持久状态。下一轮立即修复。未commit/push/fetch；main与缓存tracking一致，Harness缓存behind3364、vendor behind4，Synapse detached，未查询实时远端。

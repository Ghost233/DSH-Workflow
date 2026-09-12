# R87 只读实现审查

审查范围：`planning-checkpoint.mjs` 的可选父执行版本绑定、Runtime 的活跃 checkpoint/compile/review/activate 路径、工具 schema、PlanRevision 迁移和对应原生集成测试。

核对结果：

- 初始 Workflow 路径不带 `executionParent`，既有 checkpoint、激活 journal 和 PlanRevision 1 行为不变。
- 活跃修订只允许由当前 Workflow 根会话发起，并拒绝没有固定 planning snapshot/authorization 的 legacy Workflow 自动迁移。
- 父版本比较包含 Workflow、PlanRevision、plan digest 和 workflow branch；状态进展及兼容旧 attempt 不会被误当作父版本变化。
- 固定候选进入 `pendingPlanRevision` 后才释放 Workflow 锁。中断不会切换 active plan；重放复用同一来源，竞争候选不能覆盖。
- 最终批准再次读取不可变 candidate/review/snapshot、live Registry、root checkpoint 和原 grant，不依赖第一次 staging 的内存结论。
- completed task 定义由既有 freeze 规则保护；兼容 running task 进入 `pending_check`；Owner 变化的旧记录归档并失效。
- 没有发现本轮范围内可确认的 P1/P2。

限制：本轮只读审查由当前实现线程完成，没有把它表述为独立代理复审。跨进程 hard deadline/fencing 与恢复预算继承分别保留给 T17/T18；这两个范围尚未据此通过。

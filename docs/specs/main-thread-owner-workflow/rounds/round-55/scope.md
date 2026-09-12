# R55 T15 重规划共享预算的执行绑定

本轮仅扩展 T13 纯账本的严格执行身份联合，主线程独占 recovery-budget.mjs 与对应测试。保持旧 Owner request 精确字段与 JSON 形状；新增 executionKind=replan_operation、operationId、operationKind（revision_plan/revision_review/handoff_replan）替代 taskId/ownerId，共享其余 workflow/root/request/attempt/version 字段。不同物理调用由后续适配分配 request/attempt，不能因换调用类型或策略重置问题额度。

来源权威、操作来源版本、持久启动和输出对账仍属于后续 T15 adapter，纯账本不自行证明来源。现有 T20 normalizer 继续严格拒绝没有对应 admission intent 的账本项，本轮不绕过它、不新增独立计数器、不启用 Planner 执行。新记录沿现有 V1 账本承载一个明确且封闭的绑定分支；旧实现读取新分支会拒绝，不能降级删字段。无隐式迁移。

完成条件：Owner 与 replan 同根/跨根共享两级限额，混合/未知身份拒绝，所有开始/结算/重放重核完整绑定，失败不退款，JSON 重载和回执防串用保持。正式范围 recovery-budget、recovery-admission、recovery-session（不跑完整 Runtime：生产消费逻辑未改，T20 尚无新分支生产者）。固定候选后只测试/只读审查。

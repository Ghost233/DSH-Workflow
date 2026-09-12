# R81：B01 拆解与原生文档来源记录

沿用 R4 第5.7/5.9节及 R80 回填证据，将原有 B01 展开为 T24–T27，不增加 AC 或重复原有23张工单。实施仅 T24：真实主线程 write/edit → 保留原生观察/CAS → 持久 prepared → 同次工具原生成功观察 → 终态记录。无成功观察或完成记录持久化失败时保留未知，不允许据此推进 checkpoint。

主线程独占 tickets/progress/contracts/本轮证据；t16_cancel_proof 独占 planning-write-journal.mjs、新原生测试和 orchestrator-documents.mjs 接线；其他代理只读。已有用户改动保留，不提交或推送，不修改 Harness。文档写入不隐含本地提交或执行版本激活授权。

正式测试：新原生来源测试、既有 orchestrator-documents、orchestrator-documents-native、planning-references。运行前冻结实际源码/测试摘要与候选副本，按独立入口继续采集，每套外层120秒。真实 Harness 已构建模块必须可加载；skip/零用例不能作为 native 成功。完整 checkpoint/Runner/CA01 未在本轮验收。

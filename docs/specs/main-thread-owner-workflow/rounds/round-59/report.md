# R59：失败handoff接入真实Planner预算与候选落盘

recordHandoffs及requestHandoff生产时固定来源Owner的计划版本、attempt/session及报告/commit类别。实际replanHandoffs保护分支使用失败来源领取共享预算，按同源handoff拆组，一次只为一个问题的组产生候选；普通completed partial不伪装失败。旧项缺来源时拒绝猜测。

规划输入与预算预留原子持久化；实际Planner通过R58适配器执行，期间不持workflow内存锁。应用使用新鲜状态重核源/组/版本/Registry/Git及handoff语义与局部任务边界，不覆盖独立任务并发更新。候选与T13 succeeded在同一事务写入，active plan/tasks/Owner runs保持原版本；语义失败记入原root，下次物理调用付费且受有限额度约束。未知或来源变化不重发，已用额度保留。

成功候选在同Runtime及新Harness上下文中重放，核对原始JSONL receipt及候选digest，不增加模型调用。applied指候选已落盘，不代表Review通过、计划激活或根问题关闭。相关合同见contracts/handoff-recovery-v1.md与replan-session-v1.md。

开发最终7/7；首次失败为夹具文件越过Owner scope，错误提交被拒绝后触发开发测试30秒超时，日志完整保留；修正范围并使用90秒外层有限检查后通过。正式280通过/7既有跳过（handoff7、replan9、admission57、runtime-budget48、control159），零失败/超时/漂移，见test-results.json。独立审查确认requestHandoff来源被applyPlanDelta删除的1个P2，无其他本轮P1/P2，详见review.md。本轮结束，下一轮先修直接请求的来源生命周期。

下一步优先连接候选Review独立计费、候选废弃/重建继承及技术暂停报告，然后版本激活T18。普通Intent来源、implementation-review来源以及verification重开仍不得猜测，见intent-source-audit.md、next-entry-audit.md。T15保持开发中，T17仍等待T15，不宣称端到端无人值守完成。

无commit/push/fetch或同步操作。git-evidence.json记录main与本地tracking一致；Harness落后3364、vendor落后4、Synapse detached，未查询实时远端。原有工作区改动保留。

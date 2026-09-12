# R57：重规划身份接入持久预算领取

实际reserveRecoveryAdmission当前状态事务现在能同时保存Owner与replan操作意图，共用同一来源/root/账本。首次免费Owner失败可以直接为首个重规划建立恢复root；已付费Owner再失败按既有continuation继承。操作不假冒Owner执行身份，换步骤或类型不会清空问题额度。

每个逻辑操作从ordinal1开始；重放返回原request/attempt/session/prompt，不重扣。只有前一项持久failed且回执身份匹配才接受下一ordinal，未知/运行中/成功/取消均不能当作下一次重试许可。实际会话结束/回执生产尚需通用Planner驱动；新增测试的人工账本结算只验证导入与序号门禁。

开发14/14；正式180/180（budget48、admission57、session27、runtime-recovery-budget48），0失败/跳过/超时/漂移。实际双进程重放和Owner/operation最后额度竞争均通过。证据见candidate.json、round.diff、test-results.json及原始日志。独立只读审查无新增P1/P2。

本轮已同步公开接口合同。当前是内部预留接口，launchAuthorized=false，Owner专属session路由拒绝operation。真实cycle/handoff provenance、候选义务digest、每个Planner/Review/consultation的物理调用、启动不确定及输出应用仍未接线，T15保持开发中。正常completed handoff不能伪造失败，来源核对见source-routing-audit.md。

未提交/推送/同步。git-evidence.json记录主main与本地tracking一致；Harness落后3364、vendor落后4，Synapse detached，未查询实时远端；所有原有改动保留。

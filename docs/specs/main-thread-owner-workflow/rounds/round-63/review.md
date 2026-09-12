# R63独立审查

审查者t21_contract_review：范围内无新增P1/P2。

恢复候选在锁前分流，锁内复查避免候选变化退回免费路径；固定A来源/C候选、原Planner operation/intent/ledger与raw receipt，领取及最终事务重复核验。source/candidate变化不应用结果，独立task写入保留。revision_review有独立request/session，语义无效失败后才允许下一ordinal；needs_revision执行成功。已应用重放双重raw receipt并支持freshHarness零模型。共享validator/application helper保留旧普通Review语义。

正式181通过/7既有skip，零失败/取消/超时/漂移。discard/rebuild、会诊计费、T18激活是未交付能力，不由本轮证据代替。

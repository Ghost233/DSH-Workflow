# R43 独立只读审查

审查者：/root/t21_contract_review。只读，无文件/Git写入。

R42三项稳定态缺陷已关闭：初始authority真实dispatch/outbox；handoff在领取前后及实际启动锁内阻断；普通awaiting_finish/committed和PlanRevision abort兼容，快照变化锁内拒绝。

仍有P1 authority竞态，不能关闭完整修复：初始authority锁内仅重分类，未确认同attempt/session且failed|blocked，可能改写live Owner；初读技术失败到reserve之间新增typed authority，reserve抛错未持久outbox；handoff先检查遮蔽authority优先级。详review-findings.md。最小R44方向为terminal/source绑定、结构化拒绝、锁内重读：同源terminal才写决策，running/身份变化保守pause，其他错误原样抛出。

这是R43实际缺口，不以尚未实施Supervisor/timeout/replan为由豁免。

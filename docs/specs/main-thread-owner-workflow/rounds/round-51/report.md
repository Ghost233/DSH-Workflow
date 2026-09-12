# R51：区分新失败与未执行的技术拒绝

Supervisor启动前保存当前计划、attempt/session/状态及恢复结算阶段。异常返回后只有实际新终态来源才重排；来源未变的领取拒绝停止派发，保留Owner现场与预算，用户依据仍优先。旧reservation/计划变更的写回被拒绝，legacy分支不变。

正式271通过、7既有跳过、0失败/超时/漂移：runtime恢复42、admission43、session27、完整control159通过/7跳过。见test-results.json、formal日志、candidate.json和round.diff。独立审查无新增P1/P2。本轮两个反例经真实Supervisor入口证明incident/缺strategy停止且零模型调用；随后独立T2真实完成。既有初次失败免费、付费重试与额度耗尽仍通过。

T15仍开发中，不能把这一入口修复当成完整收敛：统一技术报告/必要后继与主控制投影、timeout、外部replan仍未完成，详next-entry-audit.md。已预留的身份/账本和reconcile入口仍保留，不宣称任意技术故障自动续跑。

T16 round03正式跨OS进程有限证明通过，源码与本轮一致；独立复核进行中，不解锁T17。未提交/推送/同步。git-evidence.json中本地main与tracking一致，Harness落后本地tracking3364、vendor落后4，Synapse detached；未取实时远端。

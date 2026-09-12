# T15 C1–C6 与 BUD 关闭索引

## C1：实际恢复入口共用领取

| 实际入口 | 当前合同 | 证据 |
| --- | --- | --- |
| 直接 Owner 恢复、重复恢复 | `recoverOwnerWithAdmission` 在重新打开任务前通过 `reserveRecoveryAdmission`；`runExternalOwner` 只消费已绑定 RecoverySession | `runtime-recovery-budget`、`recovery-admission`、`recovery-session` |
| Supervisor 与 whole-workflow 恢复 | Supervisor reservation 保留原失败来源，实际启动转入相同 Owner admission；whole-workflow 只重新排队，不制造免费恢复 | `runtime-recovery-budget`、`control` |
| 既有 idle timeout | timeout 先保留活动 Owner，真实终态后才进入同一恢复领取；心跳仍只影响旧 idle 语义 | `runtime-recovery-budget`、`control` |
| handoff Planner、候选 Review、Owner 会诊、Arbiter、局部重建 | 每个真实 child 都使用 `REPLAN_ADMISSION_REQUEST_CONTRACT` 和同一根问题的独立 ordinal；外层只消费 receipt，不二次扣减 | `handoff-recovery`、`replan-session`、`candidate-review-recovery`、`candidate-owner-consultation`、`candidate-arbitration-metered`、`candidate-rebuild-recovery` |
| 候选暂停时的独立初次任务 | `candidateIndependentDispatch`/reservation 使用普通 Owner 生命周期，不消耗恢复账本 | `candidate-independent-supervisor`、`candidate-independent-runtime`、`candidate-recovery-pause` |

不支持的在线 `request_subgraph` 恢复版本激活继续明确拒绝；它不计为已实现的正向入口，见 `subgraph-recovery-guard`。固定 hard deadline 属于 T17。

## C2：根问题、用户依据与控制投影

- `recovery-admission` 固定 source/root/request/attempt/executionVersion，Owner 与 replan 竞争同一两级额度。
- `runtime-recovery-budget` 覆盖 Supervisor、whole-workflow、convergence probe、预算拒绝和现有 idle timeout；真实用户依据优先，技术耗尽进入技术暂停。
- `candidate-recovery-pause` 与 `candidate-independent-*` 覆盖主 outbox、daemon 发现、独立任务真实完成及终态静默。
- `control` 保留 T02/T03/T04 的义务关闭、真实进展和用户决定优先回归。

问题额度耗尽只拒绝该根问题的新恢复；Workflow 总额耗尽拒绝全部新恢复。两者均不阻止无需恢复额度的独立初次任务。

## C3：预留、未知与重放

- `recovery-session` 覆盖 create/bind 前失败、真实 failed/succeeded、blocked/no-submit、固定来源 handoff、错绑定和旧状态。
- `recovery-session-restart` 以 SIGKILL 覆盖 submitted、settled failed、settled succeeded、bind-before-followup 和 checkpoint 前故障。
- `replan-session`、`owner-advice-session` 及候选套件覆盖真实 JSONL 原始回执、创建未知、语义失败 ordinal、fresh Runtime 零模型重放。
- 同 request 不二次扣减或退款；未知启动保持暂停，普通摘要或模型终态不能合成成功。

## C4：局部 replan 的计费、结算与消费

固定正向链为：handoff Planner → 独立 Review → Owner advice → Arbiter → 后继局部 rebuild → 新 Review。每个物理模型执行都有独立持久 operation/session/receipt，继承同一 root，后继只消费最新认证来源。R78 的并发回归继续通过，本轮没有把 R75 的临时拒绝门禁当作正向实现。

恢复 Owner 的 handoff 只有在 `sourceExecution` 与当前 plan/task/Owner/attempt/session 完整匹配时，才把已绑定 RecoverySession 结算为 failed 并允许后续另行付费 replan；普通 blocked、no-submit、错绑定或未确认 handoff 保持技术暂停。

## C5：显式配置与 legacy

- 新恢复协议要求 `DSH_RECOVERY_ADMISSION_CONFIG_V1` 的正有限 `totalLimit`、`problemLimit` 和精确 `executionVersion`；缺失、无效或版本漂移均拒绝。
- 旧 active Workflow 不静默生成配置、不迁移旧审批、不借新协议无限恢复。
- 生产代表值和默认启用仍由 T19 决定。

## C6：固定候选与 BUD 映射

| BUD | 本轮固定证据 |
| --- | --- |
| BUD-01 | `recovery-budget`、`recovery-admission`、`runtime-recovery-budget`、`candidate-independent-runtime` |
| BUD-02 | `recovery-session`、`recovery-session-restart`、`replan-session` |
| BUD-03 | `recovery-admission` 的跨进程竞争/重放，session/restart 的固定回执 |
| BUD-04 | `runtime-recovery-budget`、`control` 的来源关闭/新事实回归；历史 used 不下降 |
| BUD-05 | `candidate-independent-*`、`candidate-recovery-pause` 的独立 T2 与旧来源重放 |
| BUD-09 | `runtime-recovery-budget`、`candidate-recovery-pause`、`control` 的技术报告、主投影和独立实际执行 |

本轮固定候选为 [test-results.json](test-results.json) 中 19 套 480 通过、7 个已知 legacy 跳过、0 失败。C1–C6 已闭合，因此 T15 可标开发完成；T17/T18/T19、B04 和 CA01 状态不随之自动完成。

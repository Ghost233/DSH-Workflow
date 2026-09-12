---
id: T-27
spec_revision: R4
type: 实现
status: 验收通过
depends_on: [T-25, T-26]
acceptance: [AC-01, AC-02, AC-03, AC-12, AC-17, AC-18, AC-27, AC-28, AC-32]
---

# T-27 以真实授权和审查激活规划执行版本

来源：原 B01；[唯一 R4 规格](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)第5.7/5.9节及R80证据回填。[T07报告](../proofs/t-07/report.md)仅为技术路线证据，不替代本工单生产验收。共同场景只引用[CA01](../progress.md#ca-01-共同验收唯一交付级定义)。

## 交付范围

在生产 Workflow 事务中原子核验并绑定预期父执行版本、规划快照/checkpoint、真实 Registry、完整 DAG、独立 Review 原始来源、未关闭义务及原授权范围。实施授权内技术修订不追加逐轮批准；仅讨论/Spec-only/业务变更越界不激活。legacy Workflow 保留已有审批协议。

同父候选仅一个生效，后到反馈保留；无关结果 carry_valid，受影响版本 pending_check，失效回执仅历史。扩大权限不得复用旧 attempt；涉及 Owner/scope/Registry 失效的迁移必须等待真实终止或隔离接缝。生产调度只消费完整有效版本，崩溃不派发半更新图。

提供 T18 所需受控真实激活接缝；T18 的根问题/预算继承及 T17 的停止机制独立交付。未接入时恢复候选继续拒绝，不以 T27 单独完成来启用 T19 或宣称 B01 完整恢复验收。

## 前置和写入归属

依赖：T-25, T-26。前置状态须有实际可消费产物、固定候选定向证据和审查结论；上游文档标记完成本身不足以解锁。R83/T25与R84/T26已交付固定快照、持久候选、原授权及正式证据，独立审查未发现未关闭P1/P2，前置解除转待办；不缺额外用户确认。

潜在修改：runtime.mjs、plan-revision.mjs、workflow-state.mjs、实际入口/Runner版本集成测试。执行前固定写入清单；runtime/plan-revision 共享文件始终一个写入者，其他代理只读或等待交接。T26可提前准备不依赖实际snapshot接口的例子，不能伪造前置完成。

## 验证和完成条件

关联 AC-01, AC-02, AC-03, AC-12, AC-17, AC-18, AC-27, AC-28, AC-32，只承担上述行为，不独占整项AC。必要定向测试：真实独立审查/授权来源拒绝反例；同父竞争与重启；迟到反馈/回执；部分迁移和未关义务门禁；legacy审批回归；T18控制夹具消费入口。

测试落在 owner-workflow-plugin/test/ 对应真实入口及既有回归套件；固定候选、原始结果、失败/跳过与生产边界分别记录。开发完成需本项实现、定向检查和只读审查；进入集中验收需下游实际连接，CA01及原有AC不复制或缩减。范围外：不替代T17/T18/T19、B02–B06及CA01；不提交当前用户现场。

R84前置依据：[执行包合同](../contracts/planning-packages-v1.md)、[报告](../rounds/round-84/report.md)。候选activationAuthorized=false，不能从该标记推断任何执行权限；激活时须重查原授权、live Registry和独立Review。

R85实施中：已接固定候选独立审查来源及版本语义比较；尚未完成原子激活、同父竞争/重启、原授权范围与未关义务的联合门禁、实际派发与T18接缝。完整完成条件保持不变。

R86完成首次激活切片：[报告](../rounds/round-86/report.md)、[激活合同](../contracts/planning-activation-v1.md)、[固定候选](../rounds/round-86/candidate.json)、[测试结果](../rounds/round-86/test-results.json)及[补正Runner结果](../rounds/round-86/test-results-runner-corrected.json)。实际生产状态已进入control bridge/Supervisor，但活跃父版本修订、旧attempt权限/迟到结果迁移与T18接缝仍未完成，因此工单保持开发中。

R87完成活跃父版本修订切片：[报告](../rounds/round-87/report.md)与[合同](../contracts/planning-revision-activation-v1.md)。执行中的 Spec/Ticket 可固定为绑定父 Workflow/PlanRevision 的 checkpoint，经原 Planner/独立 Reviewer 形成候选，并以可恢复 PlanRevision 事务迁移 completed/running task；同父竞争、暂存后崩溃和重放已有真实 Runtime 证据。T17/T18控制下的权限失效、跨进程迟到回执与恢复预算继承仍未完成，因此工单继续开发中。

R90已把T17停止协议接入权限失效的活跃PlanRevision：受控旧attempt不再在激活事务中立即删除或强行放lease，而是先持久`stopping/revisionStop/cancelRequestId`；匹配terminal后才把settled旧记录归档并放行新版本task。无取消目标有限进入`termination_unconfirmed/inspect_runtime`，旧session的completion admission在归档前已经按attempt/session/token/generation拒绝。既有无T17控制记录保留legacy路径，避免伪造启动前deadline。

R90最终候选又补齐两个并存OS进程跨过PlanRevision边界的迟到提交，以及任务从新DAG删除后的同一停止/terminal归档路径。旧Owner进程在激活前持有原身份，激活后从另一Runtime提交会在副作用前失权；fresh Runtime随后按持久terminal结算并只归档旧记录，不复建已删除任务。固定五套合计193通过、7个既有legacy跳过、0失败，[报告](../rounds/round-90/report.md)。T27开发完成，T18真实预算继承前置解除。

## R100 集中验收

状态：验收通过。关联的AC-01, AC-02, AC-03, AC-12, AC-17, AC-18, AC-27, AC-28, AC-32已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。

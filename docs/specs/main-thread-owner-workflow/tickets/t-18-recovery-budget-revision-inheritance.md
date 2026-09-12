---
id: T-18
spec_revision: R4-V03-1
type: 实现
status: 验收通过
depends_on: [T-05, T-07, T-13, T-15, T-27]
acceptance: [AC-17, AC-18, AC-31]
---

# T-18 在执行版本激活时继承根问题与预算

规格：[R4第12节（R4-V03-1）](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)。合同：12.3；R4 5.5。来源：[T-09证据](../proofs/t-09/report.md)；全局状态与唯一共同场景见[进度索引](../progress.md)。本次只拆解，未分配实际Owner或启动开发。

## 交付行为与范围

真实计划版本激活时将父子/替代执行段绑定同一未解决根问题和账本；旧attempt结算可对账，不能因改图、改名或新task ID获得新额度。

范围之外：不在内存迁移函数之外假造已经存在的B-01入口，不自动重放旧授权、不修改完成业务承诺，不把新问题与派生问题混同。

## 模块与并行边界

plan-revision/model及B-01已实现的版本激活入口、预算适配；同一个公共协议由主线程指定单一负责人。共享Runtime写入与T-15/T-17/T-19串行。

所列模块是执行前核验的候选范围，不代表已获得写入归属；同一文件同一时间仅一个写入者，主线程独占规格、进度和Git操作。

## 前置与解除条件

逻辑依赖：[T-05](t-05-planning-references.md)、[T-07](t-07-planning-transaction-proof.md)、[T-13](t-13-recovery-budget-ledger.md)、[T-15](t-15-runtime-recovery-budget-admission.md)、[T-27](t-27-planning-version-activation.md)。

T-05引用协议、T-07正向事务证据、T-13/15账本接缝就绪；B-01已展开为T24–T27。R90已用真实候选/权限绑定、活跃PlanRevision、两个并存OS进程迟到提交与fresh Runtime terminal结算关闭T27，因此本项前置已经解除。这里仅要求版本激活接缝在显式有限配置的受控夹具中可验证，不要求先完成B-04或T-19默认启用，避免相互等待。

## 交付要求

- 派生映射显式引用原根问题/父执行版本；保持两级used与attempt历史。新问题有明确独立来源但仍消费同一Workflow总额。
- 执行版本与继承映射一起激活，父版本竞争或缺映射拒绝相关激活，失败不能留半新半旧状态。
- 迟到结果绑定原attempt，不重复扣/退；旧授权和Owner边界失效规则保持。
- 拆节点、改名、跨Owner移交及重建候选不重置原问题预算；独立任务有效结果保留。

## 验收映射与正式测试

关联：AC-17、AC-18、AC-31。共同预算场景引用进度中的BUD编号，只在该处维护；CA-01仍是唯一交付级定义。

BUD-06的真实版本事务加BUD-02/BUD-03跨版本重放；包括父子并发领取、同父版本竞争、激活中断、旧回执及未解决父问题子节点继续尝试。仅expandCompositeTask/migrateTaskStatesForRevision单测不足。

正式范围由实施轮次按实际影响固定；停止写入后保存源码/依赖摘要，独立项失败继续采集，保留失败/跳过/未运行/超时。缺必要测试适配时先显式登记前置，不能在验收现场暗中补平台。

## 完成与进入集中验收

实际激活与继承事务通过，证据绑定Spec/Ticket/执行版本及账本；B-01没有实际入口时保持阻塞，不提前宣称完成。

## R62入口安全前置

恢复保护的request_subgraph暂不允许即时applyPlanDelta，以免运行中source被删除；active启动快照与当前状态任一启用恢复协议都拒绝降级。只补安全门禁，未实现本工单的真实终态后候选激活、父子预算继承及中断恢复；不得解除本工单前置或标记完成。见[合同](../contracts/structural-owner-requests-v1.md)与[R62报告](../rounds/round-62/report.md)。

## R64批准安全前置

实际approvePendingPlanRevision在根会话核验后、任何active版本写入前拒绝恢复候选激活，避免plan切成C而config/source/intent仍绑定A。R64真实根会话调用验证拒绝前后持久状态完全不变。仅保护当前账本，不构成本工单的版本事务/继承实现；依赖与阻塞状态保持。见[R64报告](../rounds/round-64/report.md)。

## R91实现与关闭证据

真实 `approvePendingPlanRevision` 已在 Workflow 锁内把计划、当前恢复配置版本和 `DSH_RECOVERY_EXECUTION_TRANSITION_V1` 边作为一次状态事务发布。账本起始版本及旧 sources/intents/attempts、problem used 与 workflow totalUsed 均不改写；新执行版本的同 task、拆分 child、改名 task 和跨 Owner handoff target 通过显式 root mapping 继续消费同一 root。连续两次 PlanRevision 仍形成首尾相接的一条版本链。

固定候选覆盖同父并发批准、独立 Runtime 并发领取两个派生目标、缺来源/篡改边关闭处理、旧版本请求失效、旧版本运行中恢复 attempt 凭 terminal 结算且不二次扣减、独立 task carry-valid 与 fresh Runtime 重启导入。实现合同见[执行版本继承 V1](../contracts/recovery-execution-transition-v1.md)，正式结果见[R91报告](../rounds/round-91/report.md)。T-18更新为开发完成；集中 AC 仍由 CA01 验收。

## R100 集中验收

状态：验收通过。关联的AC-17, AC-18, AC-31已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。

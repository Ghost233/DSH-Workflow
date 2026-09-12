---
id: T-29
spec_revision: R4
type: 实现（B03-1）
status: 验收通过
depends_on: [T-17, T-27, T-28]
acceptance: [AC-07, AC-08, AC-09, AC-21]
---

# T-29 统一判断会话、写 Owner 与执行资源准入

规格：[R4](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md) 5.3、5.8；前置：[T-28](t-28-public-owner-decision-session.md)、[T-17](t-17-attempt-deadline-settlement.md)、[T-27](t-27-planning-version-activation.md)。

## 交付行为

- 为V2 task增加可选、稳定的执行资源身份；旧计划省略该字段时保持原计划摘要和action ID兼容。
- Supervisor只选择前置完成、Owner空闲、资源不冲突且容量足够的任务；同一批选择也不能占用相同资源。
- Runtime在实际Owner启动事务中重复核对容量、Owner和资源，不能通过直接control调用绕过Supervisor。
- 公共Owner判断reservation与同Owner写任务互斥并共同占用全局槽位；竞争在Workflow锁中确定唯一胜者。
- 路径写入继续由互不重叠的Registry Owner scope、单Owner租约和最终提交关卡共同保证，不因worktree隔离放宽。

## 验收

- 不同Owner、相同端口/数据库/构建资源不会并发；无冲突Owner可填满剩余槽位。
- 活跃公共Owner判断期间，同Owner写任务的Supervisor派发和Runtime直接启动均拒绝；判断终态后可以继续。
- 两个直接启动竞争相同资源时只有一个进入running，另一个在模型调用前失败。
- 旧计划无resources时现有Supervisor动作身份、Owner执行与恢复回归保持有效。

本工单只统一准入与资源reservation。公共决定绑定到新PlanRevision、仅目标Owner实现以及消费者按正确合同解锁由T-30承接。

## R96 开发证据

[R96报告](../rounds/round-96/report.md)固定本工单候选。V2 task的可选`resources`已进入规范化计划、语义失效比较、Supervisor receipt和固定Owner执行包；旧计划省略字段时不注入默认值。Supervisor和Runtime在各自权威边界核对容量、Owner、持久reservation及资源冲突，直接Owner入口不能绕过DAG准入。

专项真实Harness 4/4通过，纯模型/Supervisor 79/79通过；受影响回归共357项，336通过、21个既有legacy跳过、0失败、0取消。集中验收和CA-01仍未运行。

## R100 集中验收

状态：验收通过。关联的AC-07, AC-08, AC-09, AC-21已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。

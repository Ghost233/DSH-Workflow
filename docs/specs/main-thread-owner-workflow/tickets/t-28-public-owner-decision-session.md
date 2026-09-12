---
id: T-28
spec_revision: R4
type: 实现（B02）
status: 验收通过
depends_on: [T-06, T-08, T-27]
acceptance: [AC-05, AC-06, AC-13, AC-29]
---

# T-28 接入持久公共 Owner 判断会话与结构化决定

规格：[R4](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md) 5.8；合同：[公共Owner变更协议V1](../contracts/public-owner-change-v1.md)、[公共Owner判断会话合同V1](../contracts/public-owner-decision-session-v1.md)。本工单是原B-02/F4的生产实现切片，不增加新的业务范围。

## 交付行为

- 从当前有效执行版本和已登记T06请求创建公共Owner只读判断reservation，固定Owner、请求、上下文和prompt。
- 提供专用结构化决定提交；普通文本、错误Owner、错误请求或过期上下文不能成为决定。
- 持久保存reservation、原始提交、T06登记结果和终态，使fresh Runtime保守重放且不重复发送或登记。
- 将T06六类投影返回主线程协调入口；只登记决定，不直接改DAG或授予公共模块写权。
- 接入独立consultation容量与取消释放；写Owner租约语义和B-03资源统一由后续接线消费。

## 边界

仅修改Owner Workflow插件内的公共判断会话、持久状态、Runtime工具/入口及对应测试。公共业务模块、Registry内容、真实钱包或外部服务不在范围内。固定模型回复只验证协议与生命周期。

## 验收

- CA-01 S/A/B固定事实中，真实Harness结构化提交兼容K2决定，fresh Runtime可读取并幂等投影为公共实现等待。
- 普通文本无提交、重复/冲突提交、错误Owner、缺消费者事实和K1→K2迟到回报均关闭处理且保留原始证据。
- 创建前、prompt后、提交后、登记前各恢复点不重复prompt或决定；超时/取消在终态确认后释放consultation reservation。
- 两个槽位允许不同Owner会诊并行；同Owner或容量不足明确排队。该证据供B-03统一调度消费，不将只读会诊记为写Owner。

完成本工单仅关闭B-02的判断会话与主线程决定接线；公共实现、消费者解锁及完整资源联合行为仍在B-03/CA-01验收。

## R95 完成证据

生产Runtime已接入专用 `public-owner-advisor` 只读角色、`workflow_public_owner_decision_submit` 结构化提交、固定session/prompt/request/context与JSONL原始回执对账。当前PlanRevision或合同上下文变化时迟到决定只归档为 `stale`；普通文本、错误Owner、无提交终态和不确定创建均不能生成决定或触发重发。

判断reservation已纳入Supervisor并行槽与Owner排他投影；超时与父取消分别持久化为 `settled_timeout` 和 `settled_cancelled`，终态后释放槽位。六类T06投影会进入主线程outbox，其中业务承诺变化显式映射为 `user_decision`，不会被自动改图。详见[R95报告](../rounds/round-95/report.md)。

## R100 集中验收

状态：验收通过。关联的AC-05, AC-06, AC-13, AC-29已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。

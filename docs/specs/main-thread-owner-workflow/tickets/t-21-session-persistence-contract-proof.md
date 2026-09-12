---
id: T-21
spec_revision: R4-V03-1
type: 技术验证
status: 验收通过
depends_on: [T-14]
acceptance: [AC-22, AC-24, AC-31]
---

# T-21 验证真实会话与prompt持久对账合同

规格：[R4第12.2节及T-14回填](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)。来源：[T-14报告](../proofs/t-14/report.md)、[P14前置](../proofs/t-14/proposed-contract.md)。已完成技术验证产物，真实后端保守消费合同已回填规格12.2，未修改生产会话后端。

## 交付行为与范围

交付P14-B实施前缺失的真实API依据：固定Harness create/resume、首次append、prompt接纳与结算查询的实际能力，输出可实施合同或明确缺口。

不修改生产会话后端、不做预算集成；不要求T-20或T-15先完成。使用受控明确ID和无模型执行器，真实持久插件不得stub。

## 模块与写入归属

只写proofs/t-21夹具与证据。只读deepseek-harness的core/agent、agent-loop、session-persistence以及插件provider；T-20可同时写其独占代码，本工单先固定独立的会话源版本，必要共享调用边界变动则停止依赖采集。

候选路径不等于已派发写入权；实施前核验当前文件和既有修改，一个文件同一时间仅一名写入者，主线程独占规格/进度/Git。

## 前置与解除条件

逻辑依赖：T-14。

T-14已明确随机身份、lazy持久化和prompt不确定窗口，范围足够开始。真实后端加载所需测试入口若缺失，记录最小适配前置，不暗中补生产或换成模拟服务证明。

## 交付要求

- 在真实持久后端验证显式sessionId创建、首次append前后、已存在ID冲突与resume；区分无文件、已创建未持久化、持久化可恢复和当前活跃。
- 固定prompt消息身份、接纳/执行/结算可查回执；验证同消息重放是否幂等以及在什么条件下可以恢复。不能以确定性sessionId替代prompt合同。
- 在上述边界用受控进程SIGKILL并重启，核对日志和结果，不将Runtime重建当崩溃。确认未知状态应拒绝重派，保留可查原因。
- 只在合同已证明时给出T-22可调用API与精确语义；否则列文件、能力缺口和新增实现前置，并回填12.2。T-21负向结论可完成验证任务，但不解锁T-22。

## 验收映射与正式证据

关联：AC-22, AC-24, AC-31。共同场景：[进度矩阵](../progress.md)；CA-01仍为唯一交付级定义。

共同BUD-02/03的真实会话子边界；详细原始日志保存在proofs/t-21，时间/退出码/源摘要及模拟执行者边界完整。独立场景失败继续、有限超时、缺入口/零用例不得标通过。不使用T-14模拟create/persist结果替代本工单。

## 完成与后续边界

形成可复现、有明确正向/否定判定的真实后端报告即可开发完成。只有可实施会话/消息对账合同经审查回填后解锁T-22；断电和真实模型不在本工单保证范围。

## 技术验证交付

[报告](../proofs/t-21/report.md)、[正式结果](../proofs/t-21/summary.json)、[审查](../proofs/t-21/independent-review.md)。2个session组与4个prompt场景全部完成，6次SIGKILL/独立重启；固定ID不保证重送幂等的否定结论已确认。T-21开发完成，T-22可消费保守合同，未标生产验收通过。

放行仅限真实JSONL compression:none、独占受控单prompt session；原始完整性/稳定revision/身份检查由T-22实现，未知状态停止、不重送、不伪造终态。T-23联合证据仍未具备。本轮结束，待讨论。

## R100 集中验收

状态：验收通过。关联的AC-22, AC-24, AC-31已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。

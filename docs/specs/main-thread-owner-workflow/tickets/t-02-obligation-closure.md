---
id: T-02
spec_revision: R4
type: 实现
status: 验收通过
depends_on: []
acceptance: [AC-16, AC-32]
---

# T-02 让证据义务凭明确依据关闭

规格：[R4](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)。合同：5.10 的义务身份/关闭合同，第 8 节 AC-16/32。全局边界、状态定义及共同验收见[进度索引](../progress.md)。第 2 轮开始实施，源码和测试由单一实现代理独占写入，主线程负责合同核对、候选冻结和正式测试；未创建 Runtime Owner。

## 交付行为与范围

同一义务不因审查遗漏或标题改变消失；passed 也不能绕过仍未满足的义务。

范围之外：不实现新文档快照、完整持久预算或新的业务审批流程。

## 模块与并行边界

当前实现/测试接缝：[convergence.mjs](../../../../owner-workflow-plugin/src/convergence.mjs)、[runtime.mjs](../../../../owner-workflow-plugin/src/runtime.mjs)、[convergence.test.mjs](../../../../owner-workflow-plugin/test/convergence.test.mjs)、[control.test.mjs](../../../../owner-workflow-plugin/test/control.test.mjs)。这些是执行前需复核的证据位置，不是已经授予的写入清单。

本工单先固定最小义务/关闭证据合同，T-03/T-04 读取同一合同。convergence.mjs 与 runtime.mjs 的其他修改执行前需核实独占写入范围。

## 前置与解除条件

Blocked by：无。范围本身已明确；首批可开始资格不等于用户已授权实施。

已知阻塞：无本地任务前置。执行时若代码/合同已变化，记录漂移并由主线程处理，不猜测扩大范围。

## 交付要求

- 用稳定义务身份关联来源、目标与解除条件；相同类别/节点下的两个不同要求不能互相吞并。
- 审查遗漏保持 open；关闭需要匹配版本的可核验证据或有来源的替代决定，重复证据幂等。
- 通过现有审查/激活入口验证：有 open 义务时拒绝 passed 带来的激活，不仅修改一个纯函数返回值。

## 验收映射与正式测试

关联：AC-16、AC-32。仅按本工单的实际行为与证据认定覆盖，不扩张为全部工作流通过。

- 旧问题被下一份 review 遗漏仍 open；改标题仍同一义务；不同要求分别保留。
- 无依据的 passed 不激活；正确关闭证据允许推进；过期或不相关证据拒绝；重复关闭不重复记账。

正式测试落点使用上述现有测试接缝；新增用例只归本行为一次。共享 S/A/B 场景、交付级测试只引用 CA-01，不在各工单复制。

## 完成与进入集中验收

开发完成条件：义务合同及实际消费入口一致，回归覆盖 R4 遗漏反例和激活阻断；记录供 T-03/T-04 复用的接口。

进入集中验收条件：固定候选上的协议与激活守卫证据齐备；持久重启预算仍由 T-09 验证。


## 第 2 轮结果

本轮结束，待讨论；状态保留开发中，不宣告开发完成或验收通过。已形成协议、Runtime 守卫和真实入口测试候选，正式八组共 198 通过、4 失败、7 跳过，源码候选无漂移。三类无依据关闭反例及支持的有效关闭入口有局部通过证据，但完整控制回归仍失败。

[本轮报告](../rounds/round-02/report.md)列出四项正式失败及 F-02 至 F-07 的确认问题；[证据](../rounds/round-02/evidence.md)保存精确差分、指纹与原始测试日志。下一轮优先修验证有效性复用、身份去重/文案污染、缺合同新输入与旧现场兼容；不能只改旧断言来标绿。

候选接口为 issue 的 obligationId/sourceId/sourceVersion/targetTaskIds/closeWhen，以及 review.obligationClosures。两种已实现关闭类型是 plan_verification_binding 与 task_verification_result，但后者的现行过期检查存在 F-02，前者仅证明计划绑定关系，不证明命令实际成功。alternative_decision 无可信台账时仍拒绝；该候选接口尚未验证完成，不能作为 T-03/T-04 已稳定的前置合同。

## 第 3 轮结果

本轮结束，待讨论；正式十组 239 通过、5 失败、21 跳过。验证证据改为复用 Runtime 当前性门禁；不同显式 ID 合同、标题及旧 active 边界有回归。仍需修 F-03 的独立义务 ID 可省略问题，以及 F-04 的决策/拆分完整关闭合同。保持开发中，不能作为 T-03/T-04 稳定前置。详见[报告](../rounds/round-03/report.md)和[证据](../rounds/round-03/evidence.md)。

## 第 4 轮结果

本轮修复 F-03 的独立 obligationId 可省略问题；formal 五组 201 通过、5 失败、21 跳过。F-04 决定/拆分回执生产和版本消费未实现，不能解锁 T-03/T-04。身份局部修复不等于整个 T-02 开发完成；保持开发中。本轮结束，待讨论，见[报告](../rounds/round-04/report.md)及[证据](../rounds/round-04/evidence.md)。

## 第 5 轮结果

开发完成，集中验收未运行。新增 plan_task_executable 与 decision_record 关闭合同、主线程限定记录工具、需要用户时的原生确认、当前版本重读和同版本回执替代。上一轮五个控制失败均通过；正式八组 239 通过、0 失败、21 跳过，无超时或候选漂移；独立审查无新增 P1/P2。

[报告](../rounds/round-05/report.md)及[证据](../rounds/round-05/evidence.md)定义接口、实际覆盖和限制。T-03/T-04 可读取本候选合同，前置解除但本轮不启动。来源快照、完整公共 Owner 协议、自动跨节点迁移和整个 Workflow 预算不在本次交付内。本轮结束，待讨论，未提交或推送。

## R100 集中验收

状态：验收通过。关联的AC-16, AC-32已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。

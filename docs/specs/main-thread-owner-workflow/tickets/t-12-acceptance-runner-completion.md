---
id: T-12
spec_revision: R4
type: 实现（B05）
status: 验收通过
depends_on: [T-07, T-11]
acceptance: [AC-19]
---

# T-12 补齐集中验收的继续执行、分类和零用例门禁

规格：[R4](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)，合同 5.6、AC-19。对应[进度索引](../progress.md)的 B-05。T-07/B-01候选入口与T-11结果合同均已就绪。

## 交付行为与范围

固定实际候选内容后，独立验证项可以继续收集结果；失败、超时、跳过、未运行、阻塞及零用例不得混为通过。有真实前置依赖的验证项保持阻塞。

范围之外：不改成失败也能通过 Owner 提交关卡，不开发通用测试平台、不适配所有框架、不自动降低 AC。现有超时与内容摘要能力继续复用。

## 模块与并行边界

当前接缝：[verification.mjs](../../../../owner-workflow-plugin/src/verification.mjs)、[owner-submission.mjs](../../../../owner-workflow-plugin/src/owner-submission.mjs)、[runtime.mjs](../../../../owner-workflow-plugin/src/runtime.mjs)、[verification.test.mjs](../../../../owner-workflow-plugin/test/verification.test.mjs)。这些位置不是已授权的写入清单。

集中证据采集与 Owner 提交安全门禁分别承担责任；T-11 先确定最小接口，所有执行者复用该接口。涉及 runtime 或共享验证模块时由主线程统一写入责任，不与其他集成工单同时改同一文件。

## 前置与解除条件

原Blocked by：[T-07 规划事务验证](t-07-planning-transaction-proof.md)、[T-11 集中验收合同](t-11-acceptance-runner-contract.md)。T-07/B-01已在R90关闭，T-11已在R99固定合同，前置全部解除。

已知阻塞：无。实现以`DSH_ACCEPTANCE_CANDIDATE_V1`直接绑定B-01产出的planning snapshot、plan、代码commit及本轮Spec/Ticket摘要。

## 交付要求与正式测试

- 按 T-11 经验证的合同补齐一个实际使用的测试入口：独立继续、依赖阻塞、实际候选摘要、完整分类及用例计数/无法确认的处理。
- 保留所有原始证据和工具错误；候选变化后旧结果不可用于当前通过判定。
- 在上述正式测试接缝加入“首项失败、后项独立通过、依赖项阻塞、超时、取消、零用例、未运行”的组合行为测试，不仅校验枚举或 exitCode。
- 定向验证 Owner 提交门禁仍拒绝失败或不足证据，不因集中采集继续而放松提交条件。

关联 AC-19。共同交付场景仅引用 CA-01，不复制 S/A/B 用例或把整个平台验收塞进本工单。

## 完成与集中验收

开发完成条件：解除上述合同/候选前置后，补齐行为及定向集成测试通过，结果绑定实际候选和原始证据。

进入集中验收条件：独立审核本工单的能力与安全回归，使用 CA-01 的统一结果合同；本工单完成仍不表示全部工作流已交付。

## R99完成证据

- [集中验收运行合同V1](../contracts/acceptance-run-v1.md)固定候选、验证图、完整分类和Node test适配边界。
- 包导出`./acceptance-runner`提供`DSH_ACCEPTANCE_RUN_V1`；候选变化产生`stale_candidate`，exit 0但零用例产生`zero_tests`，无法确认计数产生`evidence_incomplete`，均不能计为passed。
- 真实本地Node组合入口覆盖首项失败、独立通过、依赖阻塞、进程超时、取消、零用例、显式跳过/未运行及计数缺失。Owner提交门禁回归保持首个失败即拒绝。
- [R99报告](../rounds/round-99/report.md)及[正式结果](../rounds/round-99/test-results.json)记录34/34定向通过。B05/F6生产切片开发完成；CA-01尚未运行。

## R100 集中验收

状态：验收通过。关联的AC-19已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。

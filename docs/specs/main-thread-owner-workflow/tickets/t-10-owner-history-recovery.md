---
id: T-10
spec_revision: R4
type: 技术验证
status: 验收通过
depends_on: []
acceptance: [AC-22, AC-23]
---

# T-10 验证原始 Owner 历史与代码结算恢复一致性

规格：[R4](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)。合同：5.6、第 6 节；V-04。全局边界、状态定义及共同验收见[进度索引](../progress.md)。当前只完成拆解，未开始执行；尚未分配实际 Owner。

## 交付行为与范围

核对已有“摘要失败可延后”能力，并验证原始 worklog 封存失败/重启时不丢失修改原因和已集成代码。

范围之外：不更换记忆系统、不增加模型摘要平台、不把摘要文本当当前合同或权限。

## 模块与并行边界

当前实现/测试接缝：[runtime.mjs](../../../../owner-workflow-plugin/src/runtime.mjs)、[memory.mjs](../../../../owner-workflow-plugin/src/memory.mjs)、[memory.test.mjs](../../../../owner-workflow-plugin/test/memory.test.mjs)、[resilience.test.mjs](../../../../owner-workflow-plugin/test/resilience.test.mjs)。

优先复用现有测试接缝；验证不得修改用户原有 worktree。若要改生产结算路径，先回填 B-06。

## 前置与解除条件

Blocked by：无。范围本身已明确；首批可开始资格不等于用户已授权实施。

已知阻塞：无本地任务前置。执行时若代码/合同已变化，记录漂移并由主线程处理，不猜测扩大范围。验证可能得到否定结论；其成功交付是可靠结论，不是被验证功能验收通过。

## 交付要求

- 区分原始事实封存和摘要编译两个故障点，记录各自已保存的提交 SHA、原因、worklog 和状态。
- 故障后重启/重复回执不能二次合并代码；摘要重试不改写原始事实。对缺失来源只报告失败，不补造历史。
- 将已满足与仍缺少的行为回填 V-04/B-06，避免重做已有 deferred 逻辑。

## 验收映射与正式测试

关联：AC-22、AC-23。提供设计验证证据；这些 AC 的生产行为仍归阻塞范围和 CA-01 验收。

- 真实临时 Git 提交/集成加可控封存、摘要失败；逐项核对代码 SHA 和原始记录。
- 重复恢复、过期摘要、源记录缺失均有证据；保留原有记忆定向回归。

正式测试落点使用上述现有测试接缝；新增用例只归本行为一次。共享 S/A/B 场景、交付级测试只引用 CA-01，不在各工单复制。

## 完成与进入集中验收

开发完成条件：现有能力和恢复缺口得到可复现结论，原始事实完整性有可检查证据。 技术验证使用状态“待办→开发中→开发完成→验收通过”跟踪工作交付；最后一项只代表验证任务本身通过审阅。

进入集中验收条件：涉及新执行版本的恢复仍依赖 B-01/B-03；验证成功不自动等于全部 AC-22/23 通过。

## R98验证结论

现有实现的封存失败恢复为正向：代码固定SHA已经合入时，记录仍保持`awaiting_finish`，fresh Runtime可重新封存并完成，祖先关系与merge commit数量证明没有二次集成。

现有摘要降级得到否定结论：首次编译失败会把任务标为completed并保留worklog来源，但同时清除`pendingMemoryCompilation`；完成记录的幂等入口只返回旧结果，因此重启或重复`owner-finish`不会再次编译。该生产缺口已按B-06拆为[T-31](t-31-owner-memory-deferred-recovery.md)并在同一固定候选修复。修复后的来源缺失路径只增加持久失败证据，保持代码completed且不补造历史。

[R98报告](../rounds/round-98/report.md)记录原结论、修复边界和真实Git证据。T-10开发完成表示验证结论可复现；AC-22/23仍等待CA-01集中验收。

## R100 集中验收

状态：验收通过。关联的AC-22, AC-23已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。

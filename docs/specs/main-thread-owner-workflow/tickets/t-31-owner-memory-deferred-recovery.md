---
id: T-31
spec_revision: R4
type: 实现（B06）
status: 验收通过
depends_on: [T-10]
acceptance: [AC-22, AC-23]
---

# T-31 补齐 Owner 摘要延后后的持久恢复

规格：[R4](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md) 5.6、第6节与V-04。T-10先验证现有结算接缝并得到否定结论：代码与原始来源可以保留，但任务一旦以`memory.deferred`完成，Runtime会清除`pendingMemoryCompilation`；fresh Runtime重收完成回执只幂等返回旧结果，没有摘要重试入口。

## 交付行为

- 原始worklog封存后立即转为`sealed`，并把封存提交、worklog digest、源文件digest与固定代码SHA写入完成结果。
- 长期摘要失败不撤销已经验证并合入的代码，保留sealed worklog供后续恢复。
- fresh Runtime重收同一`owner-finish`时先核对完成记录，再只重试Memory编译；不重新执行Owner、不重新验证提交身份之外的代码合并，也不产生第二个实现写入者。
- 重试前核对原始worklog状态和digest、Git来源提交、当前源文件blob、来源digest以及固定代码SHA的祖先关系。来源缺失、被替换或不在当前workflow历史时，保持任务和代码完成，记忆恢复明确失败，不生成替代历史。
- 编译成功后原子更新Memory提交与摘要，移除短期worklog；随后重复回执直接返回同一结果且不新增提交。

## R98完成证据

- 真实临时Git用例覆盖封存失败后重启、摘要失败后fresh Runtime重试、成功后的重复回执，以及来源删除后的关闭处理。
- 每个用例核对固定代码SHA祖先关系、merge commit数量、原始worklog内容/状态、封存提交与恢复结果；来源缺失用例确认没有补造文件。
- [R98报告](../rounds/round-98/report.md)与[正式结果](../rounds/round-98/test-results.json)记录定向及受影响回归。当前状态只表示B06/F5生产切片开发完成；AC-22/23仍在CA-01固定候选统一验收。

## R100 集中验收

状态：验收通过。关联的AC-22, AC-23已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。

---
id: T-24
spec_revision: R4
type: 实现
status: 验收通过
depends_on: [T-01, T-05, T-07]
acceptance: [AC-26, AC-27, AC-30]
---

# T-24 记录原生规划文档写入的可靠来源

来源：原 B01；[唯一 R4 规格](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)第5.7/5.9节及R80证据回填。[T07报告](../proofs/t-07/report.md)仅为技术路线证据，不替代本工单生产验收。共同场景只引用[CA01](../progress.md#ca-01-共同验收唯一交付级定义)。

## 交付范围

将实际主线程原生 write/edit 的身份、路径、原生 CAS、修改前后摘要与结果持久关联。一个会话多次修改保持独立调用及可核验的摘要链。保留原生未读拒绝、版本过期拒绝和文档权限。写前准备失败不得修改；写后证据失败或进程退出保持 prepared/unknown，不凭文件看起来正确就认定本次调用成功。

当前原生 intent 的 next 仅选择 CAS；采用 tools/execute 等待工具和同 actor 的 fs/observed 同步成功标记。无标记不能仅凭工具错误推断文件未修改。此两阶段记录不宣称与文件系统写入原子提交，未知记录由 T25 保守拒绝，不能自动补造成功。

## 前置和写入归属

依赖：T-01, T-05, T-07。前置状态须有实际可消费产物、固定候选定向证据和审查结论；上游文档标记完成本身不足以解锁。T01/T05/T07证据已核验，无当前前置阻塞。

潜在修改：planning-write-journal.mjs、orchestrator-documents.mjs、新 planning-write-journal-native.test.mjs。执行前固定写入清单；runtime/plan-revision 共享文件始终一个写入者，其他代理只读或等待交接。T26可提前准备不依赖实际snapshot接口的例子，不能伪造前置完成。

## 验证和完成条件

关联 AC-26, AC-27, AC-30，只承担上述行为，不独占整项AC。必要定向测试：真实 create→read→edit；外部修改导致 stale；重复/并发调用身份；准备失败零修改；原生成功但后继错误；缺失成功证据不伪造完成；原有路径别名与越界拒绝。

测试落在 owner-workflow-plugin/test/ 对应真实入口及既有回归套件；固定候选、原始结果、失败/跳过与生产边界分别记录。开发完成需本项实现、定向检查和只读审查；进入集中验收需下游实际连接，CA01及原有AC不复制或缩减。范围外：不替代T17/T18/T19、B02–B06及CA01；不提交当前用户现场。


## R81交付

真实原生写入→来源日志已接通，固定候选四套47项通过、零失败/跳过/漂移，独立复审无新增P1/P2。[报告](../rounds/round-81/report.md)。T24开发完成，允许T25核验并消费该产物；不等于checkpoint或CA01已完成。

## R100 集中验收

状态：验收通过。关联的AC-26, AC-27, AC-30已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。

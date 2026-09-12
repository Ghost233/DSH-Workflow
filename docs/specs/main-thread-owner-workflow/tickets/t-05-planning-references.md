---
id: T-05
spec_revision: R4
type: 协议实现
status: 验收通过
depends_on: []
acceptance: [AC-03, AC-04, AC-27]
---

# T-05 校验 Spec 与 Ticket 的版本及验收引用

规格：[R4](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)。合同：5.1、5.7 的规划文档集合；仅协议层。全局边界、状态定义及共同验收见[进度索引](../progress.md)。R79协议实现与固定候选定向验证完成；生产Owner执行与规划事务仍由后续集成完成。

## 交付行为与范围

接收本次选定的规划文档集合，返回可追溯引用或具体错误，避免把缺失、过期、空范围和未就绪合同交给编排器猜测。

范围之外：不实现 Git checkpoint、不启动 DAG、不认定 Markdown 语义覆盖已经通过、不为引用正确直接授予执行权。

## 模块与并行边界

当前实现/测试接缝：[model.mjs](../../../../owner-workflow-plugin/src/model.mjs)、[plan-revision.mjs](../../../../owner-workflow-plugin/src/plan-revision.mjs)、[orchestrator-documents.mjs](../../../../owner-workflow-plugin/src/orchestrator-documents.mjs)、[model.test.mjs](../../../../owner-workflow-plugin/test/model.test.mjs)。这些是执行前需复核的证据位置，不是已经授予的写入清单。

协议集中一处定义，由 T-07 消费；不要把逻辑塞进共享 runtime 后同时交给多个任务改写。候选新文件及实际 Owner 归属在执行前核实。

## 前置与解除条件

Blocked by：无。范围本身已明确；首批可开始资格不等于用户已授权实施。

已知阻塞：无本地任务前置。执行时若代码/合同已变化，记录漂移并由主线程处理，不猜测扩大范围。

## 交付要求

- 按 R4 逻辑字段形成最小可复用记录与校验入口，固定 Spec/Ticket/AC/合同引用和所选就绪范围；具体字段命名在此统一记录。
- 缺文件、重复编号、修订/内容失配、无来源引用、越界路径、空工作集合均有明确结果。一个 Ticket 可覆盖多个 Owner 执行段，业务 AC 不丢失。

## 验收映射与正式测试

关联：AC-03、AC-04、AC-27。覆盖限于协议层，完整 AC 由进度索引的阻塞范围承接。

- 就绪与阻塞范围混合、同一路径内容变化、引用不存在、重复 ID、跨 Ticket 验收映射及空输入。
- 验证拒绝结果不产生执行副作用；范围内合法集合保持稳定引用。

正式测试落点使用上述现有测试接缝；新增用例只归本行为一次。共享 S/A/B 场景、交付级测试只引用 CA-01，不在各工单复制。

## 完成与进入集中验收

开发完成条件：协议接口、错误语义和定向用例齐备，供 T-07 直接使用；明确这些 AC 仅部分覆盖。

进入集中验收条件：进入共同验收前必须由 B-01 完成真实文件冻结/执行版本集成；协议通过不等于 AC-03/04/27 通过。

## R79 交付与前置解除

入口：[planning-references.mjs](../../../../owner-workflow-plugin/src/planning-references.mjs)的validatePlanningReferences；字段及明确错误见[版本合同](../contracts/planning-references-v1.md)。实际文件、SHA256、机器身份声明、完整AC/合同与依赖均交叉验证，返回只读固定内容及ready/blocked投影，不授予执行权。

[固定候选报告](../rounds/round-79/report.md)：30项协议、6项路径守卫、4项原生Harness守卫全部通过，无漂移，独立审查无新增P1/P2。T05标为开发完成，T07协议前置解除；AC03/04/27生产验收仍需B01/CA01。

## R100 集中验收

状态：验收通过。关联的AC-03, AC-04, AC-27已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。

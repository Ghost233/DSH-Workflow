---
id: T-07
spec_revision: R4
type: 技术验证
status: 验收通过
depends_on: [T-01, T-05]
acceptance: [AC-03, AC-12, AC-17, AC-18, AC-27, AC-28]
---

# T-07 验证规划文档固定与版本激活事务

规格：[R4](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)。合同：5.7、5.9；V-02/V-05。全局边界、状态定义及共同验收见[进度索引](../progress.md)。T01路径前置及T05协议前置已具备，等待本工单事务验证。

## 交付行为与范围

用一个临时 Git 项目证明或否定“本次文档 checkpoint＋规划快照＋执行版本激活”方案，产出有证据的实施边界。

范围之外：不把原型接入正式 Workflow，不迁移活跃旧现场，不提交用户当前工作区，不据此直接交付所列 AC。

## 模块与并行边界

当前实现/测试接缝：[runtime.mjs](../../../../owner-workflow-plugin/src/runtime.mjs)、[plan-revision.mjs](../../../../owner-workflow-plugin/src/plan-revision.mjs)、[git.mjs](../../../../owner-workflow-plugin/src/git.mjs)、[control.test.mjs](../../../../owner-workflow-plugin/test/control.test.mjs)、[plan-revision.test.mjs](../../../../owner-workflow-plugin/test/plan-revision.test.mjs)。这些是执行前需复核的证据位置，不是已经授予的写入清单。

原型使用独立临时目录和测试接缝；正式 runtime/Git 修改不在本工单。与其他验证共享场景定义时由主线程统一维护。

## 前置与解除条件

Blocked by：[T-01 修复预检后的文档根路径别名误拒绝](t-01-document-root-identity.md)、[T-05 校验 Spec 与 Ticket 的版本及验收引用](t-05-planning-references.md)。

T-01 的路径身份组合已修复，T-05 的规划引用合同已定向验证，避免原型绕过已知入口缺陷或另造记录。

已知本地前置阻塞：无。T05已在R79完成固定候选验证，须直接消费其planning-references-v1合同，不另造记录。验证可能得到否定结论；其成功交付是可靠结论，不是被验证功能验收通过。

## 交付要求

- 验证文档写入来源、清单、分支/HEAD、内容摘要固定；包含已有暂存、用户同文件编辑及清单外代码，明确拒绝而非吞并。
- 在提交前后、快照持久化前后、激活前后注入中断；验证已完成步骤可识别、无重复提交、无半更新派发，保留实际 index 与本地分支。
- 模拟同父版本候选竞争、迟到反馈/回执、新旧状态协议，记录唯一激活及不能复用的旧证据。
- 回填规格：选定已证明的事务路线或记录失败点、所需合同修订和仍阻塞的 AC。

## 验收映射与正式测试

关联：AC-03、AC-12、AC-17、AC-18、AC-27、AC-28。提供设计验证证据；这些 AC 的生产行为仍归阻塞范围和 CA-01 验收。

- 复用 R4 文档→预检夹具扩展，逐步核对 Git HEAD、index、文件内容、快照和激活引用。
- 竞争与崩溃恢复至少覆盖一个完整写入/激活周期；原型结果带源码/输入摘要。

正式测试落点使用上述现有测试接缝；新增用例只归本行为一次。共享 S/A/B 场景、交付级测试只引用 CA-01，不在各工单复制。

## 完成与进入集中验收

开发完成条件：验证报告可复现，明确通过与失败边界；失败同样可作为本验证任务的有效结论，但不会解除 B-01。 技术验证使用状态“待办→开发中→开发完成→验收通过”跟踪工作交付；最后一项只代表验证任务本身通过审阅。

进入集中验收条件：主线程审查证据并回填生效 Spec 后，才能拆 B-01 的集成实现；不得把模拟激活视为真实 Runtime 验收。


## R79 前置解除

T01路径身份回归与T05真实文件协议在[同一候选](../rounds/round-79/report.md)通过；状态转为待办。下一步依本工单既有范围做临时Git checkpoint/快照/激活事务验证，不把协议测试或模拟激活当B01生产交付。

## R80 交付

[技术报告](../proofs/t-07/report.md)证明选定阶段的真实Git checkpoint/index/snapshot/模拟activation恢复路线，包含六处SIGKILL、已有V1父版本的实际R2竞争、用户改动与旧协议拒绝。分候选正式结果与已修复发现完整保留。主线程回填R4证据后可按B01范围实施；本工单开发完成不等于相关生产AC验收。原生多次写CAS链、真实Registry/Review/Runner及生产激活仍归B01。

## R100 集中验收

状态：验收通过。关联的AC-03, AC-12, AC-17, AC-18, AC-27, AC-28已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。

---
id: T-11
spec_revision: R4
type: 技术验证
status: 验收通过
depends_on: []
acceptance: [AC-19, AC-25]
---

# T-11 确定集中验收的继续执行和证据分类合同

规格：[R4](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)。合同：5.6、第 8 节 AC-19/25；B-05 的解除前置。全局边界、状态定义及共同验收见[进度索引](../progress.md)。当前只完成拆解，未开始执行；尚未分配实际 Owner。

## 交付行为与范围

明确集中验收如何继续独立测试、绑定实际候选并区分失败/超时/跳过/未运行/零用例，避免到最终验收时让执行者临时搭平台。

范围之外：不弱化 Owner 提交关卡，不把其失败即停止直接改为失败也可提交，不要求接入所有测试框架。

## 模块与并行边界

当前实现/测试接缝：[verification.mjs](../../../../owner-workflow-plugin/src/verification.mjs)、[owner-submission.mjs](../../../../owner-workflow-plugin/src/owner-submission.mjs)、[runtime.mjs](../../../../owner-workflow-plugin/src/runtime.mjs)、[verification.test.mjs](../../../../owner-workflow-plugin/test/verification.test.mjs)。这些是执行前需复核的证据位置，不是已经授予的写入清单。

共同测试定义只在 progress.md 的 CA-01 维护；本任务产出最小 runner 适配合同，阻塞工单 [T-12](t-12-acceptance-runner-completion.md) 明确承接 B-05 的补齐实现。

## 前置与解除条件

Blocked by：无。范围本身已明确；首批可开始资格不等于用户已授权实施。

已知阻塞：无本地任务前置。执行时若代码/合同已变化，记录漂移并由主线程处理，不猜测扩大范围。验证可能得到否定结论；其成功交付是可靠结论，不是被验证功能验收通过。

## 交付要求

- 当前证据：固定验证记录已有 contentDigest/exitCode/timedOut；owner_submit 对首个失败抛错；该记录没有标准用例数量或完整测试分类。区分提交安全门禁与集中证据采集。
- 用一个本地测试入口验证“先失败、后独立通过、超时、零用例、未运行”的证据收集；有依赖的测试明确阻塞，不盲目继续。
- 确定候选内容绑定、最小结果字段及测试入口适配方式，回填 Spec 和 T-12 的实际适配边界与解除条件。

## 验收映射与正式测试

关联：AC-19、AC-25。提供设计验证证据；这些 AC 的生产行为仍归阻塞范围和 CA-01 验收。

- 保留固定内容摘要和原始命令输出；确认 exitCode=0 且零用例不能被当正式验收通过。
- 模拟取消/超时后检查仍有独立结果可读；依赖失败与独立继续分别验证，不能仅测试枚举。

正式测试落点使用上述现有测试接缝；新增用例只归本行为一次。共享 S/A/B 场景、交付级测试只引用 CA-01，不在各工单复制。

## 完成与进入集中验收

开发完成条件：形成一个可运行入口的验证报告和集中验收合同；已知能力缺口有明确后续归属。 技术验证使用状态“待办→开发中→开发完成→验收通过”跟踪工作交付；最后一项只代表验证任务本身通过审阅。

进入集中验收条件：B-05 的补齐实现与正式验证完成后才能运行 CA-01；本验证任务不能宣布最终交付。

## R99验证结论

现有`DSH_VERIFICATION_RESULT_V1`可靠绑定固定argv、cwd、contentDigest、exitCode和timeout/abort宿主证据，Owner提交关卡也正确在首个失败时停止提交；它没有验证图、候选Spec/Ticket/commit绑定或Node用例计数，不能承担集中验收。

本轮用真实Node test入口复现并固定[集中验收运行合同V1](../contracts/acceptance-run-v1.md)：独立项继续，依赖失败项blocked；失败、超时、取消、跳过、未运行、零用例、计数不明和候选漂移分别记录。技术结论已被T-12直接消费并完成一个`node-test`生产适配。定向34/34通过；T-11开发完成表示合同验证可复现，不代替CA-01交付级验收。

## R100 集中验收

状态：验收通过。关联的AC-19, AC-25已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。

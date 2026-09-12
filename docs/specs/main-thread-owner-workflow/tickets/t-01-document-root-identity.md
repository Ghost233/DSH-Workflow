---
id: T-01
spec_revision: R4
type: 实现
status: 验收通过
depends_on: []
acceptance: [AC-26, AC-30]
---

# T-01 修复预检后的文档根路径别名误拒绝

规格：[R4](../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md)。合同：5.7、第 8 节 AC-26/30、第 10 节路径身份夹具。全局边界、状态定义及共同验收见[进度索引](../progress.md)。已在 ghost-matt-implement 第 1 轮完成实现与定向验证，由主线程独占本工单源码和测试写入；未创建 Runtime Owner 或新分支。

## 交付行为与范围

同一项目经过 Git 预检后，主线程仍能使用原别名绝对路径、真实绝对路径或相对路径维护同一允许文档。

范围之外：不新增默认目录、不跟随项目内部任意链接、不处理文档提交或 DAG 启动。

## 模块与并行边界

当前实现/测试接缝：[orchestrator-documents.mjs](../../../../owner-workflow-plugin/src/orchestrator-documents.mjs)、[runtime.mjs](../../../../owner-workflow-plugin/src/runtime.mjs)、[orchestrator-documents.test.mjs](../../../../owner-workflow-plugin/test/orchestrator-documents.test.mjs)、[orchestrator-documents-native.test.mjs](../../../../owner-workflow-plugin/test/orchestrator-documents-native.test.mjs)。这些是执行前需复核的证据位置，不是已经授予的写入清单。

路径策略为主要改动面；若需要调整 runtime 的根身份绑定，与所有 runtime 写入任务串行核实。不要为通过用例覆盖全局路径策略。

## 前置与解除条件

Blocked by：无。范围本身已明确；首批可开始资格不等于用户已授权实施。

已知阻塞：无本地任务前置。执行时若代码/合同已变化，记录漂移并由主线程处理，不猜测扩大范围。

## 交付要求

- 先把 R4 的真实 Git 预检→文档写入反例变成正式回归；测试必须让 Git root 与会话 cwd 的合法路径写法不同。
- 统一项目身份后执行原有范围校验，同时保持原生观察策略、读后改与内容版本冲突保护。

## 验收映射与正式测试

关联：AC-26、AC-30。仅按本工单的实际行为与证据认定覆盖，不扩张为全部工作流通过。

- 对同一允许文档验证三种路径均成功，并观察实际文件内容；至少一次通过真实 Harness write/read/edit。
- 兄弟项目、内部软/硬链接、dangling link、治理文件、Superpowers/analysis/scratch 路径仍拒绝；非别名路径也回归。

正式测试落点使用上述现有测试接缝；新增用例只归本行为一次。共享 S/A/B 场景、交付级测试只引用 CA-01，不在各工单复制。

## 完成与进入集中验收

开发完成条件：新反例先确认失败再修复，权限与原生工具回归通过，实际 root/cwd/目标身份可核对。

进入集中验收条件：提交固定候选的定向证据；沿用 progress.md 中 CA-01 的共同验收，不宣称 AC-27 已完成。

## 第 1 轮交付记录

状态：开发完成，本轮结束，待讨论。AC-26/30 的固定候选定向验证通过；没有将其标为完整 CA-01 验收。详见[本轮报告](../rounds/round-01/report.md)和[完整候选、差分与原始测试证据](../rounds/round-01/evidence.md)。

修改限于路径策略及两份文档权限测试，未修改 runtime.mjs。根身份由 cwd 祖先的真实路径核验，保留项目内部链接片段供原有拒绝检查；真实 Git 预检后，原别名绝对路径、真实绝对路径、相对路径均可通过原生工具维护同一文档。四组正式测试共 25 通过、0 失败、0 跳过。

只读审查无阻塞问题；保留 F-01/P3：原生测试初始化阶段的清理注册过晚，setup 失败可能遗留测试临时目录。下一轮建议提前注册清理并验证失败路径。本轮没有追修。文档写入后的脏工作区预检仍会阻塞，属于 T-07，不属于本工单修复。

## 第 2 轮 F-01 跟进

F-01 已在原生测试创建临时目录后立即注册清理；单项资源释放失败也继续释放其他资源和删除目录。固定候选的初始化失败、setup 与释放同时失败注入均验证无残留，原生文档套件 4 项通过。见[第 2 轮报告](../rounds/round-02/report.md)。本轮其他 T-02 问题仍使整份候选未通过验收，不影响这里对 F-01 定向结果的单独记录。

## R100 集中验收

状态：验收通过。关联的AC-26, AC-30已在同一固定候选完成；最终结论见[R100报告](../rounds/round-100/report.md)与[AC矩阵](../rounds/round-100/ac-matrix.md)。该状态只确认本地实现与验收，不表示已经提交、推送或发布。

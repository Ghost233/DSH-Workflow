# 第 8 轮：T-04 结构化决定分类

本轮结束，待讨论。T-04 保持 **开发中**：分类与门禁已落地，但审查确认 F-10/F-11，实际用户问题尚未完全绑定分类依据，执行失败的结构化权限路径尚未接通。未进入 T-05/T-09 或 CA-01。

## 范围与版本

用户调用 ghost-matt-implement 授权本轮。输入为 R4 的 5.4、5.10 与 T-04 / AC-14；输入文件指纹、起始内容、精确六文件差分与冻结候选见 [原始证据](evidence.md)。冻结时间：2026-09-10T11:55:53.330101+00:00。主仓 main HEAD 为 `154914064f5ceb2f8eb413865e10a54e8ffbc663`；未提交候选以文件指纹识别，不能用 HEAD 代替。

分类代理独占 convergence/model 源码及其测试；主线程独占 runtime/control 测试及文档。全部源码写入在正式测试前停止，正式后只读审查及记录。

## 已实现行为

- 新 decision_record 必须携带与义务来源同版本的 classificationBasis。技术事实只允许 orchestrator 决定；业务承诺差异或外部权限缺口要求 user 决定；冲突或缺依据拒绝新提交。
- 分类依据保存在原义务上，不参与新身份计算，也不替换已冻结的依据；保持 T-02 关闭合同、T-03 事实账本和有限策略语义。
- 检查所有仍 open 的历史义务，后续 Reviewer 漏报或声称 passed 不会移除已有用户门禁。旧显式 user 义务保守保留；普通用户/token/生产措辞不再构成新人工授权依据。
- 实际 discussion 入口拒绝纯技术待决；保留用户义务时，即使有效 Review 已归为 needs_revision，仍能创建包含来源、目标任务和依据的待决包。混合 decision_record 批次筛出用户事项。
- 原生用户确认、Registry 和计划批准未取消；本轮没有实现新的自动业务授权。

## 正式测试

固定候选执行一轮八组测试，281 项中 **260 通过、0 失败、21 跳过**，零超时/取消，候选无漂移。使用 Node v24.12.0 与 --test-force-exit；control/security/runner 外层180秒，其余60秒。命令、完整 stdout、起止时间和每文件指纹均保留。

| 套件 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- |
| convergence | 24 | 0 | 0 |
| model | 51 | 0 | 0 |
| control | 122 | 0 | 7 |
| security | 25 | 0 | 14 |
| plan-revision | 7 | 0 | 0 |
| workflow-state | 11 | 0 | 0 |
| runner | 8 | 0 | 0 |
| plugin | 12 | 0 | 0 |

21 项跳过是原有明确停用的旧 Owner/逐写入包装/次数 Planner 用例（control 7、security 14），未把它们计入通过。本轮新增分类和真实路由用例均实际执行。开发定向日志另存，未累计进正式通过数。

## 只读审查

### F-10 / P2：待决问题仍能脱离用户义务的结构化依据

位置：`owner-workflow-plugin/src/runtime.mjs` 的 requestPlanReviewDiscussion，questions 选择分支（约5652行）。仅当 open 决策里同时存在 orchestrator 时才根据 decisionItems 生成问题；其余情况优先照搬 state.planReview.decisionQuestions，未绑定问题与业务/权限依据。

固定候选实际入口探针：仅建立 read:ledger / remote-ledger / 读取指定账本 的合法用户权限义务，但 Reviewer decisionQuestions 放入“用户取消连接时如何释放 token 缓冲？”。reviewPlan 正确判定有权限缺口，随后 requestPlanReviewDiscussion 却将该纯技术问题作为唯一用户问题，decisionItems 中仍是账本权限。见原始证据的 review-question-scope.probe.mjs 和 .log。

根因是分类生产者已结构化，问题呈现消费者仍保留自由文本优先分支；不是模型能力不足，也不是正式测试失败。已有集成测试只在 Reviewer 后续 passed 漏报后才创建 discussion，错过首次创建时的错配路径。测试全绿不能证明这一合同已完成。

建议下一轮最小修复：对受管理 Workflow 始终由 open 用户义务的冻结业务差异/权限缺口形成问题，或要求问题逐条绑定并验证 obligationId/source；旧记录保留明确兼容出口。补首次 discussion 的纯权限、业务＋技术验证事项、无关自由文本、混合批次回归，继续保留过期版本和原生确认拒绝检查。不要只改 Reviewer 提示。

### F-11 / P2：执行失败的结构化权限分类没有实际生产者

独立审查发现，主线程逐一核对确认：convergence.mjs:1098–1118 仅从 context.classificationBasis 认定 external_authority；runtime.mjs:3674、10641、12603、12708 四处调用均只传错误文本，没有 Runtime 接纳的结构化反馈传入。convergence.test.mjs 中的权限正例直接调用纯函数并注入 context，因此无法证明实际执行路径已连接。

这意味着该失败分类调用链无法把已查明的真实权限缺口转成 request_user_authority，会进入技术诊断/恢复策略，最终也可能以自治失败退出。不是说原生审批会放行，也不表示可以恢复关键词猜测。T-04 引用规格5.4执行偏差反馈，不能将其悄悄收缩成只有 Review 分类。

下一轮应先明确最小执行偏差载荷与接纳合同：将事实及权限缺口绑定当前 workflow/plan/task/owner/attempt 和可核验来源，经 Runtime 接纳、保存，再传入现有分类与恢复入口；无依据仍调查或明确技术失败，不凭模型文本授予权限。补真实恢复入口的技术负例、权限正例、过期/错目标拒绝和受影响任务边界。运行中完整版本切换仍不扩展到本轮。这是缺失接线的已确认结论；未进行真实第三方服务权限实验，不能把该实验计为失败或通过。

[独立审查记录](independent-review.md)确认上述两项 P2，无 P1；主线程分别以真实入口探针和四处实际调用链核对，不仅转述子代理结论。

## 覆盖边界

- 结构化权限缺口目前通过 Review 生产路径验证；四处执行失败 classifyFailure 调用仍只传错误文字。新增结构化 context 分支有单测，但缺生产者是 F-11 未完成项，不只是可忽略的测试范围限制。
- 待决包记录受影响 task IDs；运行中的局部暂停、独立节点继续与完整 active/pending 切换仍归 B-01 集成验证，不能把待决包字段当调度隔离已经通过。
- 未启动独立 T-04 验收，也未重新宣称整个 T-03 或完整 R4 验收通过；T-03 原局部验收记录保留其原候选边界。

## 交付与下一轮

未提交、推送、切换分支或创建项目替代 worktree。四个关联仓库 HEAD 不变，diff --check 通过，起始已有路径未丢失。main 对本地 origin/main 引用为 ahead/behind 0/0；未 fetch，不代表实时远端核验。

按本次技能“本阶段只给结论，不实施修复”及“本轮结束，待讨论”，F-10/F-11 留待下一轮，未在正式测试后修改代码。下一轮候选修复问题呈现接缝，并补齐执行偏差的结构化接纳与分类调用链，再运行受影响回归；本轮不自动继续。

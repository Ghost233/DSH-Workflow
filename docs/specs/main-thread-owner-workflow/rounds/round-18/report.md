# 第18轮：预留身份接入真实Owner失败链路

当前阶段：第18轮结束，待讨论。T-22仍为开发中；本轮回归未全绿。

本轮将显式恢复请求接入既有runExternalOwner/createOwnerEntry/runOwnerEntry与生产owner_submit，保留当前计划/Registry/依赖、受控工作区与固定提交审计。Runtime冻结恢复指令与最终Owner提示词，provider使用预留session/prompt，创建返回后先绑定持久化，再followup及flush确认。

只有原lease下已确认提交的真实Owner failed报告，才同事务保存失败记录、T13执行/失败回执及recoveryContinuation。模型turn终态、未确认提交、blocked、普通文本或成功Owner结果不被伪造为failed回执。首次failed仍传播OwnerReportedError；相同请求后续只读重放返回settled_failed，不重新执行/扣额。

本轮真实fixture覆盖失败提交、完整预算/延续绑定、同请求重放、改变指令、错current session绑定以及普通入口不得复用旧恢复身份。测试仅模型流受控，Registry、Git工作区、Harness provider、JSONL及生产owner_submit均实际执行；这不是完整plugin.apply装配或成功Owner提交验收。

剩余：成功/其他Owner结果的预算结算，未确认提交/重启组合故障序列，以及failed/stopped恢复为可启动状态的正式调度接线。T-23/T-15仍不解锁。

证据：[范围与测试明细](evidence.md)、[候选](candidate.json)、[正式结果](test-results.json)、[Git状态](git-final.json)。

## 测试结论

正式与有限补验共420通过、1原始失败、21跳过、2次原始套件超时。新增恢复链路9/9通过。control-b在180秒终止后补齐12项，全部通过；resilience在180秒终止前报告33通过/1失败，剩余17个顶层用例（含子测试共26项）一次补验通过。没有修改候选或提高超时上限。

失败项为Registry在workflow state保存失败时的回滚测试。该项单独TAP诊断1/1通过，原日志有PromiseRejectionHandledWarning；原始失败详情未能在套件超时前输出。延迟挂拒绝处理器是待核时序线索，尚不能确认产品回归或环境根因。保留原失败与两次超时，不称整轮通过；单项复跑不计入420通过。

## 版本与工作区

1617项候选指纹在正式测试及补验中无漂移。未提交、推送或fetch，四仓HEAD保持基线；原有未提交及未跟踪文件保留。主仓main与本地origin/main跟踪引用0/0；deepseek-harness保留behind1430，vendor/dsh-approve-for-me保留behind4，dsh-synapse保留detached。这些是本地跟踪引用证据，不是本轮联网核对的远端状态。

## 审查与下一步

[独立审查](independent-review.md)未发现本轮新增产品P1/P2；确认F-17/P2测试稳定性问题：resilience.test.mjs:1531创建审批Promise后，1538才安装拒绝断言，中间存在多个await。主线程复核同意修复此时序窗口，但不把它当作原始失败和整轮变慢的唯一已证原因。

下一轮最小候选：修复F-17的拒绝处理时序，保持原故障注入和回滚断言，并在固定候选、预先分组的有限回归中获取完整结果。随后继续T-22成功/其他结果结算及重启组合故障覆盖；T-23/T-15仍不解锁。无须为了该测试问题修改产品代码或业务规格。

按[ghost-matt-implement](/Users/admin/.codex/plugins/cache/ghost-agent-market/ghost-agent-skills/0.3.5+codex.20260908032011/skills/ghost-matt-implement/SKILL.md)的明确要求“本阶段只给结论，不实施修复”，正式冻结后本轮未修F-17，也未自动启动下一轮。开发累计18轮、技术验证3轮、独立局部验收3次、集中验收0次。

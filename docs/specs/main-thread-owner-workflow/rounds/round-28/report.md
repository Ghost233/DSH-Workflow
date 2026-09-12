# 第28轮：L2三类通过，pending用例精确原因断言失败

本轮补四类真实局部结果证据：blocked、带orchestrator handoff的blocked报告、没有owner_submit的普通结束，以及真实PlanRevision批准产生的pending_check。前三类正式通过，无结算receipt/continuation，原预算保持，同request不重复执行。

pending场景使用“已审查candidate”输入夹具，真实approvePendingPlanRevision产生pending_check，未直接修改task/check/Owner终态。真实finishOwner先拒绝旧planDigest验证证据；随后恢复对账保持预算/state/raw且无agent/model调用。最后精确原因断言失败：期望reservation_binding_mismatch，实际reservation_invalid。因此pending用例不能标通过，L2不关闭。

F-20：本轮测试期望错误。lookupRecoveryAdmissionIntent先经admissionConfig校验当前配置版本；候选迁移后config.executionVersion仍旧值，和state.planDigest不一致，先抛异常，Runtime将其映射reservation_invalid，尚未进入后续binding比较。下一轮只修精确期望并验证；不修改生产暂停原因、不伪造预算版本以绕过门禁。

正式restart5/5+session16/17，合计21通过1失败、零取消/跳过/超时/警告，无正式补验；1619候选无漂移。详[test-results](test-results.json)、[证据](evidence.md)。首次开发的两次错误假设也保留：工具定义被误认为调用，及以为finish能直接命中pending专用分支。修正后分别3/3与1/1，但正式前新增精确原因断言暴露F-20，不能用开发结果覆盖正式失败。

产品代码/合同/fixture未改，仅session测试新增。pending是版本变化与待检查的组合证据，不声称命中recovery_success_check_pending独立分支，更不声称planner/reviewer全流程已验证。

按[ghost-matt-implement](/Users/admin/.codex/plugins/cache/ghost-agent-market/ghost-agent-skills/0.3.5+codex.20260908032011/skills/ghost-matt-implement/SKILL.md)“本阶段只给结论，不实施修复”，冻结后保留失败，下一轮修F-20。T22仍开发中，L1关闭，L2待修复复验，L3/L4待补；T23/T15仍阻塞。

未提交/推送/fetch，四仓HEAD未变，用户修改保留；main本地跟踪0/0，deepseek-harness仍behind1430，vendor仍behind4，dsh-synapse detached。未实时远端核验。正式后无源码/断言/合同修改。本轮结束，待讨论。

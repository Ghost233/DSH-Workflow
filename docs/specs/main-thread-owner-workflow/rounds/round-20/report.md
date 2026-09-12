# 第20轮：T-22真实成功结算与重放

当前：第20轮结束，待讨论。T-22仍开发中，尚未完整验收。

本轮将成功T13结算放在真实finishOwner完成事务中：固定提交已验证并集成，任务已完成且检查有效，原lease、session/prompt及T20身份匹配，成功账本与Owner记录同事务保存。回执固定commitSha与完成时Owner workflowHead；相同请求只读重放，改指令、错任务SHA/Owner session拒绝。awaiting_finish不能成功；成功不产生失败continuation。普通Memory编译延后沿用既有完成定义，不增加新业务门禁。

真实执行暴露并修复一处lease生命周期问题：runExternalOwner在try/finally中直接return finishOwner Promise，finally先释放lease，finishOwner随后检查失败。两个已持有lease的完成分支现在await完成，并复用原lease；不是通过增加超时或重试掩盖问题。成功记录落盘后，后续日志错误也不能将其改写为失败。

成功测试新增真实source Shell/Sandbox/Policy/Subprocess装配；最初缺服务、随后外层沙箱阻止sandbox-exec的开发失败证据均保留。只有recovery-session正式进程获得外层沙箱升级，项目自身Owner沙箱与固定node --test仍开启；其余回归在默认外层沙箱。两个新场景定向及正式均通过，但完整11项集成中两个原JSONL测试失败，不能称整轮通过。

剩余：旧session的恢复/重启组合故障、其他结果结算、正式调度与全runner接线。未测试的故障路径不因静态保护存在即视为验收通过，T-23/T-15仍阻塞。

[证据](evidence.md)、[候选](candidate.json)、[正式结果](test-results.json)、[本轮差异](round.diff)、[Git状态](git-final.json)。正式后不修改源码、断言或合同。

## 测试结果

444项：421通过、2失败、21跳过、0超时。全部预定分组完整结束，未补验或重跑正式组，1617项候选无漂移。失败均在旧JSONL观察型fixture：无条件挂载沙箱服务注入sandbox:policy插件输入，导致唯一输入对账按合同拒绝。只读原始事件已证实；应隔离fixture装配，不应放宽产品对账检查。正式后未修，T-22不提升为开发完成或验收通过。

四仓HEAD不变，无提交/推送/fetch，原有未提交和未跟踪内容保留。主仓main与本地origin/main跟踪引用0/0；deepseek-harness保留behind1430，vendor/dsh-approve-for-me保留behind4，dsh-synapse保持detached；未联网核验远端最新状态。

## 审查与下一步

[独立审查](independent-review.md)未发现新增产品P1/P2，确认F-18/P2为观察型fixture的无条件沙箱装配回归。下一轮先把executable传入mountHarness及restart，仅可执行fixture挂载四个真实执行服务，完整验证11项；不降低固定验证或唯一输入检查。之后继续T-22其余结果与重启组合故障，T-23/T-15仍不解锁。

按[ghost-matt-implement](/Users/admin/.codex/plugins/cache/ghost-agent-market/ghost-agent-skills/0.3.5+codex.20260908032011/skills/ghost-matt-implement/SKILL.md)明确要求“本阶段只给结论，不实施修复”，本轮正式后未修F-18，也未自动开始下一轮。开发累计20轮、技术验证3轮、独立局部验收3次、集中验收0次。

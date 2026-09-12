# 第19轮：F-17回滚测试稳定性修复

本轮结束，待讨论。F-17已修复并通过独立只读审查。T-22仍为开发中；本轮只处理上轮确认的测试时序问题。

审批Promise创建后立即注册拒绝观察器，防止故障布置中的多个await让预期拒绝先被运行器视作未处理拒绝。原Promise仍交由原assert.rejects检查，错误匹配、故障注入、Registry内容/index与workflow state回滚断言保持不变。没有修改产品源码或合同。

resilience全部51个顶层用例事先分为3组各17个，含子测试共60项：60通过、0失败、0跳过、0超时。各组各180秒上限、串行TAP记录，无补验或重复整轮；用例选择与实际报告一一吻合。原始日志未出现延迟处理拒绝或未处理拒绝警告。该结果不覆盖未改动的control等产品套件，也不改写第18轮原始失败和两次超时，不声称整体性能问题已解决。

1617项候选无漂移，四仓HEAD保持基线，保留原有未提交与未跟踪内容。无提交、推送或fetch。主仓main与本地origin/main跟踪引用0/0；deepseek-harness保留behind1430，vendor/dsh-approve-for-me保留behind4，dsh-synapse仍detached；未联网核对远端最新状态。

证据：[范围和结果](evidence.md)、[正式原始记录](test-results.json)、[日志警告核对](log-audit.json)、[候选完整性](final-integrity.json)、[Git状态](git-final.json)。

[独立审查](independent-review.md)确认F-17可关闭，无新增P1/P2。下一轮候选恢复T-22剩余实施：先接真实Owner成功结果的T13结算与幂等重放，再补其他结果及重启组合故障；尚未实施这些内容，T-23/T-15仍阻塞。开发累计19轮、技术验证3轮、独立局部验收3次、集中验收0次。正式后无源码/断言/合同改动，未自动开始下一轮。

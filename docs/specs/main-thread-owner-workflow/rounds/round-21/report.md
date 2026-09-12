# 第21轮：F-18观察型fixture装配隔离

第21轮结束，待讨论。F-18已修复并通过独立只读审查。

四个真实执行服务仅为executable:true的fixture挂载；创建与restart使用同一个executable选项。观察型fixture恢复原单预留输入形态，执行型仍运行真实沙箱、固定验证、Owner提交和完成事务。产品代码、唯一输入规则与测试断言均未修改。

完整recovery-session 11/11通过，0失败、跳过、取消、超时，名单无遗漏，无补验。旧JSONL检查与新增真实成功结算/重放、awaiting_finish负向均通过。1617候选无漂移。restart装配选项经过静态核验，不代表已完成T-22进程重启故障验收。

T-22仍开发中，其他结果/旧会话恢复与重启组合故障/全runner尚未完整覆盖，T-23/T-15仍阻塞。

未提交、推送或fetch；四仓HEAD不变，原有修改保留。主仓main与本地origin/main跟踪引用0/0；deepseek-harness保留behind1430、vendor/dsh-approve-for-me保留behind4、dsh-synapse保持detached；未联网核对远端最新状态。

[证据](evidence.md)、[正式结果](test-results.json)、[候选](candidate.json)、[本轮差异](round.diff)、[Git状态](git-final.json)。

[独立审查](independent-review.md)确认F-18可关闭，无新增P1/P2。下一轮可继续T-22旧会话/重启组合故障与未结算结果处理，先明确最小故障序列，不自动扩大到全runner。开发累计21轮、技术验证3轮、独立局部验收3次、集中验收0次；本轮正式后未改源码/断言/合同，未自动启动下一轮。

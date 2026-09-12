# T-21 证据索引

范围：R4-V03-1 / T-21 / AC-22、AC-24、AC-31局部技术验证，BUD-02/03真实会话子边界。未执行全工作流或CA-01生产验收。

## 固定版本

[基线](baseline.json)承接第15轮82项指纹与四仓HEAD、原有修改。[源码基线](source-baseline.json)覆盖Harness packages/vendor的source文件和包清单等1525项，防止只记录入口而遗漏间接依赖源码；它是保守的源码范围，不声称每个文件都实际被加载。[候选](candidate.json)合并前置、source范围、探针/合同/collector及tsx配置入口，共1613项SHA-256，无漂移。

采用Node v24.12.0、tsx ESM hook、Harness tsconfig映射，真实源码服务与真实JSONL（compression:none）。未混用lib构建产物，没有重新build或修改生产。session探针额外输出10个直接源码依赖指纹；完整范围以candidate为准。

## 正式采集

[执行脚本](collect-formal.py)独立运行两个入口，各150秒外层超时，超时终止其整个进程组并继续独立入口；子探针各有15秒上限。[正式结果](formal-results.json)记录命令、目录、起止时间、退出码和超时。[汇总](summary.json)为2个session组、4个prompt场景，全部完成，0采集错误/超时；12个子进程，6次真实SIGKILL和6个独立重启，无父/子stderr。

- [session原始输出](formal-session.stdout.log)：lazy create后无artifact，重复lazy拒绝；SIGKILL后load不可恢复。独立的显式Agent create +真实Session事件append/flush后SIGKILL，重启load/resume可恢复，重复live/persisted创建拒绝。raw JSONL内嵌在结果中。该场景人工写平衡turn事件，不冒充模型执行。
- [prompt结果](formal-prompt/results.json)：pending inject/flush后重建保留队列，重复pending ID拒绝；followup返回后立刻kill本轮无持久session；running在受控适配器收到请求并flush后kill，原始readFrom无turn/end，load补interrupted；completed后kill再resume，重送同prompt ID确实第二次执行。
- prompt每个场景保存独立JSON、kill/restart PID/signal、原始事件，以及disk-before-restart/disk-after-restart的真实JSONL副本。complete场景原始完成结果来自真实AgentLoop+MockAdapter，而非手工添加turn/end。

这里“采集成功”包含确认底层非幂等的否定观察，不是宣布每项生产要求通过。followup-return存在落盘竞争，本轮无artifact是一次真实观察，不保证每次相同；无artifact不能证明从未执行。pending为不唤醒inject场景，不是自动恢复已证明。日志里的interrupted是cold恢复合成标记，不能当旧执行真实失败。完整边界见[源码审计](source-audit.md)及[消费合同](proposed-contract.md)。

## 开发记录和审查

session/development-01/02失败与03/04成功原始日志保留。前两次为探针装配/断言问题；03到04补独立组失败继续、失败子进程回收，04为固定版本前最终检查。

prompt/development/results.json保留首次装配失败：create的agentOptions误放顶层、resume误用sessionId；不是生产API错误。development-2修正参数后4场景完成；development-3增加明确观察断言/队列投影；development-4增加flush参与者验证与非变异readFrom对照。没有把这些重复开发运行累计为正式通过数量。正式仅采集一次，冻结后未改源码、探针、断言或消费合同。

[工作区核对](workspace-final.json)：四仓HEAD不变，无提交或推送，原有工作区修改保留。本地main与origin/main跟踪引用同hash且0/0；未fetch，不宣称实时远端一致。技术验证累计在进度中单独计数，不增加代码开发轮次。

# T-21 source-plane 审计

本次只验证本地当前源码；不是对发布包lib、真实模型服务、SQLite或物理断电的保证。以固定Node24与tsx ESM hook、Harness tsconfig路径映射加载真实Cordis、AgentRegistry、AgentLoop、SessionStore与JSONL插件。prompt探针仅用现有MockAdapter替代模型网络，持久插件和消息队列没有替身。

## 可调用边界

- `core/agent/src/index.ts:80/139/405/424`：create接收`{sessionId,agentOptions}`；resume接收`{resumeSessionId,agentOptions}`。调用方必须持有返回handle的dispose能力。`agentOptions`的provider/model嵌套不能移到顶层。
- `core/agent-loop/src/agent.ts:113-124`：followup返回void，经send写入next-turn并唤醒driver；调用返回不是磁盘提交确认。
- `core/agent/src/inbox.ts:139-187/201-221`：splice通过Session事件写入；重复ID检查仅覆盖当前pending队列，不检查已消费的user/message历史。
- `core/session/src/index.ts:1010-1040`：`await ctx.sessions.flush(session)`是持久检查点，返回true表示至少一个durability listener参加且全部成功；不能直接拿followup返回作为checkpoint。
- `session/session-persistence/src/index.ts:145-200`：inspect返回逻辑只读视图，cold未完成turn会在内存合成interrupted结束；load可将cold修复写回；prepare用于resume预留未发布Session。这三者不能当作纯原始JSONL读取。
- `session/session-persistence/src/coordinator.ts:892-934`：cold完整尾部保留并生成缺失closers。`interrupted`是恢复标记，不能冒充原执行者已报告failed/succeeded；未知格式/损坏拒绝。
- `owner-workflow-plugin/src/runtime.mjs:2480-2504`：当前provider先create、persistOwnerSession，再以随机消息IDfollowup并whenIdle。T-22将来才消费T-20的预留身份；此处本轮未改。

## 探针解释

session探针的已持久化场景追加真实但人工构造的平衡turn/start、turn/end，不运行模型；它证明显式ID创建与resume，不证明一次工作完成。prompt探针completed场景则由真实AgentLoop驱动受控MockAdapter完成，日志里的user/message和turn/end是真实生产链写入。

pending场景用inject不唤醒，证明已flush队列可重建及pending重复ID拒绝；不能据此声称followup恢复自动继续。followup-return场景不调用flush，父进程在收到返回后IPC信号时SIGKILL，磁盘落盘存在竞争；单次无文件观察不能泛化为每次都丢失，也不能把无文件判为从未创建。

running场景在MockAdapter已收到请求后保持挂起并flush，然后SIGKILL。restart加载所见interrupted来自后端修复，不是旧执行的业务终态。completed场景flush后SIGKILL，resume后显式再次followup同ID，若出现第二次模型请求，证明底层没有全历史幂等；不能推导现有完整DSH runner会自动重复启动，因为本探针直接驱动局部API。

所有旧进程由父进程实际SIGKILL并记录PID/signal，重启为独立Node进程；无文件/活跃/已创建lazy/持久化可恢复分别陈述。生产Root/预算和lease未参与；全入口并发隔离、取消fencing仍在其他工单。

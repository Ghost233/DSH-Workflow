# T-09 独立技术复阅

代理：`/root/t09_budget_audit`，worker / gpt-5.6-terra / xhigh。先并行只读审计现有实现，再复阅冻结探针及正式证据；未修改任何生产文件或自行运行全套。

结论：**可标记开发完成：可靠否定现有预算合同。不能标记AC-24/31生产验收通过。**

5个恢复场景、3个边界场景均无probeError；3项既有超时回归通过；64个生产文件和4个证明文件最终无漂移。每个采集进程外层60秒。

同事实跨Runtime保留策略并最终incident；受控真实文件事实变化及A/B旧hash回放均8次重开local_subgraph_rewrite，maxAttempts=1仍到恢复启动边界3次。attempt/recoveryCount未成为随恢复递增且受限的两级账本。探针不能表述为真实模型已执行。

真实Composite展开/迁移接缝保留结构parentTaskId，子状态未承接父autonomousRecovery；不能据此冒充在线版本事务已验证。

超时后task已pending而cancel Promise尚未结算、lease仍有效。4小时前起点加当前心跳仍running，证明旧超时是可延展空闲超时，不是硬deadline。

incident后Supervisor仍能create并ack T2，产生reserved回执；不能根据Workflow blocked宣称独立任务被全局阻塞。队列启动被stub，仅证明领取资格。

局限：planningRuntimeFacts由受控投影注入，未测生产事实收集器；重启是新Runtime读持久状态而非SIGKILL/断电；无真实模型/token测量、无live PlanRevision子任务恢复。以上限制不削弱拒绝当前代码满足R4两级持久预算的结论。

方案保持拟议：稳定rootProblemId、两级ledger、幂等attempt锁内扣减后派发、派生继承、新证据不退总额、固定deadline及取消结算后释放资源。主线程复核后采纳。

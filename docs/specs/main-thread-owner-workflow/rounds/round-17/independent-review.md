# 第17轮独立只读审查

审查者t21_contract_review。以baseline.json到candidate.json/round.diff为范围，两者均1617项，实际仅runtime.mjs、recovery-session.test.mjs与合同变化；未修改候选或重跑测试。

结论：F-16已修复，未发现新增P1/P2。OwnerLeaseUnavailableError仅标记领取阶段确定占用/初始化/有限竞争；新入口仅在acquire边界转换此类型及owned:false，返回paused/technical_pause/owner_lease_unavailable，不读取未获权的Workflow/session。非冲突IO、取消和已持有lease失效保留异常语义。只有本调用owned:true的lease进入finally释放，原有token核验仍在，不释放其他持有者。

定向8/8通过，新增实际同Runtime异task、同task重入、独立Runtime磁盘竞争、初始化目录、普通路径IO与预取消；检查原lease、账本、raw、模型请求不变。磁盘竞争发生在同一OS进程的两个Runtime实例，不声称真实跨进程或硬截止验证。

control单次180秒超时保留为验证限制。其已报告130项通过/7项跳过，29项未报用例补验通过，候选无漂移；不能说单次control完整通过或0超时。目前没有将变慢归因于本修复的具体源码证据，亦未证明环境原因。

主线程复核同意结论。正式后未改生产、测试或合同。T-22仍缺首次启动、resume、真实T13结算及continuation，不解锁T-23/T-15。

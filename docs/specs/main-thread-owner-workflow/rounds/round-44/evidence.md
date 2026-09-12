# R44 范围

只修R43 authority竞态：同attempt/session的failed|blocked才能写待决，其他来源保守暂停；领取事务结构化authority拒绝由helper锁内重读并持久化outbox，权限依据优先于同源handoff。主线程独占runtime.mjs和runtime-recovery-budget.test.mjs；保留其他修改，无Git操作。基线R43候选1622。

正式范围：runtime-recovery-budget、recovery-admission、recovery-session。R43 control/resilience/T23边界保持原有路径证据，本轮不重复其不变的执行/结算逻辑；新增仅权威分类和领取前错误分流，若改变执行/结算再扩测。

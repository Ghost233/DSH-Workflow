# 第43轮

修R42的authority持久决策、handoff门禁及普通finish/abort分流三项。仅runtime.mjs和runtime-recovery-budget.test.mjs由主线程写，保留既有修改。基线1622。先定向真实公开dispatch/outbox和结算、handoff竞态，再冻结受影响回归。

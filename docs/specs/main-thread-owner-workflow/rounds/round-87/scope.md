# R87 范围

本轮只交付 T27 的活跃父版本规划路径：主线程修订 Spec/Ticket 后固定带父执行版本的 checkpoint，沿用 T26 compile 和 R85 independent review，再通过已有 PlanRevision 迁移激活。

验证重点是父版本失配、同父候选竞争、持久暂存后的恢复、原授权复用、运行中兼容 attempt 的 `pending_check` 迁移和同候选重放。T17 的跨进程停止/fencing与 T18 的恢复预算继承不并入本轮。

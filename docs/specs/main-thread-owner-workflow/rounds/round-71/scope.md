# R71：首次独立Owner的实际执行生命周期

T15，专用runCandidateIndependentReservation入口，首次无Owner历史，真实runExternalOwner/verify/commit/finish链；绑定复核及全局暂停状态保留。代理仅新candidate-independent-runtime.test.mjs，主线程runtime/helper/合同，互不覆盖。先不启用daemon自动派发及旧Owner恢复，真实正负端到端后再推广。

开发阶段补齐真实外部权限typed等待分支、终态重放及共享合并现场排除；纳入本轮验收。新测试由Hilbert独占完成后已停止写入。正式范围：candidate-independent-runtime、candidate-independent-supervisor、candidate-recovery-pause、runtime-recovery-budget、owner-submission、memory、workflow-state、control。

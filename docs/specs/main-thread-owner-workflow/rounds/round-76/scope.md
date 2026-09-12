# R76：逐Owner会诊持久计费会话

扩展内部owner_consultation操作种类，沿用同根预算和固定session/prompt；通过只读owner-advisor子代理的workflow_owner_advice_submit取得原始JSONL接受回执，ownerId与请求/会话/工具绑定，不伪造Owner执行历史。真实预留→提交→新Harness重放、耗尽零调用、错误Owner/无提交及未知会话拒绝。submission_observed仍不是语义采纳或预算成功结算，实际仲裁操作生产/采纳在后继接线前保留R75门禁。

主线程拥有Runtime/ledger/admission/session/policy/index及既有budget测试；worker拥有新owner-advice.mjs和owner-advice-session.test.mjs。正式：新advice、replan-session、budget、admission、security、plugin、control，180秒每套串行。冻结后只读审查。

冻结前补充正式范围：candidate-arbitration-recovery。初始会诊normalizer已移动到共享模块，需直接保留R75非恢复会诊兼容与恢复门禁证据。

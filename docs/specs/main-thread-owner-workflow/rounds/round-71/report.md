# R71：候选暂停期间独立 Owner 的实际生命周期

真实 Owner、固定验证、commit、workflow merge、finish 与 Memory 已接专用入口；验证成功、技术失败、来源变化以及真实权限请求，保留来源、预算和全局暂停状态。fresh Harness 终态重放不重复模型调用。

正式八套 275 通过、7 跳过，零失败、超时、候选漂移；见 test-results.json 与原始日志。开发初期有夹具断言错误，也发现并修复 blocked 状态下结果写入门禁未接绑定的实际实现问题，原始 development 日志保留。

P2：终态 reservation 未强制匹配 Owner/task 终态，矛盾持久状态可通过 lease/save 与重放校验。当前正常执行路径未发现会自行制造该状态；完整性门禁仍应拒绝。下一轮修复 completed→双方 completed、failed→Owner failed/blocked 且 task stopped；保留 launching 在 finish 后、结算前的合法过渡。独立审查未确认其他新增 P1/P2。

T15 仍开发中。daemon 自动派发、未知 launching 恢复、硬 deadline、后继失败恢复尚未完成；不代表整体验收。没有 commit/push/fetch；原有脏工作区保留。

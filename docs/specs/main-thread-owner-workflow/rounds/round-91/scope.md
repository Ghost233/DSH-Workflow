# R91 范围：T18 执行版本继承

本轮消费 T05、T07、T13、T15 与 T27 已完成前置，在真实 `approvePendingPlanRevision` 入口实现 T18。生产写入范围固定为：

- `owner-workflow-plugin/src/recovery-admission.mjs`
- `owner-workflow-plugin/src/runtime.mjs`
- 对应恢复候选与 RecoverySession 测试
- T18、T19、恢复合同及当前进度文档

本轮交付连续执行版本边、开放 root 的 task/Owner 目标映射、计划与恢复配置的原子激活、旧 attempt 跨版本结算和新版本来源继承。T19仍负责代表执行包测量、有限生产默认值、新 Workflow 启用与 legacy 兼容；本轮不从测试限额推导生产参数。

真实 Harness 测试在 Codex 外层沙箱之外执行，测试内部保留正式 Owner `workspace-write` 沙箱。未修改 Git 分支，未提交，未推送。

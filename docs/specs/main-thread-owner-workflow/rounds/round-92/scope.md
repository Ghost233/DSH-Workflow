# R92 范围：T19 有限恢复策略启用

本轮消费 T15、T17、T18 及 B01 已完成的真实入口，只交付 T19/F11：

- 用固定代表执行包记录恢复调用分布和 Harness 运行时间；
- 冻结新 Workflow 的版本化两级限额、Owner hard deadline 来源及取消终态观察窗口；
- 在 legacy `workflow_start → approvePlan` 与原生规划候选激活两条新建入口持久写入策略；
- 关闭缺失、未知、篡改策略及策略/config 不一致；
- 保留无新策略标记的旧 active Workflow，不静默迁移或推算余额；
- 回归 T15–T18 的预算、会话、截止和执行版本行为。

生产写入范围为 `recovery-policy.mjs`、`recovery-admission.mjs`、`runtime.mjs` 和对应测试。文档写入范围为恢复策略合同、T19、R4 12.6、进度与本轮证据。没有修改 Git 分支，没有提交或推送。

# R89 范围：T17 固定截止与取消结算

本轮消费 T13、T15、T16 的已完成前置，实现 T17，不改变旧 `onTimeout` 空闲超时的含义。生产写入范围固定为：

- `owner-workflow-plugin/src/owner-attempt-control.mjs`
- `owner-workflow-plugin/src/runtime.mjs`
- `owner-workflow-plugin/src/owner-submission.mjs`
- `owner-workflow-plugin/src/model.mjs`
- 对应 T17 测试与 RecoverySession fixture 配置入口

本轮交付固定 hard deadline、持久 `stopping`、真实取消请求、终止观察窗口、session/attempt/token/generation fencing、恢复账本一次结算，以及不共享 Owner 的任务继续执行。T19仍负责代表测量、生产默认值和新 Workflow 默认启用；本轮只提供显式有限 Runtime 配置，不提前决定默认时长。

真实 Owner 测试必须在 Codex 外层沙箱之外执行，测试进程内部仍启用正式 `workspace-write` Owner 沙箱。未修改 Git 分支、未提交、未推送。

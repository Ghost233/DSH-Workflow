# R89：T17 固定截止与安全结算完成

T17 已实现独立于 idle timeout 的 attempt hard deadline。每次启用该协议的初次或恢复执行在启动记录中固定绝对截止、只减不增的剩余上限、观察窗口、执行版本、attempt、lease token 和 settlement generation；session 建立后只允许绑定一次。Owner heartbeat 不写这些字段，控制器观察也不能延长期限，墙钟回退会关闭为技术暂停。

截止后 Runtime 先持久化 `stopping` 和唯一取消请求，再调用真实 `child.cancel`。取消返回本身不算终止；只有匹配 session 的持久 `turn/end` 出现后，Runtime 才把 attempt 标为 `settled`、释放原运行 lease，并允许后续恢复。取消适配异常、无当前进程取消目标和观察窗口到期分别持久为 `technical_pause_cancel_unconfirmed` 或 `technical_pause_termination_unknown`，任务进入有限 `termination_unconfirmed/inspect_runtime` 停止态，同 Owner 仍不能再入，其他 Owner 可继续。

结果写入在 `owner_submit` 前、固定验证后、commit 后、Owner committed/awaiting_finish 写入前重复核验 attempt/session/token/generation。旧 attempt 即使仍持有进程内对象，也不能在新 generation 或 stopping 后提交。恢复 attempt 的真实终止同时把既有 T13 debit 结算一次为 failed，保留原 root problem 和 continuation；控制器重启可从持久 terminal 继续完成相同结算。

正式候选覆盖 9 套 386 通过、7 个既有 legacy 跳过、0 失败。真实 hard-deadline 套件包含正常 stopping→terminal→settled、恢复扣费、取消延迟期间独立 Owner 完成、取消调用异常后凭 terminal 恢复、无 terminal 有限暂停、无取消目标及同 Owner 拒绝。既有 idle-timeout、RecoverySession、Supervisor、控制、韧性和提交关卡回归均通过。完整结果见 [test-results.json](test-results.json)。

T17 状态更新为开发完成，F8关闭。T19仍需等待T18及代表测量/启用合同，B04和CA01尚未完成。

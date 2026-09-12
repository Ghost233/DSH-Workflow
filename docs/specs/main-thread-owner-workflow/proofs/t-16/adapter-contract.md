# T16 停止适配合同与 T17 实现边界

依据：唯一规格 §12.4，T16 六轮实际 Harness/JSONL/lease 证据；主线程在 R55 固定本适配边界。此文定义 T17 的实现输入，不声明 Runtime 已实现 stopping 或硬截止。各轮原始结果与冻结版本保留，未将不同版本拼成一次联合验收。

## 已验证的平台接缝

- 实际 child.cancel 是同步 void 请求。真实 AbortSignal 可早于 turn/end；重复取消已结束 child 不新增结束事件。取消返回值、错误文本和 partial JSONL 都不能充当终止回执。
- 正常取消后可以从实际 JSONL 读到匹配 session 的 turn/end:aborted；原执行管线结束后旧 lease 失效并可取得新 token。证据为离散场景与采样，不推广成所有间隙的连续证明。
- 旧执行未结束时，真实同/跨 Runtime 与跨 OS 进程 lease 拒绝；独立 Owner 实际完成。新 attempt 通过 recoverOwner 启动后，旧 child 调用注册 owner_submit 被 active-session 门禁拒绝，新记录不变。
- 控制器在 abort 后被 SIGKILL 时，新 Runtime 读到 partial JSONL 无 terminal；死 PID lease 可接管但 running record 不会自动完成。recoverOwner 有限返回 owner_failure_task_running，不能将 lease 接管当终止或新 attempt 许可。

证据索引：[首轮](report.md)、[独立 Owner](round-02/report.md)、[跨进程](round-03/report.md)、[旧 lease](round-04/report.md)、[新 attempt /旧 child](round-05/report.md)、[SIGKILL 与完整矩阵](round-06/report.md)。终态读取的稳定性规则沿用 T21/T22 原始 artifact、双 snapshot/revision 和唯一 prompt-turn 检查；单次 readFrom 的合成恢复投影不能替代 raw。

## T17 必须实现的状态和写入约束

请求身份至少绑定 workflowId/taskId/ownerId/attempt/sessionId/leaseToken/执行版本，并持久固定 cancelRequestId、settlementGeneration、cause、固定 deadline、观察窗口、最新持久会话 revision。重复同一请求不新建尝试、不退额度、不延长时间；新 attempt 使用新身份。所有输出及结算在持久状态事务内重核完整身份，旧进程或迟到回包必须拒绝。现有 active-session 门禁只是输入证据，不能替代跨进程 token/generation 校验。

期限到达先持久 stopping，再请求取消。取消返回不改 pending、不放同 Owner 或冲突资源；主线程只进行有限观察。释放条件是匹配会话实际终态、相应执行管线持久结算和 lease 已失效或可证明安全隔离共同成立。仅 PID 死亡、缺文件、torn/变化日志、失去 child、cancel 异常都不是上述共同条件。

无法确认时，有限返回并持久 technical_pause_termination_unknown；取消请求不可确认时记录 technical_pause_cancel_unconfirmed。暂停含当前身份、请求、最后 raw/revision/lease 观察及原因，禁止同 Owner 再入，保留现场；独立任务保持资格。未知终止禁止通过再次启动来试探。暂停不是用户决定，也不是成功结算。

deadline 在初次和恢复 attempt 开始前固定；同一 boot 按单调时钟扣减且持久 remainingCeilingMs 只能下降，绝对时间作为更严格上限。重启时按持久剩余与绝对截止取更严值；墙钟早于最近持久观测时保守技术暂停/到期。心跳不得更新期限。round06 的纯计算只验证算法，不是生产行为或默认超时测量。

## 有限交付与依赖解除

T16 的交付是上述真实正向平台接缝、可靠重启反例及固定的失败出口合同。它不实现 T17 的持久 stopping、跨进程结果写入校验和硬截止；把这些实现作为 T16 前置会构成循环依赖。

T17 实现后必须补验：真实取消后 stopping→terminal→settled；取消调用适配异常；SIGKILL 无 terminal 时有限暂停；有可核验 terminal/结算时安全恢复；跨进程旧回执拒绝；硬截止伴随心跳/重启/墙钟回拨；观察到期与无关 Owner 实际继续。若实现时发现现有 API 无法满足这些已固定条件，应保留阻塞并登记具体平台缺口，不能降低验收或让 T16 先实现 T17。

T16 技术验证交付不代表 AC-21/24/31 或 BUD-07/08 验收通过。T17 仍等待 T15 当前 attempt/持久恢复接线完成。

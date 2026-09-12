# R54：空闲超时不再提前重排 Owner

保护协议下，现有 onTimeout.afterMs 触发后先持久记录绑定当前 attempt/session/lease 的取消请求，保持 Owner、任务和槽位。实际管线结束后才按真实失败进入预算恢复；取消目标不可用或调用出错保留现场并记录，同来源不重复取消。

正式结果 337 通过、7 既有跳过、0 失败/超时/漂移：runtime-recovery-budget 48、admission 43、session 27、control 159 通过/7 跳过、resilience 60。证据见 test-results.json、原始日志、candidate.json 和 round.diff。新集成场景覆盖实际 abort、终态前保留槽位、独立 Owner 完成、终态后付费恢复以及耗尽停止。开发首次测试误用同 Runtime 排队等待，原始失败保留；修正的是观测方式，未放宽隔离。

独立只读审查无新增 P1/P2。此处处理空闲超时，不是 T17 固定硬截止/观察窗口或跨进程未知终止恢复。T15 仍开发中，外部 replan 的统一预算绑定和完整联合一致性尚待接线，见 replan-entry-audit.md。

T16 round-05 新 attempt 与旧 child 拒绝已复核；round-06 给出真实 SIGKILL 后 partial JSONL、死 PID lease 接管但旧 Owner 仍 running 的恢复反例，独立复核中，不标记完整取消协议验收通过。

未提交、推送或同步，既有改动保留。git-evidence.json 记录本地 tracking：主 main 一致，Harness 落后 3364、vendor 落后 4，Synapse detached；未查询实时远端。

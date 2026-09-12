# T-16 第六证据切片：真实取消后控制器 SIGKILL 的 JSONL、lease 与恢复边界

日期：2026-09-11。范围：R4-V03-1 §12.4 已批准的 T-16 技术验证。本轮用两个真实本地 Harness OS 进程验证：第一个进程的 live API Owner 收到实际 `child.cancel()` 的 abort 后、尚无 `turn/end` 时，由驱动进程以 `SIGKILL` 终止该控制器；第二个进程重新挂载同一 JSONL/workflow/lease 现场并调用现有 `recoverOwner()`。另以纯参考计算固定 deadline journal 在单调时钟、重启及墙钟回拨时的保守规则。本轮不实现生产 `stopping`、deadline、receipt 或 T-17；这些生产适配不作为本验证切片对 T-16 证据交付的循环前置。T-16、AC-21、AC-24、AC-31 与 T-17 的整体状态仍由主线程依 §12.4 审定。

## 冻结、正式运行与来源

[freeze.json](freeze.json) 固定正式候选。Runtime SHA-256 为 `6f586b70874f3edb7a56fbe2116d44842821b290f9f103467832e0477ab30c35`，正式前直接复制的 [runtime-source.mjs](runtime-source.mjs) 与其完全匹配。测试实际消费的 [recovery-admission 源码](recovery-admission-source.mjs)、[recovery-session 源码](recovery-session-source.mjs)、[Owner Agent 源码](owner-agent-source.mjs)、[Harness fixture](recovery-session-fixture-source.mjs)、[Agent cancel 实现](agent-loop-agent-source.ts)、[session flush](session-source.ts)、[持久化 coordinator](persistence-coordinator-source.ts)、[JSONL 后端](jsonl-persistence-source.ts) 和有限模型传输所用的 [MockAdapter](mock-adapter-source.ts) 均已直接归档并逐项哈希校验。Harness `HEAD` 是 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。

[run-proof.py](run-proof.py) 在复制和哈希后以 45 秒外层上限启动正式 probe；每个进程、cancel-signal、flush、SIGKILL 退出、重新打开、lease 和恢复观察都限 8 秒。正式 wrapper 从 `10:24:43.586907 UTC` 到 `10:24:46.097699 UTC`，整次 Node 进程约 2.51 秒；[formal-probe.log](formal-probe.log) 的 `probeElapsedMs` 为约 2.33 秒，从 probe 开始计时。两种时间口径不可混用。正式采集一个场景，exit 0、0 timeout、0 probe error、0 源码/探针漂移，见 [formal-results.json](formal-results.json)。

第一个进程 PID `13688` 使用真实 `createRecoverySessionFixture` 的临时 Git 根、Owner worktree、`LocalSandboxProvider`、`SandboxPolicyService`、`JsonlSessionPersistence`、实际 Agent 和生产 `runExternalOwner()`。第二进程 PID `13567` 使用 `reopenRecoverySessionFixture` 重新创建 Harness Context/Runtime，再读取同一持久根。模型替身只是一段有限本地传输：它发出一段 partial text、等待真实 `AbortSignal`，每次等待有 8 秒上限；它不替换 cancel、lease、JSONL、Owner 启动或恢复入口。驱动在真实 signal 被观察、真实 `ctx.sessions.flush()` 成功后才发送 `SIGKILL`；没有用无限 Promise、固定 sleep、生产网络或手写 JSONL/lease 来伪造结果。

## 本轮观察

| 观察 | 原始事实 | 有限结论 |
| --- | --- | --- |
| 真实 cancel 的延迟边界 | live child 的 `cancel({kind:'user'})` 未抛错且返回 `undefined`；模型 transport 观察到真实 abort signal 时，内存 `turn/end` 仍为空 | 当前 Harness 调用是同步请求，不是会话结束确认。真实 cancel signal 可到达而终态仍未发生。 |
| 控制器被真正杀死后的 JSONL | `ctx.sessions.flush()` 后 PID `13688` 被 `SIGKILL`；PID `13567` 的新 Context 从同一 session ID 读到 raw JSONL artifact、13 个事件、零个 `turn/end` | 已持久的 partial session 不等于实际结束。此场景没有借由重新打开合成 `aborted`，也没有把 JSONL 存在误称为终止 receipt。 |
| 留存 lease 与死 PID 接管 | kill 后 lease 文件仍含旧 PID `13688` 和 token `def91345…`。第二 Runtime 通过实际 `withOwnerLease()` 的 stale-PID 路径取得 PID `13567` 的不同 token `f4af10d7…`，然后正常释放短 lease | 当前磁盘 lease 能把**记录完整且 PID 已死**的 lease 原子接管。这个 lease 接管只证明隔离锁的死 PID 恢复，不证明旧 Owner 已终止或结果已安全结算。 |
| 现有恢复入口的对账结果 | 持久 `ownerRuns['T1:api']` 在接管前后都为 `running`、attempt `1`、旧 token；实际 `recoverOwner()` 返回 `DSH_OWNER_AUTONOMOUS_RECOVERY_PAUSED_V1`，reason `owner_failure_task_running` | 当前恢复入口没有把“cancel signal 已发出 + controller 已死 + partial JSONL”解释为可启动的新 attempt。它给出有界 paused 结果；该反例为 T-17 的生产 `stopping`/终止确认/安全隔离适配划定输入，而不是用尚未实施的 T-17 反向否定本轮 T-16 证据。 |
| deadline 参考模型 | 纯计算 journal 从 6000ms 剩余时间推进到 4000ms；同 boot 下墙钟回拨时借单调时钟降至 3800ms；重启且墙钟再次回拨返回 `technical_pause_clock_rollback`、0；绝对 deadline 到期返回 `expired`、0 | 非递增剩余额度与绝对 deadline 可以防止心跳或墙钟回拨将窗口向后延长。它是设计验证，**不是**当前 Runtime 的 deadline 实现。 |

`cancel()` 的真实调用没有可注入的异常回执：本轮和第一轮的真实调用均同步返回 `undefined`，已结束后的重复调用也不产生新的终态事件，见 [第一轮报告](../report.md)。若用 wrapper 或替身人为抛错，只会验证 wrapper，不会是 Harness cancel 事实，因此本轮没有伪造“cancel 调用抛错”。当前平台可确认的异常边界是：调用方必须把未来 adapter/包装器的同步抛错视为“请求未被确认”，保留 Owner 隔离并持久技术故障；现有 `ReactLoopAgent.cancel` 本身没有可供 API 消费的 accepted/error receipt。

## T-16 完整证据矩阵

| T-16 交付项 | 可复核证据 | 当前判定 |
| --- | --- | --- |
| 执行中真实 cancel、实际 signal 与终态的关系 | 第一轮、Round 03、Round 04 和本轮均是实际 Agent cancel；本轮在 signal 后以真实 SIGKILL 刻意保留 `turn/end=[]` | **部分正向**：cancel 不等于终态已证明；正常完成后的 `turn/end: aborted` 见第一/三/四轮。 |
| 已结束后的重复 cancel | [第一轮](../report.md) 观察到返回 `undefined`、无新 terminal/model request | **正向，局部 Agent API**。 |
| cancel 调用延迟/抛错边界 | 多轮真实 signal 早于终态；本轮证实 signal 后控制器可被杀死而无终态。原生 `cancel` 没有实际可达的错误结果通道 | **延迟正向；抛错未验证且当前不可从原生 API 观察**。不以 mock throw 代替。 |
| cancel 未 settle 时同 Owner 不可重入 | 第一/二/三轮的真实同 Runtime、跨 Runtime 和跨 OS 进程磁盘 lease 拒绝 | **正向，有界采样**。不声称连续全间隙无早释。 |
| 不相关 Owner 可继续 | [Round 02](../round-02/report.md) 中独立 Owner T2 实际启动、提交并完成 | **正向，同进程受控场景**。 |
| 终态后安全获得新 token | 第一/三轮在原执行终态后观察到新 token；本轮死 PID lease 也能新 token 接管 | **正向但语义不同**：前三轮是已观察 terminal 后；本轮仅是死 PID lease 接管，不能当终态许可。 |
| 控制器重启/退出后的持久对账 | 本轮真实 SIGKILL、raw JSONL、旧 running record、dead-PID lease 和 `recoverOwner` 的 pause | **可靠反例/缺口**：现有路径不能据此形成可恢复新 attempt 或终止 receipt。 |
| 旧 child/旧结果对新 attempt 的拒绝 | [Round 05](../round-05/report.md) 中，真实 `recoverOwner` 新 attempt 运行期间，实际旧 child 通过注册 `owner_submit` 提交结构化结果被拒，新 record 深比较不变，随后新 attempt `settled_succeeded` | **正向，同 Harness 进程、active-session 门禁**。不是跨 OS 进程 token 写入的完整证明。 |
| 旧 lease/token 本身的 result-write fencing | Round 04 旧 lease object 失效；Round 05 旧 child reject；没有把旧 token 交给跨进程持久写入口 | **未验证**。现有 `owner_submit` 是 session-identity 门禁，未公开 token 参数。 |
| 固定硬 deadline、不受心跳延长 | T-09 已确认现有 `onTimeout.afterMs` 是空闲超时；本轮纯 deadline journal 计算验证了保守算法 | **T-17 生产实现责任**。纯计算已给出保守适配规则，不能升级为当前 Runtime 行为。 |
| `stopping → terminal/settled` 持久协议、有限观察和技术出口 | 本轮说明仅 cancel/signal/SIGKILL/partial JSONL 时没有该协议；`recoverOwner` 的 paused 结果不是 stopping 结算 | **T-17 生产实现责任**；本轮反例和下述有限错误出口合同是其实现输入。 |

## 审校说明：T-16 证据交付与 T-17 责任

T-16 的交付是对现有真实 Harness/Runtime 接缝的可复核事实、局限和可实施的有限错误出口合同。本组证据已覆盖真实 cancel 的同步返回与终态分离、真实 `turn/end: aborted` 的正常终止路径、取消间隙同 Owner lease 拒绝、独立 Owner 的实际完成、死 PID lease 接管、SIGKILL 后 partial JSONL/`recoverOwner` 的反例，以及同进程新 attempt 期间旧 child `owner_submit` 的实际拒绝（Round 05）。这些是 T-17 设计和实施可以直接消费的 T-16 证据；它们不依赖先有 T-17 生产状态机。

本轮没有伪造跨 OS 进程旧 token 的持久 result-write，也不把该未有正例说成已有能力。T-17 负责实现生产 `stopping`/终止结算、固定 deadline journal、result token/generation 校验和实现后的跨进程补验；T-16 提供的重启反例要求这些实现把 partial JSONL、仅 PID 死亡和不稳定持久化读保守地导向有限技术出口。是否已满足 §12.4 从而解除 T-17，仍由主线程对完整 T-16 矩阵审定；本报告不直接宣布 T-16 整体通过或失败。

## 可实施的停止合同建议

以下是对 §12.4 已批准 `stopping`/确认/有限技术出口的最小技术适配，不要求先实现 T-17 才能使用本轮平台事实，也不把它误称为当前 Runtime 行为。

1. Runtime 为每个 `(workflowId, taskId, ownerId, attempt, leaseToken, sessionId)` 持久写入一个不可变 `cancelRequestId` 和 `phase: stopping`，包括 cause、请求时间、固定 `deadlineAtEpochMs`、非递增 `remainingCeilingMs`、最近 wall-clock/boot identity 与 session persistence revision。cancel API 返回的是这个**请求回执**，不是 `stopped` 成功回执；同一个 request ID 可幂等重放。
2. 请求时保持 current Owner lease 和槽位。调用实际 `child.cancel()` 后，仅记录 signal/request 已发出；同步异常、缺 child 或调用返回未知均写入 `technical_pause_cancel_unconfirmed`，不将 task 改为 pending 或释放同 Owner。
3. 控制器启动或重启时，按绑定读取 `readRaw`、有效 `readFrom` 和稳定的 revision/snapshot。只有观察到匹配 session 的真实 terminal 事件、当前 attempt/token 的持久结算依据，以及 lease 已失效或已安全隔离，才能写 `stopped/settled` 并释放可释放槽位。partial JSONL、缺文件、torn/变化 revision 和仅 PID 死亡都进入 `technical_pause_termination_unknown`；本轮证明这些不能偷换成 terminal。
4. 所有 result/settlement 写入在同一状态锁内重新比较 attempt、session ID、lease token 和 cancel/settlement generation。旧 child/旧 session 在写 report 之前拒绝；旧进程或延迟回包即使能抵达，也不得覆盖当前 record。Round 05 的 active-session 正例可成为该检查的一部分，仍需补跨进程的 token/状态写断言。
5. 硬 deadline 从 attempt 创建时一次性设定。单个 boot 使用单调时钟扣减；每次持久更新只能降低 `remainingCeilingMs`，wall-clock absolute deadline 只作更严格上限。重启后 wall clock 早于 journal 的最近观测必须 fail closed 为技术暂停/到期，不能利用回拨重置或乐观延长窗口；heartbeats 与观察只记录进展，不改变 deadline。
6. observation window 到期后写出结构化技术失败/暂停，带 cancel request、绑定身份、最后 raw/revision、lease 状态和检查次数。Owner 保持不可重入或被明确安全隔离；不无限轮询、自动退款或转成业务决定。无关 Owner/资源仍按 Round 02 的现有调度资格继续。

最小后续正向验收应在实现后运行：真实 cancel → durable `stopping` → terminal/lease-safe → `settled`；真实 cancel call error 的适配器边界；SIGKILL 位于 request 与 terminal 之间时重启到 `technical_pause_termination_unknown`；SIGKILL 后已可验证 terminal/receipt 时新 token 新 attempt；旧进程/旧 child的延迟 result 在新 attempt 期间被拒；deadline 正常推进、同 boot 回拨、跨 boot 回拨、观察到期及无关 T2 同时运行。每一项都应保留 raw JSONL、lease/token、PID、状态 journal 和有限外层时限，不能用 wall clock、sleep 或 mock cancel 填补。

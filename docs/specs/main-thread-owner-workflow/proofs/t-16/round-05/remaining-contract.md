# T-16 剩余交付矩阵与有界联合验证合同

本文件只整理 T-16 剩余技术验证，不修改 Spec、Ticket、Runtime 或共享夹具。§12.4 要求的是：固定 deadline 到期先持久 `stopping`；取消返回不等于终止；只有确认旧会话结束且 lease 失效或安全隔离后才能同 Owner 重入；不能确认时在有限窗口后保留不可重入并报告技术故障。

## 当前证据与尚缺项

| T-16 交付项 | 已有实际证据 | 仍需验证 |
| --- | --- | --- |
| 执行中取消、返回值与真实结束事件 | Round 01/04/05：`ReactLoopAgent.cancel()` 同步返回 `undefined`，abort signal 与 `turn/end: aborted` 分离；JSONL 可重读该终态 | cancel 调用抛错、cancel 已请求但终态在观察窗口内迟到、以及控制层对此的持久处理。 |
| 已结束后的重复取消 | Round 01：已结束 child 的重复 `cancel()` 不产生新的终态或副作用 | 将这一行为纳入持久 stopping/settlement 记录后的幂等重放。 |
| 取消未结算时同 Owner 隔离 | Round 02 同进程、Round 03 跨 OS 进程均以真实磁盘 Owner lease 拒绝同 Owner；Round 02 另有独立 Owner 完成 | 重启控制器后从持久现场做同一判定，及观察窗口耗尽时保持拒绝的持久原因。 |
| 确认后可安全恢复与旧结果隔离 | Round 05：真实 `recoverOwner()` 建立 attempt 2、新 session 和新 token；旧 child 的注册 `owner_submit` 被拒绝，record 未改写；attempt 2 实际 completed | 跨进程/控制器重启中的旧回包，及一个公开、可审计的 token-fencing 写入拒绝结果。 |
| 固定、单调、持久 deadline | 无 Owner 生命周期正向证据 | deadline 的权威写入、重启后的剩余时间计算、到期动作及不会被 heartbeat 延长的证明。 |
| 有限观察和技术失败出口 | `reconcileRecoverySession()` 已对缺 raw artifact、快照变化、未知 Owner lease/receipt 等返回 `technical_pause` | deadline 取消后的 `stopping → terminal/technical_pause` 闭环、不可重入投影和主线程可读的失败理由。 |
| 父控制器重启对账 | `reopenRecoverySessionFixture()` 可用同一根目录创建新 Harness Context；JSONL 提供 `readRaw`、`readFrom`、`listSnapshots` | 真正取消中断时杀死第一控制器、第二控制器从同一 workflow/lease/session 对账，并验证不重复启动/不提前释放。 |

## 已有平台接口与其限制

- Harness `ReactLoopAgent.cancel(cause)` 是同步 void：它清 inbox 并对活动 phase 的 `AbortController` 调用 `abort`。Session vocabulary 中 `turn/end` 的 `aborted` 与 `interrupted` 是可持久读取的不同事实。它没有 accepted receipt，也不承诺在返回时已经产生终态。
- JSONL `readRaw`、`readFrom` 与 `listSnapshots` 可以在 compression:none 下读取稳定前缀；`reopenRecoverySessionFixture()` 在同一持久根创建新的 Harness Context，且不初始化 Git、不 `prepareRoot`、不写 workflow state。`inspectRecoverySession()` 已将 artifact/快照/身份不确定性归为 `technical_pause`，并明确不把 terminal observation 当 Owner lease 或业务结算依据。
- `recoverOwner()` 通过 recovery admission 和 `reconcileRecoverySession()` 使用现有 `runExternalOwner()`。`recoverySession` 已持久 source/root problem/request/attempt、session/prompt identity 与 `{attempt, leaseToken}` Owner binding；Round 05 证明该路径可实际消费这些字段。
- external runner 有自己的 `deadlineAt`，但它属于 runner attempt 文件及 daemon 投影；当前证据未表明它是 Owner attempt 的 deadline，也未表明它驱动 `stopping`、终态确认或同 Owner 释放。因此不能拿它满足 §12.4。

## 最小停止适配合同（T-17 实现输入）

以下字段是 T-17 需要加到 Runtime 权威 Owner attempt 记录或等价不可变事件中的协议字段；它们不是当前 T-16 已实现事实：

| 字段 | 作用 |
| --- | --- |
| `deadlineAt`、`observationDeadlineAt` | 启动时一次性持久的绝对时间；重启按墙钟计算剩余时间，heartbeat 不能改写。 |
| `stop` `{requestId, cause, requestedAt, requestedBy}` | 幂等记录 cancel 已请求或调用异常；同 requestId 重放不重复调用 child cancel。 |
| `attemptBinding` `{workflowId, taskId, ownerId, attempt, leaseToken, sessionId}` | 每次停止、观察、提交和恢复均核验的当前身份。现有 recovery session 已覆盖其中多数，可复用而不能假定普通 Owner 已覆盖。 |
| `terminalObservation` `{turnEndKind, terminalSeq, observedAt, persistenceRevision}` | 只由实际 session/JSONL 观察产生；`aborted`、`completed`、`error` 与 `interrupted` 保持可区分。 |
| `settlement` `{phase: settled|technical_pause, reason, settledAt}` | 终态且 lease 失效/隔离后才为 `settled`；观察耗尽、cancel 调用错误、日志不稳定或身份不匹配写 `technical_pause`，保持 Owner 不可重入。 |

提交路径应在持久写入前同时比对 `attemptBinding` 和当前 lease；`owner_submit` 的 session identity gate 仍保留。恢复只接受 `settled` 或经明确安全隔离的 attempt，不能因 `stop` 已记录或某个 raw `turn/end` 自行开放重入。

## 有界联合验证方案

此方案先用已有平台接口完成 T-16 技术验证设计与接缝采集；T-17 实现后，以相同场景把 reference journal 换成上表 Runtime 字段，不能将前者当作产品验收。

1. **正常取消/延迟终态。** 第一 OS 进程在真实 API Owner transport barrier 中调用真实 `child.cancel()`，将 signal 到达、返回值和 JSONL terminal 分开记录。保持 barrier 到 `observationDeadlineAt` 前后：前者必须保留磁盘 lease 并使第二进程同 Owner `runExternalOwner` 拒绝；后者只有读取到稳定 `turn/end` 且 lease 已失效/隔离时才能进入 `recoverOwner`。每个 barrier不超过 8 秒、每个进程外层不超过 45 秒。
2. **取消调用异常。** 把控制层对 `cancel()` 的调用封装在一个小的 test-only adapter，并用会抛错的受控 caller 验证 adapter 写入 `technical_pause`，不声称 Harness 原生 `ReactLoopAgent.cancel` 会抛错。第二进程仍必须看到旧 lease 或明确隔离，不能发起同 Owner 新 attempt。这验证产品控制层需要处理的错误分支，而不是伪造 Harness 行为。
3. **真重启对账。** 第一 OS 进程在 cancel signal 已到达、terminal 未观察时停止；第二 OS 进程以 `reopenRecoverySessionFixture()` 打开同一根目录，读 `readRaw/readFrom/listSnapshots` 和 workflow record，并调用 `reconcileRecoverySession()`。稳定终态只构成观察；缺 lease/receipt、torn/变动快照或绑定不符必须得到既有 `technical_pause`，不重送 prompt、不开放同 Owner。再以真实磁盘 lease 检查是否可安全取得新 token。
4. **旧提交与新 attempt。** 在第二进程确认安全后，沿 Round 05 的真实 `recoverOwner()` 创建 attempt 2，并在其有限 model gate 内执行旧 child 的实际注册 `owner_submit`。断言 attempt 2 的 source/session/token binding 与 record 不变，再 release 让 attempt 2 完成。该步骤已有同进程正例；重启版本补足跨进程来源。
5. **deadline/失败出口。** 用持久绝对 `deadlineAt` 驱动步骤 1，而非 `onTimeout.afterMs` 或 heartbeat。若 `observationDeadlineAt` 到期仍无法形成有效 `terminalObservation + settlement`，断言 Runtime 保持该 Owner 不可重入、生成有限 `technical_pause`，并允许独立 Owner 继续。重启后以相同 deadline 再算剩余时间，绝不重置窗口。

该计划的前四步利用当前真实 Agent、JSONL、lease、reopen、recovery admission 和 `technical_pause` 接缝；第五步及停止记录的持久产品语义是 T-17 实现责任。T-16 可以据此完成平台正/负证据和可实施协议，而不等待先把 T-17 写入生产。

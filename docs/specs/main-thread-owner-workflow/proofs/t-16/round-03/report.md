# T-16 技术验证第 3 轮：跨进程 Owner lease 与终止后新 token

日期：2026-09-11。范围：在已批准 R4-V03-1 §12.4 下，验证第一 OS 进程中的 API Owner 已收到取消但尚未产生 `turn/end` 时，第二 OS 进程中的独立 Runtime 被真实文件 Owner lease 拒绝；第一进程中的 API Owner 原执行终止后，由同一第二进程获得不同 fencing token。该切片只验证取消/lease/会话终止接缝，不实现停止协议，也不将 T-16、AC-21、AC-24、AC-31 或 T-17 标为完成。

## 冻结候选、进程和时间边界

[freeze.json](freeze.json) 固定正式候选。`runtime.mjs` 与直接保存的 [runtime-source.mjs](runtime-source.mjs) 都是 SHA-256 `f7e73677b4a2f9d1888e225392c28cbac1b485d21060afd3a5b2d2a6e8a89e88`；副本在正式前从实际源码直接复制，非事后重构。Harness `HEAD` 是 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。

正式 wrapper 从 09:47:44.079 UTC 到 09:47:47.450 UTC，约 3.37 秒；探针自身的 [formal-probe.log](formal-probe.log) `elapsedMs` 约 1.75 秒，后者从 fixture 创建后开始计时。wrapper 外层限 45 秒，主探针限 25 秒，第二 Runtime 子进程限 12 秒，模型传输 barrier 限 8 秒。正式结果为 1 个场景、exit 0、0 timeout、0 probe error、0 源码漂移，见 [formal-results.json](formal-results.json)。

主进程使用真实 Harness fixture 的临时 Git 根、Owner worktree、`LocalSandboxProvider`、`SandboxPolicyService`、`JsonlSessionPersistence`、实际 API Owner Agent 和生产 `runExternalOwner()`。第二进程由 [second-runtime-child.mjs](second-runtime-child.mjs) 启动新的 Node PID、新 Harness Context 和新 Owner Workflow Runtime，再读取同一持久 workflow/lease 目录。模型传输唯一替身是一个有 8 秒自我超时的本地 barrier：它等待真实 Agent abort signal，直到主测试释放才抛出 `aborted`；没有替换 `child.cancel()`、Runtime lease、JSONL、session event 或 Runtime 入口，也不使用永不完成 Promise。

## 已确认的观察

| 观察点 | 原始事实 | 支持的有限结论 |
| --- | --- | --- |
| 取消尚未终止 | 主进程 PID `20750` 的 API Owner `child.cancel()` 返回 `undefined`；barrier 观察到实际 abort signal，`turn/end` 仍为空 | 取消请求已到达真实 Agent，但尚无会话终止事件。 |
| 跨 OS 进程同 Owner 拒绝 | 第二进程 PID `22401` 的 Runtime 调用 `runExternalOwner(T1, api)` rejected，错误明确记录存活 lease PID `20750`；该前后 API `turn/end` 均为空 | 另一个 OS 进程读取同一持久现场时，活跃 API Owner 的真实磁盘 lease 拒绝同 Owner 重入。 |
| 终止和持久记录 | 只在子进程取得拒绝结果后释放 barrier；API 原执行 Promise rejected，内存与 JSONL 都有 `turn/end: aborted` seq 15，`ownerRuns['T1:api']` 为 `failed`、attempt 为 1 | 该受控路径有可持久读取的真实终止事件，且取消执行不被写为 completed。 |
| 同一第二进程的新 token | 在主进程已等待 API 原 Promise 结算后，第二进程保持原 Runtime 并执行 `withOwnerLease`，token 从 `8bcd8da1…` 改为 `594e1f7e…` | 此场景中，终止后的同一第二进程能以新 token 获得和释放 API Owner lease。 |

## 测量边界和否定发现

本轮在取消 signal 已观察、第二进程 lease 拒绝返回、以及 barrier release 前后检查 API terminal event。Barrier 在主测试 release 前不会正常返回，除非 8 秒故障上限先触发；正式运行未触发该上限。即使如此，这些是有界场景中的离散观察和受控传输保证，不能推广为生产中任意持续时间的连续 lease 持有或精确释放顺序证明。

API 原 Promise 的 rejection 仍是“没有调用 owner_submit”而不是 `aborted`，而 JSONL 记录的事实是 `turn/end: aborted`。因此 Runtime 错误文本依旧不能独立成为 §12.4 的终止确认、资源释放确认或重入许可；实施已批准停止协议时仍需分别持久记录取消请求、实际终止、Owner 结算和 lease/fencing token。

失败 Owner record 仍保留旧 `leaseToken`，第二进程取得的新 token 只存在于本次短 lease 操作的返回值。本轮没有把旧 token 用于 `saveState` 或其它写入尝试，因而**没有证明旧 token 写入被拒绝或旧结果 fencing**；不应从“新 token 可获取”推导该性质。

## 未证明

本轮没有验证控制器重启后针对持久 receipt 的对账、同一 API Owner 的新 attempt、延迟旧 Owner result 对新 attempt 的写入拒绝、跨进程 JSONL 写冲突、公开 RPC cancel 的 accepted/error、固定 deadline 的 `stopping → settled` 状态、观察窗口耗尽后的有限技术故障出口，或真实生产模型/provider。也没有运行独立 Owner 并行场景；那是 Round 02 的独立有限证据，不能与本轮混成单一端到端证明。

## 下一项 T-16 证据

在已批准 §12.4 范围内，下一优先项是进程级重启/新 attempt fencing：旧进程取消后持久化 `stopping` 与终止/settlement receipt，新进程以新 token 启动后向旧 attempt 注入延迟 structured result，验证旧 token 无法将状态写成 `completed` 或覆盖新 token；无法在有限观察窗口确认终止时，应留 Owner 不可重入并以技术故障返回。

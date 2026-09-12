# T-16 技术验证第 1 轮：真实 Owner 取消信号到结算的有限接缝

日期：2026-09-11。范围：只验证 R4-V03-1 §12.4 的一个最小真实 Harness Owner 取消路径，关联 AC-21、AC-24、AC-31。结论：**该冻结候选上，`child.cancel()` 是即时信号，不是终止或结算；取消返回后的一个采样点 lease 仍有效，原 Owner 执行 Promise 结算后的一个采样点旧 lease 已不再持有，并有真实 `turn/end: aborted`。** 这是一条有限正向接缝证据和一项 Runtime 诊断发现，不能将 T-16、AC-21、AC-24 或 AC-31 标记通过，也不解除 T-17。

## 冻结候选和运行方式

[freeze.json](freeze.json) 固定了正式运行开始时的关键源码 SHA-256、Harness `HEAD` `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`、夹具和探针。正式运行只消费未提交工作区源码；不把仓库 HEAD 误称为被测候选。`owner-workflow-plugin/src/runtime.mjs` 的正式 hash 是 `bacf87b3bd232fc299c6abd0a918f033fb9dc5b521a6b40cc5e266b5e10b2b4a`。

正式运行后一次只读检查观察到 `runtime.mjs` 已变为 `cfdf4af0bfa7f0a3132debd92fad5c1c54df7ef420ee47d0c01d0cd8e5218b6b`；这不是正式运行中的漂移，[formal-results.json](formal-results.json) 的 `drift` 仍为空，但本报告的 Runtime 结论严格只适用于 `bacf87…` 候选。后续 Runtime 改动需要重新冻结和补验，不能混用两个 hash。

[archived-runtime.mjs](archived-runtime.mjs) 是从上述当前 `cfdf4af…` 文件仅在 `recoverWorkflow` 中逆转 R47 的三处 `queuedTaskIds` 编辑后重构的冻结源码归档：删除初始化和 `push` 两行，并把 recovery log 的计数/`taskIds` 恢复为 `recoverable.length` / `recoverable.map(task => task.id)`。其 SHA-256 已重新计算为 `bacf87b3bd232fc299c6abd0a918f033fb9dc5b521a6b40cc5e266b5e10b2b4a`，与 [freeze.json](freeze.json) 完全一致。该归档仅供复核，未修改 `owner-workflow-plugin/src/runtime.mjs`，也没有重跑正式证据。

探针 [probe.mjs](probe.mjs) 复用现有 `recovery-session-fixture.mjs`，创建临时 Git 根、真实 Owner worktree、`LocalSandboxProvider`、`SandboxPolicyService` 和 `JsonlSessionPersistence`。模型传输唯一替身是 Harness 源码内 `MockAdapter` 的 `hang-slow` 条目：它先产生局部输出，收到真实 Agent abort signal 后在有限 50ms 延迟中结束。没有访问生产网络或生产 provider。它不是“永不完成 Promise”；终止判据是同一 Owner 会话实际写入并从 JSONL 读回的 `turn/end: aborted`，以及原 `runExternalOwner()` Promise 实际结算。

[run-proof.py](run-proof.py) 在开始时冻结 hash，以 45 秒的进程外限运行探针，并把原始 stdout 留在 [formal-probe.log](formal-probe.log)。正式结果是 1 个场景完整采集、进程退出码 0、0 超时、0 probe error、0 源码漂移；从 wrapper 启动到退出约 1.39 秒，探针的 `elapsedMs` 约 440ms，后者从 fixture 创建之后开始计时。没有执行共享正式测试或修改生产源码。

## 已确认的观察

| 观察点 | 原始事实 | 支持的有限结论 |
| --- | --- | --- |
| 取消调用返回 | live Owner 的 `child.cancel({ kind: 'user' })` 返回 `undefined`；调用前和返回后同步读取 `turn/end` 均为空 | 调用只请求取消，不能视为真实会话停止或资源结算。 |
| 取消后 Owner 隔离采样 | 取消返回后的一次采样仍能以原 token `assertOwnerLease`；同 Owner 的实际 `withOwnerLease` 抛出“另一个临界区中运行” | 已确认取消返回本身不立即释放这个同 Runtime Owner lease，且该采样点拒绝同 Owner 重入。 |
| 真实停止和原执行结束 | 原 `runExternalOwner()` Promise 以 rejected 结束；内存事件和从 JSONL 重新读取的持久事件一致为 `turn/end` seq 15、reason `aborted` | 对该 Harness 接缝，真正的停止观察发生在取消返回之后；持久会话事件可作为停止证据。 |
| 非成功结算后的释放采样 | `ownerRuns['T1:api'].status` 从 `running` 变为 `failed`，没有 `completed`；等待原 Promise 结算后，原 lease 断言失败，随后同 Owner 可通过新的 `withOwnerLease` 获取和释放 lease | 已取消的执行没有被当作成功 Owner 结果；已确认结算后的采样点可重新获取 lease。 |
| 已结束重复取消 | 停止后第二次 `child.cancel()` 仍返回 `undefined`；探针断言 session event 数不变、模型请求数仍为 1 | 已结束的本地 Agent 上重复取消没有产生第二个 terminal event 或再次启动模型调用。 |

## 可靠的否定发现

原执行 Promise 的 rejection 文本是“Owner api 没有调用 owner_submit；普通文本不能代替提交关卡”，而不是 `aborted`。同一运行中 JSONL 已有实际 `turn/end: aborted`。因此当前 `runExternalOwner()` 的外部错误分类不能单独作为终止确认，也不能由错误文本推导是否安全释放或可以重启。已批准的 §12.4 停止合同在 T-17 实现时需要将“取消已请求”“会话终止已观察”“Owner run 已持久结算”“租约已释放/已 fencing”区分为独立事实，而不能复用这个提交关卡错误。

这与 T-09 的反例一致：旧路径会在取消 Promise 未完成时返回并保留 lease。本轮补上的是可终止的真实 Harness 会话和可持久读取的终止事件，没有把 T-09 的未完成 Promise 当停止证据。

本轮只在取消返回后和原 Promise 结算后各取一个 lease 观察点；它没有连续观测整个间隙，也没有证明 `releaseOwnerLease` 不会在外层 `runExternalOwner()` Promise settle 之前发生。不得将两个端点采样推广为“整个取消未结算期间绝不早释”的证明。

## 尚未证明或未运行

本轮没有验证控制器重启后取消对账、跨进程/跨 Runtime lease fencing、客户端 RPC 的 accepted/error 返回、取消调用本身抛错或网络传输延迟、不同 Owner 在该取消期间真正启动、旧结果在新 attempt 后的拒绝、固定 deadline 与 `stopping → settled` 持久状态、有限观察窗口到技术故障出口，或真实生产模型/provider。没有测试“已结束”会话经公开 API 再次 cancel 的返回语义；这里只确认本地 Owner Agent 的重复 `cancel()` 无副作用。

也没有实现预算账本、取消协议或 Runtime 修改。若正式阻塞报告要求覆盖这些条目，当前证据只足以作为首个接缝，不足以声称 T-16 完成。

## 建议的下一项证据

按已批准的 §12.4 停止合同继续收集 T-16 剩余证据：用同一真实 Harness fixture 增加一个可重启的进程级场景。第一控制器持有 lease 并取消，第二控制器只能读取持久 terminal/settlement receipt 后取得新 token；随后向旧 attempt 注入延迟结果，验证它不能写入 completed 或覆盖新 token。该场景还应并行启动独立 Owner，证明隔离不阻塞无关资源。T-16 的正向终止/隔离接口和失败出口固定后，才解除 T-17。

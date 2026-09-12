# T-16 技术验证第 2 轮：跨 Runtime 取消隔离与独立 Owner

日期：2026-09-11。范围：在已批准的 R4-V03-1 §12.4 下，为 T-16 增加一个有界真实 Harness 场景：API Owner 已收到真实取消信号、仍没有 `turn/end` 时，另一个 Runtime 以真实文件 lease 尝试同 Owner 重入；独立 Worker Owner 同时启动并完成；释放受控传输 barrier 后，API Owner 产生持久终止事件且第二个 Runtime 获得新 fencing token。这是 T-16 的第二个独立证据切片，不代表 T-16、AC-21、AC-24、AC-31 或 T-17 已完成。

## 冻结候选、环境和计时

[freeze.json](freeze.json) 记录正式运行开始时的完整候选。`runtime.mjs` 的 SHA-256 是 `cfdf4af0bfa7f0a3132debd92fad5c1c54df7ef420ee47d0c01d0cd8e5218b6b`，与本轮直接保存的 [runtime-source.mjs](runtime-source.mjs) 完全一致；该副本在运行前直接从实际源码复制，非事后重构。Harness `HEAD` 为 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。正式运行的 wrapper 从 09:33:53.087 UTC 到 09:33:56.935 UTC，约 3.85 秒；[formal-probe.log](formal-probe.log) 内探针 `elapsedMs` 约 2.47 秒，后者从 fixture 创建后开始计时。每次进程外限为 45 秒，探针自身总限 20 秒，传输 barrier 自带 8 秒限。

正式运行后的只读检查观察到当前 `runtime.mjs` 已为 `e5d1d98d6f5c5ce22c4b5a32901e7cab709a51fa0dafeceb839bb3677034b7ca`。这不是正式期间的漂移，[formal-results.json](formal-results.json) 的 `drift` 仍为空；本报告只适用于保存的 `cfdf4af…` 候选，后续 Runtime 版本必须重新冻结和补验。

探针 [probe.mjs](probe.mjs) 复用现有真实 Harness fixture：临时 Git 根和 Owner worktree、`LocalSandboxProvider`、`SandboxPolicyService`、`JsonlSessionPersistence`、生产 `runExternalOwner()`、实际 Owner Agent 与 `owner_submit` 工具均未替换。它启动第二个 Harness Context 和第二个 Owner Workflow Runtime，但在同一 OS 进程内；因此本轮证明的是**跨 Runtime** 文件 lease 隔离，不声称跨 OS 进程结果。

模型传输只使用一个本地受控替身。API Owner 的第一个请求先生成局部流，再等待真实 Agent abort signal；收到该 signal 后，只有测试显式释放 barrier 或 8 秒预算耗尽才结束。Worker Owner 使用 Harness 已有 `MockAdapter` 流经真实 `owner_submit`、后续文本、memory curator 和 review。该 barrier 不替换 `child.cancel()`、Runtime lease、JSONL、Owner Runtime 入口或终止事件；它不是永不完成 Promise。

[formal-results.json](formal-results.json) 显示 1 个场景完整采集、exit 0、0 timeout、0 probe error、0 源码漂移。未运行共享正式测试，未修改生产源码或共享 fixture。

## 已确认的观察

| 观察点 | 原始事实 | 支持的有限结论 |
| --- | --- | --- |
| 取消但未终止 | `child.cancel()` 返回 `undefined`，barrier 观察到真实 abort signal；在跨 Runtime 尝试前 `turn/end` 为空 | 取消信号已送达，但尚无实际终止事件。 |
| 跨 Runtime 同 Owner 拒绝 | 第二个 Runtime 调用真实 `runExternalOwner(T1, api)` 返回 rejected，错误为 lease 被存活 Harness PID 占用；该检查前后 API `turn/end` 均为空 | 活跃 API Owner 的磁盘 lease 拒绝另一个 Runtime 同 Owner 重入。 |
| 独立 Owner 并行 | Barrier 仍持有时，Worker Owner 的第二次模型请求已经开始；Worker 实际完成，`ownerRuns['T2:worker']` 和 task 均为 `completed`，JSONL 有 `turn/end: completed` seq 47 | API Owner 的未终止取消不阻止无关 Worker Owner 实际启动和完成。 |
| 真实终止后的 API 状态 | 仅在 Worker 完成后释放 barrier；API 原执行 Promise rejected，内存和 JSONL 都有 `turn/end: aborted` seq 15，`ownerRuns['T1:api']` 为 `failed` | 受控取消路径有可持久读取的 API 终止事件，且它不会被记录为 completed。 |
| 新 fencing token | API 终止和原执行 Promise 结算后，第二个 Runtime 的 `withOwnerLease` 成功，token 从 `9b20dfe3…` 改为 `17774d90…` | 该场景中，终止后的新 Runtime 能取得不同 token。 |

## 测量边界和否定发现

测试在三处离散检查 API 没有 `turn/end`：abort signal 已观察后、跨 Runtime 同 Owner 拒绝后、Worker 完成后且 release 前。Barrier 代码在 release 前不会自行返回，除非其 8 秒故障限触发；正式运行中没有触发该故障限。尽管如此，本轮不把这些检查推广为任意生产时间尺度上的连续 lease 持有证明，也没有测量 `releaseOwnerLease` 相对于外层 `runExternalOwner()` Promise settle 的精确先后顺序。

API 原执行 Promise 仍以“没有调用 owner_submit”而非 `aborted` 文本 rejected，同时 JSONL 已明确记录 `aborted`。这再次确认：Runtime rejection 文本不能独立充当 §12.4 的终止确认、可释放资源结论或新 attempt 许可；已批准的停止协议实施仍须持久区分取消请求、会话终止观察、Owner 结算和 lease token/fencing。

## 未证明

本轮没有启动第二个 OS 进程，没有验证控制器重启后的持久对账、跨进程 lock 争用、旧 attempt 延迟结果 fencing、新 attempt 的 Owner 结果拒绝、公开 RPC cancel 的 accepted/error、取消传输错误、固定 deadline 到 `stopping → settled` 的持久记录，或无法终止时的有限技术故障出口。Worker 的 completion 是真实 `owner_submit` 和 Runtime `completed` 结算，但本轮没有单独提取或评价 fixed verification 的每一步输出。

## 下一项 T-16 证据

继续已批准 §12.4 的剩余验证，优先让第二个 OS 进程或重启后的控制器读取同一持久 workflow 与 JSONL：第一进程取消并留下未终止 Owner，第二进程必须被 lease 拒绝；确认终止/settlement receipt 后取得新 token；随后向旧 attempt 送入延迟 structured result，证明它无法写成 `completed` 或覆盖新 token。该场景还应固定在观察窗口耗尽时的技术故障出口，而不是等待无限期完成。

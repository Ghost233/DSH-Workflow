# T-16 第四证据切片：旧 Owner lease 与旧结构化提交拒绝

日期：2026-09-11。范围：在 R4-V03-1 §12.4 已批准范围内，使用真实 Harness API Owner 验证取消后的旧 lease 不能再授权、实际 `owner_submit` 对旧子会话的结构化结果拒绝写入，并记录当前入口不能从该失败状态启动同 Owner 新 attempt 的反例。本轮不实现 `stopping`、receipt 或 T-17；T-16 仍开发中，AC-21、AC-24、AC-31 和 T-17 均未由此标为完成。

## 冻结候选与执行边界

[freeze.json](freeze.json) 固定了正式候选。正式时的 Runtime SHA-256 为 `c742912d023f46874729c7dd2bdb3144029bc520c9bb944a6beb79246a92d104`，其直接副本为 [runtime-source.mjs](runtime-source.mjs)，哈希完全一致。实际调用的 [owner-submission.mjs](owner-submission-source.mjs) 和 [owner_submit 定义](owner-submit-definition-source.js) 也分别归档，哈希为 `784122aab6dde4e9a44170ecdc72b37fbdaaf6d9ffeec8d1dced670b390252cb` 与 `849954407e67eca3eff3d7f5bc013becc85f17c9e078a7b6699fc221ce6d1c14`。这些是正式前直接复制的源码，而非事后重构。Harness `HEAD` 为 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。

正式 wrapper 于 10:00:16.089 至 10:00:18.170 UTC 运行，整次 Node 进程约 2.08 秒；探针输出的 `probeElapsedMs` 为约 505 ms，从 fixture 已创建且 transport 已配置后开始。二者不可混用。wrapper 外层限 45 秒；每项取消、终止、lease 或重试观察与 transport barrier 都有 8 秒上限。正式采集 1 个场景、exit 0、0 timeout、0 probe error、0 候选/探针漂移，见 [formal-results.json](formal-results.json) 和原始 [formal-probe.log](formal-probe.log)。

探针通过真实 `createRecoverySessionFixture` 启动 `LocalSandboxProvider`、`SandboxPolicyService`、临时 Git 根和 Owner worktree、`JsonlSessionPersistence`、实际 API Owner Agent 及生产 `runExternalOwner()`。唯一替身是 MockAdapter 的有限本地模型传输 barrier：它等待真实 Agent abort signal，并在主测试 release 前保持；其本身有 8 秒故障上限。`child.cancel()`、会话事件/JSONL、磁盘 lease、`runExternalOwner()`、`withOwnerLease()` 及 `ownerSubmitDefinition(...).execute()` 均未替换，也没有未完成的无限 Promise 或生产网络调用。

## 已确认的事实

| 观察点 | 原始结果 | 允许的有限结论 |
| --- | --- | --- |
| 取消尚未终止 | 实际 `child.cancel({kind:'user'})` 返回 `undefined`；barrier 已观察 abort signal，`turn/end` 仍为空；随后一次 `assertOwnerLease(oldLease)` 成功并返回旧 token | 这一次采样中，取消已到达但会话尚未结束，旧 lease 仍可由正在运行的 Runtime 验证。它不证明两个采样点之间持续持有，也不证明精确释放顺序。 |
| 实际终止 | release barrier 后，原 `runExternalOwner()` Promise rejected；内存和 JSONL 都记录 `turn/end: aborted`（seq 15） | 此受控路径有真实、可持久读取的会话终止事件。Promise 的错误文本仍是“没有调用 owner_submit”，因此错误文本本身不是终止确认。 |
| 旧 lease/token 不再可用 | 终止结算后，持有的旧 lease 对象调用实际 `assertOwnerLease()` 返回 `Lease 已不再由当前运行时持有`；持久 `ownerRuns['T1:api']` 为 `failed`、attempt `1`，仍保留旧 token | 已结束的旧 lease 对象不能在该 Runtime 再通过授权检查。旧 token 仍作为失败 attempt 的审计字段存在，不能仅据此推断它已成为跨写入 token fencing。 |
| 当前重试入口的反例 | 用同一真实 `runExternalOwner(T1, api)` 再次启动返回“工作流 … 当前状态不能启动 Owner：failed”；Owner record 的深度比较未改变 | 在此真实取消后的失败状态下，公开 Owner 启动入口没有建立一个新 attempt。探针没有伪造状态迁移来制造第二 attempt。 |
| 新 lease 与旧提交 | 之后在真实 `withOwnerLease()` 临界区取得与旧值不同的 fresh token；持有 fresh lease 时旧 lease 仍被拒绝。以实际旧 child identity 调用注册的 `owner_submit`，携带 `DSH_OWNER_RESULT_V1` 结构化 report，返回“只能由当前正在运行的 Owner 子代理调用”；Owner record 未改变 | 当前 `owner_submit` 的 active-session 门禁拒绝已结束旧 child 的结构化提交，且本次拒绝没有改写失败 Owner record。该 reject 是会话身份门禁，不是 `owner_submit` 对 token 的比较。 |

## 严格边界与缺口

`owner_submit` 在检查旧 child 已不在 `activeOwners` 后立即拒绝；它尚未解析/持久化该 report，也没有接受 lease token 作为参数。因此本轮**证明旧已结束 child 的实际结构化提交入口会拒绝并保持 record 不变**，但**没有证明**旧 token 针对一个已启动的新 Owner attempt 的结果写入 fencing。

探针在失败 Owner record 之后只能获得一个短期真实 `withOwnerLease` token；公开 `runExternalOwner` 拒绝启动新的 Owner attempt。该短期 lease 不是第二次 Owner 执行，也没有把 fresh token 写入新的 `ownerRuns` attempt。故不能从“fresh token 不同”推断新/旧 attempt 的状态覆盖已被验证。

本轮也未验证跨 OS 进程结果写入、控制器重启后的持久对账、public cancel RPC 的 accepted/error 语义、重复取消、deadline/stopping/termination receipt、连续观察中的 lease 持有、或真实生产 provider。Round 03 的跨进程 lease 证据保持独立，不与本轮混称为端到端旧结果 fencing。

## 下一项最小证据前置

本切片只调用了 `runExternalOwner()` 的普通启动路径，未验证项目已有的 `recoverOwner()`/Supervisor 恢复路径。下一项应从真实取消后的失败状态经该恢复路径启动新 attempt，持久绑定新 attempt、session identity 与 fresh lease token；随后在正常 Owner tool dispatch 中延迟旧 attempt 的 `owner_submit`，在新 attempt 实际启动后观察它被拒绝且不能改写新 record。不得通过手工编辑 workflow 状态、伪造 `stopping`/receipt 或直接写 JSONL 来补证。

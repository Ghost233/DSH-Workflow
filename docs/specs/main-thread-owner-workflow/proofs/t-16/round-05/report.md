# T-16 第五证据切片：真实 `recoverOwner` 新 attempt 与旧提交隔离

日期：2026-09-11。范围：在 R4-V03-1 §12.4 已批准范围内，从真实 API Owner 取消后的失败状态通过现有 `recoverOwner()` 启动第二次 attempt；该 attempt 运行期间，以已结束旧 child identity 调用注册的真实 `owner_submit`，确认拒绝且不改写第二次 attempt，随后让第二次 attempt 经真实 `owner_submit`、验证、Git 结算和 recovery receipt 完成。此切片不实现 `stopping`、deadline 或 T-17；T-16 仍开发中。

## 冻结候选与时间边界

[freeze.json](freeze.json) 固定正式候选。Runtime 的 SHA-256 为 `4fd3f136576436f127822e002c51b3777897b08b7c764ef6aeabc0acbc232791`，直接副本为 [runtime-source.mjs](runtime-source.mjs)。恢复接缝涉及的 [recovery-admission.mjs](recovery-admission-source.mjs)、[recovery-session.mjs](recovery-session-source.mjs)、[owner-submission.mjs](owner-submission-source.mjs) 和 [owner_submit 定义](owner-submit-definition-source.js) 均在正式前直接归档并与冻结哈希匹配。Harness `HEAD` 为 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。

正式 wrapper 从 10:09:52.865 UTC 到 10:09:58.069 UTC，整次 Node 进程约 5.20 秒；探针的 `probeElapsedMs` 约 3.70 秒，从 fixture 创建且 transport 已配置后开始。两者不可混用。wrapper 限 45 秒；初始取消 barrier 和恢复模型 gate 分别限 8 秒；release 后恢复 Owner 的完整验证、提交和结算限 20 秒。正式采集 1 个场景，exit 0、0 timeout、0 probe error、0 候选/探针漂移，见 [formal-results.json](formal-results.json) 与原始 [formal-probe.log](formal-probe.log)。

夹具使用真实 `LocalSandboxProvider`、`SandboxPolicyService`、临时 Git 根、Owner/Workflow worktree、`JsonlSessionPersistence`、实际 Agent、生产 `runExternalOwner()`、`recoverOwner()`、`reconcileRecoverySession()` 和注册的 `owner_submit`。MockAdapter 只提供有限本地模型传输：初始 Owner 等待真实 abort signal；恢复 Owner 在 child/session/lease 已创建后等待 release，再消费有限的 completed Owner tool/curator/reviewer 响应。没有替换取消、lease、JSONL、Owner 启动、恢复入口、提交关卡或固定验证，也没有无限 Promise 或生产网络。

## 已确认的事实

| 阶段 | 原始结果 | 有限结论 |
| --- | --- | --- |
| 初次正常 attempt | 初始化仅清空夹具预置 `ownerRuns`，保留有效 `recoveryAdmissionConfig`；初始 attempt 的 cancel 返回 `undefined`，内存和 JSONL 都记录 `turn/end: aborted`（seq 15），Owner record 为 `failed`、attempt `1`、旧 token；此时还没有 `recoveryAdmission` | 初次执行未消耗恢复领取；取消后的失败记录可成为现有恢复入口的来源。原 Promise 的错误仍是“没有调用 owner_submit”，不是终止事实本身。 |
| 真实恢复新 attempt | 调用实际 `recoverOwner()` 后，record 变为 `running`、attempt `2`、新 session ID 与新 lease token；`recoverySession.ownerRunBinding` 的 attempt/token 与该 record 相同，且 `executionIdentity.sessionId` 与新 child 相同 | 当前 `recoverOwner`/admission/reconcile 路径确实从此失败来源创建并持久绑定一个新的 Owner attempt、会话身份和 fencing token。 |
| 延迟旧结构化提交 | 新 attempt 的模型 gate 尚未 release 时，以实际旧 child identity 执行注册的 `ownerSubmitDefinition(...).execute()`，返回“owner_submit 只能由当前正在运行的 Owner 子代理调用”；新 record 做深度比较保持不变，包括 source ID、attempt、session ID 与 token | 已结束旧 child 的真实结构化提交入口不能改写正在运行的新 attempt。拒绝来自 active-session 身份门禁。 |
| 新 attempt 真实结算 | release 后 `recoverOwner()` 返回 `settled_succeeded`；record 为 `completed`、仍是 attempt `2` 与 fresh token/session，`recoverySession.phase` 为 `settled_succeeded`；新 session JSONL 有恰好一次实际 `owner_submit` tool call | 恢复路径不仅建立新 attempt，也能在旧提交被拒绝后完成真实 Owner 提交和统一结算。 |

## 边界

本轮正向验证的是同一 Harness 进程中、经 `recoverOwner()` 启动的新 attempt。旧提交的拒绝发生在 `owner_submit` 的 active-session 检查；该工具不接受 lease token 参数。因此它证明了实际旧 child 不能覆盖新 record，但没有把一次“token 不匹配”的持久化写错误单独暴露为公开结果，也没有验证旧进程跨 OS 进程写入、控制器重启后对账或任意延迟 provider 回包。

恢复 session 中已有 source、root problem、request/attempt、session/prompt 和 owner run attempt/token 绑定；这些是本轮可复用的平台事实，不应误称为 T-17 的 `stopping` 协议。固定 deadline、持久取消请求、持续观察、真实终止 receipt 与观察耗尽后的技术失败出口仍未验证。详见 [remaining-contract.md](remaining-contract.md)。

# 恢复会话对账 V1

实现：[recovery-session.mjs](../../../../owner-workflow-plugin/src/recovery-session.mjs)。这是 T-22 的显式局部入口；不接入 runner、control 或 legacy 路由。调用方只能消费已持久化的 T-20 reservation，不能创建新的 reservation、重扣额度、传入 lease、session、attempt 或授权布尔值。

```js
await runtime.reconcileRecoverySession(agent, workflowId, {
  contract: 'DSH_RECOVERY_SESSION_REQUEST_V1',
  taskId: 'plan-task-id',
  ownerId: 'plan-owner-id',
  requestId: 't20-persisted-request-id',
  prompt: { id: 't20-reserved-prompt-id', content: 'frozen recovery instruction' },
})
```

`prompt.content` 是冻结的恢复上下文，不是模型的 Owner prompt。Runtime 在已有 `runOwnerEntry` 完成 `createOwnerEntry`、Registry、依赖、worktree/baseCommit、memory 和 worklog 准备后，生成完整 `ownerTaskPrompt`，附加这段持久 instruction，并在 provider `create` 前锁内持久化最终文本。调用方不能替换 Owner 角色提示、沙箱、工具或 `owner_submit` 提交关卡。

## 首次启动

入口先只读导入完整 T-20 ledger，核对 request/task/Owner/plan/prompt ID 与公开 `SessionPersistence.open/stat` 能力后，进入同一个 `runExternalOwner → createOwnerEntry → runOwnerEntry` 链路。`runExternalOwner` 是唯一领取 Owner lease 的位置，并在其锁内再次导入 T-20、匹配原 Owner failure source、运行 `validateOwnerStartState`，再写新的 Owner record。预检不授予权限；全部变异都在第二次核验之后。

新 record 的 attempt 递增，并以实际 lease token 持久化：

```js
recoverySession: {
  contract: 'DSH_RECOVERY_SESSION_STATE_V1',
  sourceId, rootProblemId, requestId, attemptId, planDigest,
  executionIdentity: { sessionId, promptId },
  instruction: { id: promptId, content: 'caller recovery instruction' },
  ownerRunBinding: { attempt, leaseToken },
  phase: 'preparing'
}
```

随后状态顺序为：`preparing`（无外部 session）→ `creating`（最终 Owner prompt 已锁内冻结）→ `created`（真实 `agents.create({sessionId})` 后 `persistOwnerSession` 成功）→ `submitted`（`followup({id: promptId})` 后 `sessions.flush` 成功）。Owner Team 执行适配仍使用正式 preset 组合、Owner sandbox、`activeOwners` 注册和 `requireOwnerSubmission:true`。绑定失败时释放已激活成员；保留原派发身份，不能因此重新投递。

只有当前 Workflow 已由正式流程处于可启动状态且所有既有开始门禁通过时才会启动。该入口不会把 failed/stopped task 或 failed Workflow 改回 runnable，也不把测试直接重写状态当作正式 repair/resume。失败的授权、Registry、依赖、worktree 或 plan gate 返回 `paused / technical_pause`，不 create、不 followup、不扣额。

## 实际结算与重放

首次调用中，真实 `OwnerReportedError`（`owner_submit` 的 `report.status === 'failed'`）仍按普通 Owner 生命周期抛出。Runtime 在该真实失败 record 的保存事务中，只有同时满足以下事实才调用 T-13 `startRecoveryAttempt` 和 `settleRecoveryAttempt`：

- recovery phase 已是 `submitted`，即 followup 已获 JSONL flush 确认；
- 当前 record 的 workflow/task/Owner/plan/attempt/session/lease 与 T-20 intent 完全相等，且 lease 未失效、调用未取消；
- 当前 plan digest 及计划内容摘要仍等于 intent；
- T-13 回执精确使用 `executionRef={id:sessionId,version:promptId}` 与 failed `reference={id:promptId,version:sessionId}`。

结算成功会持久化 `phase:'settled_failed'` 和 `DSH_RECOVERY_CONTINUATION_V1`。相同 requestId 且完全相同 instruction 的后续调用不会重送或重结算；它只核验 Owner record、continuation 和 T-13 receipt 后返回：

```js
{ contract: 'DSH_RECOVERY_SESSION_RESULT_V1', outcome: 'settled_failed',
  phase: 'settled_failed', continuation: { contract: 'DSH_RECOVERY_CONTINUATION_V1', ... } }
```

成功 Owner 只在同一 `finishOwner` 事务的真实 `completed` 转换中结算。该转换已经完成固定 `commitSha` 验证、受控 worktree 的集成，并走过 Owner worklog/长期 Memory 流程；`owner_submit`、模型 turn、`committed` 或 `awaiting_finish` 都不能代表成功。Runtime 再次核对当前 Workflow/plan digest、task/Owner、new attempt、实际 lease token、session/prompt 和 `submitted` phase 后，在最终 `saveState` 前调用 T-13：

```js
executionRef = { id: sessionId, version: promptId }
result = { status: 'succeeded', reference: { id: promptId, version: sessionId } }
```

同一持久化记录写入：

```js
recoverySession: {
  phase: 'settled_succeeded',
  successReceipt: {
    executionRef, result,
    commitSha: '实际固定提交 SHA',
    workflowHead: '完成集成与 Memory 后的 head',
  },
}
```

receipt 重放会再次核对 T-13 ledger、Owner record/session/attempt/lease、`record.result.commitSha`、task 的 `fixedCommitSha`、completed/`checkState:'valid'`，以及 record 的 `workflowHead`。它不把随后其他无关 task 推进的 `state.workflowHead` 当成旧 receipt 失效。通过后首次调用和相同 requestId、完全相同 instruction 的后续调用都返回：

```js
{ contract: 'DSH_RECOVERY_SESSION_RESULT_V1', outcome: 'settled_succeeded',
  phase: 'settled_succeeded', successReceipt: { executionRef, result, commitSha, workflowHead } }
```

`pending_check`（也就是 task-specific defer long-term Memory）、无正式 workflow worktree、未确认 followup、blocked/handoff、没有 `owner_submit`，或任何 lease/plan/receipt 漂移都不伪造成功或 failed continuation。普通 Memory 编译降级沿用 `finishOwner` 的既有 completed 语义，不单独阻止 T-13 success。技术暂停保持 T-20 reservation而不退款。若 `finishOwner` 在成功 receipt 已保存后写日志或清理失败，Runtime 保留该 receipt、传播 I/O 错误，不把已完成 Owner 改写为失败。若后续有新的 T-20 request 以已结算失败为 source，它仍必须通过正常 runnable/start gate；本入口不负责把失败 Workflow 恢复为 runnable。

## 已存在 session 的只读边界

`inspectRecoverySession(...)` 是纯事实投影，返回 `{ outcome, phase, revision?, turn?, step?, terminalSeq?, assistantMessageId?, reason? }`。DSH 0.1.5 适配使用公开 `stat(id)`、`open(id, 'read')`、`handle.read()` 与 `handle.close()`，核对会话身份、头信息、连续 seq 和读取前后不变的 revision。物理格式校验、解压和历史格式解码由正式持久化服务负责，插件不复制解码器、不获取写句柄。压缩日志可读取；历史格式是否可读由宿主明确判定。匹配 prompt、turn/end 或 assistant message 本身不是 Owner 业务成功或失败。当前投影也只支持单 turn/step；真实 Owner tool 链的多 step 结果不能据此结算。

已有但未结算的 session 无论逻辑投影为 pending、running 或 observed terminal，Runtime 都只返回顶层 `paused / technical_pause`，把事实放在 `observation`。它不 resume、create、followup 或 settle。`preparing`、没有最终冻结 prompt、坏 raw、未知 persistence 或旧 lease 都同样暂停。重放时 caller instruction 必须逐字等于持久 `instruction`；相同 requestId 不能借由替换 instruction 取得运行中的 promise 或旧 session 权限。

### V3 完整性与错误结果

正式读取只返回已提交且完整的逻辑前缀。截断发生在终态记录内时，读取不能产生终态；完整终态之后多出的未提交尾部不抹去既有终态。两种情况都不修复原文件，也不启动 Agent 来补齐事件。只读读取不会合成 interrupted 终态。

错误原因区分 `artifact_missing`、`unsupported_session_format`、`artifact_corrupt`、`snapshot_changed`、`read_identity_mismatch` 和 `read_failed`；均不授权重投。取消向调用方传播，已打开的读取句柄必须释放。首次创建前通过 `stat` 判定保留身份是否存在，不能因为旧接口缺失或日志尚无 prompt 就创建第二个会话。

版本化日志副本与真实 V3 运行时测试独立于旧候选验收。升级评估记录当前测试范围，不能沿用旧 CA01 的整体通过结论。

## Lease 冲突

入口会在领取 lease 前做只读 Workflow/T-20/persistence 预检，但不会读取外部 session artifact 或改写账本。真正获取 lease 仍只在 `runExternalOwner`；同 Owner 被其他运行占用、lease 初始化竞争或可辨识磁盘领取冲突映射为 `paused / technical_pause / owner_lease_unavailable`。取消、I/O、已持有 lease 失效和其他运行错误继续抛出。冲突路径不释放其他持有者的 lease，也不产生 model request 或预算变化。

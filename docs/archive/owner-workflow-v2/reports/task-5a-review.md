# Task 5a 服务端控制桥只读审查

## Verdict

- **Critical：2**
- **Important：2**
- **Minor：1**
- **结论：不通过。** 当前实现既能把已经进入 `blocked` 的 workflow 错误保存为 `completed`，又缺少从 Supervisor `create` 到现有 Owner 两阶段结算的闭环；需要修复 Critical 与 Important 后复审。

审查范围为 `owner-workflow-plugin/src/runtime.mjs` 与 `owner-workflow-plugin/test/control.test.mjs`，并对照 `owner-workflow-plugin/src/supervisor.mjs`、`owner-workflow-plugin/test/supervisor.test.mjs`、`task-5a-report.md`、V2 设计与实施计划。除本报告外未修改源码、测试或其他项目文件。

## Findings

### Critical 1：runtime actionId 没有绑定 workflow 状态，`supervisor-stop` 可把 blocked workflow 错误完成

`supervisorProjection()` 把 reducer 的 `revision` 绑定到独立的 `state.supervisorRevision`，但没有投影实际 `state.revision` 或 `state.status`（`owner-workflow-plugin/src/runtime.mjs:1062-1074`）。因此，宿主把 workflow 从 `running` 改成 `blocked` 后，只要 plan、task 投影、parallel 和 actionSequence 未变，之前的 actionId 仍是当前有效 actionId。

`supervisor-stop` 在锁内重新计算 receipt，却仍使用上述不完整投影；随后仅根据 task 是否全为 `completed` 无条件覆写 workflow 状态（`owner-workflow-plugin/src/runtime.mjs:2167-2179`）。只读临时探针构造“task 已 completed、workflow 已 blocked”的合法持久快照后，`supervisor-next` 返回 `stop`，`supervisor-stop` 返回并持久化 `completed`：

```text
BLOCKED_STOP {"action":"stop","returnedStatus":"completed","persistedStatus":"completed"}
```

同一根因也允许 blocked 状态接受先前的 create ACK。探针在取得 create receipt 后把 workflow 状态改为 `blocked` 并递增实际 state revision，旧 ACK 仍被接受并进入一次 Owner 启动尝试：

```text
CREATE_ACK_AFTER_BLOCKED {"accepted":true,"status":"blocked","launches":1}
```

这违反“所有 action 与当前状态绑定”及“stop 不能错误完成 blocked workflow”。建议把可执行 workflow 状态和实际持久 revision/epoch 纳入 runtime 的 receipt 身份，并在每个专用端点中显式校验允许状态；`supervisor-stop` 对已 blocked/failed/cancelled 状态必须 fail-closed，不能仅由 task 数组反推并覆盖宿主终态。

### Critical 2：create 适配始终使用 `deferFinish`，Supervisor 协议没有任何路径执行 `owner-finish`

create ACK 保存 reducer 状态后，以 `{ deferFinish: true }` 调用 `runExternalOwner()`（`owner-workflow-plugin/src/runtime.mjs:2149-2157`）。真实 Owner 成功后因此只会保存为 `ownerRuns[*].status = 'awaiting_finish'`（`owner-workflow-plugin/src/runtime.mjs:2495-2518`）；而宿主观察只有 `record.status === 'completed'` 才向 reducer报告 task completed，`awaiting_finish` 始终被投影为 running（`owner-workflow-plugin/src/runtime.mjs:1112-1144`）。新增的五个 Supervisor 端点没有调用 `finishOwner()`，Supervisor runner 协议也不再调用旧 `owner-finish`。

结果是正常执行成功的真实任务会永久停在 `awaiting_finish` / reducer `running`，workflow 无法自然到达 stop。新增控制测试掩盖了该问题：它把 `runExternalOwner` 替换为立即成功的 stub（`owner-workflow-plugin/test/control.test.mjs:283-287`），随后又直接把磁盘 `ownerRuns['T1:api']` 手工改成 `completed`（`owner-workflow-plugin/test/control.test.mjs:327-336`），没有验证生产路径的两阶段结算。

建议由 Supervisor 控制桥在确定的、受锁保护的步骤调用现有 `finishOwner()`，或让此适配走非 defer 的完整结算路径；增加使用真实 `runExternalOwner` 生命周期的端到端测试，禁止手工注入 `completed`。

### Important 1：inspect ACK 信任客户端回传，可脱离有限宿主投影伪造任务完成

`supervisor-inspect` 本身使用 `supervisorWatchObservation()` 返回闭合字段，这是正确的；但后续 `supervisor-ack` 对 inspect 直接采用调用方提交的 `request.observation`（`owner-workflow-plugin/src/runtime.mjs:2124-2129`），既不在同一锁内重算宿主观察，也不证明该值就是对应 `supervisor-inspect` 的返回值。纯 reducer 只能校验 schema，无法验证宿主事实。

只读临时探针在 `ownerRuns['T1:api'].status` 仍为 `running` 时跳过真实 inspect 结果，直接 ACK `status: completed`；请求被接受并把 reducer task 保存为 completed：

```text
FORGED_INSPECT_ACK {"accepted":true,"task":{"taskId":"T1","status":"completed","executorId":"forged","cursor":"forged",...},"hostStatus":"running"}
```

因此 inspect 响应“不泄露内部字段”成立，但 inspect action 的状态绑定不成立。建议 ACK 只接收 actionId，有限观察由 runtime 在 ACK 锁内生成；或者持久化一次性 inspect observation digest，并要求 ACK 精确匹配该 digest。

### Important 2：reducer 状态保存是原子的，但 create 的外部启动不在 ACK 原子边界内且失败被吞掉

ACK 的 reducer 计算与 `saveState()` 位于 `withWorkflowLock()` 内（`owner-workflow-plugin/src/runtime.mjs:2110-2148`），`saveState()` 还使用跨 Runtime 写锁、revision CAS 和临时文件 rename，因此纯状态迁移具备原子性。create 也确实先持久化 reducer 结果，再发起异步 Owner 调用，没有在 reducer 之前启动。

但 ACK 返回所代表的完整 create 效果并不原子：Owner 启动发生在锁外，使用 fire-and-forget，所有 rejection 被 `.catch(() => undefined)` 丢弃（`owner-workflow-plugin/src/runtime.mjs:2149-2157`）。进程在保存后、启动前退出，或启动因 lease、Registry、计划门禁、同 Owner 并发等原因失败时，task 已是 `running`，却可能没有 ownerRuns 记录、错误或可重放 dispatch 记录。Supervisor 之后只会 wait/inspect 一个并不存在的执行。

建议将 create 设计为可恢复 outbox/reservation：在同一状态事务中持久化待启动记录，启动成功后再确认 executor，失败则确定性转成 stopped；恢复时重放未完成 reservation。至少不能吞掉启动错误，并应测试并发重复 ACK、启动异常及“状态已保存后进程退出”的恢复行为。

### Minor 1：旧控制端点的兼容结论缺少 socket 级回归覆盖

新增 action 分支位于现有 `ping`、`status`、`run-owner/owner-sync`、`owner-finish` 等分支之前，但未删除或改写旧分支；本次 control/supervisor 绿测也未观察到现有接口的直接回归。不过新增控制测试只通过 socket 覆盖 `ping`、`status` 和 Supervisor 端点；`owner-sync`/`owner-finish` 的测试是直接调用 runtime 方法（`owner-workflow-plugin/test/control.test.mjs:1287-1358`），没有验证旧控制请求的 action 名、参数校验、响应与错误语义。

建议增加旧 `run-owner`、`owner-sync`、`owner-finish`、`owner-recover`、`merge-stage` 的 socket 回归矩阵，再把“旧端点兼容不降低”作为已验证结论。

## 已确认符合项

- `supervisor-start` 使用 `createTaskState()`，并通过纯 `supervisorNext()` 校验 V2 状态与 parallel；重复 start 会拒绝。
- 对 runtime 投影内的 plan、task 完整投影、parallel、actionSequence 和 supervisorRevision，`supervisor.mjs` 的 actionId 绑定与 ACK schema 均为 fail-closed；旧 actionSequence ACK 会拒绝。
- ACK 的 reducer 计算和状态文件保存位于同一 workflow 临界区；状态文件使用 revision CAS 与原子 rename。
- create 的异步 Owner 调用发生在 reducer 状态成功持久化之后，没有先于 reducer 启动。
- `supervisor-inspect` 的响应只由 `taskId`、有限 status、`executorId`、`cursor` 以及 stopped 所需的固定 `reason/action` 组成；检查的 `worktree`、`error`、`result.report` 不会进入响应。
- 未知控制 action、缺失/错误 actionId、错误专用端点和不支持的 observation 字段会拒绝。
- 旧控制 action 分支仍存在；本次审查未发现其代码被 Task 5a 直接删除或重命名。

## 测试与探针

执行：

```text
node --test test/control.test.mjs test/supervisor.test.mjs
```

结果：38/38 通过，0 failed，0 skipped，退出码 0。该结果与 `task-5a-report.md` 的最终计数一致，但绿测没有覆盖以上生产生命周期和 blocked 状态问题。

另执行未落盘、结束后清理临时仓库的 runtime 对抗探针，确认：

```text
CREATE_ACK_AFTER_BLOCKED accepted=true, launches=1
FORGED_INSPECT_ACK accepted=true, reducer task=completed, host ownerRun=running
BLOCKED_STOP returnedStatus=completed, persistedStatus=completed
```

## 对 task-5a-report.md 的核对

- “最终验证 38/38”属实。
- “create ACK 持久化后异步调用 Owner API”属实，但报告遗漏了异步启动失败不可恢复及 `deferFinish` 永不结算的问题。
- “inspect 不泄露内部数据”对响应投影属实，但报告未覆盖 ACK 可伪造宿主观察。
- “含 stopped 任务保存为 blocked”属实，但不足以保证 blocked workflow 不被全 completed task 投影覆盖为 completed；该安全结论被对抗探针证伪。

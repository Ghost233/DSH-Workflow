# Task 5 最终只读复审：服务端 Supervisor 与 runner

## Verdict

- **Critical：0**
- **Important：0**
- **Minor：1**
- **结论：通过。** Task 5 的安全边界、持久生命周期和 runner 协议均满足本次验收项；剩余问题只是旧 socket action 缺少仓库内的持久回归测试，不影响当前兼容行为。

复审范围为 `owner-workflow-plugin/src/runtime.mjs`、`owner-workflow-plugin/src/external-runner.mjs`、`owner-workflow-plugin/src/supervisor.mjs`、`owner-workflow-plugin/test/control.test.mjs`、`owner-workflow-plugin/test/runner.test.mjs`、`owner-workflow-plugin/test/supervisor.test.mjs`，并阅读 `task-5a-review.md`、`task-5a-c1-report.md`、`task-5a-lifecycle-report.md` 与 `task-5b-report.md`。除本报告外未修改源码、测试或其他项目文件。

## Findings

### Minor 1：旧 socket action 当前兼容，但没有仓库内的 socket 级回归矩阵

`runtime.mjs:2413-2438` 仍保留 `run-owner`、`owner-sync`、`owner-finish`、`owner-recover` 和 `merge-stage` 的服务端分支。复审期间通过真实 Unix socket 的临时探针逐一发送这五个旧动作，五个动作均被正确路由并保留参数语义，退出码为 0，因此当前实现兼容。

不过，`control.test.mjs:246-302` 的旧 socket 覆盖仍只有 `ping` 和 `status`；`control.test.mjs:1570-1646` 对 `owner-sync`/`owner-finish` 的覆盖直接调用 runtime 方法，没有经过 socket。`runner.test.mjs` 则按新协议有意只允许五个 Supervisor 控制动作。建议后续把本次临时探针固化为 control 回归矩阵，防止旧分支在以后重构中静默退化。

## 验收结论

### 1. receipt 全状态绑定：通过

- `runtime.mjs:1071-1108` 把实际持久 `revision`、workflow `status` 和 `planDigest` 合成 runtime receipt revision，并且 Supervisor 专用投影只接受 `running`。
- `supervisor.mjs:135-145` 继续把 workflow 身份、runtime revision、实际计划 fingerprint、完整 task 投影、parallel、actionSequence、action 和 payload 纳入 `actionId`。
- `runtime.mjs:1111-1120` 在 ACK、inspect 和 stop 前重算当前 receipt；旧 actionId、错误动作端点或状态漂移均关闭处理。
- `control.test.mjs:566-656` 覆盖 revision、status、planDigest 变化后的旧 create/stop receipt 拒绝且状态不写入；`supervisor.test.mjs:166-197` 覆盖计划、任务投影、revision 和 actionSequence 漂移。

### 2. blocked fail-closed：通过

- `runtime.mjs:1093-1100` 统一拒绝非 `running` workflow 使用 Supervisor 专用端点。
- `runtime.mjs:2397-2410` 只有当前 stop receipt 在锁内仍有效时才结算，全部任务 completed 才写 `completed`，否则写 `blocked`。
- `control.test.mjs:658-685` 逐一验证 `blocked`、`failed`、`cancelled` 都不能被旧 stop 覆盖为 completed。

### 3. outbox/reservation 可恢复：通过

- create ACK 在 workflow 锁内同时保存 reducer 状态和 `DSH_SUPERVISOR_OWNER_RESERVATION_V1` reservation（`runtime.mjs:2332-2388`），成功持久后才排队执行。
- reservation 的 `reserved/launching` 状态会在控制桥恢复时重放（`runtime.mjs:1156-1160`、`2163-2166`、`2253-2256`）。
- `runtime.mjs:2057-2135` 覆盖未启动重放、`starting/running` 恢复、`awaiting_finish/committed` 仅结算以及 owner 已 completed 的幂等确认。
- `control.test.mjs:440-471` 验证跨 Runtime 持久 reservation 会被新控制桥发现并进入重放队列；真实生命周期测试同时验证正常派发与结算。

### 4. 真实 finish：通过

- `runtime.mjs:2110-2122` 的 reservation 执行在真实 `runExternalOwner(..., deferFinish: true)` 成功后确定性调用 `finishOwner()`。
- `runtime.mjs:2797-2837` 的 finish 会重新验证固定 commit、分支 HEAD 和干净 worktree，再把 ownerRun 保存为 completed。
- `control.test.mjs:355-438` 使用真实 `runExternalOwner` 与真实 `finishOwner` 完成 `create → wait → stop`，没有手工注入 completed；测试明确确认 finish 被调用一次且 `awaiting_finish` 最终变为 completed。

### 5. 启动错误：通过

- `runtime.mjs:2005-2055` 将 reservation 失败持久化为 outbox `failed`，保存错误文本，把对应 task 收口为固定 `stopped/task_failed/repair_task`，并保留已经形成的宿主 blocked/failed 终态。
- `control.test.mjs:473-512` 验证纯启动失败不被吞掉、状态可重复生成同一个 stop receipt，最终确定性保存为 blocked。

### 6. inspect 不可伪造：通过

- `runtime.mjs:1169-1207` 只生成闭合的 task/status/executorId/cursor/reason/action 宿主投影。
- `runtime.mjs:2349-2354` 在 ACK 的 workflow 锁内重算观察；客户端回传值若存在，必须与锁内投影规范化后完全一致，reducer 不使用客户端伪造值。
- `control.test.mjs:514-564` 验证敏感 worktree/error/report 不泄漏，伪造 completed/executorId/cursor 的 ACK 被拒绝。

### 7. runner 只使用五个动作且不读计划：通过

- `external-runner.mjs:14-20` 固定允许 `supervisor-start`、`supervisor-next`、`supervisor-ack`、`supervisor-inspect`、`supervisor-stop`；`external-runner.mjs:215-216` 对其他出站动作关闭处理。
- 执行路径只读取 `.dsh-workflow/control/<workflowId>.json` 清单（`external-runner.mjs:301-306`），没有读取 workflow 状态、plan 或遍历 stages。
- `runner.test.mjs:102-172` 的 fixture 只创建控制清单，不创建本地 workflow 状态；四个测试验证 create/wait/inspect/notify/stop 的精确请求序列和未知动作无派生请求。

### 8. actionId ACK 与未知动作 fail-closed：通过

- runner 在任何派生请求前要求非空 `actionId`（`external-runner.mjs:281-288`），并对 create/wait/inspect/notify/stop 使用同一 receipt 的 actionId（`external-runner.mjs:317-375`）。
- 服务端每次 ACK/inspect/stop 都按当前状态重算 receipt；stop 不允许走通用 ACK（`runtime.mjs:2332-2403`）。
- runner 对未知 Supervisor action 直接失败，服务端对未知 control action 直接失败；相关 runner/control 测试均通过。

### 9. 旧 socket action 兼容：当前行为通过

服务端旧动作分支均保留；本次真实 socket 临时探针得到以下路由结果：

```text
run-owner → runExternalOwner(deferFinish=false)
owner-sync → runExternalOwner(deferFinish=true)
owner-finish → finishOwner
owner-recover → recoverOwner
merge-stage → mergeExternalStage
```

唯一剩余项是 Findings 中记录的持久回归测试缺口。

## 测试结果

工作目录：`owner-workflow-plugin`

```text
node --test test/control.test.mjs
32 passed, 0 failed

node --test test/runner.test.mjs
4 passed, 0 failed

node --test test/supervisor.test.mjs
13 passed, 0 failed

node --test test/*.test.mjs
176 passed, 0 failed
```

另执行只使用临时目录的真实 Unix socket 兼容探针；五个旧 action 全部成功，退出码 0，临时目录已清理。

## 对前序报告的核对

- `task-5a-review.md` 的 Critical 1 已由 runtime revision/status/planDigest 绑定和非 running 门禁关闭。
- Critical 2 已由 reservation 路径中的真实 `finishOwner()` 闭环关闭。
- Important 1 已由 inspect 锁内可信投影关闭。
- Important 2 已由持久 outbox/reservation、启动失败落盘与控制桥恢复重放关闭。
- `task-5b-report.md` 关于 runner 只使用五个 Supervisor 动作、不读取计划、按 actionId ACK 和未知动作关闭处理的陈述与代码及 4/4 runner 测试一致。
- 前序 Minor 所述旧 socket 行为目前确实兼容，但仓库内永久 socket 回归覆盖仍未补齐，因此保留为本次唯一 Minor。

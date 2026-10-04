# Task 5a Lifecycle 修复报告

## 结果

已完成 `task-5a-review.md` 的 Critical 2、Important 1/2，以及 `task-5a-c1-report.md` 留下的两项 control 异步失败修复。Critical 1 的 revision/status/planDigest receipt 绑定与非 running fail-closed 行为保留不变。

本次只修改：

- `owner-workflow-plugin/src/runtime.mjs`
- `owner-workflow-plugin/test/control.test.mjs`
- `task-5a-lifecycle-report.md`

未修改 `runner`、`supervisor`、`registry` 或 resilience 测试，未提交 Git。

## 生命周期修复

### 1. create ACK 持久 reservation/outbox

- create ACK 在 workflow 锁内同时保存 reducer 的 `running` task 与 `DSH_SUPERVISOR_OWNER_RESERVATION_V1` outbox 记录。
- reservation 绑定 create `actionId`、task、Owner 和固定 legacy stage；ACK 状态事务完成后才进入异步派发。
- 控制桥启动会读取持久 `supervisorOutbox`，把 `reserved`/`launching` 项重新加入派发队列。
- 新测试先禁用当前 Runtime 派发，确认 ACK 后磁盘存在 `reserved`，再释放旧 Runtime 并创建新 Runtime，验证 reservation 被重放发现。

### 2. 真实 Owner 两阶段结算闭环

- reservation 派发走真实 `runExternalOwner(..., { deferFinish: true })`。
- `runExternalOwner` 成功后，同一 reservation 路径确定性调用现有 `finishOwner()`，再把 outbox 标记为 `completed`。
- 若恢复时 Owner 已处于 `awaiting_finish`/`committed`，直接执行 finish；已 completed 则幂等确认 outbox。
- control 测试通过真实 `runExternalOwner` 和真实 `finishOwner` 推进 `create → wait → stop`，不再手工向状态文件注入 completed。

### 3. 启动失败不吞并可确定性收口

- reservation 派发异常会持久保存 outbox `failed` 及错误文本，并把对应 host ownerRun 保存为 `failed`。
- reducer task 确定性保存为 `stopped/task_failed/repair_task`。
- 对尚未改变 workflow 终态的纯启动失败，workflow 保持 `running`，因此相同持久状态可重复生成同一个 stop receipt；`supervisor-stop` 最终保存为 `blocked`。
- 若真实 Owner 已经把 workflow 落为 blocked/failed，则保留该宿主终态，不由派发错误覆盖。
- 启动失败使用 `supervisor.dispatch-failed` 日志事件，不再伪装成已经进入 workflow failed 的结算事件。

### 4. inspect ACK 不信任客户端 observation

- `supervisor-ack` 的 inspect 分支在 workflow 锁内重新读取当前状态、校验 actionId，并由有限宿主投影重算 observation。
- 客户端未回传 observation 时直接使用锁内结果；为兼容现有 runner，客户端回传 observation 时必须与锁内有限投影规范化后完全一致。
- reducer 只接收锁内重算的 observation，不接收客户端对象。伪造 completed/executorId/cursor 会被拒绝，且 host/reducer 状态不被推进。
- `worktree`、`error`、result report 等内部字段仍不会进入 inspect 响应或 ACK observation。

### 5. 异步测试时序

- 删除“单个 `setImmediate` 必须已经触发 Owner”的脆弱假设，改为有截止时间的条件等待。
- inspect 测试停止使用会后台失败结算的假 Owner stub，显式冻结派发后构造 running 宿主观察，避免后台 revision 与测试 receipt 竞争。

## TDD 证据

修复实现前运行新增/改写的 Supervisor control 定向测试：

```text
5 tests: 3 passed, 2 failed
```

两个预期失败分别为：

1. Owner 启动失败后实际 workflow status 为 `failed`，期望为可重放 stop 的 `running`。
2. inspect 对 runner 回传和伪造 observation 都只报“只能回传空宿主观察”，没有实现锁内可信投影绑定。

最小实现后同一命令：

```text
5 passed, 0 failed
```

## 验证

```text
node --test owner-workflow-plugin/test/control.test.mjs
32 passed, 0 failed

node --test owner-workflow-plugin/test/supervisor.test.mjs
13 passed, 0 failed

node --test owner-workflow-plugin/test/*.test.mjs
176 passed, 0 failed
```

最终还执行 `node --check` 与 `git diff --check` 检查源码语法和已跟踪 diff 格式。

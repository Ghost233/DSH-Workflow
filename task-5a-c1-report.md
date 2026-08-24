# Task 5a Review Critical1

## 结果

已完成 receipt 状态绑定与 `supervisor-stop` 边界修复。

- `owner-workflow-plugin/src/runtime.mjs`
  - runtime projection fingerprint 绑定实际 `revision`、`status`、`planDigest`。
  - 缺失有效 `planDigest` 时拒绝生成 Supervisor receipt。
  - 专用 Supervisor 端点继续只允许 `running` workflow；非运行态在 ACK/stop 前拒绝，状态文件不写入。
  - `supervisor-stop` 只有当前 receipt 有效且 workflow 仍为 `running` 时才进入结算；只有全部 task 为 `completed` 才保存为 `completed`。
- `owner-workflow-plugin/test/control.test.mjs`
  - 新增 create receipt 在 planDigest 漂移后旧 ACK 拒绝且 workflow 不变的回归测试。
  - 新增 stop receipt 在 planDigest 漂移后旧 stop 拒绝且 workflow 不变的回归测试。
  - 加强 revision/status 变更后的完整 workflow 不变断言。

未修改真实 Owner finish、inspect 或 outbox 实现，也未修改 `src/supervisor.mjs`。

## TDD 证据

RED：实现前新增的两条测试均失败，错误为 `Missing expected rejection`，说明旧 create/stop receipt 在仅 planDigest 变化时仍被接受。

GREEN：

```text
node --test --test-name-pattern='Supervisor receipt 绑定|实际 planDigest|blocked、failed、cancelled' test/control.test.mjs
4 passed, 0 failed
```

## 验证

```text
node --test test/supervisor.test.mjs
13 passed, 0 failed

node --check src/runtime.mjs
passed

git diff --check -- src/runtime.mjs
passed
```

完整 control 测试结果为 `28 passed, 2 failed`。失败项均为本次范围之外的既有异步时序问题：

1. `Supervisor 控制桥按 actionId 驱动 create、wait、stop 并通过当前 Owner API 适配任务`：派发 promise 在单个 `setImmediate` 内尚未触发 stub Owner 调用。
2. `Supervisor inspect 只返回有限宿主字段，未知控制动作关闭处理`：后台 reservation 结算改变 workflow revision 后，测试持有的 inspect receipt 失效。

两项均未修改；本次 Critical1 定向回归和 Supervisor 单元测试通过。

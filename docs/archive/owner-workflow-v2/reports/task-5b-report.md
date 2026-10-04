# Task 5b runner 客户端实施报告

## 范围

- 确认 `owner-workflow-plugin/src/external-runner.mjs` 是 Supervisor 控制桥客户端：它只发送 `supervisor-start`、`supervisor-next`、`supervisor-ack`、`supervisor-inspect` 和 `supervisor-stop`。
- 强化 `owner-workflow-plugin/test/runner.test.mjs` 的伪 socket 场景：测试夹具不再创建本地 workflow 状态或旧计划；任何非 Supervisor 控制动作都由伪服务端标记为错误。
- 未改动 runtime、验证、worktree 或 dashboard；未提交。

## 协议行为

- `create`、`wait` 和 `notify` 用对应 `actionId` 发送空观察 ACK。
- `inspect` 先以对应 `actionId` 请求有限宿主观察，再将原观察和同一 `actionId` ACK 回控制桥。
- `stop` 用对应 `actionId` 发送 `supervisor-stop`，不发送 ACK。
- 未知 Supervisor 动作在没有任何派生请求的情况下失败；runner 不读取或遍历 `plan.stages`，也不发送 `owner-sync`、`merge-stage` 或 `status`。

## 测试与验证

- 先收紧伪 socket 测试，使缺失本地 workflow 状态和任何非 Supervisor 请求都会暴露旧阶段调度行为。
- 运行：`node --test test/runner.test.mjs`（工作目录：`owner-workflow-plugin`）。
- 结果：4/4 通过，覆盖 create/wait/stop、inspect、notify 和未知动作 fail-closed 的精确请求顺序。

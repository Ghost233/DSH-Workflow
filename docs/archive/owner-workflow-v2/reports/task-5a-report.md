# Task 5a 服务端控制桥实施报告

## 范围

- 修改 `owner-workflow-plugin/src/runtime.mjs`，在现有 Unix socket 控制桥中接入 `supervisor-start`、`supervisor-next`、`supervisor-ack`、`supervisor-inspect`、`supervisor-stop`。
- 修改 `owner-workflow-plugin/test/control.test.mjs`，通过伪 socket 客户端覆盖动作顺序、错误 actionId ACK、有限 inspect 投影和 stop 持久化。
- 未修改 `owner-workflow-plugin/src/supervisor.mjs`、`owner-workflow-plugin/src/external-runner.mjs` 或既有 `ping`、`status`、`owner-sync`、`owner-finish` 等端点；未执行 Git commit。

## 行为

- `supervisor-start` 使用 `createTaskState` 初始化 V2 任务状态，并通过纯 `supervisorNext` 校验并行配置；重复启动和非可启动工作流关闭处理。
- `supervisor-next` 直接返回纯 reducer 生成的固定动作及不透明 `sa-…` actionId，不在控制桥内复制调度判断。
- `supervisor-ack` 先重新计算当前 receipt，再由 `ackSupervisorAction` 校验 actionId 和观测、生成下一状态；create ACK 持久化后异步调用现有 Owner API 适配任务，wait ACK 只投影当前宿主状态。
- `supervisor-inspect` 只返回 taskId、status、executorId、cursor 等有限宿主字段；worktree、error、report 等内部数据不会进入响应。
- `supervisor-stop` 只接受当前 stop actionId，并通过 `ackSupervisorAction` 完成终态确认；全 completed 任务将工作流保存为 completed，含 stopped 任务则保存为 blocked。
- 未知控制动作、错误或过期 actionId、动作与专用端点不匹配均返回错误，且不会推进 Supervisor 状态。

## TDD 与验证

- RED 1：`node --test test/control.test.mjs` 为 23/25，通过既有端点测试；两项新控制桥测试均因未知 `supervisor-start` 失败。
- RED 2：补入 start/next 后同一命令仍为 23/25，两项测试按预期推进至未知 `supervisor-ack` 失败。
- RED 3：先加入错误 ACK 用例；定向测试因错误响应是“未知 supervisor-ack”而非 actionId 拒绝失败。
- RED 4：补入 ACK 后，动作顺序测试推进至未知 `supervisor-stop` 失败。
- GREEN：补入 inspect/stop 后，两项 Supervisor 控制桥定向测试 2/2 通过。
- 最终验证：`node --test test/control.test.mjs test/supervisor.test.mjs`，38/38 通过。

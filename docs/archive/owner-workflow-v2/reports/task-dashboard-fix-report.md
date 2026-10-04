# Dashboard SSE 修复报告

## 结果

Dashboard 定向测试已通过：5/5 passed，0 failed。

## 根因与修复

基线命令：

```sh
npm --prefix owner-workflow-plugin run test:dashboard
```

基线为 3/5 通过、2/5 失败；两个 SSE 用例均因“读取 SSE 事件超时”失败。实际响应帧只有一个结尾换行，`event` 与 `data` 后没有 SSE 要求的空行分隔，因此测试无法识别事件。

`owner-workflow-plugin/src/dashboard.mjs` 的 `ssePayload()` 现在在序列化结果后补充一个换行，使每个事件以 `\n\n` 结束。该修复保持现有事件顺序：连接后先发送 `events.jsonl`，再发送当前 progress snapshot；原子投影更新仍通过现有广播路径推送。

`owner-workflow-plugin/test/dashboard.test.mjs` 的测试 reader 改为复用同一条真实 SSE 流并保留未消费缓冲，覆盖既有事件、snapshot 和后续原子投影更新，不会因多个帧合并在一次网络读取中而丢失事件。

## 范围约束

- 未增加写接口、CORS 响应或公网绑定。
- Dashboard 仍只监听 `127.0.0.1`。
- 本轮触及：`owner-workflow-plugin/src/dashboard.mjs`、`owner-workflow-plugin/test/dashboard.test.mjs` 及本报告。

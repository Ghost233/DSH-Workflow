# Task 7a verification 纯函数/快照层报告

## 实现范围

仅修改以下 Task 7a 文件：

- `owner-workflow-plugin/src/verification.mjs`
- `owner-workflow-plugin/test/verification.test.mjs`

新增本报告；未修改 `runtime.mjs`、`index.js`、`skills.mjs`，也未提交 Git commit。

## 提供的能力

- 固定 argv 的解析、复制和冻结；调用方不能通过额外 argv 改写目录中的验证命令。
- 验证 ID 仅能从目录解析，且必须绑定当前任务；未知或未绑定 ID 在调用快照执行器前拒绝。
- `CONTENT_DIGEST_SCHEMA`、`VERIFICATION_RESULT_SCHEMA` 与验证结果解析；结果包含 SHA-256 `contentDigest`、argv、`exitCode`、`enforcement`、`passed`。
- 验证结果只有在当前 `contentDigest` 完全一致时才可复用。
- 通过证据必须同时为 `enforcement === 'full'` 和 `exitCode === 0`；伪造或不一致的 `passed` 字段拒绝。
- `runBoundVerification` 只依赖注入的 `snapshotExecutor.run(argv)`，不调用 shell、Git 或 runtime。

## 测试

```text
node --test test/verification.test.mjs
6 passed, 0 failed
```

测试使用 fake snapshot executor，未执行真实 shell 命令。

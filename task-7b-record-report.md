# Task7b-a 验证结果记录适配报告

## 范围

本轮只为 runtime 增加验证结果记录适配，不改写 `owner_bash` 的独立 snapshot sandbox，也未公开 index/skills 或增加完成门禁。

改动文件：

- `owner-workflow-plugin/src/runtime.mjs`
- `owner-workflow-plugin/test/security.test.mjs`

## 实现

- 新增 `runtime.recordBoundVerification(args, exec, executionResult)`。
- 通过 active Owner、workflow、running task、Owner 归属和 `verification.mjs` 的绑定解析校验 `task_id` / `verification_id`。
- 接受测试注入的执行结果，规范化 `contentDigest`、`exitCode`、`enforcement` 和 `passed`。
- 将结果写入 active Owner、持久化 task 状态，并追加 `owner.verification` 日志。
- 未知/未绑定验证、非 `full` enforcement、非 0 exit code 均拒绝；非 full/非 0 结果会先保存为负面证据。

## TDD 证据

- RED：3 个 security 用例均因 `recordBoundVerification is not a function` 失败。
- GREEN：定向运行 `node --test --test-name-pattern='recordBoundVerification' test/security.test.mjs`，3/3 通过。

## 完整验证

运行：

```text
node --test test/security.test.mjs
```

结果：17/17 通过，0 失败。

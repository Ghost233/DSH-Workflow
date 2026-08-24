# Task 8 实现报告

## RED

命令：

```sh
node --test owner-workflow-plugin/test/model.test.mjs owner-workflow-plugin/test/supervisor.test.mjs owner-workflow-plugin/test/resilience.test.mjs
```

首次失败原因是 `model.mjs` 尚未导出 `applyPlanDelta` 与 `expandCompositeTask`。补上模型和 Supervisor 后，runtime RED 命令为：

```sh
node --test --test-name-pattern='request|结构化' owner-workflow-plugin/test/resilience.test.mjs owner-workflow-plugin/test/control.test.mjs
```

该 RED 基线记录的预期缺口是 `runtime.requestSubgraph`、`runtime.requestHandoff` 和两个 Owner 工具；随后先修正了一个测试断言正则，再完成实现并进入 GREEN。

## GREEN

以下专项回归已通过：

```sh
node --test owner-workflow-plugin/test/model.test.mjs
node --test owner-workflow-plugin/test/supervisor.test.mjs
node --test owner-workflow-plugin/test/model.test.mjs owner-workflow-plugin/test/supervisor.test.mjs owner-workflow-plugin/test/resilience.test.mjs
node --test owner-workflow-plugin/test/control.test.mjs owner-workflow-plugin/test/plugin.test.mjs
```

模型测试 `38/38` 通过；Supervisor 测试 `16/16` 通过；Task 8 三组联合测试 `98/98` 通过；控制桥与插件回归 `41/41` 通过。

## 修改文件

- `owner-workflow-plugin/src/model.mjs`：新增 Composite 展开校验、V2 局部 delta、失效传播与证据清理。
- `owner-workflow-plugin/src/supervisor.mjs`：新增展开后 parent/child ready 投影及 exit 完成归并。
- `owner-workflow-plugin/src/runtime.mjs`：实现锁内 Owner/session/task 校验、`requestSubgraph`/`requestHandoff`、局部 delta 持久化和 Registry 边界保护。
- `owner-workflow-plugin/index.js`：以受限 Owner 工具暴露 `request_subgraph` 与 `request_handoff`。
- `owner-workflow-plugin/test/model.test.mjs`：新增 Composite、delta、完成节点保护用例。
- `owner-workflow-plugin/test/supervisor.test.mjs`：新增 Composite ready/完成语义用例。
- `owner-workflow-plugin/test/resilience.test.mjs`：新增 request_subgraph/request_handoff runtime 用例。
- `owner-workflow-plugin/test/control.test.mjs`：新增两个结构化 Owner 工具的参数白名单用例。
- `task-8-report.md`：本报告。

## 未解决风险

- 局部 handoff delta 会将 workflow 标记为 `blocked`，后续仍需现有 handoff 重规划流程重新审查和批准；这是为避免继续派发已失效任务的保守行为。
- 未运行 Git 提交；`deepseek-harness` 未修改。

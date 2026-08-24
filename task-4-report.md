# Task 4 纯函数层实施报告

## 范围

- 新增 `owner-workflow-plugin/src/supervisor.mjs`：V2 计划任务状态初始化、确定性动作选择、动作确认和进度投影。
- 新增 `owner-workflow-plugin/test/supervisor.test.mjs`：覆盖 DAG 就绪任务、Review 依赖阻塞、并行上限、固定动作枚举、十次无 cursor 进展后的 inspect、终态 stop、决策 notify、actionId 确认与进度投影。
- 未修改 `runtime.mjs`、`external-runner.mjs` 或子模块；未执行 Git commit。

## 行为

- 仅接受 `DSH_PLAN_V2` 与完整任务状态；状态及停止原因/动作配对均按 V2 模型的固定枚举校验。
- 动作固定为 `create`、`wait`、`notify`、`inspect`、`stop`；actionId 由当前纯状态和动作载荷稳定生成，确认不匹配时拒绝。
- `create` 使用并行上限的剩余槽位；`wait` 的 cursor 未变化会累加轮数，变化时重置；达到十轮后返回 `inspect`；全部任务处于完成或停止终态时返回 `stop`。
- `projectProgress` 仅投影计划任务元数据与任务状态，不读取或修改运行时、Runner 或外部状态。

## TDD 与验证

- RED：`node --test owner-workflow-plugin/test/supervisor.test.mjs` 在模块尚不存在时失败，报错为找不到 `src/supervisor.mjs`。
- GREEN：`node --test owner-workflow-plugin/test/supervisor.test.mjs` 通过，6/6。
- 回归：`node --test owner-workflow-plugin/test/model.test.mjs` 通过，32/32。
- 格式检查：`git diff --check` 通过。

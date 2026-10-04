# Task 4 Supervisor 纯函数层独立审查

## Verdict

- **Critical：0**
- **Important：4**
- **Minor：0**
- **结论：不通过，需要修复 Important 后复审。**

审查范围仅为 `owner-workflow-plugin/src/supervisor.mjs` 与 `owner-workflow-plugin/test/supervisor.test.mjs`，并对照 `.superpowers/sdd/2026-08-20-owner-workflow-v2/task-4-brief.md`、`docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md` 及其依赖的 V2 model 契约。除本报告外未修改源码、测试或其他项目文件。

## Findings

### Important 1：actionId 未绑定完整当前状态，其他 workflow/计划的回执可被错误接受

`src/supervisor.mjs:125-127` 名义上接收 `state`，但 actionId 实际只纳入 `state.actionSequence`、动作名和动作载荷，没有纳入计划身份、Registry digest、任务状态或 workflow/revision。`ackSupervisorAction()` 在 `src/supervisor.mjs:230-233` 仅重新计算该值并比较。

因此，两个 Registry digest、summary 不同但下一动作载荷相同的状态会产生相同 actionId；把状态 A 的 `create` actionId 交给状态 B，B 会接受并进入 `running`。这不能证明 ACK 对应“当前状态发出的那个动作”，削弱了 V2 所要求的确定性 `next/ack` 关联和错路由防护。

建议让 actionId 至少绑定规范化计划身份、完整任务状态、配置和单调 revision/sequence，或在状态中持久化待确认动作并按 workflow revision 做精确匹配。

### Important 2：create ACK 对未知/矛盾观测 fail-open

`observationsByTask()`（`src/supervisor.mjs:167-179`）只校验任务 ID；`applyCreatedTask()`（`src/supervisor.mjs:181-185`）只读取 executorId/cursor，静默忽略其他字段。实测 `create` 回执携带 `status: "unknown"` 仍被接受，并把任务置为 `running`。同类问题还包括非 stopped 观测携带 reason/action 时被忽略，以及 notify/stop ACK 的任意观测内容被整体忽略（`src/supervisor.mjs:253`）。

这违反用户要求的 unknown 防护和状态/回执输入 fail-closed。应为每种动作定义闭合的 ACK schema，拒绝未知状态、互斥字段和不适用于该动作的状态字段；若宿主扩展字段确需保留，应显式划定可忽略的扩展容器，而不是静默吞掉顶层控制字段。

### Important 3：输入状态可超过并行上限，wait 还会漏掉 active task

`normalizeState()` 校验 `parallel` 为正整数，却没有校验 `running` 数量不超过该上限。`nextReceipt()` 随后在 `src/supervisor.mjs:145` 对 active tasks 执行 `slice(0, state.parallel)`。构造 `parallel: 1` 且已有两个 running task 的输入不会被拒绝，只返回第一个任务的 watch，第二个 active task 被本轮调度完全遗漏。

正常路径的 create 会使用剩余槽位，但持久状态恢复、损坏输入或竞态快照必须 fail-closed，不能靠“正常路径不会产生”维持并发不变量。应在规范化阶段拒绝 active 数超过配置的状态；至少也不能在 wait 投影中静默丢弃已有 active task。

### Important 4：计数器接受非安全整数，ACK 后 actionSequence 可不前进

`optionalNonNegativeInteger()`（`src/supervisor.mjs:25-29`）使用 `Number.isInteger()` 而不是 `Number.isSafeInteger()`。当输入 `actionSequence = 9007199254740992` 时，`cloneState()` 的 `+ 1`（`src/supervisor.mjs:156`）仍得到同一数值。对 payload 固定的 stop/notify 动作，ACK 后会继续产生同一个 actionId，旧 ACK 可重复使用。`unchangedPolls` 也使用同一宽松校验。

应拒绝超过 `Number.MAX_SAFE_INTEGER` 的 actionSequence/unchangedPolls，并为 sequence 增长边界定义 fail-closed 行为；如果计数可能长期持久化，可改用受约束字符串/BigInt 序列化方案。

## 已确认符合项

- DAG ready 只接受所有依赖均为 `completed` 的 pending task；计划规范化同时拒绝缺失依赖和环。
- 显式 review 节点与普通 DAG 节点一致，未完成时会阻塞依赖它的下游任务。
- 对合法输入，create 使用 `parallel - running` 的剩余槽位，不会新增超限任务。
- cursor 不变时累加 `unchangedPolls`，变化时归零；达到 10 后返回 inspect，不猜测完成。
- 动作生成分支只产生 `create`、`wait`、`notify`、`inspect`、`stop`；未知 task status 和未知停止 reason/action 在状态规范化路径会拒绝。
- 有 active task 时不会返回 stop；全部任务为 completed/stopped 时返回 stop；停止依赖阻塞 pending 下游时返回 decision-required notify。
- `projectProgress()` 返回新投影；调用前后输入状态的 JSON 表示一致，未观察到写状态行为。

## 测试与只读探针

执行：

```text
node --test owner-workflow-plugin/test/supervisor.test.mjs owner-workflow-plugin/test/model.test.mjs
```

结果：38/38 通过（Supervisor 6，Model 32）。

另以 `node --input-type=module -e` 执行未落盘的边界探针，结果：

```text
cross_state_same_action_id true
cross_state_ack_accepted true
create_unknown_status_accepted true
over_parallel_input 返回 wait 且仅包含第一个 running task
unsafe_sequence_advanced false
projection_mutated_input false
```

现有 `test/supervisor.test.mjs` 覆盖了主要 happy path 和错误 actionId，但没有覆盖上述错 workflow ACK、动作特定 observation schema、恢复状态并发不变量、安全整数边界及投影不变性；这些应作为修复后的回归测试。

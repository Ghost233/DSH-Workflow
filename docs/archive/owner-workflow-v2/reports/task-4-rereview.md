# Task 4 Supervisor 修复范围复审

## 结论

- Critical：0
- Important：0
- 原 Task 4 review 的 4 项 Important：全部 ADDRESSED
- 本次复审未发现新的 Critical 或 Important。

复审为只读检查；未修改 `owner-workflow-plugin/src/supervisor.mjs` 或
`owner-workflow-plugin/test/supervisor.test.mjs`。

## 逐项核验

### Important 1：action fingerprint 绑定完整当前状态 — ADDRESSED

`src/supervisor.mjs:135-145` 的 `actionId()` 将规范化后的
`workflowId`、`revision`、计划 fingerprint、完整任务投影、并行配置、
`actionSequence`、动作名和动作 payload 纳入 fingerprint。ACK 在
`src/supervisor.mjs:308-311` 重新从当前规范化状态生成 next receipt 后比较，
因此旧 workflow、旧 revision、计划/任务投影变化或并行配置变化都会拒绝旧 ACK。

回归测试覆盖 `test/supervisor.test.mjs:166-197`；额外探针确认上述状态变化均
产生不同 actionId 且旧 ACK 被拒绝。

### Important 2：ACK 有限状态与 unknown 防护 — ADDRESSED

`src/supervisor.mjs:206-239` 按动作限制 ACK 任务字段和状态：`create` 只接受
`running`，`wait/inspect` 只接受 `running/completed/stopped`，停止观测必须使用
固定的 reason/action 配对；`src/supervisor.mjs:331-333` 要求 `notify/stop` 不携带
观测内容。未知状态、未知字段、重复/越界任务、矛盾的 stopped 字段均 fail-closed。

回归测试覆盖 `test/supervisor.test.mjs:199-245`；unknown create/wait 状态及
不适用字段的额外探针均按预期抛错。动作枚举仍固定为
`create/wait/notify/inspect/stop`，未引入 `unknown` 分支。

### Important 3：parallel overflow fail-closed 与 wait 完整性 — ADDRESSED

`normalizeState()` 在 `src/supervisor.mjs:77-81` 拒绝 running task 数超过
`config.parallel` 的恢复/输入状态。合法 active 状态下，`nextReceipt()` 在
`src/supervisor.mjs:153-165` 对 `wait` 映射全部 active task，不再按并行上限
静默截断；并行上限只用于 create 的剩余槽位。

回归测试覆盖 `test/supervisor.test.mjs:76-90` 与 `247-255`；额外探针确认
overflow 输入被拒绝，且合法 wait 同时包含全部 active task。

### Important 4：安全 action sequence — ADDRESSED

`src/supervisor.mjs:25-35`、`78-80` 对 `actionSequence`、`unchangedPolls`
和 parallel 使用安全整数校验；`actionSequence` 达到
`Number.MAX_SAFE_INTEGER` 时在生成动作前拒绝，避免 `cloneState()` 的递增
失效或 actionId 重用。无进展计数在 `src/supervisor.mjs:261-265`、`281-285`
同样在不可安全递增时拒绝。

回归测试覆盖 `test/supervisor.test.mjs:263-277`；额外探针确认非安全整数、
序列上限和 unchangedPolls 上限均 fail-closed。

## 状态写入检查

- `supervisorNext()`、`ackSupervisorAction()`、`projectProgress()` 的输入快照
  在调用前后保持一致。
- 对深度冻结的状态执行 next、ack、progress 探针通过，未发生输入写入。
- `projectProgress()` 返回新投影；未观察到对 workflow、task 或 plan 状态的
  原地修改。

## 测试结果

执行：

```text
node --test test/supervisor.test.mjs test/model.test.mjs
```

结果：45/45 通过，0 failed，0 skipped，退出码 0。

另执行只读 adversarial probes 与深度冻结状态 probe，均输出 `PASS`。

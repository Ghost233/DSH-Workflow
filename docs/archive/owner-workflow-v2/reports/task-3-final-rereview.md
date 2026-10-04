# Owner Workflow V2 Task 3 最终只读再复审

## Verdict

**通过。** 本轮未确认 Critical、Important 或 Minor 问题。此前 `task-3-review.md` 的 C1/C2/C3/I1，以及 `task-3-final-review.md` 的跨 Runtime Owner 启动竞争和大小写 Registry 路径别名问题，当前实现与回归测试均已形成 fail-closed 闭环。

## Critical

无。

## Important

无。

## Minor

无。

## 复审结论与证据

- **proposal digest 与 Registry content digest 已分离。** `approveOwnerChange` 在 workflow state 跨进程写锁内重新读取并校验 pending proposal 与批准 digest，应用正式 Registry 后分别写入 `approvedProposalDigest` 和 live `registryDigest`；state 保存失败时注册反向 Registry 回滚。`approvePlan` 重新加载 live Registry，要求状态绑定 digest、调用者 digest、计划可选绑定 digest及计划 Owner 定义同时匹配。缺失 Registry、live 内容漂移、Owner 定义漂移和 proposal/content digest 混用均拒绝。
- **handoff 未保留 Registry 绕过。** `replanHandoffs` 在 Planner 前加载 live Registry 并校验当前计划，拒绝任何 `registryOperation`，保存前再次按正式 Registry 校验全部 Owner；新计划会清除旧 review/approval。缺失 Registry、未登记 Owner 和旧批准复用均由 resilience 回归覆盖。
- **Owner scope 与 Registry 管理目录保护已 fail-closed。** `.owner-workflow` 及子路径进入统一受保护路径判断；ASCII 大小写折叠覆盖 `.OWNER-WORKFLOW` 和混合大小写别名。该判断同时作用于 `owner_write`、`owner_edit`、Owner 改动快照、提交代理、提交后二次校验和阶段固定提交复核；普通大小写业务文件仍可按 scope 写入。
- **跨 Runtime Registry approval / Owner 启动竞争已闭合。** Owner 取得自身磁盘 lease 后，在跨进程 `workflow-lock-<workflowId>` 临界区内重新读取最新 state，并在写入 `starting` 前重新校验状态、plan digest、review/approval、live/bound Registry digest、计划 Owner 与阶段。批准侧在 state 写锁内检查 state 活动记录和跨 Runtime Owner reservation；任一方先取得关键锁时，另一方要么因 reservation 拒绝批准，要么因最新 state、live Registry 或 revision CAS 拒绝旧计划启动，不会创建 Owner entry 或执行 Owner。
- **旧 API 未恢复。** `index.js` 只暴露 `registry_status`、`owner_change_propose`、`owner_change_approve` 三个 Registry 治理动作；旧 `owner_add`、`owner_remove`、`owner_scope_add`、`owner_scope_remove` 不在动作枚举或分发中，Runtime 也不存在 `addOwner` 等直写方法。

## 验证记录

- `node --test test/control.test.mjs`：退出码 0，23/23 通过。
- `node --test test/resilience.test.mjs`：退出码 0，23/23 通过。
- `node --test test/security.test.mjs`：退出码 0，14/14 通过。
- `npm test`：退出码 0，151/151 通过，0 失败、0 跳过。

本次复审仅新增本报告，未修改 `runtime.mjs`、`index.js`、control/resilience/security tests 或其他实现文件。

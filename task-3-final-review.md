# Owner Workflow V2 Task 3 最终独立只读复审

## Verdict

**不通过。** 已确认 1 项 Critical 与 1 项 Important 阻断项。control、resilience 和 full 当前均为绿测，但没有覆盖下述跨 Runtime 启动竞争与大小写不敏感文件系统路径别名。

## Critical

### C1：Registry 批准可与另一个 Runtime 的 Owner 启动竞争，变更后的 Registry 仍可能执行旧计划

`runExternalOwner` 先取得磁盘 Owner lease，再在跨进程 workflow state 临界区之外读取并验证一次旧状态（`runtime.mjs:2110-2128`）。随后进入本 Runtime 私有的 `withWorkflowLock` 并重新读取 state 时，只拒绝 `planned`；如果另一个 Runtime 已在两次读取之间批准 Registry 提案，把状态改为 `registry_pending_plan` 并清除了 `planApproved`/`planReview`，这里不会重新校验最新状态的审批、计划 digest 或 Registry digest，仍会写入 `ownerRuns[*].status = starting` 并继续使用第一次读取的旧 `stage`（`runtime.mjs:2140-2173`）。

批准侧也不能封闭这个窗口：`assertNoActiveRegistryTasks` 只检查当前 Runtime 的内存集合和 state 中已经落盘的任务记录（`runtime.mjs:925-939`），不检查另一个 Runtime 已取得、但尚未写入 `starting` 记录的磁盘 Owner lease。因而以下顺序可以成立：Runtime A 取得 Owner lease 并读到旧批准计划；Runtime B 取得 state 写锁、应用 Registry、失效旧计划并保存；Runtime A 再取得 state 写锁，以 `registry_pending_plan` 状态写入 `starting`，随后执行旧计划。

影响：Registry 已变更后，旧 Owner 定义与旧 scope 仍可进入实际执行，绕过“Registry 变更后必须重新规划、审查、批准”的核心门禁。现有两个 Runtime 竞争测试只覆盖 approval-vs-approval、CAS 锁和 state 保存失败回滚，没有覆盖 approval-vs-owner-start。

阻断修复要求：Owner 的 lease 保留、最新状态复核和 `starting` 落盘必须进入同一个跨进程 state 临界区；临界区内应只接受明确允许的状态，并重新校验 `planApproved`、`planReviewDigest === planDigest`、live/bound Registry digest 和计划 Owner。Registry 批准侧还必须把已取得的跨 Runtime Owner 保留视为活动任务，或由同一个 state 保留记录消除该窗口。需增加确定性的双 Runtime 竞争回归测试，覆盖 Registry 批准先赢锁时 Owner 不得启动且 Registry/state 保持一致。

## Important

### I1：`.owner-workflow` 保护在大小写不敏感文件系统上可被路径别名绕过

`isProtectedRelativePath` 对 `.owner-workflow` 使用大小写敏感的字符串比较（`runtime.mjs:251-262`），而 `ownerTarget` 直接把 `relativePath` 交给该函数（`runtime.mjs:3420-3435`）。在本次 Darwin 工作区中，文件系统实测大小写不敏感：`owner-workflow-plugin` 与 `OWNER-WORKFLOW-PLUGIN` 都可命中同一目录，且 Git `core.ignorecase=true`。只读调用 `ownerTarget` 时，scope 为 `['**']` 的 Owner 对 `.OWNER-WORKFLOW/config.json` 被接受并返回目标，而不是按受保护路径拒绝：

```text
{"absolute":"/Users/admin/code/DSH-Workflow/.OWNER-WORKFLOW/config.json","relativeFile":".OWNER-WORKFLOW/config.json"}
```

同一个大小写敏感 helper 也用于改动快照、提交代理和提交后二次检查，因此大小写变体路径没有形成一致的 fail-closed 保护。现有 C3 测试只覆盖精确小写 `.owner-workflow`。

影响：在支持大小写别名的平台上，Owner 受控写入可以命中正式 Registry 路径的大小写别名；在 Git 仍保留变体拼写的场景，后续提交检查也会漏检。

阻断修复要求：对受保护路径使用与底层文件系统一致的规范化/真实路径身份判断；至少对 ASCII 管理目录执行大小写折叠，并在 owner_write、owner_edit、快照差异、提交代理和提交后二次校验增加大小写变体回归测试。

## Minor

无阻断项。

## 验证记录

- `node --test owner-workflow-plugin/test/control.test.mjs`：退出码 0，23/23 通过。
- `node --test owner-workflow-plugin/test/resilience.test.mjs`：退出码 0，21/21 通过。
- `npm test --prefix owner-workflow-plugin`：退出码 0，147/147 通过，0 失败、0 跳过。

本次复审只新增本报告，未修改实现、测试或其他工作区文件。

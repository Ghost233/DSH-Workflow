# Task 7b 后半：公开 owner_verify 与完成门禁报告

## 范围

本轮仅修改以下实现与测试文件，并新增本报告；未提交 Git：

- `owner-workflow-plugin/index.js`
- `owner-workflow-plugin/src/runtime.mjs`
- `owner-workflow-plugin/src/skills.mjs`
- `owner-workflow-plugin/test/security.test.mjs`
- `owner-workflow-plugin/test/control.test.mjs`
- `task-7b-gate-report.md`

## 实现

- 公开 `owner_verify`，参数严格限定为 `task_id`、`verification_id`、`description`，拒绝 `command`、`argv` 和其他额外参数。
- `owner_verify` 调用 `recordBoundVerification`；运行时只解析当前 V2 task 绑定的 verification ID，并将计划固定 argv 安全引用后执行。
- 抽取并复用 `owner_bash` 的一次性独立 Git 快照、`workspace-write` sandbox 与 `full enforcement` 执行路径；验证执行不会修改真实 Owner worktree 或分支。
- 验证证据记录固定 argv、执行前快照的 SHA-256 `contentDigest`、`exitCode`、`enforcement` 与 `passed`；非 full 或非零退出结果先持久化为负面证据，再拒绝通过。
- V2 Owner result 接收、运行时代提交和 `owner-finish` 均检查当前 task 的全部 required verification：必须 `passed=true`、`exitCode=0`、`enforcement=full`，且证据 `contentDigest` 等于当前 Owner worktree 内容。
- `owner_write` 或 `owner_edit` 改变内容后，当前 digest 与旧证据自动不一致；必须重跑全部受影响验证才能继续提交和完成。
- Owner prompt 与 skill 已说明 V2 必需验证只能使用 `owner_verify`，内容变化后必须重跑。

## TDD 覆盖

- `owner_verify` 工具公开、精确参数集合、必填参数与额外参数拒绝。
- verification ID 必须存在、绑定当前 task，并且 task/Owner/workflow 状态必须匹配。
- 固定 argv 在 owner_bash 同级快照 sandbox 中执行，调用方不能替换命令。
- 缺少 required verification 时拒绝接受 V2 Owner result。
- 非 full enforcement 和非零 exit code 均持久化负面证据，并阻断提交与 `owner-finish`。
- `owner_write` 改变内容后旧结果过期；重跑验证后才允许提交和 `owner-finish`。

## 专项验证

按用户最新指令未启动长时间全量测试，只运行以下三个专项测试：

```text
node --test test/verification.test.mjs
6 passed, 0 failed

node --test test/security.test.mjs
19 passed, 0 failed

node --test test/control.test.mjs
39 passed, 0 failed
```

专项合计：64 passed，0 failed。

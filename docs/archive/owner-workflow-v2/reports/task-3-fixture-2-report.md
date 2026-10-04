# Task 3 fixture-2 修复报告

## 旧失败

命令：`node --test --test-name-pattern='owner-sync 与 owner-finish 可以跨进程退出点幂等结算' test/control.test.mjs`

失败原因：fixture 手工创建的 state 将 `planDigest` 和 `planReviewDigest` 写成了固定值 `digest`，与当前 `plan` 的正式 digest 不一致。运行时在 `validateOwnerStartState` 的计划门禁处拒绝启动，报错为“工作流 wf-owner-finish 的计划内容与 planDigest 不匹配”。

## 最小修复

仅修改 `owner-workflow-plugin/test/control.test.mjs`：

- 为 fixture 创建 workflow branch/worktree，并初始化正式 Owner Registry。
- 通过现有 Registry 提案/批准 helper 登记 `finish-owner`，将当前 Registry 内容 digest 绑定到 state。
- 按运行时正式算法 `sha256(JSON.stringify(plan))` 计算 `planDigest`，并将 `planReviewDigest` 绑定到该值。

没有修改 runtime、registry 或 Runner，也没有弱化 digest 校验。

## 验证

- targeted 旧失败复现：修复前 1 failed；修复后 1 passed。
- `node --test test/control.test.mjs`：23 passed，0 failed。
- `npm test`：151 passed，0 failed。

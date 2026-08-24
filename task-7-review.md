# Task 7 安全代码审查

审查范围严格限定为 brief 指定的 7 个实现/测试文件；未修改实现文件、未提交。

## 结论

- Critical：未发现。
- Important：发现 5 项，均涉及验证证据在特定结算或竞态路径下被错误接受，建议修复后再视为安全完成。
- Minor：未发现独立于上述问题的 Minor 缺陷。

指定测试已运行并全部通过：

```text
rtk node --test owner-workflow-plugin/test/verification.test.mjs owner-workflow-plugin/test/security.test.mjs owner-workflow-plugin/test/control.test.mjs
tests 64
pass 64
fail 0
```

## Important

### I-1：write/edit 只按最终内容摘要判断，回滚到原内容可复用旧验证

位置：

- `owner-workflow-plugin/src/verification.mjs:84-89`：`isVerificationCurrent` 只比较 contentDigest。
- `owner-workflow-plugin/src/runtime.mjs:4317-4339`：`recordOwnerMutation` 记录操作，但没有使已有 verificationResults 失效或增加 mutation epoch。
- `owner-workflow-plugin/src/runtime.mjs:4355-4363`：结算门禁只重新计算当前摘要并调用 `assertPassingVerification`。
- `owner-workflow-plugin/src/runtime.mjs:4435-4500`：owner_write/owner_edit 完成后没有额外的验证代次/写入序列校验。

复现：先在内容 A 上成功执行 owner_verify；执行 owner_edit A→B，再执行 owner_edit B→A；随后走 `commitOwnerAttempt` 或 `finishOwner`。当前摘要重新变回旧摘要，旧结果会通过，尽管 brief/skill 明确要求任何 owner_write/owner_edit 后必须重跑验证。现有 `security.test.mjs:441-512` 只覆盖内容改变后重跑，没有覆盖回滚或 no-op 写入。

### I-2：已 completed 的幂等结算路径完全跳过验证、内容和分支再校验

位置：

- `owner-workflow-plugin/src/runtime.mjs:2893-2900`：`runExternalOwner` 遇到已有 `completed` 记录直接返回旧 result。
- `owner-workflow-plugin/src/runtime.mjs:2927-2969`：锁内再次发现 `completed` 也直接返回，不调用验证门禁。
- `owner-workflow-plugin/src/runtime.mjs:3073-3080`：`finishOwner` 对 `completed` 记录直接返回，跳过 `assertRequiredTaskVerifications`、固定 commit 和 dirty 状态检查。
- `owner-workflow-plugin/src/runtime.mjs:3429-3449`：阶段合并信任已 completed 的记录，只验证提交历史，不重新验证当前 Owner worktree 内容。

复现：一次成功结算后，在 Owner worktree 写入/编辑文件（持久 Owner 会话仍可能绑定 `activeOwners`，也可由并发外部变化模拟），再次调用 owner-finish 或 run-owner。代码返回旧成功结果；通过控制桥时还会继续把 reservation 标记为 completed。`control.test.mjs:1838-1909` 只验证未发生漂移时的幂等重试。

### I-3：验证执行前后没有绑定 plan/revision，也没有把当前 worktree 内容锁在验证临界区

位置：

- `owner-workflow-plugin/src/runtime.mjs:4376-4385`：只在执行前读取 task/verification 绑定。
- `owner-workflow-plugin/src/runtime.mjs:4386-4396`：释放 workflow lock 后在快照中执行。
- `owner-workflow-plugin/src/runtime.mjs:4398-4408`：执行后只比较固定 argv，没有比较起始 revision、planDigest、taskState 版本或起始/结束 worktree digest。
- `owner-workflow-plugin/src/runtime.mjs:4409-4425`：未做当前 Owner worktree 内容确认就持久化并记录日志。
- `owner-workflow-plugin/src/runtime.mjs:4346-4354`：结算门禁只检查 taskState 存在，没有拒绝 stopped/failed 等失败状态。
- `owner-workflow-plugin/src/runtime.mjs:972-974`：摘要来自快照复制完成后的单次读取，非 Owner worktree 的前后双读。

复现：在 `shell.run` 阻塞期间并发改变 state 的 plan 元数据/revision（保持 task id、verify id、argv 不变）或改变 Owner worktree；当前 post-check 仍可记录旧执行结果。也可以在成功结果写入后把 taskState.status 改为 stopped、workflow 保持非-cancelled，再调用 `finishOwner`，门禁不会检查该状态。并发修改内容时，日志可以记录快照上的 `passed:true`，而不是确认日志时 Owner worktree 仍是同一内容。

### I-4：快照执行器没有证明实际 sandboxMode 为 workspace-write，owner_verify 还允许先在非 full enforcement 下执行

位置：

- `owner-workflow-plugin/src/runtime.mjs:940-948`：只检查 `shell.sandboxMode` 属性存在，没有要求其值为 `workspace-write`。
- `owner-workflow-plugin/src/runtime.mjs:975-987`：向 resolver 传入了 workspace-write policy，但没有对 resolver/实际执行模式做独立确认。
- `owner-workflow-plugin/src/runtime.mjs:988-993`：只有 `requireFullEnforcement` 为 true 才在执行后阻断。
- `owner-workflow-plugin/src/runtime.mjs:4390-4394`：owner_verify 明确以 `requireFullEnforcement:false` 执行，非 full 结果只在命令完成后记录为负面证据。

复现：挂载 `sandboxMode:'read-only'`（或其他非 workspace-write）但返回 `sandbox.enforcement:'full'` 的 shell，当前代码仍会运行；挂载 partial enforcement 的 shell，owner_verify 会先实际执行命令，之后才抛错。后续提交门禁确实会拒绝 partial/失败结果，但这不能证明执行期间的隔离已经成立。现有 `security.test.mjs:238-262` 只断言传入的 policy，`868-889` 只覆盖 owner_bash 的返回 enforcement，没有覆盖模式不匹配或 owner_verify 的 partial 执行隔离。

### I-5：验证成功判定忽略 ok、timedOut、aborted 等失败证据，日志可记录伪成功

位置：

- `owner-workflow-plugin/src/verification.mjs:58-71`：`passed` 仅由 `exitCode === 0 && enforcement === 'full'` 决定。
- `owner-workflow-plugin/src/runtime.mjs:988-995`：快照运行结果只特殊拒绝 background 和非 full（条件开启时），不检查 `ok`、`timedOut`、`aborted`。
- `owner-workflow-plugin/src/runtime.mjs:4415-4425`：直接把该 `passed` 写入 `owner.verification` 日志。

复现：让 shell 返回 `{ kind:'foreground', ok:false, timedOut:true, aborted:true, exitCode:0, sandbox:{enforcement:'full'} }`。当前结果为 `passed:true`，日志也为 `passed:true`，且后续验证门禁会接受。现有测试 `verification.test.mjs:109-123` 和 `security.test.mjs:313-388` 只覆盖非零 exitCode 与 partial enforcement，没有覆盖这些不一致结果。

## 已确认的安全点与 V1 证据

- 固定 argv 正常路径未发现调用方注入：`index.js:195-223` 拒绝额外参数；`runtime.mjs:4379-4394` 从当前任务目录解析绑定验证；`verification.mjs:112-124` 只把绑定 argv 交给快照执行器。`verification.test.mjs:50-63` 通过了伪造 argv 参数不会被执行的测试。
- 失败/partial 的普通路径会持久化 `passed:false` 并被结算门禁拒绝：`verification.mjs:92-109`、`runtime.mjs:4361-4363`、`runtime.mjs:4427-4432`；对应安全测试通过。
- V1 未发现验证门禁意外套用：`runtime.mjs:4341-4342` 对非 `DSH_PLAN_V2` 直接 no-op，`runtime.mjs:1178-1193` 仅在 V2 分支要求 task API；`control.test.mjs:1838-1909` 的 V1 owner-sync/owner-finish 幂等结算通过。

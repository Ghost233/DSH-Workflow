# Task 7 安全修复报告

## 当前结论

DONE。I-1～I-5 均已修复，三组专项测试全部通过。

## 已完成的 TDD 红绿循环

- I-1：先加入“回滚到原内容”和“写回相同内容”测试，运行得到 `Missing expected rejection`；随后为 V2 task 增加持久化 `writeGeneration`，每次成功 `owner_write/owner_edit` 递增，验证证据必须匹配当前代次。两项定向测试通过。
- I-2：先扩展 V1 `owner-finish` 幂等测试，在已完成后修改 Owner worktree，运行得到 `Missing expected rejection`；随后幂等返回前校验固定 commit、Owner branch、worktree 根目录、忽略文件和工作树干净状态，并复核 V2 验证门禁。定向测试通过。
- I-3：先加入验证执行期间修改计划 revision、计划内容和真实 worktree 的测试，运行得到 `Missing expected rejection`；随后加入执行前后计划摘要、revision、任务/Owner/session binding、写入代次和真实 worktree digest 的一致性检查。定向测试通过。
- I-4：先加入 `shell.sandboxMode=read-only` 的测试，运行得到 `Missing expected rejection`；随后在创建快照前要求 `shell.sandboxMode === 'workspace-write'`。定向测试通过。
- I-5：先运行宿主失败证据回归测试，确认当前实现丢失 `ok/timedOut/aborted/kind` 且会错误生成 `passed:true`；随后扩展结果证据并让 `parseVerificationResult`、`assertPassingVerification` 和 `runBoundVerification` 共同校验/传递这些字段。定向测试通过。

## 专项测试证据

运行：

```text
node --test owner-workflow-plugin/test/verification.test.mjs owner-workflow-plugin/test/security.test.mjs owner-workflow-plugin/test/control.test.mjs
```

结果：

```text
tests 71
pass 71
fail 0
```

## I-4 负面证据策略

固定验证执行前强制 `shell.sandboxMode === 'workspace-write'`。执行后只有 `enforcement === 'full'`、`exitCode === 0` 且宿主证据没有失败标记时才生成 `passed:true`。partial/non-full 结果仍先持久化为 `passed:false` 并写入 `owner.verification` 审计日志，再由运行时拒绝通过；这是保留审计证据的明确设计，不因抛错而丢失负面结果。后台宿主同样保存负面证据后拒绝，普通 `owner_bash` 仍直接拒绝后台执行。

## I-5 证据字段

结果现在保留并验证 `ok`、`timedOut`、`aborted`、`kind`。任一 `ok:false`、`timedOut:true`、`aborted:true` 或 `kind:'background'` 都必定为 `passed:false`，解析/断言拒绝其成为通过证据，日志和结算门禁也拒绝通过。既有“写入代次”错误断言已同步放宽。

## 范围

只修改了 Task 7 允许范围内的实现/测试文件，并新增本报告；未修改 `deepseek-harness/`，未提交 Git commit。

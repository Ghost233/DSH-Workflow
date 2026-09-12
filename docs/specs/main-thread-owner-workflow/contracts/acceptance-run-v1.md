# DSH集中验收运行合同V1

## 目的

集中验收负责在同一固定候选上尽可能收集完整证据。它与Owner提交关卡分离：Owner验证失败仍阻止该Owner提交；集中验收中一个验证项失败，只阻止真实依赖它的项，其他独立项继续运行。

## 固定候选

`DSH_ACCEPTANCE_CANDIDATE_V1`必须绑定：

- `candidateId`与`workflowId`；
- `planningSnapshotDigest`与`planDigest`；
- 完整`codeCommitSha`与当前`contentDigest`；
- Spec的ID、revision、digest；
- 至少一个Ticket的ID、revision、digest。

每个实际执行结果必须回传相同`codeCommitSha`和`contentDigest`。任一变化记为`stale_candidate`，旧结果不能用于当前通过判定。

## 验证图

每项声明稳定ID、标题、固定argv、仓库相对cwd、timeout、`node-test`适配器和`dependsOn`。未知依赖、自依赖、环和空命令在任何执行前拒绝。显式不适用使用`skip` disposition；计划内但环境尚未提供的项使用`not_run` disposition并附原因，不能从清单中静默删除。

执行按稳定拓扑序进行。依赖项只有全部`passed`才可运行；否则当前项记录`blocked`及具体前置状态。无依赖项不受其他失败影响，继续执行并保留各自原始输出。

## 结果分类

每项输出`DSH_ACCEPTANCE_ITEM_RESULT_V1`：

| 状态 | 含义 |
| --- | --- |
| `passed` | 候选绑定一致、进程成功、Node摘要可解析、用例数大于零且没有失败/取消/全跳过 |
| `failed` | 非零退出、报告失败用例或执行器错误 |
| `timed_out` | 已启动执行超过该项固定timeout |
| `cancelled` | 已启动执行收到取消，或执行器在取消中结束 |
| `skipped` | 显式不适用，或Node报告全部用例跳过 |
| `blocked` | 真实前置没有passed，当前命令没有执行 |
| `zero_tests` | 命令成功但Node明确报告零用例 |
| `not_run` | 计划中有该项，但在启动前取消或显式环境缺失 |
| `evidence_incomplete` | 命令成功但无法确认Node用例数 |
| `stale_candidate` | 执行证据的代码commit或内容digest不再匹配候选 |

结果保留固定argv、cwd、候选绑定、exit code、timeout/cancel事实、最多64KiB的stdout/stderr及截断标记、Node用例汇总和阻塞来源。`DSH_ACCEPTANCE_RUN_V1`汇总全部分类；只有所有计划项均为`passed`时整体为passed。

## 当前适配边界

V1只适配Node内置test runner的终态摘要，包括`# tests N`与`ℹ tests N`格式。不解析任意测试框架，不根据exit code 0猜测用例存在。其他框架后续必须增加显式适配器及真实入口测试，不能复用`node-test`名称伪装支持。

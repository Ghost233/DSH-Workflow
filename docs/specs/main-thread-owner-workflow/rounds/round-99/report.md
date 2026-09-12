# R99 T11合同验证与T12集中验收入口实现报告

## 结论

T-11确认现有Owner固定验证适合作为提交安全门禁：它绑定argv、cwd、contentDigest、exitCode和宿主timeout/abort证据，并在首项失败时拒绝Owner提交。它没有集中验收所需的验证依赖图、Spec/Ticket/代码commit候选绑定或标准用例计数。

T-12已实现包级`./acceptance-runner`入口及[集中验收运行合同V1](../../contracts/acceptance-run-v1.md)。B05/F6生产切片关闭，全部31张工单均已解除前置并完成开发或局部验收，下一步直接运行CA-01。

## 行为

- `DSH_ACCEPTANCE_CANDIDATE_V1`绑定workflow、planning snapshot、plan、代码commit、内容digest及Spec/Ticket修订摘要。
- 验证项形成无环DAG；未知依赖、自依赖、环和空命令在执行前拒绝。
- 一个验证失败后，无依赖项继续执行；依赖该失败的项不启动并记录`blockedBy`。
- 结果区分`passed`、`failed`、`timed_out`、`cancelled`、`skipped`、`blocked`、`zero_tests`、`not_run`、`evidence_incomplete`和`stale_candidate`。
- Node test命令exit 0仍必须解析到大于零的用例数；零用例和计数缺失均不通过，全跳过单独分类。
- 每项保留固定argv/cwd、候选绑定、exit code、timeout/cancel事实、测试汇总及最多64KiB原始stdout/stderr和截断标记。
- 包`exports`公开`./acceptance-runner`供CA-01采集脚本直接复用；Owner提交实现未改。

## 验证

真实Node组合入口先执行失败用例，随后独立通过项仍运行；依赖项blocked。相同运行还验证进程timeout、已启动取消、空目录零用例、显式skip/not_run及无法解析计数。另有候选digest漂移和图结构拒绝用例。

定向回归34/34通过，包含acceptance runner、固定verification、owner submission和插件注册边界。结果见`test-results.json`。

## 保留边界

V1只适配Node内置test runner摘要，不声称支持其他框架。CA-01尚未运行，T-11/T-12开发完成不等于AC-19/25验收通过。

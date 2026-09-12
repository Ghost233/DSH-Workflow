# 第12轮证据：T-13纯恢复预算账本

候选为当前工作区新增纯模块及测试，不以Git HEAD冒充未提交源码。[起始记录](baseline.json)包含四仓HEAD/分支/原有修改和原64项源码/测试/依赖产物摘要；[冻结候选](candidate.json)另纳入新模块、新测试与[接口说明](../../contracts/recovery-budget-v1.md)，共67项。已有64项没有变化，本轮未重建依赖或接入Runtime。

[本轮差异](round.diff)只含两个新增源码/测试文件和接口说明。正式测试使用固定Node v24.12.0和工作区当前源码，采集脚本见[test-runner.py](test-runner.py)。

## 开发阶段证据

- [首次定向](development-worker-1.log)：23项中22通过、1失败；首尾空白ID未拒绝。源码修复后，[第二次](development-worker-2.log)23/23通过。
- 主线程源码核对发现证据引用的全Workflow唯一约束过严，要求改为根问题内去重，允许共享核验事实各自支持多个根问题。此修正发生在正式冻结前，未改请求/attempt绑定或额度规则。
- [第三次定向](development-worker-3.log)：当时24项全部通过；随后主线程完成共享事实多根问题正例，[最后定向](development-root.log)25/25通过。[最后命令及时间](development-root-run.json)完整保留。测试数变化来自新增正例，不是移除失败项。

## 正式结果

| 套件 | 通过 | 失败 | 跳过 | 原始输出 |
| --- | --- | --- | --- | --- |
| recovery-budget | 25 | 0 | 0 | [日志](formal-recovery-budget.log) |
| convergence | 24 | 0 | 0 | [日志](formal-convergence.log) |
| model | 51 | 0 | 0 | [日志](formal-model.log) |
| plan-revision | 7 | 0 | 0 | [日志](formal-plan-revision.log) |
| workflow-state | 11 | 0 | 0 | [日志](formal-workflow-state.log) |

合计 **118通过、0失败、0跳过**，0取消/待办/超时。每个独立套件外层60秒，串行采集，失败仍继续其他套件。具体命令、起止时间、退出码与候选版本见[test-results.json](test-results.json)。冻结后没有修改源码、测试或接口说明，候选无漂移。

这是纯模块及相关合同回归，不是全仓/真实Runtime预算验收。本轮没有生产入口消费者变化，因此未重复control/security等实际执行套件；前轮实际预算缺口仍由T-14至T-19承接，不能因本轮全绿称其已解决。

只读审查另确认F-14/P2，见[independent-review.md](independent-review.md)及[诊断观察](review-probe.json)。不修改正式118项结果，也不将该未被正式用例覆盖的缺口记为已通过。

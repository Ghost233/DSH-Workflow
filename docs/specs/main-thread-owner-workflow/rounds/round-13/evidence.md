# 第13轮证据：T-13 / F-14

来源R4-V03-1、T-13，范围为跨字段回执唯一归属及受影响纯合同回归。当前工作区直接测试；未改Runtime或外部依赖。

## 候选与开发验证

[基线](baseline.json)保存四仓HEAD/分支/原有状态和67项内容指纹；仅recovery-budget.mjs与其测试发生候选变化，[本轮差异](round.diff)按第12轮实际文件内容比较，不用HEAD代替未提交来源。原文件副本保留在本目录的.before文件中。[固定候选](candidate.json)记录正式测试前67项指纹及时间。

[开发反例](development-red.log)：旧实现30项中26通过、4失败，两个调用顺序与两个导入顺序均未拒绝非法引用。[首次修复后](development-green.log)30/30通过；补同字段拒绝正向保障后，[最终定向](development-final.log)32/32通过。均使用Node --test --test-force-exit，外层60秒；没有移除失败断言。

## 正式结果

| 套件 | 通过 | 失败 | 跳过 | 原始日志 |
| --- | --- | --- | --- | --- |
| recovery-budget | 32 | 0 | 0 | [日志](formal-recovery-budget.log) |
| convergence | 24 | 0 | 0 | [日志](formal-convergence.log) |
| model | 51 | 0 | 0 | [日志](formal-model.log) |
| plan-revision | 7 | 0 | 0 | [日志](formal-plan-revision.log) |
| workflow-state | 11 | 0 | 0 | [日志](formal-workflow-state.log) |

合计125通过、0失败、0跳过、0取消/待办/超时。独立套件串行采集，失败继续；[运行器](test-runner.py)与[完整命令/时间/退出码](test-results.json)留档。冻结后不修改源码、测试或接口合同。未执行全仓/Runtime/持久事务验收：模块还没有Runtime消费者，相关工作由T-14以后承接。

# R98只读复核

## 规格轴

T-10要求的两个故障点已经分离。封存失败保持`awaiting_finish`，摘要失败保持代码completed；恢复只消费持久fixed SHA与封存回执。缺失来源用例明确证明实现不会从报告或空worklog重新生成历史。T-31范围直接对应B-06和AC-22/23，没有吸收T-11/T-12或CA-01。

## 正确性轴

恢复入口位于`finishOwner`现有workflow锁和Owner lease内。它先执行已完成记录校验，然后校验sealed worklog、Git blob和两个digest；代码提交只检查祖先关系，不再次进入merge分支。Memory提交无dirty变化时复用HEAD，覆盖提交已发生而状态未保存的中断窗口。失败路径只更新deferred错误与attempt，不降级代码状态，不删除worklog。

## 风险与结论

旧版已经落盘但缺少新封存digest的deferred记录会关闭处理并报告“封存回执不完整”，不会静默迁移或猜测历史。这是有意的兼容边界。定向和受影响回归零新增失败后，本轮可标记T-10/T-31开发完成及B06/F5生产切片关闭；CA-01仍未验收。

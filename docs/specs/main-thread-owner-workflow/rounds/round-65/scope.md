# R65：候选恢复拒绝的持久暂停

T15实际daemon workflow-drive错误投影。主线程独占代码/测试/文档，代理只读审查。候选恢复不可重试错误保存稳定来源及幂等mainOutbox；控制器先投递一次后等待，重开Runtime/daemon不能清空暂停。已结算语义失败仍允许下一计费ordinal，不误停有限恢复；真实用户依据优先。新候选/执行操作或回执状态改变解除旧暂停。

本轮不实现原始JSONL变化的主动观察器，也不新增暂停期间独立Owner的调度路径；保持已运行Owner的现场不重置。无候选初始handoff拒绝另待接线。正式候选pause、rebuild、Review、workflow-state、control。

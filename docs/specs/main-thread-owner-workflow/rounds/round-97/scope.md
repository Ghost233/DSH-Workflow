# R97 范围：T30公共决定到PlanRevision与消费者生命周期

本轮只实现T30/B03-2。输入为T28持久公共Owner决定会话、T29统一准入和T27 PlanRevision激活事务；输出为权威决定绑定、公共实现节点、消费者合同/顺序依赖及可重放激活。

不修改业务要求，不把`rejected`、`facts_missing`或`business_decision_required`转换成代码任务，也不运行CA-01集中验收。T10、T11、T12及B05/B06继续按原工单推进。

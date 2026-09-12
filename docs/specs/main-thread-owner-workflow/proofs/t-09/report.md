# T-09 技术验证第1轮：现有恢复计数不能充当持久总预算

日期：2026-09-10。结论：**否定现有实现满足R4恢复预算合同的假设**。现有代码能在固定事实下耗尽策略，但尚未实现问题级/Workflow级的持久尝试上限。T-09标记**开发完成（技术验证产物）**，产出是可复现的否定结论和实施合同建议，不是AC-11/20/24/31通过。

## 候选、方法与证据

生产源码沿用第11轮64项固定候选，全程未修改生产或正式测试。起始四仓状态见[baseline.json](baseline.json)，生产和探针冻结摘要见[freeze.json](freeze.json)。主线程负责探针与文档，独立代理只读审计预算、继承和超时。

[正式结果](formal-results.json)：两组探针**8场景完整采集、0装配错误**；3项现有超时回归通过、0失败、0跳过。三个进程均有60秒外层上限，0超时；候选无漂移。这是“证据采集成功”，不能记为8项生产预算合同通过。未重复全仓测试，也未将上轮308项再次计入本轮。

[恢复探针](probe.mjs)每场景最多8步，每步新建Runtime并读取同一临时状态；在真实recoverOwner进入runExternalOwner之前用哨兵中断，并记录该时刻已落盘状态。没有执行模型尝试，`launched`字段表示到达启动边界的次数。重建Runtime是重启模拟，不是SIGKILL/断电、fsync或跨进程锁验证；生产并发原子事务尚无合同，未以此假称已测。

[边界探针](boundaries.mjs)执行真实Composite展开/PlanRevision状态迁移函数和实际Supervisor超时控制入口。拆分只验证函数接缝，不是B-01在线版本激活。文件事实由真实文件字节计算hash后放入受控持久事实投影，未测试生产事实收集器；Owner取消使用未完成的可控Promise与真实租约，不代表真实在线模型被取消。

## 观察与判定

| 场景 | 实际结果 | 支持的结论 |
| --- | --- | --- |
| 相同错误/事实，每步重建Runtime | 3次到达启动边界，第4步autonomous_incident；attempt与recoveryCount仍1 | 策略状态可跨Runtime保留，但计数不是尝试账本 |
| 启动前中断后重复恢复，没有新失败结果 | 同一attempt再到启动边界共5次，第6步incident；recoveryCount为2 | 没有同一恢复请求/attempt的幂等领取协议；既有策略可能在任务未执行时耗尽 |
| T2独立文件事实每步变化 | 有界8步均local_subgraph_rewrite，恢复计数仍1 | 全局事实摘要会重新开放T1策略，无问题关联和累计上限保护 |
| T1的A/B两份旧内容交替回放 | 有界8步均local_subgraph_rewrite | 仅与上一摘要比较会把旧事实回放当变化，没有总预算兜底 |
| onFailure.maxAttempts=1 | 仍3次到启动边界，第4步incident | 旧策略字段不能当作执行恢复上限；现有测试也将它解释为提示 |
| Composite展开与版本迁移 | parent保留usedStrategies；T1A/T1B只有parentTaskId和新pending状态，无共享预算引用 | 结构父子关联存在，预算继承合同缺失；不证明在线版本事务结果 |
| 超时且cancel Promise尚未完成 | task先pending，取消调用1次，真实Owner租约仍有效，入口已返回 | 重新排队不等于取消结算/资源释放；硬上限需要独立停止阶段 |
| 运行起点4小时前，60秒超时，当前心跳 | task仍running，无取消，仅wait-timeout | 当前是可续期空闲超时，不是单次不可延展硬截止 |

完整逐步状态、时间及错误保存在[formal-recovery.log](formal-recovery.log)与[formal-boundaries.log](formal-boundaries.log)。观察到8步继续不等于实际运行无限次；结合源码“摘要变化清空usedStrategies且无两级累计额度检查”，才能推断此路径不提供有限总上限。

有一个正向边界需要保留：相同事实最终停止T1后，虽然Workflow状态为blocked，实际supervisor-next仍给T2 create，supervisor-ack成功生成reserved回执。探针禁止后续自动启动，仅证明T2领取资格；**不能根据blocked字样断言无关任务一定被全局阻塞**。

## 根因与实施要求

V03-01：Runtime恢复使用 `workflowEvidenceDigest` 这个全局诊断摘要重置策略，替代了按稳定问题关联的单调预算。`convergence.mjs:410/1145`、`runtime.mjs:12895/13010`体现这一连接；T-03在规划审查的进展校验不能替代执行恢复的独立预算。

V03-02：领取前虽会落盘attempt、策略或遥测计数，但没有问题级与Workflow级余额检查、幂等attempt领取和结算事务。重复回执/真正并发扣减/断电恢复未证明；不能把“先saveState”直接等同两级原子扣减。

V03-03：Composite的parentTaskId与版本迁移新状态没有预算继承身份/映射；新增执行段会创建新任务记录。B-01事务必须承接rootProblemId及账本引用，不能仅在Markdown里说明继承。

V03-04：当前超时基线取开始/恢复/心跳中较新者，取消请求不等待结束，再排队时旧lease可能仍有效。需要固定deadline及stopping→settled生命周期；不通过增加重试/等待次数掩盖问题。

可实施接口、幂等与失败边界、有限试验值和旧配置兼容见[拟议合同](proposed-contract.md)。它拒绝直接沿用现有策略集合充当持久预算；不预设全仓重构，也未改生产配置。

## 测量与局限

正式5组恢复场景（每组含临时Git初始化及多次Runtime重建）约0.72–0.80秒；结构迁移约0.54秒，两个超时注入约0.27/0.33秒。4小时起点是注入时间，不是实际等待4小时。现有3项超时回归保持通过，只证明旧空闲超时行为。毫秒级本地夹具不能校准在线模型成本、质量和生产默认值。

开发阶段曾把Composite kind写成不支持的unknown，首轮边界采集1项装配失败；已改为合法composite后重新定向，再冻结正式采集。原始[首次日志](development-boundaries.log)和[纠正后日志](development-boundaries-2.log)保留，不把装配错误当产品缺陷。正式后未修改探针或源码。

独立只读结论见[independent-review.md](independent-review.md)。B-04和CA-01仍阻塞，持久预算生产行为未验收；下一步需按拟议合同细化实现工单及版本/计量接缝。本轮不自动实施修复，不提交或推送。

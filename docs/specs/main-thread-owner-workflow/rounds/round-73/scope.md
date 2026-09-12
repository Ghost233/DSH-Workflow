# R73：daemon 自动派发独立任务

T15：已投递有效候选暂停仍有独立任务时，控制表与真实 workflow-drive 接入专用领取/执行；持久 reserved 无Owner历史可恢复，launching/未知历史不重发。首次 daemon 执行按workflow串行以避免共享merge/Memory事务碰撞；并行能力后续不能以此替代验收。只写目标投影，技术失败不改来源预算，用户权限优先等待。

主线程拥有Runtime、selector、控制表、selector测试与合同/证据；worker拥有candidate-independent-runtime和candidate-recovery-pause测试。正式范围：独立Runtime、selector、candidate pause、workflow-state、runner、control、Memory；每套180秒串行，真实内层隔离。冻结后只读复审。

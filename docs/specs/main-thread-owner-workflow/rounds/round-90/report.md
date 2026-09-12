# R90：PlanRevision 权限失效接入安全停止

活跃版本激活不再对带T17 attempt control的权限失效Owner立即删记录、强行失效lease并异步取消。激活事务现在先持久 `stopping`、`revisionStop`、cancel request和完整旧身份；仅向匹配attempt/session/token/generation的活动child发取消。取消目标不可核验时，新版本仍完整发布，但相关任务有限停在`termination_unconfirmed/inspect_runtime`，同Owner和新任务不会抢跑。

原执行或fresh Runtime读到匹配session terminal后，才把带settled receipt的旧ownerRun归入history、删除旧reservation，并把新版本中仍存在的任务恢复为pending。旧session在激活落盘后调用completion admission会在任何检查、验证或commit之前被generation/phase门禁拒绝。任务从新DAG删除时同样保留并停止旧ownerRun；terminal后只归档，不创建不存在的新任务。

无T17 attempt control的legacy记录保留原兼容归档路径，避免伪造历史deadline；默认迁移策略仍归T19。恢复attempt跨版本时的根问题和T13账本继承继续由T18门禁保护。

最后候选补齐任务删除和真实跨进程边界：旧Owner子进程在激活前读取并持有原attempt/session/token/generation，父进程发布删除该任务的PlanRevision后，旧进程再提交会在任何检查、验证、commit前被拒绝；第三个fresh Runtime进程读取同一状态和terminal，归档settled旧记录且不复建已删除任务。

固定回归：planning-compile-native 12/12、plan-revision 10/10、owner-attempt-control 6/6、owner-hard-deadline 6/6、control 159通过/7既有legacy跳过，合计193通过、0失败。T27开发完成，T18前置解除；跨版本恢复账本继承不在本轮实现。

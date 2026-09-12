# R91：T18 执行版本继承完成

真实 PlanRevision 激活现在先校验持久恢复账本，再构造 `DSH_RECOVERY_EXECUTION_TRANSITION_V1`。每条边固定父/子计划 digest、父/子 revision、触发请求和 root 的 source task/Owner 到目标 task/Owner 映射。计划、当前恢复配置版本和新边在同一次 Workflow 状态保存中发布；父版本竞争、缺恢复请求、开放 root 无目标、目标冲突、断链或不存在的 root 均在计划写入前拒绝。

`recoveryAdmission.executionVersion` 保留为账本起始版本，旧 sources、intents、attempts、problem used 与 workflow totalUsed 不改写。当前版本由 `recoveryAdmissionConfig.executionVersion` 和从起始版本连续到当前版本的边链共同证明。新版本的同 ID task、显式 composite child、改名任务和所选跨 Owner handoff 目标通过映射继承同一开放 root；连续第二轮 PlanRevision 继续沿同一链传递，不能通过新 task ID 或 Owner 获得新问题额度。

旧版本的新领取请求在版本门禁拒绝。已经启动的旧恢复 attempt 仍以原 intent/session/prompt/lease/generation 读取 terminal 并结算一次，不新扣、退款或改写来源；普通旧 Owner 的迟到提交继续受 T17/R90 门禁约束。两个独立 Runtime 并发领取拆分与跨 Owner 目标时，持久锁只登记两个新 attempt，仍共享一个 root 和同一 Workflow 总额。

正式候选共448项通过、7个既有legacy跳过、0失败。T18固定套件覆盖同父并发批准、历史不可变、split/rename/Owner移交、连续版本、缺来源、篡改边、fresh Runtime重启与旧运行attempt结算；恢复会话、预算、hard deadline、PlanRevision、统一控制及候选会诊/仲裁/独立执行路径一并回归。完整结果见 [test-results.json](test-results.json)，合同见 [recovery-execution-transition-v1.md](../../contracts/recovery-execution-transition-v1.md)。

T18状态更新为开发完成，F9关闭。T19逻辑前置解除并转为待办；B04、B03和CA01仍未完成。

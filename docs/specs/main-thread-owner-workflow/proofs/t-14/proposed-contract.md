# T-14 拟议持久恢复适配前置

状态：技术验证回填草案，未启用生产协议。T-13纯账本结构继续沿用DSH_RECOVERY_BUDGET_V1，不把以下拟议运行状态塞进现有纯账本冒充已实现能力。T-15需要这些接缝的正向证据，报告存在或部分探针通过不能解锁。

## P14-A：持久来源与领取事务

最小责任边界是一个由Runtime调用的持久领取适配器。输入是已核验Workflow/执行版本、有效义务或首次失败来源、task/Owner以及调用意图；不能允许模型自报新的rootProblemId获得新账户。

在同一持久临界区读取最新状态，核验来源记录和当前未关闭问题映射，登记或复用root；分配或复用requestId/attemptId，再调用T-13扣减，连同待启动执行身份保存。来源可使用现有有效义务绑定；首次失败需新增不可变的Runtime来源记录，保留到关闭之后。不同调用入口到同一恢复意图的映射也需稳定，不能每进一个入口便生成新请求。普通revision冲突与锁竞争只回到读取/对账，不能把旧计算结果拿去启动或再扣。

候选代码接缝是runtime.mjs的saveState(..., prepareState)，回调读取锁内current；withWorkflowLock仅为同进程串行，不能独立作为跨进程事务保证。具体适用/失败行为以storage正式证据为准。生产适配必须消费该受保护快照，禁止先在锁外算余额后用保存锁掩盖竞态。

## P14-B：预留会话和prompt回执对账

需要在任何可能启动工作的调用前固定并持久化会话身份，将request/attempt/plan/task/Owner/session绑定贯通runChild、ownerWorkflowChildProvider及实际Harness会话后端。现有随机session/prompt ID不能承担这个合同。

恢复时区分：明确尚未创建、已创建但尚未提交prompt、prompt已接纳运行中、已有终态结果、无法确定。查询需核对来源/执行版本/lease与持久事件；不能只看进程是否存在或某文件是否缺失。已存在会话按真实resume/结果收集接口恢复，不在新session重复提交原prompt。create采用lazy持久化，首append前无磁盘文件不证明create没发生；查询无法确定时保留扣减和身份，只暂停受影响执行，不退款、不盲目再派。

不能仅把randomUUID换成确定性ID后声称恰好一次：prompt接纳和其结果持久化间的窗口同样要有稳定消息身份、可查回执或明确拒绝自动重放。session/probe.mjs只证明底层直接重放仍新建身份；真实create/resume/persistence联合验证尚未完成。

## P14-C：边界证明与后续范围

实现P14-A/B后，使用实际Harness持久后端和受控执行者验证：保存前后、create接纳前后、首append、prompt接纳、结果回执前后SIGKILL；争抢最后额度、同请求并发、旧lease/旧version、损坏数据与不确定会话。必须保留不确定时拒绝启动和无关任务仍可执行的证据。

本轮不修改上述生产接口。下一步先将P14-A/B细化为有明确写入归属的实现前置，再复验T-14未证明的边界；通过后T-15接入所有恢复入口。T-16/T-17继续负责取消、硬截止和lease释放；P14不是取消机制的替代物。不设生产默认预算，不迁移legacy。

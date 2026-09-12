# R75：恢复仲裁预算绕过

旧runtime真实证据：预算已用1/1，直接arbitratePendingPlanRevision仍新增3次实际模型请求，totalUsed保持1；分别为Owner会诊和有限Reviewer尝试。原始运行runtime SHA、日志及执行代码保留在development-pre-gate.log/pre-gate-proof.test.mjs。

已确认的恢复候选仲裁预算绕过已封堵。直接仲裁在会诊前拒绝；Owner会诊核验传入与当前持久状态，拒绝删标记副本降级，且拒绝不被内部unavailable降级吞掉。非恢复初始会诊保持实际模型调用。复审最终无确认P1/P2。

正式五套199通过、7既有跳过，无失败/超时/漂移。真实post-gate四场景包括：直接拒绝零写、真实付费Planner+needs_revision Review后2/2经driver进入仲裁门禁并持久技术暂停、剥离传入副本仍拒绝、初始会诊保持一次调用。主线程通知独立计数：通知完成后请求4→5，后续等待保持5。

开发首轮driver夹具没有Review，只到普通Review预算拒绝，不能证明仲裁；原失败和诊断保留，改真实已付费Review后4/4通过。

初审曾将初始会诊检查后出现恢复候选的并发窗口标为P2，复查后撤回：旧初始工作不因此成为恢复operation；同Runtime workflow lock、候选不存在前置与saveState revision CAS阻止旧输出成为恢复候选。跨进程陈旧初始工作是否及时停止属于既有隔离边界，不是本轮恢复预算绕过证据。

T15仍开发中。此为临时能力门禁，不能当作仲裁完成；下一步按metered-arbitration-path.md实现逐OwnerAdvice持久预算/session/回执，再连接独立仲裁Review。尚无仲裁有余额时正向完成证据。

无commit/push/fetch、无分支切换或同步，保留全部既有工作区文件。根main对缓存tracking为0/0；deepseek-harness master缓存behind3364、vendor main缓存behind4、dsh-synapse detached，非实时远端一致性声明。

# R100 CA01 AC-01至AC-32证据矩阵

固定候选为[`CA01-R100-fac087e62075`](candidate.json)，集中结果见[`test-results.json`](test-results.json)。表中“R100项”对应`acceptance-plan.json`中的稳定验证项；局部轮次用于说明故障注入来源，最终判定以同一R100源码内容摘要上的重跑结果为准。

| AC | R100项 | 核验行为 | 结果 |
| --- | --- | --- | --- |
| AC-01 | planning-foundation、convergence-revision-control | 普通讨论/文档维护不产生执行现场，主代理开发守卫与授权来源分离 | 通过 |
| AC-02 | planning-foundation、planning-activation | DAG前原生文档可写；没有完整Ticket/授权/审查时不激活执行版本 | 通过 |
| AC-03 | planning-foundation、planning-activation | Spec→Ticket→单Owner包→独立审查→激活按固定来源依次完成，原授权可重放 | 通过 |
| AC-04 | planning-foundation | 执行包只有一个Owner并保留完整Ticket、AC及合同片段 | 通过 |
| AC-05 | public-owner-protocol、representative-sab-k1-k2 | A请求由S独立判断；K2兼容扩展保持B的K1恢复承诺 | 通过 |
| AC-06 | public-owner-protocol | 缺版本、证据、消费者或未知引用明确拒绝且不解锁消费者 | 通过 |
| AC-07 | scheduler-resource-lifecycle | 不同Owner按容量并行；同Owner、超容量及consultation reservation明确排队 | 通过 |
| AC-08 | scheduler-resource-lifecycle、history-git-replay | 同资源与同公共Owner只有一方获准；Git scope、历史提交和保护路径均复核 | 通过 |
| AC-09 | scheduler-resource-lifecycle、representative-sab-k1-k2 | K2公共实现完成并验证后才放行A消费者；缺绑定计划拒绝激活 | 通过 |
| AC-10 | convergence-revision-control、history-git-replay | exitCode 127/command-not-found保持`runtime_environment`及原始验证失败证据，不转业务决定 | 通过 |
| AC-11 | bounded-recovery、convergence-revision-control | 合同/实现偏差在原根问题与有限策略中修复，不重写整图 | 通过 |
| AC-12 | planning-activation、convergence-revision-control | 局部PlanRevision、受影响重检、无关结果保留及版本摘要传播 | 通过 |
| AC-13 | public-owner-protocol | `business_change`形成主线程决定；未回答时受影响变更停止、其他容量可用 | 通过 |
| AC-14 | convergence-revision-control | 只接受结构化业务差异或外部权限；技术关键词不触发用户授权 | 通过 |
| AC-15 | convergence-revision-control、bounded-recovery | 近义文本、时间、会话、HEAD变化不重置进展或预算，恢复有界 | 通过 |
| AC-16 | convergence-revision-control | Reviewer遗漏/passed不能关闭旧义务，只有当前Runtime证据或有来源决定可关闭 | 通过 |
| AC-17 | planning-activation、bounded-recovery、history-git-replay | handoff/版本切换先停止旧attempt；旧回执、迟到提交和重放不覆盖新版本 | 通过 |
| AC-18 | planning-activation、representative-sab-k1-k2 | K1/K2证据按PlanRevision和消费者合同分别绑定，不混用通过结果 | 通过 |
| AC-19 | acceptance-classification及本次集中运行 | 实际脏候选以HEAD＋10431文件内容摘要固定；独立失败继续、依赖阻塞、超时/取消/零用例/未运行/漂移均有分类自验 | 通过 |
| AC-20 | bounded-recovery、convergence-revision-control | 授权范围内技术缺陷自主进入有限修复，业务AC与预算保持 | 通过 |
| AC-21 | scheduler-resource-lifecycle、bounded-recovery | 取消/截止先持久stopping并fence旧提交；待结算不占无关执行槽位，同Owner/资源仍排他 | 通过 |
| AC-22 | history-git-replay、bounded-recovery、representative-sab-k1-k2 | fixed SHA、持久回执与fresh Runtime重放幂等，不重复提交或双写 | 通过 |
| AC-23 | history-git-replay | sealed worklog保留原因/版本/来源摘要；Memory延后只重试摘要，来源缺失不补造 | 通过 |
| AC-24 | bounded-recovery、convergence-revision-control | 两级账本、开始前扣减、失败结算与技术报告在上限后终止问题并保留现场 | 通过 |
| AC-25 | 全部10项 | 10/10项、1114用例完成；实现/局部验收/最终交付分开记录，未提交、推送或发布 | 通过 |
| AC-26 | planning-foundation、platform-security-ui | 主线程在DAG前只可写约定Markdown；代码、状态、治理、链接及子代理越界拒绝 | 通过 |
| AC-27 | planning-foundation、planning-activation | 原生写入来源、alternate index、Git checkpoint、不可变快照及授权重放完整；混入无关修改拒绝 | 通过 |
| AC-28 | planning-activation、bounded-recovery | 同父竞争仅一个激活；崩溃阶段恢复、后到反馈保留、重复激活不重复提交 | 通过 |
| AC-29 | public-owner-protocol、representative-sab-k1-k2 | K1上下文变化使旧决定失效；同版本幂等，缺消费者事实不能判兼容 | 通过 |
| AC-30 | planning-foundation | Git预检后别名绝对路径、真实路径、相对路径同一身份；内部链接与兄弟项目继续拒绝 | 通过 |
| AC-31 | bounded-recovery、convergence-revision-control、planning-activation | 重启、拆分、改名、跨Owner及重复证据继承同一根预算；上限后停止问题且无关工作可执行 | 通过 |
| AC-32 | convergence-revision-control、planning-activation | passed Review仍经旧义务激活守卫；无关闭证据时拒绝执行批准 | 通过 |

## 跳过项处理

21个skip全部在名称中明确标注“旧版”及当前替代入口：7项来自旧持久子线程、Owner shell/逐写入包装、普通文本结算和次数驱动Planner；14项来自旧`owner_write`/`owner_edit`/`owner_bash`与手工验证路径。当前候选已实际通过`owner_submit`提交关卡、worktree/scope/contentDigest、证据租约、Arbiter和完整Workflow的替代用例；没有任何R100验证项全跳过，因此十项结果均为`passed`，没有把skip计成独立通过证据。

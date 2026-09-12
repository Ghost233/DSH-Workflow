# R83：真实规划 checkpoint 与固定快照

T25开发完成，T26前置解除。此次把真实主线程授权、原生文档来源、Git checkpoint、实际 index 同步和不可变快照接通；没有启动 DAG，也不代表 B01、T27 或 CA01 已验收。

## 交付行为

主线程可调用 `workflow_planning_checkpoint`。实际 AgentRegistry 验证根身份，原生 UserQuestionService 在缺授权时展示完整 Spec 与本地文档提交范围；已有匹配授权复用。原始实施范围始终不变，文档修订不能自行扩大执行权限。

事务消费 T05/T24 的完整内容和多次写入链。仅选中文档进入 checkpoint，实际 index 与 HEAD 对齐后发布固定快照；使用原编号恢复，不重复提交。已有暂存、外部编辑、未知锁、无效父快照、Git filter 改写来源或另一笔 pending 事务都明确拒绝并保留现场。实际生产 lease 与旧 Workflow 初始化共用，未完成快照即使 Git 干净也不能派发。

开发核对修复了四处实质缺口：ref 已推进但 journal 未记录时无法恢复；父快照 ID 映射与校验时机错误；提交 tree 未与冻结来源字节绑定；换新事务编号可能留下永远阻塞的旧 pending。另统一 prepare、初始授权和快照的来源摘要算法。

## 固定候选与测试

| 候选 | 正式范围 | 结果 |
| --- | --- | --- |
| [首次候选](candidate.json) | 实际授权、checkpoint、完整 control 回归、来源链、原生日志、引用协议、两类文档守卫、plugin，共9套 | 246通过、7个既有显式legacy跳过；零失败/超时/漂移 |
| [候选2](candidate-2.json) | 取消与恢复修复后的实际授权8项、checkpoint18项、plugin13项 | 39/39通过；零跳过/失败/超时/漂移 |

首次严格零skip采集器退出1，原因是 control 源码中7项已淘汰旧流程的显式 skip；各套测试进程均退出0。没有将它写成全绿，也没有删除这些旧用例。候选2只补验受影响范围，两个候选计数不可相加为同一版本的验收数。[首次结果](test-results.json)、[候选2结果](test-results-2.json)和所有原始日志保留。

独立审查的两项 P2 已关闭：补齐调用取消在内核/Runtime/授权发布边界的传播；补齐 index rename→journal、snapshot publish→journal 的精确 SIGKILL 证据。现有八个强制终止位置均由真实新进程恢复，只有一个 checkpoint 和不可变快照。最终复审无新增 P1/P2，详见[审查记录](review.md)。

原生测试使用实际 Harness Registry、Questions、read/edit、Runtime lease 和临时 Git；UI provider 仅模拟人的回答。内核测试的受控授权/lease回调另行标注，不冒充实际权限。开发日志含初始夹具ID/元数据问题及取消错误码断言不匹配，均保留；后者修正为内核公开错误码并同时验证原始取消原因。

## 边界与下一步

本入口限 DAG 前规划，当前要求默认 `.dsh-workflow`，与T24来源目录一致；自定义目录明确拒绝。取消在边界生效，不回滚已发出的系统调用或已持久的原始授权；证据覆盖进程/SIGKILL，不宣称任意指令或断电恢复。T26/T27须读取原始 implementationScope，并独立核验实际执行授权。

下一步 T26：实际 Planner 消费本次固定快照，将完整 Ticket/AC 映射到单 Owner 执行包，拒绝依赖环与未知合同；T27仍等待T26。T15 C1–C6、T17/T18/T19、其他B项和CA01保持原范围。

未提交、推送或联系远端。根 main 仍为 `154914064f5ceb2f8eb413865e10a54e8ffbc663`，与缓存 origin/main 相同；既有用户改动和暂存保留。Harness master、Synapse main及approve-for-me main相对缓存远端的既有落后3364/15/4未改动，Synapse现场仍detached；本轮未更新这些分支。[Git核对](git-final-evidence.json)。

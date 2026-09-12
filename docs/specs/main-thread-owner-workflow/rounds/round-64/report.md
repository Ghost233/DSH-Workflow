# R64：非通过恢复候选的实际重建

此前handoff候选的非通过Review会进入通用discard→planWorkflowIntents，删除候选后因没有普通Intent失败，原Planner来源也无法重放。现在实际Runner的local_subgraph_rewrite分支专用处理：重放核验原Review，固定完整predecessor，从同A/root领取新logical Planner操作；原成功Planner/Review不伪装失败，新物理调用独立计费。Planner期间旧候选保留，合法新候选与T13结算原子替换，语义失败保留旧候选并按后继ordinal再领，额度耗尽零新child。

新执行操作不等于新收敛周期：候选cycleId继承，recoveryRequestId指向新Planner，既有义务及证据历史持续保留。实际新Reviewer返回passed但无旧义务闭合证据时仍降级needs_revision。前驱候选或Review receipt变化拒绝继续/落盘，已消耗预算不退款。

批准审计另外发现active版本切换不迁移恢复ledger；根会话批准恢复候选现于持久写入前拒绝，等待T18版本继承事务。这是安全前置，绝不等于T18交付。

开发首轮4失败：恢复分派误插在通用continuity异常块。调整到实际local重建出口后4/4通过；并发切片5/5，最终包含周期/未关义务的6/6通过，保留全部原始开发日志。正式178通过/7项既有跳过，零失败/取消/超时、候选无漂移。独立只读审查无新增P1/P2，冻结期间候选未修改。

T15仍开发中。手动discard、其他收敛策略/会诊计费、连续性变化后的自动恢复、所有技术错误的主控制投影、T18版本激活仍未完成。当前没有普通Intent的局部恢复重建路径已实际可执行，但不是整套无人值守验收。

没有commit/push/fetch/分支同步，原有修改保留。main与缓存tracking一致；Harness缓存落后3364，vendor缓存落后4，Synapse detached。实时远端未查询，详git-evidence.json。

## 后继控制审计

已确认候选admission拒绝/未知暂停仍只向外置daemon抛异常，daemon以内存退避重复discover，同源会再次调度。不是R64局部重建已关闭的范围。下一优先处理候选专用持久pause、幂等mainOutbox及实际控制选择，见[错误投影审计](runner-error-projection-audit.md)。

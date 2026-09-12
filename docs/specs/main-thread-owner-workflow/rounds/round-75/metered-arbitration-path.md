# 仲裁完整接线的下一实现路径

当前三个严格operationKind为revision_plan、revision_review、handoff_replan；replan-session根据kind选择Planner/Review提交工具。Owner会诊另有DSH_OWNER_PLANNING_ADVICE_V1输出，但当前为普通runChild文本返回，没有持久预算身份与原始接受回执。不能把一批Owner会诊伪装成一次已计费Review，也不能用拒绝整个仲裁作为最终交付。

完整接线需要：

1. 为逐Owner的只读会诊扩展严格操作身份，绑定实际来源root、active A、候选C、Owner身份和会诊目的；复用每次唯一request/attempt/session/prompt，同根预算每次实际外部启动独立领取。
2. 对Owner advice建立可从真实JSONL核验的接受提交证据，保持Owner私有长期记忆仅作为待核实线索、无DAG/Registry/code写权限。先固定输入后启动；未知创建/发送只对账，不重发。
3. 仲裁操作固定前驱候选Review、冻结义务与每份已结算Owner advice，单独领取revision_review。可用通用重规划会话启动/回执适配；不能直接复用reviewRecoveryCandidate的已应用结果，因为普通Review与仲裁是不同实际工作。
4. 实际assertArbitrationReview + convergence语义验证后，最新状态事务原子保存候选Review、仲裁结果和预算/session结算；候选或前驱变化拒绝旧结果。新Harness重放须核验原始回执，不能仅凭内存成功标记。
5. 有余额时实证Owner会诊及仲裁成功/语义失败的计费；无余额/未知会话时零额外模型；来源变化、跨进程重放、主控制暂停均保持原根预算。

先消除已确认的未计费启动，再交付上述正向能力；两者必须分别记录状态。T15开发完成需实际正向路径，不因能力门禁已存在而提前关闭。

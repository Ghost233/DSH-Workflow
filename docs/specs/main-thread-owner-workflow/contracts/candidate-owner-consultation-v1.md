# Candidate Owner consultation operation V1

T-15 的恢复仲裁会诊生产与采纳；依赖 Owner advice session V1。内部 `consultRecoveryCandidateOwners(agent, workflowId, signal)` 返回与普通规划会诊一致的有效 advice 数组。它不激活 DAG、不替代仲裁 Review；公开恢复仲裁旧路径在独立计费 Review 接入前仍拒绝未计费启动。

## 来源与写入归属

必须先认证真实已结算恢复 Planner 与候选 Review 的持久 operation、budget/session 及原始接受回执。读取的候选、active A、前驱 Review 与 convergence、失败 origin 和 Owner 定义组成冻结输入。选择 open obligations 指向的候选 Owner，没有目标时使用候选 Owner 集合。沿用 maxPlanningOwnerConsultations 的确定性排序及数量上限，持久化全部相关 Owner、实际选择集合和 limit；本接口返回的是该次有限会诊集合，后继仲裁必须检查覆盖范围，不得将截断集合描述为所有相关 Owner 均已会诊。Owner memory 是会诊上下文，不能充当验证证据或授权。

会诊不创建 OwnerRun。只读 owner-advisor 通过 workflow_owner_advice_submit 提交；Owner 身份由请求、session 与工具绑定。每个 Owner 独立逻辑 operation 和逐次预算，沿用前驱失败 root；不得将一批顾问打包为一次外部启动。

## 持久协议

`candidateOwnerConsultations` 保存每个逻辑 operation 的冻结来源、Owner、ordinal、requestId、prompt、phase 及结算结果。先固定输入并预留预算，再调用持久 replan-session。最新状态事务校验来源及 operation 未变化后，原子保存 advice、session applied 与 budget succeeded。

缺少有效提交是已知失败，保存 failed 并消耗该次预算；下一次明确 ordinal+1，不能以 unavailable advice 冒充成功。未知创建/发送与丢响应保持暂停、保留预留，不重发、不退费。候选或前驱变化使旧结果不可采纳；独立任务的无关状态变化不应使会诊失败。

重放必须核验原始 JSONL 回执与持久结果、固定身份及当前来源；不能只检查 phase=applied。暂停来源指纹包含相关 consultation operation、session 和 attempt，确保真实进展可被 runner 观察。

## 验证范围

真实 Harness/Registry/JSONL、计费 Planner 和计费前驱 Review → 实际顾问结构化回执 → 原子结算；同 root 计费、新 Harness 零模型重放、预算耗尽零创建、错误 Owner/无提交、来源变化及实际创建持久化后丢响应。模型传输可使用 MockAdapter；此证据不代表真实模型输出质量或端到端 DAG 已验收。

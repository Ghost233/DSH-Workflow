# 第 4 轮：独立义务身份

用户再次调用 ghost-matt-implement 授权一轮实施。范围为 [T-02](../../tickets/t-02-obligation-closure.md) 的 F-03，依据 [R4](../../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md) 5.10、AC-16/32；同时核对 F-04 的剩余合同，不启动 T-03/T-04/T-06。本文件不修改既有规格。

身份代理独占 model/convergence 及对应测试；主线程独占 runtime 提示、证据与文档。沿用当前 main 工作区，保留起始全部未提交/未跟踪修改，不创建分支或 worktree，不提交或推送。

## 完成条件

新义务须提供逐要求独立且稳定的 obligationId，不能从共享来源 AC、目标或关闭条件自动派生；同来源不同 ID 分别保留，已解决义务不能使另一个 ID 自动解决。重复相同 ID/相同合同幂等，不同合同拒绝或明确冲突；旧记录只走显式兼容读取。协议、normalizer、convergence 与 Reviewer 提示一致。

正式测试范围为 convergence、model、control、plugin、security；前两者覆盖身份正反例，control/plugin 覆盖实际审查与工具协议，security 回归证据关闭。control/security 各 180 秒外层超时，其余各 60 秒；已知决策/拆分失败保留，不把它们改为 unit 绑定。

## F-04 的调用链核对与建议

现有 Runtime 有讨论记录，尚无满足 R4 的逐义务决定凭据：

- `requestPlanReviewDiscussion` 创建 pendingDecisionBundle，内容是当前计划摘要和问题列表，缺少逐 obligation 的解除关系与合同版本。
- `submitWorkflowIntent` 将新 Intent 接到 pendingDecisionBundle 并标记 answer_received；它证明收到输入，不能证明用户已回答每个问题或该输入有权替代指定 AC。
- 候选激活时将对应 Intent/bundle 标记 incorporated，只证明候选纳入输入，不证明义务解除条件已满足。
- `request_subgraph` 保存 applied 的请求并调用 expandCompositeTask/applyPlanDelta，已有身份、租约和 Registry 校验；该记录仍缺稳定义务引用及要求到子节点的继承映射。结构有效并不等于业务验收完成。
- `normalizePlanReviewCloseWhen` 当前仅接受两类验证条件，`alternative_decision` 只有提交形状，没有可信生产者/台账消费。因此不能直接将上述状态字符串用作关闭依据。

建议按以下合同拆开推进，避免继续扩大 T-02 的验证条件：

| 事实 | 可信生产者及最小绑定 | 能证明什么 |
| --- | --- | --- |
| 版本化决定 | 主线程协调并经 Runtime 记录；decision/request/obligation ID、来源 Ticket/AC 版本、决定者权限、受影响合同版本和依据；公共 Owner 协议由现有 T-06 承接 | 指定要求被有权决定明确替代或确认；收到一段 Intent 不自动成立 |
| 结构拆分回执 | Runtime 校验候选后记录；原 obligation/父任务、父版本与候选摘要、子节点映射、继承的未满足要求 | 仅证明要求的结构拆分；业务/测试义务继续 open，不随父节点展开消失 |
| 关闭申请 | Reviewer 只引用上述记录；Runtime 核验存在性、归属、版本、关联及未失效后记账 | 模型自报 passed/decisionId 不能提供可信证据 |

以上是待讨论的最小接口方向，不是本轮已实施的新 schema。涉及 R4 5.8/5.9 和 T-06 的版本化决定、候选激活与继承，不能在 T-02 内再造一套审批台账。T-02 的验证子集可局部验证，统一闭环仍阻塞；T-03/T-04 不解锁。

依据所调用 [SKILL.md](</Users/admin/.codex/plugins/cache/ghost-agent-market/ghost-agent-skills/0.3.5+codex.20260908032011/skills/ghost-matt-implement/SKILL.md>)：“需要改变架构、合同或本轮范围时，将证据、影响和建议交回讨论，不自行改规格或扩展实施。”本轮因此只实施已有明确合同的身份修复，未扩展决定/拆分协议。

## 固定候选与正式结果

候选冻结：`2026-09-10T08:47:25.980872+00:00`；五组共 227 项，201 通过、5 失败、21 跳过、0 取消，0 组超时，候选漂移 `[]`。精确差分、指纹、原始日志见[证据](evidence.md)。

| 套件 | 通过 | 失败 | 跳过 | 退出码 |
| --- | ---: | ---: | ---: | ---: |
| convergence | 15 | 0 | 0 | 0 |
| model | 50 | 0 | 0 | 0 |
| control | 101 | 5 | 7 | 1 |
| plugin | 11 | 0 | 0 | 0 |
| security | 24 | 0 | 14 | 0 |

失败场景：

- Reviewer 不能要求 abstract decision 删除必填 Owner 会诊字段，必须重试为 decision (388.311333ms)
- Reviewer 判定 needs_split 后，Owner 会诊参与目标节点的递归拆分 (436.827333ms)
- Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程 (385.755208ms)
- 同类审查问题连续出现时，Runtime 强制 Reviewer 从 needs_revision 升级分类 (399.153791ms)
- Arbiter 可以把 Runtime 已知的 abstract 节点转入拆分而不误判为新问题 (349.906ms)

这些控制场景与第 3 轮的五项失败对应，仍在缺失结构化合同的审查输入阶段被拒绝；本轮没有修改 control 夹具或削弱门禁以标绿。缺 ID 的错误检查可能先于来源/关闭条件错误，但尚未补齐的决定/拆分闭环未改变。

开发阶段 65 项定向测试通过；首次 64 通过/1 失败为既有断言的错误消息正则未包含新的 obligationId 提示，原始日志与修正复跑均已保存，不计入正式总数。正式用例未被零用例替代，跳过不算通过证据。security 的真实记录/当前性门禁仍使用可控宿主命令夹具，不等于真实业务端到端；CA-01 和本轮范围外套件未运行。

## 交付范围与版本

已落地必填 ID 的 schema、normalizer、convergence 和 Reviewer 提示；测试证明缺 ID 拒绝，以及来源/目标/关闭条件相同但不同 ID 的义务独立保留，不继承 resolved。旧记录保留显式兼容读取；本轮没有实现旧记录自动迁移、子节点义务继承或决定台账。

本轮结束，待讨论。T-02 仍开发中，AC-16/32 未整体验收，T-03/T-04 不解锁。下一步建议先确定上表的决定/拆分回执合同，明确 T-06 与 T-02 的生产/消费边界，再启动实现；不要再以仅调用 T-02 重试来隐式扩展协议。

本轮当前分支 main，主仓库 HEAD `154914064f5ceb2f8eb413865e10a54e8ffbc663`。交付的是未提交源码候选，不以 HEAD 冒充候选版本；没有 Git 写操作或网络 fetch。结束核对见证据：主仓库 main 与本地 origin/main 跟踪引用一致；子仓库原有不同步引用保留，未声称联网远端同步。未提交/未跟踪内容保留，无备份或 stash。

按所调用 [SKILL.md](</Users/admin/.codex/plugins/cache/ghost-agent-market/ghost-agent-skills/0.3.5+codex.20260908032011/skills/ghost-matt-implement/SKILL.md>)：“无论本轮通过或失败，都不自动修复审查发现，不自动启动下一轮”。正式测试后仅记录和只读审查，没有继续修代码、测试或规格。

## 主线程只读复核

本轮增量仅五个源码/测试文件：convergence.mjs、model.mjs、runtime.mjs、convergence.test.mjs、model.test.mjs。主线程核对严格提交的必填校验、共享工具 schema 和 legacy 显式读取：新缺 ID 输入在进入持久义务前拒绝，fallback 仅供旧记录读取；标题不参与身份合同。同 ID 的 source/目标/closeWhen 冲突处理保持原有门禁，新增不同 ID 不继承 resolved。

该修复要求生产者提供正确且稳定的逐义务 ID，不宣称已经完成 Spec/Ticket 快照绑定或跨拆分继承；那些仍需相应工单的 Runtime 版本合同。五个控制失败与上一轮原始日志逐项名称核对一致，属于未完成的 F-04，不以测试计数变化掩盖。

结束检查：四个相关仓库 HEAD 均未变，diff --check 均通过，基线文件无缺失、候选无漂移；本地 main 对 origin/main 跟踪引用 ahead/behind 为 0/0，未联网刷新远端。

独立只读审查对五文件增量未发现新增 P1/P2，确认 schema、normalizer、convergence、Reviewer 提示一致，旧读取显式 opt-in；新增测试覆盖不同 ID 的 resolved 历史隔离。五个 F-04 控制失败仍保留，不代表全项目无缺陷。

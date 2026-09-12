# 第 2 轮：证据义务关闭与测试清理

日期：2026-09-10。状态：**本轮结束，待讨论**。T-02 仍为开发中、未验收通过；F-01 的定向与故障注入检查通过。

本轮按用户再次调用 ghost-matt-implement 执行，范围为 [T-02](../../tickets/t-02-obligation-closure.md)（R4 5.10，AC-16/32）和[第 1 轮 F-01](../round-01/report.md)。主线程负责 native 测试清理、合同核对、正式测试与记录；实现代理独占 convergence/runtime/model、工具入口 index.js 及相应测试。当前 main 工作区实施，不创建替代分支或 worktree，不提交或推送，原有修改保留。

## 本轮合同边界

义务不能因为下一份 review 遗漏、改标题或返回 passed 而关闭。Runtime 必须保留来源、目标与解除条件；不同要求不能仅因类别/节点相同而合并。Reviewer 提出关闭请求，实际关闭必须通过 Runtime 对义务条件与候选版本的核验。

本轮只支持 Runtime 已能核验的证据；没有可信版本化台账的替代决定不会凭 Reviewer 自报放行。旧记录缺乏明确解除条件时保留 open，不猜测迁移。这些限制须在最终报告列明，不能将局部合同实现写成公共 Owner 决定或完整恢复闭环已经完成。

## F-01 实施阶段证据

清理钩子已移到临时目录创建成功后、任何 Git 初始化前。按逆序释放已取得资源；某项释放抛错仍继续释放其他资源和删除临时目录，最后汇总错误。

故障注入结果：旧候选在两个会话夹具的 setup 失败后均遗留目录；新候选在同样 setup 失败、以及已创建 Runtime 后 setup 与 disposer 同时失败时，两个目录均清理。注入进程退出 1 为预期失败，目录残留检查才是该实验的断言；未把注入失败的 Node 结果当成全绿套件。旧探针遗留的两个目录已由探针清理，仅涉及探针自己创建的目录。

## 固定候选与正式测试

冻结后执行 convergence、control、model、orchestrator-documents-native、runner、plan-revision、workflow-state、plugin 八组套件，独立进程收集结果；control 外层上限 180 秒，其余 60 秒，超时终止本轮测试进程组并继续独立套件。另运行 F-01 新候选的两个故障注入实验。运行时使用稳定 Node v24.12.0 和当前磁盘候选，Harness 使用记录摘要的现有构建入口。

正式八组全部执行结束，无超时、取消或零用例；候选无漂移。测试后不再修改源码或断言。结果为 **198 通过、4 失败、7 跳过，共 209 项**（Node 报告计数，含父测试）。完整命令、时间、指纹、本轮差分及原始日志见[证据](evidence.md)。

| 套件 | 通过 | 失败 | 跳过 | 退出码 |
| --- | ---: | ---: | ---: | ---: |

| convergence | 9 | 0 | 0 | 0 |
| control | 100 | 4 | 7 | 1 |
| model | 48 | 0 | 0 | 0 |
| orchestrator-documents-native | 4 | 0 | 0 | 0 |
| runner | 8 | 0 | 0 | 0 |
| plan-revision | 7 | 0 | 0 | 0 |
| workflow-state | 11 | 0 | 0 | 0 |
| plugin | 11 | 0 | 0 | 0 |

control 的 7 个跳过项是源码中显式跳过的旧版兼容测试，本轮没有更改这些跳过声明；未把它们计为通过。F-01 固定候选的两个故障注入实验均满足“两个会话目录无残留”的检查，注入的 Node 子进程按预期退出 1，单独记录，不并入上表通过数。

## 正式失败分析

以下均是当前候选实际失败，不称为已通过，也不在没有基线运行证据时称为历史失败。

| 控制用例及失败断言行 | 实际 / 预期 | 静态归因与下一轮处理 |
| --- | --- | --- |
| awaiting_main_discussion 接收明确 Intent 后可以生成 PlanRevision 候选：control.test.mjs:4350 | needs_revision / passed | 驱动重建后保留了缺少关闭合同的旧义务，旧 fixture 仍只返回 passed。需要在该实际恢复链补可核验的迁移/关闭依据，不能删除旧义务迎合断言。 |
| 冻结义务无进展时由独立 Arbiter 裁决而不是请求用户扩额：control.test.mjs:4517 | needs_revision / passed | 旧 ledger 无 source/closeWhen，Arbiter 只声称通过。新门禁拒绝无依据关闭符合方向，但有效仲裁依据的可消费闭环尚未证明。 |
| 计划修订次数只作遥测，无进展时切换策略而不是请求扩额：control.test.mjs:4736 | workflow_plan_arbitrate / workflow_plan_revise | 后续 review 提出不同边界要求，旧夹具期待继续普通修订。需固定稳定身份、明确是同一要求还是新增要求后验证策略，不能只改字符串断言。 |
| 完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付：control.test.mjs:5384 | needs_revision / passed | 旧端到端夹具多轮后仅返回 passed，没有明确解除条件和关闭证据。用真实合同更新生产者/消费者后重验整条链；本轮没有到达该用例后半段的执行和交付断言。 |

这四个失败说明本轮尚不能交付 T-02；它们既不证明模型能力不足，也不能被当作放松证据门禁的理由。

## 证据完整性与版本

实现阶段的 3 个原始 RED 均为断言失败；后续完整 convergence 定向检查 9 通过、model 48 通过、工具 schema 定向 2 通过、控制入口定向 2 通过。首次控制定向曾报告 2 项中 1 失败、1 通过；实现代理确认失败发生于 fixture 未填写 Registry digest，进入 reviewPlan 后被正式 registry 绑定检查拒绝。该次原始 stdout 被同名成功日志覆盖，不能完整复原；只有会话计数和代理观察记录，证据文档明确把观察与原始日志分开。名称含 first 的现存控制日志也是修复后成功输出，不能用来证明首次失败细节。八组正式原始日志完整保留，不受这个开发阶段缺口影响。

冻结时间：`2026-09-10T07:49:21.107203+00:00`。正式测试自 `2026-09-10T07:49:21.180235+00:00` 至 `2026-09-10T07:50:05.822208+00:00`。主仓库基准 HEAD 为 `154914064f5ceb2f8eb413865e10a54e8ffbc663`；实际候选由未提交内容指纹与精确差分识别。

## 实现内容与只读反思

本轮改动九个源码/测试文件：convergence.mjs、runtime.mjs、model.mjs、index.js，以及 convergence/control/model/plugin/orchestrator-documents-native 五份测试。代码尝试引入稳定来源、目标、固定解除条件与显式关闭请求；工具 schema 与解析器共用定义；Runtime 核验后将被阻断的 raw passed 转为 needs_revision，并在计划和修订批准入口再次拦截。新例证明无依据关闭被拒绝、支持的绑定条件可关闭、重复关闭不重复生成 resolution；pending revision 与旧 active plan 不同 digest 的场景也有通过证据。

这些局部正例不足以判定合同完成。主线程结合正式失败及调用链分析，独立审查代理只读复核身份、证据生产/消费与版本兼容，确认以下待修项。以下源代码路径均相对 owner-workflow-plugin；未在反思阶段追加运行探针，因此区分静态已确认的分支缺口与已运行的测试结果。所有项本轮均未追修。

| 编号 / 优先级 | 已确认根因与影响 | 下一轮最小修复及验证 |
| --- | --- | --- |
| F-02 / P1：过期验证可关闭义务 | src/runtime.mjs:2716 的投影遗漏现有验证有效性约束；src/convergence.mjs:308 只检查相同 planDigest、pass、exit 0 与非空 contentDigest。同一计划下内容或 writeGeneration 改变后，旧结果仍可能被接受。现有真实 producer 在 runtime.mjs:14291 起记录版本信息，正常提交门禁在约 14065 起及 verification.mjs:171 起会检查当前内容、写入代次、绑定与超时/中止等；新关闭路径绕过了这些条件。 | 复用现有 Runtime 的结果有效性检查，向关闭逻辑提供经过当前内容/代次/执行绑定核验的证据；验证同 planDigest 下写入变化、旧结果、超时/中止结果拒绝，当前有效结果允许。 |
| F-03 / P1：不同要求仍可被吞并 | src/convergence.mjs:142–144 首轮先按 ID 取最后一项；model.mjs 的 issues 解析不检查同批同 ID 合同冲突。两个同 ID、不同来源/目标/closeWhen 的要求会丢一个；priorOpen 为空时后续冲突检测无法找回。src/convergence.mjs:71–80 的 fallback 还使用会抹去路径/字面值的 normalizedText，不同来源内容可能形成同一个身份。 | 同批冲突 ID 在接收前拒绝；不同来源不能用有损文本摘要合并。优先要求显式稳定来源，旧数据只作可追溯、无损的身份迁移。测试同 ID 不同合同、相同类别/节点但不同文件或要求都不丢失。 |
| F-04 / P1：新输入也会创建无法关闭的义务 | schema 与 normalizer 允许新提交省略 closeWhen 等字段；src/convergence.mjs:84–99 将其变成 runtime_evidence_required，而 110–118 只承认两种可关闭条件。该占位不是仅用于旧记录；普通新 review、discovery/decision 问题也可能进入它，之后无任何当前协议可关闭，passed 将持续被拒绝。 | 区分旧记录加载和新提交，不能把不完整新合同直接持久化为可执行义务；在接收阶段给出可修正错误，或先补有来源、可核验的合同完善/替代路线。保持缺失证据时不放行，同时验证正常修正后确实能收敛。 |
| F-05 / P2：标题仍会改变身份 | src/convergence.mjs:62–68 仍从 title/detail/suggestion 提取 T* 并与显式 targetTaskIds 合并。标题加入 T2 等字样会改变目标；无显式 ID 时换身份，有显式 ID 时产生冲突。 | 结构化目标是身份依据，展示文案不反向推导目标；验证标题带任务编号或普通英文 T 开头单词时身份保持、目标不变。 |
| F-06 / P2：旧义务重复出现被当成新增 | src/convergence.mjs:247–249 将 sameObligation 与 hasClosureContract 绑定。缺少 closeWhen 的旧义务即使 ID/内容完全不变也不匹配，383 起会把它列为 introduced/unsupported，造成多余仲裁。 | 将“是否同一义务”与“是否已有可用关闭条件”分开；缺合同仍 open，但相同旧记录重复审查不产生新义务或伪进展。 |
| F-07 / P1：门禁会追溯阻断旧 active Workflow | src/runtime.mjs:2809 的 onlyMatchingCandidate 只看 digest，不区分 evidence-lease-v1/v2。旧 v1 ledger 同样记录 candidatePlanDigest；旧 approved/running 状态若留有 open 项，新 Owner start/recover 门禁就会拒绝它，违反 R4 V-05 的活跃旧 Workflow 不自动迁移约束。新增测试只覆盖 pending 与 active digest 不同，未覆盖同 digest 的旧版本。 | 按实际协议版本处理已生效旧现场和新候选审批，明确迁移入口；补同 digest v1 已批准现场的启动/恢复兼容，以及新候选仍受严格门禁的反例。 |

没有为这些问题修改产品需求。两种证据 kind 的出现是落实 T-02 的实现细节，但当前验证复用和新旧协议边界尚不完整；单靠新增字段和更多 gate 会把误通过变成长期阻断。这是协议和状态衔接问题，不能推论为模型能力不足，也不应通过延长重试或降低验收条件处理。

## 后续范围与未完成项

下一轮优先修复 T-02 的上述问题，并给四个控制失败用例提供真实的关闭/迁移依据及正确策略预期。先恢复完整 T-02 的通过证据，再考虑 T-03/T-04；本轮不解锁其下游。缺乏可信替代决定台账时仍不得接受 Reviewer 自报，T-06/公共 Owner 决定集成没有在本轮实现。

T-01/F-01 清理修复可单独追溯，但这不使当前包含 T-02 的整份候选通过验收。全项目测试、真实模型运行、CA-01 与完整 Spec→Ticket→DAG 集成未执行或仍未完成。未重启用户 Harness，未提交或推送代码。

按本次 [ghost-matt-implement](</Users/admin/.codex/plugins/cache/ghost-agent-market/ghost-agent-skills/0.3.5+codex.20260908032011/skills/ghost-matt-implement/SKILL.md>) 的明确要求：“本阶段只给结论，不实施修复”及“将进度标为‘本轮结束，待讨论’”，本轮在记录问题后停止。下一轮属于同一技术目标的修复，不需要重新定义业务需求；仍须由用户启动下一轮实施。

结束核对：全部受测源码/测试与冻结指纹一致，主仓库及三个子模块 HEAD 均未变化，子模块工作区状态与起始记录相同；原有主仓库状态条目均保留。当前 main 与本地 origin/main 跟踪引用均为上述完整 hash，behind 数为 0；本轮未推送，也未另行查询远端。文档链接检查及 git diff --check 通过。没有本轮需要恢复的 stash、备份分支或替代 worktree。

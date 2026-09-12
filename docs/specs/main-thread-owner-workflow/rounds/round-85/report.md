# R85：候选独立审查来源与版本语义比较

T27 已开始实施，保持开发中。本轮接通固定候选的独立审查：主线程只提交 candidate_id，生产 Reviewer 通过结构化工具提交，Runtime 保存原始 callId、子会话/父会话、原始 review 与候选摘要。passed 不创建 Workflow/OwnerRun，也不授予执行权限。

版本迁移补入任务实际引用的验证 argv/cwd、Ticket/片段/合同版本比较。相关语义变化进入 pending_check；另一任务的绑定或无关验证变化不影响当前任务。write 扩大仍不能 carry_valid，旧 attempt 不获得新增权限；实际权限保留与后续包派发仍待 T27 联合验证。

独立审查发现并关闭正式 provider 漏传候选/父会话 ID 的接线缺陷；测试替身原先掩盖了它。新增实际 agents.create、AgentLoop/Subagent provider、原生工具提交和回执重读测试。模型传输使用 MockAdapter，实际 Runtime review 入口另有服务替身集成测试；不将组合证据描述成完整模型端到端验收。详见 review.md。

首次正式运行：四套43/43通过；control在第134项后达到整套120秒超时，未产生最终计数。此前没有断言失败，但不能把不完整日志算作套件通过。候选无漂移，保留formal-control.log与test-results.json；仅control提高整套预算至240秒进行一次有界补验，115.9秒结束：159通过、7个既有显式legacy跳过、零失败/漂移。补验结果见test-results-retry.json，初次超时保留。两次运行使用同一候选，合计五套202通过、7跳过；严格采集器因skip退出1，不称全绿。源码、测试、合同及实际 Harness 来源指纹见 candidate.json；开发日志保留。

下一步直接完成 T27 原子激活事务：候选/预期父版本/原授权/live Registry/未关义务/独立审查联合核验；同父竞争和重启；保留旧 attempt 权限与迟到结果；连接实际派发及 T18 接缝。还需在该入口将固定快照内容与迁移引用对应，不能仅凭本轮引用比较宣称所有快照变化已覆盖。不扩大工单范围、不把局部回归换算整体完成率。

未提交、推送或联系远端；根 main 与缓存 origin/main 同为 154914064f5ceb2f8eb413865e10a54e8ffbc663。既有暂存和改动保留；Harness/Synapse main/approve-for-me 相对缓存远端原有落后3364/15/4未变，Synapse仍detached。见 git-final-evidence.json。

[T27完整剩余审计](t27-remaining.md)保留所有原完成条件，下一段直接实施激活事务。

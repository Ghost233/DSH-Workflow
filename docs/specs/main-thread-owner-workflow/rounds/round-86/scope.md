# R86：T27 固定候选首次激活

上一目标轮为 progress：R85 已交付候选独立审查来源与版本引用语义比较。本轮继续 T27，范围是把固定候选、原授权和独立审查一次性发布为首个可调度 Workflow，并证明竞争、恢复和实际 Runner/Supervisor 消费。

完成条件：主线程工具只接收 candidate/review ID；激活前联合核验固定快照、完整执行包、原 implementationScope、live Registry、代码现场和 passed 审查；未解决 Registry 提案、blocked 包或错配来源零派发。完整状态最后发布，未完成 journal 阻止另一条图；同候选重放不新增版本；同父竞争只产生一个 Workflow；正式 control bridge 能启动 Supervisor 并选择首个 ready task。

本轮修改归主线程：runtime、index、planning native/plugin 测试及合同/进度。保留用户现有改动，不提交、推送或创建用户项目分支；测试只在临时 Git fixture 中创建受控 workflow branch/worktree。

本轮不把首次激活替代 T27 其余范围。活跃 Workflow 的 Spec/Ticket 修订、预期父版本、旧 attempt 权限/迟到回执迁移及 T18 接缝继续保留为后续完成条件。

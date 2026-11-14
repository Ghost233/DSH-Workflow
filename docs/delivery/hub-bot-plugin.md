# 中枢 Bot 插件交付记录（当前入口）

- spec：docs/specs/hub-bot-plugin.md（approved）；跟踪 issue：DSH-Workflow#62；工单：#63-#74（子 issue + 原生 blocked-by）
- 总交付起始 SHA：82e9414（main）；集成分支：fix/62-hub-bot-plugin（本 worktree）；总 PR：fix/62-hub-bot-plugin → main（仅 ready，合并需用户明确要求）
- 阶段 PR 适配：团队共享本 worktree，阶段边界以固定基准/候选 SHA + 审查记录表达，不单建阶段分支
- 团队：Lead=lead；实现成员按阶段创建；审查成员按 code-review 双轴（Standards/Spec）阶段时创建
- 检查入口：最小范围——hub-bot-plugin/ 内单测 + 真实 DSH 装载验证；禁止全量回归（AGENTS.md）

## 阶段

| 阶段 | 工单 | 任务板 | 状态 | 候选 SHA | 证据 |
|------|------|--------|------|----------|------|
| 1 注入链路地基 | #63 | task-1 / 验收 task-13 | 进行中 | - | - |
| 2 三层主干 | #64-#67 | task-2..5 / 验收 task-14 | 未开始 | - | - |
| 3 渠道与隔离 | #68 #69 #72 | task-6,7,10 / 验收 task-15 | 未开始 | - | - |
| 4 形态与 GitHub 闭环 | #70 #71 | task-8,9 / 验收 task-16 | 未开始 | - | - |
| 5 面板与总交付 | #73 #74 | task-11,12 / 验收 task-17 | 未开始 | - | - |

## 当前

- **阻塞已解除（2026-11-15）**：根因是 profile 配置树未组装 spawn provider；用户已在 ~/.dsh/profiles/desktop/cordis.patch.yml 插入官方进程内 spawn 后端 dsh-subagent-spawn-in-process + 工具包 dsh-tool-subagent 并重启 DSH，subagent/list_subagent_models 工具上线。历史失败成员：impl-core、impl-core-2（Codex 运行时 product-error，零产出）
- 当前：impl-core-a 领取 task-1（#63）实施中；同时活跃队员上限 2 个，队员可再带一层队员
- 下一动作：等 impl-core-a 回报 → 核对 diff 与证据 → 验收 task-1 → 派 task-2（#64）
- 已知约束：验证插件装载需重启用户正在使用的 DSH 服务——由 Lead 与用户协调时机，成员不自行重启
- 未关闭问题：无

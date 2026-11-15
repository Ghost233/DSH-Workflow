# 中枢 Bot 插件交付记录（当前入口）

- spec：docs/specs/hub-bot-plugin.md（approved）；跟踪 issue：DSH-Workflow#62；工单：#63-#74（子 issue + 原生 blocked-by）
- 总交付起始 SHA：82e9414（main）；集成分支：fix/62-hub-bot-plugin（本 worktree）；总 PR：fix/62-hub-bot-plugin → main（仅 ready，合并需用户明确要求）
- 阶段 PR 适配：团队共享本 worktree，阶段边界以固定基准/候选 SHA + 审查记录表达，不单建阶段分支
- 团队：Lead=lead；实现成员按阶段创建；审查成员按 code-review 双轴（Standards/Spec）阶段时创建
- 检查入口：最小范围——hub-bot-plugin/ 内单测 + 真实 DSH 装载验证；禁止全量回归（AGENTS.md）

## 阶段

| 阶段 | 工单 | 任务板 | 状态 | 候选 SHA | 证据 |
|------|------|--------|------|----------|------|
| 1 注入链路地基 | #63 | task-1 / 验收 task-13 | **完成** | 873bcec | 证据：hub-bot-plugin/docs/evidence-task-1.md；双轴审查+复审通过，P0/P1 清零 |
| 2 三层主干 | #64-#67 | task-2..5 / 验收 task-14 | **完成** | 1a2dedc | 5314675 路由链 / 337dc2c 执行闭环 / 5efc1c8 状态机 / bf0d0a5 汇报链；双轴审查+复审通过，P0/P1 清零 |
| 3 渠道与隔离 | #68 #69 #72 | task-6,7,10 / 验收 task-15 | 未开始 | - | - |
| 4 形态与 GitHub 闭环 | #70 #71 | task-8,9 / 验收 task-16 | 未开始 | - | - |
| 5 面板与总交付 | #73 #74 | task-11,12 / 验收 task-17 | 未开始 | - | - |

## 当前

- **阻塞已解除（2026-11-15）**：根因是 profile 配置树未组装 spawn provider；用户已在 ~/.dsh/profiles/desktop/cordis.patch.yml 插入官方进程内 spawn 后端 dsh-subagent-spawn-in-process + 工具包 dsh-tool-subagent 并重启 DSH，subagent/list_subagent_models 工具上线。历史失败成员：impl-core、impl-core-2（Codex 运行时 product-error，零产出）
- 阶段 1 完成（2026-11-15）：4 commits（1f02e67 骨架 → 88a220d 规格入库 → b6fff6d 审查修复 → 873bcec 收尾）；#63 issue 已留验收评论
- 阶段 2 完成（2026-11-15）：#64-#67 四张全绿（83 测试双模式 EXIT=0）；双轴审查 P1×2（summarize/factLine 双映射源、reply 假 sent）已修并复审关闭；证据 task-2..5 已入库 hub-bot-plugin/docs/
- 审查沉淀的关键机制决定：**preset 会话工具面是独立挂载子树（mountPreset）——角色工具必须做成静态插件行放进各自 preset 的 plugins 列表**，不做运行时 decorate；profile 层同 id 条目是替换语义（stateDir 与 devApi 必须同条目）；reply 对未投递目标标 recorded 终态（不假装 sent），飞书通道落地时扫 recorded 补投
- 阶段遗留：用户 desktop profile 生产装载未验（插件功能完整后统一做，Lead 与用户协调重启时机）；追问路径清标时机边缘（复审 N1）记录；hub() 助手 5 行重复与 Router 直写 ticket 两个 P2 微项并入后续工单
- 当前：阶段 3 并行启动——task-6（#68 飞书）→ impl-core-a；task-7（#69 fork 与确认）→ impl-aux；task-8（#70 目录/临时 bot）排队等槽
- 已知约束：验证插件装载需重启用户正在使用的 DSH 服务——由 Lead 与用户协调时机，成员不自行重启
- 未关闭问题：无

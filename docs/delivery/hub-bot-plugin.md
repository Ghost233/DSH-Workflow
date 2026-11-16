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
| 3 渠道与隔离 | #68 #69 #72 | task-6,7,10 / 验收 task-15 | **完成** | f2f2430 | 3ef317a 飞书 / 7f9d198 fork+确认 / 1f12f8a 并发可靠性；双轴审查+复审通过 |
| 4 形态与 GitHub 闭环 | #70 #71 | task-8,9 / 验收 task-16 | **完成** | f2f2430 | 28d098e 回收 / dd0dca8 GitHub 闭环；双轴审查+复审通过 |
| 5 面板与总交付 | #73 #74 | task-11,12 / 验收 task-17 | 未开始 | - | - |

## 当前

- **阻塞已解除（2026-11-15）**：根因是 profile 配置树未组装 spawn provider；用户已在 ~/.dsh/profiles/desktop/cordis.patch.yml 插入官方进程内 spawn 后端 dsh-subagent-spawn-in-process + 工具包 dsh-tool-subagent 并重启 DSH，subagent/list_subagent_models 工具上线。历史失败成员：impl-core、impl-core-2（Codex 运行时 product-error，零产出）
- 阶段 1 完成（2026-11-15）：4 commits（1f02e67 骨架 → 88a220d 规格入库 → b6fff6d 审查修复 → 873bcec 收尾）；#63 issue 已留验收评论
- 阶段 2 完成（2026-11-15）：#64-#67 四张全绿（83 测试双模式 EXIT=0）；双轴审查 P1×2（summarize/factLine 双映射源、reply 假 sent）已修并复审关闭；证据 task-2..5 已入库 hub-bot-plugin/docs/
- 审查沉淀的关键机制决定：**preset 会话工具面是独立挂载子树（mountPreset）——角色工具必须做成静态插件行放进各自 preset 的 plugins 列表**，不做运行时 decorate；profile 层同 id 条目是替换语义（stateDir 与 devApi 必须同条目）；reply 对未投递目标标 recorded 终态（不假装 sent），飞书通道落地时扫 recorded 补投
- 阶段遗留：用户 desktop profile 生产装载未验（插件功能完整后统一做，Lead 与用户协调重启时机）；追问路径清标时机边缘（复审 N1）记录；hub() 助手 5 行重复与 Router 直写 ticket 两个 P2 微项并入后续工单
- 阶段 3+4 完成（2026-11-15）：#68-#72 五张全绿（151 测试双模式 EXIT=0）；双轴审查 P1×3（死信通知、通道回投收敛、自动恢复）已修并复审关闭；并行实现（impl-core-a + impl-aux）write scope 分工+行级 edit 安全叠加运行顺畅
- 审查沉淀：insertOutbox state 必填（死信防再犯）；通道无关回投驱动 deliverRecordedReplies；重启自动恢复（最旧优先+槽闸门+注记恰好一次）；parallel 期全量测试噪音以范围套件+单跑规避
- 遗留：飞书真机扫码收尾（用户参与，#74 整体验收时一并）；chief 队列均衡/洪泛（#73 面板/#74 考虑）；botOpenId 缺省语义、worktree 仅 persona、限流续跑销项——接受在案
- 当前：阶段 5——task-11（#73 面板三问与设置页）、task-12（#74 整体验收 13 条）→ 验收 task-17
- 已知约束：验证插件装载需重启用户正在使用的 DSH 服务——由 Lead 与用户协调时机，成员不自行重启
- 未关闭问题：无

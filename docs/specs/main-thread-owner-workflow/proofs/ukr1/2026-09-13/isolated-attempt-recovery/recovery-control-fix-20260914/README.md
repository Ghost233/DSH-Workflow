# 恢复控制修复与一次真实复试（2026-09-14）

框架修复已加载，最终定向回归 **214/214**。原 Coinhub Workflow 完成了一轮 Planner + Reviewer；计划内容获独立审查通过，但 Reviewer 漏交旧义务的结构化关闭记录，新 DAG 没有激活。**整体验收未完成**，未开启第二轮真实恢复。

## 根因和调整

1. Runner 以前在审查失败后自动重规划，仅检查任务边界，未检查验证定义边界。本次改为返回主线程，由主线程明确任务及验证修改范围；边界不全时，分派和扣除次数前拒绝。
2. Reviewer 用 `targetVerificationIds` 声明需要修改的实际验证。命令缺口不能只改 `done` 文案；关闭仍需要匹配的独立审查证据。
3. 局部 Planner 可提交 `planPatch`，Runtime 合并变更项、保留其余定义，再执行原有归属、来源、依赖、包编译及边界验证。
4. 恢复入口共用持久化上限。`workflow_authorize_recovery` 通过原生审批限定本轮次数；历史不清零，拒绝/取消不增额，重放不重复增额，过期审批拒绝。所有 retry/replan 入口都受该上限约束。
5. Planner/Reviewer 技术重试检查其冻结 admission，避免拿旧活动 DAG 的 Registry 摘要错误地阻止当前规划动作。
6. 真实审批入口发现旧私有 stop 记录影响准入：已按既有 `sourceAuthorityRetirement` 判断项目写权限，继续保留未知私有执行、stop 记录和隔离容量。实际现场红测及回归已覆盖。
7. 真实审查发现报告闭环缺项：现在 `passed` 但缺少匹配 `obligationClosures` 会在提交预检直接返回具体缺项，Reviewer 在同一会话补正，不产生新恢复轮。既有已保存的不完整正面审查，可通过受额度约束的普通 action retry，仅重跑 Reviewer；保留同一 DAG，无须再派 Planner。

## 实际复试结果

- Workflow：`wf-90bbced7a68641494bb651e73f3c22d6ba4b3354`。
- 沿用 R10 checkpoint 和已批准 Registry；一次原生批准把本轮绝对上限定为 13，历史 used=12 保留。
- Planner：`act-53e2c056216219aaac9dc876a31b4f4ca5397ff9`，约 95 秒，成功。
- 仅修改 5 个相关任务、3 个验证定义。Panel 与 host parity 的实际 argv 都改用 `node scripts/playwright-acceptance.mjs test ...`；harness 使用真实 smoke 命令。其他定义保留，见 `planner-diff.json`。
- Reviewer：`act-5cd01dd096c9b1374604c307379b179c5cf0fac1`，内容结论 `passed`、issues=[]，但漏交 `ACCEPTANCE-SUITE-RUNNER-R2-browser-wrapper-binding` 的显式关闭记录。
- Runtime 因义务未关闭保留 active planVersion=2；没有启动新的业务 Owner attempt，没有自动 replan/retry。
- 本轮 used=13 / limit=13，剩余 0，已停止。旧任务、候选、隔离执行、集成提交、Registry、原始预算 policy 及用户配置哈希全部不变。

## 验证及证据

- `final-core-green.log`：核心、Runner、模型和契约 189/189。
- `final-native-green.log`：真实原生规划、审批、Registry、Root 工具 25/25。
- `closure-native-green.log`：漏交记录 → 同一 Reviewer 收到提交错误 → 补齐 → 激活并交付，全程仅一次显式恢复。
- `reviewer-recovery-dry-run.json`：对真实状态只读模拟；没有新批准时拒绝，模拟批准后可仅恢复 Reviewer、保留 DAG。模拟没有写回控制状态。
- `result.json`：实际动作、独立审查原文及逐项保留证明。
- `source-hashes.json`：最终实现指纹；`configuration-hashes-before.json` 与 `configuration-hashes-after.json`：用户配置保护证据。

最终自研版本已通过原固定无参数 `./start-owner-workflow.sh` 加载，3080 原标签页保留。最后的报告缺项修复已通过原生回归，但尚未做第二轮真实恢复；现场仍待一次正式、受额度约束的 Reviewer 补交。未修改 DSH/第三方源码或用户配置，也未清理历史来制造通过。

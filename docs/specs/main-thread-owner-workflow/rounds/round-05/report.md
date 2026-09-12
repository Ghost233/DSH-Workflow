# 第 5 轮：决定与结构关闭回执

用户“修复”授权实施第 4 轮建议的最小回执方向。本轮沿用 [R4](../../../../superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md) 5.8–5.10、[T-02](../../tickets/t-02-obligation-closure.md) AC-16/32。技术细化由主线程决定，既有 Spec 不改写，不新建完整公共 Owner 协议或审批系统。

## 实施合同

新增 `plan_task_executable` 条件，绑定 taskId。Runtime 校验候选后投影可执行叶子/展开子树的事实，Reviewer 使用当前 planDigest 显式请求关闭。原 task ID 不存在、仍 abstract 或子图不合法均不是有效依据。结构事实只解决“形成可执行结构”的要求；不能据此声明业务测试通过，也不自动重定向父任务的其他义务到新子节点。

新增 `decision_record` 条件，绑定 taskId 与 authority（orchestrator/user）。`workflow_obligation_decide` 只允许 Workflow 已绑定主线程调用；输入指定 obligation_id、plan_digest、decision_id、resolution、rationale。Runtime 从既有 open 义务读取 source/version、目标与权限要求，不接受模型自填 verified 或确认标记。技术决定由主线程在原合同内作出；条件要求 user 时经原生确认，取消、自定义输入、缺失服务均不写入成功记录。确认等待后在锁内重新核对候选、义务合同与主线程权限。

回执按 decisionId 幂等，同 ID 不同绑定/内容拒绝；同一候选、同一义务合同下成功记录的新决定原子替代旧回执，旧记录保留为 superseded，取消替代不影响旧决定；不同 active/pending 版本互不替代；包含决定者、时间、源义务合同与候选版本。记录不直接关闭义务、不批准计划、不启动 Runner。Reviewer 显式引用 decisionId 和当前候选；Runtime 从持久记录读取并核验全部绑定，之后 convergence 才关闭。任意 Intent 的 answer_received/incorporated 状态不再被误认为该回执；旧 alternative_decision 不能自报通过。

## 范围与证据边界

这不是完整 T-06：未新增公共模块消费者发现、Owner 影响决定协议或跨版本自动移植决定，也未实现 Spec/Ticket 原子快照。候选变化需要重新给出当前依据，不会搬运旧决定绕过版本检查。保留原有批准门禁；完成结构/决定义务也不等于代码或整份计划获批。

主线程独占 control 测试和文档；合同代理独占 model/convergence 与对应测试；Runtime 代理独占 runtime/index、必要的工具权限与 plugin 测试。当前 main 工作区实施，保留起始脏状态，不提交、推送或建立替代分支/worktree。

正式范围为 convergence、model、control、plugin、security、plan-revision、workflow-state、agent-policy 八组。control/security 外层 180 秒，其余 60 秒；候选固定后不改源码或测试，结果见后续记录。

## 开发阶段诊断

冻结前实际入口定向验证覆盖原五个失败和新增决定/结构场景。开发过程保留了三类反例：旧调用快照仍投影已变化合同的决定；对归一化输出重算摘要导致旧原始计划绑定证据丢失；同候选新决定到达后旧回执仍为 current。修复分别采用持久状态重新核验、原始摘要与归一化校验分离、同版本回执原子替代。展示标题/分类不参与决定合同身份，合法 review/verify 子节点参与结构事实。正式测试前将再次冻结并一次性收集受影响回归。

## 固定候选正式结果

冻结时间 `2026-09-10T09:55:12.249349+00:00`。八组共 260 项：239 通过、0 失败、21 跳过、0 取消；超时 0 组，候选漂移 `[]`。候选指纹、起始状态、完整差分及原始日志见[证据](evidence.md)。

| 套件 | 通过 | 失败 | 跳过 | 退出码 |
| --- | ---: | ---: | ---: | ---: |
| convergence | 18 | 0 | 0 | 0 |
| model | 51 | 0 | 0 | 0 |
| control | 112 | 0 | 7 | 0 |
| plugin | 12 | 0 | 0 | 0 |
| security | 24 | 0 | 14 | 0 |
| plan-revision | 7 | 0 | 0 | 0 |
| workflow-state | 11 | 0 | 0 | 0 |
| agent-policy | 4 | 0 | 0 | 0 |

新控制测试通过真实 Runtime.reviewPlan → recordObligationDecision/原生确认 → 持久回执 → Runtime 当前性投影 → reviewPlan 关闭入口验证行为；新结构测试使用真实规范化候选及展开子树，并保留未执行的业务验证义务。模型回答、原生用户问询和底层命令由可控夹具驱动，不宣称真实业务用户或外部模型端到端通过。control 的完整 Workflow 仍包含既有 mock，CA-01 尚未运行。所有跳过均保留为未覆盖。

## 版本与现场

主仓库 main HEAD `154914064f5ceb2f8eb413865e10a54e8ffbc663`；本轮交付未提交候选，来源由源码指纹和相对轮次基线差分识别。未创建新分支/worktree、未 commit/push/stash/reset，未联网 fetch。结束核对包括主仓库和三个相关子仓库 HEAD、状态及 diff --check；本地 main 与 origin/main 跟踪引用一致不代表联网远端已刷新，子仓库历史不同步引用未擅自改动。

按已调用 [SKILL.md](</Users/admin/.codex/plugins/cache/ghost-agent-market/ghost-agent-skills/0.3.5+codex.20260908032011/skills/ghost-matt-implement/SKILL.md>)：“无论本轮通过或失败，都不自动修复审查发现，不自动启动下一轮”。正式测试后仅作只读审查与记录，本轮结束后不自动进入下一工单。

## 主线程复核

已逐项比对上一轮五个失败场景，本轮全部成功。主线程复核了输入 normalizer → 审查义务 → 主线程决定工具 → 持久回执 → 当前版本投影 → 显式关闭链路，以及 native 确认前后锁边界、active/pending 版本隔离、同版本替代和旧回执重放。测试使用真实 Runtime 保存/读取入口，未把业务决定改为无关 unit 绑定。

结构完成仅关闭其专属义务：例如父节点展开为 work 与 review 叶子后，未执行的业务验证仍保持 open。完整 Spec/Ticket 来源快照、公共 Owner 全量影响协议与自动跨节点义务迁移属于其余工单，本轮不声称已完成。

结束核对确认四个相关仓库 HEAD 均未变，diff --check 全通过，基线文件无缺失，main 对本地 origin/main 的 ahead/behind 为 0/0；候选无漂移。

## 独立审查与交付状态

独立只读审查未发现本轮新增的 P1/P2。审查覆盖回执主线程权限、子代理拒绝、原生确认前后版本核对、持久状态重读、不可变合同、决定替代与取消、当前记录消费及结构事实边界；未运行额外测试或修改源码。T-04 的业务/技术分类、T-05 的来源快照和 T-06 的公共决定协议仍按各自工单推进，不以本轮测试替代。

T-02 标记开发完成：已有统一的义务身份、受支持的关闭合同和真实消费入口，以及固定候选的正反例和回归证据。这里是局部开发交付，不是整个 R4 或 CA-01 集中验收完成。T-03/T-04 的接口前置已解除，记为待办，本轮不启动实施。

本轮结束，待讨论。全部实施代理停止写入；下一轮候选可选 T-03 或 T-04，由用户确定后再执行。

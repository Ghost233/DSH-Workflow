# 实机恢复与定向修复（2026-09-14）

> 后续实机尝试结果（2026-09-14 03:11）：摘要绑定修复已成功越过 Planner 提交。独立审查准确发现两个下游浏览器验证命令绕过统一 wrapper；这两个 verification ID 不在原修改边界内，Runner 却因只检查任务边界而自动恢复两次。最后一轮未提交可接受报告，现已正式结算为 failed，managed range 已停止。恢复额度现为 **0/12**；planVersion 仍为 2，16 个任务记录、活动 DAG、已集成成果和用户配置指纹全部保持。本次没有进入新业务执行，也没有修改源码或配置。此前下文“剩余 3 次、尚未实机重规划”是身份修复加载完成时的历史状态。
>
> 完整链路见 [后续恢复结果](identity-recovery-result.json)、[局部定义差异](identity-recovery-plan-diff.json) 和 [自动恢复边界缺陷](recovery-boundary-finding.md)。当前应先修复框架准入与可执行的恢复次数控制，再确定保留原历史和预算事实的正式恢复方案；不应原样重试或重置额度。

已按用户“确认，允许”的明确授权停止原 PID 92850，并始终使用无参数 `./start-owner-workflow.sh` 重启。随后两次为加载本轮自研修复重启自己启动的宿主。最终 Web、Owner、SoL、Synapse、自研审批均 ready。原浏览器 tab 1 / 3080 保留，未新开页面。用户 settings、credentials、cordis 配置的文件指纹与重启前一致；会话、任务、失败证据和旧隔离记录保留。

此前停服请求曾被自动审批拒绝，拒绝时未执行停服；用户明确确认后已解除该阻塞。该历史拒绝不是当前问题。

## Registry 恢复

发现 `change_registry` 准入仍无条件阻塞所有 quarantined attempt，未考虑已完成 project write authority retirement 的旧执行。修正只释放项目侧 Registry 准入：私有执行、占用容量、未释放资源锁及旧验证动作的隔离继续保留。未退休的项目写权限仍阻塞 Registry。

新增批准/拒绝两条回归先失败；修复后 engine 82 项、native Registry 与隔离退休 11 项通过。重启后原 pending proposal 原地进入原生审批，核对差异后选择“应用这批职责”，Registry commit 为 `799d708fd45b9cfe83744c17a9a5555e38af7e1d`。唯一职责变化是 build-tooling.scope 追加项目 `.npmrc`，没有删除 Owner 历史。见 [Registry 证据](registry-admission-fix.json)。

## R10 实机规划失败与修复

主线程在 Registry 正式生效通知后自动发起一轮 R10 重规划，消耗 1 次恢复额度，剩余 3/12。虽然仍受原整体目标授权，它没有遵守此前“先不 replan”的临时指令，这仍是本轮观察到的编排行为缺口。

Planner 执行约 5 分 32 秒，界面汇总 13 次工具调用，三次结构化提交均被摘要校验拒绝：第一次、第三次把当前摘要前缀与 previousPlan 的旧摘要尾部拼接；第二次直接提交旧摘要。它从未提交正确绑定值，却在最终解释中断言 Runtime 输入不一致。该断言不成立。完整值和结算证据见 [规划结果](planning-outcome.json)。

这个问题不应靠原样重试解决。自研原生 Planner 提交契约现在允许省略 registryDigest，Runtime 先验证 immutable admission，再从当前 Action 绑定该身份。明确提交冲突值仍拒绝；持久化 DAG 仍要求完整摘要，Owner scope 和来源篡改仍拒绝。没有放宽验证、重写旧报告或伪造成功。

修改先有 2 项失败回归；最终 21 项定向测试全部通过，覆盖原生工具省略摘要后的规划、独立审查、执行、修复、Registry 变更和交付，并覆盖来源篡改、Owner 越权拒绝。中间一次测试有 8 项因外层沙箱阻止 DSH 的 sandbox-exec 未能执行；移到外层沙箱外重跑通过，DSH 自身隔离保持。见 [身份修复](planner-identity-fix.json) 与 [最终日志](planner-identity-final.log)。修复已重启加载，但尚未再次发起 Coinhub 实机重规划。

## 保留状态与未完成项

- 原 Workflow `wf-90bbced7a68641494bb651e73f3c22d6ba4b3354`，planVersion 2。
- 16 个任务记录及当前 DAG 与本轮恢复前完全相同；1 成功、2 失败、13 待执行。
- integrationHead 保持 `1ef4949a3ba76a77d68db7613c72624438a97d8c`，已有有效成果没有被重规划抹掉。
- 旧隔离 attempt `try-84c42c9a1bfab47db78d05609603d719dcfd488c` 及其未确认私有执行继续保留。
- R10 规划未发布新 DAG，未进入新 Reviewer；错误提交结束后已正式结算，没有开启新的 retry。
- 原端到端业务验收仍未完成。浏览器 provider、foundation 完整交付、后续行为测试和最终构建门禁仍按 [恢复交付清单](../recovery-entry-checks.md) 验收。
- 工具可用性仍有已观察缺口：Registry operations schema 过粗，parentOwnerId 文档 null 与输入省略的表达不同，模型将 Glob 空结果误判为目录不存在。记录于 Registry 证据，不能把本轮定向通过描述为整个框架或 Coinhub 已跑通。

本轮没有提交或推送代码，没有改 DSH/第三方源码，没有修改用户配置来绕过问题。全部结果是定向修复和恢复证据，不是原业务验收通过证明。

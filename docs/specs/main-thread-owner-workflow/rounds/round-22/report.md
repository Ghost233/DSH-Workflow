# 第22轮：真实进程重启的安全暂停与失败回执重放

第22轮结束，待讨论。生产代码和合同未改变，本轮补充T-22跨进程故障证据。

新增两项真实SIGKILL场景：prompt已提交确认但Runtime未结算时强杀，新进程只能安全暂停；真实owner_submit failed及T13回执落盘后强杀，新进程只读返回原settled_failed。新旧进程PID不同，没有再次create/resume/followup，也没有模型请求。

父进程在确认SIGKILL退出后直接读物理文件作基线；新Context初始化后、对账后，目标Workflow state和reserved session JSONL逐字不变，预算与执行身份保留。原始检查点与kill后基线分开，未假定kill前停止所有合法日志追加。

正式13/13通过：新2项及原11项，零失败/跳过/超时，无正式补验，1619候选无漂移。submitted场景实际因sandbox:policy额外插件输入而paused/extra_or_wrong_input；这证明当前真实执行型历史的安全停止，不证明所有旧lease分支、自动resume、成功重启或任意故障点。

T-22仍开发中，T-23/T-15仍阻塞。下一轮先修F-19测试失败路径清理，再继续成功回执重启和创建后未提交窗口；本轮不自动进入下一轮。

[证据](evidence.md)、[原始重启证据核验](restart-artifact-audit.json)、[正式结果](test-results.json)、[候选](candidate.json)、[Git状态](git-final.json)。

无提交、推送或fetch；四仓HEAD不变，原有修改保留。主仓main与本地origin/main跟踪引用0/0；deepseek-harness保留behind1430、vendor/dsh-approve-for-me保留behind4、dsh-synapse仍detached；未联网核验远端最新状态。

## 审查结论

[独立审查](independent-review.md)未发现新增产品P1/P2，但确认F-19/P2：producer在fixture创建后、checkpoint之前失败或超时，父测试尚不知道root，可能留下测试临时文件。建议父进程启动child前预先登记专属临时容器，退出后统一清理，并验证checkpoint前故障路径。该缺陷不使本轮已完成的两份重启证据失效；不把未触发的失败路径描述成已确认本轮有遗留。

按[ghost-matt-implement](/Users/admin/.codex/plugins/cache/ghost-agent-market/ghost-agent-skills/0.3.5+codex.20260908032011/skills/ghost-matt-implement/SKILL.md)的“本阶段只给结论，不实施修复”，正式后本轮未修F-19。开发累计22轮、技术验证3轮、独立局部验收3次、集中验收0次；T-22状态不提升。

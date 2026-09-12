# 第 23 轮交付

F-19 已关闭：父进程在启动 child 前预分配独占临时容器。fixture 在容器内创建，child 退出后由父进程 finally 清理，检查点前失败也不再依赖 child 回传 root。

仅修改 recovery-session-fixture.mjs、recovery-session-restart-child.mjs、recovery-session-restart.test.mjs。生产代码、合同及原恢复断言未改。新增真实 Git/worktree 创建后、checkpoint 前失败用例，验证 child 退出、fixture 存在及容器清理。未动态注入 timeout，不宣称覆盖所有故障。

开发定向 restart 3/3 通过（development-restart.log）。冻结后正式 restart 3/3、recovery-session 11/11，合计 14/14，零失败/跳过/取消/超时，无补验；1619 文件候选无漂移。命令、起止时间、退出码和日志见 [test-results.json](test-results.json)。保留真实 Owner sandbox，正式测试在外层工具沙箱之外执行。

[独立审查](independent-review.md) 无新增 P1/P2。主线程 [原始证据复核](restart-artifact-audit.json) 确认两次真实 SIGKILL 后不同进程重开，postkill 到重开前/后物理 state/raw 不变，create/resume/followup/model 均为零。三个正式容器均已清理。submitted 实际仍为 extra_or_wrong_input 的安全暂停，不冒充全部 lease/fencing 分支已验收。

T-22 仍开发中，T-23/T-15 阻塞。下一轮候选为成功结算后的真实进程重启只读重放；创建后未 followup 窗口、其他结果与完整 runner 接线仍需后续工作。本轮结束，待讨论。

没有提交、推送或 fetch。四仓 HEAD 与基线相同，已有修改保留。当前 main 对本地 origin/main 跟踪引用 0/0；deepseek-harness 仍 behind 1430，vendor 仍 behind 4，dsh-synapse 保持 detached。这是本地跟踪引用核对，不是实时远端验证；详 git-final.json。

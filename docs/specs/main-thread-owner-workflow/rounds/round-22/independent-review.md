# 第22轮独立只读审查

审查者：t21_contract_review；主线程复核fixture创建、检查点/kill协议、清理路径和原始文件。无新增产品P1/P2，确认一项测试资源清理P2（F-19）。未修改源码、断言或合同。

## 证据成立的范围

两组原件均显示真实SIGKILL以及不同producer/replayer PID。postkill、replay-before、replay-after的Workflow state与reserved JSONL字节/哈希相同，透明create/resume/followup计数及模型请求为0。submitted实际命中extra_or_wrong_input保守暂停；settled_failed重放原回执。新2项及旧11项正式均通过，1619候选无漂移。

这不证明自动resume、跨进程fencing、所有未知单prompt分支、成功重启或T23整体验收。postkill基线早于新Context，checkpoint和postkill允许有合法追加差异。

## F-19 / P2：checkpoint之前失败时临时root无清理归属

recovery-session-restart-child.mjs:103、123使用{after(){}}创建临时Git/worktree fixture，child没有注册有效清理。父测试在killAtCheckpoint成功返回后才设置cleanup.root（recovery-session-restart.test.mjs:159、163等），root未知时清理直接返回（146）。错误IPC也不带root（child:220）。

因此在fixture创建后、checkpoint之前报错或超时，父进程可以杀死/reap子进程，却可能不知道它已创建的临时目录，留下测试worktree/JSONL。主线程接受这是测试失败路径的资源管理缺陷，不影响本轮两次成功采集的真实性；本轮正式并未触发此失败路径，不能声称已确认本轮遗留了目录。

最小下一轮建议：由父进程在启动child之前分配并登记本测试独占的临时容器目录，child fixture仅在该目录中创建root；无论checkpoint/error/timeout均在kill并等待退出后统一清理该已知容器。单靠错误IPC回传root只能覆盖能发送错误的路径，不能覆盖强杀/超时，故优先父进程预先持有清理路径。不得搜索删除不属于本测试的临时目录。补一个checkpoint前故障场景验证退出和清理，保留现有正向两项。

正式后不实施修复，留下一轮。

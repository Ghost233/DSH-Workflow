# R86：固定候选首次原子激活

T27 完成首次激活切片，工单整体仍为开发中。主线程现在可依次调用 `workflow_planning_compile`、`workflow_planning_review`、`workflow_planning_activate`，把固定 Spec/Ticket 快照、完整单 Owner 执行包、原 implementationScope 授权和独立审查回执发布成一个 approved Workflow。激活不再走 legacy 的逐计划人工批准。

激活只接受 candidate/review ID。Runtime 联合核验 checkpoint、HEAD/branch、live Registry、完整包、原授权、审查原始会话来源和零未关问题；未批准 Registry 提案、blocked 包、来源错配或规划外修改均零派发。持久事务记录 prepared/worktree_ready/active；同候选重放不新增 PlanRevision，同父两个候选竞争只出现一个完整 Workflow。无 journal 的同名 branch/worktree 不接管。

发布状态包含 planningSnapshot、planningPackages、candidate/review/authorization ID、PlanRevision 1 和 pending task。真实 control bridge 已从该状态执行 supervisor-start，Supervisor 随后只选择首个 ready task；因此候选已接到生产 Runner/Supervisor，而非仅生成 JSON。

固定候选八个有效套件共 246 通过、7 个 control 中既有显式 legacy 跳过，零断言失败、超时或漂移。正式采集器曾误写不存在的 external-runner 文件，零用例 exit 1 原样保留；同一候选补跑正确 runner 套件 10/10。不能把采集装配失败写成全绿。证据见 [candidate](candidate.json)、[初次结果](test-results.json)、[补正结果](test-results-runner-corrected.json)、原始日志与 [review](review.md)。

T27 尚未完成活跃父版本的 Spec/Ticket 修订、旧 attempt 权限/迟到结果迁移及 T18 受控接缝，状态保持开发中。[完整剩余审计](../round-85/t27-remaining.md)继续有效。T15、T17–T19、B02–B06 和 CA01 不因本轮通过而缩减。

本轮未提交、推送或联系远端。根 main HEAD 保持 `154914064f5ceb2f8eb413865e10a54e8ffbc663`；用户既有暂存、修改和未跟踪文件保留。测试中的 workflow branch/worktree 仅位于自动清理的临时 Git fixture。

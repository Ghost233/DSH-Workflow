# T-22 关闭矩阵（第26轮）

依据：T-22交付要求及验收映射、recovery-session-v1合同、T-23交付要求；不新增业务要求、不改接口。证据版本为第25轮candidate.json的1619项，当前无漂移。下表“具备”仅指局部开发证据，不等于T-23联合正向或CA-01。

## 已有可复用证据

| 编号 | 局部要求 | 证据与边界 |
| --- | --- | --- |
| E1 | 预留身份沿真实Owner链首次启动，冻结instruction与最终prompt | recovery-session.test:315，真实owner_submit failed和持久continuation；替换instruction/legacy复用被拒绝 |
| E2 | 真实failed/succeeded结算与同请求只读重放 | :315、:434；成功固定commit/task/receipt绑定、错session/commit拒绝；不能代替所有旧lease负向 |
| E3 | 未finish不算成功 | :541，真实deferFinish停在awaiting_finish；不能代表所有其他Owner结果 |
| E4 | 未授权/错prompt、压缩后端、lease冲突不启动 | :163、:192、:203、:266、:286；包含同进程、独立Runtime磁盘占用、初始化竞争、I/O及取消 |
| E5 | JSONL无日志/pending/单prompt terminal/重复与坏尾的事实读取 | :80、:101、:120；这是inspect层证据，不冒充全部Runtime对账分支已验收 |
| E6 | 真实跨进程created/submitted/settled_failed/settled_succeeded | restart.test:161、:192、:245、:292；第25轮正式5+11=16通过。created无物理日志且reserved预算保持；submitted命中extra_or_wrong_input，不等于干净单prompt的lease暂停分支 |
| E7 | checkpoint前失败资源清理 | restart.test:222；父容器预持有，实际Git/worktree创建后故障能回收。测试基础设施证据，不单算产品AC |

## T-22仍需关闭的局部证据组

这里只登记能被现有T-22要求直接追溯的有限组；发现失败按具体根因修，不新增无限故障排列。

| 编号 | 缺口 | 最小交付与判定 |
| --- | --- | --- |
| L1 | create/绑定失败没有提交prompt | 分别在真实create调用失败、真实create已返回但persistOwnerSession失败注入错误；验证followup/model为0、无成功/失败receipt、原reservation不退款、已创建handle释放。不要求失败时必定无raw文件，后端可能在抛错前物化；不得据此重送。不是再次验证已成功绑定后的SIGKILL |
| L2 | 其他Owner结果不伪造结算 | 真实blocked、handoff以及没有owner_submit三类；使用有效的正式结果入口，不造“已完成”状态；核对没有T13成功或failed continuation，保留额度，后续同request不重复派发。pending_check作为第四类必须覆盖：现有awaiting_finish仅验证task仍running，没有覆盖checkState pending_check |
| L3 | Runtime消费未结算/错绑定事实的负向闭环 | 复用真实fixture补preparing/creating、干净pending/running/observed-terminal及仅观察为interrupted、旧plan/attempt/lease绑定反例；逐项核对technical_pause或既定错误、state/raw不变、无create/resume/followup/model/settle。不以inspect单测替代Runtime；允许负向坏状态注入并标清来源 |
| L4 | 相关问题暂停不会阻断独立执行 | 同一Runtime及同一持久账本内暂停一项恢复后，另一无依赖冲突的受控Owner实际可启动；分别核对账本/身份。不能用两个完全隔离Runtime证明没有全局封锁 |

L1-L4是测试证据缺口，尚不据此认定四个产品缺陷。执行时在这些组内预先列出用例，不因其他文件存在未覆盖分支而扩大范围。

## 后续工单边界

- T-23：同事务领取到create/首次append/prompt接纳/receipt各边界的完整SIGKILL联合矩阵；跨进程同请求并发、不同请求争最后额度、损坏/失败保存、旧版本/lease及独立执行组合。消费并复用E6，补联合空白，不要求T-22先做完T-23才启动T-23。
- T-15：实际同版本恢复入口/runner/control接线、完整Supervisor投影一致性。
- T-16/T-17：取消确认、fencing、硬截止与再派发隔离；T-18/T-19：跨版本继承与配置启用。
- CA-01：全流程集中验收，不由T-22局部16项通过代替。
- 现行合同允许已有不确定会话安全暂停；不把自动resume或重新发送当成T-22新增关闭条件。

## 开发完成门槛

L1-L4有对应真实适配证据（或按实际调用链证明已由同一现有断言覆盖并经独立核验），候选冻结后受影响回归通过，独立审查无阻断项，矩阵每项绑定代码版本及原始日志，即可将T-22标为开发完成，提交T-23联合验证。不得要求T-15已接线或CA-01已通过。

本轮不改T-22状态；不承诺还需固定轮数，因为新增用例可能暴露产品问题。下一轮优先L1，其余仍按本表收敛，不重新以“其他结果/所有窗口”作无界任务。


## 后续关闭记录

第27轮：L1关闭，两个故障用例与受影响回归18/18通过，独立审查无新增P1/P2，见[报告](../round-27/report.md)。L2、L3、L4仍待补，原第26轮审计结论作为历史基线保留。

第28轮：L2前三类正式通过，pending组合用例最后精确reason断言F-20失败；L2未关闭，见[报告](../round-28/report.md)。实际pending_check由PlanRevision产生并伴随旧版本证据失效；不将内部后置暂停分支必须命中作为额外要求。下一轮修正测试期望并复验。

第29轮：F20修正、session17/17及独立审查通过，L2关闭，见[报告](../round-29/report.md)。当前L1/L2已关闭，L3/L4待补。

第31轮：F21与L3关闭，session26/26和独立审查通过，剩L4。

第32轮：L4关闭，正式32/32与独立审查通过，L1-L4齐备，T22开发完成、T23开始。

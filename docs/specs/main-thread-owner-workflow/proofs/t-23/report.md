# T23 联合验证报告

结论：在已批准的JSONL compression:none、单份受控恢复prompt、本地同版本Runtime范围内，P14-C联合验证正向成立。T23技术验证开发完成，解除T15的本项前置；T15负责后续真实入口接线，尚未实施完成，CA-01仍未通过。

## 证据与验收映射

完整逐项矩阵见[完成审计](../../rounds/round-41/closure-audit.md)，原始版本复用核对见[reuse-audit](../../rounds/round-41/reuse-audit.json)。当前候选1621文件中，1619生产/fixture/既有测试源与R32、R33完全一致；14项联合proof在R41重新正式运行，0失败/跳过/取消/超时，独立审查无P1/P2。R32 session27+restart5、R33 admission43作为各自同源的互补证据，不把轮次累加称为独立用例总数。

| T23 / 共同要求 | 证据 |
| --- | --- |
| AC-22、BUD-02：领取/创建/首append/prompt/结果回执边界中断，不重派 | R41 restart-artifacts中的保存前后、create前后、首append、ack前及成功/失败rename前；R32 created/submitted/settled failed/succeeded SIGKILL重放 |
| AC-24、BUD-03：同intent与最后额度跨进程竞争、重复结果不重扣/退 | R41 same-intent-concurrent-execution、distinct-credit-concurrent-execution、reserved-before-execution；R32 settled重放 |
| AC-31及安全停止：坏状态、保存失败、旧绑定、不确定会话 | R41 bad_row/torn_tail/bad_budget/admission-save-failure；R32 L1–L3真实Runtime负向状态/raw/API断言 |
| BUD-09局部：受影响恢复暂停不阻塞独立初次Owner | R32 L4在同Runtime/Registry/ledger真实执行T2到synced，T1 state/raw不变；完整控制投影归T15 |

所有SIGKILL均观察原子进程真实退出后再建立新Context/Runtime。模型输出是明确的受控MockAdapter；Owner工具、预算、租约、Registry、Git、JSONL及Runtime入口均真实。失败来源fixture和注入损坏被明确记录，不冒充真实生产错误或成功凭据。R32普通用例依赖固定源码具体断言与原TAP，未另存每例JSONL；重启与R41联合场景保存独立原始文件。

## 已证实的处理原则

- 未提交的来源/身份/扣减候选不能授权执行；实际保存失败不释放receipt或启动工作。
- 仅持久reserved、当前失败来源仍匹配且尚未登记create意图时，可以在Owner租约内走唯一首次启动；不能仅凭session文件缺失判定尚未执行。
- 模型可能已经开始而prompt尚未物理落盘；creating/created/submitted后不确定时保留身份与扣减，暂停受影响执行，绝不重送。
- Owner成功或失败回执必须正式提交才能被重放接受；临时JSON或单独Git提交不等于正式结算。成功结算前窗口验证真实固定SHA和workflow历史。
- 损坏日志、旧绑定与账本错误只读拒绝，不修写原始证据、不伪造失败、不退款。

## 限制与下一步

正向不是“任意故障自动继续”：未知时技术暂停是批准合同。未证明供应商幂等、任意崩溃自动续跑、物理断电、通用多prompt、跨进程强fencing、取消/deadline与跨版本继承；T16–T19及B01–B06/CA01仍按原依赖推进。不启用生产默认配置，不迁移legacy，不发布部署。

下一步实施T15：在显式有限配置和固定版本下，把Supervisor、直接Owner、恢复及会产生外部工作的局部重规划接入同一领取/对账入口，保持用户待决优先、独立初次任务可运行，并验证各入口一致。不得把本报告当成这些入口已经完成。

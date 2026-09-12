# T-23 联合验证覆盖清单

当前结论：T23有限联合要求正向完成，解除T15本项前置。历史盘点如下，以[最终报告](report.md)和第41轮完成审计为当前状态。消费T20真实reserve入口、T22局部reconcile、T21 compression:none保守后端合同。上游单测通过不等于联合场景通过。

| 要求 | 已有证据 | 还需联合证明 |
| --- | --- | --- |
| 保存前/后、来源/身份/扣减唯一 | R38写前/rename前SIGKILL负向，R34持久返回后SIGKILL再真实执行 | 已补该组边界；写入失败仍保留T20专项证据 |
| create前/返回后未绑定 | L1 API错误不发送 | 第33轮已补真实create返回后尚未绑定SIGKILL；create前/保存后待补，absence不作授权 |
| 绑定后未followup | restart created点，真实SIGKILL后只读pause | 可复用冻结版本证据 |
| 首append/prompt已接纳但回执未保存 | submitted检查点在flush和持久ack之后 | 第33轮已补flush后ack之前SIGKILL；首append更早窗口待补 |
| 已持久failed/succeeded回执 | restart两种结算后SIGKILL只读重放 | 可复用；结算保存前中断仍需补 |
| 不同请求争最后额度、同请求并发 | R35同intent实际执行竞争，R36最后额度实际执行竞争 | 两项已补；不代表Runner全入口接线 |
| 旧版本/旧lease、坏状态/失败保存、不确定会话 | L1/L2/L3局部及admission负向 | 联合真实持久状态/对账、原始证据、退出码 |
| 相关停止后无关执行 | L4同Runtime同账本T2真实synced | 组合受控执行/并发证据，完整Supervisor仍归T15 |

下一步对明确缺口逐一提供有界proof脚本；每个脚本在正式前冻结。不得在正式失败后修平台冒充原候选通过。已有四个SIGKILL用例无需因文件属于T22而重写；实际源hash/合同/原始artifact核验后引用。当前不声明T23完成或T15解锁。

第33轮正式boundary2+admission43=45通过，无失败/跳过/超时；两项边界证据在rounds/round-33/restart-artifacts。admission并发仍是领取层证据，不直接替代与实际启动的联合验证。

第34轮：reserve持久返回后SIGKILL、新进程按原identity真实failed提交并只读重放证据通过，boundary3/3。仍未覆盖保存前/原子写中断。

第35轮：两独立进程ready/go后竞争同份持久intent的真实执行，合计create/followup一次、model两次、实际owner_submit一条、budget1，第三进程只读重放，boundary4/4。不同请求最后额度+实际启动由第36轮继续覆盖。

第36轮：不同Owner请求竞争最后额度并关联真实启动，boundary5/5；获准方create/followup一次，拒绝方零执行且原Owner记录不变。额度请求沿用T20有界CAS/lease重试，原始冲突保留；不代表Runner已实现此调度规则。

第37轮：failed结算临时JSON写完、正式rename前SIGKILL联合证据boundary6/6。正式账本保持reserved、Owner submitted；新进程技术暂停且零执行，临时文件未被接纳。仅失败结算路径，成功结算路径及更早首append/领取写入仍待补；不代表自动恢复收敛。

第38轮：领取临时write前及rename前真实SIGKILL，boundary8/8；未提交候选identity由新Runtime拒绝，零执行/无扣减，正式state不变。R32冻结源与当前对比见rounds/round-38/r32-reuse-audit.json；其L3旧plan/attempt/lease、L4独立Owner执行按具体断言复用为对应子证据。剩余重点：首append更早边界、成功结果保存前、坏raw经Runtime消费；T20失败保存仍须明确与联合边界的证据关系。

第39轮：首个真实materialization append完成后的SIGKILL，boundary9/9。实际已有模型请求但raw尚无prompt，新Runtime保守暂停/零重复执行，额度身份保留。仅该首批边界；已落盘prompt到ack之前由R33覆盖，坏raw Runtime消费仍待补。

第40轮：成功结算rename前SIGKILL联合证据，boundary10/10。实际固定commit已在workflow历史中，正式Owner awaiting_finish未结算，新Runtime owner_success_unsettled暂停，branch/state/raw/temp不变且零执行。失败对应窗口见R37；结果保存后见R32引用。下一项坏raw/坏账本Runtime消费与保存失败联合证据，然后汇总完整矩阵。

第41轮：坏row/torn tail/坏budget/实际临时write失败由真实Runtime验证，正式14/14，独立审查无P1/P2。全部必要联合要求及复用证据经完成矩阵核对，T23开发完成，T15本项前置解除；历史“待补”是对应轮次状态，不再表示当前缺口。见[最终报告](report.md)。

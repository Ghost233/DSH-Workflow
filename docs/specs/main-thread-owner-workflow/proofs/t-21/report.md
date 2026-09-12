# T-21交付：真实会话与prompt持久合同

**T-21开发完成（技术验证产物），T-22可进入保守实现。** 显式session创建和已持久日志的重启恢复可用；固定prompt ID不提供全历史幂等，因此T-22必须先查询历史、复用已确认结果，未知或冲突暂停，不能重送。

## 实测结果

| 场景 | 真实观察 |
| --- | --- |
| lazy create后SIGKILL | 无artifact，与从未创建在磁盘上不能仅凭无文件区分；重启load拒绝 |
| 显式Agent创建、首次Session事件flush后SIGKILL | 独立进程load/resume成功；重复live/lazy/persisted创建拒绝 |
| pending inject并flush后SIGKILL | 队列重建保留，重复pending ID拒绝；resume不自动唤醒 |
| followup返回后立即SIGKILL | 本轮没有持久session；返回不是持久接纳回执，该窗口具有落盘竞争 |
| 适配器已收到请求、flush后SIGKILL | 原始日志没有turn/end；load会补interrupted，不能冒充真实Owner失败 |
| completed并flush后SIGKILL，重启后重送同prompt ID | 确实第二次执行：两条同ID user/message、两个turn、重启后多一次适配器调用 |

[正式汇总](summary.json)：2个session组、4个prompt场景全部完成，12个子进程、6次真实SIGKILL和6次独立重启，0采集错误/超时/stderr；1613项固定候选无漂移。这是验证正反结论的采集成功，不等于所有生产要求通过。[证据索引](evidence.md)保留首次装配失败、修正后的开发日志、正式命令/输出、真实JSONL及候选指纹。

## T-22的可实施边界

[消费合同](proposed-contract.md)及[独立审查](independent-review.md)明确：独立受控单prompt session；不盲目重送，不以无文件/PID判断从未执行，不以合成interrupted结算failed；读取旧结果前检查身份、原始终态、内容/来源及所有权，未知状态技术暂停且不退款、不冒充用户业务决定。`turn/end.completed`不是业务验收或T-13成功。

本次只验证JSONL compression:none。T-22接受终态前须用supportsRawArtifacts/readRaw验证原始日志完整性，并对照readFrom有效前缀和listSnapshots前后revision；该组合是T-22待实现/测试的消费要求，不是本次已证明的原子读取或session跨进程排他。其他后端/压缩格式、torn尾、版本变化、重复prompt、多输入或所有权不明一律暂停，直至获得专项证据。无需仅因followup非幂等新增Harness工单。

T-20接口已交付，本轮回填后T-22转待办；下一轮候选为T-22局部会话对账适配。T-23仍需联合崩溃验证，T-15/全入口启用未解锁。

本轮只改验证产物与规格/工单/进度，没有修改生产或旧正式测试。未运行真实模型、SQLite/zstd、物理断电或CA-01。技术验证累计3轮，代码开发仍15轮，独立局部验收3次，集中验收0次。本轮结束，待讨论，未自动启动T-22。

四仓HEAD不变，无提交/推送/新分支/worktree，原有修改保留。main与本地origin/main跟踪引用同为154914064f5ceb2f8eb413865e10a54e8ffbc663且0/0；未fetch，不宣称实时远端同步。

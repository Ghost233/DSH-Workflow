# 第16轮：T-22局部对账

本轮结束，待讨论。T-22仍为开发中；T-23/T-15继续阻塞。

交付了预留身份读取、真实未压缩JSONL完整性投影和Runtime保守暂停入口。原始packed记录需完整展开且与readFrom逐项一致；未知或错误输入不重送prompt，不将模型turn终态当作Owner结果。

首次Owner启动尚未启用。完整启动必须沿现有runExternalOwner/runOwnerEntry/createOwnerEntry接入，保留当前计划/Registry/依赖、工作区/分支/审计基线和owner_submit；仅复用provider setup不足以替代这些要求。本轮未实现resume、真实T13结算或recoveryContinuation。

正式测试9组：**357通过、0失败、21跳过、0超时**，**1617项候选无漂移**。新增5个测试真实使用T20领取和source Harness/JSONL，仅模型受控；没有验证完整Owner生产者、旧真实lease恢复或联合结算。开发阶段发现的Cordis服务读取错误已在冻结前修复，首次失败记录保留。

独立审查发现**F-16/P2：Owner lease被占用时返回异常，而非约定的技术暂停**。主线程真实最小复现确认，账本未变、无会话创建、无模型请求。审查者原评级P1；因当前入口未接runner且无重复执行或数据损害，主线程定为P2，接线前须修复。正式后未修改实现。

下一轮最小候选：先修F-16并补实际lease竞争用例；再评估把预留身份接入既有Owner启动/真实结果结算链路。不要继续增加与Owner执行链路分离的替代启动入口，不新增绕过条件。T-22完成及T-23放行必须以真实适配和故障序列为证据。

证据：[范围及测试明细](evidence.md)、[候选](candidate.json)、[正式结果](test-results.json)、[独立审查](independent-review.md)、[实际复现](lease-conflict-probe.log)、[Git状态](git-final.json)。

四仓HEAD与基线一致，无提交、推送或fetch，保留全部既有修改。主仓main对本地origin/main为0/0；依赖deepseek-harness master对既有跟踪引用落后1430，vendor main落后4，dsh-synapse为detached HEAD。这些依赖未被本轮更新，不声称所有分支与远端同步。

开发累计16轮、技术验证3轮、独立局部验收3次、集中验收0次。所有本轮代理停止写入。

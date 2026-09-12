# T-04 独立验收判定

验收代理：`/root/accept_t04`；独立只读 worker，gpt-5.6-terra / xhigh。范围：固定第10轮候选，核对 T-04 / AC-14 合同、正式结果、跳过审计及实际 Runtime 补充证据；未修改源码或运行另一轮全量测试。

结论：**FAIL — F-13 / P2 confirmed**。

当前且已接纳的业务变化或权限依据与预算错误同时出现时，`classifyFailure` 在检查有效依据前先返回 budget_exhausted。实际 Runtime 补充证据证明：权限缺口加普通连接错误正确转 request_user_authority；权限缺口或业务变化加 token budget exhausted 均错误转 local_subgraph_rewrite，T1 pending，未通知主线程；纯技术加同错误则正确自主恢复。

已有正向证据仍有效：候选相关源码及测试摘要一致，正式292通过、0失败、21项显式跳过。R08验证技术关键词不创造人工门禁；R09验证冻结/current source、session、attempt、plan与Owner绑定；R10验证直接Owner blocked/failed收据及独立任务继续。但这些用例没有覆盖用户依据与预算文本并存时的优先级。

这是 T-04 核心合同缺陷，不能以持久预算生命周期在范围外排除：真实权限缺口或业务变化需要保留用户待决，不应由偶发技术错误文案覆盖。

原始证据：[supplement.log](supplement.log)、[candidate-audit.json](candidate-audit.json)、[formal-results.json](formal-results.json)。主线程复核并采纳该结论，详见[验收报告](report.md)。

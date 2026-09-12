# 第17轮：F-16修复

本轮结束，待讨论。**F-16已修复，独立审查未发现新增P1/P2**；T-22仍为开发中，T-23/T-15继续阻塞。

Owner lease被占用、初始化中或有限获取竞争未解决时，新对账入口返回结构化技术暂停。只转换获取边界的明确冲突；取消、普通IO和已经持有lease的失效仍报错。未获lease的调用不读取Workflow/session，也不释放其他持有者。没有启用首次Owner启动或业务结算。

定向真实Harness/T20测试8/8通过，覆盖同进程不同task、同task重入、独立Runtime共享真实磁盘lease、初始化、IO及取消。正式其余8组按既定预算执行，control在180秒超时：已记录130通过/7跳过，未出现断言失败；只对剩余29项做精确选择的有限补验，29/29通过。

**合并去重观察到360通过、0断言失败、21既有跳过；保留1次control套件超时。** 不宣称完整单次control通过或0超时。匹配用例的耗时中位数约为上轮3.44倍，但原因未证实。未修改候选或提高测试预算；1617项最终指纹无漂移。

下一轮候选：继续T-22，把预留会话身份接入现有runExternalOwner/runOwnerEntry/createOwnerEntry与真实Owner提交/失败结算链路；保留已有审核、Owner工作区和提交门禁，再生产T13回执与延续引用。本轮未启动这部分，也不以局部修复替代完整T-22验收。

证据：[测试明细](evidence.md)、[正式结果](test-results.json)、[control补验](control-supplement.json)、[独立审查](independent-review.md)、[候选指纹](candidate.json)、[Git状态](git-final.json)。

四仓HEAD未变，无提交/推送/fetch。主仓main对本地origin/main为0/0；依赖deepseek-harness master保留原有behind1430、vendor main保留behind4，dsh-synapse仍detached。没有更新这些依赖版本，原有修改完整保留。开发累计17轮、技术验证3轮、局部独立验收3次、集中验收0次。所有本轮代理停止写入。

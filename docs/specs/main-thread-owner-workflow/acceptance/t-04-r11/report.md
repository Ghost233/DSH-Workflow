# T-04 第11轮候选独立局部复验

日期：2026-09-10。结论：**验收通过（T-04 / AC-14 局部合同）**。范围：R4 / T-04 / AC-14 的结构化分类与既有实际控制路由。用户“继续”授权本次复验，不启动第12轮开发。前次失败报告保留于 [t-04/report.md](../t-04/report.md)。

## 固定候选与复用范围

[候选审计](candidate-audit.json)核验第11轮冻结于 `2026-09-10T13:34:23.936121+00:00` 的64项源码、测试及本地依赖产物，全部一致。复用[正式十组结果](formal-results.json)：**308通过、0失败、21显式跳过**，0超时、0取消、0待办；未重复整轮测试。原始十组日志保存在[第11轮证据目录](../../rounds/round-11/evidence.md)。

[跳过审计](skipped-audit.json)重新逐项匹配当前源码显式 `test.skip` 和第11轮原始日志，确认21项均属已替代的旧协议测试；分类、反馈、审批和提交边界由当前实际入口回归覆盖。不把skip算作通过，也不借skip排除T-04必验路径。

## 原失败场景复验

复制前次 [supplement.mjs](../t-04/supplement.mjs) 和 [fixtures.mjs](../t-04/fixtures.mjs)，内容逐字不变；路径层级相同，实际加载本轮当前生产模块。仅在隔离临时Git夹具内运行真实反馈接纳与Supervisor失败结算，错误由脚本注入，不冒充外部服务实测。

[命令与脚本摘要](supplement-run.json)、[原始输出](supplement.log)：**4通过、0失败**，退出码0。脚本原有通过标志检查策略；主线程另对完整持久状态和通知数逐项核验，记录于[状态审计](supplement-state-audit.json)。

| 当前事实 | 错误文本 | 预期及实际 | 判定 |
| --- | --- | --- | --- |
| 权限缺口 | 连接失败 | request_user_authority；stopped / await_user；1条通知 | 通过 |
| 权限缺口 | token budget exhausted | request_user_authority；stopped / await_user；1条通知 | 通过 |
| 业务变化 | token budget exhausted | request_user_authority；stopped / await_user；1条通知 | 通过 |
| 纯技术事实 | token budget exhausted | local_subgraph_rewrite；pending / 无action；0条通知 | 通过 |

4项都保留实际接纳的deviation ID及来源。原先两个失败现在正确保留用户依据，F-13的实际Supervisor复现已消除。补验结果单独记录，不和正式308项重复相加为全仓验收数字。

## T-04完整局部合同映射

| 交付要求 | 第11轮固定候选的证据 | 覆盖界限 |
| --- | --- | --- |
| 技术“用户/token”措辞不产生人工决定 | convergence分类反例、control R08实际Review路由/技术discussion拒绝 | 技术问题仍交编排者处理 |
| 业务承诺差异或权限缺口才建立用户待决 | model严格分类来源合同；control R08业务/权限/混合Review；R09实际Owner反馈接纳 | Owner观察报告有绑定，不等于外部权限已授予 |
| 问题呈现绑定冻结事实，遗漏不抹掉待决 | control R08旧open义务保留；R09首次问题投影及同attempt拒绝覆盖 | 不靠Reviewer自由文本决定权限 |
| 执行反馈来源当前、不可越权或跨attempt复用 | control R09接纳/消费时核验Owner、session、attempt、plan、authority；R11过期session反例 | 非当前依据不带入用户门禁 |
| 有效用户事实优先于预算等技术文本 | R11四入口×权限/业务/技术/过期session的16项；本次旧4场景复验 | 普通恢复与重复恢复都消费当前依据 |
| 真实待决仅停受影响任务并反馈主线程 | R09实际Supervisor、R10真实直接Owner非成功收据及通知投递/T2调度；R11检查局部状态/通知 | R11的T2断言是pending，实际调度证据来自仍通过的R09/R10 |
| 保留原审批及成功提交边界 | R05真实决定入口/原生确认取消及候选竞争；R09未决不得completed；plugin/security/agent-policy/owner-submission正式回归 | 报告不是同意回执，不提供自动授权 |

测试名称与断言位于当前 `owner-workflow-plugin/test/{control,convergence,model,plugin,security,agent-policy,owner-submission}.test.mjs`，指纹纳入候选。R11直接Owner替换模型回合注入错误；技术恢复入口哨兵只证明开始下一次执行，不证明下一次任务完成。没有真实在线模型或外部服务端到端验证。

## 最终判定与边界

独立验收者和主线程均判定 **PASS**，见[independent-review.md](independent-review.md)。T-04标记验收通过；开发轮次仍11，独立局部验收累计3次（T-03通过、T-04首次失败、本次复验通过），集中验收0次。T-09的身份、进展、分类前置已有实际证据，转待办但不启动。本次复验结束，待讨论。本报告只覆盖T-04局部合同；B-01完整规划版本切换、T-09持久恢复预算、B-04和CA-01仍需各自证据，不能由本次局部测试替代。

本次没有修改生产或正式测试源码。[结束检查](final-checks.json)确认64项候选零漂移，四仓HEAD与第11轮起始相同、diff --check通过。原有脏工作区保留，无提交或推送；main相对本地origin/main跟踪引用0/0，未fetch，不宣称远端实时状态。

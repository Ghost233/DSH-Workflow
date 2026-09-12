# T-04 独立局部验收报告

日期：2026-09-10。结论：**未通过，F-13 / P2；T-04 退回开发中**。

用户“继续”授权验收第10轮交付的 T-04 / AC-14，不启动第11轮开发。依据 R4 5.4、5.10 及 T-04：技术事实与业务变化/外部权限缺口决定路由，关键词不能覆盖事实。本次没有修改生产源码、正式测试断言或规格。

## 候选与证据

复用第10轮冻结于 `2026-09-10T12:51:22.527607+00:00` 的候选。[候选审计](candidate-audit.json)记录64个源码、测试及依赖产物指纹；[结束检查](final-checks.json)确认零漂移。已有正式十组结果为 **292通过、0失败、21跳过**，未重复整轮运行，见[正式结果](formal-results.json)与[第10轮证据](../../rounds/round-10/evidence.md)。

[跳过项审计](skipped-audit.json)逐项对应21个显式 skip 及其替代覆盖/不适用原因；没有将这些跳过当作通过。补充场景单独记为 **2通过、2失败**，不与已有正式结果混成全仓验收数。

## 验收映射

| T-04 要求 | 固定候选证据 | 判定 |
| --- | --- | --- |
| “用户/token”等技术措辞不自动请求人工 | convergence 的结构化分类反例、control R08 实际 Review 路由 | 已覆盖 |
| 业务变化/权限缺口携带来源，分类与 authority 一致 | model 严格来源合同；control R09 实际反馈接纳及越权/过期/错误绑定拒绝 | 已覆盖 |
| 用户问题来自冻结的结构化事实，漏报不消除已有待决 | control R08 保留用户义务、R09 首次问题投影及同 attempt 防降级 | 已覆盖 |
| 真实待决只停止受影响任务，独立任务继续 | control R09 Supervisor 与 R10 直接 Owner blocked/failed 结算、T2 调度及通知 | 普通错误已覆盖；预算混合错误失败 |
| 有效用户依据不能被技术文本覆盖 | 本次实际反馈接纳→failSupervisorReservation 四场景 | **失败，F-13** |
| 保留原生审批、取消、旧入口兼容 | control R05 决定入口与版本竞争、plugin/security/agent-policy、R10 旧 blocked 反例 | 已覆盖 |

证据位置为当前 `owner-workflow-plugin/test/{convergence,model,control,plugin,security,agent-policy}.test.mjs`；R08/R09/R10 是稳定测试名称前缀。仅判定局部合同，不代替 B-01 新旧规划切换、T-09 持久预算或 CA-01 集中验收。

## F-13 / P2：预算关键词抢先覆盖有效用户依据

`owner-workflow-plugin/src/convergence.mjs` 的 `classifyFailure` 先匹配预算错误并返回 `budget_exhausted`，随后才读取 `failureAuthorityBasis(context)`。因此当前、已接纳的业务变化或权限缺口会在预算文本出现时被忽略，`selectFailureRecovery` 转而选择 `local_subgraph_rewrite`。

[补充脚本](supplement.mjs)使用[固定候选夹具摘录](fixtures.mjs)、隔离的临时 Git 仓库及真实租约，实际调用 Owner 反馈接纳和 Supervisor 失败结算。注入的是可控错误，不宣称发生真实外部服务故障。[运行记录](supplement-run.json)保存命令、脚本摘要和起止时间，退出码1；[原始日志](supplement.log)保留全部4项，独立场景在失败后继续完成。

| 已接纳事实 | 后续错误 | 实际路由与状态 | 结果 |
| --- | --- | --- | --- |
| 权限缺口 | 连接失败 | request_user_authority；stopped / await_user；通知1条 | 通过 |
| 权限缺口 | token budget exhausted | local_subgraph_rewrite；pending / 无 action；通知0条 | 失败 |
| 业务承诺变化 | token budget exhausted | local_subgraph_rewrite；pending / 无 action；通知0条 | 失败 |
| 纯技术事实 | token budget exhausted | local_subgraph_rewrite；pending；通知0条 | 通过 |

失败场景中持久化 deviation ID 与实际接纳 ID 相同，绑定来源仍当前。原因不是反馈丢失或版本过期，而是分类优先级。它违反 T-04 的事实分类合同，不属于可以推迟给 T-09 的持久预算问题；本次也未证明原生权限被绕过或真实业务操作已经发生。

## 独立判定与后续范围

[独立验收者](independent-review.md)只读核验后同样判定 FAIL，确认 F-13 / P2。下一轮最小修复方向：先处理当前有效的结构化用户依据，再按文本选择技术恢复；同时保留纯技术预算恢复、来源核验及旧审批边界。补充真实 Supervisor、直接 Owner 和恢复入口的混合场景，防止各入口再次出现相同降级。

本次结束，待讨论。T-04 开发中；开发轮次仍10，独立局部验收累计2次（T-03通过、T-04失败），集中验收0次。四仓 HEAD 未变、diff --check 通过、原有文件保留；无提交或推送。main 相对本地 origin/main 跟踪引用为0/0，未 fetch，不据此宣称远端实时状态。

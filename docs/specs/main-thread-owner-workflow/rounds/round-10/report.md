# 第 10 轮：修复直接 Owner 待决结算与兼容回归

本轮结束，待讨论。**T-04 开发完成**，未标记独立验收通过。F-12 直接 Owner 路由与第9轮两项兼容失败已修复；正式十组292通过、0失败、21跳过，独立只读审查未发现新增P1/P2。

## 范围与候选

用户同意继续下一轮，按第9轮已列最小修复范围执行。主线程独占 runtime/index/agent-policy/control测试与文档，独立审查者只读。规格为R4 5.4/5.10，工单T-04 / AC-14。没有启动T-05/T-09或CA-01。

冻结时间：2026-09-10T12:51:22.527607+00:00。主仓main HEAD：`154914064f5ceb2f8eb413865e10a54e8ffbc663`。本轮4文件差分和完整候选指纹见[原始证据](evidence.md)，不能以HEAD代替未提交候选。冻结后没有修改代码或测试。

## 修改与原因

- 直接 runExternalOwner 的异常结算不再因 Owner 收据为 blocked 而丢弃当前结构化用户分类。权限/业务依据有效时，创建绑定原反馈的待决通知，保留 Workflow running 与独立节点调度；没有结构化依据的旧blocked行为保持。
- 该路径日志改为 owner.authority-required 并保留实际说明，避免局部待决时仍记录 workflow.blocked。
- 新反馈工具放在既有 owner_host_exec 之后注册，恢复原前四个工具位置。早期 activeOwner-only 限制仅适用于新反馈工具，既有工具恢复原策略及提示；Runtime实际角色/权限校验保持。
- 新增4个完整Owner生命周期回归：权限blocked、权限failed、业务blocked、旧普通blocked。临时真实Git/lease与真实 runExternalOwner/createOwnerEntry/runOwnerEntry/persistOwnerSession/反馈/提交/异常结算均执行，仅runChild模拟模型输出。前三项还验证实际通知投递与supervisor-next创建独立T2，未产生成功提交结果。

## 验证

开发阶段定向6/6通过（4个新用例＋2个原失败用例），没有放宽原兼容断言。固定候选十组正式一次采集：**292通过、0失败、21跳过**，共313项，零超时/取消、候选无漂移。control/security/runner外层180秒，其余60秒；Node v24.12.0，--test-force-exit。

| 套件 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- |
| convergence | 24 | 0 | 0 |
| model | 51 | 0 | 0 |
| control | 143 | 0 | 7 |
| security | 25 | 0 | 14 |
| plan-revision | 7 | 0 | 0 |
| workflow-state | 11 | 0 | 0 |
| runner | 8 | 0 | 0 |
| plugin | 13 | 0 | 0 |
| agent-policy | 4 | 0 | 0 |
| owner-submission | 6 | 0 | 0 |

21项跳过为原有明确停用的旧Owner/逐写入包装/旧次数Planner用例（control7、security14），未计为通过。本轮所有新增用例以及第9轮两项失败用例均实际通过。开发结果不重复计入正式计数。

## 审查与边界

[独立审查记录](independent-review.md)核对本轮四文件差分和真实结算路径，未发现新增P1/P2；主线程亦核对没有变更来源、lease、原生审批和义务/预算合同。独立审查返回时部分套件仍在运行，最终全十组结果由主线程核实。

T-04已达到开发完成条件，但尚未进行独立局部验收；下一步候选是基于本轮固定候选核对AC-14与相关正反例。跨版本激活、真实外部服务权限实验、完整代表场景及Workflow总预算仍属后续既定范围，未据本轮回归宣称完整R4验收通过。

主仓与三个关联仓库HEAD保持，diff --check通过，起始已有路径未丢失，未提交或推送。main相对本地origin/main引用ahead/behind为0/0；没有fetch，未声称实时远端核验。按ghost-matt-implement完成本轮后停止，未自动进入下一工单或验收。

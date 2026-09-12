# 第12轮独立只读审查

结论：存在 **F-14 / P2：跨 attempt、跨字段回执引用可以复用**。T-13保持开发中，T-14前置不解除。本轮结束，待讨论。

独立审查者review_budget_r12审阅冻结源码、测试和接口说明，核对正式118通过、0失败、0跳过及候选摘要；主线程随后只读复现两个方向及JSON导入，确认缺口。正式测试通过不覆盖这个反例。

## 根因及影响

接口合同规定executionRef与result.reference标识具体执行/结算回执，在同Workflow内不能由两个attempt复用。源码normalizeRecoveryBudget分别维护executionReferences和resultReferences；startRecoveryAttempt仅检查其他attempt.executionRef，settleRecoveryAttempt仅检查其他attempt.result.reference。因此P1的执行引用可被P2作为结算回执，反向也被接受；JSON导入同样接受。这破坏回执与attempt唯一关联，但本探针未发现额度退款或额外派发，不能夸大成已证明预算绕过。

定位：[导入检查](../../../../../owner-workflow-plugin/src/recovery-budget.mjs:216)、[开始检查](../../../../../owner-workflow-plugin/src/recovery-budget.mjs:375)、[结算检查](../../../../../owner-workflow-plugin/src/recovery-budget.mjs:399)。

## 主线程只读复现

创建Workflow w（总额度4），注册p1、p2（各额度2、来源各不相同），分别领取a1/a2。使用引用{id:"shared",version:"v1"}：

1. a1先start，然后a2以相同引用失败settle，实际outcome=settled。
2. 从两次领取后的原快照，a1先失败settle，再a2以相同引用start，实际outcome=started。
3. 第一种结果JSON往返后normalize接受，两条attempt，totalUsed仍为2。

原始观察见[review-probe.json](review-probe.json)。仅有限内存计算，无外部启动/持久写入；没有改正式测试或重跑正式套件。

## 下一轮最小修复建议

统一以{id,version}到attempt身份的关联检查，同时覆盖在线start/settle与导入校验；跨字段引用落到另一个attempt时拒绝。保留同attempt合法重放及按root记录的共享evidence.reference，不能恢复证据全局去重。补上述两个调用顺序、导入数组顺序及同attempt/共享证据正例。修复后再冻结和运行定向及受影响回归，不在本轮实施。

其余已核查范围未发现新增P1/P2：两级额度、完整绑定、重放、根问题来源、按root证据/关闭及输入不变性。持久事务、并发、真实问题来源与事实真实性、Runtime接线仍需T-14以后验证，不作为本纯模块的额外实现要求。

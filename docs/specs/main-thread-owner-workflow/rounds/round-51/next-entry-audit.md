# 后续入口核对（不是本轮完成声明）

当前 source evidence：workflow-state.mjs 的 hasAutonomousIncident 在所有其他控制分支前将任务incident路由到 convergence-probe；protected probe保守暂停record incident，仍需统一的技术暂停/独立任务控制投影。

supervisor.mjs nextReceipt 先派发独立ready，再在全completed/stopped时stop；如存在依赖失败任务的pending后继但没有ready/active，最后回落main decision_required。这必须在T15统一投影中区分技术依赖阻塞与真实用户依据，不能把技术暂停转成人工产品决定。当前R51新增用例只验证独立T2，不证明必要后继投影已完成。

规格12.5要求问题/Workflow预算耗尽范围分开、主投影/直接Owner/Supervisor一致。后续应以实际根问题与依赖关系生成技术报告，并保留独立初次执行，不修改规格来适配现状。另有timeout和外部replan接线未完成。

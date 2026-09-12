# 恢复账本执行版本继承 V1

实现：[recovery-admission.mjs](../../../../owner-workflow-plugin/src/recovery-admission.mjs) 与 [runtime.mjs](../../../../owner-workflow-plugin/src/runtime.mjs)。本合同承接 T-18：一个已审查 PlanRevision 激活新执行版本时，开放根问题、两级预算及旧 attempt 历史不能因拆节点、改名或 Owner 移交而重置。

## 持久边

`state.recoveryExecutionTransitions` 是从 `state.recoveryAdmission.executionVersion` 到当前 `state.recoveryAdmissionConfig.executionVersion` 的连续有序边：

```js
{
  contract: 'DSH_RECOVERY_EXECUTION_TRANSITION_V1',
  workflowId: state.id,
  parentExecutionVersion: 'active-parent-plan-digest',
  executionVersion: 'reviewed-next-plan-digest',
  parentPlanRevision: 1,
  planRevision: 2,
  sourceRequestId: 'persisted-recovery-request-or-plan-revision-reference',
  rootMappings: [{
    rootProblemId: 'existing-open-root',
    fromTaskId: 'parent-task',
    fromOwnerId: 'parent-owner',
    toTaskId: 'replacement-or-child-task',
    toOwnerId: 'next-owner',
  }],
}
```

对象与嵌套映射采用精确字段。边必须绑定同一 Workflow，父 digest 等于激活前 digest，子 digest 不得等于父 digest，revision 必须恰好递增一。多轮边必须首尾连续并最终到达配置中的当前执行版本。每个映射引用已经存在的 root；同一子版本 task/Owner 不能同时指向多个 root。

## 激活事务

`approvePendingPlanRevision` 在修改活动计划前构造并完整导入探测该边。已有开放 root 必须在新计划中至少有一个目标：同 ID task 自动保留，Owner 可随已审查计划改变；恢复候选还可把来源映射到显式 composite child，以及被所选 Owner handoff 文件完整覆盖的目标 task。恢复候选的 `recoveryRequestId` 必须找到持久 intent，由该 intent 决定 root，调用者不能提交 root ID。

计划、PlanRevision、当前配置版本及新边只经过一次 Workflow 状态保存发布。父版本已变化、恢复请求不存在、开放 root 无目标、目标不在新计划或完整导入失败时，不写入任何一部分。两个调用竞争同一父版本时，只有持锁后仍看到候选的调用能成功。

## 新旧执行

账本的起始 `executionVersion`、旧 source、intent、attempt、root、problem used 和 workflow totalUsed 保持不变。新版本失败以自身 plan/task/Owner/attempt 形成新 source；若其目标命中当前版本映射，直接继承映射 root 并继续消耗原问题额度及同一 Workflow 总额，无需伪造旧 `recoveryContinuation`。连续 PlanRevision 通过边链传递同一 root。

旧版本请求不能在新版本重新领取或启动。已经启动的旧恢复 attempt 仍按其原 intent/session/prompt/lease/generation 与持久 terminal 结算一次，不能再次扣减；普通旧 Owner 的停止、迟到提交与归档继续遵守 T17/R90 的 attempt-control 门禁。版本边被删改、断链或指向不存在 root 后，任何恢复导入都关闭处理且不新增扣减。

# R95 T28公共Owner决定会话实现报告

## 结论

T28/B-02开发完成。Runtime现在使用固定Owner、请求、执行上下文和prompt创建专用只读判断会话；只有 `workflow_public_owner_decision_submit` 的原始成功工具回执可以登记T06决定。普通assistant文本、错误Owner/request、重复或冲突提交、过期PlanRevision和不确定创建都不会解锁执行。

判断会话保存独立session身份、阶段、原始工具序号和decision digest。fresh Runtime从JSONL重新对账，已结束请求不重发模型。登记前再核对当前PlanRevision/digest；K1判断在K2生效后仅持久化为 `stale` 历史。

## 调度与主线程行为

活跃consultation reservation会占用Supervisor并行槽，并将相同Owner标为忙；不同Owner仍受全局 `parallel` 上限约束。内部deadline持久化为 `settled_timeout/deadline_exceeded`，父取消持久化为 `settled_cancelled`；两者只在原始session终态确认后释放预留。

T06六类结果投影到持久 `mainOutbox`。兼容扩展产生 `implement_public_extension`；业务承诺变化产生 `user_decision`，不自动改DAG。重放时会核对通知的Workflow/request/Owner/outcome/action/summary绑定，已篡改通知不能被当成幂等结果。

## 固定证据

T28专项9/9通过。最终受影响回归串行运行八套，共115项：101通过、14个既有legacy跳过、0失败、0取消，耗时37035.848375ms。范围包含T06协议、T08真实会话、T28生产会话、既有Owner advice/Planner/Review回收、Supervisor、security与plugin注册。

首次补验暴露两个测试/分类问题：内部timeout原始终态与父取消均为aborted，需要Runtime保留 `DSH_CHILD_TIMEOUT` 来分类；业务决定用例初次引用了不在请求source中的AC-06，T06正确拒绝。修正为已绑定AC-05后专项9/9和最终115项均通过；未放宽生产校验。

## 保留边界

B-02只生成可对账的决定与主线程动作。仅公共Owner写公共模块、公共实现成功后解锁A/B、路径/资源联合互斥、提交幂等与完整CA-01仍由B-03/F10及CA-01验收。

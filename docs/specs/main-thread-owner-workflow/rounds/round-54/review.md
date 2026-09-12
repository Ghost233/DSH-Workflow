# R54 只读审查

独立审查者：t21_contract_review。审查生产 runtime.mjs 与 runtime-recovery-budget.test.mjs 的本轮差异，正式测试和审查期间未修改候选。

结论：无新增 P1/P2。取消目标核对实际 active Owner、child、attempt/session/lease 和有效租约，先持久请求再异步取消；不提前改写 Owner/task 或释放槽位。取消错误记录比较 requestId，避免旧异步错误覆盖新请求。实际管线终止后沿现有真实失败处理进入预算恢复。

证据边界：实际 idle timeout 场景通过；不是固定硬截止，不证明未知跨进程终止，也不证明任意同 Runtime 直接调用立即拒绝。不可据此标记 T15/T16/T17 完成。

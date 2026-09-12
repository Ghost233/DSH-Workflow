# R84 审查

独立审查者 t21_contract_review，只读检查固定快照、Planner、执行包、Owner prompt 与候选持久化；主线程核对实际证据。

已关闭：所选 Ticket 含 C1/C2 时绑定只列 C1 仍通过，导致遗漏共同合同。编译器现在要求完整合同 id/revision 集相等，新增 missing-known-contract 负例。

设计确认：同一 ready fragment 可由多个单 Owner task 共同贡献，不能要求每片段只有一个 task。完整 Ticket/AC 保留，acceptanceIndex 汇总贡献者。候选持久化不创建 Workflow/OwnerRun；Registry 操作只是未激活提案，T27 必须重新核验。

开发验证定位：编排的普通 Git status 会刷新 index stat cache，现已在该路径所有 status 调用中启用 --no-optional-locks。原始 index 字节断言位于后续无关 preflight 之前，固定快照测试同时证明 HEAD 不变。首次开发失败及后续日志保留；未削弱字节断言。

最终增量复审：未发现新的确认 P1/P2；确认三次只读 Git status、公共 tool definition 的实际复用、根身份与候选篡改拒绝、T27 激活责任边界。此结论不替代正式测试结果。正式测试期间实现、测试及合同保持冻结。

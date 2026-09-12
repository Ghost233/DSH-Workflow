# R85 独立审查

审查者 t21_contract_review 只读检查生产接线及边界。

确认并修复 P2：正式 ownerWorkflowChildProvider 的 role binding 未保存 planningCandidateId/parentId；原 native 服务替身展开 pending.options，掩盖生产缺口。正式 provider 现显式绑定两项。补实际 AgentRegistry.create、AgentLoop、Subagent provider、原生工具提交再持久重读回执测试；仅模型传输使用 MockAdapter。

审查阶段实际 Runtime 入口的集成用例仍使用外部 Subagent 服务替身；新增实际 provider 测试独立覆盖子代理创建到原始提交，再组合持久回执。明确这两类证据，不宣称同一测试已覆盖完整原子激活或整个 T27。

主线程补现场检查：selected Markdown 即使前后同为 dirty，字节变化也拒绝；Git status 使用只读选项。迁移仅比较当前任务引用的验证定义和规划绑定，无关节点保留；Runtime 直接分类调用已传两侧计划。

最终增量复核未发现新增确认P1/P2；此前provider接线P2已关闭。正式结果独立记录。T27仍开发中，原子激活、父版本/授权/义务联合门禁、竞争/重启、原权限内旧attempt结算与实际派发需继续实施验证。

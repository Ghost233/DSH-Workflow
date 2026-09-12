# R84：固定快照到单 Owner 执行包

T26 开发完成：主线程通过 `workflow_planning_compile` 调用生产 Planner 路径，将 T25 固定快照编排为可持久化 DAG 候选和单 Owner 执行包。实际激活由 T27 承接，当前不创建 Workflow/OwnerRun，不宣称 B01/CA01 验收完成。

每包保留完整原始 Spec/Ticket/AC、合同版本和原始授权。一份跨模块 Ticket 可以映射多个 Owner 任务，acceptanceIndex 保留共同验收贡献关系；缺少合同、就绪片段、依赖或非法环拒绝，blocked 包不交给执行者。现有 Owner prompt 已接入包重算校验。

开发阶段修复了两个实质问题：完整合同集不能只验证成合法子集；只读 Git status 不能刷新用户 index。开发失败日志保留，固定候选验证保留原始 index 字节与 HEAD 不变的断言。

固定候选八套正式测试：282 通过、7 个 control 既有显式 legacy 跳过，零失败、取消、超时或候选漂移。所有测试进程退出 0；严格零 skip 采集器退出 1，因此不写成全绿。新增 native 编排 2/2、执行包 14/14，完整原始结果见 test-results.json 和 formal-*.log。版本指纹见 candidate.json；测试期间不修改实现、测试及合同。独立审查确认合同集修复关闭，最终增量复审无新增确认 P1/P2，详见 review.md。

测试中的 Registry、Questions、原生 read/edit、临时 Git、Runtime 和结构化 Planner submit 为真实生产实现；Subagent 服务返回受控响应，不代表真实模型推理或原生子代理全生命周期已验收。公共工具 definition 实际执行，另覆盖克隆根身份和持久候选篡改拒绝。

原始 implementationScope 随快照保留；Registry 提案仍未激活。T27 需要真实独立审查、原授权、live Registry、同父竞争及版本事务，之后才可派发。T15、T17–T19、其他 B 项与 CA01 保持原范围。

本轮未提交、推送或联系远端；用户既有暂存和改动保留。根 main 与缓存 origin/main 同为 154914064f5ceb2f8eb413865e10a54e8ffbc663；Harness、Synapse main、approve-for-me 相对缓存远端的既有落后 3364/15/4 未变，Synapse 仍 detached。详见 git-final-evidence.json。

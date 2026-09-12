# 固定快照编排合同 v1

T26 消费 T25 已完成 checkpoint 的不可变快照。`workflow_planning_compile(checkpoint_id)` 只允许实际 Registry 根主线程；复用原授权，核验 checkpoint HEAD/branch、现场与 live Registry，并占用既有 planning-checkpoint lease。当前选中规划文档允许有后续编辑；输入仍使用冻结内容。其他代码现场变化拒绝。

正式 Planner 通过生产 runChild 与结构化 submit 提交 DSH_PLAN_V2，加上 DSH_PLANNING_BINDINGS_V1。每个 task 一个 Owner，绑定 snapshotId/sourceDigest、Ticket id/revision、ready fragment，以及所选 Ticket 的完整合同 id/revision 集。漏列已知合同也拒绝；未知、版本失配、混合 Owner、依赖环、缺失验证声明拒绝。Planner 格式校验最多两次。

同一业务 Ticket/ready fragment 可以由多个 Owner task 共同贡献；每个 ready fragment 至少一个贡献者。每包保留完整原始 Spec/Ticket/AC，acceptanceIndex 汇总贡献者，局部 done 不能关闭整个 Ticket。blocked fragment 不分配；依赖于未就绪前置的包保留 blocked，不能提供执行 prompt。

输出 DSH_PLANNING_CANDIDATE_V1，包含原快照、规范化计划、完整执行包和未激活 Registry 提案，按内容摘要保存到 `.dsh-workflow/planning-candidates/`。读取校验摘要和重算包。持久候选不创建 Workflow 或 OwnerRun，activationAuthorized 固定 false。T27 必须再次核验原始 implementationScope、live Registry、提案授权、审查和版本，才能连接真实派发。

现有 Owner prompt 消费固定执行包并重新校验，不允许缺失或篡改包、Owner 错配或 blocked 包。验证入口在编排时要求有效声明；尚未实现的新文件/目录不要求提前存在，真实执行结果由提交验证门禁核验。

测试边界：原生 Registry/Questions/read/edit、Git 和生产 Runtime/Planner submit 真实运行；Subagent 服务使用受控响应替身，不声称真实模型推理或完整原生子代理生命周期已验收。CA01/T27 下游连接仍待完成。

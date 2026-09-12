# R88：T15 有界关闭完成

T15 的 C1–C6 已按同一活跃执行版本做完有限入口审计。直接/重复 Owner、Supervisor、whole-workflow、现有 idle timeout、handoff/review/advice/arbitration/rebuild 和候选独立任务均有实际入口及持久账本/会话证据；新协议显式有限配置和 legacy 反例保留。完整映射见 [closure-index.md](closure-index.md)。

关闭审计发现一项测试合同漂移：T22 早期 L2 把所有 handoff 都当作未结算结果，R60 已引入带完整 `sourceExecution` 的确认 handoff 失败结算，以便后续 replan 另行领取。生产实现与 direct-handoff 正向证据一致，旧 recovery-session 断言仍停留在 R29。测试现已区分：普通 blocked/no-submit 继续不结算；只有 plan/task/Owner/attempt/session 来源完整匹配的 handoff 才结算当前 attempt 为 failed，fresh replay 不执行模型。修复后 recovery-session 27/27 通过；本轮未修改生产 Runtime。

默认 Codex 外层沙盒初跑暴露多项 `sandbox-exec: Operation not permitted`。这些用例要求测试进程内部再启动真实 Owner `workspace-write` 沙盒，因此正式候选按既有规则在外层沙盒之外运行，内部 Owner 沙盒仍启用。外部正式 19 套共 480 通过、7 个既有 legacy 跳过、0 失败；`git diff --check` 通过。原外层环境失败没有改写为产品结果。

T15 状态更新为开发完成并解除 T17 的最后前置。T17 进入待办；T18仍等待 T27，T19仍等待T17/T18。B04与CA01未完成。没有提交、推送或远程同步。

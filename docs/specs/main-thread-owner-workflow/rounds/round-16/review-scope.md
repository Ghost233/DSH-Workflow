# 第16轮只读审查范围

基线 baseline.json（T-21后1613指纹）与 runtime.mjs.before / recovery-admission.mjs.before。候选冻结后以 candidate.json 和 round.diff 为准，不能将整个Git未提交差异当作本轮变更。

本轮只交付T-22局部接口，T-13真实Owner结果结算及T-20延续生产未完成；这一已披露范围缺口不等于局部实现已正确。T-22保持开发中，T-23/T-15不解锁。

重点核验：

- 新入口没有绕过当前计划/Registry/依赖/Owner worktree及提交门禁。
- T-20严格导入与持久身份绑定，查询不重新扣额，旧run和新attempt区分。
- create、绑定、followup、flush顺序；异常清理与未知不重送。
- raw完整性涵盖packed rows和合法JSON坏记录，readFrom前缀不能被当作完整日志；稳定revision不是跨进程所有权。
- 新lease不继承旧session写权；查询终态不当作业务成功/失败，也不伪造T-13回执。
- 测试真实使用T-20、source Harness/JSONL，仅模型受控；裸会话、手工事件、模拟故障与实际Owner链路证据分别描述。
- 明确未运行、跳过、失败与尚未完成集成；不以套件全绿代替完整T-22验收。

正式冻结前发现与修复属于开发；正式后仅结论、不修改源码/断言/合同。

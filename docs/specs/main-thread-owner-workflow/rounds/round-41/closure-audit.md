# T23 完成审计候选

范围为T23技术验证交付及T15的P14-C前置；不扩大为CA-01或全项目完成。审计按tickets/t-23与P14-C逐条，独立审查确认无仍必须新增proof的明确缺口；最终报告与规格回填见本目录report.md引用。

| 必须证明的行为 | 当前证据及真实入口 | 判断 |
| --- | --- | --- |
| 同事务来源/身份/扣减，保存前后SIGKILL | R41 admission_before_write、admission_before_rename、reserved-before-execution；真实reserveRecoveryAdmission/saveState，未提交候选被新Runtime拒绝，已提交按原identity执行一次 | 已证明 |
| create接纳前后、绑定前后 | R41 reserved-before-execution/create-before-binding；R32 created-before-followup-sigkill-pause | 已证明；不得靠缺文件重建 |
| 首append、prompt接纳及回执前后 | R41 first-physical-append/accepted-before-receipt；R32 submitted-sigkill-pause | 已证明；模型可先于prompt落盘，未知即暂停 |
| failed/succeeded结果回执前后 | R41 failed/successful-settlement-before-rename；R32 settled-failed/succeeded-sigkill-replay | 已证明；成功前窗口实际Git固定commit验证 |
| 不同请求争最后额度，同请求并发/重放 | R41 distinct-credit-concurrent-execution/same-intent-concurrent-execution/reserved-before-execution，真实Owner提交次数及最终账本 | 已证明 |
| 损坏数据、失败保存 | R41 bad_row/torn_tail/bad_budget/admission-save-failure；实际reconcile/readRaw及真实OS EACCES | 已证明；坏输入不修写、不启动、不退款 |
| 旧版本/旧attempt/旧lease | R32 recovery-session正式27项中的L3 old_plan/old_attempt/old_lease；真实reserve与持久负向输入，真实Runtime断言pause、API0、账本/raw不变 | 可复用；不称跨版本继承/全fencing |
| 不确定会话 | R32 L1/L2/L3及restart5，R41首append与其他不确定checkpoint；绑定不充分时零执行 | 可复用；不声称任意崩溃续跑 |
| 受影响执行停止但独立任务继续 | R32 L4，同Runtime/Registry/ledger：T1恢复awaiting_finish后pause，T2真实owner_submit+固定验证到synced，T1账本/raw不变 | 可复用；完整Supervisor投影留T15 |
| 原始证据、源版本、退出码、无测试期变更 | R41 candidate1621+test-results14/14，R32 test-results32/32与restart artifacts，R33 admission43；reuse-audit核对R32/R33各1619源码均无差异 | 已核验 |

## 证据边界

R32普通session测试中的旧绑定与L4以冻结源码的具体状态/raw/API断言、原始TAP和正式退出码为证据；未另存每条原始JSONL，不冒称存在独立artifact。R32重启5项和R41联合14项有独立保存的账本/JSONL/退出信息。reuse-audit.json核对1619共同源；仅proof文件随轮次演进，R41重新完整执行其14项。

“已领取未启动”依据是持久Owner运行状态与T20来源精确匹配、且尚未登记create意图；启动时仍由真实Owner租约和启动门禁重新核验。不是根据session文件缺失推断。只要持久creating/created/submitted已存在，未知状态不得重发。

未证明供应商幂等、任意崩溃点自动续跑、断电/磁盘硬件故障、多prompt通用归因、跨进程强fencing、取消/deadline、跨版本继承、生产默认启用。它们是T21/T22已批准保守边界及其他工单范围，不作为T23无穷扩充的理由。

技术验证正向指：本地新协议/JSONL compression:none/受控单prompt Owner路径能证明已授权首次启动或保守安全停止。未知时暂停是合同的正确结果，不是自动恢复成功。若审查无具体缺口，可将T23标为开发完成并解除T15本项前置，同时继续T15实际入口接线；不得宣称全项目验收通过。

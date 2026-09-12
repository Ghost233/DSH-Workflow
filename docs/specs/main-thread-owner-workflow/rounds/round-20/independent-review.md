# 第20轮独立只读审查

审查者：t21_contract_review；主线程复核实际差异、真实定向失败/修复结果、正式结果及原始JSONL。无新增产品P1/P2。审查未修改源码、测试或合同。

## 成功结算与lease

runtime.mjs:5405的最终prompt持lease锁内冻结；12890及12960两个已持有lease的完成分支await finishOwner，13176外层finally在完成调用结束后才释放lease。真实定向已证明原return Promise导致lease提前释放，修复后通过；无lease的早期重放不受不必要改动。

finishOwner先核验固定SHA、分支、脏文件、集成与任务有效状态（13217起），再于真实完成事务内T13 succeeded结算（13447），budget/receipt/completed owner/task同次saveState；成功不保留failed continuation（13506）。普通Memory编译延后继续旧完成语义，pending_check不被冒充验证成功。

10070起重放重读并核对当前plan/task、receipt、ledger、session/prompt与固定SHA；不重调provider、不扣额、不因后续无关workflow head推进而使历史receipt失效。成功保存后的日志/清理错误保留已核验成功事实；该异常保护主要为静态审查，未新增真实I/O故障注入，不称完整故障验收。

## F-18 / P2：观察型fixture的无条件沙箱装配

recovery-session-fixture.mjs:116的mountHarness在132起无条件装配四个真实执行服务，executable仅用于状态准备，372的mount调用未传它。原始JSONL在预留user输入后多出source.kind=plugin、sandbox:policy的user/message。唯一输入检查据合同暂停，正式旧cases1/3失败；不是产品应放宽的对账缺陷。

最小下一轮：executable传入mountHarness，并在restart时保持；仅true挂载LocalSandboxProvider、SandboxPolicyService、LocalSubprocessRuntime、SandboxBashExecutor。保留唯一输入规则与所有原断言，完整recovery-session 11项验证。正式后未实施修复。

## 证据与边界

444项：421通过、2失败、21跳过、0超时，所有control/resilience分组完整匹配名单，1617候选无漂移。新增真实成功及awaiting_finish负向均通过；旧session resume、重启组合、其他结果与全runner未覆盖，T-22不提升状态。

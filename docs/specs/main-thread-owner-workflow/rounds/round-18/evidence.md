# 第18轮：T-22 Owner执行接线

基线承接第17轮1617项指纹，四仓HEAD及原有修改见baseline.json。本轮继续预留会话身份与真实Owner启动/失败结算接线，复用现有Owner流程而不另造裸启动器；既有门禁不放宽，不接全部runner或生产默认配置。未完成的结算/重启能力仍明确保持T-22开发中。

实现者session_adapter_r16独占runtime.mjs/recovery-session.mjs与合同。测试者session_proof_t21独占recovery-session测试与fixtures。主线程负责整合判断、回归采集、进度与Git。独立审查只读；冻结后不修复。

正式测试计划：沿用9组，并加入直接调用runExternalOwner/runOwnerEntry/persistOwnerSession的resilience回归。由于第17轮control单进程180秒超时，本轮事先将同一冻结control源码的全部166个唯一用例按既有精确名称分为83+83，两组各180秒、串行执行且验证集合无遗漏；不声称单进程全量control结果。source Harness集成/security/resilience也180秒，纯合同组60秒。总计10个逻辑套件、11个有限进程入口；不提高原有单进程上限。

工具接线补充：主线程独占index.js，仅给现有ownerSubmitDefinition增加named export，函数内容不变。测试可在真实ToolRuntime中注册同一生产工具定义并绑定实际Runtime，避免fake owner_submit桥或复制造成断言自证。该测试仍是局部生产工具装配，不代表完整plugin.apply服务集成。index.js原始副本已保存并加入候选。

当前交付目标收窄为安全首次启动、真实Owner failed提交结算及同request回执重放。普通turn/end、blocked、无owner_submit、创建/落盘不确定不能伪造failed结算。failed/stopped恢复为runnable仍须既有正式流程，本轮不通过手工写状态声称全自动连续恢复。成功Owner提交/T13成功结算、新source后续执行及完整重启能力若未交付，均保留T-22开发中。

测试开发已证明executable fixture使用真实Registry批准/提交、受控workflow分支及worktree、正式AgentPresets与生产owner_submit定义；普通文本Mock响应经真实runExternalOwner/createOwnerEntry/runOwnerEntry/provider到达“没有调用owner_submit”拒绝。该证据只证明门禁及执行路径，不能替代真实failed工具提交和预算结算；后者已由最终9/9定向与正式测试证明，见下文；该段保留开发时门禁探针的独立含义。

最终开发检查：测试者停写后主线程仅接管recovery-session.test.mjs，在真实failed场景加入普通runExternalOwner不得继承旧恢复身份的拒绝断言；实现者完成固定提交审计保留及该guard后停写。最终定向9/9通过（development-final.log），随后固定正式候选。首次失败/装配/中间断言日志归档development/，不与正式计数相加。

## 正式结果与有限补验

冻结候选1617项；正式11个进程中control-b与resilience各触及180秒。原始退出-9记录保留，不把补验改写为单次全绿。control-a完成83项（77通过/6跳过）；control-b报告70通过/1跳过后超时，其余12项一次补验全部通过，覆盖166个原始control用例且不重复计数。

resilience原始进程报告33通过、1失败，另17个顶层用例未报告。失败项为“workflow state 原子保存失败时回滚 Registry 内容和 index”，伴随PromiseRejectionHandledWarning；单项TAP诊断复跑1/1通过。原失败仍存在，诊断结果不加入去重通过计数。测试在创建approval Promise后经过多个await才挂assert.rejects，存在未处理拒绝的时序窗口；这是代码支持的待核线索，原进程被截止未输出完整错误详情，尚不能定为已确认根因，更不能据复跑通过认定原套件通过。

resilience未报告的17项只补验一次，不修改源码、断言或合同、不延长原进程上限。正式原始结果见test-results.json；补验和失败诊断各自保存独立脚本、JSON与日志。

| 执行组 | 通过 | 失败 | 跳过 | 原始超时 |
| --- | ---: | ---: | ---: | ---: |
| recovery-session | 9 | 0 | 0 | 0 |
| recovery-admission | 43 | 0 | 0 | 0 |
| recovery-budget | 32 | 0 | 0 | 0 |
| convergence | 24 | 0 | 0 | 0 |
| model | 51 | 0 | 0 | 0 |
| plan-revision | 7 | 0 | 0 | 0 |
| workflow-state | 11 | 0 | 0 | 0 |
| control-a | 77 | 0 | 6 | 0 |
| control-b | 70 | 0 | 1 | 1 |
| security | 25 | 0 | 14 | 0 |
| resilience | 33 | 1 | 0 | 1 |
| control-supplement | 12 | 0 | 0 | 0 |
| resilience-supplement | 26 | 0 | 0 | 0 |

去重观察合计420通过、1失败、21跳过，保留2次套件超时。resilience补验17个顶层用例含子测试，共26通过；失败诊断1/1通过单列，不覆盖原始失败。计划用例均获得结果，但本轮回归未全绿。所有补验的1617候选指纹无漂移。

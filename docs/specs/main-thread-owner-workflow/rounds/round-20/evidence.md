# 第20轮：T-22真实成功结果结算与重放

用户“继续”授权T-22下一最小范围：在现有受保护Owner生命周期中接入真正完成的成功T13结算与相同请求只读重放。不是模型turn/end或owner_submit成功即完成；唯一完成入口finishOwner在固定提交验证/集成及既有Memory处理后记账。deferFinish、旧lease、未确认prompt、错当前绑定保持保守，不扩展resume、全runner或其他结果。

写入归属：session_adapter_r16独占runtime.mjs、recovery-session.mjs及消费合同；success_tests_r20独占recovery-session.test.mjs与fixture；主线程负责本轮文档、正式采集和Git。各代理保留既有修改且不Git写入，所有者停写后冻结。基线1617项与四仓状态见baseline.json。

正式计划：新recovery-session集成、recovery-admission/budget、convergence、model、plan-revision、workflow-state、control、security、resilience。复用上一轮完整resilience的3组17顶层划分；control全部166例事先分4组（42/42/42/40）。集成/control/security/resilience各进程180秒，纯合同60秒，串行、TAP/no-bail。测试范围为Runtime现有受影响回归，非全仓验收。冻结后不改源码/测试/合同；有限进程超时保留原始结果，收齐后只读审查。无提交推送授权。

## 开发期装配诊断

首次真实成功提交在固定验证前被拒绝，原始JSONL tool/result明确报告缺少ctx.shell、ctx.sandbox和ctx.sandboxPolicy，外层runChild只报告owner_submit未成功。这是R18只验证failed路径的fixture尚未挂载成功路径所需服务，不是成功结算代码已通过或失败的证据。主线程要求停止重复试跑、提取原始tool error，再授权fixture挂载实际source Shell/Sandbox/Policy服务，保持固定验证命令与enforcement不变。新增服务源码已包含于1617项基线。所有开发失败日志保留，正式计数另列。

补齐真实source服务后，嵌套sandbox-exec被外层工具沙箱拒绝；主线程获准在外层沙箱外执行相同两项定向测试，Owner自身workspace-write沙箱仍启用。随后正向实际暴露runExternalOwner在try/finally中未await finishOwner，finally提前释放lease（root-directed-01.log）。修复实际持有lease的两个完成分支为await，并向finishExisting传递原lease；无lease的早期重放入口不改。再次相同两项2/2通过（root-directed.log）。这是实际成功链路暴露并修复的生命周期问题，不是以增加等待时间重试。

正式recovery-session须在外层沙箱外运行；其余回归仍用默认外层沙箱。两部分使用同一候选指纹，后半段只核验不能重新冻结不同源码。开发期原始失败日志和tool/result诊断归档development/。

## 正式结果

| 组 | 通过 | 失败 | 跳过 | 超时 |
| --- | ---: | ---: | ---: | ---: |
| recovery-session | 9 | 2 | 0 | 0 |
| recovery-admission | 43 | 0 | 0 | 0 |
| recovery-budget | 32 | 0 | 0 | 0 |
| convergence | 24 | 0 | 0 | 0 |
| model | 51 | 0 | 0 | 0 |
| plan-revision | 7 | 0 | 0 | 0 |
| workflow-state | 11 | 0 | 0 | 0 |
| control-1 | 42 | 0 | 0 | 0 |
| control-2 | 36 | 0 | 6 | 0 |
| control-3 | 41 | 0 | 1 | 0 |
| control-4 | 40 | 0 | 0 | 0 |
| security | 25 | 0 | 14 | 0 |
| resilience-1 | 17 | 0 | 0 | 0 |
| resilience-2 | 17 | 0 | 0 | 0 |
| resilience-3 | 26 | 0 | 0 | 0 |

合计444项，421通过、2失败、21跳过、0超时。control全部166例、resilience全部51顶层用例精确匹配选择名单，无补验或重复计数；1617候选无漂移。两项新成功/未完成负向正式通过。原有两项JSONL检查失败，不能说全绿。

## F-18候选：观察型fixture被全局沙箱装配影响

正式后只读诊断（development/nonexecutable-inspection.json）显示seq4是预留source.kind=user请求，seq5多出source.kind=plugin、plugin=@deepseek-ai/dsh-system-prompt、form=snapshot、sections=sandbox:policy的user/message。新增四服务在mountHarness无条件挂载，改变non-executable旧fixture的输入形态。inspectRecoverySession按合同先检查输入归属，再检查唯一数量，因此终态变extra_or_wrong_input，重复输入用例也先被该分支拒绝；不是JSONL损坏。主线程亲自读取原始事件和对账结果，接受该根因。

最小下一轮建议：把executable开关传到mountHarness，只为真实Owner执行fixture挂载四个服务；保留旧单prompt观察fixture以及生产唯一输入规则。正式后未修。该诊断只读使用冻结源码，结果不加入正式通过计数；实际Owner已有未结算会话仍遵循保守未知暂停，不因plugin输入存在就允许重送。

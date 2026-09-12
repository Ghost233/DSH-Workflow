# 第11轮证据

范围：T-04 / AC-14，F-13。以当前工作区源码运行，未用 HEAD 代替脏候选。

- [起始状态](baseline.json)：四仓 HEAD/分支/原有修改及相关文件摘要。
- [固定候选](candidate.json)：64项源码、测试和既有 Harness 依赖产物的 SHA-256；依赖产物本轮未重建。
- [本轮差异](round.diff)：仅 convergence.mjs 分类顺序和 control.test.mjs 新增16项。
- [开发首次结果](development-red.log)：6通过、10失败，其中8项复现F-13；另2项是重复恢复技术路径测试错误地预期暂停，而真实合同会继续执行。
- [生产修复后首次定向](development-green-1.log)：14通过、2失败，剩余均为上述技术恢复测试预期问题。
- [纠正测试装配后的定向](development-green-2.log)：16通过、0失败。纠正为断言技术恢复确实调用执行入口，没有放宽用户待决断言。

定向命令：固定 Node v24.12.0，`--test --test-force-exit --test-name-pattern=R11 owner-workflow-plugin/test/control.test.mjs`，外层60秒。开发日志完整保留；正式冻结后不再改源码或断言。

正式命令、起止时间、超时预算及逐套件计数记录于 test-results.json。control/security/runner 外层180秒，其余60秒；独立套件串行执行，失败继续下一套件，超时只终止本轮进程组。正式原始日志按 formal-<suite>.log 保存。测试命令使用工作区当前源码和候选中记录的本地依赖产物，不代表真实在线模型/外部服务调用。

新回归通过真实反馈接纳、租约和持久状态进入 Supervisor、直接 Owner、普通恢复与重复恢复。直接 Owner 只替换模型回合注入预算错误；技术恢复用抛出哨兵的执行入口证明已经启动下一次执行，不声称完成后续模型任务。权限、业务、纯技术、过期 session 四类各覆盖四入口。

正式十组：**308通过、0失败、21显式跳过**（329项），0取消、0待办、0超时，64项候选无漂移。逐组详见[test-results.json](test-results.json)，各组均实际运行非零用例。21项跳过与第10轮一致，未新增skip；前次[跳过审计](../../acceptance/t-04/skipped-audit.json)说明其替代覆盖与范围，不将skip计为通过。

[结束检查](final-checks.json)：四仓HEAD均与起始相同，diff --check通过，原有路径没有缺失；main相对本地origin/main跟踪引用0/0，未fetch，无Git写操作，不声称远端实时同步。

# 第18轮独立只读审查

审查者：t21_contract_review。主线程复核：候选diff、正式原始日志、有限补验、单项诊断以及测试Promise处理顺序。审查未修改源码、测试或合同。

结论：本轮受保护首次启动、真实failed结算、同请求重放与externalOwnerRuns生命周期未发现新增产品P1/P2。该结论不覆盖已披露的成功结算、resume、重启组合故障和全runner接线；T-22仍开发中。

## 核心证据

- runtime.mjs:12606：Owner lease下重读T20/source并重跑Owner启动门禁；createOwnerEntry保留固定提交及分支审计。
- runtime.mjs:14675：完整Owner prompt在provider create前锁内冻结；runtime.mjs:2586继续按预留身份followup、flush确认、submitted落盘。
- runtime.mjs:12885：真实owner_submit failed报告才可进入T13 start/settle，核对submitted记录、lease、plan与执行引用。
- runtime.mjs:10064：同请求仅重放匹配的持久失败回执，不重送、不重复扣额。
- runtime.mjs:12553：in-flight Promise只与相同request/instruction共享；另置metadata map，保留既有Promise集合清理行为。

## F-17 / P2：回滚测试延迟安装拒绝处理器

位置：owner-workflow-plugin/test/resilience.test.mjs:1531–1538。approveOwnerChange Promise创建后经过多个await；测试释放Registry锁使审批继续并预期失败，最后才通过assert.rejects安装拒绝处理器。这个时序窗口可导致预期拒绝被测试运行器先视作未处理拒绝。

正式同一案例失败且有PromiseRejectionHandledWarning；单项TAP诊断1/1通过。主线程接受这是需要修复的测试稳定性问题，但原超时进程没有完整错误详情，不能断言已经证明原失败唯一根因，更不能推导产品回滚逻辑有缺陷。原失败、2次超时保留；诊断通过不覆盖原记录。

最小下一轮建议：创建审批Promise后立即为其安装拒绝处理器（例如立即创建assert.rejects的等待Promise，完成故障布置后等待该断言；也需保证断言自身拒绝不形成新的未处理窗口），保持原回滚内容/index断言与故障注入语义。先定向验证，再用预先定义的有限分组获取完整受影响回归结果；不靠反复重跑或增加超时掩盖问题。

## 验证边界

420通过、1原始失败、21跳过，2原始套件超时。补验覆盖所有原计划顶层用例，候选1617项无漂移。不是一次完整全绿回归，也不是T-22全工单验收。

# R78 第一候选审查与补验依据

独立审查：t21_contract_review。正向仲裁/最新审查/后继重建成立，无确认的重复启动或错绑来源P1；确认两项P2，进入本轮必要收尾，不扩展其他恢复能力。

1. 仲裁applied仅在租约外检查。两个调用均可先完成/复用真实会诊，后取得租约的调用把已结算的新Review误判为普通Review变化。没有双扣，仍违反稳定重放合同。租约内重查，释放同一租约后再做完整原始回执重放，禁止嵌套同lease。
2. saveState遇mkdir EEXIST，在读lease与lstat锁目录之间另一进程可释放目录，未保护lstat抛ENOENT。formal-recovery-admission test31实际暴露此路径，不是可以忽略的“纯测试不稳”。仅将该ENOENT交回原有限获取循环，其余I/O保持拒绝。

第一候选正式结果：341通过、1失败、7既有control跳过，零超时。test-results.json及formal-*.log不覆盖。launcher.test.mjs在冻结后发生范围外外部漂移；该文件不是本轮改动或所选套件import，原旧/新hash与限制保留。不得将第一候选称为零漂移或全绿。

补验只包含上述正确性修复、确定性回归及受影响原范围。新增发现不会自动变成下一轮前置；R78安全结束后仍按convergence-checklist.md的CA01关键路径执行。

# R75：恢复仲裁预算绕过验证与门禁

先通过真实恢复候选、耗尽预算与实际会诊模型请求确认arbitrate调用链是否绕过有限预算。若确认，在尚无会诊/仲裁持久会话计费协议前，保护实际入口拒绝未计费启动并保持来源，实际driver持久暂停不重复同源；非恢复初始规划保持原行为。此为接入完整计费前的安全修复，不作为仲裁能力/T15完成。

主线程拥有Runtime/合同与证据；worker拥有新增candidate-arbitration-recovery.test.mjs及R75原始实验日志。正式：新仲裁测试、candidate-review、candidate-rebuild、candidate-pause、control，每套180秒串行，真实内层隔离。

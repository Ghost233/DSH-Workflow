# R79 / T05 规划引用协议

目标：R4 5.1/5.7、AC03/04/27协议子集。提供真实文档内容/摘要、稳定ID与修订、AC/合同来源及就绪/阻塞范围的统一校验结果，供T07使用。不执行Git checkpoint、DAG、Owner分配或版本激活，不将引用校验当语义覆盖或实施授权。

写入归属：t16_cancel_proof仅新增src/planning-references.mjs与contracts/planning-references-v1.md；主线程仅新增test/planning-references.test.mjs及本轮证据/进度/T05；复审代理只读。共享runtime/model不改。保留原有全部改动。

测试范围：新增协议正反例（真实临时文件）、现有orchestrator-documents路径规则与原生文档守卫回归。候选冻结后串行运行；不启动全仓或真实付费模型，不推送/提交。

完成条件：可复用入口及明确错误；缺文件/重复ID/修订或摘要失配/缺来源/越界/无工作/混合阻塞/跨Ticket完整AC映射有证据；只读审查确认T07可消费且无隐含执行权。

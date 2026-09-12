# R80 / T07 规划事务技术验证

前置：R79的真实planning-references协议与既有T01路径行为已验证。范围：临时Git项目，真实文档写入来源/授权、显式清单、HEAD/branch/index保护；checkpoint、不可变快照、模拟执行版本激活的持久事务及SIGKILL后恢复；同父竞争、迟到回执、legacy兼容。仅技术证明，不改生产Runtime，不迁移当前现场，不提交当前工作区。

归属：t16_cancel_proof仅proofs/t-07/transaction.mjs与worker.mjs；主线程fixture/test、原始证据/报告、Spec证据回填/工单状态；t21_contract_review只读审查。所有实际Git写操作只在测试创建的临时项目，保留用户原有改动。

测试使用T05真实文档校验与现有preflightWorkflow正反路径，不手写替代接口。故障覆盖提交前后、快照前后、激活前后；保留实际HEAD/index/hash/对象、固定输入和每次结果。无法证明的窗口明确列出，不将mock/异常注入当断电证明。成功并经审查回填后方可拆B01生产实现。

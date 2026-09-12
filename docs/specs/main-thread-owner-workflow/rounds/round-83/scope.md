# R83：T25实际授权与checkpoint/snapshot

前轮R82为有效进展：真实来源链和DAG前只读入口已交付。T25本轮接bootstrap原生授权、真实Git/index/snapshot事务，不依赖已有Workflow，不从模型自报approved取权。

归属：主线程planning-authority.mjs、Runtime/index接线、公开入口测试、合同/进度；t16_cancel_proof独占planning-checkpoint.mjs及其native测试/fixture；t21_contract_review只读审查。所有测试Git写入只在临时项目，保留当前用户HEAD/index和原有改动，不提交/推送。

已有匹配授权复用；新权限由真实原生决定产生并先持久，原始实施范围与局部文档提交能力分开。每次实际事务仍固定精确来源链、文件清单、预期HEAD与分支。恢复必须引用原grant，不补造新同意；未完成Git/index或snapshot不派发。T26/T27执行版本接线不属于本轮。

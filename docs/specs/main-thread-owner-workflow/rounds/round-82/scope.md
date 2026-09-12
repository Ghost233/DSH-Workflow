# R82：T25 原生来源消费与生产事务接缝

承接R81，推进原T25，不新增工单/AC。必须从T24真实日志、T05文件及实际Git基线核验有序来源链；真实授权入口和持久锁接缝同时核对，不能用请求者自报approved替代用户来源。

归属：t16_cancel_proof独占planning-source-chain.mjs及planning-source-chain-native.test.mjs，临时Git正向必须由真实Harness生产日志；主线程独占事务/Runtime集成、合同、进度和本轮证据；t21_contract_review只读授权接缝及冻结复审。保留已有改动，不操作当前用户Git index/HEAD，不提交/推送。

T25完成仍要求实际授权→checkpoint→index一致→不可变快照和恢复验证，来源函数通过不等于T25完成。已有实现/提交授权必须分别验证；临时Git夹具里的授权不能当生产授权。源码固定后按受影响实际套件采集，保留失败/未知和未完成范围。

本轮实际入口为workflow_planning_prepare（index.js→runtime.preparePlanningCheckpoint）。它只返回来源核验和摘要，身份从实际根会话派生；不调用有dashboard/gitignore副作用的resolveRoot，不创建Workflow。授权接缝调查否定了“必须先有批准Workflow”的初始化方案，见authorization-seam.md；本轮不新增反复用户问询或自报grant。正式测试六套：planning-source-chain-native、planning-write-journal-native、planning-references、orchestrator-documents、orchestrator-documents-native、plugin，每套120秒。

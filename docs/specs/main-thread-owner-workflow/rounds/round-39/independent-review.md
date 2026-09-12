# 第39轮独立只读审查

审查者：/root/t21_contract_review，范围内无P1/P2。

首个真实appendBatch完整返回后，仅目标session的materialization batch停住；物理读取避免coordinator自等待。冻结断言核验header、首批event类型与物理行，SIGKILL后新Runtime技术暂停、零执行、state/raw不变。

实际phase created、producer模型请求1，但raw仅567字节header+sandbox/mode+approval/policy，无prompt。重启prompt_not_observed，不能说模型未开始。firstBatch未单列artifact不影响窄结论：冻结断言关联保存raw，checkpoint/postkill实际一致。不覆盖后续append/torn tail/所有状态竞态。正式9/9，无漂移。

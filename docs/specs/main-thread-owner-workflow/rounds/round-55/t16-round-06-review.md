# T16 round06 复核与依赖循环修正

主线程核对正式结果、probe 的真实 PID/SIGKILL/raw/lease/recoverOwner 断言；独立 t21_contract_review 核对归档源码。1 场景 exit0、无超时/错误/漂移，真实平台事实成立。没有把死 PID lease 接管当作会话终止。

独立审查无 P1；P2 是报告把 T17 尚未实现的 stopping/结算作为 T16 未完成理由，构成自循环。责任固定于 proofs/t-16/adapter-contract.md：T16交付平台事实与有限保守合同，T17实施状态/截止/写入fencing并补联合证据。原始 negative 证据不改为 positive；跨进程迟到结果写入尚未证明，不宣称生产AC通过。

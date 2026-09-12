# R66：暂停事务完整候选身份

只修R65 P2：完整候选CAS，真实admission失败与暂停之间并发改写的隔离；合法新建operation/session仍能暂停。主线程独占写入，代理只读审查。

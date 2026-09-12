# R68：未终态占用与任务状态一致性

修R67 P2：未终态reservation/活跃Owner映射到非pending/running任务时拒绝选择，不能漏算全局槽位。主线程独占写入，代理只读审查。Runtime接线仍为后续。

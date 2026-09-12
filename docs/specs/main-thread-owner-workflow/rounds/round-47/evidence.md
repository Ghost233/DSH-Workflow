# R47 whole-workflow恢复入口

主线程独占runtime/test（T16 worker只写proofs/t-16）。沿用已有recoverWorkflow队列模型，不清空新协议失败来源，未知/缺失来源拒绝，恢复会话结算分流交recoverOwner。显式配置先校验；真实待决优先持久通知、不被批量恢复清掉。保留saveState CAS拒绝并发过期版本。正式runtime恢复+admission/session及control相关whole-workflow回归。未知来源的完整技术incident主控制投影、timeout/replan仍未闭合，不能标T15完成。

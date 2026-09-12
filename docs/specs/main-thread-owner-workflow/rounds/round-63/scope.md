# R63：恢复候选实际Review计费

T15，主线程独占实现/测试/合同/进度写入，代理只读审查。只处理已有handoff-recovery候选的真实workflow_revision_review入口：固定原Planner来源与候选，独立revision_review操作计费、真实JSONL对账、语义验证与结果原子落盘。合法needs_revision仍是Review成功；语义错误才结算失败，后继ordinal复用root，额度耗尽无新child。未知终态/来源变化不重发。旧普通Review兼容。

正式范围新candidate-review-recovery、replan-session、handoff-recovery、control。冻结后不改候选。跨版本激活/候选废弃重建/咨询计费尚待后续，不标记T15完成。

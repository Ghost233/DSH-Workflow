# R60 直接request_handoff的真实来源生命周期修复

修复R59 P2。主线程独占runtime、workflow-state、真实工具definition导出/描述、新direct-handoff测试和相关合同。保护协议保留active计划/审批/Owner与slot，delta仅作为提案固定。真实Owner终态前不可启动Planner；终态后直接请求支持技术blocked/failed与已付费Owner continuation，用户依据不放宽。防止主控制在live来源时重复安排handoff重规划。以真实工具/Owner/Planner/JSONL证明，不伪造Owner终态。正式范围direct-handoff/handoff/replan/runtime-budget/control/workflow-state，单套180秒；冻结后独立只读审查。

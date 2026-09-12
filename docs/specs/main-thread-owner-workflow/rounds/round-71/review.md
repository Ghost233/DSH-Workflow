# R71 独立审查

P2：终态 reservation 未强制匹配 Owner/task 终态，矛盾持久状态可通过 lease/save 与重放校验。当前正常执行路径未发现会自行制造该状态；完整性门禁仍应拒绝。下一轮修复 completed→双方 completed、failed→Owner failed/blocked 且 task stopped；保留 launching 在 finish 后、结算前的合法过渡。独立审查未确认其他新增 P1/P2。

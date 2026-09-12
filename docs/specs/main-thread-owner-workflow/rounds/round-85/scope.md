# R85 T27 实施

上一轮分类：progress，T26 已开发完成。T27 本轮开始；完整完成条件仍包括原子激活、同父竞争、重启、授权与审查、实际派发和 T18 接缝，不因局部交付缩小。

本轮接通候选独立审查原始来源持久化，并补版本迁移中的合同/验证语义比较。主线程独占 runtime/index、审查存储、native 集成及文档；t16_cancel_proof 独占 plan-revision.mjs 和对应测试。共享现场保留，不提交用户工作区。

固定候选测试：新增 native 审查路径，plan-revision、planning-packages、plugin、control 回归；必要补验按实际影响记录。T27 不因独立审查落盘而标开发完成；下一段实施原子版本激活。

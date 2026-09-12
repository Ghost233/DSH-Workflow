# R82 只读审查

主线程与t21_contract_review核验实际来源链、主线程身份、生命周期和授权边界。

1. 初审P2：preparePlanningCheckpoint只检查header.parentSession，遗漏既有header.meta.parentSession谱系。主线程修复，两种来源均拒绝；meta-only无角色子会话实际测试通过。
2. 开发发现：provider标签不能假设为canonical path；全量历史同文件记录不能都视为本次未处理来源。最终以canonical target.path、基线blob、选中连续版本链验证，保留旧历史；真实第二baseline正向通过。
3. 候选1（正式64通过）只读复审确认P2：新文档缺失baseline blob时cat-file exit128被当Git故障。原生测试均从已跟踪文档开始，覆盖不足。主线程通过精确literal ls-tree空结果识别缺失，不吞掉其他错误，并加真实初次create。
4. 候选2冻结后的独立delta复审：修复正确，5项受影响原生补验通过、哈希一致、无漂移；上述P2关闭，无新增确认P1/P2。

当前入口只读且不授权/提交，不要求先存在Workflow；真实授权与checkpoint/index/snapshot还没有实现，因此T25仍开发中。已有Workflow时来源准备可以返回值，其事务消费者仍须检查当前Workflow冲突、来源漂移和原授权范围，不能据此直接派发。

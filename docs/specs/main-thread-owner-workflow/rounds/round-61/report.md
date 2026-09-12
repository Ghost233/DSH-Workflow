# R61：pending直接转交与completed提交互斥

实现已修正R60 P2：completed提交先进入active.submitting，再以当前Owner lease及workflow短锁核对source与pending直接请求；在inspect/固定验证/commit之前拒绝矛盾完成。来源失配的同task/Owner pending请求也需对账，不能忽略后完成。拒绝不写submission，finally释放提交标记，允许同一child改报blocked/failed后继续。

request_handoff同时拒绝正在提交或已有submission的Owner，封闭completed门禁通过后再插入proposal的反向窗口。没有转交请求的普通完成仍能检查和固定提交。

开发14/14：7项真实直接handoff流程（新增免费/paid错误completed回执及纠正后真实Planner、正常提交期间拒绝实际request handler），7项submission顺序/权限/拒绝恢复单测。正式228通过、7项既有跳过，零失败/取消/超时、候选无漂移；独立只读审查关闭R60 P2，未发现本轮新增P1/P2。

T15仍开发中。下一步候选Review独立计费与候选废弃继承；同步只读核对其他Owner结构化delta入口，按真实调用链处理同类状态归属问题。不是整份规格或无人值守完整验收。

没有提交/推送/fetch/同步；git-evidence.json记录main与缓存tracking一致，Harness原落后3364、vendor原落后4、Synapse detached；未查询实时远端，所有原有修改保留。

## 同类入口审计

request_subgraph仍直接invalidate运行中的source，删除ownerRuns并更换active计划/审批；也没有提交中/已有submission门禁。这是现存可达缺陷，不属于R61已保护范围。非恢复request_handoff仍保留旧的即时delta语义。后续须先厘清结构性入口与T18版本事务边界，不能称整个结构性变更生命周期已完成。见[审计](structural-entry-audit.md)。

# R68：未终态占用不得漏算全局槽位

所有未终态reservation及活跃Owner对应任务必须存在且为pending/running，否则在选择前拒绝矛盾状态。已有running任务仅占一槽，不重复计算。新增reservation/Owner与stopped/completed交叉负例，以及正常running占用边界。

开发13/13，正式54/54，无失败/跳过/超时/漂移。独立只读审查关闭R67 P2，无新增P1/P2。Runtime派发与Owner收尾绑定仍未接线，T15仍开发中。

未commit/push/fetch或分支同步；main与缓存tracking一致，Harness缓存behind3364、vendor behind4，Synapse detached；实时远端未查询。保留原有修改。

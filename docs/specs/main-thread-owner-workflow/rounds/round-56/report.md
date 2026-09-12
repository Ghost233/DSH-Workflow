# R56：预算接口文档与取消验证交付

公开恢复预算合同与R55实现对齐：Owner与replan是互斥执行身份，共用两级额度、全局request/attempt/回执约束；旧reader拒绝新分支，当前T20仍未启用mixed intent。独立审查关闭R55 P2，无新增P1/P2。

本轮只改文档。R55正式118/118按候选摘要复用，未重跑测试；verification.json记录文档差异与实现/测试无漂移。不能称为本轮新执行118项。

T16六轮真实取消/JSONL/lease证据和有限停止适配合同已固定，技术验证开发完成。修正了要求先实现T17才完成T16的循环依赖；T17仍等待T15。真实SIGKILL后旧Owner仍running的反例保留，跨进程旧token结果写入、生产stopping与固定deadline仍由T17实现并补验。AC/BUD及整个工作流未完成。

下一实施为T15的mixed admission/权威根问题及实际replan调用接线，禁止另建预算或伪造Planner Owner身份。

未提交/推送/同步。当前本地tracking主main一致，Harness落后3364、vendor落后4，Synapse detached；未查询实时远端，既有改动保留。

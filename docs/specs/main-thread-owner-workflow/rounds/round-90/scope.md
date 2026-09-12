# R90 范围：T27 消费 T17 停止协议

本轮只处理 T27 活跃 PlanRevision 中 Owner/scope/Registry/任务删除导致的旧 attempt 权限失效。写入范围为 `runtime.mjs`、既有激活合同、`planning-compile-native.test.mjs` 和本轮记录；T17协议模块只作为依赖消费。

完成判据是新版本发布时先持久停止证据、旧结果立即失权、terminal 后再归档并放行新任务；legacy记录不得被伪造成有启动前deadline。最后候选包含两个并存OS进程跨过激活边界的迟到提交，以及任务删除后fresh Runtime只归档、不复建任务的联合场景。跨版本恢复账本继承仍归T18。

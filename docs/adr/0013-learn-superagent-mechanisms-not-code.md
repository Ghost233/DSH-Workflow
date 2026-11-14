# 借鉴 dsh-superagent 全部机制，不引入其代码

中枢 Bot 的状态模型、Stored work、消息纪律、提示词体系、Policy、恢复语义全部学习自 dsh-superagent-prototype，但代码全部自研。

## Considered Options

- **直接引入 superagent 作为依赖或 fork**：被拒绝——superagent 是单仓库原型（一个 bundle 管一个 GitHub 仓库），其 Engine/Passes 轮询架构与我们的三层按需唤醒模型不匹配；引入后三层架构反而要绕过它实现。
- **只参考文档不看源码**：被拒绝——消息纪律、不等待 guard 等机制的关键约束（100 词硬限、5 秒转后台、拒绝 sleep）只在源码里，文档没有。

## Consequences

- 我们复制的是机制语义，不是接口形状；superagent 后续演进不影响本插件。
- 规格文档必须自足：superagent 原型仓库不可作为本插件的运行时依赖或文档依赖。

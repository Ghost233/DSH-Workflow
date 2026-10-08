# JEV 中心与原生代理监控：工单索引

父规格：[Issue #12](https://github.com/Ghost233/DSH-Workflow/issues/12)。2026-10-07，用户批准六张垂直切片工单及阻塞关系后，按 to-tickets 发布。GitHub 是执行状态来源，本地每张工单单独保留副本。

| 序号 | 正式工单 | 被什么阻塞 | 副本 |
| --- | --- | --- | --- |
| 01 | [JEV-T01：配置并调用一套 JEV 引擎](https://github.com/Ghost233/DSH-Workflow/issues/13) | 无 | [本地副本](01-configure-and-call-jev.md) |
| 02 | [JEV-T02：同时启用和管理多套 JEV 配置](https://github.com/Ghost233/DSH-Workflow/issues/14) | [#13](https://github.com/Ghost233/DSH-Workflow/issues/13) | [本地副本](02-manage-simultaneous-jev-configs.md) |
| 03 | [JEV-T03：检测原生代理无输出并持续告警](https://github.com/Ghost233/DSH-Workflow/issues/15) | 无 | [本地副本](03-monitor-native-agent-silence.md) |
| 04 | [JEV-T04：识别代理异常结束并记录原因](https://github.com/Ghost233/DSH-Workflow/issues/16) | [#15](https://github.com/Ghost233/DSH-Workflow/issues/15) | [本地副本](04-report-abnormal-agent-endings.md) |
| 05 | [JEV-T05：通过 JEV 检测持续思考停滞](https://github.com/Ghost233/DSH-Workflow/issues/17) | [#13](https://github.com/Ghost233/DSH-Workflow/issues/13)、[#15](https://github.com/Ghost233/DSH-Workflow/issues/15) | [本地副本](05-detect-semantic-stagnation.md) |
| 06 | [JEV-T06：JEV 配置变化时保持监控正常工作](https://github.com/Ghost233/DSH-Workflow/issues/18) | [#14](https://github.com/Ghost233/DSH-Workflow/issues/14)、[#16](https://github.com/Ghost233/DSH-Workflow/issues/16)、[#17](https://github.com/Ghost233/DSH-Workflow/issues/17) | [本地副本](06-keep-monitoring-through-jev-config-changes.md) |

六张工单仅添加 `ready-for-agent` 标签，正文与本地副本一致。七条阻塞边已通过 GitHub 原生依赖列表读取核对；正文同时保留真实 Issue 引用。父规格的正文、标题、标签、状态和评论保持原样，没有关闭父项。

初始无工单依赖的前沿为 #13、#15。此处仅描述依赖，不覆盖用户暂停开发的指令。当前代码开发继续暂停，发布工单不授权构建、切换或重启运行中的 DSH 服务。

拆分遵循已接受的 ADR《用统一 JEV 中心按名称调用多套引擎配置》。每张工单自行承担公开接口验收；现有原型测试不能替代这些工单的交付证据。

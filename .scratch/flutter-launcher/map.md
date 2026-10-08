Type: map
Labels: wayfinder:map

## Destination

将 DSH Workflow 的 macOS 启动器迁移到 Flutter，并直接接入官方 MacLauncher SDK。界面、服务控制、菜单入口、窗口、配置与更新功能完整迁移，生产应用保持可独立运行，并通过ARM64分发验收。

## Notes

- 用户已确定：只统一启动器层；采用同一 Flutter/SDK/工程规范体系，DSH-Workflow 与 MacLauncher 保留独立仓库。
- 本次用户要求实际迁移，因此地图范围包括实施与验收，不以规划完成作为终点。
- 使用 wayfinder、grilling 和 domain-modeling；正式规格与工单使用 Ghost233/DSH-Workflow 的 GitHub Issues。
- SDK 从 Ghost233/MacLauncher 的固定提交获取；应用拥有自己的服务生命周期，管理端退出或断线不回收业务。
- 保留官方 DSH 后端、独立 JEV 中心与原生代理监控。用户配置、应用身份和数据位置保持兼容。
- 验收覆盖 Flutter 格式/分析/测试、真实 SDK socket、服务启动/回收/状态/日志、菜单归还、窗口与ARM64应用打包。

## Decisions so far

- [确定 Flutter 启动器的维护与生命周期边界](issues/01-flutter-boundary.md) — Flutter 应用直接使用 Dart SDK；统一启动器技术体系并保持独立仓库；Web 访问由 DSH 启动器管理，Desktop 后端保持独立生命周期。

## Not yet specified

- 当前范围内的技术路线与维护边界已确定。

## Out of scope

- 将 DSH 后端或第三方插件改写为 Dart。
- 将 DSH-Workflow 源码、发布历史或用户配置搬入 MacLauncher 仓库。
- 未经单独要求切换当前运行中的应用或发布新的 Release。
- 其他自有工具的接入清单与迁移批次，留待后续单独确定。

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Assignee: Ghost233
Blocked by:

# 确定 Flutter 启动器的维护与生命周期边界

## Question

启动器迁移采用什么技术、维护归属和服务生命周期边界，才能复用 MacLauncher SDK，同时保持现有 DSH 行为与用户数据兼容？

## Answer

用户于 2026-10-05 确认只迁移启动器层，DSH 业务代码保留；统一 Flutter、SDK 和工程规范，两个仓库保持独立。

现有 SDK 是纯 Dart，可由 Flutter 应用直接调用，无需 Swift/Dart 独立桥接进程。Flutter 负责界面及应用侧业务控制，原生接口负责菜单栏、窗口、登录项和原有配置兼容。SDK 与界面共用同一业务控制入口，真实运行状态由业务进程产生。

现有 DSH 启动器的 stop 只结束 Web 访问资源，不结束官方 Desktop 后端；迁移保留此归属。SDK 断线或管理端退出时必须恢复应用入口，并保持业务运行。独立 Git SDK 依赖与编译支持通过实际解析/构建验证，不以文档示例作为通过证据。

## Context

- [SDK 接入文档](/Users/ghost233/Ghost233Code/MacLauncher/docs/SDK_INTEGRATION.md)
- [MacLauncher 工程规范](/Users/ghost233/Ghost233Code/MacLauncher/docs/engineering.md)
- [现有启动器说明](/Users/ghost233/Ghost233Code/DSH-Workflow/macos-launcher/README.md)

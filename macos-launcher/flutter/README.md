# DSH Workflow Flutter 启动器

与 MacLauncher 采用同一 Flutter、官方 SDK 和工程规范体系，保留独立仓库。固定工具链为 Flutter 3.47.7 / Dart 3.13.5，SDK Git 提交由 pubspec.yaml 与生成的 pubspec.lock 固定。

Flutter Widget 负责界面；LauncherController 组织服务控制、客户端操作、状态与日志；MacLauncherIntegration 将 SDK 与界面连接到同一控制入口。独立服务管理进程持有 DSH 服务端生命周期，关闭 Flutter 启动器不停止服务。Swift Runner 保留窗口、菜单栏、登录项、实例锁及原有配置兼容接口。

## 接入

在 MacLauncher 中关联仓库根目录 maclauncher.json，或已打包应用 Contents/Resources/maclauncher.json。前者打开 /Applications/DSH Workflow.app，后者通过相对路径指向包含它的应用包。

project.id 为 dsh-workflow；保留 web、desktop 服务标识，分别提供 Web 入口与 DSH 服务端的启动、回收、状态和日志。回收 Web 只关闭浏览器访问；停止 DSH 服务前检查工作并按需要确认。管理端、启动器或桌面客户端退出后，已经启动的服务和 Web 入口继续运行。管理端失联时恢复本应用菜单入口。

应用 Bundle ID、UserDefaults 设置键、Application Support/DSH Workflow、lan-password 及旧钥匙串只读迁移沿用原有位置。SDK 不会读取或传递内网密码。

## 检查与构建

工程检查使用 Node.js 24.12.0。先在仓库根目录准备当前维护版 Matt 面板；真实项目装配测试需要它的构建产物，再进入 Flutter 目录运行检查：

```sh
npm ci --prefix matt-skills-panel-plugin --ignore-scripts --no-audit --no-fund
npm run build --prefix matt-skills-panel-plugin
cd macos-launcher/flutter
FLUTTER_BIN="$HOME/flutter/bin/flutter" DART_BIN="$HOME/flutter/bin/dart" bash check.sh
```

每次检查均使用真实 lockfile 解析，格式检查不改写源码，静态分析必须零诊断。真实 Unix socket 测试覆盖 SDK 回调、服务归属、断线与迟到入口动作；真实 Node 进程测试覆盖界面与 SDK 并发控制、Desktop 失联重连、日志实例归属以及暂停子进程时的重复退出；界面测试覆盖最小窗口中的三个页面。

macOS 原生验收使用独立临时数据目录和 SDK endpoint：

```sh
flutter build macos --debug --no-pub
dart run tool/native_probe.dart 'build/macos/Build/Products/Debug/DSH Workflow.app/Contents/MacOS/DSH Workflow'
```

Debug 验收检查真实窗口、菜单显隐与断线恢复。测试配置环境和 VM 原生状态接口仅在 Debug 生效；Release 不提供它们。验收不使用当前用户 profile，不启动用户业务。

生产构建从仓库根目录使用 macos-launcher/build.mjs；先准备现有官方 Desktop 与面板产物。构建将 Flutter Release 应用、现有 Node/DSH 运行时、插件和 Desktop 装配为一个独立应用。CI 在对应原生架构上设置构建架构、测试并生成一份 ARM64 DMG；移动副本继续接受真实 Host、Office、JEV/监控与 Matt 验收。

启动器与桌面端只读检查本仓库的 macos-v 正式发行版本，候选须包含适用的配套 DMG。检查和打开发布页不下载或安装资产，也不停止共享服务；运行端不单独换插件包。MacLauncher SDK 负责服务与入口协作，组件升级统一在仓库中维护并随 DMG 交付。

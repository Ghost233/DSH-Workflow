# DSH Workflow Flutter 启动器

与 MacLauncher 采用同一 Flutter、官方 SDK 和工程规范体系，保留独立仓库。固定工具链为 Flutter 3.47.6 / Dart 3.13.5，SDK Git 提交由 pubspec.yaml 与生成的 pubspec.lock 固定。

Flutter Widget 负责界面；LauncherController 负责业务生命周期、真实状态和日志；MacLauncherIntegration 将 SDK 与界面连接到同一控制入口。Swift Runner 仅保留窗口、菜单栏、登录项、实例锁及原有配置兼容接口。

## 接入

在 MacLauncher 中关联仓库根目录 maclauncher.json，或已打包应用 Contents/Resources/maclauncher.json。前者打开 /Applications/DSH Workflow.app，后者通过相对路径指向包含它的应用包。

project.id 为 dsh-workflow；web 服务提供启动、回收、状态和日志；desktop 服务仅提供状态。回收 Web 不退出启动器，也不终止官方 Desktop 后端。管理端失联时恢复本应用菜单入口，并继续保持业务运行。

应用 Bundle ID、UserDefaults 设置键、Application Support/DSH Workflow、lan-password 及旧钥匙串只读迁移沿用原有位置。SDK 不会读取或传递内网密码。

## 检查与构建

```sh
FLUTTER_BIN="$HOME/flutter/bin/flutter" DART_BIN="$HOME/flutter/bin/dart" bash check.sh
```

每次检查均使用真实 lockfile 解析，格式检查不改写源码，静态分析必须零诊断。真实 Unix socket 测试覆盖 SDK 回调、服务归属、断线与迟到入口动作；真实 Node 进程测试覆盖界面与 SDK 并发控制、Desktop 失联重连、日志实例归属以及暂停子进程时的重复退出；界面测试覆盖最小窗口中的三个页面。

macOS 原生验收使用独立临时数据目录和 SDK endpoint：

```sh
flutter build macos --debug --no-pub
dart run tool/native_probe.dart 'build/macos/Build/Products/Debug/DSH Workflow.app/Contents/MacOS/DSH Workflow'
```

Debug 验收检查真实窗口、菜单显隐与断线恢复。测试配置环境和 VM 原生状态接口仅在 Debug 生效；Release 不提供它们。验收不使用当前用户 profile，不启动用户业务。

生产构建从仓库根目录使用 macos-launcher/build.mjs；先准备现有官方 Desktop 与面板产物。构建将 Flutter Release 应用、现有 Node/DSH 运行时、插件和 Desktop 装配为一个独立应用。CI 在对应原生架构上设置构建架构、测试并生成两种 DMG；移动副本继续接受真实 Host、Office、Owner 与 Matt 验收。

更新入口继续查询本仓库的 macos-v 发行版本。MacLauncher SDK 只承担已实现的生命周期与入口协作，不替代本项目的更新和插件管理。

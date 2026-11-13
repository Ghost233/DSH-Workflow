# DSH Workflow Flutter 启动器

与 MacLauncher 采用同一 Flutter、官方 SDK 和工程规范体系，保留独立仓库。固定工具链为 Flutter 3.47.7 / Dart 3.13.5，SDK Git 提交由 pubspec.yaml 与生成的 pubspec.lock 固定。

Flutter Widget 负责界面；LauncherController 组织服务控制、客户端操作、状态与日志；MacLauncherIntegration 将 SDK 与界面连接到同一控制入口。独立管理进程执行 DSH 服务启停。关闭窗口时服务继续运行；退出 Station 时统一检查并停止全部受管服务，清理失败时保留窗口。Swift Runner 保留窗口、菜单栏、登录项、实例锁及原有配置兼容接口。

启动器通过本机 Unix socket 订阅 DSH 和 Web 管理进程的状态。管理进程在状态或日志变化时推送快照。订阅连接空闲时不发心跳，也不触发状态查询。启动器首次打开和再次显示窗口时补读状态，MacLauncher 的主动查询继续按请求执行。

启动器只启动一个 Node 通知辅助进程，用文件系统事件发现管理进程重建并恢复订阅。退出 Station 会先停止日常 DSH 和 Web，回收受管后代进程，再关闭状态订阅及其辅助进程。旧管理进程不支持通知时，启动器明确提示版本不兼容，不启用轮询。更新管理进程仍须遵守未完成工作检查，通知重连不会启动或重启业务服务。

## 接入

在 MacLauncher 中关联仓库根目录的 `maclauncher.json`，或应用包内的 `Contents/Resources/maclauncher.json`。仓库配置打开 `/Applications/Ghost DSH Station.app`。包内配置用相对路径打开所属的应用包。

project.id 为 dsh-workflow；为兼容已关联的 MacLauncher，保留 web、desktop 服务标识，分别表示 Web 入口和 DSH 服务端。`desktop` 是历史服务 ID，不代表桌面客户端。回收 Web 只关闭浏览器访问；停止 DSH 服务前检查工作并按需要确认。MacLauncher 管理端退出后，Station 仍管理正在运行的服务；退出 Station 时统一停止这些服务。管理端失联时恢复本应用菜单入口。

应用 Bundle ID、UserDefaults 设置键、Application Support/DSH Workflow、lan-password 及旧钥匙串只读迁移沿用原有位置。SDK 不会读取或传递内网密码。

## 检查与构建

工程检查使用 Node.js 24.12.0。先在仓库根目录准备当前维护版 Matt 面板；真实项目装配测试需要它的构建产物，再进入 Flutter 目录运行检查：

```sh
npm ci --prefix matt-skills-panel-plugin --ignore-scripts --no-audit --no-fund
npm run build --prefix matt-skills-panel-plugin
cd macos-launcher/flutter
FLUTTER_BIN="$HOME/flutter/bin/flutter" DART_BIN="$HOME/flutter/bin/dart" bash check.sh
```

每次检查均使用真实 lockfile 解析，格式检查不改写源码，静态分析必须零诊断。真实 Unix socket 测试覆盖 SDK 回调、服务归属、断线与迟到入口动作；真实 Node 进程测试覆盖界面与 SDK 并发控制、Web 服务重连、日志实例归属以及暂停子进程时的重复退出。

macOS 原生验收使用独立临时数据目录和 SDK endpoint：

```sh
flutter build macos --debug --no-pub
dart run tool/native_probe.dart 'build/macos/Build/Products/Debug/Ghost DSH Station.app/Contents/MacOS/Ghost DSH Station'
```

Debug 验收检查真实窗口、菜单显隐与断线恢复。测试配置环境和 VM 原生状态接口仅在 Debug 生效；Release 不提供它们。验收不使用当前用户 profile，不启动用户业务。

给用户交互查看的隔离 Debug 预览，应额外设置 `DSH_LAUNCHER_NATIVE_SEMANTICS=1`，让 macOS 无障碍桥请求初始完整语义树。自动化测试默认持有框架语义句柄；若在这之后才接入系统无障碍检查，Flutter 3.47.7 的原生桥可能只收到增量节点，出现 `Failed to update ui::AXTree` 并闪退。预览模式不关闭无障碍功能，原有自动化测试模式保留。

先准备面板产物，再从仓库根目录运行 `node macos-launcher/build.mjs`。构建把 Flutter 启动器、固定的 DSH Web 核心和随包插件装入应用。macOS ARM64 候选包需验证 Web Host、组件清单、Matt 面板和原生窗口。

启动器只读检查本仓库的 `macos-v` 正式发行版本，候选须包含适用的 DMG。随包组件通过应用更新交付。全局 npm 插件可在 Station 的“插件”页手动更新。

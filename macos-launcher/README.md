# DSH Workflow macOS 启动器

启动器界面、应用侧业务控制与 SDK 接入采用 Flutter/Dart，与 MacLauncher 使用同一技术体系并保持独立仓库。Swift 仅保留 macOS 原生接口。接入和统一检查流程见 [Flutter 启动器说明](flutter/README.md)。

启动器只管理一个全局实例。官方 Electron 桌面端启动并持有 DSH Host；Web 入口通过带密码的代理连接这个 Host，不再启动第二个 Web 后端。桌面端和浏览器共享模型配置、会话、工作区及插件。

DSH 源码保持上游原样。项目集成通过 Desktop profile 中的 `dsh-workflow-desktop` Bundle 加载 Owner、中文 Matt 技能和 `dsh-workflow-matt-panel` 本地派生面板，并发布权限为 `0600` 的后端就绪记录。本地面板不包含 bundled skills，原版 Deck 的宿主和工具条目在项目装配中停用。

面板源码位于主仓库普通目录 `matt-skills-panel-plugin/`，按主项目正常提交即可被 CI 获取；`vendor/dsh-mattpocock-skills-deck` 只用于追踪上游。打包前运行 `npm ci --prefix matt-skills-panel-plugin --ignore-scripts`、`npm run build --prefix matt-skills-panel-plugin`。构建不写入运行中的 profile，也不重启服务；升级对照见派生版 README。

## 当前本地构建

目前已验证 macOS arm64 的源码开发构建，DSH 版本为 `dsh-runtime.json` 固定的版本。桌面应用仍依赖本机源码目录及其中的编译产物和官方 Python／Office runtime；它不是可移到其他电脑的发行安装包。

先在 `deepseek-harness` 完成上游依赖初始化、原生系统模块、库、Desktop 和 Web 构建，然后在项目根目录运行：

```sh
node deepseek-harness/node_modules/tsx/dist/cli.mjs macos-launcher/build-desktop.mjs
DSH_MACOS_DESKTOP_APP="$PWD/.build/DeepSeek Harness-0.2.1-alpha.1-source.app" node macos-launcher/build.mjs
```

`build-desktop.mjs` 使用上游开发运行时装配流程、固定依赖的 Electron 和官方 primary runtime，不修改 DSH 源文件。源码应用输出为 `.build/DeepSeek Harness-<DSH版本>-source.app`；启动器将它放入 `Contents/Resources/desktop/`。已有产物不会被覆盖；重新构建前应明确处理旧产物。两个应用均使用本地 ad-hoc 签名。

`build.mjs` 必须提供已构建的 Desktop 应用，并提前在 `macos-launcher/flutter` 完成固定 Flutter 依赖解析。打包使用独立 Node 发行版；共享库版 Node 不能直接复制到应用包。上述源码开发应用用于本机调试；分发使用下面的生产构建流程。

## GitHub 双架构生产构建

`.github/workflows/macos-app.yml` 在 arm64 和 x64 原生 runner 上初始化固定 DSH 依赖、运行上游 `build:official`、封装本地 npm 包集合并准备官方 Electron、Node、pnpm 和 Python／Office runtime。上游源码保持原样。

CI 同时准备固定 Flutter 3.47.6，检查 lockfile、Dart 格式、静态分析与真实 SDK socket 测试，再将对应架构的 Flutter Release 应用与既有运行时装配为启动器。maclauncher.json 声明 Web 访问服务的启动/回收/状态/日志与 Desktop 后端的只读状态；入口托管、窗口激活和失联恢复由应用负责。

`build-desktop-release.mjs` 使用上游生产包集合、工程元数据和运行时校验接口，按 Electron 的 Node 版本安装生产依赖，生成包含完整资源的 Desktop 应用。应用资源不使用源码目录或开发运行时链接；本项目使用 ad-hoc 签名，不调用上游要求 Developer ID 与公证凭据的发行入口。

`verify-desktop-release.mjs` 将应用复制到独立临时目录，核对签名和运行时文件完整性，并运行上游真实 Host、前端、插件及 DOCX／XLSX／PPTX 转 PDF 验收。通过后，CI 将该 Desktop 应用传给启动器打包，再验收实际包中的 Desktop、Owner 就绪状态及 Matt 面板装配，最后校验两种架构的 DMG。验收使用临时 profile，不修改用户运行配置。main 构建生成 Actions artifacts；正式发布仍由 `macos-v<版本>` 标签触发。

## 启动和关闭

日常入口仍为无参数 `./start-owner-workflow.sh`。在 macOS 上，它通过 `dsh-workflow://open-global` 唤起已构建的启动器并打开全局实例；重复运行复用启动器和官方 Desktop 的单实例机制。在其他平台保留原来的源码 Web 启动路径。

首次打开管理窗口需要设置访问密码。启动器将 Web 连接到正在运行的 Desktop Host；后端未运行时才打开官方桌面端。唯一主入口“打开 DSH”激活已有桌面应用，不会额外打开浏览器标签。每个工程在 DSH 内选择工作目录。

Web 只有一个端口 `33080`，监听 `0.0.0.0`。本机访问 `http://127.0.0.1:33080/`，局域网使用 Mac 当前的内网 IP 和同一个端口。没有有效登录 cookie 时显示密码页；密码正确后，代理在服务器内部通过桌面后端的私有 token 取得后端认证 cookie，并把它保存在当前 Web 会话中。浏览器只持有代理登录 cookie，登录后回到同一端口的 `/`，随后直接访问 DSH。HTTP 和 WebSocket 使用同一认证会话，不再经过导航页或跨端口跳转。

访问设置中的“停止 Web 服务”或退出启动器只关闭代理，不终止官方桌面端的 Host。“重连 Web”重新启动同一端口的 Web 入口并连接现有 Host。关闭 Desktop 窗口的行为沿用官方设计；完全退出 Desktop 才会结束它的后端。Desktop 重新启动后，在启动器点“打开 DSH”即可连接新的 Host。

启动器使用 `global-supervisor.mjs`，只保存一个全局连接状态；管理指令通过启动器私有控制管道传递，没有 `/global/open`、等待页、导航登录或目录实例 HTTP 接口。原 `catalogs.json` 和目录实例历史数据保留但不再读取。全局工作流数据仍位于 `~/Library/Application Support/DSH Workflow/global`。Desktop profile 初次缺失时复制已有 Web profile 配置和插件，后续保留 Desktop 用户配置。

## 权限、网络和插件

“完整访问权限”在项目 Desktop Bundle 中配置 DSH 的 `danger-full-access`；关闭时使用 `workspace-write`。权限处理沿用 DSH，已有会话设置也遵循其原生规则。改变后端权限或更新 Host 插件需要完全退出并重新打开 Desktop，仅断开 Web 不会重启 Host。

本机入口用于管理模型和 API Key。局域网设置写入默认关闭；打开“允许局域网修改 DSH 设置”后，密码认证的 Web 代理为客户端提供该能力，DSH 源码和桌面端资源保持不变。变更该设置后重连 Web 并重新登录。代理验证密码、有效会话、Host 和 Origin；修改密码会立即撤销旧会话并关闭其 WebSocket。监听所有 IPv4 网卡后，切换网络无需重绑代理，Host 校验和启动器展示的内网地址使用当前网卡 IP，不把 `0.0.0.0` 当作访问地址。

插件管理表格读取实际使用的 `$DSH_HOME/profiles/desktop`，包括 npm 依赖、Bundle、自研插件、中文技能和项目锁定快照。表格中的兼容版本及最新支持 DSH 版本取作者发布元数据；未声明时如实显示。与 DSH 绑定的官方包和项目打包插件随应用构建更新。

独立 npm 插件可逐项更新。更新 Desktop profile 前应完全退出官方 Desktop，沿用官方 profile 管理约束；更新后重新启动 Desktop 加载新版本。插件管理不会终止正在运行的 Desktop 任务。项目清单中的 `startup: true` 插件沿用既有 Web profile 安装结果，首次 Desktop 初始化时一并复制；单项安装失败仍应报告真实原因。

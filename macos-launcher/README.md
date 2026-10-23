# Ghost DSH Station macOS 启动器

启动器界面、应用侧业务控制与 SDK 接入采用 Flutter/Dart，与 MacLauncher 使用同一技术体系并保持独立仓库。Swift 仅保留 macOS 原生接口。接入和统一检查流程见 [Flutter 启动器说明](flutter/README.md)。

启动器管理一个独立 DSH 服务端。桌面客户端和带密码的 Web 入口连接同一个实例，共享模型配置、会话、工作区及插件。桌面客户端不持有服务的启动和停止权限。

DSH 源码保持上游原样。项目集成通过 Desktop profile 中的 `dsh-workflow-desktop` Bundle 加载 JEV/监控、中文 Matt 技能和 `dsh-workflow-matt-panel` 本地派生面板，并发布权限为 `0600` 的服务就绪记录。本地面板不包含 bundled skills，原版 Deck 的宿主和工具条目在项目装配中停用。

面板源码位于主仓库普通目录 `matt-skills-panel-plugin/`，随主仓库提交并被打包进启动器资源；`vendor/dsh-mattpocock-skills-deck` 只用于追踪上游。打包前运行 `npm ci --prefix matt-skills-panel-plugin --ignore-scripts`、`npm run build --prefix matt-skills-panel-plugin`。构建不写入运行中的 profile，也不重启服务；升级对照见派生版 README。

## 当前本地构建

目前已验证 macOS arm64 的源码开发构建，DSH 版本为 `dsh-runtime.json` 固定的版本。桌面应用仍依赖本机源码目录及其中的编译产物和官方 Python／Office runtime；它不是可移到其他电脑的发行安装包。

先在 `deepseek-harness` 完成上游依赖初始化、原生系统模块、库、Desktop 和 Web 构建，然后在项目根目录运行：

```sh
node deepseek-harness/node_modules/tsx/dist/cli.mjs macos-launcher/build-desktop.mjs
DSH_SOURCE_VERSION="$(node -p "require('./dsh-runtime.json').version")"
DSH_MACOS_DESKTOP_APP="$PWD/.build/DeepSeek Harness-${DSH_SOURCE_VERSION}-source.app" node macos-launcher/build.mjs
```

`build-desktop.mjs` 使用上游开发运行时装配流程、固定依赖的 Electron 和官方 primary runtime，不修改 DSH 源文件。源码应用输出为 `.build/DeepSeek Harness-<DSH版本>-source.app`；启动器将它放入 `Contents/Resources/desktop/`。已有产物不会被覆盖；重新构建前应明确处理旧产物。两个应用均使用本地 ad-hoc 签名。

`build.mjs` 必须提供已构建的 Desktop 应用，并提前在 `macos-launcher/flutter` 完成固定 Flutter 依赖解析。打包使用独立 Node 发行版；共享库版 Node 不能直接复制到应用包。上述源码开发应用用于本机调试；分发使用下面的生产构建流程。

## ARM64 生产构建

发布操作统一遵循 [deploy-release skill](../.agents/skills/deploy-release/SKILL.md)。

正式版由 `macos-v*` tag 触发 GitHub Actions，在 macOS ARM64 runner 上编译、打包并上传 Release。流水线只执行生产构建、签名和打包，不运行 CI、单元、集成、smoke 或运行时验收测试；普通 push 和 PR 不触发测试工作流。版本、签名、包结构及文件哈希核对保留在打包流程中。

`scripts/build-local-release.sh` 供 Actions 和本机使用。它初始化固定 DSH 依赖，以 `build:official --scope artifacts` 生成生产产物，封装本地 npm 包集合并准备官方 Electron、Node、pnpm 和 Python／Office runtime。准备运行时时传入 `--defer-primary-runtime-smoke`，仅装配资源。上游源码保持原样。资产为 DMG、`manifest.json` 与 `SHA256SUMS`，默认输出到 `.build/release-assets`。

正式验收使用与 `macos-app.yml` 相同的 Node 和 Flutter 工具链；对应的 npm 也须在 `PATH` 中。插件构建复用应用包外的 `.build/npm-cache`，优先读取已校验的缓存内容，缺失项仍从清单 registry 获取。每次候选仍重新生成依赖图、校验固定插件归档并封装本体，单条命令的 60 秒门禁保持不变。

脚本同时按固定 Flutter 依赖装配 Flutter Release 应用与运行时启动器。本机 Node 需 22+ 且带有 Node-API 开发头文件；启动器会打包一个自包含 Node，若默认 `node` 动态链接 `libnode`（例如 Homebrew 发行版），需另备自包含 Node 并以 `DSH_LAUNCHER_NODE=<路径>` 指向它。maclauncher.json 分别声明 DSH 服务端和 Web 访问服务的启动、回收、状态与日志能力；入口托管、窗口激活和失联恢复由应用负责。

`build-desktop-release.mjs` 使用上游生产包集合、工程元数据和运行时校验接口，按 Electron 的 Node 版本安装生产依赖，生成包含完整资源的 Desktop 应用。应用资源不使用源码目录或开发运行时链接；本项目使用 ad-hoc 签名，不调用上游要求 Developer ID 与公证凭据的发行入口。

重复本地预检时，可向 `build-desktop-release.mjs` 传入一个尚不存在的输出目录，例如 `.build/release-0.2.5/desktop`，保留旧应用。省略参数时沿用 `.build/desktop-arm64`。

`verify-desktop-release.mjs` 保留为单独的本机诊断工具，正式发布流程不调用它。发布 tag 由 `scripts/release.sh` 创建；Actions 完成构建后，调用 `scripts/publish-release.sh` 上传已校验资产并创建正式 Release。runner 使用本仓库的 `GITHUB_TOKEN`，不需要个人 GitHub 凭据。

## 启动和关闭

日常入口是无参数 `./start-dsh-workflow.sh`，只支持 macOS ARM64。它通过 `dsh-workflow://open-global` 唤起已构建的启动器。每次启动器启动只尝试一次启动或复用服务，不强制打开桌面窗口；启动失败后显示原因，不循环重试。其他系统或架构在启动应用前明确拒绝。

服务启动时逐项尝试清单中标记 `startup: true`、已部署且版本与仓库固定值一致的插件，保留用户已有的停用选择和条件。日志分别报告实际加载结果或跳过原因；单个插件失败后继续处理其余插件。缺包、版本偏差或来源未知会如实说明，运行端不在线安装或单独更新插件。

首次使用 Web 需要设置访问密码。启动器分别提供“打开桌面版”和“打开 Web”入口；两个客户端只连接已有服务。服务未运行或版本不兼容时明确提示，由用户启动或处理，不另起实例。每个工程在 DSH 内选择工作目录。

Web 只有一个端口 `33080`，监听 `0.0.0.0`。本机访问 `http://127.0.0.1:33080/`，局域网使用 Mac 当前的内网 IP 和同一个端口。没有有效登录 cookie 时显示密码页；密码正确后，代理在服务器内部通过服务端的私有 token 取得后端认证 cookie，并把它保存在当前 Web 会话中。浏览器只持有代理登录 cookie，登录后回到同一端口的 `/`，随后直接访问 DSH。HTTP 和 WebSocket 使用同一认证会话，不再经过导航页或跨端口跳转。

“停止 Web 服务”只关闭浏览器访问，桌面端与业务继续运行。关闭桌面窗口、真正退出桌面客户端或退出启动器，都保留 DSH 服务和已经启动的 Web 入口。停止 DSH 服务后，保留的 Web 入口显示服务不可用。停止或重启服务前检查未完成工作和相关定时提醒；有工作或状态未知时先展示影响并确认，取消后原实例和工作继续运行。

服务异常退出后保持停止，通过 macOS 系统通知提醒检查日志，等待用户手动启动。通知权限受限或发送失败时显示真实原因；主动停止不发送故障通知。现有登录启动开关控制是否在登录时打开启动器，关闭开关不会停止当前服务。

启动器使用 `global-supervisor.mjs`，只保存一个全局连接状态；管理指令通过启动器私有控制管道传递，没有 `/global/open`、等待页、导航登录或目录实例 HTTP 接口。原 `catalogs.json` 和目录实例历史数据保留但不再读取。全局工作流数据仍位于 `~/Library/Application Support/DSH Workflow/global`。Desktop profile 初次缺失时复制已有 Web profile 配置和插件，后续保留 Desktop 用户配置。

## 权限、网络和插件

“完整访问权限”在项目 Desktop Bundle 中配置 DSH 的 `danger-full-access`；关闭时使用 `workspace-write`。权限处理沿用 DSH，已有会话设置也遵循其原生规则。需要重新加载服务配置时，使用显式服务重启并遵守任务检查；退出桌面客户端或断开 Web 不会重启服务。

本机入口用于管理模型和 API Key。局域网设置写入默认关闭；打开“允许局域网修改 DSH 设置”后，密码认证的 Web 代理为客户端提供该能力，规则由项目 Web 代理处理。变更该设置后重连 Web 并重新登录。代理验证密码、有效会话、Host 和 Origin；修改密码会立即撤销旧会话并关闭其 WebSocket。监听所有 IPv4 网卡后，切换网络无需重绑代理，Host 校验和启动器展示的内网地址使用当前网卡 IP，不把 `0.0.0.0` 当作访问地址。

启动器插件页展示磁盘安装版本；DSH 的“设置 → 插件 → 组件版本与来源”展示实际运行解析、全局和代理预设的作用域。两者分别对照打包的仓库固定值和来源，未知或版本偏差如实显示。应用内不查询 npm 最新版本或单独安装插件；DSH、桌面适配和插件统一随本仓库 DMG 交付。

官方安装管理侧栏和市场入口停用，原 `plugins.*` 扩展插槽失去该容器。自研 JEV、监控的设置入口及 Matt 的标准设置插槽保留；其他第三方仅注册在旧管理页的扩展内容不再显示。

启动器和桌面端的更新检查只读取 Ghost233/DSH-Workflow 的正式 Release，并核对候选包含正确版本、架构和非空大小的配套 DMG。检查更新和打开发布页不自动下载、安装、锁定或停止服务；实际服务替换仍须显式执行并遵守任务确认。


## 插件版本配置

仓库的 `project-plugins.json` 是项目第三方插件发布版本的唯一编辑入口。`project-plugins.lock.json` 是脚本生成的发布快照，禁止手动修改。生成时核对解析版本与清单中的精确版本；启动时也核对两者，锁文件不能覆盖清单中的版本。

运行端以本次应用打包的仓库清单和锁文件展示预期版本，以实际加载或解析到的包展示运行版本。历史 `$DSH_HOME/workflow/project-plugins.json` 可以保留，但不再作为运行端可编辑的插件版本权威。默认 `DSH_HOME` 为 `~/.dsh`。已有模型配置、凭据、工作区和会话历史继续保留。

运行端的单独安装、卸载、更新与同步换包入口已关闭。组件升级在仓库中修改、验证并统一打包；遇到实际版本偏差时报告原因，不静默替换运行服务。构建、正式发布和服务切换分别遵守各自流程。

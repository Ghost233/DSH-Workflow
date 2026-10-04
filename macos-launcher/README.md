# DSH Workflow macOS 启动器

启动器只管理一个全局实例。官方 Electron 桌面端启动并持有 DSH Host；Web 入口通过带密码的代理连接这个 Host，不再启动第二个 Web 后端。桌面端和浏览器共享模型配置、会话、工作区及插件。

DSH 源码保持上游原样。项目集成通过 Desktop profile 中的 `dsh-workflow-desktop` Bundle 加载 Owner、SoL、中文 Matt 技能和本地任务面板，并发布权限为 `0600` 的后端就绪记录。英文 npm Matt deck 的技能提供器不在运行配置中启用；本地面板不包含其 bundled skills。

Matt 面板的子模块引用指向上游提交；面板专用改动按用户选择仅保留在本机，未推送到子模块远端。新克隆不会包含这些改动，当前打包流程需要使用已准备好的本地面板目录。

## 当前本地构建

目前已验证 macOS arm64 的源码开发构建，DSH 版本为 `dsh-runtime.json` 固定的版本。桌面应用仍依赖本机源码目录及其中的编译产物和官方 Python／Office runtime；它不是可移到其他电脑的发行安装包。

先在 `deepseek-harness` 完成上游依赖初始化、原生系统模块、库、Desktop 和 Web 构建，然后在项目根目录运行：

```sh
node deepseek-harness/node_modules/tsx/dist/cli.mjs macos-launcher/build-desktop.mjs
DSH_MACOS_DESKTOP_APP="$PWD/.build/DeepSeek Harness-0.2.1-alpha.1-source.app" node macos-launcher/build.mjs
```

`build-desktop.mjs` 使用上游开发运行时装配流程、固定依赖的 Electron 和官方 primary runtime，不修改 DSH 源文件。源码应用输出为 `.build/DeepSeek Harness-<DSH版本>-source.app`；启动器将它放入 `Contents/Resources/desktop/`。已有产物不会被覆盖；重新构建前应明确处理旧产物。两个应用均使用本地 ad-hoc 签名。

`build.mjs` 必须提供已构建的 Desktop 应用。现有 GitHub 双架构 DMG 流程尚未接入可分发的 Desktop 生产运行时，不能直接用这个依赖本机源码的开发应用发布新版 Release。

## 启动和关闭

日常入口仍为无参数 `./start-owner-workflow.sh`。在 macOS 上，它通过 `dsh-workflow://open-global` 唤起已构建的启动器并打开全局实例；重复运行复用启动器和官方 Desktop 的单实例机制。在其他平台保留原来的源码 Web 启动路径。

首次打开管理窗口需要设置访问密码。唯一主入口“打开 DSH”会准备 Desktop profile、打开官方桌面端并连接它的后端，不会额外打开浏览器标签。远程 Web 使用 `33080` 导航入口和同一个全局后端；导航页打开 DSH 时也会通知本机启动器打开 Desktop。Web 代理使用系统分配的端口或指定端口范围。每个工程在 DSH 内选择工作目录。

访问设置中的“停止 Web 服务”或退出启动器只关闭导航和代理，不终止官方桌面端的 Host。“重连 Web”重新启动 Web 入口；之后打开 DSH 连接现有 Host。关闭 Desktop 窗口的行为沿用官方设计；完全退出 Desktop 才会结束它的后端。Desktop 重新启动后，在启动器点“打开 DSH”即可连接新的 Host。

启动器使用 `global-supervisor.mjs`，只保存一个全局连接状态；HTTP 接口固定为 `/global/open`、`/global/wait` 与 `/global/progress`，不接受目录参数或实例 ID，也没有实例列表、新建、绑定目录接口。原 `catalogs.json` 和目录实例历史数据保留但不再读取。全局工作流数据仍位于 `~/Library/Application Support/DSH Workflow/global`。Desktop profile 初次缺失时复制已有 Web profile 配置和插件，后续保留 Desktop 用户配置。

## 权限、网络和插件

“完整访问权限”在项目 Desktop Bundle 中配置 DSH 的 `danger-full-access`；关闭时使用 `workspace-write`。权限处理沿用 DSH，已有会话设置也遵循其原生规则。改变后端权限或更新 Host 插件需要完全退出并重新打开 Desktop，仅断开 Web 不会重启 Host。

本机入口用于管理模型和 API Key。局域网设置写入默认关闭；打开“允许局域网修改 DSH 设置”后，密码认证的 Web 代理为客户端提供该能力，DSH 源码和桌面端资源保持不变。变更代理设置后重启启动器服务并重新登录 Web。绑定地址可选择 Wi-Fi、以太网或私有 VPN。代理仍验证密码、会话、Host 和 Origin。

插件管理表格读取实际使用的 `$DSH_HOME/profiles/desktop`，包括 npm 依赖、Bundle、自研插件、中文技能和项目锁定快照。表格中的兼容版本及最新支持 DSH 版本取作者发布元数据；未声明时如实显示。与 DSH 绑定的官方包和项目打包插件随应用构建更新。

独立 npm 插件可逐项更新。更新 Desktop profile 前应完全退出官方 Desktop，沿用官方 profile 管理约束；更新后重新启动 Desktop 加载新版本。插件管理不会终止正在运行的 Desktop 任务。项目清单中的 `startup: true` 插件沿用既有 Web profile 安装结果，首次 Desktop 初始化时一并复制；单项安装失败仍应报告真实原因。

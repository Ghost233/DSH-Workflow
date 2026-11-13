# Ghost DSH Station macOS 启动器

启动器界面、应用侧业务控制与 SDK 接入采用 Flutter/Dart，与 MacLauncher 使用同一技术体系并保持独立仓库。Swift 仅保留 macOS 原生接口。接入和统一检查流程见 [Flutter 启动器说明](flutter/README.md)。

启动器管理一个独立 DSH Web 服务，浏览器通过带密码的入口访问。应用不包含 DSH 桌面客户端。为保留已有配置，日常服务继续读取旧版 `$DSH_HOME/profiles/desktop` 目录；这个历史目录名不会启动桌面应用。

Station 生成启动覆盖配置，加载组件清单、中文 Matt 技能和派生面板。DSH 服务发布权限为 `0600` 的就绪记录。面板维护方式见 [Matt 面板说明](../matt-skills-panel-plugin/README.md)。

## macOS ARM64 构建

默认构建使用 `dsh-runtime.json` 指定的 npm 版本和完整性摘要。`macos-launcher/package-lock.json` 固定生产依赖。构建校验两者一致，再用 `npm ci --omit=dev` 装配应用资源。

先准备独立 Node、Flutter 和 Matt 面板依赖，再运行：

```sh
npm ci --prefix matt-skills-panel-plugin --ignore-scripts
npm run build --prefix matt-skills-panel-plugin
(cd macos-launcher/flutter && flutter pub get --enforce-lockfile)
node macos-launcher/build.mjs
```

应用输出到 `.build/`，已有同名产物不会被覆盖。Node 必须可独立运行；动态链接 `libnode` 的发行版不适合直接放入应用。应用使用本地 ad-hoc 签名。

### 选择 DSH 版本并试编

查询命令按 SemVer 从高到低列出 npm 和 GitHub 的版本。同一版本同时可用时会列出两个渠道。试编时指定渠道和完整版本号。

```sh
node scripts/dsh-runtime-versions.mjs
node macos-launcher/build-candidate.mjs npm 0.2.2-rc.1
node macos-launcher/build-candidate.mjs github 0.2.2-rc.2
```

试编需要独立的 Node 24.9 或更新版本、Flutter 和 OrbStack。npm 渠道校验固定版本及包摘要。GitHub 渠道从官方 Release 的标签解析提交，并用该提交锁定的工具和依赖编译。若某个插件的预编译制品绑定了其他 DSH 版本，试编会显示原因并跳过该制品。

试编应用输出到 `.build/project-registry/station-*/`，保留本次清单和构建输入。试编只生成应用，日常入口仍从 `.build/` 顶层选择启动包。

正式生产构建使用 `scripts/build-local-release.sh`，产出 DMG、`manifest.json` 和 `SHA256SUMS`。它不会构建或打包 DSH Desktop。已有 `.build/release-assets` 时脚本保留原产物并停止；正式发布流程见 [deploy-release skill](../.agents/skills/deploy-release/SKILL.md)。

## 启动和关闭

日常入口是无参数 `./start-dsh-workflow.sh`，只支持 macOS ARM64。它通过 `dsh-workflow://open-global` 唤起已构建的启动器。启动失败后显示原因，不循环重试。其他系统或架构在启动应用前明确拒绝。

服务启动时按本地名单检查全局插件是否已安装，缺包时列出补装命令。随包组件使用构建时固定的版本。插件的加载结果和跳过原因可在日志中查看。

首次使用 Web 需要设置访问密码。启动器提供“打开 Web”入口；服务未运行或版本不兼容时会显示原因。每个工程在 DSH 内选择工作目录。

Web 只有一个端口 `33080`，监听 `0.0.0.0`。本机访问 `http://127.0.0.1:33080/`，局域网使用 Mac 当前的内网 IP 和同一个端口。没有有效登录 cookie 时显示密码页；密码正确后，代理在服务器内部通过服务端的私有 token 取得后端认证 cookie，并把它保存在当前 Web 会话中。浏览器只持有代理登录 cookie，登录后回到同一端口的 `/`，随后直接访问 DSH。HTTP 和 WebSocket 使用同一认证会话，不再经过导航页或跨端口跳转。

“停止 Web 服务”只关闭浏览器访问，DSH 业务继续运行。关闭 Station 窗口时保留 DSH 服务和 Web 入口。选择退出 Station 或按 Command-Q 时，先检查未完成工作，按需确认后统一停止日常 DSH 和 Web，并回收管理器及其受管后代进程。取消退出时保留服务；清理失败时保留 Station 窗口并显示原因。停止 DSH 服务后，保留的 Web 入口显示服务不可用。停止或重启服务前检查未完成工作和相关定时提醒；有工作或状态未知时先展示影响并确认，取消后原实例和工作继续运行。

服务异常退出后保持停止，通过 macOS 系统通知提醒检查日志，等待用户手动启动。通知权限受限或发送失败时显示真实原因；主动停止不发送故障通知。现有登录启动开关控制是否在登录时打开启动器，关闭开关不会停止当前服务。

启动器使用 `global-supervisor.mjs`，只保存一个全局连接状态；管理指令通过启动器私有控制管道传递，没有 `/global/open`、等待页、导航登录或目录实例 HTTP 接口。原 `catalogs.json` 和目录实例历史数据保留但不再读取。全局工作流数据仍位于 `~/Library/Application Support/DSH Workflow/global`。旧版 profile 初次缺失时复制已有 Web profile 配置和插件，后续继续保留用户配置。

## 权限、网络和插件

Station 通过启动覆盖配置设置 DSH 权限。开启“完整访问权限”时使用 `danger-full-access`，关闭时使用 `workspace-write`。已有会话沿用 DSH 的权限规则。重新加载服务配置时，先检查未完成工作，再重启 DSH 服务。

本机入口用于管理模型和 API Key。局域网设置写入默认关闭；打开“允许局域网修改 DSH 设置”后，密码认证的 Web 代理为客户端提供该能力，规则由项目 Web 代理处理。变更该设置后重连 Web 并重新登录。代理验证密码、有效会话、Host 和 Origin；修改密码会立即撤销旧会话并关闭其 WebSocket。监听所有 IPv4 网卡后，切换网络无需重绑代理，Host 校验和启动器展示的内网地址使用当前网卡 IP，不把 `0.0.0.0` 当作访问地址。

打开 Station 的“插件”页，可查看当前安装版本和全局 npm 插件的 `latest` 版本。“检查插件版本”可刷新，“一键更新”更新所有有新版的 npm 插件，也可逐项更新。Station 通过 DSH 的包管理更新原 profile，并恢复原先运行的服务。有任务在运行时，Station 会先列出任务并请求确认。更新后可逐项查看结果。DSH 的“设置 → 插件”可查看实际加载状态。

启动器的更新检查只读取 Ghost233/DSH-Workflow 的正式 Release，并核对候选包含正确版本、架构和非空大小的配套 DMG。检查更新和打开发布页不自动下载、安装、锁定或停止服务；实际服务替换仍须显式执行并遵守任务确认。


## 插件版本配置

首次启动时，Station 将[默认名单](../default-startup-plugins.json)复制到 `~/Library/Application Support/DSH Workflow/startup-plugins.json`。在 Station 的“插件 → 编辑启动检查名单”打开文件，增删 JSON 数组中的包名。保存后在下次启动 DSH 时生效。`[]` 表示跳过所有全局插件的启动检查。

检查只要求包已安装，接受 DSH profile 中的任意版本。应用升级会保留本地名单。缺包时，Station 显示包名和安装命令。启用、停用和卸载由 DSH 管理。固定 Git 和源码制品按交付清单验证。

运行端展示实际加载或解析到的版本，源码组件另显示包内固定版本。全局插件安装在 `$DSH_HOME/profiles/desktop`，默认 `DSH_HOME` 为 `~/.dsh`。

Station 不自动安装或更新全局 npm 插件。随包组件在仓库中修改、验证并统一打包。构建、正式发布和服务切换分别遵守各自流程。

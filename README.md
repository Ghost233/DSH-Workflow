# Ghost DSH Station

本项目维护 Ghost DSH Station。Station 随包加载 `dsh-station-bridge`，用于识别 DSH Host、接入 Web、检查停机任务和处理模型授权。插件状态来自 DSH 官方清单。

应用和 Ghost Launcher 注册名统一为 Ghost DSH Station。项目 ID、bundle ID、服务 ID、旧数据目录和更新资产标识保持兼容，已有配置与运行中的服务继续使用原身份。

日常入口是无参数 `./start-dsh-workflow.sh`。仅支持 macOS ARM64。Station 启动独立 DSH 服务，使用浏览器访问 Web 界面。关闭浏览器或 Station 窗口后，服务继续运行。退出 Station 时统一停止日常 DSH 和 Web，并回收它们启动的 MCP 与辅助进程。

后台 DSH 服务由 Station 随包的独立 Node 运行。官方 Desktop 客户端和 Web 共用这个 Host。Host 从 `$DSH_HOME/profiles/desktop` 读取已有的模型和插件配置，并沿用会话数据。

Station 窗口打开时显示 Dock 图标，可通过 Command-Tab 切换。关闭窗口后，Station 收回菜单栏；可从菜单栏重新打开。退出前会检查未完成工作，需确认时展示清单；取消则保留服务，清理失败则保留窗口并显示原因。

Station 的“模型”页管理 DSH 的模型提供商、API Key 和默认模型。你可以添加或编辑提供商，获取可用模型，并为新会话选择默认模型。移除提供商时，已保存的凭据会保留。模型高级字段保持原值。

Station 首次启动时把[默认名单](default-startup-plugins.json)复制到 `~/Library/Application Support/DSH Workflow/startup-plugins.json`。启动时检查 DSH `desktop` profile 是否安装了本地名单中的包。缺少插件时，启动器会列出包名和补装命令，也可以从本地名单移除相应包名。

应用包只携带全局插件的默认名单。已有本地名单会保留。在 DSH 中启用、停用或卸载全局插件。

打开 Station 的“插件”页，可查看当前安装版本和最新版本。npm 插件查询 `latest`，已登记的 GitHub Bundle 查询各自发布标签下的最新稳定版。点击“检查插件版本”可刷新，查询失败时仍显示当前版本。可逐项更新，也可点击“一键更新”。

`dsh-ghost-home-repo` 已登记为可选插件。初次安装在 DSH 的「插件 → 添加插件」中使用该插件的 GitHub Release 安装包。已安装的官方 Release Bundle 可从 Station 更新，更新保留 profile 中已有的启停选择。

插件加载失败时，启动日志会记录实际结果。[Ghost Matt 技能包](https://github.com/Ghost233/ghost-agent-market/releases/tag/dsh-ghost-matt-skills-v0.2.0) 作为 `dsh-ghost-matt-skills` 独立发布，在 DSH 的「插件 → 添加插件」中安装 GitHub Release 包，包含 27 个 Matt 中文技能、`refine-issue` 和 `spec-delivery`。技能包在 DSH profile 中管理，不随 Station 安装包交付或固定版本；旧的 Station 内置技能来源会停用，避免遮蔽独立包。Ghost Matt 技能包和 Ghost Agent Sentinel 由 DSH profile 从 GitHub 安装和管理。

项目 MCP 配置维护在 [project-mcp.json](project-mcp.json)，由 Web 启动层装配，并随 macOS 应用打包。默认连接 CodeGraph：需先在运行 DSH 的机器上安装 `codegraph` 并确保其在 PATH 中；启动层不安装服务或创建索引。用户 profile 中已有相同 `serverName` 的配置（包括禁用项）优先保留。

使用 CodeGraph 时，在需要检索的工程中自行运行 `codegraph init`，再在 DSH 调用 `mcp__codegraph__codegraph_explore` 时传入该工程的绝对 `projectPath`。配置不固定工程目录，适用于共享后端下的多个工程。配置改动后重启宿主；已构建的 macOS 应用读取其打包副本，源码改动需重新构建启动器后生效。连接失败由 DSH 记录，不阻止其他可选插件启动。

### Dot 配置

Station 的「Dot 配置」标签独立于 Web。打开「配置连接」，填现有隧道 ID 和来自可信分发渠道的客户端 SHA-256，选择包含 `tunnel-client` 和 `runtime.key` 的现有私有目录，并填写允许读取的会话 ID。客户端及运行凭据不随 Station 分发；只选择本机目录，不在界面输入密钥。Station 生成本机 MCP 端口和凭据、原子落盘；保存不启动连接。「启动／关闭／重启」只影响隧道，不停止 Web 或 DSH。

从界面保存的配对是只读的，以 `0600` 的单份配置保存在 Station 数据目录，并优先于下述旧的试点文件。需要更换配对时先关闭隧道。显示客户端运行不代表 ChatGPT 已连通，接通后应由 Dot 实际读取一次。

### 会话观测 MCP（本机试点）

默认关闭。共享 DSH Host 启动时检查其已有的进程回执目录（与 `desktop-host.json` 同目录，即 Station 数据根目录下的 `global/.dsh-workflow/desktop/`）中的 `session-observation-mcp.json`。缺少文件、文件权限或配置不合格时不会启动该 MCP，不影响 DSH 服务。此目录不是 Web 访问服务配置目录。

观测配置仅允许 `port`、`bearer`、`sessions` 和可选的 `activeSessionIds`。前三项分别为未占用的本机端口、专用随机凭据和已明确授权的会话（每项只有 `id`、`label`）。指定会话状态与历史标记从 `sessions` 读取，最多 8 项；活跃清单可单独配置最多 128 项，每页 100，分页不重采。单纯列清单的权限不授予读取历史的权限。配置为当前系统用户持有、权限 `0600` 的普通文件，拒绝符号链接。凭据留在本机，不写仓库、日志或参数。

启用后入口为 `http://127.0.0.1:<port>/mcp`。使用新版 MCP 时，Dot 主动列清单、拉指定会话的活动标记。观测默认不返回对话原文或语义判断；隔离夹具验证过重复输出诊断，不代表已验所有偏离需求的情况。不提供 DSH 主动推送、事件订阅、审批或拒绝入口。

要让共享 Host 自己维持现有 Dot 连接，在同一个回执目录内放置权限 `0600` 的 `station-dot-tunnel.json`，字段仅有 `directory`（原已核验的本机私有目录）、`tunnelId`（现有注册的 ID）和 `clientSha256`（已核验的客户端摘要）。目录为 `0700`，已有固定名客户端和运行凭据由 Host 校验，不随包分发。没有有效配置就不启用。Dot 测试联调窗口预留 1 小时；正式连接跟随共享 Host 的生命周期，不要求用户每轮重新注册。

提示词投递默认不公布。仅当本机回执目录下存在当前用户拥有的 `0700` 普通目录 `station-dot-approved-prompts/` 时，才公布独立的写工具。每次须由受信任的本机确认流程在该目录写入 `<request UUID>.json`（`0600`），精确记录 `sessionId`、经 `stationDotHostPromptDigest` 产生的 `digest` 与未来最多一小时的毫秒时间戳 `expiresAt`。Dot 端看到「同意」仍不能跳过本机确认记录。入箱与执行完成分开。发前持久化保留编号；回执不明确、重启或重复调用都不会重复入箱。配置生效需重启新包的共享 Host，不影响当前未切换的旧包。

工程检查入口是 `node scripts/run-project-tests.mjs`。Flutter 按 `macos-launcher/flutter/check.sh` 验证。应用和工程检查均只支持 macOS ARM64，发布工作流构建 ARM64 DMG。

本机容器使用 OrbStack 的 Docker 引擎和标准 Docker Compose；容器与 macOS 原生构建的执行边界见 [AGENTS.md](AGENTS.md#本机容器工作流)。

领域术语见 [GLOSSARY](GLOSSARY.md)。

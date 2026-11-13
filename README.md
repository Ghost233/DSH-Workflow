# Ghost DSH Station

本项目维护 DSH 启动器和随包的 Browser Harness 集成。Station 直接加载启动桥接和插件清单，不在全局 profile 注册 Station 插件包。

应用和 Ghost Launcher 注册名统一为 Ghost DSH Station。项目 ID、bundle ID、服务 ID、旧数据目录和更新资产标识保持兼容，已有配置与运行中的服务继续使用原身份。

日常入口是无参数 `./start-dsh-workflow.sh`。仅支持 macOS ARM64。Station 启动独立 DSH 服务，使用浏览器访问 Web 界面。关闭浏览器或 Station 窗口后，服务继续运行。退出 Station 时统一停止日常 DSH 和 Web，并回收它们启动的 MCP 与辅助进程。

后台 DSH 服务由 Station 随包的独立 Node 运行。应用只交付 Web 核心，不包含 DSH 桌面客户端。为保留已有模型、插件和会话配置，日常服务继续使用旧版的 `$DSH_HOME/profiles/desktop` 配置目录；目录名称不代表仍有桌面客户端。

Station 窗口打开时显示 Dock 图标，可通过 Command-Tab 切换。关闭窗口后，Station 收回菜单栏；可从菜单栏重新打开。退出前会检查未完成工作，需确认时展示清单；取消则保留服务，清理失败则保留窗口并显示原因。

Station 的“模型”页管理 DSH 的模型提供商、API Key 和默认模型。你可以添加或编辑提供商，获取可用模型，并为新会话选择默认模型。移除提供商时，已保存的凭据会保留。模型高级字段保持原值。

Station 首次启动时把[默认名单](default-startup-plugins.json)复制到 `~/Library/Application Support/DSH Workflow/startup-plugins.json`。启动时检查 DSH `desktop` profile 是否安装了本地名单中的包。缺少插件时，启动器会列出包名和补装命令，也可以从本地名单移除相应包名。

应用包只携带全局插件的默认名单。已有本地名单会保留。在 DSH 中启用、停用或卸载全局插件。

打开 Station 的“插件”页，可查看当前安装版本和 npm 的 `latest` 版本。点击“检查插件版本”可刷新，查询失败时仍显示当前版本。可通过 DSH 的包管理器逐项更新，也可点击“一键更新”。

插件加载失败时，启动日志会记录实际结果。中文技能通过项目装配层加载。Ghost Agent Sentinel 由 DSH profile 从 GitHub 安装和管理。

项目 MCP 配置维护在 [project-mcp.json](project-mcp.json)，由 Web 启动层装配，并随 macOS 应用打包。默认连接 CodeGraph：需先在运行 DSH 的机器上安装 `codegraph` 并确保其在 PATH 中；启动层不安装服务或创建索引。用户 profile 中已有相同 `serverName` 的配置（包括禁用项）优先保留。

[Browser Harness 内部插件](browser-harness-plugin/README.md)随应用交付固定子模块版本的官方 Skill 和配套文档。启动器现有版本列表展示技能提交及 DSH 默认 Shell 的 CLI 路径、版本和状态；CLI 由用户在外部安装。上游技能只在打包时检查差异，采用更新需明确推进子模块，运行端不联网更新或轮询。

使用 CodeGraph 时，在需要检索的工程中自行运行 `codegraph init`，再在 DSH 调用 `mcp__codegraph__codegraph_explore` 时传入该工程的绝对 `projectPath`。配置不固定工程目录，适用于共享后端下的多个工程。配置改动后重启宿主；已构建的 macOS 应用读取其打包副本，源码改动需重新构建启动器后生效。连接失败由 DSH 记录，不阻止其他可选插件启动。

工程检查入口是 `node scripts/run-project-tests.mjs` 和 `node agent-observation-plugin/scripts/build-client.mjs --check`；Flutter 按 `macos-launcher/flutter/check.sh` 验证。应用、工程检查和 CI 均只支持 macOS ARM64，构建一份 ARM64 DMG。构建、实际 SDK/窗口及分发结果独立结算。

本机容器使用 OrbStack 的 Docker 引擎和标准 Docker Compose；容器与 macOS 原生构建的执行边界见 [AGENTS.md](AGENTS.md#本机容器工作流)。

领域术语见 [GLOSSARY](GLOSSARY.md)。

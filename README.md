# Ghost DSH Station

本项目维护 DSH 启动器、独立 JEV 中心与原生代理监控，以及 [Matt 本地派生面板](matt-skills-panel-plugin/README.md)。DSH、SDK 与第三方上游保持原样。

应用和 Ghost Launcher 注册名统一为 Ghost DSH Station。项目 ID、bundle ID、服务 ID、旧数据目录和更新资产标识保持兼容，已有配置与运行中的服务继续使用原身份。

日常入口是无参数 `./start-dsh-workflow.sh`。仅支持 macOS ARM64。Station 启动独立 DSH 服务，使用浏览器访问 Web 界面。关闭浏览器或 Station 窗口后，服务继续运行；退出 Station 时统一停止日常 DSH 和 Web，并回收它们启动的 MCP 与辅助进程。JEV/监控由 `agent-observation-plugin/` 提供，固定配置 entry ID 保持不变。

后台 DSH 服务由 Station 随包的独立 Node 运行。应用只交付 Web 核心，不包含 DSH 桌面客户端。为保留已有模型、插件和会话配置，日常服务继续使用旧版的 `$DSH_HOME/profiles/desktop` 配置目录；目录名称不代表仍有桌面客户端。

Station 窗口打开时显示 Dock 图标，可通过 Command-Tab 切换。关闭窗口后，Station 收回菜单栏；可从菜单栏重新打开。退出前会检查未完成工作，需确认时展示清单；取消则保留服务，清理失败则保留窗口并显示原因。

Station 的“模型”页管理 DSH 的模型提供商、API Key 和默认模型。你可以添加或编辑提供商，获取可用模型，并为新会话选择默认模型。移除提供商时，已保存的凭据会保留。模型高级字段保持原值。

已从交付清单移除的 `billion-context` 在旧 profile 中仍可能有依赖或 bundle 声明。Station 启动装配会停用其宿主及预设入口；原设置和旧文件保留。`dsh-context` 是另一个插件，继续按清单提供上下文洞察。

`dsh-ops` 暂时不随 Station 启动。旧配置保留；上游支持当前 DSH 版本后可重新评估启用。

第三方启动清单由 `project-plugins.json` 和锁文件提供。构建按固定 npm 版本或 Git 提交收集全部 `startup: true` 插件，将包本体和生产依赖放入应用的 `Resources/plugins`，以 `plugin-payload.json` 记录来源和完整内容摘要。缺包、版本或 Git 提交不符、入口缺失均阻止打包；DMG 和上传入口再次校验交付记录。

启动时从随包目录部署固定插件，更新 profile 中的旧包链接和依赖声明，保留旧包备份、用户配置和主动停用选择。启动不访问包仓库，也不调用包管理器。随包内容校验失败时停止准备；插件执行失败则逐项报告并继续其余装配。中文技能和 Matt 面板通过项目 integration layer 加载。

项目 MCP 配置维护在 [project-mcp.json](project-mcp.json)，由 Web 启动层装配，并随 macOS 应用打包。默认连接 CodeGraph：需先在运行 DSH 的机器上安装 `codegraph` 并确保其在 PATH 中；启动层不安装服务或创建索引。用户 profile 中已有相同 `serverName` 的配置（包括禁用项）优先保留。

[Browser Harness 内部插件](browser-harness-plugin/README.md)随应用交付固定子模块版本的官方 Skill 和配套文档。启动器现有版本列表展示技能提交及 DSH 默认 Shell 的 CLI 路径、版本和状态；CLI 由用户在外部安装。上游技能只在打包时检查差异，采用更新需明确推进子模块，运行端不联网更新或轮询。

使用 CodeGraph 时，在需要检索的工程中自行运行 `codegraph init`，再在 DSH 调用 `mcp__codegraph__codegraph_explore` 时传入该工程的绝对 `projectPath`。配置不固定工程目录，适用于共享后端下的多个工程。配置改动后重启宿主；已构建的 macOS 应用读取其打包副本，源码改动需重新构建启动器后生效。连接失败由 DSH 记录，不阻止其他可选插件启动。

工程检查入口是 `node scripts/run-project-tests.mjs` 和 `node agent-observation-plugin/scripts/build-client.mjs --check`；Flutter 按 `macos-launcher/flutter/check.sh` 验证。应用、工程检查和 CI 均只支持 macOS ARM64，构建一份 ARM64 DMG。构建、实际 SDK/窗口及分发结果独立结算。

本机容器使用 OrbStack 的 Docker 引擎和标准 Docker Compose；容器与 macOS 原生构建的执行边界见 [AGENTS.md](AGENTS.md#本机容器工作流)。

领域术语见 [GLOSSARY](GLOSSARY.md)，JEV/监控设计见 [ADR0003](docs/adr/0003-shared-named-jev-center.md)。独立 Dynamic Workflow 的未来计划仍保留，当前未实施。

## Tobs 项目协作

现引入 Tobs 官方固定提交，保留当前 DSH。独立的 `project-coordination-plugin/` 提供 GitHub 轮询、多层任务拆分、原生 Assignment 绑定、验证证据和逐级汇报。插件未配置仓库时保持待配置，不从现有 Git 工作区推断授权。配置步骤见 [Tobs 项目协作插件](project-coordination-plugin/README.md)，定稿需求见 [设计](docs/project-coordination/design.md)。

Tobs 为完整多入口 bundle，包含 Provider、Core、UI、Browser、Computer 和 PersonaBot 预设。版本、提交与制品摘要由项目清单、生成锁和 `vendor/tobs.upstream.json` 共同固定。旧 SuperAgent 集成已从当前启动与交付链路移除。

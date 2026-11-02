# Ghost DSH Station

本项目维护 DSH 启动器、独立 JEV 中心与原生代理监控，以及 [Matt 本地派生面板](matt-skills-panel-plugin/README.md)。DSH、SDK 与第三方上游保持原样。

应用和 Ghost Launcher 注册名统一为 Ghost DSH Station。项目 ID、bundle ID、服务 ID、旧数据目录和更新资产标识保持兼容，已有配置与运行中的服务继续使用原身份。

日常入口是无参数 `./start-dsh-workflow.sh`。仅支持 macOS ARM64。启动器启动或复用独立 DSH 服务端，桌面客户端和 Web 连接同一个实例；关闭客户端或启动器后服务继续运行。JEV/监控由 `agent-observation-plugin/` 提供，根包 `dsh-workflow` 的 `/jev-center`、`/agent-monitor` 及 `/client` 入口保持配置与功能。固定配置 entry IDs 延续，迁移仅修改这些 entry 的包入口；用户其他配置和凭据保留。

Station 的“模型”页管理 DSH 的模型提供商、API Key 和默认模型。你可以添加或编辑提供商，获取可用模型，并为新会话选择默认模型。配置模型时无需启动 Superagent。移除提供商时，已保存的凭据会保留。模型高级字段保持原值。

Station 的左侧“Superagent”栏目可以为每个项目启动独立后端。每个实例使用自己的仓库、GitHub 账号和飞书机器人，从浏览器打开自己的管理面板。日常 DSH 的 Web 和桌面客户端继续共用原有后端。关闭 Station 后，已启动的 Superagent 继续运行。

添加项目时，请填写仓库、已登录的 `gh` 账号配置目录、本地项目目录和独立任务目录。不同 GitHub 账号请使用独立的配置目录。配置目录的活动账号必须与项目选择的账号一致，运行期间请勿切换活动账号。新任务目录必须为空，且不能与其他项目的任务目录重叠。准备命令可以用 `WORKFLOW_PROJECT_DIR` 引用本地项目。Station 不会自动创建 worktree。

只有打开“允许接收并执行任务”，实例才会处理任务。飞书需要单独配置 `lark-cli`、机器人、群和允许的用户；配置目录留空时，飞书来源停用。允许用户和飞书群留空时，对应名单会清空。旧实例可选择沿用原面板中的名单。其余规则可在 Superagent 面板中设置，详见[上游部署说明](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/docs/006-deployment.md)。

各实例读取日常 DSH 的模型、Skill、MCP 和已安装插件配置。正在运行的实例会同步受支持的配置变更；新增插件后要重启对应实例。MCP 服务停用或实例关闭时，对应连接会关闭；实例退出时会通知其进程组停止。主动脱离进程组或忽略终止信号的 MCP 后代进程，仍需由服务自身管理。上游限制了任务会话可用的插件工具；共享插件配置不代表所有插件工具都能由任务调用。DSH 主目录 `.env` 中引用的凭据在实例启动时读取，修改后需要重启实例。

执行器在 macOS 沙箱中运行，可写入实例目录、指定的任务目录、临时目录和所需的共享凭据文件。飞书机器人还需要写入自己的事件运行目录。本地项目及其 Git 目录受到写入保护，原有未提交修改会保留。外部 MCP 服务按其自身权限运行，也可能使用独立账号；请检查它们对本地项目和 GitHub 的访问权限。

已有任务历史的实例保留原有仓库、账号、机器人和任务目录等绑定。需要使用不同绑定时，请添加项目。原有单实例的数据保留在原目录；如果缺少可核对的绑定记录且已有任务历史，Station 会保留数据并拒绝自动迁移。旧版管理器仍在后台时，请先停止原实例并重启电脑。添加或修改项目之前，请先停止所有 Superagent 实例。

第三方启动清单由 `project-plugins.json` 和锁文件提供。构建按固定 npm 版本或 Git 提交收集全部 `startup: true` 插件，将包本体和生产依赖放入应用的 `Resources/plugins`，以 `plugin-payload.json` 记录来源和完整内容摘要。缺包、版本或 Git 提交不符、入口缺失均阻止打包；DMG 和上传入口再次校验交付记录。

启动时从随包目录部署固定插件，更新 profile 中的旧包链接和依赖声明，保留旧包备份、用户配置和主动停用选择。启动不访问包仓库，也不调用包管理器。随包内容校验失败时停止准备；插件执行失败则逐项报告并继续其余装配。中文技能和 Matt 面板通过项目 integration layer 加载。

项目 MCP 配置维护在 [project-mcp.json](project-mcp.json)，由 Web 和 Desktop 启动层装配，并随 macOS 应用打包。默认连接 CodeGraph：需先在运行 DSH 的机器上安装 `codegraph` 并确保其在 PATH 中；启动层不安装服务或创建索引。用户 profile 中已有相同 `serverName` 的配置（包括禁用项）优先保留。

[Browser Harness 内部插件](browser-harness-plugin/README.md)随应用交付固定子模块版本的官方 Skill 和配套文档。启动器现有版本列表展示技能提交及 DSH 默认 Shell 的 CLI 路径、版本和状态；CLI 由用户在外部安装。上游技能只在打包时检查差异，采用更新需明确推进子模块，运行端不联网更新或轮询。

使用 CodeGraph 时，在需要检索的工程中自行运行 `codegraph init`，再在 DSH 调用 `mcp__codegraph__codegraph_explore` 时传入该工程的绝对 `projectPath`。配置不固定工程目录，适用于共享后端下的多个工程。配置改动后重启宿主；已构建的 macOS 应用读取其打包副本，源码改动需重新构建启动器后生效。连接失败由 DSH 记录，不阻止其他可选插件启动。

工程检查入口是 `node scripts/run-project-tests.mjs` 和 `node agent-observation-plugin/scripts/build-client.mjs --check`；Flutter 按 `macos-launcher/flutter/check.sh` 验证。应用、工程检查和 CI 均只支持 macOS ARM64，构建一份 ARM64 DMG。构建、实际 SDK/窗口及分发结果独立结算。

领域术语见 [GLOSSARY](GLOSSARY.md)，JEV/监控设计见 [ADR0003](docs/adr/0003-shared-named-jev-center.md)。独立 Dynamic Workflow 的未来计划仍保留，当前未实施。

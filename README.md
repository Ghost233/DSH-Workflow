# Ghost DSH Station

本项目维护 DSH 启动器、独立 JEV 中心与原生代理监控，以及 [Matt 本地派生面板](matt-skills-panel-plugin/README.md)。DSH、SDK 与第三方上游保持原样。

应用和 Ghost Launcher 注册名统一为 Ghost DSH Station。项目 ID、bundle ID、服务 ID、旧数据目录和更新资产标识保持兼容，已有配置与运行中的服务继续使用原身份。

日常入口是无参数 `./start-dsh-workflow.sh`。仅支持 macOS ARM64。启动器启动或复用独立 DSH 服务端，桌面客户端和 Web 连接同一个实例；关闭客户端窗口后服务继续运行；退出 Station 时统一停止日常 DSH、Web 和全部 Superagent，并回收它们启动的 MCP 与辅助进程。JEV/监控由 `agent-observation-plugin/` 提供，根包 `dsh-workflow` 的 `/jev-center`、`/agent-monitor` 及 `/client` 入口保持配置与功能。固定配置 entry IDs 延续，迁移仅修改这些 entry 的包入口；用户其他配置和凭据保留。

后台 DSH 服务由 Station 随包的独立 Node 运行，不启动桌面应用可执行文件。Electron 应用只用于桌面客户端；从 Station 打开桌面版时连接已有服务，关闭客户端不停止服务。

Station 与 DSH 桌面客户端在窗口打开时显示 Dock 图标，可通过 Command-Tab 切换。关闭所有窗口后，应用继续运行并收回菜单栏；可从菜单栏重新打开窗口。退出 Station 前会检查未完成工作，需确认时展示清单；取消则保留服务，清理失败则保留窗口并显示原因。最小化窗口时保留 Dock 图标。关闭客户端窗口不停止独立 DSH 服务。

Station 的“模型”页管理 DSH 的模型提供商、API Key 和默认模型。你可以添加或编辑提供商，获取可用模型，并为新会话选择默认模型。配置模型时无需启动 Superagent。移除提供商时，已保存的凭据会保留。模型高级字段保持原值。

Station 的左侧“Superagent”栏目列出所有已绑定项目，可分别查看状态、启动或停止独立后端。未绑定项目时显示添加引导，不生成默认实例；未绑定的旧实例数据仍保留。每个实例使用自己的仓库、GitHub 账号和飞书机器人，从浏览器打开自己的管理面板。日常 DSH 的 Web 和桌面客户端继续共用原有后端。关闭 Station 窗口后，Superagent 继续运行；通过菜单或 Command-Q 退出 Station 时，全部受管服务一并停止。

添加项目时，选择已登录的 `gh` 账号、有写入权限的 GitHub 仓库和分支，再选择 Superagent 专用存放目录；留空使用 Station 默认目录。首次启动会克隆专用仓库，每个任务按官方示例创建独立分支和 worktree。日常开发的本地项目无需关联。账号默认从 `~/.config/gh-profiles` 中读取；设置了 `XDG_CONFIG_HOME` 时，从该目录下的 `gh-profiles` 读取。Station 使用选中的账号，不会切换全局活动账号。

已有项目运行时，可以添加目录不重叠的专用项目。为保护现有项目，运行中的实例必须报告已启用目录隔离；旧版实例未提供该证明时，需要先退出 Station 并停止服务，再用新版重新打开。修改已有项目仍需先停止所有 Superagent。

飞书步骤可以选择已有应用机器人，也可以扫码创建新应用。机器人列表显示 App ID，成员列表显示姓名与用户 ID。扫码不保证完成全部授权：默认权限申请入口包含 `im:chat.members:read` 和敏感权限 `im:message.group_msg`；若飞书未返回成员姓名，可以另行申请 `contact:user.base:readonly` 并检查通讯录可见范围。申请后按飞书提示审批或发布应用，再刷新成员列表。实时事件订阅需要在飞书开放平台确认：启用机器人、订阅 `im.message.receive_v1`，并发布应用版本。群历史补收还需要消息读取权限（如 `im:message:readonly`）；读取群历史成功不能证明实时事件已送达。

每个项目可选择“仅 @ 机器人”或“接收群内全部消息”，以及“仅观察”或“自动接单”。全部消息模式下，允许名单用户未 @ 的消息作为候选交给上游评估；自动接单仍须匹配启用的接单规则，普通闲聊不应创建任务。仅观察只记录推断候选，允许用户明确 @ 或私聊提出的请求仍可接收。飞书请求可以直接发起任务，无需先创建 GitHub Issue。

Station 管理的接收方式、允许用户、接单模式和规则随项目保存，重启时恢复。旧项目缺少这些字段时沿用 Superagent 面板中的设置；在向导中主动开启“由 Station 管理接收与接单设置”后才由 Station 写入。关闭该开关后，保留面板里的当前值。已有任务的旧项目继续使用原任务准备方式，新建项目采用专用仓库和 worktree。详见[上游部署说明](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/docs/006-deployment.md)。

各实例读取日常 DSH 的模型、Skill、MCP 和已安装插件配置。正在运行的实例会同步受支持的配置变更；新增插件后要重启对应实例。MCP 服务停用或实例关闭时，对应连接会关闭；实例退出时会通知其进程组停止。退出 Station 时还会根据启动前记录的进程身份回收遗留后代进程。上游限制了任务会话可用的插件工具；共享插件配置不代表所有插件工具都能由任务调用。DSH 主目录 `.env` 中引用的凭据在实例启动时读取，修改后需要重启实例。

飞书 CLI 使用仅当前用户可访问的短路径入口，凭据仍保留在原配置目录。这样可避免 macOS 的 Unix socket 路径长度限制。

已从交付清单移除的 `billion-context` 在旧 profile 中仍可能有依赖或 bundle 声明。Station 启动装配会停用其宿主及预设入口，Superagent 共享配置时也会排除它；原设置和旧文件保留。`dsh-context` 是另一个插件，继续按清单提供上下文洞察。

`dsh-ops` 暂时不随 Station 启动，也不共享给 Superagent。旧配置保留；上游支持当前 DSH 版本后可重新评估启用。

执行器在 macOS 沙箱中运行，可写入实例目录、指定的任务目录、临时目录和所需的共享凭据文件。飞书机器人还需要写入自己的事件运行目录。本地项目及其 Git 目录受到写入保护，原有未提交修改会保留。外部 MCP 服务按其自身权限运行，也可能使用独立账号；请检查它们对本地项目和 GitHub 的访问权限。

已有任务历史的实例保留原有仓库、账号、机器人和任务目录等绑定。需要使用不同绑定时，请添加项目。原有单实例的数据保留在原目录；如果缺少可核对的绑定记录且已有任务历史，Station 会保留数据并拒绝自动迁移。旧版管理器仍在后台时，请先停止原实例并重启电脑。添加或修改项目之前，请先停止所有 Superagent 实例。

第三方启动清单由 `project-plugins.json` 和锁文件提供。构建按固定 npm 版本或 Git 提交收集全部 `startup: true` 插件，将包本体和生产依赖放入应用的 `Resources/plugins`，以 `plugin-payload.json` 记录来源和完整内容摘要。缺包、版本或 Git 提交不符、入口缺失均阻止打包；DMG 和上传入口再次校验交付记录。

启动时从随包目录部署固定插件，更新 profile 中的旧包链接和依赖声明，保留旧包备份、用户配置和主动停用选择。启动不访问包仓库，也不调用包管理器。随包内容校验失败时停止准备；插件执行失败则逐项报告并继续其余装配。中文技能和 Matt 面板通过项目 integration layer 加载。

项目 MCP 配置维护在 [project-mcp.json](project-mcp.json)，由 Web 和 Desktop 启动层装配，并随 macOS 应用打包。默认连接 CodeGraph：需先在运行 DSH 的机器上安装 `codegraph` 并确保其在 PATH 中；启动层不安装服务或创建索引。用户 profile 中已有相同 `serverName` 的配置（包括禁用项）优先保留。

[Browser Harness 内部插件](browser-harness-plugin/README.md)随应用交付固定子模块版本的官方 Skill 和配套文档。启动器现有版本列表展示技能提交及 DSH 默认 Shell 的 CLI 路径、版本和状态；CLI 由用户在外部安装。上游技能只在打包时检查差异，采用更新需明确推进子模块，运行端不联网更新或轮询。

使用 CodeGraph 时，在需要检索的工程中自行运行 `codegraph init`，再在 DSH 调用 `mcp__codegraph__codegraph_explore` 时传入该工程的绝对 `projectPath`。配置不固定工程目录，适用于共享后端下的多个工程。配置改动后重启宿主；已构建的 macOS 应用读取其打包副本，源码改动需重新构建启动器后生效。连接失败由 DSH 记录，不阻止其他可选插件启动。

工程检查入口是 `node scripts/run-project-tests.mjs` 和 `node agent-observation-plugin/scripts/build-client.mjs --check`；Flutter 按 `macos-launcher/flutter/check.sh` 验证。应用、工程检查和 CI 均只支持 macOS ARM64，构建一份 ARM64 DMG。构建、实际 SDK/窗口及分发结果独立结算。

本机容器使用 OrbStack 的 Docker 引擎和标准 Docker Compose；容器与 macOS 原生构建的执行边界见 [AGENTS.md](AGENTS.md#本机容器工作流)。

领域术语见 [GLOSSARY](GLOSSARY.md)，JEV/监控设计见 [ADR0003](docs/adr/0003-shared-named-jev-center.md)。独立 Dynamic Workflow 的未来计划仍保留，当前未实施。

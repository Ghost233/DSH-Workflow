# DSH Workflow

本项目维护 DSH 启动器、独立 JEV 中心与原生代理监控，以及 [Matt 本地派生面板](matt-skills-panel-plugin/README.md)。DSH、SDK 与第三方上游保持原样。

日常入口是无参数 `./start-dsh-workflow.sh`。仅支持 macOS ARM64，使用官方 Desktop 的全局后端，浏览器访问连接同一实例。JEV/监控由 `agent-observation-plugin/` 提供，根包 `dsh-workflow` 的 `/jev-center`、`/agent-monitor` 及 `/client` 入口保持配置与功能。固定配置 entry IDs 延续，迁移仅修改这些 entry 的包入口；用户其他配置和凭据保留。

第三方启动清单由 `project-plugins.json` 和锁文件提供，失败逐项报告并继续其余装配。中文技能和 Matt 面板通过项目 integration layer 加载。

项目 MCP 配置维护在 [project-mcp.json](project-mcp.json)，由 Web 和 Desktop 启动层装配，并随 macOS 应用打包。默认连接 CodeGraph：需先在运行 DSH 的机器上安装 `codegraph` 并确保其在 PATH 中；启动层不安装服务或创建索引。用户 profile 中已有相同 `serverName` 的配置（包括禁用项）优先保留。

使用 CodeGraph 时，在需要检索的工程中自行运行 `codegraph init`，再在 DSH 调用 `mcp__codegraph__codegraph_explore` 时传入该工程的绝对 `projectPath`。配置不固定工程目录，适用于共享后端下的多个工程。配置改动后重启宿主；已构建的 macOS 应用读取其打包副本，源码改动需重新构建启动器后生效。连接失败由 DSH 记录，不阻止其他可选插件启动。

工程检查入口是 `node scripts/run-project-tests.mjs` 和 `node agent-observation-plugin/scripts/build-client.mjs --check`；Flutter 按 `macos-launcher/flutter/check.sh` 验证。应用、工程检查和 CI 均只支持 macOS ARM64，构建一份 ARM64 DMG。构建、实际 SDK/窗口及分发结果独立结算。

领域术语见 [GLOSSARY](GLOSSARY.md)，JEV/监控设计见 [ADR0003](docs/adr/0003-shared-named-jev-center.md)。独立 Dynamic Workflow 的未来计划仍保留，当前未实施。

# DSH Workflow

本项目维护 DSH 启动器、独立 JEV 中心与原生代理监控，以及 [Matt 本地派生面板](matt-skills-panel-plugin/README.md)。DSH、SDK 与第三方上游保持原样。

日常入口是无参数 `./start-dsh-workflow.sh`。仅支持 macOS ARM64，使用官方 Desktop 的全局后端，浏览器访问连接同一实例。JEV/监控由 `agent-observation-plugin/` 提供，根包 `dsh-workflow` 的 `/jev-center`、`/agent-monitor` 及 `/client` 入口保持配置与功能。固定配置 entry IDs 延续，迁移仅修改这些 entry 的包入口；用户其他配置和凭据保留。

第三方启动清单由 `project-plugins.json` 和锁文件提供，失败逐项报告并继续其余装配。中文技能和 Matt 面板通过项目 integration layer 加载。

工程检查入口是 `node scripts/run-project-tests.mjs` 和 `node agent-observation-plugin/scripts/build-client.mjs --check`；Flutter 按 `macos-launcher/flutter/check.sh` 验证。应用、工程检查和 CI 均只支持 macOS ARM64，构建一份 ARM64 DMG。构建、实际 SDK/窗口及分发结果独立结算。

领域术语见 [GLOSSARY](GLOSSARY.md)，JEV/监控设计见 [ADR0003](docs/adr/0003-shared-named-jev-center.md)。独立 Dynamic Workflow 的未来计划仍保留，当前未实施。

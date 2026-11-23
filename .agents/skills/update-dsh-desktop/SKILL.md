---
name: update-dsh-desktop
description: 更新或核验 Ghost DSH Station 随包的官方 macOS ARM64 DSH Desktop，并适配 Electron 界面、旧 dsh 命令入口和共享 Host。用于 Desktop 版本升级、归档布局变化或桌面端兼容验收。
---

# 更新并适配 DSH Desktop

从仓库根目录执行。先读 [仓库约束](../../../AGENTS.md)和[共享服务决策](../../../docs/adr/0004-independent-dsh-server.md)，记录当前 Desktop 和 Host 版本。只查版本时止于来源核对。实际验收使用隔离签名候选和临时 profile。

## 核验官方安装包

1. 按[官方发布布局](../../../deepseek-harness/apps/desktop/publishing/README.zh.md)查询 DeepSeek 生产更新清单，沿用当前渠道或使用用户指定的渠道和完整版本。选取 `mac-arm64` ZIP，记录官方 URL、版本、字节数和 SHA-512。历史清单或旧版安装包缺少可核实的来源和摘要时，记录缺口并保留原固定输入。
2. 校验 ZIP 与发布清单一致后，在临时目录解包。用 `codesign --verify --deep --strict` 校验原包，并核对 Developer ID Team 与已有可信记录一致。通过 Info.plist 和可执行文件分别核对版本、ARM64。从经过验证的原始 `app.asar` 中读取 `lib/main.js`，计算 SHA-256。把这些证据写入候选 [desktop-release.json](../../../macos-launcher/desktop-release.json)，签名者变化先核实官方发布依据。

## 适配共享运行时

- 对照 [打包适配](../../../macos-launcher/desktop-adaptation.mjs)，校验主入口锚点、前端 ASAR 布局和命令行入口。适配只作用于已核验包的暂存副本。锚点变化时对照新旧上游代码，修正对应接入并保留原包验证、ASAR 完整性和重签名检查。
- 保留官方窗口和桌面前端。Desktop 通过 Station 连接共享 Host，`dsh` 命令走 Station 的 [CLI 适配](../../../macos-launcher/runtime/desktop-cli.mjs)。Host 和 Desktop 共用官方包内的 Node 和 pnpm。Desktop 归档仅保留运行桌面界面所需的 DSH 前端和版本信息，避免重新交付第二套 DSH 依赖或把归档内容拆成大量小文件。
- 正式组合要求 Desktop 与 Host 的完整版本一致。Host 也需要升级时，按 [Web 更新技能](../update-dsh-web/SKILL.md)准备同版隔离 Host。尚无同版 Host 或只完成桌面适配时，交付隔离证据和缺口，保留已验证的正式组合。用户要求整合升级且两端均通过后同步固定输入。生产渠道的路径结构变化时，按官方清单同步 [发布来源校验](../../../scripts/release.py)及其用例，继续限定官方来源和目标架构。

## 核验与交付

在 macOS ARM64 上构建签名候选，运行[包结构检查](../../../macos-launcher/runtime/runtime-dependency-layout.test.mjs)和受影响的 Host 集成检查。实际打开 Desktop 工作区和设置，核对 Desktop、Web 同一 Host 的实例与会话。按变更验证 Desktop 正常退出后 Web 仍可用、旧 `dsh` 命令链接及插件管理、文件拖拽和 Office。打包布局有变化时，使用同口径对比解包占用和文件数，并验证从临时 DMG 拷出的应用签名。完整回归的范围遵循仓库授权。

交付时记录安装包来源、签名与摘要、适配文件、候选路径、真实检查结果及待验证项，并清理临时测试进程。正式发布和现用服务切换分别沿用用户授权；发布流程见 [deploy-release](../deploy-release/SKILL.md)。

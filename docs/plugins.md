# 项目插件清单

以下信息来自当前工作区的包元数据及启动装配代码，版本表示本地引用版本。

## 当前维护的自研 DSH 插件

| 插件 | 版本 | 作用 | 源码 |
|---|---|---|---|
| `dsh-workflow` | 0.1.1 | 读取 Host 插件的版本、来源和加载状态 | [组件清单模块](../agent-observation-plugin/README.md) |

根目录 `package.json` 声明组件清单的服务端和 Web 入口。

## 自有技能与项目集成组件

| 名称 | 类型 / 版本 | 作用与状态 | 位置 |
|---|---|---|---|
| `mattpocock-skills-zh` | 中文技能插件 / 0.1.8+codex.20261027155632 | Ghost233 维护的 Matt 技能中文翻译；DSH 通过原生技能文件服务加载，包含 `pr` 与需用户明确调用的 `retro` | [中文技能包](../vendor/mattpocock-skills-zh/.codex-plugin/plugin.json) |
| `dsh-workflow-desktop-bridge` | 内部 Cordis 插件 | 写入 DSH Web Host 的私有就绪记录，供 Station 确认服务状态 | [桥接源码](../macos-launcher/runtime/desktop-bridge.mjs) |

## 本地面板与第三方插件

| 名称 | 版本 | 来源与用途 |
|---|---|---|
| `dsh-workflow-matt-panel` | 1.9.0-beta.33.workflow.1 | 本项目维护的 [Matt 面板派生版](../matt-skills-panel-plugin/README.md)，基准与升级对照见 `upstream.json`；使用独立中文技能提供器 |
| `dsh-mattpocock-skills-deck` | 1.9.0-beta.33（基准） | 原版 submodule 保持上游源码原样，用于跟踪更新；项目装配停用其宿主与工具行 |
| `dshmarket` | 1.73.19 | DSH 插件市场 |
| `dsh-context` | 0.84.1 | 上下文查看插件 |
| `dsh-cost-meter` | 1.9.64 | 费用统计插件 |
| `@nagi-ovo/dsh-visualize` | 0.1.9 | 可视化插件 |
| `dsh-better-sidebar` | 0.32.1 | 侧边栏插件 |
| `ghost-agent-sentinel` | 由 DSH profile 决定 | 通过 GitHub Release 资产安装的代理状态插件，由 DSH profile 管理 |
| `dsh-skill-mcp-panel` | 2.3.12 | 技能与 MCP 面板 |
| `dsh-streamfold` | 0.7.14 | 流式内容折叠插件 |
| `@michengai/dsh-archive-manager` | 1.3.5 | 会话归档管理插件 |
| `dsh-mermaid` | 0.4.5 | Mermaid 插件 |
| `dsh-live-compact` | 1.1.6 / `8f3766ec` | 固定 Git 来源的压缩插件，未设为日常启动 |

表中的 npm 版本是仓库记录的参考版本。应用只携带[默认启动检查名单](../default-startup-plugins.json)，首次启动时将它复制到本机。你可以在 Station 的“插件 → 编辑启动检查名单”增删包名，也可以设为 `[]`。应用升级会保留本地名单。

Station 启动时检查本地名单中的包是否已安装，接受 DSH profile 中的任意版本。缺包时会列出补装命令。“插件”页显示当前版本和 npm 的 `latest` 版本，也可通过 DSH 包管理器手动更新 npm 插件。启用、停用和卸载在 DSH 内操作。

随包交付的 Git 和源码制品使用固定版本。Matt 派生面板通过[项目装配](../scripts/dsh-launch-composition.mjs)加载构建产物。

## 引用的自有 Codex 插件市场

Matt 技能只引用 `Ghost233/ghost-agent-market` 的中文插件目录，原样快照保存在 `vendor/mattpocock-skills-zh`，来源、完整提交和版本见 [来源记录](../vendor/mattpocock-skills-zh.upstream.json)。DSH 不再引用整份市场仓库，也不初始化其中的英文原版和 SkillOpt 子模块。中文技能更新时从来源仓库的目标提交重新导入该目录并保留许可证，再核对面板目录和构建验收。

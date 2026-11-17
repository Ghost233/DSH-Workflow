# 项目插件清单

以下信息来自当前工作区的包元数据及启动装配代码，版本表示本地引用版本。

## 当前维护的自研 DSH 插件

| 插件 | 版本 | 作用 | 源码 |
|---|---|---|---|
| `dsh-station-bridge` | 0.1.1 | 发布 DSH Web Host 的私有就绪记录，提供停机检查和模型授权 | [桥接源码](../macos-launcher/runtime/station-bridge.mjs) |

## 自有技能与项目集成组件

| 名称 | 类型 / 版本 | 作用与状态 | 位置 |
|---|---|---|---|
| `mattpocock-skills-zh` | 中文技能插件 / 0.1.8+codex.20261027155632 | Ghost233 维护的 Matt 技能中文翻译；DSH 通过原生技能文件服务加载，包含 `pr` 与需用户明确调用的 `retro` | [中文技能包](../vendor/mattpocock-skills-zh/.codex-plugin/plugin.json) |

## 第三方插件

| 名称 | 版本 | 来源与用途 |
|---|---|---|
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

随包交付的 Git 和源码制品使用固定版本。

## 引用的自有 Codex 插件市场

Matt 技能只引用 `Ghost233/ghost-agent-market` 的中文插件目录，原样快照保存在 `vendor/mattpocock-skills-zh`，来源、完整提交和版本见 [来源记录](../vendor/mattpocock-skills-zh.upstream.json)。中文技能更新时从目标提交重新导入该目录并保留许可证，再验证技能在 DSH 中可发现。

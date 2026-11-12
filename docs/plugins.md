# 项目插件清单

以下信息来自当前工作区的包元数据及启动装配代码，版本表示本地引用版本。

## 当前维护的自研 DSH 插件

| 插件 | 版本 | 作用 | 源码 |
|---|---|---|---|
| `dsh-workflow` | 0.1.1 | 独立 JEV 中心与 DSH 原生代理监控 | [agent-observation-plugin](../agent-observation-plugin/README.md) |

根目录 `package.json` 声明独立观察模块的入口。

## 自有技能与项目集成组件

| 名称 | 类型 / 版本 | 作用与状态 | 位置 |
|---|---|---|---|
| `mattpocock-skills-zh` | 中文技能插件 / 0.1.8+codex.20261027155632 | Ghost233 维护的 Matt 技能中文翻译；DSH 通过原生技能文件服务加载，包含 `pr` 与需用户明确调用的 `retro` | [中文技能包](../vendor/mattpocock-skills-zh/.codex-plugin/plugin.json) |
| `dsh-workflow-desktop` | 本地组合包 / 0.1.0 | 装配 Desktop profile 中的自研插件、技能和共享后端桥接组件 | [组合包生成代码](../macos-launcher/runtime/desktop-profile.mjs) |
| `dsh-workflow-desktop-bridge` | 内部 Cordis 插件 / 无独立版本 | 发布 Desktop Host 的私有就绪信息，供启动器连接同一后端 | [桥接源码](../macos-launcher/runtime/desktop-bridge.mjs) |
| `dsh-workflow-agent-monitor` | 内部 Cordis 插件 / 测试版本 | 观察主/子代理的模型无输出、异常结束及 JEV 语义停滞；只通知和记录，不恢复或干预 | [行为与验证](./agent-monitor.md) |
| `dsh-workflow-jev-center` | 内部 Cordis 插件 / 开发中 | 使用标准 Settings/credentials 管理引擎，按调用模型名完成 System One 判断及连接测试 | [正式规格与交付](./specs/jev-center-agent-monitor/delivery.md) |
| `dynamic-workflow-plugin` | 暂缓实施 / 无发布版本 | 目前只有领域文档，没有可加载的插件实现 | [领域文档](../dynamic-workflow-plugin/CONTEXT.md) |


## 本地面板与第三方插件

| 名称 | 版本 | 来源与用途 |
|---|---|---|
| `dsh-workflow-matt-panel` | 1.9.0-beta.33.workflow.1 | 本项目维护的 [Matt 面板派生版](../matt-skills-panel-plugin/README.md)，基准与升级对照见 `upstream.json`；使用独立中文技能提供器 |
| `dsh-mattpocock-skills-deck` | 1.9.0-beta.33（基准） | 原版 submodule 保持上游源码原样，用于跟踪更新；项目装配停用其宿主与工具行 |
| `dshmarket` | 1.73.17 | DSHMarket，启动清单启用 |
| `dsh-context` | 0.83.1 | 第三方上下文插件，启动清单启用 |
| `dsh-cost-meter` | 1.9.64 | 第三方费用统计插件，启动清单启用 |
| `@nagi-ovo/dsh-visualize` | 0.1.9 | 第三方可视化插件，启动清单启用 |
| `@goodandready/dsh-plugin-notify` | 0.4.8 | 第三方通知插件，启动清单启用 |
| `dsh-better-sidebar` | 0.30.1 | 第三方侧边栏插件，启动清单启用 |
| `ghost-agent-sentinel` | 0.4.5 / `e49a05ac` | 固定 Git 来源的代理状态插件，启动清单启用 |
| `dsh-skill-mcp-panel` | 2.3.12 | 第三方技能与 MCP 面板，启动清单启用 |
| `dsh-streamfold` | 0.7.14 | 第三方流式内容折叠插件，启动清单启用 |
| `@guowenzhang/dsh-worktree` | 2.4.0 | 第三方工作树插件；新会话创建独立工作区，归档时尝试回收，启动清单启用 |
| `@michengai/dsh-archive-manager` | 1.3.1 | 第三方会话归档管理插件，启动清单启用 |
| `dsh-mermaid` | 0.4.5 | 第三方 Mermaid 插件，启动清单启用 |
| `billion-context` | 0.1.213 | 第三方上下文压缩插件，启动清单启用 |
| `dsh-live-compact` | 1.1.5 / `de726852` | 固定 Git 来源的压缩插件，未设为日常启动 |

表中的 npm 版本来自 [启动清单](../project-plugins.json)，只记录打包快照。Station 使用 DSH 全局 profile 中已安装的版本。缺少必需插件时，Station 会停止启动并列出补装命令。你可以在 Station 的“插件”页比较当前版本和 npm `latest` 版本，在 DSH 的“插件”页更新。

Git 和源码制品仍使用固定版本。Matt 派生面板通过 [项目装配](../scripts/dsh-launch-composition.mjs) 加载本地构建产物。

`@guowenzhang/dsh-worktree@2.4.0` 已加入启动清单。它使用的 `@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-primitives` 和 `@deepseek-ai/dsh-client-ui-slots` 由当前 DSH Web 的共享模块表提供，无须额外安装。项目装配的客户端依赖检查同时识别内置模块与已装配的插件模块。

## 引用的自有 Codex 插件市场

Matt 技能只引用 `Ghost233/ghost-agent-market` 的中文插件目录，原样快照保存在 `vendor/mattpocock-skills-zh`，来源、完整提交和版本见 [来源记录](../vendor/mattpocock-skills-zh.upstream.json)。DSH 不再引用整份市场仓库，也不初始化其中的英文原版和 SkillOpt 子模块。中文技能更新时从来源仓库的目标提交重新导入该目录并保留许可证，再核对面板目录和构建验收。

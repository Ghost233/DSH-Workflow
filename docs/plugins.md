# 项目插件清单

以下信息来自当前工作区的包元数据及启动装配代码，版本表示本地引用版本。

## 当前维护的自研 DSH 插件

| 插件 | 版本 | 作用 | 源码 |
|---|---|---|---|
| `dsh-owner-workflow` | 0.1.1 | 主线程规划与授权、Owner 分工、隔离执行、验证、交付及 Dashboard | [owner-workflow-plugin](../owner-workflow-plugin/README.zh.md) |

Owner 的 preset、surface 和 Dashboard 是同一插件的组成部分。根目录 `package.json` 和 `owner-workflow-plugin/package.json` 也是同一插件的两个包装入口，不重复计数。

## 自有技能与项目集成组件

| 名称 | 类型 / 版本 | 作用与状态 | 位置 |
|---|---|---|---|
| `mattpocock-skills-zh` | 中文技能插件 / 0.1.5+codex.20261004142742 | Ghost233 维护的 Matt 技能中文翻译；DSH 通过原生技能文件服务加载，包含 `pr` 与需用户明确调用的 `retro` | [中文技能包](../vendor/mattpocock-skills-zh/.codex-plugin/plugin.json) |
| `dsh-workflow-desktop` | 本地组合包 / 0.1.0 | 装配 Desktop profile 中的自研插件、技能和共享后端桥接组件 | [组合包生成代码](../macos-launcher/runtime/desktop-profile.mjs) |
| `dsh-workflow-desktop-bridge` | 内部 Cordis 插件 / 无独立版本 | 发布 Desktop Host 的私有就绪信息，供启动器连接同一后端 | [桥接源码](../macos-launcher/runtime/desktop-bridge.mjs) |
| `dsh-workflow-creator-jev-guidance` | 内部 Cordis 插件 / 无独立版本 | 为创造模式提供 Jev 与 LLM 分工的开发指导，强调程序直接判断、复用计划和真实收益验证 | [指导源码](../owner-workflow-plugin/src/creator-jev-guidance.mjs) |
| `dynamic-workflow-plugin` | 暂缓实施 / 无发布版本 | 目前只有领域文档，没有可加载的插件实现 | [领域文档](../dynamic-workflow-plugin/CONTEXT.md) |

Jev 开发指导随项目的 Web 和 Desktop 启动层追加到已有创造模式（`cordis`），保留该模式的原有工具和提示词。它不安装 Jev、不声明已有真实服务，也不自动调用模型；作用是让创造者在设计与生成代码时考虑有界判断、批量调用和 LLM 回退。标准模式与 Owner preset 不加载这段指导。

## 本地面板与第三方插件

| 名称 | 版本 | 来源与用途 |
|---|---|---|
| `dsh-workflow-matt-panel` | 1.7.39-workflow.2 | 本项目维护的 [Matt 面板派生版](../matt-skills-panel-plugin/README.md)，基准与升级对照见 `upstream.json`；使用独立中文技能提供器 |
| `dsh-mattpocock-skills-deck` | 1.7.39（基准） | 原版 submodule 保持上游源码原样，用于跟踪更新；项目装配停用其宿主与工具行 |
| `dsh-context` | 0.63.0 | 第三方上下文插件，启动清单启用 |
| `dsh-cost-meter` | 1.8.10 | 第三方费用统计插件，启动清单启用 |
| `@nagi-ovo/dsh-visualize` | 0.1.4 | 第三方可视化插件，启动清单启用 |

第三方启动版本以 [project-plugins.json](../project-plugins.json) 与对应锁文件为准。Matt 派生面板及其工具行由 [内核装配](../scripts/kernel-launch-composition.mjs) 从本地构建产物直接加入，随主项目构建更新。

## 引用的自有 Codex 插件市场

Matt 技能只引用 `Ghost233/ghost-agent-market` 的中文插件目录，原样快照保存在 `vendor/mattpocock-skills-zh`，来源、完整提交和版本见 [来源记录](../vendor/mattpocock-skills-zh.upstream.json)。DSH 不再引用整份市场仓库，也不初始化其中的英文原版和 SkillOpt 子模块。中文技能更新时从来源仓库的目标提交重新导入该目录并保留许可证，再核对面板目录和构建验收。

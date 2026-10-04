# 项目插件清单

以下信息来自当前工作区的包元数据及启动装配代码，版本表示本地引用版本。

## 当前维护的自研 DSH 插件

| 插件 | 版本 | 作用 | 源码 |
|---|---|---|---|
| `dsh-owner-workflow` | 0.1.1 | 主线程规划与授权、Owner 分工、隔离执行、验证、交付及 Dashboard | [owner-workflow-plugin](../owner-workflow-plugin/README.zh.md) |
| `dsh-sol-efficiency` | 0.1.1 | Action Fusion 编辑与验证融合、EPR 诊断日志压缩；设置开关 | [sol-efficiency-plugin](../sol-efficiency-plugin/README.md) |

Owner 的 preset、surface 和 Dashboard 是同一插件的组成部分。根目录 `package.json` 和 `owner-workflow-plugin/package.json` 也是同一插件的两个包装入口，不重复计数。

## 自有技能与项目集成组件

| 名称 | 类型 / 版本 | 作用与状态 | 位置 |
|---|---|---|---|
| `mattpocock-skills-zh` | 中文技能插件 / 0.1.4+codex.20260907064040 | Ghost233 维护的 Matt 技能中文翻译；DSH 通过原生技能文件服务加载 | [中文技能包](../vendor/ghost-agent-market/codex-market/plugins/mattpocock-skills-zh/.codex-plugin/plugin.json) |
| `dsh-workflow-desktop` | 本地组合包 / 0.1.0 | 装配 Desktop profile 中的自研插件、技能和共享后端桥接组件 | [组合包生成代码](../macos-launcher/runtime/desktop-profile.mjs) |
| `dsh-workflow-desktop-bridge` | 内部 Cordis 插件 / 无独立版本 | 发布 Desktop Host 的私有就绪信息，供启动器连接同一后端 | [桥接源码](../macos-launcher/runtime/desktop-bridge.mjs) |
| `dynamic-workflow-plugin` | 暂缓实施 / 无发布版本 | 目前只有领域文档，没有可加载的插件实现 | [领域文档](../dynamic-workflow-plugin/CONTEXT.md) |

## 本地面板与第三方插件

| 名称 | 版本 | 来源与用途 |
|---|---|---|
| `dsh-mattpocock-skills-deck` | 1.7.39 | FeatherHunter 的第三方插件；按此前用户要求，本地使用面板部分，移除其英文内置技能加载；不是自研插件 |
| `dsh-context` | 0.63.0 | 第三方上下文插件，启动清单启用 |
| `dsh-cost-meter` | 1.8.10 | 第三方费用统计插件，启动清单启用 |
| `@nagi-ovo/dsh-visualize` | 0.1.4 | 第三方可视化插件，启动清单启用 |

第三方启动版本以 [project-plugins.json](../project-plugins.json) 与对应锁文件为准。Matt 面板由 [内核装配](../scripts/kernel-launch-composition.mjs) 直接加入。

## 引用的自有 Codex 插件市场

`vendor/ghost-agent-market` 还包含 `ghost-agent-skills` 的 Codex 插件包。它属于另一个仓库的引用，不在本项目的 DSH 默认装配中；不能把它算作当前已加载的 DSH 插件。RTK 插件已由该市场主线移除。

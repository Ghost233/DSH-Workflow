---
status: accepted
date: 2026-09-25
implementation: deferred
---

# 独立复刻 ZCode Dynamic Workflow

决定以 `dynamic-workflow-plugin` 作为独立自研插件，目标覆盖 ZCode Dynamic Workflow 的完整用户功能。它使用自己的运行身份和状态，不接管现有 Owner Workflow 的任务、授权或执行状态。

选择独立插件，是因为现有 Owner Workflow 的候选封存、验证、集成和副作用恢复有自己的领域合同；将 ZCode 的脚本运行状态直接用作这些动作的权威状态会改变既有保证。ZCode submodule 保持上游原样，DSH 接线落在自研插件中。

UI 复刻范围是 DSH Web 内的 workflow 界面，包括聊天卡片、确认、运行详情、时间线、保存中枢和产物；保留 DSH 应用外壳，不复刻 ZCode 的 CLI/TUI。现有无参数 `./start-owner-workflow.sh` 默认加载新插件并提供独立入口，Owner 仍是默认模式。

Owner 与 Dynamic Workflow 可以由用户在同一项目并行启动。插件不自动阻止或仲裁两者的写入；用户自行安排并行运行。各插件仍须遵守自身的执行和权限合同，不把对方的运行状态当作自己的授权。

ZCode 式聊天工具只放在独立的 Dynamic Workflow 代理模式中，不加入默认 Owner 模式。脚本 API 保持 ZCode 的 `agent().ask<T>()` 等调用语义，保存定义则只允许在所属项目中使用自有 `.ghostdwf.ts` 格式；不提供全局作用域，也不与 ZCode 的 `.dwf.ts` 定义互读或共用存储。聊天中的 CreateWorkflow 保留运行前展示分析结果并按会话许可规则请求确认的行为；从保存中枢启动则按 ZCode 的界面行为直接运行。

项目定义放在 `.ghost/workflows/*.ghostdwf.ts`，作为可以纳入 Git 的源文件。运行 journal、历史和产物放在项目内受 Git 忽略的 `.dsh-workflow/dynamic-workflow/`，不写入用户级目录。独立 Dynamic Workflow 模式只显示新插件的 workflow 工具；DSH 官方 `workflow` 工具在其他模式维持原样，上游代码不改。

恢复行为按固定版本 ZCode 实现保持一致：journal 中仍为 `running` 的 ask 和 world.run 在恢复时重新执行，即使前一次副作用可能已经发生。子代理实际文件、命令及工具调用仍受 DSH 原生沙箱和审批合同约束，不移植 ZCode 的宿主权限实现。后续 ZCode 修复需通过更新已固定的 submodule 提交并重新验证后纳入。

插件构建时直接使用固定 submodule 中的 ZCode 编译器、执行引擎和沙箱运行时，将它们打入发布产物；DSH driver、持久化接线和 Web UI 适配属于自研插件。每个 Saved Workflow 是单个 `.ghostdwf.ts` 文件：自有注释头保存名称、说明和参数声明，正文保持 ZCode 的 TypeScript 脚本 API。

2026-09-26 用户决定暂缓实施，先测试和使用 DSH 官方 `workflow`。本 ADR 记录已确定的未来设计，不表示新插件已注册、构建或启用；恢复实施以[复刻计划](../specs/dynamic-workflow-plugin.md)为准。

---
status: deferred
updated: 2026-09-26
---

# Dynamic Workflow 插件：暂缓实施的复刻计划

## 当前状态

2026-09-26 用户决定先继续测试和使用 DSH 官方 `workflow`。本文件保存未来实施计划，**当前不实施、不构建、不注册、不启用新插件**；以下验收条目均为目标，不表示已经通过。`vendor/ZCode` 仅作为固定版本源码参照，已添加的 submodule 记录不使它进入日常启动或插件装配。恢复本计划时，先核对 ZCode 固定提交、DSH 版本与当前工作区状态，再依下面的验收合同实施。

## 目标与参照

在 DSH Web 中交付独立的 `dynamic-workflow-plugin`。行为参照固定的 ZCode submodule `29628c9acdb81b703bbd4080c207a0e7ce5e276e`；后续上游修复经显式更新固定提交、构建和回归验证后纳入。现有 DSH 官方代理模式保持独立。

“1:1”指 ZCode Dynamic Workflow 的脚本 API、用户功能、运行状态、恢复行为，以及 DSH Web 内 workflow 专属界面的视觉结构和交互。它不包括 ZCode 的应用外壳或 CLI/TUI。

## 已确定的宿主差异

- 新插件仅在独立 Dynamic Workflow 代理模式提供 ZCode 式聊天工具；该模式隐藏 DSH 官方 `workflow` 工具。其他模式和 DSH 上游源码保持原样。
- 恢复实施并通过验收后，才由无参数启动入口装配新插件及独立入口。
- 子代理的文件、命令及工具调用遵守 DSH 原生沙箱和审批。聊天创建运行时保留 ZCode 的分析预览与会话许可确认；保存中枢中的运行按钮直接启动。
- Saved Workflow 仅有项目作用域，保存于 `.ghost/workflows/*.ghostdwf.ts`，可纳入 Git。单文件的自有注释头保存名称、说明和参数声明；正文使用 ZCode 的 TypeScript 脚本 API。不读取 ZCode 的 `.dwf.ts` 文件，也不共享其存储。
- Run journal、历史和产物存于项目内被 Git 忽略的 `.dsh-workflow/dynamic-workflow/`。

## 用户功能验收

1. 聊天工具支持 CreateWorkflow、AmendWorkflow、SaveWorkflow、ListSavedWorkflows、EvalWorkflowSnippet、ListWorkflowRuns、GetWorkflowRun、ResumeWorkflowRun 和 ResolveWorkflowQuestion；运行可在 Web 界面取消。Create 支持内联脚本、保存定义和脚本路径，支持运行名称、并发上限及子代理模型选择。
2. 脚本保留 ZCode facade 的 `agent().ask<T>()`、`phase()`、`log()`、`report()`、`artifact`、`files`、`git`、`world.run()` 与 `args`。编译诊断、站点分析、类型化结果校验与修复反馈使用固定 ZCode 核心的行为。
3. 新建运行展示分析图与确认界面，随后在后台执行；Web 展示聊天卡片、实时进度、阶段时间线、Run 列表和详情、脚本与子代理记录、问题交互、结果及产物。
4. 保存中枢展示项目定义，允许查看、编辑元数据并按参数启动。定义文件可直接在项目中编辑；损坏的单个定义可见且不阻止列出其他定义。
5. 同一 Run 恢复校验脚本及输入身份，重放已结算节点，并重新执行仍为 `running` 的 ask 和 world.run；修订脚本创建新 Run，按 ZCode 规则复用符合资格的前驱结果。此处保留上游当前可能重复执行副作用的行为。
6. 重启 DSH Web 后，Run 列表、journal、阶段与产物可从项目内持久记录恢复；执行结果、取消、失败和停止状态与详情展示一致。

## 实现边界与验证

- 构建时使用固定 submodule 的 `@zcode/dynamic-workflow` 和 `@zcode/dynamic-workflow-runtime` 源码，发布产物包含构建结果与所需许可声明；不要求最终用户另行克隆 submodule。DSH driver、持久化、工具和 Web 接线写在自研插件及项目集成层。
- UI 可移植 ZCode 的 workflow 专属时间线模型与 DOM/SVG 表现，但要接到 DSH 的 React、页面插槽、会话事件和受控通信通道；不直接引入整个 `@zcode/ui` 应用壳。
- 通过容器中的确定性测试核对编译、调度、恢复、保存定义和权限接线；用无参数启动入口在真实 DSH Web 中验收工具、确认、Run 详情及产物。当前 DSH 支持的 Node 版本应分别验证，无法支持的版本须作为明确阻塞报告。

## 恢复实施时的工作顺序

1. **固定与构建**：核对 ZCode gitlink、许可和 DSH 的 Node 支持范围；在容器中从 submodule 构建编译器与 runtime，并把结果打进自研插件产物。验证最终产物不依赖用户机器上另有 ZCode checkout，也不向工程工作区安装依赖。
2. **运行接线**：实现 DSH driver、项目内 journal、产物存储和实时事件通道。使 actor 会话、typed ask、world 读取与命令、取消、同 Run 恢复及 Amend 的结果复用按固定源码语义工作；子代理工具仍使用 DSH 沙箱与审批。用真实中断和重启测试核对持久状态，包括用户选择保留的 `running` 节点重派行为。
3. **用户工具与保存定义**：提供目标清单中的聊天工具和独立代理模式；实现项目内 `.ghostdwf.ts` 的单文件元数据、校验、列举、编辑和启动。验证坏定义不影响其他定义，项目外和全局目录不会被创建或读取。
4. **Web 界面**：在 DSH Web 插槽接入独立入口、工具卡与确认、时间线、Run 列表和详情、保存中枢及产物视图。移植 ZCode workflow 专属的时间线模型与视觉元素，适配 DSH 的 React 与事件协议；写操作走 DSH 的受控通信通道。以固定脚本和运行记录逐屏核对交互及关键布局。
5. **日常装配与验收**：只有上述功能通过后，才在无参数启动入口装配新插件和独立代理模式。验证 DSH 官方 `workflow` 在原有模式可用，Web 及保留的独立插件继续正常运行。

实施仅修改自研插件及项目集成代码；`vendor/ZCode` 与 `deepseek-harness` 上游源码保持原样。任何后续上游更新均先显式移动 submodule 固定提交，再运行同一组合同测试与 Web 验收。

## 固定源码入口

- 脚本接口、编译和图分析：[facade](../../vendor/ZCode/apps/zcode-cli/packages/dynamic-workflow/src/facade/dts.ts)、[compiler](../../vendor/ZCode/apps/zcode-cli/packages/dynamic-workflow/src/compiler/compile.ts)、[analysis](../../vendor/ZCode/apps/zcode-cli/packages/dynamic-workflow/src/analysis/analyze.ts)。
- 调度、journal 回放和恢复：[engine](../../vendor/ZCode/apps/zcode-cli/packages/dynamic-workflow/src/engine/engine.ts)、[scheduler](../../vendor/ZCode/apps/zcode-cli/packages/dynamic-workflow/src/engine/scheduler.ts)、[world 节点](../../vendor/ZCode/apps/zcode-cli/packages/dynamic-workflow/src/engine/engine-world.ts)。
- 子进程与通信：[runtime harness](../../vendor/ZCode/apps/zcode-cli/packages/dynamic-workflow-runtime/src/harness.ts)、[child VM](../../vendor/ZCode/apps/zcode-cli/packages/dynamic-workflow-runtime/src/child-source.ts)、[NDJSON 协议](../../vendor/ZCode/apps/zcode-cli/packages/dynamic-workflow-runtime/src/protocol.ts)。
- ZCode 应用接线参照：[run service](../../vendor/ZCode/apps/zcode-cli/packages/bootstrap/src/app/dynamic-workflow-run-service.ts)、[actor 工具](../../vendor/ZCode/apps/zcode-cli/packages/bootstrap/src/app/workflow-actor-tools.ts)、[SQLite journal](../../vendor/ZCode/apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/dwf-journal.ts)。这些文件是参照，不直接引入 DSH 插件。
- UI 参照：[时间线模型](../../vendor/ZCode/packages/ui/src/components/workflow-timeline/timeline-model.ts)、[时间线组件](../../vendor/ZCode/packages/ui/src/components/workflow-timeline/WorkflowTimeline.tsx)、[运行详情](../../vendor/ZCode/packages/ui/src/app-shell/WorkflowRunSidePane.tsx)、[保存中枢](../../vendor/ZCode/packages/ui/src/settings/saved-workflows/SavedWorkflowsSection.tsx)。
- DSH 接线参照：[官方 workflow 工具](../../deepseek-harness/packages/workflow/tool-workflow/src/index.ts)、[Web 页面插槽](../../deepseek-harness/packages/client/ui-layout/src/client/index.ts)、[官方页面示例](../../deepseek-harness/packages/client/ui-schedule/src/client/index.ts)。

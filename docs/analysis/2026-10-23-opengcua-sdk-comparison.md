# OpenGCUA SDK 与 DSH CUA 对比

核验日期：2026-10-23。OpenGCUA 源码固定在提交 `b7e4d57ba5730d6ea11f0e111bbabc56364869fd`。本次只读官方源码、文档和论文，没有安装 SDK、启动驱动或执行实机任务。下文的“已实现”只表示源码中存在实现，不表示已在当前 Mac 上通过验收。

## 接入建议

当前目标是让 DSH 原生 Agent 操作 Mac 和网页，并逐步检查业务结果。建议先使用 DSH 的 CUA、浏览器提供方和持久代码执行能力，暂不全面接入 OpenGCUA SDK。这些现有组件已覆盖主要执行方式；接入另一套 SDK 的收益尚无对照证据。[DSH CUA][d1]、[浏览器能力][d4]、[持久执行][d3]

OpenGCUA 值得进一步试验的部分，是同一程序管理多个设备、统一观察与引用规则，以及跨设备文件传输。如果任务明确涉及 Android、Linux X11 和 Mac 协作，再做单项接入试验更有依据。[资源句柄][o3]、[设备服务][o15]、[Android][o12]、[Linux][o13]

论文支持的主要收益来自 Agent 用程序组合 GUI、Shell/API、判断和验证。SDK 为这种用法提供统一接口。现有证据没有证明 Python 语言本身带来优势，也没有证明当前 Cross-Device SDK 比 DSH CUA 更可靠。[论文][o19]、[OSWorld 实现][o21]

## 与 DSH 现有能力对比

DSH 基准是本地 `deepseek-harness` 提交 `687f282e8625c6b8d11ff58211a90524be2e4317`。本次读取的 CUA、浏览器和 Node PTC 目录没有未提交修改。比较范围包含对象式 macOS CUA、CuaDriver 提供方、浏览器提供方及代码执行运行时。实验性提供方需要显式装配；源码存在不表示当前运行的 profile 已经启用。

| 能力 | DSH 源码已有能力 | OpenGCUA SDK 的增量 | 判断 |
|---|---|---|---|
| Mac 应用与窗口操作 | 应用和窗口对象、AX、截图、点击、文本、粘贴、按键、滚动、拖动和悬停 | 同类操作纳入统一设备 API；Mac 底层使用 CuaDriver 0.36.0 | 基础能力高度重叠。新版驱动是否改善具体应用需实测。[d1]、[d2]、[o7]、[o8] |
| 后台操作和引用校验 | 后台优先；有应用授权、快照 ID、旧应用/快照拒绝及窗口尺寸校验 | 共享的观察存储、模型交付确认、资源身份与动作来源记录 | SDK 的统一机制有参考价值，不能推导为所有操作更可靠。[d1]、[d2]、[o4]、[o5] |
| 网页 DOM 与浏览器 | 已有 Playwright MCP、Chrome DevTools MCP 和 Stagehand 提供方，可保留 Session 浏览器状态 | 浏览器与桌面共用资源、观察和动作词汇 | 对单纯网页自动化，新增价值主要是统一接口。浏览器能力本身不构成缺口。[d4]、[d9]、[o9] |
| 程序组合动作 | PTC 支持生成工具 SDK，把多个工具调用写进一个程序，保留结构化值并使用条件和循环 | 一套跨设备的对象式 SDK，可在程序内部观察和操作 | DSH 已具备程序组合基础，需比较实际接口和模型指令。[d6]、[o3]、[o4] |
| 持久变量与句柄 | Node PTC 可显式启用 `persistent-in-memory`；Python PTC 每次启动新进程 | SDK Runtime/Session 在被宿主持有时保留资源；持久 Python 解释器由 harness 提供 | 只装 SDK 不会自动获得持久执行环境。DSH 的现有 Python PTC 也不能直接承担跨调用保留。[d3]、[d5]、[o17] |
| Android、Linux 与跨设备 | 核对的 CUA 原生对象 API 当前面向 Mac；浏览器另有提供方，没有这套统一跨设备 API | Android、Linux X11、Mac 和浏览器的资源管理、Shell 与文件传输 | 这是最明确的新增覆盖范围，各平台均有预览版限制。[d1]、[d2]、[o1]、[o12]、[o13]、[o15] |
| AX 差量观察 | `diff` 只是兼容选项，实际观察不返回差量 | 公共层有条件化 diff，浏览器有 DOM 身份；Mac 仍使用逐快照身份 | 不能把 Mac AX diff 当作现在即可获得的收益。[d2]、[o5]、[o6] |
| 操作结果与业务验收 | 原生动作返回 `dispatched:true, verified:false`；模型或程序需重新观察并判断 | 回执能区分执行状态和效果未知，并关联动作来源 | 两边都需要业务断言。SDK 没有替 DSH 验收任务的独立判断器。[d8]、[o2]、[o16] |
| 权限、日志和取消 | DSH CUA 经过正常工具执行、应用授权、图片附件和取消清理过程 | SDK 有自己的设备/动作生命周期，但需要与 DSH 的执行过程衔接 | 接入成本在于保留这些约束和证据，不能只调用 Python 后返回一段文本。[d1]、[d6]、[o2]、[o4] |

DSH 还有另一条 CuaDriver 原生提供方路径，npm 依赖锁定为 0.28.0。对象式 macOS CUA 则使用自己的 Swift helper。OpenGCUA 使用 CuaDriver 0.36.0，这个版本差异值得记录，但不能代替同应用、同任务的成功率比较。[DSH 原生提供方依赖][d7]、[DSH macOS 实现说明][d1]、[OpenGCUA Mac provider][o8]

DSH 的持久 Node PTC 可保留变量、导入模块和对象。默认仍是逐次新进程；取消、超时和运行时失败也会清除保留内存。使用现有路径时，应明确配置执行模式，并在失效后重新获取应用和窗口。[持久执行边界][d3]

## 接入与试验的取舍

只做 Mac 和网页任务时，先让同一个 DSH Agent 使用现有 CUA、一个浏览器提供方和持久 PTC。模型决定何时观察，程序处理可确定的判断，关键操作后重新读取结果。任务成功应由业务状态或实际产物证明。[DSH 操作语义][d8]、[工具程序化调用][d6]

需要统一跨设备时，可以由自研桥接层持有 Python SDK Runtime 和 Session，再把动作及观察交给 DSH 原生 Agent。桥接层需要处理观察交付确认、截图附件、取消、资源释放和 DSH 权限。直接把持久 SDK 对象放进每次新建的 Python PTC，会丢失跨调用状态。[DSH Python PTC][d5]、[SDK 生命周期][o2]、[观察交付][o4]

试验应保持 DSH 模型、任务和业务断言相同，只替换操作提供方。先比较三个任务：Mac 表单输入与复核、网页批量修改与回读、跨设备文件处理。记录正确完成率、误操作、模型往返次数、耗时、上下文用量和取消后的状态。如果业务不涉及跨设备，第三项可以省略。这个试验尚未执行。

## OpenGCUA SDK 的能力与边界

SDK 的主要价值是统一设备资源、观察和动作的语义。它采用 Rust 核心和 Python 绑定，Python 包名为 `qwen-intelligence-sdk`。SDK 本身不包含 Agent harness、CuaDriver、浏览器引擎或 Android 工具。这些组件需要分别准备。[SDK 安装与设计][o1]

| 能力 | 当前实现 | 对“边操作边验收”的意义 | 证据 |
|---|---|---|---|
| 统一资源模型 | `Runtime → Session → Device → App → Window`；浏览器有 Context、Tab。操作绑定明确资源，旧句柄不会随新目标选择而改指向 | 同时处理多个应用或设备时，减少隐式焦点带来的误操作 | [公共运行时][o2]、[资源句柄][o3] |
| AX 与视觉分离 | `ui.ax` 返回标准化节点，`ui.vision` 返回图像；节点引用和截图坐标属于各自观察 | 程序可以读取文本、状态和几何信息，再选择 AX 动作或视觉动作 | [观察对象与交付][o4] |
| 观察捕获与模型交付分离 | `observe()` 先返回给程序；`mu.emit()` 成功交付后，才确认模型已见观察。模型手写短索引基于已交付视图；程序也可使用本轮新捕获的节点对象 | 程序可在一次执行中读取、判断和操作，只把必要证据送给模型。接入方必须正确实现输出回调和轮次边界 | [交付实现][o4]、[索引解析与轮次冻结][o5] |
| 旧引用拒绝 | 按资源 scope、capture、revision 和 identity epoch 检查引用；macOS 还检查窗口、snapshot token 和截图几何 | 能阻止部分过期引用；不保证发现观察后发生的所有界面变化 | [公共观察存储][o5]、[Mac 动作][o7] |
| AX 差量输出 | 公共层有基于已确认基线的 diff；完整观察、稳定身份和同一 identity epoch 才可跨捕获比较 | 浏览器可利用 DOM 身份。Mac 当前使用 snapshot 身份，每次捕获更换 revision，不能宣称已有稳定的 macOS AX 差量观察 | [diff 条件][o5]、[Mac 观察][o6]、[harness 状态][o14] |
| macOS 后台操作 | 通过未修改的 CuaDriver 0.36.0；默认 `delivery=auto` 选择 background。全桌面输入要求显式 foreground；前台目标需要匹配当前窗口 | 后台执行是按目标和动作支持程度提供的能力。不能推导为所有操作都不抢焦点 | [Mac provider][o8]、[Mac 动作][o7] |
| 浏览器 | Playwright 1.63.0 worker，支持 DOM/ARIA、locator、截图、页面执行 JavaScript、导航、上传下载、Cookie、存储和网络规则；有专用后台 Chromium 实现 | 可把网页状态直接用于断言，不必每次让模型看截图 | [浏览器能力][o9]、[DOM 身份][o10]、[后台浏览器][o11] |
| Android 和 Linux | Android 通过 ADB broker 与 Java UiAutomation bridge；Linux 有 X11 截图、XTEST 输入和 AT-SPI。Linux app/window scope、原生 Wayland 不支持；Windows 仍计划中 | 手机和桌面可用相近 API。平台支持范围不同，不能假定共享 API 的所有方法都可用 | [Android][o12]、[Linux][o13]、[SDK 平台表][o1] |
| 跨设备 Shell 和文件 | 有明确目标设备的 `shell.run()`，以及带源、目标资源的文件复制 | 可把手机导出的文件送到电脑，再交给浏览器使用；可靠性仍需具体任务验证 | [设备服务与传输][o15] |
| 动作回执和取消 | 回执包含 action/session/resource ID、`execution`、`effect`、`based_on` 和证据；提供 `action_status()`、`cancel()` 和关闭回执。已派发动作超时或取消后可能返回结果未知 | 能表达“未派发”和“结果未知”，避免把取消当作撤销。回执不等于业务验收 | [回执与生命周期][o2]、[派发与未知结果][o16] |

macOS 的旧引用检查有明确范围。provider 使用 CuaDriver 的 snapshot 和 element token，并检查目标窗口和截图几何。它没有提供“界面一变化，旧引用立即全部失效”的通用证明。公共层的 diff 实现也不能证明每个平台都有稳定节点身份。[Mac 观察][o6]、[Mac 动作][o7]

浏览器和 macOS 动作成功后，`effect` 仍可为 `unknown`。程序需要重新读取页面、应用状态或实际产物，再检查业务断言。观察已经交付给模型，只说明引用有来源；它不说明目标业务效果已经发生。[浏览器回执][o9]、[回执定义][o2]

## SDK 与 Agent harness 的分工

| 所属组件 | 已有机制 | 接入 SDK 后是否自动获得 |
|---|---|---|
| SDK | 资源绑定、能力声明、AX/视觉观察、模型交付确认、引用来源、动作回执、设备服务、动作状态与取消 | 接入并正确使用这些 API 后可获得 |
| Agent harness | 模型循环、持久 Python 解释器、变量/import/cwd 跨轮保留、输出采集、模型上下文组装、用户提问和中断 | 否，DSH 需要使用自己的执行和会话机制，或额外接入 harness |
| Agent harness | `todo` 状态、每步 intent、按需观察、历史图像和工具输出保留策略 | 否，需要由 DSH 的模型指令和上下文机制实现 |
| Agent harness | 私有 JSONL 动作日志，记录意图、派发、回执和未知结果；恢复时不自动重放 | 否，SDK 内的动作状态与 harness 的持久日志是不同机制 |

分工依据：[harness 架构与状态][o14]、[运行时职责][o17]、[动作日志源码][o18]。

只接 SDK，DSH 仍可自己写程序，把观察、操作和断言放进同一执行步骤。这种用法不需要 OpenGCUA 的 Agent。若只暴露“截图、点击、输入”几个原子工具，则会丢失统一资源与观察模型的大部分价值。

## 优势应归因于哪里

源码表明，SDK 的接口、观察存储和生命周期主要由 Rust 实现，Python 是模型使用的编程入口。不能把这些机制归因于 Python 语言本身。[SDK 结构][o1]、[观察存储][o5]

论文的主要证据支持程序组合方式：让一个程序根据中间结果，交替使用 GUI、Shell/API、分支、循环和断言。OSWorld-v2 消融使用相同 GUI+CLI 访问权限，比较批量动作和代码执行；没有比较 Python 与 JavaScript，也没有比较 DSH 与 OpenGCUA SDK。[论文 §3.1、§3.3.4][o19]

OSWorld 参考实现使用 `pyautogui` 和 `bash()`，由调用方执行 `code_exec`。其提示要求每步在全新 Python 进程执行，变量不会跨步保留。它与 macOS 的持久解释器和 Cross-Device SDK 是不同实现，不能用 OSWorld 得分证明 Cross-Device SDK 本身优于 DSH CUA。[OSWorld 参考代码][o21]

论文主结果来自 82 个离线任务、8 个模型，整体配置相对 GUI 批量动作基线增加 19.6 个平均部分得分，平均步骤减少 53%。这个结果同时改变执行和上下文机制，不能当作 SDK 单独收益。实机部分只有 4 个 macOS 任务，不能证明接入后在当前业务中更可靠。[论文 §3.3、§4.3.3][o19]

## 预览版状态与未验证项

SDK 的 macOS、Android、browser 和 Linux adapter 均标为 preview。Windows、完整实机 benchmark 等仍在计划中。`ROADMAP.md` 把 browser backend 列为后续，但当前 SDK 文档和 worker 源码已有浏览器实现，因此本报告按实现认定“已有预览”，不把路线图当作可用性测试结果。[SDK 平台表][o1]、[路线图][o20]、[浏览器源码][o9]

macOS AX diff 仍列后续。完整验证原语也列后续，不能把 `claimed_verified`、动作回执或演示中的成功表述当作独立业务验证器。harness 已有部分确认流程代码，但文档仍把完整 confirmation gating 标为后续，不宜宣称有成熟的统一安全审批层。[harness 状态][o14]、[路线图][o20]

本次尚未验证：在这台 Mac 上与 DSH 共用驱动是否冲突；新版 CuaDriver 是否改善当前应用；跨设备操作的失败恢复；模型是否正确覆盖全部业务对象；取消后外部动作实际停止的范围。以上问题需要针对具体任务做实机对照。

## 官方证据

[d1]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/experimental/cua-macos/README.zh.md
[d2]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/experimental/cua/src/types.ts
[d3]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/ptc-runtime/ptc-runtime-node/README.zh.md
[d4]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/browser-use.zh.md
[d5]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/experimental/ptc-runtime-python/README.zh.md
[d6]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/tools/README.zh.md
[d7]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/experimental/computer-use-cua-driver-native/package.json
[d8]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/experimental/cua/src/protocol.ts#L121
[d9]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/experimental/browser-use-playwright-mcp/README.zh.md
[o1]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/sdk/README.md
[o2]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/sdk/python/mai_ui/unified/runtime.py
[o3]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/sdk/python/mai_ui/unified/resources.py
[o4]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/sdk/python/mai_ui/unified/observations.py#L169
[o5]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/sdk/crates/runtime/src/observations.rs
[o6]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/sdk/adapters/macos/src/provider/observation.rs#L4
[o7]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/sdk/adapters/macos/src/provider/actions.rs#L44
[o8]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/sdk/adapters/macos/README.md
[o9]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/sdk/adapters/browser-playwright/src/worker.ts
[o10]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/sdk/adapters/browser-playwright/src/identity.ts
[o11]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/sdk/adapters/browser-playwright/src/background.ts
[o12]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/sdk/adapters/android/README.md
[o13]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/sdk/adapters/linux/README.md
[o14]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/harness/README.md
[o15]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/sdk/python/mai_ui/unified/services.py
[o16]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/sdk/crates/runtime/src/embedded.rs#L565
[o17]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/harness/runtime/README.md
[o18]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/harness/runtime/action_journal.py
[o19]: https://arxiv.org/html/2610.22200v1
[o20]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/ROADMAP.md
[o21]: https://github.com/Tongyi-MAI/OpenGCUA/blob/b7e4d57ba5730d6ea11f0e111bbabc56364869fd/packages/harness/examples/osworld/maiui_code_agent.py#L73

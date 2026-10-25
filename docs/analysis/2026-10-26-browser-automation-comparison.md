# 本机浏览器自动化工具选型核查

## 当前判断

对于“Mac 上复用已登录的 Chrome，多个 Agent 各自操作页面，同时排查网页问题”，现有 Browser Harness 可以继续使用。每个 Agent 分配不同的 `BU_NAME`，即可分开控制器和当前标签页。此次读取了 PyPI 的 `0.1.13` wheel，确认其中已经包含命名 daemon 的专用后台标签页实现。这项能力不依赖尚未发布的 `main`。[命名 daemon][bh-daemon]、[PyPI 元数据][bh-pypi]

新增候选优先比较腾讯 BrowserSkill 和 Playwriter。BrowserSkill 的长处是任务归属和调试证据管理；Playwriter 的长处是 Playwright 风格定位、可编程等待和开发调试接口。两者均存在发布版与最新源码的差异，当前证据不足以支持立即替换，也不支持“普遍更快、更准”的结论。[腾讯专项核查][tencent-report]、[Playwriter 发布版执行器][pw-release-executor]、[最新执行器][pw-executor]

Chrome DevTools MCP 适合继续承担性能与内存诊断。阿里 Page Agent 更适合把一段 DOM 操作交给另一个模型执行；字节 Midscene 更适合视觉操作和界面断言。后两者有适用场景，但当前需求的首要问题仍是控制目标、失败处理和结果验收。[DevTools 工具][cdp-tools]、[Page Agent MCP][pa-mcp]、[Midscene Skills][mid-skills]

## 范围和证据

核查日期：2026-10-26，Asia/Shanghai。默认条件是本机 Chrome，保留调用方 Agent 的任务控制权，不另行购买云浏览器。本报告使用官方文档、固定提交源码、公开 issue、GitHub release 和包注册表。

此次没有安装工具、启动浏览器、调用模型、复现网页缺陷或运行上游测试。发布包读取仅用于检查源码，没有执行包内代码。下面分别使用“源码事实”“文档行为”和“推断”说明证据强度。没有本机 A/B 性能数据。

仓库已在 [2026-10-23 的比较](2026-10-23-browser-use-stack-comparison.md) 中分析 Browser Use 的 CLI、Harness 与 Jev。此次补充多 Agent、本机交互、腾讯、阿里、字节及 Playwriter。此次调研没有推进 [Browser Harness 技能基准](../adr/0011-browser-harness-build-time-skill-check.md)，也没有改变安装清单或启动方案。

### 固定源码和发布版本

| 项目 | 核对的 main 完整提交 | 查询到的发布版本 |
| --- | --- | --- |
| Browser Harness | `4ced8e0087d2d45ea2d08c00cb62449b2d94a90e` | PyPI `0.1.13`，2026-09-04 上传 |
| Playwriter | `6489336628e6737e32a59f25ed270622400cb277` | npm `0.9.0`，GitHub release 为 2026-10-20 |
| agent-browser | `372ac5ce20fab885dbf45ee0c9d510ec8c3b6fdb` | npm `0.39.2` |
| Tencent BrowserSkill | `c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b` | GitHub CLI、扩展 `0.3.3`，2026-10-15 发布 |
| Alibaba Page Agent | `9eb6b6646500264d9034dd466a4270cb9fc1ef1e` | npm `page-agent`、`@page-agent/mcp` 均为 `1.12.4` |
| Midscene | `5ba6f2382c1c8020c8538850900a88cb831cad13` | npm `@midscene/web@1.17.0` |
| Chrome DevTools MCP | `ada7963246c0c91eae185125a57aecd13cbe0376` | npm `1.12.0`，注册表 `gitHead` 为 `af2834411a564d366f9cab63efb046d9084f4dba` |

main 提交与 release tag 是不同证据，不用相同版本字符串代替内容核验。注册表来源：[Harness][bh-pypi]、[Playwriter][pw-npm]、[agent-browser][ab-npm]、[Page Agent][pa-npm]、[Page Agent MCP][pa-mcp-npm]、[Midscene][mid-npm]、[DevTools MCP][cdp-npm]。腾讯的 CLI、扩展和插件状态见[专项报告][tencent-report]。

## Session 到底隔离什么

“有独立 session”可能表示独立脚本变量、独立当前页面、页面操作归属，或独立 Cookie。选型时必须分别核查，不能用一个 session 名字概括全部。

| 工具 | 控制状态 | 与其他 Agent 的页面关系 | 复用当前 Chrome 时的账号状态 |
| --- | --- | --- | --- |
| Browser Harness | 每个 `BU_NAME` 一个 daemon，各自持有 CDP session 和 target | 命名 daemon 获得专用后台 tab；仍可显式切换到浏览器的其他 target | 共享所连接 Profile |
| Playwriter | 每个 session 有独立执行状态；页面显式保存在 `state.page` | `context.pages()` 仍能列出共享页面；标签页分组帮助组织，不提供独占锁 | 共享所选浏览器环境 |
| agent-browser | 每个命名 session 有自己的控制状态；CDP 模式可固定 tab | `--pin-tab` 约束本 session 的自动选择；不等于跨 session 的强制所有权 | 共享 CDP 浏览器状态；自行启动的独立浏览器模式另有隔离 |
| BrowserSkill | 独立 Agent Window、ref 存储和每 session 执行队列 | 借用有 reservation；常规写工具检查会话窗口归属 | 共享选定 Profile |
| Page Agent MCP | 一套 Hub 执行状态 | 当前 Hub 一次执行一个任务；不是逐工具调用显式传入 page/session 的接口 | 来自扩展所在浏览器 |
| Midscene | 取决于所用平台 CLI、Page 或 Bridge 连接 | 需要给并行任务明确分配目标；此次没有建立跨会话 tab 独占的证据 | Bridge 复用已有 Chrome，其他启动模式另计 |

依据：[Harness daemon][bh-daemon]、[切换 target][bh-helpers]、[Playwriter 会话][pw-sessions]、[agent-browser 会话][ab-sessions]、[腾讯会话核查][tencent-report]、[Page Agent Hub][pa-hub]、[Midscene Skills][mid-skills]。

### Harness 的默认模式与命名模式

源码中每个 daemon 都有自己的 `self.session`、`self.target_id` 和 `self.dedicated_target_id`。非默认本地 daemon 优先恢复自己的当前或专用 target；不存在时创建后台空白页。PyPI `0.1.13` 中的 `daemon.py` 与核查的 release tag 相同，且包含这段分支。[实现][bh-daemon]

多个 Agent 共用默认 daemon 时，会共享可变的当前页面。给每个 Agent 固定不同的 `BU_NAME` 可以分开这一状态。`switch_tab()` 仍接受任意 target；`ensure_real_tab()` 在失去当前页面时可选择列表中的其他真实页面。因此需要保留目标身份检查，不能把命名 daemon 当成禁止访问其他 tab 的边界。[helpers][bh-helpers]

Harness 的 `new_tab()` 和默认 `switch_tab()` 使用后台操作。它们与让 Chrome 显示某个 tab 的 `activate_tab()` 分开。命名 daemon 可能增加 Chrome 的连接授权提示，但不要求每个 Agent 新开 Chrome 窗口。[操作说明][bh-skill]

### 腾讯的归属检查比“各自记住 tab”更明确

BrowserSkill 的借用流程在异步操作前登记 reservation，拒绝第二个会话借用同一 tab。普通写工具还检查所属 Agent Window。它确实做了页面归属检查，不能把它概括成一个普通当前 tab 指针。[源码与限制][tencent-report]

默认窗口使用 `focused: false`，会创建独立窗口。它与“所有 Agent 的 tab 都放在用户当前窗口”是不同产品体验。用户如果严格要求只使用同一个现有窗口，需要单独确认所安装版本是否支持该模式；本报告没有把未发布 PR 当作现有能力。

## 哪种定位更适合当前页面

操作准确性至少有四个独立问题：目标 tab 是否正确、目标 frame 是否正确、元素在动作发生时是否可用，以及业务结果是否符合预期。一个工具成功发送点击事件，只能证明其中很少一部分。

| 页面类型 | 优先考虑的入口 | 原因和限制 |
| --- | --- | --- |
| 标准按钮、表单、列表 | Playwriter 的 locator；agent-browser 的 ref／语义定位；BrowserSkill 的新鲜 ref | 可以围绕角色、标签和稳定元素身份操作。仍需处理重复名称、重渲染和 frame。 |
| 动画、遮挡、延迟出现的控件 | 带动作条件检查和明确等待的入口 | Playwright 的 `locator.click()` 会检查唯一匹配、可见、稳定、可接收事件和 enabled。强制点击会改变这些保证。 |
| Canvas、图像按钮、语义较差的组件 | 截图与视觉定位，必要时使用 Midscene | 视觉能够观察 DOM 文本没有表达的内容；准确性依赖模型、截图新鲜度和点击前的页面状态。 |
| 跨域／跨进程 iframe | 明确记录 frame/CDP 子会话的入口 | 仅“看见输入框”还不够，键盘事件必须发到正确执行目标。腾讯有相关公开问题，详见专项报告。 |
| 支付、保存、提交等业务步骤 | 动作后检查页面、接口或业务数据 | 工具正常返回、HTTP 200、按钮被点击都不等于业务完成。 |

依据：[Playwright 动作检查][pw-actionability]、[agent-browser 定位文档][ab-readme]、[腾讯 ref 与 OOPIF 核查][tencent-report]、[Midscene API][mid-api]。

Playwriter 使用 `@xmorse/playwright-core`，并在执行器中创建浏览器连接和独立脚本状态。这是 Playwright 风格的开发接口；不应把它表述成已经逐项验证了原版 Playwright 所有能力和当前扩展的兼容性。网络监听、等待、断点和编辑接口均有现成入口，但具体网站仍须验证。[执行器][pw-executor]、[调试器][pw-debugger]、[代码编辑][pw-editor]

Harness 的 `click_at_xy()` 直接发送 CDP 鼠标按下与释放事件，入口本身不做 Playwright 那组 actionability 检查。官方工作流要求从无障碍树取节点、计算当前几何位置，再检查结果。它也有 `fill_input()` 和 `wait_for_element()`，不能把 Harness 误写成只有裸坐标、没有表单或等待能力。[helpers][bh-helpers]、[操作工作流][bh-skill]

## 发布版可靠性有两个具体缺口

### BrowserSkill 的新协作防护尚不能按版本号判断

main 在 2026-10-22 加入默认协作模式、固定任务 tab 和一次性观察上下文。最新 GitHub CLI／扩展 `0.3.3` 发布于 2026-10-15，其 tag 不含这些文件；main 仍使用 `0.3.3` 版本字符串。[专项版本核对][tencent-report]

issue #420 报告在 Aside／Chromium 上，错误恢复后 `evaluate` 读到另一个用户 tab；issue #438 报告跨进程 iframe 输入路由错误。核查时相关 issue 和修复 PR 仍开放。main 新防护可能影响前一个问题，因此不能单凭 PR 状态判定 main 已修或未修；也不能把 Aside 的复现直接等同于正式 Chrome。[#420][bsk-420]、[#438][bsk-438]、[源码和修复状态][tencent-report]

### Playwriter 的超时取消改动也晚于发布版

此次直接读取 npm `playwriter@0.9.0` 压缩包中的 `dist/executor.js`。它包含 `Promise.race` 超时返回，但不含 main 新增的 `AsyncLocalStorage` 和 `rejectAbortedPlaywrightCalls`。这与 `playwriter@0.9.0` tag 的执行器一致：超时会结束等待，但异步脚本可能继续，后续动作可能与下一次调用交错。[npm 元数据][pw-npm]、[发布版执行器][pw-release-executor]

main 在每次执行中创建 `AbortController`，并在后续 Playwright 调用前拒绝已经超时的脚本。它仍明确说明，已经在进行的动作可能完成，需要先查看页面再重试。不能把 main 的取消行为当作当前 npm 包已经具备的保证。[最新实现][pw-executor]

这些发现说明两者都值得测失败恢复，并不构成它们整体成功率更低的证明。Browser Harness、agent-browser 的原始 CDP 调用也可能在超时前后改变页面；所有方案都应在重试前读取真实状态。

## 调试深度与连接共存

| 工具 | 已建立证据的调试能力 | 需要额外处理的部分 |
| --- | --- | --- |
| BrowserSkill | 请求、响应正文、控制台、操作时间线、有限加载指标、规则／同源重放、历史导出 | 文档明确不包含 CPU profiling、INP、iframe vitals 和 SPA soft-navigation vitals。 |
| Playwriter | Playwright 网络监听、CDP、调试器、断点和脚本编辑辅助 | 很多分析需要 Agent 编写脚本；不等于现成的完整性能诊断报告。 |
| Browser Harness | JS、原始 CDP、事件缓冲、截图和自定义 helper | 能力开放，但需要编写采集、关联和验收逻辑。 |
| Chrome DevTools MCP | 网络、控制台、样式、性能 trace／insight、heap snapshot 查询 | 页面路由不等于页面独占。需要协调同一目标上的状态修改、trace 和连接恢复。 |

依据：[腾讯调试范围][tencent-report]、[Playwriter 示例与 API][pw-readme]、[Harness 事件／CDP][bh-helpers]、[DevTools 工具参考][cdp-tools]。

可以同时配置多个浏览器工具，但不能据此保证它们同时接管同一 tab 时互不影响。BrowserSkill 和 Playwriter 都有扩展调试传输。Chrome 官方文档说明，打开附着 tab 的原生 DevTools 会触发扩展调试连接的 detach。Chrome DevTools MCP 使用的远程 CDP 与原生 DevTools 面板也不是同一个接入路径，具体组合须按版本验证。[Chrome debugger API][chrome-debugger]

当前可采用的分工是：一个明确的页面操作者负责复现，另一个工具按需采集诊断；改变导航、DOM、拦截规则、执行暂停或目标选择前先协调。只读工具也可能建立和改变调试域状态，不能简单宣称“只读就不会冲突”。

## 阿里和字节方案的实际位置

### Page Agent MCP 不适合直接充当多 Agent 的底层动作接口

`@page-agent/mcp@1.12.4` 暴露 `execute_task`、`get_status` 和 `stop_task`。前者将整段自然语言交给 Hub；Hub 再使用 Page Agent 的模型配置执行。源码含单任务 busy 检查。多个 Hub 可以另行部署，但没有证据表明默认配置会自动提供每个调用方独占 tab 的编排。[MCP 实现][pa-mcp]、[Hub 协议][pa-hub]

官方限制页列出：不支持悬停、拖拽、右键、键盘快捷键、坐标操作、嵌套／跨域 iframe；DOM 文本方案不识别图片、Canvas、WebGL 等视觉内容。它适合语义完整的表单和页面内 Copilot，不能按“纯 DOM、无需截图”推断复杂调试任务更准确。[官方限制页源码][pa-limitations]

### Midscene 要区分 Skills 与 AI SDK

Midscene Skills 的官方说明是外层 coding agent 读取截图、理解页面并通过 CLI 执行动作。不能把所有 Midscene 用法都概括成“再套一层模型 Agent”。浏览器 CLI 支持默认浏览器、Chrome Bridge 和 CDP 三种路径。[Skills][mid-skills]

调用 SDK 的 `aiAct()` 时，Midscene 会调用配置的模型持续规划和执行；`aiAssert()` 则用于视觉／自然语言断言。这是另一种调用模式。对于 Canvas、图像和视觉验收，它值得作为补充；对于网络、断点和 CPU 性能诊断，它不直接替代 DevTools。[API][mid-api]

当前官方已退役 MCP server，最后包含 MCP 的版本为 `1.9.8`。新接入应按当前 Skills／CLI 文档评估，不能照旧教程配置已退役包。[当前迁移说明][mid-mcp]

Stagehand、AgentBay、Steel 仍是另一组有效候选。Stagehand 适合开发可复用的操作／提取流程；AgentBay 和 Steel 提供独立浏览器基础设施。它们主要改变任务执行方式或浏览器部署位置，不是当前“继续使用自己的 Chrome”需求下的优先替换项。[Stagehand][stagehand]、[AgentBay][agentbay]、[Steel][steel]

## 速度目前能判断到哪一步

此次没有把语言实现、Star 数或厂商名称转成速度排名。端到端耗时同时受模型轮次、每次输出大小、工具调用往返、页面等待、截图和恢复重试影响。Rust CLI 启动快，不能单独证明浏览器任务完成更快。

2026-10-14 的 Browser Use 对照使用同一 Codex、同一云浏览器及 100 个任务。Harness 的中位耗时为 540 s，agent-browser 为 675 s；评分分别为 60.4 和 56.3，但配对差异的置信区间包含 0。该测试由 Harness 作者发布，不涵盖腾讯、阿里、Playwriter，也不等于用户本机 Chrome。[原始结果与条件][bu-benchmark]

HyperTeams 的公开对照使用另一模型和任务集合。其成功 REAL 任务的中位耗时中，agent-browser 为 90 s，Harness 为 108 s，方向相反。该测试同样由参测产品方维护。两组材料不能合成一个通用冠军。[测试结果][hyper-benchmark]

Page Agent 的整任务委托可能增加模型调用，也可能减少外层工具轮次；Midscene 的视觉输入有额外成本，也可能减少复杂页面定位失败。净影响需要同条件测量，不能只根据架构预判正负。

## 对当前环境的选择建议

继续保留 Browser Harness 作为现有基线。每个 Agent 固定一个命名 daemon 和自己的 target，避免省略目标后的自动恢复改变任务现场。这个建议没有改变当前项目的技能基准和第三方维护边界。[当前 ADR](../adr/0011-browser-harness-build-time-skill-check.md)

BrowserSkill 是“会话归属＋日常调试证据”方向的候选，尤其适合评估 DSH 接入成本。当前应先核验 CLI、扩展、插件和发布内容，再测错误恢复与 iframe 输入。DSH 插件存在图片附件分支，不等于当前模型路由已经验证能接收截图。[腾讯专项报告][tencent-report]

Playwriter 是“开发调试＋可编程页面操作”方向的候选。其 session 状态和 Playwright 风格 API 有实际价值。正式采用前需要验证发布版超时后的动作终止、tab 关闭与连接重建行为。它可以进入 A/B，但此次不建议只凭 README 替换稳定使用中的工具。

Midscene 可在视觉定位和界面验收任务中单独加入。Page Agent 可用于语义明确的表单委托。它们可以分任务选用，不必替换统一的底层控制工具。

### 下一步验证清单

以下是尚未执行的本机对照方案，不是已通过的验收结果。测试前固定工具和扩展版本、同一模型与推理设置、同一目标应用、同一网络环境和相同初始登录态。

| 场景 | 具体通过条件 | 记录内容 |
| --- | --- | --- |
| 3 个 Agent 并行，用户前台浏览 | 每个 Agent 只改自己的测试页面；用户当前 tab 不发生非预期导航或输入 | 实际 target／frame、非预期前台切换、错误页面动作次数 |
| 遮挡、重渲染和滚动表单 | 遮挡时等待或明确失败；重新观察后操作正确控件；提交值准确 | 首次成功率、重试次数、总耗时、模型工具轮次 |
| 跨域 iframe／密码管理器注入 frame | 输入只进入目标 frame，父页面值保持预期 | 输入值、目标 frame、失败分类、恢复后 target |
| tab 关闭、CDP 断开和动作超时 | 明确失败或受控恢复；重试前检查状态；不向其他任务页面发送动作 | 超时后延迟动作、恢复目标、是否重复提交 |
| 保存失败与慢接口诊断 | 找到预设失败请求和实际业务错误，保留足够证据 | 请求／响应、控制台、相关操作与诊断准确性 |
| DSH 图片与取消 | 当前模型实际看见截图；取消后无新的任务动作，资源按归属清理 | 模型收到的内容、取消退出证据、遗留窗口和任务 |

延迟至少分别记录工具耗时和任务总耗时。先报告首次成功与失败类型，再比较成功任务中位数和尾部延迟，避免用“很快失败”美化速度。业务验收使用明确的页面或测试应用数据，不能只采信 Agent 自报完成。

[tencent-report]: 2026-10-26-browser-automation-comparison/tencent-browserskill-source-audit.md
[bh-daemon]: https://github.com/browser-use/browser-harness/blob/4ced8e0087d2d45ea2d08c00cb62449b2d94a90e/src/browser_harness/daemon.py#L425-L482
[bh-helpers]: https://github.com/browser-use/browser-harness/blob/4ced8e0087d2d45ea2d08c00cb62449b2d94a90e/src/browser_harness/helpers.py#L174-L238
[bh-skill]: https://github.com/browser-use/browser-harness/blob/4ced8e0087d2d45ea2d08c00cb62449b2d94a90e/SKILL.md
[bh-pypi]: https://pypi.org/pypi/browser-harness/0.1.13/json
[pw-npm]: https://registry.npmjs.org/playwriter/0.9.0
[pw-readme]: https://github.com/remorses/playwriter/blob/6489336628e6737e32a59f25ed270622400cb277/README.md
[pw-sessions]: https://github.com/remorses/playwriter/blob/6489336628e6737e32a59f25ed270622400cb277/README.md#cli-usage
[pw-executor]: https://github.com/remorses/playwriter/blob/6489336628e6737e32a59f25ed270622400cb277/playwriter/src/executor.ts
[pw-release-executor]: https://github.com/remorses/playwriter/blob/playwriter%400.9.0/playwriter/src/executor.ts
[pw-debugger]: https://github.com/remorses/playwriter/blob/6489336628e6737e32a59f25ed270622400cb277/playwriter/src/debugger.ts
[pw-editor]: https://github.com/remorses/playwriter/blob/6489336628e6737e32a59f25ed270622400cb277/playwriter/src/editor.ts
[pw-actionability]: https://playwright.dev/docs/actionability
[ab-npm]: https://registry.npmjs.org/agent-browser/0.39.2
[ab-sessions]: https://github.com/vercel-labs/agent-browser/blob/v0.39.2/skill-data/core/references/session-management.md
[ab-readme]: https://github.com/vercel-labs/agent-browser/blob/v0.39.2/README.md#selectors
[bsk-420]: https://github.com/Tencent/BrowserSkill/issues/420
[bsk-438]: https://github.com/Tencent/BrowserSkill/issues/438
[pa-npm]: https://registry.npmjs.org/page-agent/1.12.4
[pa-mcp-npm]: https://registry.npmjs.org/@page-agent%2fmcp/1.12.4
[pa-mcp]: https://github.com/alibaba/page-agent/blob/9eb6b6646500264d9034dd466a4270cb9fc1ef1e/packages/mcp/src/index.js
[pa-hub]: https://github.com/alibaba/page-agent/blob/9eb6b6646500264d9034dd466a4270cb9fc1ef1e/packages/extension/src/entrypoints/hub/hub-ws.ts#L167-L189
[pa-limitations]: https://github.com/alibaba/page-agent/blob/9eb6b6646500264d9034dd466a4270cb9fc1ef1e/packages/website/src/pages/docs/introduction/limitations/page.tsx
[mid-npm]: https://registry.npmjs.org/@midscene%2fweb/1.17.0
[mid-skills]: https://midscenejs.com/skills
[mid-api]: https://midscenejs.com/reference/
[mid-mcp]: https://midscenejs.com/mcp
[cdp-npm]: https://registry.npmjs.org/chrome-devtools-mcp/1.12.0
[cdp-tools]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/ada7963246c0c91eae185125a57aecd13cbe0376/docs/tool-reference.md
[chrome-debugger]: https://developer.chrome.com/docs/extensions/reference/api/debugger#event-onDetach
[bu-benchmark]: https://browser-use.com/benchmarks/coding-agent-browser-tools.json
[hyper-benchmark]: https://hyperteams.net/benchmarks
[stagehand]: https://github.com/browserbase/stagehand
[agentbay]: https://help.aliyun.com/zh/agentbay/support/agentbay-sdk-browser-use
[steel]: https://github.com/steel-dev/steel-browser

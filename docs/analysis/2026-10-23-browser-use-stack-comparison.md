# Browser Use、Browser Harness 与 Jev Ultrafast 对比

## 结论

你要保留 DSH 原生 Agent，让它逐步操作并验收，优先选 Browser Harness 工具层。你已经熟悉 Browser Use，可以先评估它现有的 CLI／MCP 工具入口，无需先启动 `Agent.run()`。这是基于源码的接入建议，尚未在 DSH 实测。

**最新 Browser Use 已经分发 Harness。** `browser-use` 的普通 CLI 调用会转到 `browser_harness.run.main()`；包依赖也锁定 `browser-harness==0.1.13`。因此，“Browser Use 一定接管任务循环”只适用于它的 Agent 模式。[CLI 转发][bu-cli]、[依赖][bu-package]

`browser-use --cli-mcp` 提供 `browser_exec` 和 `browser_screenshot`。前者保留跨调用的 Python 命名空间；后者返回原生 MCP 图片块。独立 `browser-harness-mcp` 提供多个动作工具，但截图工具返回路径和尺寸的 JSON。DSH 接入时，需要确认图片最终能进入模型上下文。[Browser Use MCP][bu-cli-mcp]、[Harness 截图实现][bh-mcp-source]

## 核对范围

调研日期：2026-10-23。通过 GitHub API 取得默认分支完整提交，再读取对应源码。

| 项目 | 核对提交 | 包声明版本 |
| --- | --- | --- |
| browser-use | `3df5806a0d097a1546d92c49bcf1b28c9972c3bd` | `0.13.13` |
| browser-harness | `c6a941287424f32e2d20c7b7b892c8493f46808d` | `0.1.13` |
| jev-ultrafast | `1231850a0bf1a0c0341fe408ef1668dbbfdfac46` | `0.1.0` |

版本来自各仓库 `pyproject.toml`，不代表已经核验 PyPI 发布状态。此次只读文档和源码；没有安装依赖、启动浏览器、调用模型或测试成功率。[Browser Use][bu-package]、[Harness][bh-package]、[Jev Ultrafast][ju-package]

## 能力与控制权

| 比较项 | browser-use | browser-harness | jev-ultrafast |
| --- | --- | --- | --- |
| 主要定位 | Python 浏览器 Agent 框架，同时分发 Harness CLI 与 MCP | 给现有 Agent 使用的浏览器工具层 | 用 TypeSafe Jev 选择动作的浏览器 Agent MVP |
| 任务循环由谁控制 | `Agent.run()` 由 Browser Use 控制；CLI／`--cli-mcp` 由调用它的 Agent 控制 | 调用方控制，例如 DSH 原生 Agent | 内置 `Agent.run()` 循环；也可分别调用 `predict` 和 `act` |
| 是否额外调用模型 | Agent 模式需要模型；CLI／`--cli-mcp` 的工具执行无需额外模型 | 本地 CLI／MCP 工具执行无需额外模型 | 策略选择需要 TypeSafe API；`TYPE_TEXT` 再调用文本模型 |
| 观察方式 | Agent 使用 DOM 状态和可选视觉输入；Harness 入口复用右列 | 页面信息、截图、JavaScript 和原始 CDP；调用方选择读取方式 | 单次 DOM 快照生成可见文本、控件表和实际节点引用；默认策略循环不看截图 |
| 动作范围 | 自有 Agent 工具注册及浏览器会话；CLI 路径复用 Harness | 导航、标签页、点击、输入、按键、滚动、上传、JS／CDP | 有界的点击、输入、原生选择、滚动、等待、完成和阻塞 |
| 结果验收 | Agent 带模型 judge，默认复用主模型；业务断言仍需明确编写 | 调用方通过新状态、截图、JS 或业务数据验收 | 动作执行前检查过期状态和遮挡；通用 `DONE` 不含独立业务断言 |
| 适合 DSH 逐步操作验收 | 选 CLI／工具层；直接运行 Agent 会增加另一套任务决策 | 最贴合职责：DSH 决策、工具执行、DSH 验收 | 可取观察／执行层；完整策略会引入 Jev 和另一套执行循环 |

表中源码依据：[Browser Use Agent][bu-agent]、[CLI][bu-cli]、[Harness 执行入口][bh-run]、[helpers][bh-helpers]、[Jev Agent][ju-agent]、[模型调用][ju-model]、[浏览器执行器][ju-browser]。

## 三个仓库的实际关系

当前依赖方向是 `browser-use → browser-harness`，以及 `jev-ultrafast → browser-harness`。两者均声明依赖 `browser-harness==0.1.13`。Browser Use 的 Python Agent 仍有自己的会话和工具实现，不能把整个 Browser Use 等同于 Harness。[Browser Use 依赖][bu-package]、[Jev 依赖][ju-package]、[Browser Use Agent][bu-agent]

在核对的 Browser Use 包源码和依赖中，没有发现对 `jev-ultrafast`、`jev_ultrafast` 或 TypeSafe System One 的集成；Harness 包源码也没有这类策略调用。它们共用 Harness，不等于 Browser Use 已经采用 Jev 策略。这个结论限定于上述提交的本地开源实现，不能外推到闭源云端产品。

三个仓库的主要运行入口都用 Python。Harness 通过 CDP 执行浏览器 JS；Jev Ultrafast 的页面观察器是 `snapshot.js`。这三个入口没有要求 Rust 开发环境。Browser Use README 提到的 TypeScript 产品另有仓库，例如 `browser-harness-js` 和 `browser-use-pi`；不能据此把当前 Python 包当作同一个 TypeScript 实现。[三个包声明][bu-package]、[Harness 声明][bh-package]、[Jev 声明][ju-package]、[相关仓库][bu-readme]

## Jev 到底是什么

**Jev 是 TypeSafe 的模型名；Jev Ultrafast 是使用该模型的浏览器 Agent 项目。** TypeSafe 将 Jev 描述为 System One 模型：输入状态和带类型的问题，返回选择、概率和置信度。文档没有给出 Jev 的缩写展开。[TypeSafe 官方介绍][typesafe]

源码中，`choose()` 向 `https://api.typesafe.ai/v1/systemone` 发请求，默认模型是 `jev-latest`。同一请求同时询问动作和各类候选目标，然后只执行选中动作对应的目标。这是模型服务与本地策略、执行器的组合。[选择实现][ju-model]

文本模型只负责生成待输入的文字。默认源码支持 OpenAI 兼容接口；示例配置使用 OpenRouter 上的 Mercury。确定性执行器本身不需要模型，但公开的完整 Agent 策略需要 TypeSafe 凭据，输入文字时还需要文本模型凭据。[模型实现][ju-model]、[示例配置][ju-env]

## 登录态和部署边界

Harness 的本地模式连接现有 Chrome CDP，复用该浏览器的登录态；需要启用远程调试并完成浏览器授权。本地工具模式不要求 Browser Use Cloud。云浏览器或远程 CDP 是另外的配置选择。[连接说明][bh-install]、[运行入口][bh-run]

Browser Use 的 Python Agent 可用本地或云浏览器。官方提供 `Browser.from_system_chrome()` 复用 Chrome 配置，也提供云端配置同步；文档说明同步只迁移 cookies，不含 localStorage、IndexedDB 或扩展。CLI 的现有 Chrome 路径则来自 Harness。[登录说明][bu-readme]、[CLI 转发][bu-cli]

Jev Ultrafast 使用 Harness 建立连接，再创建自己拥有的后台标签页。标签页仍共享现有 Chrome 配置；默认会话不等于隔离浏览器。它有本地观察和执行器，但其默认决策依赖远端 TypeSafe，不能把整套 Agent 称作完全本地运行。[浏览器构造][ju-browser]、[模型请求][ju-model]

## 验收与性能证据的边界

Jev Agent 接受模型的 `DONE` 后结束。`examples/flights.py` 另外定义 `verify()`，检查单程、出发地、目的地、日期和可见结果，并以真实检查决定退出是否失败。该验证器属于航班示例，不能直接验证任意业务任务。[Agent 停止逻辑][ju-agent]、[独立验收器][ju-flights]

作者的 7.073 秒数据来自一次 Google Flights 任务。计时排除浏览器准备、初始导航和最终独立验收；优化对比每侧各 3 次。Wikipedia 与本地酒店页面各有补充检查。这些数据不能证明跨网站可靠性，也没有比较 DSH。[性能报告][ju-perf]

Jev 当前 DOM 读取器尚不覆盖完整 accessible-name 规范、Shadow DOM、iframe、canvas、上传、弹出标签页、嵌套滚动和任意键盘控件。Harness 提供更通用的 JS／CDP 入口，但需要 DSH 自己选择工具和写检查。[Jev 限制][ju-perf]、[Harness helpers][bh-helpers]

Harness 作者另有与 Playwright MCP、Chrome DevTools MCP 的对比。该测试使用同一 Codex 和云浏览器，并非 DSH 或用户本地 Chrome；README 自身也指出评分差异没有统计显著性。不能根据该结果宣称 Harness 的任务成功率更高。[测试条件与结果][bh-readme]

## 对 DSH 的接入建议

先把“工具连接”和“任务规划”分开评估。优先验证 Browser Use 的 Harness CLI／`--cli-mcp` 路径：DSH 读取页面、执行一个或一组动作，再读取新状态并核对业务条件。该路径保留 DSH 决策权，也避免新增浏览器策略模型。[工具入口][bu-cli-mcp]

如果只需要独立浏览器工具，可评估 Harness MCP；要检查截图路径如何转成模型可见的图片。只有确实需要 Jev 的快速动作选择时，再考虑接它的 `choose()` 策略。接入前还需验证 DSH 的 MCP 图片处理、取消、会话隔离和并发标签页行为；此次调研没有完成这些验证。

当前 DSH 已有通用 MCP 客户端，支持工具发现、取消、结果记录和受支持的图片输出。接入工具模式有现成的执行入口，仍需实测 Browser Use 的图片是否被当前模型路由接纳。项目启动层从 `project-mcp.json` 装配 MCP，不需要因此替换 DSH 的任务循环。[DSH MCP](../../deepseek-harness/docs/subsystems/mcp.zh.md)、[项目配置入口](../../README.md)

项目的 JEV 中心管理 TypeSafe System One 连接、凭据引用和模型名称，并转发 `state` 与 `questions`。它没有包含 Jev Ultrafast 的页面观察器、动作候选生成或浏览器执行器。因此，已配置 JEV 中心不代表已经接入 Jev Ultrafast。本次没有修改中心或新增浏览器消费插件。[JEV 中心实现](../../agent-observation-plugin/src/jev-center-plugin.mjs)、[配置归属决定](../adr/0003-shared-named-jev-center.md)

## DSH 社区桥接补充

搜索还找到 [ricardochen1996/dsh-browser-use](https://github.com/ricardochen1996/dsh-browser-use)。作者 README 说明，其 Python sidecar 使用 `jev_ultrafast`，默认把浏览器交给 DSH 原生可续子代理；配置 `delegate:false` 可向当前聊天直接提供浏览器工具。`browser_act` 可接收明确动作，或通过 `intent` 调用策略；`browser_goal` 则把完整目标交给浏览器策略。这是社区 Jev Ultrafast 桥接，与 `browser-use/browser-use` 的 Python Agent 库不是同一个项目。本次只核对作者说明，没有安装或验证当前 DSH 兼容性。

[bu-readme]: https://github.com/browser-use/browser-use/blob/3df5806a0d097a1546d92c49bcf1b28c9972c3bd/README.md
[bu-package]: https://github.com/browser-use/browser-use/blob/3df5806a0d097a1546d92c49bcf1b28c9972c3bd/pyproject.toml#L50
[bu-cli]: https://github.com/browser-use/browser-use/blob/3df5806a0d097a1546d92c49bcf1b28c9972c3bd/browser_use/cli.py#L185-L202
[bu-cli-mcp]: https://github.com/browser-use/browser-use/blob/3df5806a0d097a1546d92c49bcf1b28c9972c3bd/browser_use/mcp/cli_mcp.py#L45-L155
[bu-agent]: https://github.com/browser-use/browser-use/blob/3df5806a0d097a1546d92c49bcf1b28c9972c3bd/browser_use/agent/service.py
[bh-package]: https://github.com/browser-use/browser-harness/blob/c6a941287424f32e2d20c7b7b892c8493f46808d/pyproject.toml
[bh-readme]: https://github.com/browser-use/browser-harness/blob/c6a941287424f32e2d20c7b7b892c8493f46808d/README.md
[bh-install]: https://github.com/browser-use/browser-harness/blob/c6a941287424f32e2d20c7b7b892c8493f46808d/install.md
[bh-run]: https://github.com/browser-use/browser-harness/blob/c6a941287424f32e2d20c7b7b892c8493f46808d/src/browser_harness/run.py#L304-L420
[bh-helpers]: https://github.com/browser-use/browser-harness/blob/c6a941287424f32e2d20c7b7b892c8493f46808d/src/browser_harness/helpers.py
[bh-mcp-source]: https://github.com/browser-use/browser-harness/blob/c6a941287424f32e2d20c7b7b892c8493f46808d/src/mcp_server.py#L192-L211
[ju-package]: https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/pyproject.toml
[ju-agent]: https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py
[ju-model]: https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/model.py
[ju-browser]: https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/browser.py
[ju-env]: https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/.env.example
[ju-flights]: https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/examples/flights.py#L20-L39
[ju-perf]: https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/docs/performance.md
[typesafe]: https://docs.typesafe.ai/introduction

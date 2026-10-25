# Tencent BrowserSkill 源码核查

## 结论与核查边界

BrowserSkill 适合列入本机 Chrome 多 Agent 自动化的候选。它有会话独立的代理窗口、标签页借用归属、动作检查和网站调试证据。使用现有 Agent 的 CLI 或 DSH 插件路径时，BrowserSkill 不额外运行浏览器决策模型。[项目说明][readme]、[会话管理][manager]、[调试能力][debug]

当前需要先区分发布版和 `main`。`main` 已增加默认人机协作、固定任务标签页和一次性观察上下文。最新 GitHub 发布版 `0.3.3` 不含这组新文件。不能根据最新文档，断言用户安装的 `0.3.3` 已具备这些防护。[协作功能提交][coop-commit]、[协作实现][cooperation]、[发布版][release]

本次仅匿名读取官方文档、固定提交源码及公开 issue。没有安装工具、启动浏览器、调用模型、运行上游测试或复现缺陷。下文的源码机制不等于本机验证通过，也不构成速度或成功率排名。

## 固定版本

核查时间：2026-10-26，Asia/Shanghai。

| 项目 | 核查结果 | 证据与限制 |
| --- | --- | --- |
| `main` | `c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b` | GitHub API 返回的完整提交，提交时间为 2026-10-25。 |
| 最新 GitHub release | `cli-v0.3.3`，2026-10-15 发布 | 发布目标为 `d9a78aed47874459ae1e44523a597e42dd9acf99`。`ext-v0.3.3` 同样指向该提交。 |
| 源码声明版本 | CLI、扩展和 DSH 插件均为 `0.3.3` | `main` 在发布后仍使用相同版本号，版本字符串不足以确定内容。 |
| npm 插件 `latest` | `@wxg-prc-cpg/browser-skill-dsh-plugin@0.3.3` | 仅核对注册表元数据。没有逐字比较 npm 发布包、GitHub tag 和本机安装内容。 |
| Chrome Web Store | 未核验 | GitHub release 不代表商店已经分发相同内容。 |

来源：[main 元数据][main-api]、[release 元数据][release-api]、[tags][tags-api]、[CLI 版本][cargo]、[扩展版本][ext-package]、[插件版本][dsh-package]、[npm 元数据][npm]。

## 会话、标签页和焦点

每个扩展会话有自己的 `agentWindowId`、`RefStore`、借用表和 Agent 创建的标签页集合。daemon 为每个会话建立独立串行队列。同一会话的工具按顺序执行，不同会话可以各自推进。这里的隔离是控制状态和窗口归属；正常窗口仍共享选定 Chrome Profile 的登录态。[会话上下文][manager]、[队列][queue]、[Profile 说明][readme]

标签页借用包含实际检查。`tryReserveBorrow()` 在异步浏览器操作前同步登记 reservation，拒绝已经受其他会话控制的 tab。普通写工具要求目标位于该会话的 Agent Window；显式指定其他会话窗口中的 tab 会遭拒绝。远程模式另有逐 tab 授权检查。本地被动读取的范围较宽，不能把代理窗口理解成浏览器数据安全沙盒。[借用保留][manager]、[借用检查][tabs]、[目标范围][scope]

新窗口默认使用 `chrome.windows.create({ focused: false })`。这是后台创建的明确实现；它仍然创建独立可见窗口，并非只在用户当前窗口里新增一组 tab。显式查看、请求人工协助和其他前台操作仍可能取得焦点。尚未在本机 macOS、窗口管理器及具体网站中验证这些行为。[窗口实现][window]

`main` 新增了更明确的人机协作状态。初始任务 tab 会固定到会话，人的标签页切换不自动重定向 Agent 操作。`cooperate sync` 返回 `context_id`，一次动作消费一次上下文；执行前检查页面证据，遇到人工输入或状态变化时暂停并要求同步。默认启用的这组功能来自 2026-10-22 的提交，最新 `0.3.3` tag 中没有 `cooperation/controller.ts` 和 `references/cooperation.md`。[协作说明][cooperation-doc]、[固定 tab 与动作检查][cooperation]、[功能提交][coop-commit]、[发布版][release]

## 定位、检查和准确性边界

DOM ref 保存 `backendNodeId`、tab、frame 和 CDP 子会话信息。ref 查询会拒绝其他 tab 的引用。新 snapshot 会替换 ref 映射，`eN` 不是跨观察永久身份；引用代次属于内部状态。`main` 的单次观察上下文进一步约束动作依据。[引用存储][refs]、[引用解析][ref-lookup]、[协作检查][cooperation]

常规点击先解析 ref 或选择器，滚动目标及其 frame，再计算当前可见区域中的点击点。实现会拒绝无法形成可见区域的目标。视觉点选还绑定截图及目标身份。协作模式在按下前增加指针命中和观察证据检查。这些是具体防护；不能由此推断任意网页、Shadow DOM、跨域 iframe 或 canvas 的业务操作都能成功。[动作实现][interaction]、[几何检查][geometry]、[协作命中检查][cooperation]

`fill` 会检查可编辑性、焦点和输入后的值；但跨进程 iframe 的键盘路由仍有重要公开问题。在核查的 `main` 中，`DOM.focus` 使用节点的子会话，后续 `Input.insertText`、`Input.dispatchKeyEvent` 仍有走 tab 根会话的路径。底层 `send(tabId, ...)` 实际使用 `{ tabId }`，与 `sendToTarget(...)` 不同。这与 issue #438 及拟议修复的描述一致，本次没有运行浏览器复现。[fill 与 press][interaction]、[CDP 发送实现][cdp]、[issue #438][issue438]

## 网站调试和 DSH 接入

内置调试覆盖请求头、提交数据、响应正文、重定向、缓存、耗时、控制台，以及操作对应的页面和字段变化。还包括任务内 HTTP 规则、同源重放、历史和 JSON 导出。采集数据有保留上限、正文限制、截断和缺口标记，HTTP 200 也不表示业务成功。[调试指南][debug]、[能力描述][debug-capabilities]

性能部分提供主 frame 的 TTFB、DOMContentLoaded、load、FCP、LCP 候选、CLS 和长任务统计。文档明确排除 CPU profiling、INP、iframe vitals 和 SPA soft-navigation vitals。它能辅助排查慢接口和加载问题，不能直接代替完整 Chrome DevTools 性能诊断。[性能范围][debug]、[unsupported 列表][debug-capabilities]

DSH 插件提供 `bsk_session`、`bsk_page`、`bsk_inspect`、`bsk_interact`、`bsk_tabs` 和 `bsk_assist`。插件注册表仅接受它创建的会话，并拒绝显式指定其他来源会话。省略 `session` 时使用最近操作的当前会话，因此并行编排仍宜显式传入会话 ID。默认 `maxSessions` 为 5，含并发启动保留。[插件说明][dsh-readme]、[注册表][dsh-sessions]

截图工具会保存附件。在宿主支持图片输入时，输出原生 image message；否则返回文件路径并说明限制。源码存在附件分支，不等于当前 DSH、模型路由及部署已经验证能接收图片。会话归属同时服务于祖先对话归档后的清理，不应把清理归属扩大解释成任意 DSH Agent 间的安全隔离。[截图输出][dsh-tools]、[会话注册表][dsh-sessions]

## 公开缺陷和修复状态

以下状态由 2026-10-26 的 GitHub API 返回。读过 issue 正文、评论及时间线，并查询了关联 PR 的 `merged` 和 `merged_at`。

| 问题 | 当时状态 | 对评估的影响 |
| --- | --- | --- |
| #420：后台连接错误恢复后，`evaluate` 返回其他用户 tab 的内容 | issue open，0 条评论；关联 PR #449 open、未合并 | 报告环境是 macOS 上的 Aside/Chromium，不能直接外推到正式 Chrome。`main` 后来有固定 tab 和观察上下文防护，但没有本机复现与发布验证，不能认定该问题已经修好。 |
| #438：OOPIF 的 `fill`／`press` 发到父 frame | issue open，1 条评论；PR #439、#488 均 open、未合并 | 当前源码仍能看到根会话输入路径。PR 作者的单元测试说明不代表已合并、已发布，也不代替 live Chrome 验证。 |

来源：[issue #420][issue420]、[PR #449][pr449]、[issue #438][issue438]、[PR #439][pr439]、[PR #488][pr488]。

## 对当前用途的判断

BrowserSkill 的主要价值是把现有浏览器连接、任务窗口、标签页归属、常见操作和调试证据放在同一工具中。对于 DSH，还能减少自行桥接工具和图片输出的工作。这是接入成本与可观察性的判断，尚无同模型、同页面、同条件的本机数据支持“更快”或“更准”。

试用时应先固定 CLI、扩展和插件的实际版本。重点检查双会话并行、人的前台浏览不干扰任务、关闭任务 tab 后的行为、导航失败恢复、密码管理器注入 frame、跨域 iframe 输入，以及 DSH 图片和取消清理。`main` 新协作模式还应单独验证人工输入后的暂停、sync 和动作恢复。浏览器安装、服务切换和上游修复均不属于本次调研。

[main-api]: https://api.github.com/repos/Tencent/BrowserSkill/commits/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b
[release-api]: https://api.github.com/repos/Tencent/BrowserSkill/releases/latest
[tags-api]: https://api.github.com/repos/Tencent/BrowserSkill/tags?per_page=8
[release]: https://github.com/Tencent/BrowserSkill/releases/tag/cli-v0.3.3
[npm]: https://registry.npmjs.org/@wxg-prc-cpg%2fbrowser-skill-dsh-plugin/latest
[cargo]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/Cargo.toml#L10
[ext-package]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/apps/extension/package.json#L3
[dsh-package]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/packages/dsh-plugin-browserskill/package.json#L4
[readme]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/README.zh-CN.md
[manager]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/apps/extension/src/session-manager/manager.ts#L214
[queue]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/crates/bsk-cli/src/daemon/queue.rs#L1
[tabs]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/apps/extension/src/tools/tabs.ts#L751
[scope]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/apps/extension/src/tools/shared.ts#L225
[window]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/apps/extension/src/session-manager/agent-window.ts#L44
[coop-commit]: https://github.com/Tencent/BrowserSkill/commit/e48d32ee34aa3ba50df7570a70f538497e86fa54
[cooperation]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/apps/extension/src/cooperation/controller.ts#L922
[cooperation-doc]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/crates/bsk-cli/skill/references/cooperation.md
[refs]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/apps/extension/src/session-manager/ref-store.ts#L1
[ref-lookup]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/apps/extension/src/tools/snapshot-ref.ts#L19
[interaction]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/apps/extension/src/tools/interaction.ts#L1078
[geometry]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/apps/extension/src/tools/frame-geometry.ts#L192
[cdp]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/apps/extension/src/browser-driver/chromium-cdp.ts#L370
[debug]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/docs/website-debugging.md#L76
[debug-capabilities]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/apps/extension/src/debug/capabilities.ts#L121
[dsh-readme]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/packages/dsh-plugin-browserskill/README.md#L118
[dsh-sessions]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/packages/dsh-plugin-browserskill/src/sessions.ts#L1
[dsh-tools]: https://github.com/Tencent/BrowserSkill/blob/c0b8e5704a69aa93f6cdd40bbb286a9dd485d42b/packages/dsh-plugin-browserskill/src/tools.ts#L949
[issue420]: https://github.com/Tencent/BrowserSkill/issues/420
[pr449]: https://github.com/Tencent/BrowserSkill/pull/449
[issue438]: https://github.com/Tencent/BrowserSkill/issues/438
[pr439]: https://github.com/Tencent/BrowserSkill/pull/439
[pr488]: https://github.com/Tencent/BrowserSkill/pull/488
